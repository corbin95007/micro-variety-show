<template>
  <van-overlay :show="visible" @click="visible = false" z-index="200">
    <div class="unlock-dialog" @click.stop>
      <div class="dialog-accent-line"></div>

      <template v-if="unlocked">
        <div class="dialog-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-teal)" stroke-width="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h3 class="dialog-title">{{ D.unlockedTitle }}</h3>
        <p class="dialog-desc">{{ D.unlockedDesc }}</p>
        <button class="btn-primary" @click="goResult">{{ D.viewResultBtn }}</button>
        <button class="btn-ghost" @click="goHome">{{ D.goHomeBtn }}</button>
      </template>

      <template v-else>
        <div class="dialog-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h3 class="dialog-title">{{ D.lockedTitle }}</h3>
        <p class="dialog-desc">{{ D.lockedDesc }}</p>
        <div class="unlock-methods">
          <div class="method-item">
            <span class="method-num">1</span>
            <span>{{ D.method1 }}</span>
          </div>
          <div class="method-item">
            <span class="method-num">2</span>
            <span>{{ D.method2 }}</span>
          </div>
        </div>
        <button class="btn-primary" @click="$router.push('/user'); visible = false">{{ D.unlockBtn }}</button>
        <button class="btn-ghost" @click="goHome">{{ D.laterBtn }}</button>
      </template>
    </div>
  </van-overlay>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { UNLOCK_DIALOG as D } from '../constants'

const props = defineProps({ show: Boolean, resultId: Number, unlocked: Boolean })
const emit = defineEmits(['update:show'])
const router = useRouter()

const visible = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v),
})

function goResult() {
  visible.value = false
  router.push(`/test/result/${props.resultId}`)
}

function goHome() {
  visible.value = false
  router.push('/')
}
</script>

<style scoped>
.unlock-dialog {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 430px;
  background: var(--color-surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  padding: 32px 28px calc(32px + var(--safe-bottom));
  text-align: center;
  animation: slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-up {
  from { transform: translateX(-50%) translateY(100%); }
  to { transform: translateX(-50%) translateY(0); }
}

.dialog-accent-line {
  width: 40px;
  height: 4px;
  background: var(--color-divider);
  border-radius: 2px;
  margin: 0 auto 24px;
}

.dialog-icon { margin-bottom: 16px; }

.dialog-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--color-ink);
}

.dialog-desc {
  font-size: 14px;
  color: var(--color-ink-light);
  margin-bottom: 20px;
  line-height: 1.6;
}

.unlock-methods {
  text-align: left;
  margin-bottom: 24px;
}

.method-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  font-size: 14px;
  color: var(--color-ink);
  border-bottom: 1px solid var(--color-divider);
}

.method-item:last-child { border-bottom: none; }

.method-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-primary {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.btn-primary:active { transform: scale(0.98); opacity: 0.9; }

.btn-ghost {
  width: 100%;
  padding: 14px;
  border: none;
  background: none;
  color: var(--color-ink-muted);
  font-size: 14px;
  font-family: var(--font-body);
  cursor: pointer;
  margin-top: 4px;
}
</style>
