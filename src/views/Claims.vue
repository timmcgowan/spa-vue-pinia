<template>
  <div class="container">
    <div class="header">
      <h1>Claims</h1>
      <div>
        <router-link to="/profile">Profile</router-link>
        <router-link to="/users" style="margin-left:12px">User Lookup</router-link>
      </div>
    </div>

    <div class="card">
      <div v-if="!claims">No claims available. Sign in first.</div>
      <pre v-else style="max-height:600px; overflow:auto; background:#f7f7f7; padding:12px">{{ prettyClaims }}</pre>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'

export default {
  setup() {
    const auth = useAuthStore()
    const claims = auth.getClaims()
    const prettyClaims = computed(() => {
      try { return JSON.stringify(claims, null, 2) } catch(e) { return String(claims) }
    })
    return { claims, prettyClaims }
  }
}
</script>
