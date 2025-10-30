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

// Initialize auth and auto-load profile if authenticated after redirect
const auth = useAuthStore()
const user = useUserStore()
auth.init().then(() => {
	if (auth.isAuthenticated) {
		user.loadProfile()
	}
})
