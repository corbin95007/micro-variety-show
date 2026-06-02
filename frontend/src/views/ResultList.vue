<template>
  <div class="result-list-page">
    <header class="list-header">
      <button type="button" class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1 class="list-title">{{ RL.pageTitle }}</h1>
    </header>

    <div v-if="loading" class="page-loading">
      <div class="loading-pulse"></div>
    </div>

    <div v-else-if="!auth.user" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="1.2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
      <p>登录后查看你的测试记录</p>
      <button type="button" class="go-test-btn" @click="goLogin">去登录</button>
    </div>

    <div v-else-if="errorMessage" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="1.2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.6" fill="currentColor"/>
      </svg>
      <p>{{ errorMessage }}</p>
      <button type="button" class="go-test-btn" @click="errorAction === 'login' ? goLogin() : loadResults()">
        {{ errorAction === 'login' ? '去登录' : '重新加载' }}
      </button>
    </div>

    <div v-else-if="!results.length" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="1.2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
      <p>{{ RL.empty }}</p>
      <button type="button" class="go-test-btn" @click="$router.push('/test')">{{ RL.goTest }}</button>
    </div>

    <div v-else class="results-list">
      <button
        type="button"
        v-for="r in results"
        :key="r.id"
        class="result-item"
        @click="$router.push(`/test/result/${r.id}`)"
      >
        <div class="result-item-left">
          <div class="result-date">{{ formatDate(r.created_at) }}</div>
          <div class="result-tags" v-if="r.tags?.length">
            <span v-for="tag in r.tags.slice(0, 2)" :key="tag" class="mini-tag">{{ tag }}</span>
          </div>
        </div>
        <div class="result-item-right">
          <span class="status-badge" :class="unlock.isUnlocked ? 'unlocked' : 'locked'">
            {{ unlock.isUnlocked ? RL.unlocked : RL.locked }}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useUnlockStore } from '../stores/unlock'
import { supabase } from '../utils/supabase'
import { formatRequestError, parseApiResponse } from '../utils/http'
import { RESULT_LIST as RL } from '../constants'

const router = useRouter()
const auth = useAuthStore()
const unlock = useUnlockStore()
const results = ref([])
const loading = ref(true)
const errorMessage = ref('')
const errorAction = ref('retry')

function formatDate(iso) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function goLogin() {
  router.push({ path: '/login', query: { redirect: '/test/results' } })
}

async function loadResults() {
  loading.value = true
  errorMessage.value = ''
  errorAction.value = 'retry'
  results.value = []

  if (!auth.user) {
    loading.value = false
    return
  }

  // 缓存优先：先用 store 解锁态瞬显徽章，再用接口返回的权威值纠正并回写
  unlock.hydrate(auth.user.id)

  try {
    const { data: sessionData, error } = await supabase.auth.getSession()
    if (error) throw error

    const token = sessionData.session?.access_token
    if (!token) {
      errorAction.value = 'login'
      throw new Error('登录状态已失效，请重新登录')
    }

    const resp = await fetch('/api/test/results', {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    const payload = await parseApiResponse(resp, {
      fallbackMessage: '测试结果列表加载失败，请稍后再试',
      unauthorizedMessage: '登录状态已失效，请重新登录',
    })
    results.value = Array.isArray(payload) ? payload : []

    // 解锁是账号级全局结论，所有结果共用同一 is_unlocked，取其一回写 store
    if (results.value.length) {
      unlock.setUnlocked(
        auth.user.id,
        Boolean(results.value[0].is_unlocked),
        results.value[0].unlock_method,
      )
    }
  } catch (error) {
    if (error instanceof Error && error.message === '登录状态已失效，请重新登录') {
      errorAction.value = 'login'
    }

    errorMessage.value = formatRequestError(error, '测试结果列表加载失败，请稍后再试')
  } finally {
    loading.value = false
  }
}

onMounted(loadResults)
</script>

<style scoped>
.result-list-page { min-height: 100vh; background: var(--color-bg); }

.list-header {
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

.list-title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
}

.page-loading {
  display: flex;
  justify-content: center;
  padding-top: 40vh;
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

.empty-state {
  text-align: center;
  padding: 80px 28px;
  color: var(--color-ink-muted);
  font-size: 14px;
}

.empty-state svg { margin-bottom: 16px; }

.go-test-btn {
  margin-top: 16px;
  padding: 10px 28px;
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}

.results-list { padding: 16px 20px; }

.result-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  cursor: pointer;
  font-family: var(--font-body);
  text-align: left;
  transition: transform 0.15s ease;
}

.result-item:active { transform: scale(0.98); }

.result-date {
  font-size: 15px;
  color: var(--color-ink);
  font-weight: 500;
}

.result-tags {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.mini-tag {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--color-bg);
  border-radius: 20px;
  color: var(--color-ink-light);
}

.result-item-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
}

.status-badge.unlocked {
  background: #E8F5E9;
  color: #2E7D32;
}

.status-badge.locked {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
</style>
