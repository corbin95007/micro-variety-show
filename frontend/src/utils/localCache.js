const STORAGE_PREFIX = 'micro-variety-show:cache:'

function getLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    // 隐私模式或被禁用时访问 localStorage 也可能抛错
    return null
  }
}

function buildKey(namespace, scope) {
  return scope
    ? `${STORAGE_PREFIX}${namespace}:${scope}`
    : `${STORAGE_PREFIX}${namespace}`
}

export function readLocalCache(namespace, scope = '') {
  const storage = getLocalStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(buildKey(namespace, scope))
    if (!raw) return null

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeLocalCache(namespace, scope, value) {
  const storage = getLocalStorage()
  if (!storage || !value || typeof value !== 'object') return

  try {
    storage.setItem(buildKey(namespace, scope), JSON.stringify(value))
  } catch {
    // localStorage 可能被禁用、隐私模式或写满，静默兜底，不影响主流程
  }
}

export function removeLocalCache(namespace, scope = '') {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.removeItem(buildKey(namespace, scope))
  } catch {
    // ignore
  }
}
