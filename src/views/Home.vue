<template>
  <div class="container">
    <div class="header">
      <h1>Home</h1>
      <div>
        <button v-if="!isAuthenticated" @click="login">Login</button>
        <button v-else @click="logout">Logout</button>
      </div>
    </div>

    <div class="card">
      <p>Authenticated: <strong>{{ isAuthenticated }}</strong></p>
      <div v-if="user.profile">
        <h3>Welcome, {{ user.profile.displayName }}</h3>
        <p>{{ user.profile.userPrincipalName || user.profile.mail }}</p>
        <router-link to="/profile">View Profile</router-link>
      </div>
      <div v-else>
        <p>No profile loaded. After login the app will attempt to load your profile from Microsoft Graph.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { useAuthStore } from '../stores/auth'
import { useUserStore } from '../stores/user'

export default {
  setup() {
    const auth = useAuthStore()
    const user = useUserStore()
    auth.init()

    return {
      login: () => auth.loginRedirect(),
      logout: () => auth.logoutRedirect(),
      isAuthenticated: auth.isAuthenticated,
      user
    }
  },
  mounted() {
    // If authenticated, try to load profile
    const auth = useAuthStore()
    const user = useUserStore()
    if (auth.isAuthenticated) user.loadProfile()
  }
}
</script>
