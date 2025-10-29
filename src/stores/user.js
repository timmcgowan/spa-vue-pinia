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

export const useUserStore = defineStore('user', {
  state: () => ({
    profile: null,
    manager: null,
    organization: null,
    groups: [],
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
        auth.init()
        // Request expanded scopes; some may require admin consent. If consent is missing
        // the requests to the specific endpoints will fail and we'll handle that gracefully.
        const scopes = ['User.Read', 'GroupMember.Read.All', 'Directory.Read.All']
        const token = await auth.getAccessToken(scopes)
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

        // fetch manager (may require extra permissions in some tenants)
        try {
          const mgrResp = await axios.get(`${graphBase}/v1.0/me/manager`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          this.manager = mgrResp.data
        } catch (mgrErr) {
          // ignore if not available or no permission
          this.manager = null
        }

        // fetch organization details (tenant-level info)
        try {
          const orgResp = await axios.get(`${graphBase}/v1.0/organization`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          // organization returns an array under 'value'
          this.organization = Array.isArray(orgResp.data.value) ? orgResp.data.value[0] : orgResp.data
        } catch (orgErr) {
          this.organization = null
        }

        // fetch groups / memberOf
        try {
          const groupsResp = await axios.get(`${graphBase}/v1.0/me/memberOf`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          // memberOf returns directoryObjects; filter groups (group has '@odata.type' with 'group')
          const vals = groupsResp.data.value || []
          this.groups = vals.filter(v => v['@odata.type'] && v['@odata.type'].toLowerCase().includes('group'))
        } catch (grpErr) {
          this.groups = []
        }

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
    clear() {
      this.profile = null
      this.photoDataUrl = null
      this.error = null
    }
  }
})
