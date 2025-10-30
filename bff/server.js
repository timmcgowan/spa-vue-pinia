const express = require('express')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const { ConfidentialClientApplication } = require('@azure/msal-node')
const cors = require('cors')

require('dotenv').config()

const PORT = process.env.BFF_PORT || 3000
const CLIENT_ID = process.env.BFF_CLIENT_ID
const CLIENT_SECRET = process.env.BFF_CLIENT_SECRET
const TENANT_ID = process.env.BFF_TENANT_ID || 'common'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('BFF: BFF_CLIENT_ID and BFF_CLIENT_SECRET should be set in environment. Client credentials flow will fail without them.')
}

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET
  }
}

const cca = new ConfidentialClientApplication(msalConfig)

const graphScope = ['https://graph.microsoft.com/.default']

const app = express()
app.use(express.json())
app.use(cors())

// Simple middleware to extract bearer token from incoming requests and decode claims.
// NOTE: This does NOT validate the token signature. For production you should
// validate the JWT using the Azure AD signing keys (jwks) or libraries like passport-azure-ad.
app.use((req, res, next) => {
  const auth = req.headers.authorization
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice('bearer '.length)
    try {
      const decoded = jwt.decode(token)
      req.userClaims = decoded
      req.incomingToken = token
    } catch (e) {
      // decoding failed, ignore
      req.userClaims = null
      req.incomingToken = null
    }
  }
  next()
})

// Helper: get an app token using client credentials
async function getAppToken() {
  const resp = await cca.acquireTokenByClientCredential({ scopes: graphScope })
  return resp && resp.accessToken
}

// GET /api/claims - returns decoded incoming token claims (if present)
app.get('/api/claims', (req, res) => {
  if (!req.userClaims) return res.status(401).json({ error: 'No bearer token provided' })
  return res.json(req.userClaims)
})

// GET /api/me - returns user profile by using app token to call graph /users/{oid or upn}
// This is a simple approach: decode incoming token to find `oid` or `upn` then use app token to fetch the user object.
app.get('/api/me', async (req, res) => {
  if (!req.userClaims) return res.status(401).json({ error: 'No bearer token provided' })
  const claims = req.userClaims
  const id = claims.oid || claims.sub || claims.upn || claims.preferred_username
  if (!id) return res.status(400).json({ error: 'Could not determine user id from token claims' })

  try {
    // Prefer OBO when the incoming user token is present
    let token
    if (req.incomingToken) {
      try {
        const oboResp = await cca.acquireTokenOnBehalfOf({ oboAssertion: req.incomingToken, scopes: graphScope })
        token = oboResp && oboResp.accessToken
      } catch (oboErr) {
        console.warn('OBO failed, falling back to app token', oboErr.message || oboErr)
      }
    }

    if (!token) token = await getAppToken()

    const graphBase = process.env.BFF_GRAPH_BASE || 'https://graph.microsoft.com'
    const url = `${graphBase}/v1.0/users/${encodeURIComponent(id)}`
    const resp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } })

    // Try to also fetch the user's photo and return it as a data URL when available.
    let photoDataUrl = null
    try {
      const photoUrl = `${graphBase}/v1.0/users/${encodeURIComponent(id)}/photo/$value`
      const photoResp = await axios.get(photoUrl, { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer' })
      const contentType = (photoResp.headers && (photoResp.headers['content-type'] || photoResp.headers['Content-Type'])) || 'image/jpeg'
      const buffer = Buffer.from(photoResp.data, 'binary')
      const base64 = buffer.toString('base64')
      photoDataUrl = `data:${contentType};base64,${base64}`
    } catch (photoErr) {
      // not fatal - many accounts won't have a photo
      photoDataUrl = null
    }

    return res.json({ profile: resp.data, claims, photoDataUrl })
  } catch (err) {
    console.error('BFF /api/me error', err.response ? err.response.data : err.message)
    return res.status(500).json({ error: 'Failed to load profile from Graph', details: err.response ? err.response.data : err.message })
  }
})

// GET /api/users/:id - lookup arbitrary user (requires the app to have permission User.Read.All)
app.get('/api/users/:id', async (req, res) => {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: 'id required' })
  try {
    // Prefer OBO if incoming user token present, otherwise use app token
    let token
    if (req.incomingToken) {
      try {
        const oboResp = await cca.acquireTokenOnBehalfOf({ oboAssertion: req.incomingToken, scopes: graphScope })
        token = oboResp && oboResp.accessToken
      } catch (oboErr) {
        console.warn('OBO failed for /api/users, falling back to app token', oboErr.message || oboErr)
      }
    }

    if (!token) token = await getAppToken()
    const url = `${process.env.BFF_GRAPH_BASE || 'https://graph.microsoft.com'}/v1.0/users/${encodeURIComponent(id)}`
    const resp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
    return res.json(resp.data)
  } catch (err) {
    console.error('BFF /api/users error', err.response ? err.response.data : err.message)
    return res.status(500).json({ error: 'Failed to load user from Graph', details: err.response ? err.response.data : err.message })
  }
})

// POST /api/obo/forward - forward a request to Microsoft Graph using OBO (requires incoming user token)
app.post('/api/obo/forward', async (req, res) => {
  if (!req.incomingToken) return res.status(401).json({ error: 'No incoming user token for OBO' })
  const { method = 'GET', path, data = null, headers = {} } = req.body || {}
  if (!path) return res.status(400).json({ error: 'path required' })
  try {
    const oboResp = await cca.acquireTokenOnBehalfOf({ oboAssertion: req.incomingToken, scopes: graphScope })
    const token = oboResp && oboResp.accessToken
    if (!token) return res.status(500).json({ error: 'Failed to acquire OBO token' })
    const url = `${process.env.BFF_GRAPH_BASE || 'https://graph.microsoft.com'}${path}`
    const resp = await axios({ method, url, data, headers: { Authorization: `Bearer ${token}`, ...headers } })
    return res.json(resp.data)
  } catch (err) {
    console.error('BFF /api/obo/forward error', err.response ? err.response.data : err.message)
    return res.status(500).json({ error: 'OBO forward failed', details: err.response ? err.response.data : err.message })
  }
})

// POST /api/forward - generic forward to an API using app token; body: { method, url, data, headers }
app.post('/api/forward', async (req, res) => {
  const { method = 'GET', url, data = null, headers = {} } = req.body || {}
  if (!url) return res.status(400).json({ error: 'url required' })
  try {
    const token = await getAppToken()
    const resp = await axios({ method, url, data, headers: { Authorization: `Bearer ${token}`, ...headers } })
    return res.json(resp.data)
  } catch (err) {
    console.error('BFF forward error', err.response ? err.response.data : err.message)
    return res.status(500).json({ error: 'Forward failed', details: err.response ? err.response.data : err.message })
  }
})

app.get('/', (req, res) => res.send('BFF running'))

app.listen(PORT, () => console.log(`BFF listening on http://localhost:${PORT}`))

// Simple helpful note printed when run
console.log('BFF: server started. Configure BFF_CLIENT_ID, BFF_CLIENT_SECRET, BFF_TENANT_ID in environment.')
