<template>
  <div class="container">
    <div class="header">
      <h1>Profile</h1>
      <div>
        <router-link to="/">Home</router-link>
        <router-link to="/users" style="margin-left:12px">User Lookup</router-link>
      </div>
    </div>

    <div class="card">
      <div v-if="loading">Loading...</div>
      <div v-else-if="error">Error loading profile: {{ error.message || error }}</div>

      <div v-else-if="profile">
        <!-- Main profile card -->
        <ProfileCard
          :profile="profile"
          :photo="photoDataUrl"
          :employee-type="employeeType"
          :employee-id="employeeId"
          :roles="roles"
        />

        <div style="display:flex; gap:16px; margin-top:12px; align-items:flex-start;">
          <!-- Left column: manager, devices -->
          <div style="flex:1; min-width:260px">
            <section style="margin-bottom:12px">
              <h3>Manager</h3>
              <div v-if="manager">
                <div><strong>Name:</strong> {{ manager.displayName || manager.userPrincipalName || '—' }}</div>
                <div><strong>UPN:</strong> {{ manager.userPrincipalName || '—' }}</div>
                <div><strong>Mail:</strong> {{ manager.mail || '—' }}</div>
                <pre style="background:#f7f7f7; padding:8px; margin-top:8px; max-height:200px; overflow:auto">{{ prettyManager }}</pre>
              </div>
              <div v-else>
                <p>No manager data. Click below to refresh.</p>
                <button @click="loadOptional" :disabled="loading">Load manager & groups</button>
              </div>
            </section>

            <section>
              <h3>Devices</h3>
              <div v-if="devices && devices.length">
                <ul>
                  <li v-for="d in devices" :key="d.id">{{ d.displayName || d.id }}</li>
                </ul>
              </div>
              <div v-else>
                <p>No devices loaded.</p>
                <button @click="loadDevices" :disabled="loading">Load devices</button>
              </div>
            </section>
          </div>

          <!-- Right column: groups and claims -->
          <div style="flex:2; min-width:320px">
            <section style="margin-bottom:12px">
              <h3>Member of</h3>
              <div v-if="groups && groups.length">
                <ul>
                  <li v-for="g in groups" :key="g.id">
                    <strong>{{ g.displayName || g.displayName }}</strong>
                    <div style="font-size:0.9em; color:#666">{{ g.mail || g.mailNickname || g.id }}</div>
                  </li>
                </ul>
              </div>
              <div v-else>
                <p>No group membership loaded.</p>
              </div>
            </section>

            <section>
              <h3>Claims</h3>
              <div>
                <div><strong>Employee Type:</strong> {{ employeeType || '—' }}</div>
                <div><strong>Employee ID:</strong> {{ employeeId || '—' }}</div>
                <div><strong>Roles:</strong> <span v-if="roles && roles.length">{{ roles.join(', ') }}</span><span v-else>—</span></div>
              </div>
              <div style="margin-top:8px">
                <button @click="refreshClaims">Refresh claims</button>
              </div>
              <pre style="background:#f7f7f7; padding:8px; margin-top:8px; max-height:240px; overflow:auto">{{ prettyClaims }}</pre>
            </section>
          </div>
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
import { useAuthStore } from '../stores/auth'
import { computed } from 'vue'

export default {
  components: { ProfileCard },
  setup() {
    const user = useUserStore()
    const auth = useAuthStore()
    const prettyManager = computed(() => {
      try { return JSON.stringify(user.manager, null, 2) } catch (e) { return String(user.manager) }
    })
    const prettyClaims = computed(() => {
      // Prefer claims from user store via BFF response; fall back to auth store claims
      const c = user.profile && user.profile.claims ? user.profile.claims : auth.claims
      try { return JSON.stringify(c || {}, null, 2) } catch (e) { return String(c) }
    })

    const refreshClaims = async () => {
      try {
        // call BFF claims endpoint to refresh session-backed claims
        await auth.init()
      } catch (e) {
        // ignore
      }
    }
    return {
      load: () => user.loadProfile(),
      profile: user.profile,
      photoDataUrl: user.photoDataUrl,
      manager: user.manager,
      groups: user.groups,
      loading: user.loading,
      error: user.error,
      devices: user.devices,
      employeeType: user.employeeType,
      employeeId: user.employeeId,
      roles: user.roles,
      loadOptional: () => user.loadOptionalData(),
      loadDevices: () => user.loadDevices(),
      prettyManager,
      prettyClaims,
      refreshClaims
    }
  }
}
</script>
