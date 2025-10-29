<template>
  <div class="profile">
    <div style="display:flex; gap:16px; align-items:center">
      <img v-if="photo" :src="photo" class="profile-photo" alt="profile" />
      <div>
        <h2>{{ profile.displayName }}</h2>
        <p><strong>Mail:</strong> {{ profile.mail || profile.userPrincipalName }}</p>
        <p v-if="profile.jobTitle"><strong>Job:</strong> {{ profile.jobTitle }}</p>

        <p v-if="manager" style="margin-top:8px"><strong>Manager:</strong> {{ manager.displayName || manager.userPrincipalName || manager.mail }}</p>

        <div v-if="organization" style="margin-top:8px">
          <strong>Organization:</strong>
          <div>{{ organization.displayName || organization.id }}</div>
        </div>

        <div v-if="groups && groups.length" style="margin-top:8px">
          <strong>Groups (memberOf):</strong>
          <ul>
            <li v-for="g in groups" :key="g.id">{{ g.displayName || g.id }}</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    profile: { type: Object, required: true },
    photo: { type: String, default: null },
    manager: { type: Object, default: null },
    organization: { type: Object, default: null },
    groups: { type: Array, default: () => [] }
  }
}
</script>
