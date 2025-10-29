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
        const token = await auth.getAccessToken(['User.Read'])
        if (!token) {
          // redirect flow will navigate away; nothing to do
          this.loading = false
          return
        }
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
