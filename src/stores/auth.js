import { defineStore } from 'pinia'
import { PublicClientApplication, InteractionType } from '@azure/msal-browser'

const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID,
    // default to the public Azure cloud unless an authority is provided
    authority: import.meta.env.VITE_MSAL_AUTHORITY || `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false
  }
}

// Default interactive login scopes. We may add the BFF scope at login time so the user can
// consent to the BFF delegated scope up-front if configured.
const DEFAULT_LOGIN_SCOPES = ['User.Read']

export const useAuthStore = defineStore('auth', {
  state: () => ({
    msalInstance: null,
    account: null
    ,claims: null
  }),
  getters: {
    isAuthenticated(state) {
      return !!state.account
    }
  },
  actions: {
    // initialize MSAL and return a promise that resolves after redirect handling completes
    init() {
      if (this.msalInstance) {
        // still return a resolved promise so callers can await
        return Promise.resolve()
      }
      this.msalInstance = new PublicClientApplication(msalConfig)

      // handle redirect promise (needed for redirect flow)
      return this.msalInstance.handleRedirectPromise().then((result) => {
        if (result && result.account) {
          this.account = result.account
          // try to capture id token claims from the result or account
          this.claims = result.idTokenClaims || result.account.idTokenClaims || null
        } else {
          const all = this.msalInstance.getAllAccounts()
          if (all && all.length > 0) {
            this.account = all[0]
            this.claims = all[0].idTokenClaims || null
          }
        }
      }).catch((e) => {
        console.error('MSAL handleRedirectPromise error', e)
      })
    },
    getClaims() {
      // return cached claims or attempt to read from current account
      if (this.claims) return this.claims
      const acc = this.account || (this.msalInstance && this.msalInstance.getAllAccounts()[0])
      this.claims = acc && acc.idTokenClaims ? acc.idTokenClaims : null
      return this.claims
    },
    loginRedirect() {
      // If a BFF is configured for server-side auth, redirect the browser to the BFF login
      const bffBase = import.meta.env.VITE_BFF_BASE
      const frontend = import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin
      if (bffBase) {
        const url = `${bffBase.replace(/\/$/, '')}/auth/login?returnTo=${encodeURIComponent(frontend)}`
        window.location.href = url
        return
      }

      this.init()
      // Build login scopes dynamically: include the BFF scope if configured so consent can be collected.
      const bffScope = import.meta.env.VITE_BFF_SCOPE
      const scopes = Array.from(DEFAULT_LOGIN_SCOPES)
      if (bffScope) scopes.push(bffScope)
      return this.msalInstance.loginRedirect({ scopes })
    },
    logoutRedirect() {
      // If using BFF-managed sessions, call BFF logout to clear session cookie
      const bffBase = import.meta.env.VITE_BFF_BASE
      if (bffBase) {
        // POST to /auth/logout will clear session; do a full page refresh afterwards
        fetch(`${bffBase.replace(/\/$/, '')}/auth/logout`, { method: 'POST', credentials: 'include' })
          .then(() => { window.location.href = import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin })
          .catch(() => { window.location.href = import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin })
        return
      }

      if (!this.msalInstance) this.init()
      const logoutRequest = { account: this.account }
      return this.msalInstance.logoutRedirect(logoutRequest)
    },
    async getAccessToken(scopes = ['User.Read']) {
      if (!this.msalInstance) this.init()
      const silentRequest = {
        account: this.account || this.msalInstance.getAllAccounts()[0],
        scopes
      }
      try {
        const resp = await this.msalInstance.acquireTokenSilent(silentRequest)
        return resp.accessToken
      } catch (e) {
        // fall back to interactive redirect acquisition
        console.warn('acquireTokenSilent failed, falling back to redirect', e)
        await this.msalInstance.acquireTokenRedirect({ scopes })
        return null
      }
    }
  }
})
