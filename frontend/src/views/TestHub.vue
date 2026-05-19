<template>
  <div class="test-hub">
    <header class="hub-header">
      <button type="button" class="back-btn" @click="$router.push('/')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1 class="hub-title">{{ T.pageTitle }}</h1>
    </header>

    <div class="hub-body">
      <button type="button" class="test-entry-card" @click="goQuiz">
        <div class="test-entry-badge">{{ T.badge }}</div>
        <h2 class="test-entry-name">{{ T.testName }}</h2>
        <p class="test-entry-desc">{{ T.testDesc }}</p>
        <div class="test-entry-meta">
          <span v-for="(m, i) in T.testMeta" :key="i">{{ m }}</span>
        </div>
        <div class="test-entry-cta">
          {{ T.testCta }}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </button>

      <button type="button" class="results-entry" @click="$router.push('/test/results')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span>{{ T.resultListEntry }}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <button
        type="button"
        class="reset-btn"
        :class="`reset-btn--${resetState}`"
        :disabled="resetState === 'loading'"
        @click="handleResetTest"
      >
        <svg v-if="resetState === 'done'" class="reset-icon reset-icon--check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <svg v-else class="reset-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/>
        </svg>
        <span>{{ resetButtonText }}</span>
      </button>

      <div class="rules-section">
        <div class="rules-label">{{ T.rulesLabel }}</div>
        <div class="rules-content">
          <p>{{ T.rulesText }}</p>
          <p class="rules-highlight">{{ T.rulesHighlight }}</p>
          <p>{{ T.rulesMethodsIntro }}</p>
          <div class="rules-methods">
            <div class="rule-method">
              <span class="rule-num">1</span>
              <span>{{ T.rulesMethod1 }}</span>
            </div>
            <div class="rule-method">
              <span class="rule-num">2</span>
              <span>{{ T.rulesMethod2 }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { showToast } from 'vant'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTestStore } from '../stores/test'
import { TEST_HUB as T } from '../constants'

const router = useRouter()
const auth = useAuthStore()
const testStore = useTestStore()
const resetState = ref('idle')

const resetButtonText = computed(() => {
  if (resetState.value === 'loading') return '正在重置...'
  if (resetState.value === 'done') return '已重置'
  return T.resetTestBtn
})

function goQuiz() {
  router.push('/test/quiz')
}

async function handleResetTest() {
  if (resetState.value === 'loading') return

  resetState.value = 'loading'

  try {
    await new Promise((resolve) => window.setTimeout(resolve, 120))
    testStore.resetTestData(auth.user?.id, { clearQuestions: true })
    resetState.value = 'done'
    showToast({ message: '本地测试草稿已清空', position: 'bottom' })
    window.setTimeout(() => {
      resetState.value = 'idle'
    }, 1200)
  } catch (error) {
    console.warn('Failed to reset test data:', error)
    resetState.value = 'idle'
    showToast({ message: '重置失败，请重试', position: 'bottom' })
  }
}
</script>

<style scoped>
.hub-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-surface);
}

.back-btn {
  background: none;
  border: none;
  color: var(--color-ink);
  cursor: pointer;
  padding: 4px;
}

.hub-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
}

.hub-body { padding: 20px; }

.test-entry-card {
  width: 100%;
  position: relative;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-lg);
  padding: 28px 24px;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-body);
  transition: transform 0.15s ease;
  overflow: hidden;
}

.test-entry-card::before {
  content: '';
  position: absolute;
  top: -40%;
  right: -20%;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  pointer-events: none;
}

.test-entry-card:active { transform: scale(0.98); }

.test-entry-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  background: var(--color-accent);
  color: #fff;
  padding: 3px 10px;
  border-radius: 20px;
  margin-bottom: 16px;
}

.test-entry-name {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
}

.test-entry-desc {
  font-size: 14px;
  opacity: 0.65;
  line-height: 1.5;
  margin-bottom: 20px;
}

.test-entry-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  opacity: 0.45;
  margin-bottom: 20px;
}

.test-entry-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent);
}

.results-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-top: 12px;
  font-size: 14px;
  color: var(--color-ink);
  font-family: var(--font-body);
  cursor: pointer;
}

.reset-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-top: 10px;
  font-size: 14px;
  color: var(--color-ink);
  font-family: var(--font-body);
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease;
}

.reset-btn:active:not(:disabled) {
  transform: scale(0.98);
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
}

.reset-btn:disabled {
  cursor: wait;
}

.reset-btn--loading {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: 0 0 0 3px rgba(107, 91, 149, 0.12);
}

.reset-btn--done {
  color: #fff;
  border-color: var(--color-primary);
  background: var(--color-primary);
  box-shadow: 0 8px 20px rgba(107, 91, 149, 0.2);
}

.reset-icon {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.reset-btn--loading .reset-icon {
  animation: reset-spin 0.75s linear infinite;
}

.reset-icon--check {
  animation: reset-pop 0.24s ease-out;
}

@keyframes reset-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes reset-pop {
  0% {
    transform: scale(0.75);
  }

  70% {
    transform: scale(1.14);
  }

  100% {
    transform: scale(1);
  }
}

.rules-section {
  margin-top: 28px;
}

.rules-label {
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-ink-muted);
  margin-bottom: 12px;
}

.rules-content {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 20px;
  font-size: 14px;
  color: var(--color-ink-light);
  line-height: 1.8;
}

.rules-highlight {
  color: var(--color-ink);
  font-weight: 600;
  font-family: var(--font-display);
}

.rules-methods { margin-top: 8px; }

.rule-method {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.rule-num {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>
