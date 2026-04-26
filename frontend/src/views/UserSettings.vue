<template>
  <div class="settings-page">
    <header class="settings-header">
      <button class="back-btn" @click="$router.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h1 class="settings-title">账户设置</h1>
    </header>

    <div v-if="!auth.user" class="settings-body">
      <div class="empty-card">
        <div class="empty-title">当前未登录</div>
        <p class="empty-desc">登录后才能修改昵称和密码。</p>
        <button class="primary-btn" @click="goLogin">去登录</button>
      </div>
    </div>

    <div v-else class="settings-body">
      <section class="card-section">
        <div class="section-label">昵称</div>
        <div class="info-card">
          <div class="setting-row">
            <div>
              <div class="setting-title">当前昵称</div>
              <div class="setting-value">{{ auth.profile?.nickname || '未设置昵称' }}</div>
            </div>
            <button class="setting-action" @click="openNicknameDialog">修改昵称</button>
          </div>
        </div>
      </section>

      <section class="card-section">
        <div class="section-label">密码</div>
        <div class="info-card">
          <div class="setting-row">
            <div>
              <div class="setting-title">登录密码</div>
              <div class="setting-desc">修改后，下次请使用新密码登录。</div>
            </div>
            <button class="setting-action" @click="openPasswordDialog">修改密码</button>
          </div>
        </div>
      </section>
    </div>

    <van-dialog
      v-model:show="showNicknameDialog"
      title="修改昵称"
      show-cancel-button
      :confirm-button-loading="nicknameSaving"
      @confirm="handleNicknameConfirm"
    >
      <div class="dialog-body">
        <input v-model="newNickname" class="dialog-input" type="text" placeholder="输入新昵称" />
      </div>
    </van-dialog>

    <van-dialog
      v-model:show="showPasswordDialog"
      title="修改密码"
      show-cancel-button
      :confirm-button-loading="passwordSaving"
      @confirm="handlePasswordConfirm"
      @closed="handlePasswordDialogClosed"
    >
      <div class="dialog-body">
        <input v-model="newPassword" class="dialog-input" type="password" placeholder="输入新密码（至少6位）" />
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const showNicknameDialog = ref(false)
const showPasswordDialog = ref(false)
const nicknameSaving = ref(false)
const passwordSaving = ref(false)
const newNickname = ref('')
const newPassword = ref('')

function goLogin() {
  router.push({ path: '/login', query: { redirect: '/user/settings' } })
}

function openNicknameDialog() {
  newNickname.value = auth.profile?.nickname || ''
  showNicknameDialog.value = true
}

function openPasswordDialog() {
  newPassword.value = ''
  showPasswordDialog.value = true
}

function handlePasswordDialogClosed() {
  newPassword.value = ''
}

async function handleNicknameConfirm() {
  if (nicknameSaving.value) return

  const nickname = newNickname.value.trim()
  if (!nickname) {
    showToast({ message: '昵称不能为空', position: 'bottom' })
    return
  }

  nicknameSaving.value = true
  try {
    await auth.updateNickname(nickname)
    showToast({ message: '昵称修改成功', position: 'bottom' })
    showNicknameDialog.value = false
  } catch (error) {
    showToast({ message: error.message || '昵称修改失败', position: 'bottom' })
  } finally {
    nicknameSaving.value = false
  }
}

async function handlePasswordConfirm() {
  if (passwordSaving.value) return

  if (!newPassword.value || newPassword.value.length < 6) {
    showToast({ message: '密码至少需要6位', position: 'bottom' })
    return
  }

  passwordSaving.value = true
  try {
    await auth.updatePassword(newPassword.value)
    newPassword.value = ''
    showToast({ message: '密码修改成功', position: 'bottom' })
    showPasswordDialog.value = false
  } catch (error) {
    showToast({ message: error.message || '密码修改失败', position: 'bottom' })
  } finally {
    passwordSaving.value = false
  }
}
</script>

<style scoped>
.settings-page { min-height: 100vh; background: var(--color-bg); }

.settings-header {
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

.settings-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
}

.settings-body {
  padding: 20px;
  padding-bottom: calc(100px + var(--safe-bottom));
}

.card-section { margin-bottom: 20px; }

.section-label {
  font-size: 11px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-ink-muted);
  margin-bottom: 10px;
}

.info-card,
.empty-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 20px;
}

.empty-card {
  text-align: center;
  margin-top: 48px;
}

.empty-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--color-ink);
}

.empty-desc {
  margin-top: 10px;
  font-size: 14px;
  color: var(--color-ink-light);
}

.primary-btn {
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

.setting-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-ink);
}

.setting-desc {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-ink-light);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.setting-value {
  margin-top: 6px;
  font-size: 14px;
  color: var(--color-ink-light);
}

.setting-action {
  padding: 10px 16px;
  border: 1px solid var(--color-primary);
  border-radius: 999px;
  background: none;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  white-space: nowrap;
}

.dialog-body {
  padding: 20px;
}

.dialog-input {
  width: 100%;
  padding: 12px 14px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 15px;
  font-family: var(--font-body);
  color: var(--color-ink);
  background: var(--color-bg);
  outline: none;
}
</style>
