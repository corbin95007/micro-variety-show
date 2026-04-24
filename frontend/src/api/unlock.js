import { supabase } from '../utils/supabase'

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
  return res.json()
}
