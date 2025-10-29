<template>
  <div class="profile">
    <div style="display:flex; gap:16px; align-items:center">
      <img v-if="photo" :src="photo" class="profile-photo" alt="profile" />
      <div>
        <h2>{{ profile.displayName }}</h2>
        <p><strong>Given:</strong> {{ profile.givenName }} <strong>Family:</strong> {{ profile.surname }}</p>
        <p><strong>Mail:</strong> {{ profile.mail || profile.userPrincipalName }}</p>
        <p v-if="profile.jobTitle"><strong>Job:</strong> {{ profile.jobTitle }}</p>
        <p v-if="profile.employeeType"><strong>Employee Type:</strong> {{ profile.employeeType }}</p>

        <div v-if="profile.city || profile.state || profile.country" style="margin-top:6px">
          <strong>Location:</strong>
          <div>
            {{ profile.city ? profile.city + (profile.state ? ', ' : '') : '' }}{{ profile.state ? profile.state + (profile.country ? ', ' : '') : '' }}{{ profile.country ? profile.country : '' }}
          </div>
        </div>

        <p v-if="manager" style="margin-top:8px"><strong>Manager:</strong> {{ manager.displayName || manager.userPrincipalName || manager.mail }}</p>

        <div v-if="groups && groups.length" style="margin-top:8px">
          <strong>Groups:</strong>
          <ul>
            <li v-for="g in groups" :key="g.id">{{ g.displayName || g.id }}</li>
          </ul>
        </div>

        <div v-if="devices && devices.length" style="margin-top:8px">
          <strong>Devices:</strong>
          <ul>
            <li v-for="d in devices" :key="d.id">{{ d.displayName || d.id }}</li>
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
    groups: { type: Array, default: () => [] },
    devices: { type: Array, default: () => [] }
  }
}
</script>
