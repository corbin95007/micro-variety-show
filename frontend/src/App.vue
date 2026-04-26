<template>
  <div class="app-shell">
    <router-view v-if="!auth.loading" v-slot="{ Component }">
      <transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <div v-else class="global-loading">
      <div class="loading-pulse"></div>
      <span>加载中</span>
    </div>
    <BottomNav />
  </div>
</template>

<script setup>
import { useAuthStore } from './stores/auth'
import BottomNav from './components/BottomNav.vue'

const auth = useAuthStore()
</script>

<style>
:root {
  --color-bg: #FAF8F5;
  --color-surface: #FFFFFF;
  --color-ink: #2D2640;
  --color-ink-light: #6E6878;
  --color-ink-muted: #AEA8B8;
  --color-accent: #E8505B;
  --color-accent-soft: #FFF0F1;
  --color-primary: #340186;
  --color-primary-light: #A29BFE;
  --color-primary-soft: #F0EEFF;
  --color-teal: #2D6A6A;
  --color-amber: #D4883A;
  --color-sage: #8B9D83;
  --color-border: #E8E4EF;
  --color-divider: #F0ECF5;

  --font-display: 'Noto Serif SC', 'Georgia', serif;
  --font-body: -apple-system, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif;
  --font-accent: 'ZCOOL QingKe HuangYou', cursive;

  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 28px;

  --shadow-card: 0 1px 3px rgba(45, 38, 64, 0.06), 0 4px 12px rgba(45, 38, 64, 0.04);
  --shadow-elevated: 0 4px 16px rgba(45, 38, 64, 0.1), 0 12px 40px rgba(45, 38, 64, 0.06);

  --safe-bottom: env(safe-area-inset-bottom, 0px);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-body);
  background: var(--color-bg);
  color: var(--color-ink);
  line-height: 1.6;
  min-height: 100vh;
  overflow-x: hidden;
}

.app-shell {
  max-width: 430px;
  margin: 0 auto;
  min-height: 100vh;
  position: relative;
  background: var(--color-bg);
}

.global-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: var(--color-ink-muted);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.loading-pulse {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(0.8); opacity: 0.4; }
  50% { transform: scale(1); opacity: 1; }
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

:root {
  --van-primary-color: #6C5CE7;
  --van-text-color: #2D2640;
  --van-background: #FAF8F5;
  --van-background-2: #FFFFFF;
  --van-border-color: #E8E4EF;
}
</style>
