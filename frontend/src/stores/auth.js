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
    return data
  }

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email, password
    })
    if (error) throw error
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return { user, profile, loading, init, register, login, logout, fetchProfile }
})
