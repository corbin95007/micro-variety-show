import { supabase } from '../utils/supabase'

export async function getQuestions() {
  const res = await fetch('/api/test/questions')
  return res.json()
}

export async function submitTest(answers) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/test/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    },
    body: JSON.stringify({ answers })
  })
  return res.json()
}

export async function getResult(id) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/test/result/${id}`, {
    headers: {
      'Authorization': `Bearer ${session?.access_token}`
    }
  })
  return res.json()
}

export async function getResults() {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/test/results', {
    headers: {
      'Authorization': `Bearer ${session?.access_token}`
    }
  })
  return res.json()
}
