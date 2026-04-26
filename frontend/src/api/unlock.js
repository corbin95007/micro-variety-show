import { supabase } from '../utils/supabase'
import { parseApiResponse } from '../utils/http'

export async function checkUnlock(resultId) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/unlock/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    },
    body: JSON.stringify({ result_id: resultId })
  })
  return parseApiResponse(res, {
    fallbackMessage: '解锁状态获取失败',
    unauthorizedMessage: '登录状态已失效，请重新登录',
  })
}
