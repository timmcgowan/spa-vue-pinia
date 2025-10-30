import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import axios from 'axios'

// Determine the Microsoft Graph base URL to use. This supports sovereign clouds like
// Microsoft US Government where the Graph endpoint is graph.microsoft.us.
// Priority:
// 1. VITE_GRAPH_ENDPOINT (explicit override)
// 2. If VITE_MSAL_AUTHORITY contains 'microsoftonline.us' -> graph.microsoft.us
// 3. Otherwise default to graph.microsoft.com
const graphBase = import.meta.env.VITE_GRAPH_ENDPOINT
  || (import.meta.env.VITE_MSAL_AUTHORITY && import.meta.env.VITE_MSAL_AUTHORITY.includes('microsoftonline.us') ? 'https://graph.microsoft.us' : 'https://graph.microsoft.com')

// BFF configuration (frontend will call BFF endpoints when VITE_BFF_BASE and VITE_BFF_SCOPE are provided)
const bffBase = import.meta.env.VITE_BFF_BASE || 'http://localhost:3000'
const bffScope = import.meta.env.VITE_BFF_SCOPE ? [import.meta.env.VITE_BFF_SCOPE] : null

export const useUserStore = defineStore('user', {
  state: () => ({
    profile: null,
    manager: null,
    groups: [],
    devices: [],
    employeeType: null,
    employeeId: null,
    roles: [],
    photoDataUrl: null,
    loading: false,
    error: null
  }),
  actions: {
    async loadProfile() {
      this.loading = true
      this.error = null
      try {
        const auth = useAuthStore()
        // ensure auth is initialised
        await auth.init()

        // If a BFF is configured, request the BFF-scoped token and call the BFF /api/me endpoint.
        // The BFF can perform OBO and may return the profile + photo as a data URL.
        if (bffScope) {
          const token = await auth.getAccessToken(bffScope)
          if (!token) {
            this.loading = false
            return
          }
          const resp = await axios.get(`${bffBase.replace(/\/$/, '')}/api/me`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          this.profile = resp.data.profile
          // server may include photoDataUrl and claims
          this.photoDataUrl = resp.data.photoDataUrl || null
          try {
            const claims = resp.data.claims || auth.getClaims()
            if (claims) {
              const pick = (...keys) => {
                for (const k of keys) {
                  if (claims[k] !== undefined) return claims[k]
                }
                return null
              }
              this.employeeType = pick('employeeType', 'employeetype', 'extension_employeeType', 'extension_employeetype')
              this.employeeId = pick('employeeId', 'employeeID', 'employeeid', 'extension_employeeId', 'extension_employeeid')
              const r = pick('roles', 'role')
              if (!r) this.roles = []
              else if (Array.isArray(r)) this.roles = r
              else this.roles = String(r).split(',').map(s => s.trim()).filter(Boolean)
            }
          } catch (cErr) {
            // ignore claim parsing errors
          }

        } else {
          // No BFF configured: fall back to calling Microsoft Graph directly (original behavior)
          const token = await auth.getAccessToken(['User.Read'])
          if (!token) {
            // redirect flow will navigate away; nothing to do
            this.loading = false
            return
          }
          // Load basic profile
          const profileResp = await axios.get(`${graphBase}/v1.0/me`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          this.profile = profileResp.data

          // Pull employee/roles claims from id token
          try {
            const claims = auth.getClaims()
            if (claims) {
              // helper to pick first existing claim variant (case-insensitive variants and extension names)
              const pick = (...keys) => {
                for (const k of keys) {
                  if (claims[k] !== undefined) return claims[k]
                }
                return null
              }

              this.employeeType = pick('employeeType', 'employeetype', 'extension_employeeType', 'extension_employeetype')
              this.employeeId = pick('employeeId', 'employeeID', 'employeeid', 'extension_employeeId', 'extension_employeeid')

              // roles may be in several shapes: 'roles' array, 'role' array/string, or 'roles' single string
              const r = pick('roles', 'role')
              if (!r) this.roles = []
              else if (Array.isArray(r)) this.roles = r
              else this.roles = String(r).split(',').map(s => s.trim()).filter(Boolean)
            }
          } catch (cErr) {
            // ignore
          }

          // fetch photo
          try {
            const photoResp = await axios.get(`${graphBase}/v1.0/me/photo/$value`, {
              headers: { Authorization: `Bearer ${token}` },
              responseType: 'arraybuffer'
            })
            const blob = new Blob([photoResp.data], { type: 'image/jpeg' })
            this.photoDataUrl = await this._blobToDataUrl(blob)
          } catch (photoErr) {
            // some accounts may not have a photo
            this.photoDataUrl = null
          }

          // fetch manager (User.Read should be sufficient in many tenants)
          try {
            const mgrResp = await axios.get(`${graphBase}/v1.0/me/manager`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            this.manager = mgrResp.data
          } catch (mgrErr) {
            this.manager = null
          }
        }

        // (manager / organization / groups removed — handled above either via BFF or direct Graph)

      } catch (err) {
        this.error = err
        console.error('Failed to load profile', err)
      } finally {
        this.loading = false
      }
    },
    _blobToDataUrl(blob) {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    },
    async loadOptionalData() {
      // This attempts to acquire tokens for wider scopes (may trigger interactive consent/redirect)
      this.loading = true
      this.error = null
      try {
        const auth = useAuthStore()

        // If a BFF is configured, call the BFF and let it perform OBO to Graph on behalf of the user.
        if (bffScope) {
          const token = await auth.getAccessToken(bffScope)
          if (!token) {
            this.loading = false
            return
          }

          try {
            const groupsResp = await axios.post(`${bffBase.replace(/\/$/, '')}/api/obo/forward`, {
              method: 'GET',
              path: '/v1.0/me/memberOf'
            }, {
              headers: { Authorization: `Bearer ${token}` }
            })
            const vals = groupsResp.data.value || []
            this.groups = vals.filter(v => v['@odata.type'] && v['@odata.type'].toLowerCase().includes('group'))
          } catch (grpErr) {
            this.groups = []
          }

          // Optionally refresh manager via BFF
          try {
            const mgrResp = await axios.post(`${bffBase.replace(/\/$/, '')}/api/obo/forward`, {
              method: 'GET',
              path: '/v1.0/me/manager'
            }, {
              headers: { Authorization: `Bearer ${token}` }
            })
            this.manager = mgrResp.data
          } catch (mgrErr) {
            // keep previous manager if any
          }

        } else {
          // request broader scopes: User.Read.All and GroupMember.Read.All
          const scopes = ['User.Read.All', 'GroupMember.Read.All']
          const token = await auth.getAccessToken(scopes)
          if (!token) {
            this.loading = false
            return
          }

          // fetch groups / memberOf
          try {
            const groupsResp = await axios.get(`${graphBase}/v1.0/me/memberOf`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            const vals = groupsResp.data.value || []
            this.groups = vals.filter(v => v['@odata.type'] && v['@odata.type'].toLowerCase().includes('group'))
          } catch (grpErr) {
            this.groups = []
          }

          // Optionally refresh manager with potentially expanded data
          try {
            const mgrResp = await axios.get(`${graphBase}/v1.0/me/manager`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            this.manager = mgrResp.data
          } catch (mgrErr) {
            // keep previous manager if any
          }
        }

      } catch (err) {
        this.error = err
        console.error('Failed to load optional data', err)
      } finally {
        this.loading = false
      }
    },
    async loadDevices() {
      // Attempts to load devices registered to the user. Requires Device.Read.All or Directory.Read.All.
      this.loading = true
      this.error = null
      try {
        const auth = useAuthStore()

        if (bffScope) {
          const token = await auth.getAccessToken(bffScope)
          if (!token) {
            this.loading = false
            return
          }
          try {
            const resp = await axios.post(`${bffBase.replace(/\/$/, '')}/api/obo/forward`, {
              method: 'GET',
              path: '/v1.0/me/registeredDevices?$select=id,displayName'
            }, {
              headers: { Authorization: `Bearer ${token}` }
            })
            this.devices = resp.data.value || []
          } catch (dErr) {
            this.devices = []
          }
        } else {
          const scopes = ['Device.Read.All']
          const token = await auth.getAccessToken(scopes)
          if (!token) {
            this.loading = false
            return
          }

          try {
            const resp = await axios.get(`${graphBase}/v1.0/me/registeredDevices?$select=id,displayName`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            this.devices = resp.data.value || []
          } catch (dErr) {
            this.devices = []
          }
        }

      } catch (err) {
        this.error = err
        console.error('Failed to load devices', err)
      } finally {
        this.loading = false
      }
    },
    clear() {
      this.profile = null
      this.photoDataUrl = null
      this.manager = null
      this.groups = []
      this.devices = []
      this.employeeType = null
      this.employeeId = null
      this.roles = []
      this.error = null
    }
  }
})
