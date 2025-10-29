<template>
  <div class="profile">
    <div style="display:flex; gap:16px; align-items:center">
      <img v-if="photo" :src="photo" class="profile-photo" alt="profile" />
      <div>
            <h2>{{ profile.displayName || profile.userPrincipalName }}</h2>
            <div style="margin-top:6px">
              <div><strong>Given name:</strong> {{ profile.givenName || '—' }}</div>
              <div><strong>Family name:</strong> {{ profile.surname || '—' }}</div>
              <div><strong>User Principal Name:</strong> {{ profile.userPrincipalName || '—' }}</div>
              <div><strong>Mail:</strong> {{ profile.mail || '—' }}</div>
              <div><strong>Job:</strong> {{ profile.jobTitle || '—' }}</div>
              <div><strong>Employee ID:</strong> {{ employeeId || profile.employeeId || profile.employeeID || profile.employeeid || '—' }}</div>
              <div><strong>Employee Type:</strong> {{ employeeType || profile.employeeType || '—' }}</div>
              <div><strong>Preferred Language:</strong> {{ profile.preferredLanguage || '—' }}</div>
              <div style="margin-top:6px"><strong>Location:</strong>
                <div>{{ profile.city || '—' }}{{ profile.state ? ', ' + profile.state : '' }}{{ profile.country ? ', ' + profile.country : '' }}</div>
              </div>
            </div>

            <p v-if="manager" style="margin-top:8px"><strong>Manager:</strong> {{ manager.displayName || manager.userPrincipalName || manager.mail }}</p>

            <div v-if="groups && groups.length" style="margin-top:8px">
              <strong>Groups:</strong>
              <ul>
                <li v-for="g in groups" :key="g.id">{{ g.displayName || g.id }}</li>
              </ul>
            </div>

            <div v-if="roles && roles.length" style="margin-top:8px">
              <strong>Roles:</strong>
              <ul>
                <li v-for="r in roles" :key="r">{{ r }}</li>
              </ul>
            </div>

            <div v-if="devices && devices.length" style="margin-top:8px">
              <strong>Devices:</strong>
              <ul>
                <li v-for="d in devices" :key="d.id">{{ d.displayName || d.id }}</li>
              </ul>
            </div>

            <div style="margin-top:8px">
              <button @click="showRaw = !showRaw">{{ showRaw ? 'Hide' : 'Show' }} raw profile</button>
              <pre v-if="showRaw" style="max-height:240px; overflow:auto; background:#f7f7f7; padding:8px; margin-top:8px">{{ prettyProfile }}</pre>
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
    devices: { type: Array, default: () => [] },
    employeeType: { type: String, default: null },
    employeeId: { type: String, default: null },
    roles: { type: Array, default: () => [] }
  }
  ,
  data() {
    return { showRaw: false }
  },
  computed: {
    prettyProfile() {
      try {
        return JSON.stringify(this.profile, null, 2)
      } catch (e) {
        return String(this.profile)
      }
    }
  }
}
</script>
