import { supabase } from '../utils/supabase'

export async function getReferralInfo() {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/referral/info', {
    headers: {
      'Authorization': `Bearer ${session?.access_token}`
    }
  })
  return res.json()
}

export async function trackReferral(inviteCode) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/referral/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    },
    body: JSON.stringify({ invite_code: inviteCode })
  })
  return res.json()
}
