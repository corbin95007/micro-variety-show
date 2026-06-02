import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getLatestPaymentStatus } from '../api/payment'
import { readLocalCache, removeLocalCache, writeLocalCache } from '../utils/localCache'

const UNLOCK_CACHE_NAMESPACE = 'unlock'

function normalizeMethod(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'payment') return 'payment'
  if (normalized === 'referral') return 'referral'
  if (normalized === 'auto') return 'auto'
  if (normalized === 'manual') return 'manual'
  return null
}

function readUnlockCache(userId) {
  if (!userId) return null

  const cached = readLocalCache(UNLOCK_CACHE_NAMESPACE, userId)
  if (!cached || typeof cached.unlocked !== 'boolean') return null

  return {
    unlocked: cached.unlocked,
    method: normalizeMethod(cached.method),
  }
}

export const useUnlockStore = defineStore('unlock', () => {
  // 解锁是“账号级全局”状态（服务端 getUnlockDecision 只按 userId 判定，
  // 所有结果共用同一个解锁结论），因此用单一标志而非按 reportId 的 map。
  const currentUserId = ref(null)
  const known = ref(false)
  const unlocked = ref(false)
  const unlockMethod = ref(null)

  // SWR 语义：known=false 表示“还不知道”，UI 据此显示骨架/中性占位；
  // known=true 时 unlocked 才是确定的“已解锁/未解锁”结论。
  const isKnown = computed(() => known.value)
  const isUnlocked = computed(() => known.value && unlocked.value)
  const method = computed(() => unlockMethod.value)
  const status = computed(() => {
    if (!known.value) return 'unknown'
    return unlocked.value ? 'unlocked' : 'locked'
  })

  function resetState() {
    known.value = false
    unlocked.value = false
    unlockMethod.value = null
  }

  function applyState(userId, nextUnlocked, nextMethod) {
    if (!userId) return

    const normalizedMethod = nextUnlocked ? normalizeMethod(nextMethod) : null

    if (userId === currentUserId.value) {
      known.value = true
      unlocked.value = Boolean(nextUnlocked)
      unlockMethod.value = normalizedMethod
    }

    writeLocalCache(UNLOCK_CACHE_NAMESPACE, userId, {
      unlocked: Boolean(nextUnlocked),
      method: normalizedMethod,
      updatedAt: Date.now(),
    })
  }

  // 切换到目标用户并用本地缓存瞬显真实态（无缓存则进入“未知”态等待 revalidate）。
  function hydrate(userId) {
    if (!userId) {
      currentUserId.value = null
      resetState()
      return
    }

    // 已经是当前用户且内存里有确定态时，不因再次 hydrate 而降级回“未知”
    // （例如本地缓存写入失败但内存仍是权威态时，跨页面切换不应丢状态）。
    if (userId === currentUserId.value && known.value) {
      return
    }

    currentUserId.value = userId

    const cached = readUnlockCache(userId)
    if (cached) {
      known.value = true
      unlocked.value = cached.unlocked
      unlockMethod.value = cached.method
    } else {
      resetState()
    }
  }

  // 后台 revalidate：拉服务端最新解锁结论，成功后更新内存 + 回写缓存。
  // 失败时保留上一次已知态（不把缓存降级成“未知”），由调用方决定如何提示。
  async function revalidate(userId) {
    if (!userId) return null

    const payload = await getLatestPaymentStatus()
    applyState(userId, Boolean(payload.unlocked), payload.unlock_method)
    return payload
  }

  // 给页面拉到权威结果数据（如 test_results.is_unlocked）后回写，保持各页一致。
  function setUnlocked(userId, nextUnlocked, nextMethod = null) {
    applyState(userId, nextUnlocked, nextMethod)
  }

  // 登出/切换用户时清掉内存与该用户的本地缓存，杜绝跨账号泄露。
  function clear(userId = currentUserId.value) {
    if (userId) {
      removeLocalCache(UNLOCK_CACHE_NAMESPACE, userId)
    }

    currentUserId.value = null
    resetState()
  }

  return {
    currentUserId,
    isKnown,
    isUnlocked,
    method,
    status,
    hydrate,
    revalidate,
    setUnlocked,
    clear,
  }
})
