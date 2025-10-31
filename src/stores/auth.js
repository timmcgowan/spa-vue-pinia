import { defineStore } from 'pinia'
import axios from 'axios'

// This store intentionally removes client-side MSAL usage and relies on the
// BFF for authentication (server-side sessions + OBO). The store provides a
// minimal facade so components can request login/logout and read claims when
// the BFF is configured. If you need client-side flows, reintroduce msal-browser.

export const useAuthStore = defineStore('auth', {
  state: () => ({
    isAuthenticated: false,
    claims: null
  }),
  actions: {
    // Initialize by checking the BFF session endpoint when BFF is configured.
    async init() {
      const bffBase = import.meta.env.VITE_BFF_BASE || null
      if (!bffBase) {
        // No BFF configured — client-side MSAL has been removed. Components that
        // rely on direct token acquisition will no longer work.
        console.warn('BFF not configured and client-side MSAL removed; authentication disabled in SPA.')
        return
      }

      try {
        const resp = await axios.get('/auth/session', { withCredentials: true })
        if (resp && resp.data && resp.data.hasSession) {
          this.isAuthenticated = true
          // fetch claims from the BFF for convenience
          try {
            const c = await axios.get('/api/claims', { withCredentials: true })
            this.claims = (c && c.data && c.data.claims) || null
          } catch (e) {
            // ignore claims fetch errors
            this.claims = null
          }
        } else {
          this.isAuthenticated = false
        }
      } catch (e) {
        console.error('Failed to initialize auth store', e)
        this.isAuthenticated = false
      }
    },
    getClaims() {
      return this.claims
    },
    // Ensure the current user is authenticated client-side (via BFF session).
    // If not authenticated, trigger a BFF login redirect and return false.
    // Returns true when an active session is present.
    async ensureAuthenticated() {
      await this.init()
      if (this.isAuthenticated) return true
      // not authenticated — redirect to BFF login which will set the session
      this.loginRedirect()
      return false
    },
    loginRedirect() {
      const bffBase = import.meta.env.VITE_BFF_BASE || null
      if (!bffBase) {
        console.warn('No BFF configured; client-side MSAL removed so login is unavailable.')
        return
      }
      const frontend = import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin
      const url = `${bffBase.replace(/\/$/, '')}/auth/login?returnTo=${encodeURIComponent(frontend)}`
      window.location.href = url
    },
    logoutRedirect() {
      const bffBase = import.meta.env.VITE_BFF_BASE || null
      if (!bffBase) {
        console.warn('No BFF configured; nothing to logout from.')
        return
      }
      fetch(`${bffBase.replace(/\/$/, '')}/auth/logout`, { method: 'POST', credentials: 'include' })
        .then(() => { window.location.href = import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin })
        .catch(() => { window.location.href = import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin })
    },
    // SPA no longer performs token acquisition locally. Return null and log.
    async getAccessToken(scopes = ['User.Read']) {
      console.warn('getAccessToken called in SPA but client-side token acquisition is disabled. Use BFF endpoints instead.')
      return null
    }
  }
})
