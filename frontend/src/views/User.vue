<template>
  <div class="user-page">
    <header class="user-header">
      <div class="user-header-bg"></div>
      <div class="user-header-content">
        <div class="header-top">
          <button class="back-btn" @click="$router.back()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button v-if="auth.user" class="settings-entry" @click="router.push('/user/settings')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.54V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.54 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.54-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.54-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.54V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.54 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.64.24 1.06.86 1.06 1.54V11a2 2 0 1 1 0 4h-.09c-.68 0-1.3.42-1.54 1Z"/>
            </svg>
          </button>
        </div>
        <div class="user-avatar" :class="{ empty: !avatarUrl }">
          <img v-if="avatarUrl" :src="avatarUrl" alt="用户头像" class="avatar-image" />
          <svg v-else class="avatar-placeholder" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M20 21a8 8 0 0 0-16 0"/>
            <circle cx="12" cy="8" r="4"/>
          </svg>
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
          <button class="copy-btn" @click="copyLink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            复制邀请链接
          </button>
        </div>
      </section>

      <section v-else class="card-section">
        <div class="info-card guest-card">
          <div class="guest-title">当前未登录</div>
          <p class="guest-desc">登录后可修改昵称、头像和密码，也能复制你的专属邀请链接。</p>
          <button class="guest-login-btn" @click="goLogin">去登录</button>
        </div>
      </section>

      <section v-if="auth.user" class="card-section">
        <div class="section-label">{{ U.paymentSectionTitle }}</div>
        <div class="info-card">
          <div class="payment-row">
            <div>
              <div class="payment-title">{{ U.paymentTitle }}</div>
              <div class="payment-desc">{{ U.paymentDesc }}</div>
            </div>
            <span class="payment-price">{{ U.paymentPrice }}</span>
          </div>
          <button class="payment-btn" @click="handlePayment">{{ U.paymentBtn }}</button>
        </div>
      </section>

      <button v-if="auth.user" class="logout-btn" @click="handleLogout">{{ U.logoutBtn }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../utils/supabase'
import { showToast } from 'vant'
import { USER as U, TOAST } from '../constants'

const router = useRouter()
const auth = useAuthStore()
const referralInfo = ref({ invite_code: '', referral_count: 0, target: 3 })
const avatarUrl = computed(() => auth.profile?.avatar_url || '')

watch(
  () => auth.user?.id,
  async (userId) => {
    if (!userId) {
      referralInfo.value = { invite_code: '', referral_count: 0, target: 3 }
      return
    }

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const resp = await fetch('/api/referral/info', {
        headers: { 'Authorization': `Bearer ${token}` },
      })

      if (resp.ok) {
        referralInfo.value = await resp.json()
      }
    } catch {
      referralInfo.value = { invite_code: '', referral_count: 0, target: 3 }
    }
  },
  { immediate: true }
)

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

function handlePayment() {
  showToast({ message: TOAST.paymentComingSoon, position: 'bottom' })
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

.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.24);
}

.user-avatar.empty {
  color: rgba(255, 255, 255, 0.72);
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  flex-shrink: 0;
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

.payment-btn:active { transform: scale(0.98); }

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
