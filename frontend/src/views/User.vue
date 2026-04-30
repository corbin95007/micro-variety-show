<template>
  <div class="user-page">
    <header class="user-header">
      <div class="user-header-bg"></div>
      <div class="user-header-content">
        <div class="header-top">
          <button type="button" class="back-btn" @click="$router.back()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button type="button" v-if="auth.user" class="settings-entry" @click="router.push('/user/settings')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.54V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.54 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.54-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.54-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.54V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.54 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.64.24 1.06.86 1.06 1.54V11a2 2 0 1 1 0 4h-.09c-.68 0-1.3.42-1.54 1Z"/>
            </svg>
          </button>
        </div>
        <h2 class="user-nickname">{{ auth.user ? auth.profile?.nickname || '未设置昵称' : '访客模式' }}</h2>
        <p class="user-email">{{ auth.user?.email || '登录后可查看邀请记录和账户设置' }}</p>
      </div>
    </header>

    <div class="user-body">
      <section v-if="auth.user" class="card-section">
        <div class="section-label">{{ U.referralSectionTitle }}</div>
        <div class="info-card">
          <div class="info-row">
            <span class="info-key">{{ U.inviteCodeLabel }}</span>
            <span class="info-value mono">{{ referralInfo.invite_code || '—' }}</span>
          </div>
          <div class="info-row">
            <span class="info-key">{{ U.referralCountLabel }}</span>
            <div class="referral-progress">
              <div class="referral-dots">
                <span v-for="i in 3" :key="i" class="dot" :class="{ filled: i <= referralInfo.referral_count }"></span>
              </div>
              <span class="referral-count">{{ referralInfo.referral_count }} / {{ referralInfo.target }}</span>
            </div>
          </div>
          <button type="button" class="copy-btn" @click="copyLink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {{ U.copyLinkBtn }}
          </button>
        </div>
      </section>

      <section v-else class="card-section">
        <div class="info-card guest-card">
          <div class="guest-title">当前未登录</div>
          <p class="guest-desc">登录后可修改昵称和密码，也能复制你的专属邀请链接。</p>
          <button type="button" class="guest-login-btn" @click="goLogin">去登录</button>
        </div>
      </section>

      <section v-if="auth.user" class="card-section">
        <div class="section-label">{{ U.paymentSectionTitle }}</div>
        <div class="info-card">
          <div class="payment-row">
            <div>
              <div class="payment-title">{{ paymentCardTitle }}</div>
              <div class="payment-desc">{{ paymentCardDesc }}</div>
            </div>
            <span class="payment-price" :class="{ 'payment-price--unlocked': hasUnlockedAccess }">
              {{ paymentCardBadge }}
            </span>
          </div>
          <button
            type="button"
            class="payment-btn"
            :disabled="paymentButtonDisabled"
            @click="handlePayment"
          >
            {{ paymentButtonText }}
          </button>
          <div
            v-if="paymentNotice.visible"
            class="payment-notice"
            :class="`payment-notice--${paymentNotice.tone}`"
          >
            <div class="payment-notice-title">{{ paymentNotice.title }}</div>
            <div class="payment-notice-desc">{{ paymentNotice.desc }}</div>
          </div>
        </div>
      </section>

      <button type="button" v-if="auth.user" class="logout-btn" @click="handleLogout">{{ U.logoutBtn }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getPaymentStatus, createPayment, getLatestPaymentStatus } from '../api/payment'
import { getReferralInfo } from '../api/referral'
import { useAuthStore } from '../stores/auth'
import { formatRequestError } from '../utils/http'
import { USER as U, TOAST } from '../constants'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const referralInfo = ref({ invite_code: '', referral_count: 0, target: 3 })
const isCreatingPayment = ref(false)
const isPollingPayment = ref(false)
const hasUnlockedAccess = ref(false)
const paymentNotice = ref({
  visible: false,
  tone: 'pending',
  title: '',
  desc: '',
})
let activePaymentId = ''
let paymentPollToken = 0

watch(
  () => auth.user?.id,
  async (userId) => {
    if (!userId) {
      referralInfo.value = { invite_code: '', referral_count: 0, target: 3 }
      hasUnlockedAccess.value = false
      paymentPollToken += 1
      activePaymentId = ''
      clearPaymentNotice()
      return
    }

    await Promise.all([
      loadReferralInfo(),
      loadLatestPaymentState(),
    ])
  },
  { immediate: true }
)

watch(
  [
    () => auth.user?.id,
    () => auth.loading,
    () => route.query.payment_id,
  ],
  async ([userId, loading, paymentId]) => {
    const normalizedPaymentId = Array.isArray(paymentId) ? paymentId[0] : paymentId

    if (loading || !userId || !normalizedPaymentId) return
    await pollPaymentResult(normalizedPaymentId)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  paymentPollToken += 1
})

const paymentButtonDisabled = computed(() => (
  hasUnlockedAccess.value ||
  isCreatingPayment.value ||
  isPollingPayment.value
))

const paymentButtonText = computed(() => {
  if (hasUnlockedAccess.value) return '已解锁'
  if (isPollingPayment.value) return '支付确认中...'
  if (isCreatingPayment.value) return '跳转支付宝中...'
  return U.paymentBtn
})

const paymentCardTitle = computed(() => (
  hasUnlockedAccess.value ? '结果解锁已生效' : U.paymentTitle
))

const paymentCardDesc = computed(() => (
  hasUnlockedAccess.value
    ? '历史结果和后续新结果都已可直接查看。'
    : U.paymentDesc
))

const paymentCardBadge = computed(() => (
  hasUnlockedAccess.value ? '已生效' : U.paymentPrice
))

async function loadReferralInfo() {
  try {
    referralInfo.value = await getReferralInfo()
  } catch {
    referralInfo.value = { invite_code: '', referral_count: 0, target: 3 }
  }
}

async function loadLatestPaymentState() {
  try {
    const payload = await getLatestPaymentStatus()
    const latestPayment = payload.payment

    hasUnlockedAccess.value = Boolean(payload.unlocked || latestPayment?.status === 'success')

    if (hasUnlockedAccess.value && !route.query.payment_id) {
      setPaymentNotice(
        'success',
        payload.unlock_method === 'payment' ? '购买已完成' : '结果已解锁',
        payload.unlock_method === 'payment'
          ? '支付成功后，历史结果和后续新结果都会自动解锁。'
          : '你的结果访问权限已经生效，历史结果和后续新结果都会自动解锁。'
      )
    } else if (!hasUnlockedAccess.value && paymentNotice.value.tone === 'success' && !route.query.payment_id) {
      clearPaymentNotice()
    }
  } catch (error) {
    hasUnlockedAccess.value = false

    setPaymentNotice(
      'failed',
      '支付状态同步失败',
      formatRequestError(error, '支付状态获取失败，请稍后再试')
    )
  }
}

function setPaymentNotice(tone, title, desc) {
  paymentNotice.value = {
    visible: true,
    tone,
    title,
    desc,
  }
}

function clearPaymentNotice() {
  paymentNotice.value = {
    visible: false,
    tone: 'pending',
    title: '',
    desc: '',
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function clearPaymentReturnQuery() {
  const nextQuery = { ...route.query }
  delete nextQuery.payment_id
  delete nextQuery.provider

  await router.replace({
    path: route.path,
    query: nextQuery,
  })
}

async function pollPaymentResult(paymentId) {
  const normalizedPaymentId = String(paymentId)
  if (!normalizedPaymentId || activePaymentId === normalizedPaymentId) return

  activePaymentId = normalizedPaymentId
  const currentPollToken = ++paymentPollToken
  isPollingPayment.value = true

  setPaymentNotice(
    'pending',
    '支付结果确认中',
    '已从支付宝跳回，正在等待支付宝异步回调确认，请稍候。'
  )

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const payload = await getPaymentStatus(normalizedPaymentId)

      if (currentPollToken !== paymentPollToken) return

      const currentStatus = payload.payment?.status
      if (payload.unlocked || currentStatus === 'success') {
        hasUnlockedAccess.value = true
        setPaymentNotice(
          'success',
          payload.unlock_method === 'payment' ? '购买已完成' : '结果已解锁',
          payload.unlock_method === 'payment'
            ? '支付成功，历史结果和后续新结果都会自动解锁。'
            : '你的结果访问权限已经生效，历史结果和后续新结果都会自动解锁。'
        )
        showToast({ message: '支付成功，结果已解锁', position: 'bottom' })
        await clearPaymentReturnQuery()
        await loadLatestPaymentState()
        return
      }

      if (currentStatus === 'failed' || currentStatus === 'refunded') {
        setPaymentNotice(
          'failed',
          '支付未完成',
          '支付单已关闭或支付失败，你可以重新发起购买。'
        )
        await clearPaymentReturnQuery()
        return
      }

      if (attempt < 7) {
        await wait(2000)
      }
    }

    if (currentPollToken !== paymentPollToken) return

    setPaymentNotice(
      'pending',
      '支付结果仍在确认',
      '如果你已经完成付款，请等待几秒后重新进入本页查看。'
    )
    await clearPaymentReturnQuery()
  } catch (error) {
    const message = formatRequestError(error, '支付状态获取失败，请稍后再试')
    setPaymentNotice('failed', '支付状态获取失败', message)
    showToast({ message, position: 'bottom' })
    await clearPaymentReturnQuery()
  } finally {
    if (currentPollToken === paymentPollToken) {
      isPollingPayment.value = false
      activePaymentId = ''
    }
  }
}

async function copyLink() {
  if (!auth.user) {
    showToast({ message: TOAST.notLoggedIn, position: 'bottom' })
    return
  }

  const url = `${window.location.origin}/login?invite=${referralInfo.value.invite_code}`
  try {
    await navigator.clipboard.writeText(url)
    showToast({ message: TOAST.inviteLinkCopied, position: 'bottom' })
  } catch {
    showToast({ message: TOAST.copyFailed, position: 'bottom' })
  }
}

function submitPaymentForm(paymentAction) {
  if (!paymentAction?.action || !paymentAction?.fields) {
    throw new Error('支付跳转参数缺失')
  }

  const form = document.createElement('form')
  form.method = paymentAction.method || 'POST'
  form.action = paymentAction.action
  form.acceptCharset = paymentAction.accept_charset || 'utf-8'
  form.style.display = 'none'

  Object.entries(paymentAction.fields).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = value == null ? '' : String(value)
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
}

async function handlePayment() {
  if (!auth.user) {
    showToast({ message: TOAST.notLoggedIn, position: 'bottom' })
    return
  }

  if (paymentButtonDisabled.value) return

  isCreatingPayment.value = true

  try {
    const payload = await createPayment('alipay')
    submitPaymentForm(payload.payment_action)
  } catch (error) {
    const message = formatRequestError(error, '创建支付单失败，请稍后再试')
    setPaymentNotice('failed', '无法发起支付', message)
    showToast({ message, position: 'bottom' })
  } finally {
    isCreatingPayment.value = false
  }
}

function goLogin() {
  router.push({ path: '/login', query: { redirect: '/user' } })
}

async function handleLogout() {
  await auth.logout()
  router.push('/')
}
</script>

<style scoped>
.user-page { min-height: 100vh; background: var(--color-bg); }

.user-header {
  position: relative;
  padding: 0;
  overflow: hidden;
}

.user-header-bg {
  position: absolute;
  inset: 0;
  background: var(--color-primary);
}

.user-header-content {
  position: relative;
  z-index: 1;
  padding: 16px 20px 32px;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.back-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}

.settings-entry {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.user-nickname {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}

.user-email {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.user-body { padding: 20px; margin-top: -12px; position: relative; z-index: 2; }

.card-section { margin-bottom: 20px; }

.section-label {
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-ink-muted);
  margin-bottom: 10px;
}

.info-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-divider);
}

.info-row:last-of-type { border-bottom: none; }

.info-key {
  font-size: 14px;
  color: var(--color-ink-light);
}

.info-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink);
}

.mono { font-variant-numeric: tabular-nums; letter-spacing: 0.08em; }

.referral-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.referral-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border);
  transition: all 0.3s ease;
}

.dot.filled {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.referral-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}

.copy-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  margin-top: 16px;
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.15s ease;
}

.copy-btn:active {
  background: var(--color-primary);
  color: #fff;
}

.payment-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.payment-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink);
  margin-bottom: 4px;
}

.payment-desc {
  font-size: 12px;
  color: var(--color-ink-light);
}

.payment-price {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 900;
  color: var(--color-accent);
}

.payment-price--unlocked {
  font-size: 16px;
  color: #2c7c5c;
}

.payment-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.payment-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.payment-btn[disabled] {
  background: #2c7c5c;
}

.payment-btn:active { transform: scale(0.98); }

.payment-notice {
  margin-top: 12px;
  border-radius: var(--radius-md);
  padding: 12px 14px;
  border: 1px solid transparent;
}

.payment-notice--pending {
  background: rgba(201, 140, 32, 0.08);
  border-color: rgba(201, 140, 32, 0.22);
}

.payment-notice--success {
  background: rgba(44, 124, 92, 0.08);
  border-color: rgba(44, 124, 92, 0.22);
}

.payment-notice--failed {
  background: rgba(176, 74, 74, 0.08);
  border-color: rgba(176, 74, 74, 0.22);
}

.payment-notice-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-ink);
}

.payment-notice-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-ink-light);
}

.logout-btn {
  width: 100%;
  padding: 14px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-ink-light);
  font-size: 14px;
  font-family: var(--font-body);
  cursor: pointer;
  margin-top: 8px;
  margin-bottom: 100px;
}

.logout-btn:active { color: var(--color-accent); border-color: var(--color-accent); }

.guest-card {
  text-align: center;
}

.guest-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--color-ink);
}

.guest-desc {
  margin-top: 10px;
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-ink-light);
}

.guest-login-btn {
  margin-top: 20px;
  padding: 12px 28px;
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
