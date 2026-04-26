<template>
  <div class="test-hub">
    <header class="hub-header">
      <button class="back-btn" @click="$router.push('/')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1 class="hub-title">{{ T.pageTitle }}</h1>
    </header>

    <div class="hub-body">
      <button class="test-entry-card" @click="goQuiz">
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

      <button class="results-entry" @click="$router.push('/test/results')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span>{{ T.resultListEntry }}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto"><polyline points="9 18 15 12 9 6"/></svg>
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
import { useRouter } from 'vue-router'
import { TEST_HUB as T } from '../constants'

const router = useRouter()

function goQuiz() {
  router.push('/test/quiz')
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
