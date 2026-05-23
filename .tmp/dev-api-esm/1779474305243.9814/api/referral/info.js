import { supabase, getUserId } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const [
    profileResponse,
    referralCountResponse,
    usedReferralResponse,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('invite_code')
      .eq('id', userId)
      .single(),
    supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('inviter_id', userId),
    supabase
      .from('referrals')
      .select('inviter_id')
      .eq('invitee_id', userId)
      .limit(1)
      .maybeSingle(),
  ])

  if (profileResponse.error) {
    return res.status(500).json({ error: profileResponse.error.message })
  }

  if (referralCountResponse.error) {
    return res.status(500).json({ error: referralCountResponse.error.message })
  }

  if (usedReferralResponse.error) {
    return res.status(500).json({ error: usedReferralResponse.error.message })
  }

  let usedInviteCode = ''
  let usedInviterNickname = ''

  if (usedReferralResponse.data?.inviter_id) {
    const { data: inviterProfile, error: inviterProfileError } = await supabase
      .from('profiles')
      .select('invite_code, nickname')
      .eq('id', usedReferralResponse.data.inviter_id)
      .maybeSingle()

    if (inviterProfileError) {
      return res.status(500).json({ error: inviterProfileError.message })
    }

    usedInviteCode = inviterProfile?.invite_code || ''
    usedInviterNickname = inviterProfile?.nickname || ''
  }

  res.json({
    invite_code: profileResponse.data?.invite_code,
    referral_count: referralCountResponse.count || 0,
    target: 3,
    used_invite_code: usedInviteCode,
    used_inviter_nickname: usedInviterNickname,
  })
}
