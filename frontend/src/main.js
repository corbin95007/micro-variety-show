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

// 初始化 auth store（恢复登录状态）
const auth = useAuthStore()
auth.init().then(() => {
  app.mount('#app')
})
