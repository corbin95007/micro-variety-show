import { supabase } from '../utils/supabase'
import { parseApiResponse } from '../utils/http'

export async function getQuestions() {
  const res = await fetch('/api/test/questions')
  return parseApiResponse(res, { fallbackMessage: '题目加载失败，请稍后再试' })
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
  return parseApiResponse(res, {
    fallbackMessage: '提交失败',
    unauthorizedMessage: '登录状态已失效，请重新登录',
  })
}

export async function getResult(id) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/test/result/${id}`, {
    headers: {
      'Authorization': `Bearer ${session?.access_token}`
    }
  })
  return parseApiResponse(res, {
    fallbackMessage: '结果加载失败，请稍后再试',
    unauthorizedMessage: '登录状态已失效，请重新登录',
    notFoundMessage: '未找到这份测试结果',
  })
}

export async function getResults() {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/test/results', {
    headers: {
      'Authorization': `Bearer ${session?.access_token}`
    }
  })
  return parseApiResponse(res, {
    fallbackMessage: '测试结果列表加载失败，请稍后再试',
    unauthorizedMessage: '登录状态已失效，请重新登录',
  })
}
