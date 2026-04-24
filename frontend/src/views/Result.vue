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

    <template v-else-if="result">
      <template v-if="result.is_unlocked">
        <section class="spectrum-section">
          <div class="section-label">{{ R.spectrumLabel }}</div>
          <div class="spectrum-card">
            <SpectrumBar
              v-for="dim in R.dimensions"
              :key="dim.key"
              :left-label="dim.left"
              :right-label="dim.right"
              :value="result[dim.key]"
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
          <div class="portrait-card">
            <p class="portrait-placeholder">{{ R.portraitPlaceholder }}</p>
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
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../utils/supabase'
import SpectrumBar from '../components/SpectrumBar.vue'
import { RESULT as R } from '../constants'

const route = useRoute()
const result = ref(null)
const loading = ref(true)

onMounted(async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const resp = await fetch(`/api/test/result/${route.params.id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  result.value = await resp.json()
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

.portrait-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 24px;
  margin: 0 20px;
}

.portrait-placeholder {
  color: var(--color-ink-muted);
  font-size: 14px;
  text-align: center;
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
