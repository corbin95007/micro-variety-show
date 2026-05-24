import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../utils/supabase'
import { buildPasswordResetRedirect } from '../utils/authRedirects'
import {
  clearPasswordRecoveryPending,
  clearPasswordRecoveryReady,
  clearPasswordRecoveryState,
  markPasswordRecoveryPending,
} from '../utils/authRecovery'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const profile = ref(null)
  const loading = ref(true)
  let initPromise = null
  let authSubscription = null

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
      clearPasswordRecoveryReady()
      if (user.value) {
        try {
          await fetchProfile()
        } catch {
          profile.value = buildProfile()
        }
      } else {
        profile.value = null
      }

      if (!authSubscription) {
        const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
          user.value = session?.user ?? null

          if (!user.value) {
            profile.value = null
            clearPasswordRecoveryState()
            return
          }

          if (event !== 'PASSWORD_RECOVERY') {
            clearPasswordRecoveryReady()
          }

          try {
            await fetchProfile()
          } catch {
            profile.value = buildProfile()
          }
        })

        authSubscription = listener.subscription
      }
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
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    if (options.redirect) callbackUrl.searchParams.set('next', options.redirect)
    if (options.invite) callbackUrl.searchParams.set('invite', options.invite)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nickname },
        emailRedirectTo: callbackUrl.toString(),
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

  async function exchangeCodeForSession(code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error

    user.value = data.session?.user ?? null
    if (user.value) {
      try {
        await fetchProfile()
      } catch {
        profile.value = buildProfile()
      }
    } else {
      profile.value = null
    }

    return data
  }

  async function requestPasswordReset(email) {
    clearPasswordRecoveryState()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildPasswordResetRedirect(window.location.origin),
    })
    if (error) {
      clearPasswordRecoveryPending()
      throw error
    }

    markPasswordRecoveryPending()
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
    exchangeCodeForSession,
    requestPasswordReset,
    fetchProfile,
    updateNickname,
    updatePassword,
    changePassword,
  }
})
