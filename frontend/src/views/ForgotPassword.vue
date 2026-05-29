<template>
  <div class="auth-page">
    <header class="auth-header">
      <button type="button" class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </header>

    <main class="auth-body">
      <h1>找回密码</h1>
      <p>填写邮箱后，如果账号可用，我们会发送重置链接。</p>

      <div v-if="errorMessage" class="status-box status-box--error">
        {{ errorMessage }}
      </div>

      <div v-if="sent" class="status-box status-box--success">
        <div class="status-title">重置邮件已发送</div>
        <p>请查收 {{ sentEmail }}，按邮件中的链接完成验证后设置新密码。</p>
      </div>

      <form v-if="!sent" class="auth-form" @submit.prevent="handleSubmit">
        <label class="field">
          <span>邮箱</span>
          <input v-model="email" type="email" placeholder="your@email.com" required />
        </label>

        <button class="primary-btn" type="submit" :disabled="submitting">
          {{ submitting ? '发送中...' : '发送重置邮件' }}
        </button>
      </form>

      <div v-else class="action-stack">
        <button class="primary-btn" type="button" :disabled="submitting" @click="handleResend">
          {{ submitting ? '发送中...' : '重新发送' }}
        </button>
        <button class="secondary-btn" type="button" @click="changeEmail">换一个邮箱</button>
        <button class="text-btn" type="button" @click="$router.push('/login')">返回登录</button>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'
import { formatRequestError } from '../utils/http'

const auth = useAuthStore()
const email = ref('')
const submitting = ref(false)
const sent = ref(false)
const sentEmail = ref('')
const errorMessage = ref('')

async function handleSubmit() {
  if (submitting.value) return

  submitting.value = true
  errorMessage.value = ''
  try {
    const targetEmail = email.value.trim().toLowerCase()
    email.value = targetEmail
    await auth.requestPasswordReset(targetEmail)
    sentEmail.value = targetEmail
    sent.value = true
    showToast({ message: '如果邮箱可用，重置邮件已发送', position: 'bottom' })
  } catch (error) {
    errorMessage.value = formatRequestError(error, '发送失败，请稍后再试')
    showToast({ message: errorMessage.value, position: 'bottom' })
  } finally {
    submitting.value = false
  }
}

async function handleResend() {
  if (!sentEmail.value) {
    sent.value = false
    return
  }

  email.value = sentEmail.value
  await handleSubmit()
}

function changeEmail() {
  sent.value = false
  errorMessage.value = ''
}
</script>

<style scoped>
.auth-page { min-height: 100vh; background: var(--color-surface); }
.auth-header { padding: 16px 20px; }
.back-btn { background: none; border: none; color: var(--color-ink); cursor: pointer; padding: 4px; }
.auth-body { padding: 20px 28px; }
h1 {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 900;
  color: var(--color-ink);
}
p {
  margin-top: 8px;
  margin-bottom: 32px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-ink-light);
}
.auth-form { display: flex; flex-direction: column; gap: 20px; }
.status-box {
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  margin-bottom: 20px;
}
.status-box--success {
  border-color: rgba(76, 140, 92, 0.35);
  background: rgba(76, 140, 92, 0.08);
}
.status-box--error {
  border-color: rgba(198, 74, 59, 0.28);
  background: rgba(198, 74, 59, 0.08);
  color: var(--color-ink);
  font-size: 13px;
  line-height: 1.6;
}
.status-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink);
}
.status-box p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
}
.action-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field span {
  display: block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--color-ink);
  margin-bottom: 8px;
}
.field input {
  width: 100%;
  padding: 14px 16px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-family: var(--font-body);
  color: var(--color-ink);
  background: var(--color-bg);
  outline: none;
}
.field input:focus { border-color: var(--color-primary); }
.primary-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.secondary-btn,
.text-btn {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}
.secondary-btn {
  border: 1.5px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
}
.text-btn {
  border: none;
  background: none;
  color: var(--color-ink-light);
}
</style>
