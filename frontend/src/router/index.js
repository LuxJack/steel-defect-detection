import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Auth/Login.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Auth/Register.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('../views/Layout/Layout.vue'),
    meta: { requiresAuth: true },
    redirect: '/detection',
    children: [
      {
        path: '/detection',
        name: 'Detection',
        component: () => import('../views/Detection/Detection.vue')
      },
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('../views/Dashboard/Dashboard.vue')
      },
      {
        path: '/model-config',
        name: 'ModelConfig',
        component: () => import('../views/ModelConfig/ModelConfig.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.meta.requiresGuest && authStore.isAuthenticated) {
    next('/')
  } else {
    next()
  }
})

export default router