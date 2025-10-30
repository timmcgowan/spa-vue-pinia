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

// Allow explicit authority and graph scope configuration for sovereign clouds.
// Examples:
// BFF_AUTHORITY=https://login.microsoftonline.us/<tenant-id>
// BFF_GRAPH_SCOPE=https://graph.microsoft.us/.default
const AUTHORITY = process.env.BFF_AUTHORITY || `https://login.microsoftonline.com/${TENANT_ID}`

// Allow comma-separated scope lists in env; fall back to the Microsoft Graph default scope.
const graphScopeEnv = process.env.BFF_GRAPH_SCOPE || process.env.BFF_GRAPHSCOPES || null
const graphScope = graphScopeEnv ? graphScopeEnv.split(',').map(s => s.trim()).filter(Boolean) : ['https://graph.microsoft.com/.default']

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('BFF: BFF_CLIENT_ID and BFF_CLIENT_SECRET should be set in environment. Client credentials flow will fail without them.')
}

const msalConfig = {
  auth: {
    clientId: CLIENT_ID,
    authority: AUTHORITY,
    clientSecret: CLIENT_SECRET
  }
}

const cca = new ConfidentialClientApplication(msalConfig)

const session = require('express-session')
const crypto = require('crypto')

const app = express()
app.use(express.json())

// CORS: allow the frontend origin and allow credentials (cookies)
const FRONTEND_ORIGIN = process.env.FRONTEND_REDIRECT_URI || process.env.VITE_BFF_FRONTEND || 'http://localhost:4000'
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))

// Sessions (in-memory for dev). In prod use Redis or a persistent store.
const sessionSecret = process.env.BFF_SESSION_SECRET || crypto.randomBytes(32).toString('hex')
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
}))

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
      // normalize audience checks - aud can be a string or array; capture azp/appid for later
      const aud = decoded && decoded.aud
      req.tokenAudiences = Array.isArray(aud) ? aud : (aud ? [aud] : [])
      req.tokenAzp = decoded && (decoded.azp || decoded.appid)
    } catch (e) {
      // decoding failed, ignore
      req.userClaims = null
      req.incomingToken = null
    }
  }
  next()
})

// Helper: get an access token from the current session if present and valid.
async function getSessionAccessToken(req) {
  try {
    if (!req.session || !req.session.tokenResponse) return null
    const tr = req.session.tokenResponse
    // tokenResponse may include expiresOn as a Date or string
    if (tr.accessToken && tr.expiresOn) {
      const exp = new Date(tr.expiresOn)
      if (exp.getTime() > Date.now() + 5000) {
        return tr.accessToken
      }
    } else if (tr.accessToken) {
      return tr.accessToken
    }

    // attempt refresh using refresh token if available
    if (tr.refreshToken) {
      try {
        const refreshResp = await cca.acquireTokenByRefreshToken({ refreshToken: tr.refreshToken, scopes: graphScope })
        if (refreshResp && refreshResp.accessToken) {
          // persist new tokenResponse minimal fields
          req.session.tokenResponse = {
            accessToken: refreshResp.accessToken,
            refreshToken: refreshResp.refreshToken || tr.refreshToken,
            expiresOn: refreshResp.expiresOn || new Date(Date.now() + (refreshResp.expiresIn || 3600) * 1000),
            account: refreshResp.account || tr.account
          }
          return req.session.tokenResponse.accessToken
        }
      } catch (rErr) {
        console.warn('refresh token failed', rErr.message || rErr)
      }
    }
  } catch (e) {
    console.error('getSessionAccessToken error', e)
  }
  return null
}

// Helper: check whether the incoming token is intended for this BFF application
function incomingTokenIsForThisApp(req) {
  if (!req.userClaims) return false
  const clientId = CLIENT_ID
  // check audiences
  const auds = req.tokenAudiences || []
  for (const a of auds) {
    if (!a) continue
    if (a === clientId) return true
    if (a === `api://${clientId}`) return true
    if (a.includes(clientId)) return true
  }
  const azp = req.tokenAzp
  if (azp) {
    if (azp === clientId) return true
    if (azp.includes(clientId)) return true
  }
  return false
}

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

// --- Auth routes for BFF-managed sessions ---
// GET /auth/login -> redirects user to Azure AD to begin auth code flow
app.get('/auth/login', async (req, res) => {
  try {
    // store state and requested scopes in session
    const state = crypto.randomBytes(16).toString('hex')
    req.session.authState = state
    const requested = (process.env.BFF_DELEGATED_SCOPES || 'openid,profile,offline_access,User.Read').split(',').map(s => s.trim()).filter(Boolean)
    req.session.requestedScopes = requested
    const redirectUri = process.env.BFF_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`
    const authCodeUrlParameters = {
      scopes: requested,
      redirectUri,
      state
    }
    const authCodeUrl = await cca.getAuthCodeUrl(authCodeUrlParameters)
    return res.redirect(authCodeUrl)
  } catch (e) {
    console.error('auth/login error', e)
    return res.status(500).send('Failed to start auth flow')
  }
})

// GET /auth/callback -> Azure AD redirects here with code; exchange for tokens and create session
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query || {}
  try {
    if (!state || state !== req.session.authState) return res.status(400).send('Invalid state')
    const redirectUri = process.env.BFF_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`
    const scopes = req.session.requestedScopes || (process.env.BFF_DELEGATED_SCOPES || 'openid,profile,offline_access,User.Read').split(',').map(s => s.trim()).filter(Boolean)
    const tokenResponse = await cca.acquireTokenByCode({ code, scopes, redirectUri })
    // persist minimal token info in session
    req.session.tokenResponse = {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      expiresOn: tokenResponse.expiresOn || new Date(Date.now() + (tokenResponse.expiresIn || 3600) * 1000),
      account: tokenResponse.account
    }
    // redirect back to frontend
    const frontend = process.env.FRONTEND_REDIRECT_URI || 'http://localhost:4000'
    return res.redirect(frontend)
  } catch (e) {
    console.error('auth/callback error', e.response ? e.response.data : e.message || e)
    return res.status(500).send('Failed to complete auth')
  }
})

// POST /auth/logout -> destroy session and redirect
app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    const frontend = process.env.FRONTEND_REDIRECT_URI || 'http://localhost:4000'
    res.clearCookie('connect.sid')
    return res.json({ ok: true, redirect: frontend })
  })
})

// GET /api/me - returns user profile by using app token to call graph /users/{oid or upn}
// This is a simple approach: decode incoming token to find `oid` or `upn` then use app token to fetch the user object.
app.get('/api/me', async (req, res) => {
  if (!req.userClaims) return res.status(401).json({ error: 'No bearer token provided' })
  const claims = req.userClaims
  const id = claims.oid || claims.sub || claims.upn || claims.preferred_username
  if (!id) return res.status(400).json({ error: 'Could not determine user id from token claims' })

  try {
    // Prefer session-stored access token (BFF-managed). If no session token, attempt OBO
    // when the incoming bearer token is intended for this BFF app. Otherwise fall back to app token.
    let token
    const sessionToken = await getSessionAccessToken(req)
    if (sessionToken) {
      token = sessionToken
    } else if (req.incomingToken && incomingTokenIsForThisApp(req)) {
      try {
        const oboResp = await cca.acquireTokenOnBehalfOf({ oboAssertion: req.incomingToken, scopes: graphScope })
        token = oboResp && oboResp.accessToken
      } catch (oboErr) {
        console.warn('OBO failed, falling back to app token', oboErr.message || oboErr)
      }
    } else if (req.incomingToken) {
      console.warn('Incoming token audience does not match this BFF client id; skipping OBO and using app token')
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
    // Prefer session token, otherwise OBO when incoming token is for this app, then app token
    let token
    const sessionToken = await getSessionAccessToken(req)
    if (sessionToken) {
      token = sessionToken
    } else if (req.incomingToken && incomingTokenIsForThisApp(req)) {
      try {
        const oboResp = await cca.acquireTokenOnBehalfOf({ oboAssertion: req.incomingToken, scopes: graphScope })
        token = oboResp && oboResp.accessToken
      } catch (oboErr) {
        console.warn('OBO failed for /api/users, falling back to app token', oboErr.message || oboErr)
      }
    } else if (req.incomingToken) {
      console.warn('Incoming token audience does not match this BFF client id for /api/users; skipping OBO and using app token')
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

// GET /api/users/:id/photo - returns the user's photo as a data URL when available
app.get('/api/users/:id/photo', async (req, res) => {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: 'id required' })
  try {
    // Prefer session token, otherwise OBO then app token
    let token
    const sessionToken = await getSessionAccessToken(req)
    if (sessionToken) {
      token = sessionToken
    } else if (req.incomingToken && incomingTokenIsForThisApp(req)) {
      try {
        const oboResp = await cca.acquireTokenOnBehalfOf({ oboAssertion: req.incomingToken, scopes: graphScope })
        token = oboResp && oboResp.accessToken
      } catch (oboErr) {
        console.warn('OBO failed for /api/users/:id/photo, falling back to app token', oboErr.message || oboErr)
      }
    } else if (req.incomingToken) {
      console.warn('Incoming token audience does not match this BFF client id for /api/users/:id/photo; skipping OBO and using app token')
    }

    if (!token) token = await getAppToken()
    const graphBase = process.env.BFF_GRAPH_BASE || 'https://graph.microsoft.com'
    const url = `${graphBase}/v1.0/users/${encodeURIComponent(id)}/photo/$value`
    try {
      const photoResp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, responseType: 'arraybuffer' })
      const contentType = (photoResp.headers && (photoResp.headers['content-type'] || photoResp.headers['Content-Type'])) || 'image/jpeg'
      const buffer = Buffer.from(photoResp.data, 'binary')
      const base64 = buffer.toString('base64')
      const photoDataUrl = `data:${contentType};base64,${base64}`
      return res.json({ photoDataUrl })
    } catch (pErr) {
      // Not found or no photo
      return res.status(404).json({ error: 'Photo not found' })
    }
  } catch (err) {
    console.error('BFF /api/users/:id/photo error', err.response ? err.response.data : err.message)
    return res.status(500).json({ error: 'Failed to load user photo from Graph', details: err.response ? err.response.data : err.message })
  }
})

// POST /api/obo/forward - forward a request to Microsoft Graph using OBO (requires incoming user token)
app.post('/api/obo/forward', async (req, res) => {
  const { method = 'GET', path, data = null, headers = {} } = req.body || {}
  if (!path) return res.status(400).json({ error: 'path required' })
  try {
    // If the session has a user token, use it to call Graph on behalf of the user.
    const sessionToken = await getSessionAccessToken(req)
    let token = null
    if (sessionToken) {
      token = sessionToken
    } else {
      // otherwise require an incoming bearer token that is intended for this BFF
      if (!req.incomingToken) return res.status(401).json({ error: 'No incoming user token for OBO' })
      if (!incomingTokenIsForThisApp(req)) {
        return res.status(400).json({ error: 'Incoming token audience does not match BFF client. Request a delegated token for the BFF (audience = your BFF app) before calling /api/obo/forward.' })
      }
      const oboResp = await cca.acquireTokenOnBehalfOf({ oboAssertion: req.incomingToken, scopes: graphScope })
      token = oboResp && oboResp.accessToken
      if (!token) return res.status(500).json({ error: 'Failed to acquire OBO token' })
    }

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
