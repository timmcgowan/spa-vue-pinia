<template>
  <div class="container">
    <div class="header">
      <h1>User Lookup</h1>
      <router-link to="/profile">Profile</router-link>
    </div>

    <div class="card">
      <p>Enter a user's id (GUID) or userPrincipalName (email) to fetch the user from Microsoft Graph.</p>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px">
        <input v-model="query" placeholder="user id or userPrincipalName" style="flex:1; padding:6px" />
        <button @click="lookup" :disabled="loading || !query">Lookup</button>
      </div>

      <div v-if="loading">Loading...</div>
      <div v-else-if="error">Error: {{ error.message || error }}</div>

      <div v-else-if="user">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <img v-if="photo" :src="photo" class="profile-photo" alt="user photo" />
          <div style="flex:1">
            <h2>{{ user.displayName || user.userPrincipalName }}</h2>
            <div><strong>UPN:</strong> {{ user.userPrincipalName || '—' }}</div>
            <div><strong>Mail:</strong> {{ user.mail || '—' }}</div>
            <div><strong>Given name:</strong> {{ user.givenName || '—' }}</div>
            <div><strong>Surname:</strong> {{ user.surname || '—' }}</div>
            <div><strong>Employee ID:</strong> {{ user.employeeId || user.employeeID || '—' }}</div>
            <div style="margin-top:8px">
              <button @click="showRaw = !showRaw">{{ showRaw ? 'Hide' : 'Show' }} raw user</button>
            </div>
            <pre v-if="showRaw" style="max-height:360px; overflow:auto; background:#f7f7f7; padding:8px; margin-top:8px">{{ prettyUser }}</pre>
          </div>
        </div>
      </div>

      <div v-else>
        <p>No user loaded.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import axios from 'axios'

const graphBase = import.meta.env.VITE_GRAPH_ENDPOINT || (import.meta.env.VITE_MSAL_AUTHORITY && import.meta.env.VITE_MSAL_AUTHORITY.includes('microsoftonline.us') ? 'https://graph.microsoft.us' : 'https://graph.microsoft.com')
const bffBase = import.meta.env.VITE_BFF_BASE || null
const bffScope = import.meta.env.VITE_BFF_SCOPE ? [import.meta.env.VITE_BFF_SCOPE] : null

export default {
  setup() {
    const query = ref('')
    const loading = ref(false)
    const error = ref(null)
    const user = ref(null)
    const photo = ref(null)
    const showRaw = ref(false)

    const prettyUser = computed(() => {
      try { return JSON.stringify(user.value, null, 2) } catch (e) { return String(user.value) }
    })

    const lookup = async () => {
      loading.value = true
      error.value = null
      user.value = null
      photo.value = null
      showRaw.value = false
      try {
        const auth = useAuthStore()

        const idOrUpnRaw = query.value.trim()
        if (!idOrUpnRaw) {
          loading.value = false
          return
        }
        const idOrUpn = encodeURIComponent(idOrUpnRaw)

        // If BFF is configured, call the BFF endpoints which will perform OBO/app token work.
        if (bffBase && bffScope) {
          const token = await auth.getAccessToken(bffScope)
          if (!token) {
            loading.value = false
            return
          }

          // fetch user via BFF
          const resp = await axios.get(`${bffBase.replace(/\/$/, '')}/api/users/${idOrUpn}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          user.value = resp.data

          // fetch photo via BFF helper endpoint
          try {
            const pResp = await axios.get(`${bffBase.replace(/\/$/, '')}/api/users/${idOrUpn}/photo`, {
              headers: { Authorization: `Bearer ${token}` }
            })
            photo.value = pResp.data.photoDataUrl || null
          } catch (photoErr) {
            photo.value = null
          }

        } else {
          // request permission to read other users — this may trigger a consent flow
          const token = await auth.getAccessToken(['User.Read.All'])
          if (!token) {
            loading.value = false
            return
          }

          const resp = await axios.get(`${graphBase}/v1.0/users/${idOrUpn}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          user.value = resp.data

          // try to load photo directly from Graph
          try {
            const photoResp = await axios.get(`${graphBase}/v1.0/users/${idOrUpn}/photo/$value`, {
              headers: { Authorization: `Bearer ${token}` },
              responseType: 'arraybuffer'
            })
            const blob = new Blob([photoResp.data], { type: 'image/jpeg' })
            photo.value = await new Promise((resolve) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result)
              reader.readAsDataURL(blob)
            })
          } catch (photoErr) {
            photo.value = null
          }
        }

      } catch (err) {
        error.value = err
        console.error('User lookup failed', err)
      } finally {
        loading.value = false
      }
    }

    return { query, loading, error, user, photo, lookup, showRaw, prettyUser }
  }
}
</script>
