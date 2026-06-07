import { supabase } from '../utils/supabase'
import { parseApiResponse } from '../utils/http'

export async function submitFeedback(message, context = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/feedback/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({
      message,
      page_url: context.pageUrl,
      user_agent: context.userAgent,
    }),
  })

  return parseApiResponse(res, {
    fallbackMessage: '反馈提交失败，请稍后再试',
    unauthorizedMessage: '登录状态已失效，请重新登录',
  })
}
