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
  // 未登录用户访问需要认证的页面 → 跳转登录
  if (to.meta.auth && !auth.user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 已登录用户访问登录页 → 跳转主页
  if (to.path === '/login' && auth.user) {
    return { path: '/' }
  }
})

export default router
