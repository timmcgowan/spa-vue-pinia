<template>
  <div class="container">
    <div class="header">
      <h1>Profile</h1>
      <router-link to="/">Home</router-link>
    </div>

    <div class="card">
      <div v-if="loading">Loading...</div>
      <div v-else-if="error">Error loading profile: {{ error.message || error }}</div>
      <div v-else-if="profile">
        <ProfileCard :profile="profile" :photo="photoDataUrl" :manager="manager" :groups="groups" :devices="devices" />
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button @click="loadOptional" :disabled="loading">Load groups & directory (may require consent)</button>
          <button @click="loadDevices" :disabled="loading">Load devices (may require consent)</button>
        </div>
      </div>
      <div v-else>
        <p>No profile loaded. Click below to load.</p>
        <button @click="load">Load Profile</button>
      </div>
    </div>
  </div>
</template>

<script>
import { useUserStore } from '../stores/user'
import ProfileCard from '../components/ProfileCard.vue'

export default {
  components: { ProfileCard },
  setup() {
    const user = useUserStore()
    return {
      load: () => user.loadProfile(),
      profile: user.profile,
      photoDataUrl: user.photoDataUrl,
      manager: user.manager,
      groups: user.groups,
      loading: user.loading,
      error: user.error,
      devices: user.devices,
      loadOptional: () => user.loadOptionalData(),
      loadDevices: () => user.loadDevices()
    }
  }
}
</script>
