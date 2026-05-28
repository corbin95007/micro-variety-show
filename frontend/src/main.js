import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useAuthStore } from './stores/auth'
import 'vant/lib/index.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

function isAuthSessionHandoff() {
  return window.location.pathname === '/auth/session'
}

async function bootstrapAuth() {
  if (isAuthSessionHandoff()) return

  // 初始化 auth store（恢复登录状态）
  const auth = useAuthStore()
  await auth.init()
}

// /auth/session 会先消费 fragment tokens；这里避免启动期 getSession 与 setSession 抢 Supabase auth storage lock。
bootstrapAuth().then(() => {
  app.mount('#app')
})
