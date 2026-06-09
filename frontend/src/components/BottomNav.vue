<template>
  <div class="bottom-nav-spacer"></div>
  <nav class="bottom-nav">
    <button type="button" class="nav-item" :class="{ 'is-active': isHomeRoute }" @click="goHome">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>
      </svg>
      <span>{{ NAV_TEXT.home }}</span>
    </button>
    <div class="nav-divider"></div>
    <button type="button" class="nav-item" :class="{ 'is-active': isUserRoute }" @click="goUser">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
      <span>{{ NAV_TEXT.user }}</span>
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAV as NAV_TEXT } from '../constants'

const route = useRoute()
const router = useRouter()
const isHomeRoute = computed(() => route.path === '/')
const isUserRoute = computed(() => route.path.startsWith('/user'))

function goHome() {
  if (route.path !== '/') {
    router.push('/')
  }
}

function goUser() {
  if (!route.path.startsWith('/user')) {
    router.push('/user')
  }
}
</script>

<style scoped>
.bottom-nav-spacer {
  height: calc(var(--bottom-nav-height) + var(--safe-bottom));
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
  height: calc(var(--bottom-nav-height) + var(--safe-bottom));
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--color-divider);
  padding-bottom: var(--safe-bottom);
  z-index: 100;
}

.nav-item {
  flex: 1;
  height: var(--bottom-nav-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-ink-light);
  font-size: 11px;
  font-family: var(--font-body);
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: color 0.2s ease;
}

.nav-item.is-active {
  color: var(--color-primary);
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
