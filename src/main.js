import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'

import './styles.css'

import { useAuthStore } from './stores/auth'
import { useUserStore } from './stores/user'
import axios from 'axios'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// Mount app first so stores are usable, then initialize MSAL and load profile if present
app.mount('#app')

// Ensure axios sends cookies to the BFF in development when using sessions
axios.defaults.withCredentials = true

// Initialize auth and auto-load profile. If a BFF is configured for server-side sessions,
// prefer checking the BFF session endpoint and let the BFF redirect to the identity provider
// when no session exists.
const auth = useAuthStore()
const user = useUserStore()
const bffBase = import.meta.env.VITE_BFF_BASE || null

async function bootstrapAuth() {
	if (bffBase) {
		try {
			// Check session via proxied /auth/session (Vite proxy forwards to BFF)
			const resp = await axios.get('/auth/session', { withCredentials: true })
			if (resp && resp.data && resp.data.hasSession) {
				// session present on server — load profile
				await user.loadProfile()
				return
			}
			// No session — redirect to BFF login which will start the auth code flow
			window.location.href = `${bffBase.replace(/\/$/, '')}/auth/login`
		} catch (e) {
			console.error('Failed to check BFF session', e)
			// fallback: attempt local MSAL init (for hybrid setups)
			await auth.init()
			if (auth.isAuthenticated) await user.loadProfile()
		}
	} else {
		// No BFF configured — use local MSAL flow
		await auth.init()
		if (auth.isAuthenticated) await user.loadProfile()
	}
}

bootstrapAuth()
