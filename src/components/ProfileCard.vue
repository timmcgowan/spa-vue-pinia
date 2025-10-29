<template>
  <div class="profile">
    <div style="display:flex; gap:16px; align-items:center">
      <img v-if="photo" :src="photo" class="profile-photo" alt="profile" />
      <div>
        <h2>{{ profile.displayName }}</h2>
        <p><strong>Mail:</strong> {{ profile.mail || profile.userPrincipalName }}</p>
        <p v-if="profile.jobTitle"><strong>Job:</strong> {{ profile.jobTitle }}</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    profile: { type: Object, required: true },
    photo: { type: String, default: null }
  }
}
</script>
