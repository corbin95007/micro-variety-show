<template>
  <div class="auth-page">
    <div class="auth-panel">
      <h1>链接配置已更新</h1>
      <p>这是一条旧版邮箱链接，请回到登录页重新发起邮件验证。</p>
      <button type="button" class="primary-btn" @click="router.push('/login')">返回登录</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { clearPasswordRecoveryState } from '../utils/authRecovery'

const router = useRouter()

onMounted(async () => {
  clearPasswordRecoveryState()
})
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--color-bg);
}

.auth-panel {
  width: min(100%, 420px);
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  text-align: center;
}

h1 {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 800;
  color: var(--color-ink);
}

p {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-ink-light);
}

.primary-btn {
  margin-top: 20px;
  padding: 12px 22px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}
</style>
