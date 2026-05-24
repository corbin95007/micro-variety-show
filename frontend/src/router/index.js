import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { getSafeLoginRedirectPath, sanitizeInviteCode } from '../utils/authRedirects'

const routes = [
  { path: '/', component: () => import('../views/Home.vue') },
  { path: '/login', component: () => import('../views/Login.vue'), meta: { hideBottomNav: true } },
  { path: '/forgot-password', component: () => import('../views/ForgotPassword.vue'), meta: { hideBottomNav: true } },
  { path: '/reset-password', component: () => import('../views/ResetPassword.vue'), meta: { hideBottomNav: true } },
  { path: '/auth/callback', component: () => import('../views/AuthCallback.vue'), meta: { hideBottomNav: true } },
  { path: '/auth/session', component: () => import('../views/AuthSession.vue'), meta: { hideBottomNav: true } },
  { path: '/test', component: () => import('../views/TestHub.vue') },
  { path: '/test/quiz', component: () => import('../views/Quiz.vue'), meta: { hideBottomNav: true } },
  { path: '/test/result/:id', component: () => import('../views/Result.vue') },
  { path: '/test/results', component: () => import('../views/ResultList.vue') },
  { path: '/user', component: () => import('../views/User.vue') },
  { path: '/user/settings', component: () => import('../views/UserSettings.vue'), meta: { hideBottomNav: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  // 已登录用户访问登录页 → 优先回原目标；带邀请码时改去用户中心填写
  if (to.path === '/login' && !auth.loading && auth.user) {
    const inviteCode = sanitizeInviteCode(to.query.invite)
    if (inviteCode) {
      return { path: '/user', query: { invite: inviteCode } }
    }

    const redirect = getSafeLoginRedirectPath(to.query)
    if (redirect !== '/') {
      return redirect
    }

    return { path: '/' }
  }
})

export default router
