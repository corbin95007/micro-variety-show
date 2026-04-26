<template>
  <div class="login-page">
    <header class="login-header">
      <button type="button" class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </header>

    <div class="login-body">
      <h1 class="login-title">{{ isLogin ? L.loginTitle : L.registerTitle }}</h1>
      <p class="login-subtitle">{{ isLogin ? L.loginSubtitle : L.registerSubtitle }}</p>

      <form class="login-form" @submit.prevent="handleSubmit">
        <div v-if="!isLogin" class="field">
          <label class="field-label">{{ L.nicknameLabel }}</label>
          <input v-model="nickname" class="field-input" type="text" :placeholder="L.nicknamePlaceholder" required />
        </div>
        <div class="field">
          <label class="field-label">{{ L.emailLabel }}</label>
          <input v-model="email" class="field-input" type="email" :placeholder="L.emailPlaceholder" required />
        </div>
        <div class="field">
          <label class="field-label">{{ L.passwordLabel }}</label>
          <input v-model="password" class="field-input" type="password" :placeholder="L.passwordPlaceholder" required />
        </div>
        <div v-if="!isLogin" class="field">
          <label class="field-label">{{ L.inviteLabel }} <span class="optional">{{ L.inviteOptional }}</span></label>
          <input v-model="inviteCode" class="field-input" type="text" :placeholder="L.invitePlaceholder" />
        </div>

        <button class="submit-btn" type="submit" :disabled="submitting">
          <span v-if="submitting" class="btn-loading"></span>
          <span v-else>{{ isLogin ? L.loginBtn : L.registerBtn }}</span>
        </button>
      </form>

      <button type="button" class="toggle-btn" @click="isLogin = !isLogin">
        {{ isLogin ? L.toRegister : L.toLogin }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { formatRequestError, parseApiResponse } from '../utils/http'
import { showToast } from 'vant'
import { LOGIN as L } from '../constants'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const isLogin = ref(true)
const email = ref('')
const password = ref('')
const nickname = ref('')
const inviteCode = ref(route.query.invite || '')
const submitting = ref(false)

async function handleSubmit() {
  submitting.value = true
  try {
    if (isLogin.value) {
      await auth.login(email.value, password.value)
    } else {
      await auth.register(email.value, password.value, nickname.value)
      if (inviteCode.value) {
        const token = (await import('../utils/supabase').then(m => m.supabase.auth.getSession())).data.session?.access_token
        const resp = await fetch('/api/referral/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ invite_code: inviteCode.value })
        })
        await parseApiResponse(resp, {
          fallbackMessage: '邀请码提交失败，请稍后再试',
          unauthorizedMessage: '登录状态已失效，请重新登录',
        })
      }
    }
    router.push(route.query.redirect || '/')
  } catch (e) {
    showToast({ message: formatRequestError(e, '登录失败，请稍后再试'), position: 'bottom' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: var(--color-surface);
}

.login-header {
  padding: 16px 20px;
}

.back-btn {
  background: none;
  border: none;
  color: var(--color-ink);
  cursor: pointer;
  padding: 4px;
}

.login-body {
  padding: 20px 28px;
}

.login-title {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 900;
  color: var(--color-ink);
  margin-bottom: 8px;
}

.login-subtitle {
  font-size: 14px;
  color: var(--color-ink-light);
  margin-bottom: 36px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--color-ink);
  margin-bottom: 8px;
}

.optional {
  color: var(--color-ink-muted);
  font-weight: 400;
}

.field-input {
  width: 100%;
  padding: 14px 16px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-family: var(--font-body);
  color: var(--color-ink);
  background: var(--color-bg);
  transition: border-color 0.2s ease;
  outline: none;
}

.field-input:focus {
  border-color: var(--color-primary);
}

.field-input::placeholder {
  color: var(--color-ink-muted);
}

.submit-btn {
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
  margin-top: 8px;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.submit-btn:active { transform: scale(0.98); opacity: 0.9; }
.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-loading {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.toggle-btn {
  display: block;
  width: 100%;
  text-align: center;
  margin-top: 20px;
  padding: 12px;
  background: none;
  border: none;
  color: var(--color-ink-light);
  font-size: 14px;
  font-family: var(--font-body);
  cursor: pointer;
}

.toggle-btn:active { color: var(--color-accent); }
</style>
