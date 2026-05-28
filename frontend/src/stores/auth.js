import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../utils/supabase'
import { sanitizeAuthNextPath, sanitizeInviteCode } from '../utils/authRedirects'
import {
  clearPasswordRecoveryReady,
  clearPasswordRecoveryReadyForOtherUser,
  clearPasswordRecoveryState,
} from '../utils/authRecovery'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const profile = ref(null)
  const loading = ref(true)
  let initPromise = null
  let authSubscription = null

  function subscribeAuthChanges() {
    if (authSubscription) return

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      user.value = session?.user ?? null

      if (!user.value) {
        profile.value = null
        clearPasswordRecoveryState()
        return
      }

      clearPasswordRecoveryReadyForOtherUser(user.value.id)
      try {
        await fetchProfile()
      } catch {
        profile.value = buildProfile()
      }
    })

    authSubscription = listener.subscription
  }

  function buildProfile(data = {}) {
    if (!user.value) return null

    return {
      ...data,
      id: data.id || user.value.id,
      nickname: data.nickname || profile.value?.nickname || user.value.user_metadata?.nickname || '未设置昵称',
      invite_code: data.invite_code || profile.value?.invite_code || '',
    }
  }

  async function init() {
    if (initPromise) return initPromise
    if (!loading.value && authSubscription) return Promise.resolve()

    loading.value = true
    initPromise = (async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error

      user.value = data.session?.user ?? null
      clearPasswordRecoveryReadyForOtherUser(user.value?.id)
      if (user.value) {
        try {
          await fetchProfile()
        } catch {
          profile.value = buildProfile()
        }
      } else {
        profile.value = null
      }

      subscribeAuthChanges()
    })().catch((error) => {
      console.error('auth init failed', error)
      user.value = null
      profile.value = null
    }).finally(() => {
      loading.value = false
      initPromise = null
    })

    return initPromise
  }

  async function fetchProfile() {
    if (!user.value) {
      profile.value = null
      return null
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .maybeSingle()

    if (error) throw error

    profile.value = buildProfile(data || {})
    return profile.value
  }

  async function register(email, password, nickname, options = {}) {
    clearPasswordRecoveryState()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname,
          auth_next: sanitizeAuthNextPath(options.redirect, '/'),
          invite_code: sanitizeInviteCode(options.invite),
        },
      },
    })
    if (error) throw error

    if (data.session) {
      user.value = data.session.user
      await new Promise(resolve => setTimeout(resolve, 500))
      try {
        await fetchProfile()
      } catch {
        profile.value = buildProfile({ nickname })
      }
    }

    return data
  }

  async function sendEmailOtp(email) {
    clearPasswordRecoveryState()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
      },
    })
    if (error) throw error
  }

  async function verifyEmailOtp(email, token) {
    clearPasswordRecoveryState()
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })
    if (error) throw error

    if (data.session) {
      user.value = data.session.user
      try {
        await fetchProfile()
      } catch {
        profile.value = buildProfile()
      }
    }

    return data
  }

  async function login(email, password) {
    clearPasswordRecoveryState()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error

    if (data.session) {
      user.value = data.session.user
      try {
        await fetchProfile()
      } catch {
        profile.value = buildProfile()
      }
    }

    return data
  }

  async function logout() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error

    clearPasswordRecoveryState()
    user.value = null
    profile.value = null
  }

  async function setSession(sessionTokens) {
    loading.value = true
    try {
      const { data, error } = await supabase.auth.setSession(sessionTokens)
      if (error) throw error

      user.value = data.session?.user ?? null
      clearPasswordRecoveryReadyForOtherUser(user.value?.id)
      if (user.value) {
        try {
          await fetchProfile()
        } catch {
          profile.value = buildProfile()
        }
      } else {
        profile.value = null
      }

      subscribeAuthChanges()
      loading.value = false
      return data
    } catch (error) {
      loading.value = false
      throw error
    }
  }

  function finishSessionHandoff() {
    loading.value = false
  }

  async function requestPasswordReset(email) {
    clearPasswordRecoveryState()
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  }

  async function updateNickname(nickname) {
    if (!user.value) throw new Error('未登录')

    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) throw new Error('昵称不能为空')

    const previousProfile = profile.value
    profile.value = {
      ...(buildProfile() || {}),
      nickname: trimmedNickname,
    }

    const { error } = await supabase
      .from('profiles')
      .update({ nickname: trimmedNickname })
      .eq('id', user.value.id)
    if (error) {
      profile.value = previousProfile
      throw error
    }

    const { data, error: metadataError } = await supabase.auth.updateUser({
      data: {
        ...(user.value.user_metadata || {}),
        nickname: trimmedNickname,
      },
    })

    if (!metadataError && data?.user) {
      user.value = data.user
    }

    try {
      await fetchProfile()
    } catch {
      profile.value = {
        ...(profile.value || {}),
        nickname: trimmedNickname,
      }
    }

    if (metadataError) {
      console.warn('update user metadata failed', metadataError)
    }

    return profile.value
  }
  async function updatePassword(newPassword) {
    if (!user.value) throw new Error('未登录')

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) throw error

    if (data?.user) user.value = data.user
  }

  async function changePassword(currentPassword, newPassword) {
    if (!user.value?.email) throw new Error('未登录')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.value.email,
      password: currentPassword,
    })
    if (signInError) throw new Error('当前密码不正确')

    await updatePassword(newPassword)
  }

  return {
    user,
    profile,
    loading,
    init,
    register,
    sendEmailOtp,
    verifyEmailOtp,
    login,
    logout,
    setSession,
    finishSessionHandoff,
    requestPasswordReset,
    fetchProfile,
    updateNickname,
    updatePassword,
    changePassword,
  }
})
