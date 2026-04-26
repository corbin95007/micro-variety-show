<template>
  <div class="result-page">
    <header class="result-header">
      <button class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1 class="result-title">{{ R.pageTitle }}</h1>
    </header>

    <div v-if="loading" class="page-loading">
      <div class="loading-pulse"></div>
    </div>

    <div v-else-if="!auth.user" class="locked-state">
      <div class="lock-icon-wrap">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="1.2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <h2 class="locked-title">请先登录</h2>
      <p class="locked-desc">登录后才能查看这份测试结果。</p>
      <button class="unlock-btn" @click="goLogin">去登录</button>
    </div>

    <div v-else-if="errorMessage" class="locked-state">
      <div class="lock-icon-wrap">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="1.2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.6" fill="currentColor"/>
        </svg>
      </div>
      <h2 class="locked-title">结果暂时不可用</h2>
      <p class="locked-desc">{{ errorMessage }}</p>
      <button class="unlock-btn" @click="$router.push('/test/results')">返回列表</button>
    </div>

    <template v-else-if="result">
      <template v-if="result.is_unlocked">
        <section class="hero-section">
          <div class="hero-card">
            <div class="hero-meta">{{ formatDate(result.created_at) }}</div>
            <h2 class="hero-title">{{ report?.headline || '维度结果已生成' }}</h2>
            <p class="hero-summary">{{ report?.summary || '结果已准备好，你可以从四条光谱查看自己的位置。' }}</p>
          </div>
        </section>

        <section class="spectrum-section">
          <div class="section-label">{{ R.spectrumLabel }}</div>
          <div class="spectrum-card">
            <SpectrumBar
              v-for="item in report?.spectrum || []"
              :key="item.key"
              :left-label="item.leftLabel"
              :right-label="item.rightLabel"
              :value="item.percentage"
            />
          </div>
        </section>

        <section v-if="result.tags?.length" class="tags-section">
          <div class="section-label">{{ R.tagsLabel }}</div>
          <div class="tags-card">
            <span v-for="tag in result.tags" :key="tag" class="tag-pill">{{ tag }}</span>
          </div>
        </section>

        <section class="portrait-section">
          <div class="section-label">{{ R.portraitLabel }}</div>
          <div class="portrait-grid">
            <article
              v-for="block in report?.portrait?.blocks || []"
              :key="block.title"
              class="portrait-card"
            >
              <h3 class="portrait-card-title">{{ block.title }}</h3>
              <p class="portrait-card-text">{{ block.body }}</p>
            </article>
          </div>
        </section>
      </template>

      <template v-else>
        <div class="locked-state">
          <div class="lock-icon-wrap">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="1.2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 class="locked-title">{{ R.lockedTitle }}</h2>
          <p class="locked-desc">{{ R.lockedDesc }}</p>
          <button class="unlock-btn" @click="$router.push('/user')">{{ R.unlockBtn }}</button>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { supabase } from '../utils/supabase'
import SpectrumBar from '../components/SpectrumBar.vue'
import { RESULT as R } from '../constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const result = ref(null)
const loading = ref(true)
const errorMessage = ref('')
const report = computed(() => result.value?.report || null)

function goLogin() {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(async () => {
  if (!auth.user) {
    loading.value = false
    return
  }

  const token = (await supabase.auth.getSession()).data.session?.access_token
  const resp = await fetch(`/api/test/result/${route.params.id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })

  if (resp.ok) {
    result.value = await resp.json()
  } else {
    const error = await resp.json().catch(() => ({}))
    errorMessage.value = error.error || '结果加载失败，请稍后再试'
  }

  loading.value = false
})
</script>

<style scoped>
.result-page { min-height: 100vh; background: var(--color-bg); }

.result-header {
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

.result-title {
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

.section-label {
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-ink-muted);
  margin-bottom: 12px;
  padding: 0 20px;
}

.spectrum-section { padding-top: 28px; }

.hero-section {
  padding: 28px 20px 0;
}

.hero-card {
  background: linear-gradient(135deg, #2f1557 0%, #4d227d 100%);
  color: #fff;
  border-radius: var(--radius-lg);
  padding: 24px 22px;
  box-shadow: var(--shadow-elevated);
}

.hero-meta {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.65;
}

.hero-title {
  margin-top: 10px;
  font-family: var(--font-display);
  font-size: 28px;
  line-height: 1.2;
}

.hero-summary {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.78);
}

.spectrum-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 28px 24px 8px;
  margin: 0 20px;
}

.tags-section { padding-top: 28px; }

.tags-card {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 20px;
}

.tag-pill {
  display: inline-block;
  padding: 8px 18px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 100px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.portrait-section { padding-top: 28px; padding-bottom: 100px; }

.portrait-grid {
  display: grid;
  gap: 12px;
  padding: 0 20px;
}

.portrait-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 24px;
}

.portrait-card-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 10px;
}

.portrait-card-text {
  color: var(--color-ink-light);
  font-size: 14px;
  line-height: 1.8;
}

.locked-state {
  text-align: center;
  padding: 80px 28px;
}

.lock-icon-wrap { margin-bottom: 20px; }

.locked-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
}

.locked-desc {
  font-size: 14px;
  color: var(--color-ink-light);
  margin-bottom: 28px;
}

.unlock-btn {
  padding: 14px 40px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}

.unlock-btn:active { transform: scale(0.98); opacity: 0.9; }
</style>
