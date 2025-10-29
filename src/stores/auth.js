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

const loginRequest = {
  scopes: ['User.Read']
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    msalInstance: null,
    account: null
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
        } else {
          const all = this.msalInstance.getAllAccounts()
          if (all && all.length > 0) this.account = all[0]
        }
      }).catch((e) => {
        console.error('MSAL handleRedirectPromise error', e)
      })
    },
    loginRedirect() {
      this.init()
      return this.msalInstance.loginRedirect(loginRequest)
    },
    logoutRedirect() {
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
