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
        <ProfileCard :profile="profile" :photo="photoDataUrl" :manager="manager" :organization="organization" :groups="groups" />
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
        organization: user.organization,
        groups: user.groups,
      loading: user.loading,
      error: user.error
    }
  }
}
</script>
