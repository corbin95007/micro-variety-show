import { supabase } from '../utils/supabase'
import { parseApiResponse } from '../utils/http'

export async function getReferralInfo() {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/referral', {
    headers: {
      'Authorization': `Bearer ${session?.access_token}`
    }
  })
  return parseApiResponse(res, {
    fallbackMessage: '邀请信息加载失败，请稍后再试',
    unauthorizedMessage: '登录状态已失效，请重新登录',
  })
}

export async function trackReferral(inviteCode) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/referral', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    },
    body: JSON.stringify({ invite_code: inviteCode })
  })
  return parseApiResponse(res, {
    fallbackMessage: '邀请码提交失败，请稍后再试',
    unauthorizedMessage: '登录状态已失效，请重新登录',
  })
}
