<template>
  <div class="user-page">
    <header class="user-header">
      <div class="user-header-bg"></div>
      <div class="user-header-content">
        <button class="back-btn" @click="$router.back()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="user-avatar">
          {{ (auth.profile?.nickname || '?')[0] }}
        </div>
        <h2 class="user-nickname">{{ auth.profile?.nickname || '未设置昵称' }}</h2>
        <p class="user-email">{{ auth.user?.email }}</p>
      </div>
    </header>

    <div class="user-body">
      <section class="card-section">
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

      <section class="card-section">
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

      <button class="logout-btn" @click="handleLogout">{{ U.logoutBtn }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../utils/supabase'
import { showToast } from 'vant'
import { USER as U, TOAST } from '../constants'

const router = useRouter()
const auth = useAuthStore()
const referralInfo = ref({ invite_code: '', referral_count: 0, target: 3 })

onMounted(async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const resp = await fetch('/api/referral/info', {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (resp.ok) referralInfo.value = await resp.json()
})

async function copyLink() {
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

.back-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  margin-bottom: 20px;
}

.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-accent);
  color: #fff;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
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
</style>
