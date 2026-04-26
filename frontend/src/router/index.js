import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/Home.vue') },
  { path: '/login', component: () => import('../views/Login.vue') },
  { path: '/test', component: () => import('../views/TestHub.vue') },
  { path: '/test/quiz', component: () => import('../views/Quiz.vue') },
  { path: '/test/result/:id', component: () => import('../views/Result.vue') },
  { path: '/test/results', component: () => import('../views/ResultList.vue') },
  { path: '/user', component: () => import('../views/User.vue') },
  { path: '/user/settings', component: () => import('../views/UserSettings.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

import { useAuthStore } from '../stores/auth'

router.beforeEach((to) => {
  const auth = useAuthStore()

  // 已登录用户访问登录页 → 跳转主页
  if (to.path === '/login' && !auth.loading && auth.user) {
    return { path: '/' }
  }
})

export default router
