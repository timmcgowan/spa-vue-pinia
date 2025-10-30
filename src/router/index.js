import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Profile from '../views/Profile.vue'
import Claims from '../views/Claims.vue'
import UserLookup from '../views/UserLookup.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/profile', name: 'Profile', component: Profile }
  ,{ path: '/claims', name: 'Claims', component: Claims }
  ,{ path: '/users', name: 'UserLookup', component: UserLookup }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
