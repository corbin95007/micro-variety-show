import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../utils/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const profile = ref(null)
  const loading = ref(true)

  async function init() {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      user.value = data.session.user
      await fetchProfile()
    }
    loading.value = false
    supabase.auth.onAuthStateChange(async (event, session) => {
      user.value = session?.user ?? null
      if (session?.user) await fetchProfile()
      else profile.value = null
    })
  }

  async function fetchProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()
    profile.value = data
  }

  async function register(email, password, nickname) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nickname } }
    })
    if (error) throw error
    // 注册成功后设置用户并等待profile创建
    if (data.session) {
      user.value = data.session.user
      // 等待触发器创建profile（短暂延迟确保数据库触发器完成）
      await new Promise(resolve => setTimeout(resolve, 500))
      await fetchProfile()
    }
    return data
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password
    })
    if (error) throw error
    if (data.session) {
      user.value = data.session.user
      await fetchProfile()
    }
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
    user.value = null
    profile.value = null
  }

  async function updateNickname(nickname) {
    if (!user.value) throw new Error('未登录')
    const { error } = await supabase
      .from('profiles')
      .update({ nickname })
      .eq('id', user.value.id)
    if (error) throw error
    // 同时更新 auth metadata
    await supabase.auth.updateUser({ data: { nickname } })
    await fetchProfile()
  }

  async function updatePassword(newPassword) {
    if (!user.value) throw new Error('未登录')
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })
    if (error) throw error
  }

  return { user, profile, loading, init, register, login, logout, fetchProfile, updateNickname, updatePassword }
})
