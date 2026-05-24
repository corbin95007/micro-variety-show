<template>
  <div class="login-page">
    <header class="login-header">
      <button type="button" class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </header>

    <div class="login-body">
      <h1 class="login-title">{{ isRegister ? L.registerTitle : L.loginTitle }}</h1>
      <p class="login-subtitle">{{ isRegister ? L.registerSubtitle : L.loginSubtitle }}</p>

      <div v-if="!isRegister" class="mode-tabs">
        <button type="button" class="mode-tab" :class="{ active: mode === 'password' }" @click="setMode('password')">密码登录</button>
        <button type="button" class="mode-tab" :class="{ active: mode === 'otp' }" @click="setMode('otp')">邮箱验证码</button>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
        <div v-if="isRegister" class="field">
          <label class="field-label">{{ L.nicknameLabel }}</label>
          <input v-model="nickname" class="field-input" type="text" :placeholder="L.nicknamePlaceholder" required />
        </div>
        <div class="field">
          <label class="field-label">{{ L.emailLabel }}</label>
          <input v-model="email" class="field-input" type="email" :placeholder="L.emailPlaceholder" required />
        </div>
        <div v-if="mode !== 'otp'" class="field">
          <label class="field-label">{{ L.passwordLabel }}</label>
          <input v-model="password" class="field-input" type="password" :placeholder="L.passwordPlaceholder" required />
        </div>
        <div v-if="mode === 'otp'" class="field">
          <label class="field-label">验证码</label>
          <div class="code-row">
            <input v-model="otpCode" class="field-input" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位邮箱验证码" />
            <button type="button" class="code-btn" :disabled="submitting || otpSending || otpCooldown > 0" @click="handleSendOtp">
              {{ otpCooldown > 0 ? `${otpCooldown}s` : otpSent ? '重发' : '发送' }}
            </button>
          </div>
        </div>
        <div v-if="isRegister" class="field">
          <label class="field-label">{{ L.inviteLabel }} <span class="optional">{{ L.inviteOptional }}</span></label>
          <input v-model="inviteCode" class="field-input" type="text" :placeholder="L.invitePlaceholder" />
        </div>

        <button class="submit-btn" type="submit" :disabled="submitting">
          <span v-if="submitting" class="btn-loading"></span>
          <span v-else>{{ submitText }}</span>
        </button>
      </form>

      <button v-if="mode === 'password'" type="button" class="text-btn" @click="router.push('/forgot-password')">
        忘记密码？
      </button>

      <button type="button" class="toggle-btn" @click="toggleRegister">
        {{ isRegister ? L.toLogin : L.toRegister }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { trackReferral } from '../api/referral'
import { formatRequestError } from '../utils/http'
import { getSafeLoginRedirectPath, sanitizeInviteCode } from '../utils/authRedirects'
import { showToast } from 'vant'
import { LOGIN as L } from '../constants'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const mode = ref(normalizeInviteCode(route.query.invite) ? 'register' : 'password')
const email = ref('')
const password = ref('')
const nickname = ref('')
const inviteCode = ref(normalizeInviteCode(route.query.invite))
const otpCode = ref('')
const otpSent = ref(false)
const otpSending = ref(false)
const otpCooldown = ref(0)
const submitting = ref(false)
let otpTimer = null

const isRegister = computed(() => mode.value === 'register')
const submitText = computed(() => {
  if (mode.value === 'register') return L.registerBtn
  if (mode.value === 'otp') return otpSent.value ? '验证码登录' : '发送验证码'
  return L.loginBtn
})

watch(
  () => route.query.invite,
  (value) => {
    const normalizedInviteCode = normalizeInviteCode(value)
    if (!normalizedInviteCode) return

    inviteCode.value = normalizedInviteCode
    resetOtpState()
    mode.value = 'register'
  }
)

onBeforeUnmount(() => {
  if (otpTimer) window.clearInterval(otpTimer)
})

function normalizeInviteCode(value) {
  return sanitizeInviteCode(value)
}

function getRedirectPath() {
  return getSafeLoginRedirectPath(route.query)
}

function setMode(nextMode) {
  if (nextMode !== 'otp') resetOtpState()
  mode.value = nextMode
}

function toggleRegister() {
  resetOtpState()
  mode.value = isRegister.value ? 'password' : 'register'
}

function resetOtpState() {
  otpCode.value = ''
  otpSent.value = false
  otpSending.value = false
  otpCooldown.value = 0
  if (otpTimer) {
    window.clearInterval(otpTimer)
    otpTimer = null
  }
}

function startOtpCooldown() {
  otpCooldown.value = 60
  if (otpTimer) window.clearInterval(otpTimer)
  otpTimer = window.setInterval(() => {
    otpCooldown.value -= 1
    if (otpCooldown.value <= 0 && otpTimer) {
      window.clearInterval(otpTimer)
      otpTimer = null
    }
  }, 1000)
}

async function handleSendOtp() {
  if (!email.value.trim()) {
    showToast({ message: '请先填写邮箱', position: 'bottom' })
    return
  }

  otpSending.value = true
  try {
    await auth.sendEmailOtp(email.value.trim())
    otpSent.value = true
    startOtpCooldown()
    showToast({ message: '如果邮箱可用，验证码已发送', position: 'bottom' })
  } catch (error) {
    console.warn('send otp failed', error)
    showToast({ message: '如果邮箱可用，验证码已发送', position: 'bottom' })
  } finally {
    otpSending.value = false
  }
}

async function handleSubmit() {
  submitting.value = true
  try {
    if (mode.value === 'password') {
      await auth.login(email.value, password.value)
      router.push(getRedirectPath())
    } else if (mode.value === 'register') {
      const data = await auth.register(email.value, password.value, nickname.value, {
        redirect: getRedirectPath(),
        invite: inviteCode.value,
      })
      if (!data.session) {
        showToast({ message: '注册成功，请先查收邮件完成确认', position: 'bottom' })
        resetOtpState()
        mode.value = 'password'
        return
      }
      if (inviteCode.value) {
        try {
          await trackReferral(inviteCode.value)
        } catch (error) {
          showToast({
            message: formatRequestError(error, '注册成功，但邀请码记录失败，请到用户中心补填'),
            position: 'bottom',
          })
          router.push({ path: '/user', query: { invite: inviteCode.value } })
          return
        }
      }
      router.push(getRedirectPath())
    } else {
      if (!otpSent.value) {
        await handleSendOtp()
        return
      }
      if (!otpCode.value.trim()) {
        showToast({ message: '请输入邮箱验证码', position: 'bottom' })
        return
      }
      await auth.verifyEmailOtp(email.value.trim(), otpCode.value.trim())
      router.push(getRedirectPath())
    }
  } catch (e) {
    showToast({
      message: formatRequestError(e, isRegister.value ? '注册失败，请稍后再试' : '登录失败，请稍后再试'),
      position: 'bottom',
    })
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
  margin-bottom: 20px;
}

.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 24px;
  padding: 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.mode-tab {
  border: none;
  border-radius: calc(var(--radius-md) - 4px);
  padding: 10px 8px;
  background: transparent;
  color: var(--color-ink-light);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}

.mode-tab.active {
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: 0 1px 4px rgba(31, 31, 31, 0.08);
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

.code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 10px;
}

.code-btn {
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}

.code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.text-btn {
  display: block;
  width: 100%;
  margin-top: 12px;
  padding: 8px;
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 14px;
  font-family: var(--font-body);
  cursor: pointer;
}
</style>
