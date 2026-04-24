import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/Home.vue') },
  { path: '/login', component: () => import('../views/Login.vue') },
  { path: '/test', component: () => import('../views/TestHub.vue') },
  { path: '/test/quiz', component: () => import('../views/Quiz.vue'), meta: { auth: true } },
  { path: '/test/result/:id', component: () => import('../views/Result.vue') },
  { path: '/test/results', component: () => import('../views/ResultList.vue'), meta: { auth: true } },
  { path: '/user', component: () => import('../views/User.vue'), meta: { auth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

import { useAuthStore } from '../stores/auth'

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.auth && !auth.user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

export default router
