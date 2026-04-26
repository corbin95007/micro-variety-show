<template>
  <div class="bottom-nav-spacer"></div>
  <nav class="bottom-nav">
    <button type="button" class="nav-item" @click="handleShare">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
      <span>{{ NAV_TEXT.share }}</span>
    </button>
    <div class="nav-divider"></div>
    <button type="button" class="nav-item" @click="$router.push('/user')">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
      <span>{{ NAV_TEXT.user }}</span>
    </button>
  </nav>
</template>

<script setup>
import { useAuthStore } from '../stores/auth'
import { showToast } from 'vant'
import { NAV as NAV_TEXT, TOAST } from '../constants'

const auth = useAuthStore()

async function handleShare() {
  if (!auth.user) {
    showToast({ message: TOAST.notLoggedIn, position: 'bottom' })
    return
  }
  const code = auth.profile?.invite_code || ''
  const url = `${window.location.origin}/login?invite=${code}`
  try {
    await navigator.clipboard.writeText(url)
    showToast({ message: TOAST.linkCopied, position: 'bottom' })
  } catch {
    showToast({ message: TOAST.copyFailed, position: 'bottom' })
  }
}
</script>

<style scoped>
.bottom-nav-spacer {
  height: calc(64px + var(--safe-bottom));
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 430px;
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--color-divider);
  padding-bottom: var(--safe-bottom);
  z-index: 100;
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0;
  background: none;
  border: none;
  color: var(--color-ink-light);
  font-size: 11px;
  font-family: var(--font-body);
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: color 0.2s ease;
}

.nav-item:active {
  color: var(--color-accent);
}

.nav-divider {
  width: 1px;
  height: 28px;
  background: var(--color-divider);
}
</style>
