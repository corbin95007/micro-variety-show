let authSessionHandoffClaimed = false

export function isAuthSessionPath(pathname) {
  return String(pathname || '').replace(/\/+$/, '') === '/auth/session'
}

export function shouldRenderRouteDuringAuthLoading({ path, loading }) {
  return !loading || isAuthSessionPath(path)
}

export function claimAuthSessionHandoff() {
  if (authSessionHandoffClaimed) return false
  authSessionHandoffClaimed = true
  return true
}

export function resetAuthSessionHandoffClaimForTests() {
  authSessionHandoffClaimed = false
}
