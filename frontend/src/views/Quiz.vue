<template>
  <div class="quiz-page">
    <header class="quiz-header">
      <button type="button" class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1 class="quiz-title">{{ QUIZ_TEXT.pageTitle }}</h1>
      <div class="progress-info">{{ answeredCount }}/{{ testStore.questions.length }}</div>
    </header>

    <div v-if="auth.user" class="progress-track">
      <div class="progress-fill" :style="{ width: progress + '%' }"></div>
    </div>

    <div v-if="!auth.user" class="guest-state">
      <div class="guest-card">
        <div class="guest-icon">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="1.2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <h2 class="guest-title">登录后开始测试</h2>
        <p class="guest-desc">为了保存答案和生成你的测试结果，这一页改为手动登录进入，不再自动弹出登录页。</p>
        <button type="button" class="guest-login-btn" @click="goLogin">去登录</button>
      </div>
    </div>

    <div v-else class="question-list">
      <div
        v-for="(q, idx) in testStore.questions"
        :key="q.id"
        class="question-card"
        :style="{ animationDelay: idx * 60 + 'ms' }"
      >
        <div class="q-number">{{ String(idx + 1).padStart(2, '0') }}</div>
        <div class="q-text">{{ q.question_text }}</div>
        <div class="options-row">
          <button
            type="button"
            v-for="opt in options"
            :key="opt.value"
            class="option-btn"
            :class="{
              'is-selected': testStore.answers[q.id] === opt.value,
              'is-agree': opt.value >= 4 && testStore.answers[q.id] === opt.value,
              'is-disagree': opt.value <= 2 && testStore.answers[q.id] === opt.value,
              'is-neutral': opt.value === 3 && testStore.answers[q.id] === opt.value,
            }"
            @click="testStore.setAnswer(q.id, opt.value)"
          >
            <span class="option-dot"></span>
            <span class="option-label">{{ opt.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="auth.user" class="submit-section">
      <button
        type="button"
        class="submit-btn"
        :class="{ 'is-ready': allAnswered }"
        :disabled="!allAnswered || submitting"
        @click="handleSubmit"
      >
        <span v-if="submitting" class="btn-loading"></span>
        <span v-else>{{ QUIZ_TEXT.submitBtn }}</span>
      </button>
    </div>

    <UnlockDialog v-model:show="showDialog" :result-id="resultId" :unlocked="unlocked" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'
import { useTestStore } from '../stores/test'
import { supabase } from '../utils/supabase'
import { formatRequestError, parseApiResponse } from '../utils/http'
import UnlockDialog from '../components/UnlockDialog.vue'
import { QUIZ as QUIZ_TEXT } from '../constants'

const router = useRouter()
const auth = useAuthStore()
const testStore = useTestStore()
const submitting = ref(false)
const showDialog = ref(false)
const resultId = ref(null)
const unlocked = ref(false)

const options = QUIZ_TEXT.options

const answeredCount = computed(() =>
  testStore.questions.filter(q => testStore.answers[q.id] != null).length
)

const allAnswered = computed(() =>
  testStore.questions.length > 0 && answeredCount.value === testStore.questions.length
)

const progress = computed(() =>
  testStore.questions.length ? Math.round(answeredCount.value / testStore.questions.length * 100) : 0
)

onMounted(() => {
  if (!auth.user) return
  testStore.reset()
  testStore.fetchQuestions()
})

function goLogin() {
  router.push({ path: '/login', query: { redirect: '/test/quiz' } })
}

async function handleSubmit() {
  submitting.value = true
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const resp = await fetch('/api/test/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ answers: testStore.answers }),
    })
    const result = await parseApiResponse(resp, {
      fallbackMessage: '提交失败',
      unauthorizedMessage: '登录状态已失效，请重新登录',
    })
    resultId.value = result.id

    const unlockResp = await fetch('/api/unlock/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ result_id: result.id }),
    })
    const unlockData = await parseApiResponse(unlockResp, {
      fallbackMessage: '解锁状态获取失败',
      unauthorizedMessage: '登录状态已失效，请重新登录',
    })
    unlocked.value = unlockData.unlocked
    showDialog.value = true
  } catch (error) {
    showToast({ message: formatRequestError(error, '提交失败'), position: 'bottom' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.quiz-page { background: var(--color-bg); min-height: 100vh; }

.quiz-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--color-primary);
  color: #fff;
}

.back-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
}

.quiz-title {
  flex: 1;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
}

.progress-info {
  font-size: 13px;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.progress-track {
  height: 3px;
  background: var(--color-divider);
}

.progress-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.guest-state {
  padding: 56px 20px 0;
}

.guest-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 32px 24px;
  text-align: center;
}

.guest-icon { margin-bottom: 16px; }

.guest-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--color-ink);
}

.guest-desc {
  margin-top: 10px;
  font-size: 14px;
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

.question-list { padding: 16px 20px; }

.question-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 20px;
  margin-bottom: 12px;
  animation: card-in 0.4s ease both;
}

@keyframes card-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.q-number {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-ink-muted);
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}

.q-text {
  font-size: 15px;
  line-height: 1.7;
  color: var(--color-ink);
  margin-bottom: 16px;
}

.options-row {
  display: flex;
  gap: 6px;
}

.option-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 4px;
  background: none;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: var(--font-body);
  transition: all 0.2s ease;
}

.option-btn:active { transform: scale(0.95); }

.option-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--color-ink-muted);
  transition: all 0.2s ease;
}

.option-label {
  font-size: 10px;
  color: var(--color-ink-light);
  white-space: nowrap;
  transition: color 0.2s ease;
}

.is-selected {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.is-selected .option-dot {
  background: #fff;
  border-color: #fff;
}

.is-selected .option-label { color: #fff; }

.is-agree {
  border-color: var(--color-teal);
  background: var(--color-teal);
}

.is-disagree {
  border-color: var(--color-accent);
  background: var(--color-accent);
}

.is-neutral {
  border-color: var(--color-amber);
  background: var(--color-amber);
}

.submit-section {
  padding: 16px 20px;
  padding-bottom: calc(80px + var(--safe-bottom));
}

.submit-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-ink-muted);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.3s ease;
}

.submit-btn.is-ready {
  background: var(--color-primary);
  box-shadow: 0 4px 20px rgba(120, 105, 233, 0.45);
}

.submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.submit-btn:active:not(:disabled) { transform: scale(0.98); }

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
</style>
