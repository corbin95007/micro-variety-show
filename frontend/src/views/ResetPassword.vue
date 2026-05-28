<template>
  <div class="auth-page">
    <header class="auth-header">
      <button type="button" class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
    </header>

    <main class="auth-body">
      <h1>重置密码</h1>
      <p>{{ helperText }}</p>

      <div v-if="updated" class="status-box status-box--success">
        <div class="status-title">密码已更新</div>
        <p>请使用新密码重新登录。</p>
      </div>

      <form v-else-if="auth.user && recoveryReady" class="auth-form" @submit.prevent="handleSubmit">
        <label class="field">
          <span>新密码</span>
          <input v-model="newPassword" type="password" placeholder="至少 6 位" required />
        </label>
        <label class="field">
          <span>确认新密码</span>
          <input v-model="confirmPassword" type="password" placeholder="再次输入新密码" required />
        </label>

        <button class="primary-btn" type="submit" :disabled="submitting">
          {{ submitting ? '保存中...' : '更新密码' }}
        </button>
      </form>

      <div v-else-if="auth.loading" class="status-box">
        <div class="status-title">正在确认验证状态</div>
        <p>请稍候，正在建立重置密码会话。</p>
      </div>

      <div v-else class="action-stack">
        <button type="button" class="primary-btn" @click="router.push('/forgot-password')">重新发送邮件</button>
        <button type="button" class="text-btn" @click="router.push('/login')">返回登录</button>
      </div>

      <button v-if="updated" type="button" class="primary-btn" @click="router.replace('/login')">返回登录</button>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'
import { clearPasswordRecoveryReady, hasPasswordRecoveryReady } from '../utils/authRecovery'

const router = useRouter()
const auth = useAuthStore()

const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const updated = ref(false)
const recoveryReady = ref(false)

const helperText = computed(() => {
  if (updated.value) return '密码已更新，请使用新密码登录。'
  if (auth.loading) return '请稍候，正在确认验证状态。'
  if (!auth.user || !recoveryReady.value) return '链接无效或已过期，请重新发送重置邮件。'
  return '验证已完成，请设置新密码。'
})

watch(
  () => [auth.user?.id, auth.loading],
  ([userId]) => {
    recoveryReady.value = hasPasswordRecoveryReady(userId)
  },
  { immediate: true }
)

async function handleSubmit() {
  if (submitting.value) return

  if (!newPassword.value || newPassword.value.length < 6) {
    showToast({ message: '密码至少需要6位', position: 'bottom' })
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    showToast({ message: '两次密码不一致', position: 'bottom' })
    return
  }

  submitting.value = true
  try {
    await auth.updatePassword(newPassword.value)
    clearPasswordRecoveryReady()
    recoveryReady.value = false
    newPassword.value = ''
    confirmPassword.value = ''
    updated.value = true
    try {
      await auth.logout()
      showToast({ message: '密码已更新，请重新登录', position: 'bottom' })
    } catch (error) {
      showToast({ message: '密码已更新，请退出当前会话后重新登录', position: 'bottom' })
    }
  } catch (error) {
    clearPasswordRecoveryReady()
    recoveryReady.value = false
    showToast({ message: error.message || '密码更新失败', position: 'bottom' })
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.auth-page { min-height: 100vh; background: var(--color-surface); }
.auth-header { padding: 16px 20px; }
.back-btn { background: none; border: none; color: var(--color-ink); cursor: pointer; padding: 4px; }
.auth-body { padding: 20px 28px; }
h1 {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 900;
  color: var(--color-ink);
}
p {
  margin-top: 8px;
  margin-bottom: 32px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-ink-light);
}
.auth-form { display: flex; flex-direction: column; gap: 20px; }
.status-box {
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  margin-bottom: 20px;
}
.status-box--success {
  border-color: rgba(76, 140, 92, 0.35);
  background: rgba(76, 140, 92, 0.08);
}
.status-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink);
}
.status-box p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
}
.action-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field span {
  display: block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--color-ink);
  margin-bottom: 8px;
}
.field input {
  width: 100%;
  padding: 14px 16px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-family: var(--font-body);
  color: var(--color-ink);
  background: var(--color-bg);
  outline: none;
}
.field input:focus { border-color: var(--color-primary); }
.primary-btn {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.text-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-ink-light);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
}
</style>
