<template>
  <div class="auth-page">
    <div class="auth-panel">
      <h1>{{ title }}</h1>
      <p>{{ message }}</p>
      <button v-if="failed" type="button" class="primary-btn" @click="router.push('/login')">返回登录</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { trackReferral } from '../api/referral'
import { formatRequestError, parseApiResponse } from '../utils/http'
import { useAuthStore } from '../stores/auth'
import { getSafeAuthNextPath, normalizeQueryValue, sanitizeInviteCode } from '../utils/authRedirects'
import { claimAuthSessionHandoff } from '../utils/authSessionHandoff'
import {
  clearPasswordRecoveryState,
  isRetryableAuthSessionError,
  markConsumedPasswordRecoveryReady,
} from '../utils/authRecovery'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const title = ref('正在登录')
const message = ref('请稍候，正在建立安全会话。')
const failed = ref(false)

const SESSION_RETRY_DELAYS = [120, 320, 700]

function readHashSession() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return {
    access_token: params.get('access_token') || '',
    refresh_token: params.get('refresh_token') || '',
    recovery_grant: params.get('recovery_grant') || '',
  }
}

function clearAddress() {
  const cleanUrl = `${window.location.pathname}${window.location.search}`
  window.history.replaceState({}, document.title, cleanUrl)
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function setSessionWithConservativeRetry(sessionTokens) {
  let lastError = null

  for (let attempt = 0; attempt <= SESSION_RETRY_DELAYS.length; attempt += 1) {
    try {
      return await auth.setSession(sessionTokens, { fetchProfile: false })
    } catch (error) {
      lastError = error
      if (!isRetryableAuthSessionError(error) || attempt >= SESSION_RETRY_DELAYS.length) {
        throw error
      }
      message.value = '正在等待浏览器完成会话写入，请稍候。'
      await wait(SESSION_RETRY_DELAYS[attempt])
    }
  }

  throw lastError
}

onMounted(async () => {
  if (!claimAuthSessionHandoff()) {
    message.value = '安全会话正在处理中，请稍候。'
    return
  }

  const sessionTokens = readHashSession()

  if (!sessionTokens.access_token || !sessionTokens.refresh_token) {
    clearAddress()
    clearPasswordRecoveryState()
    auth.finishSessionHandoff()
    title.value = '链接无效'
    message.value = '验证链接缺少会话信息，请重新发送邮件。链接也可能已经过期。'
    failed.value = true
    return
  }

  try {
    const data = await setSessionWithConservativeRetry({
      access_token: sessionTokens.access_token,
      refresh_token: sessionTokens.refresh_token,
    })
    clearAddress()
    const flow = normalizeQueryValue(route.query.flow).trim()
    const nextPath = getSafeAuthNextPath(route.query)

    if (sessionTokens.recovery_grant) {
      const resp = await fetch('/api/auth/recovery/consume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.session?.access_token || sessionTokens.access_token}`,
        },
        body: JSON.stringify({ grant: sessionTokens.recovery_grant }),
      })
      const consumed = await parseApiResponse(resp, {
        fallbackMessage: '重置链接验证失败，请重新发送邮件。',
        unauthorizedMessage: '重置链接验证失败，请重新发送邮件。',
      })
      const ready = markConsumedPasswordRecoveryReady(consumed)
      if (!ready) {
        clearPasswordRecoveryState()
        router.replace('/forgot-password')
        return
      }
      router.replace('/reset-password')
      auth.fetchProfile().catch(() => {})
      return
    }

    clearPasswordRecoveryState()
    const profilePromise = auth.fetchProfile().catch(() => {})
    const inviteCode = sanitizeInviteCode(route.query.invite)
    if (flow === 'signup' && inviteCode) {
      try {
        await profilePromise
        await trackReferral(inviteCode)
      } catch (error) {
        showToast({
          message: formatRequestError(error, '注册成功，但邀请码记录失败，请到用户中心补填'),
          position: 'bottom',
        })
        router.replace({ path: '/user', query: { invite: inviteCode } })
        return
      }
    }

    await profilePromise
    router.replace(nextPath)
  } catch (error) {
    clearAddress()
    clearPasswordRecoveryState()
    auth.finishSessionHandoff()
    title.value = '验证失败'
    message.value = '验证链接无效或已过期，请重新发送邮件后再试。'
    failed.value = true
  }
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
