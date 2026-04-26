import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../utils/supabase'
import { AVATAR_BUCKET, getAvatarUrl } from '../utils/profile'

const AVATAR_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const profile = ref(null)
  const loading = ref(true)
  let initPromise = null
  let authSubscription = null

  function buildProfile(data = {}) {
    if (!user.value) return null

    const avatarPath = data.avatar_path ?? profile.value?.avatar_path ?? ''

    return {
      ...data,
      id: data.id || user.value.id,
      nickname: data.nickname || profile.value?.nickname || user.value.user_metadata?.nickname || '未设置昵称',
      invite_code: data.invite_code || profile.value?.invite_code || '',
      avatar_path: avatarPath,
      avatar_url: getAvatarUrl(avatarPath),
    }
  }

  function getAvatarExtension(file) {
    const fileName = String(file?.name || '')
    const nameMatch = fileName.match(/\.([a-zA-Z0-9]+)$/)
    if (nameMatch) {
      const extension = nameMatch[1].toLowerCase()
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) {
        return extension === 'jpeg' ? 'jpg' : extension
      }
    }

    return AVATAR_EXTENSION_MAP[file?.type] || 'png'
  }

  async function removeAvatarFile(path) {
    if (!path) return

    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
    if (error) {
      console.warn('remove avatar file failed', error)
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
        const { data: listener } = supabase.auth.onAuthStateChange(async (_, session) => {
          user.value = session?.user ?? null

          if (!user.value) {
            profile.value = null
            return
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

  async function register(email, password, nickname) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname } },
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

  async function login(email, password) {
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

    user.value = null
    profile.value = null
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

  async function updateAvatar(file) {
    if (!user.value) throw new Error('未登录')

    const previousAvatarPath = profile.value?.avatar_path || ''
    const extension = getAvatarExtension(file)
    const nextAvatarPath = `${user.value.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(nextAvatarPath, file, {
        cacheControl: '3600',
        contentType: file.type || undefined,
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_path: nextAvatarPath })
      .eq('id', user.value.id)

    if (updateError) {
      await removeAvatarFile(nextAvatarPath)
      throw updateError
    }

    try {
      await fetchProfile()
    } catch {
      profile.value = {
        ...(buildProfile() || {}),
        avatar_path: nextAvatarPath,
        avatar_url: getAvatarUrl(nextAvatarPath),
      }
    }

    if (previousAvatarPath && previousAvatarPath !== nextAvatarPath) {
      await removeAvatarFile(previousAvatarPath)
    }

    return profile.value
  }

  async function clearAvatar() {
    if (!user.value) throw new Error('未登录')

    const previousAvatarPath = profile.value?.avatar_path || ''
    if (!previousAvatarPath) return profile.value

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_path: null })
      .eq('id', user.value.id)

    if (error) throw error

    try {
      await fetchProfile()
    } catch {
      profile.value = {
        ...(buildProfile() || {}),
        avatar_path: '',
        avatar_url: '',
      }
    }

    await removeAvatarFile(previousAvatarPath)
    return profile.value
  }

  async function updatePassword(newPassword) {
    if (!user.value) throw new Error('未登录')

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) throw error
  }

  return {
    user,
    profile,
    loading,
    init,
    register,
    login,
    logout,
    fetchProfile,
    updateNickname,
    updateAvatar,
    clearAvatar,
    updatePassword,
  }
})
