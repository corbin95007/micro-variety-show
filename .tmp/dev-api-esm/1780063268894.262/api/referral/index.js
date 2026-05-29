import { supabase, getUserId } from '../_lib/supabase.js'

async function getReferralInfo(userId, res) {
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

  return res.json({
    invite_code: profileResponse.data?.invite_code,
    referral_count: referralCountResponse.count || 0,
    target: 3,
    used_invite_code: usedInviteCode,
    used_inviter_nickname: usedInviterNickname,
  })
}

async function trackReferral(req, userId, res) {
  const inviteCode = String(req.body?.invite_code || '').trim().toLowerCase()
  if (!inviteCode) return res.status(400).json({ error: '缺少邀请码' })

  const { data: existingReferral, error: existingReferralError } = await supabase
    .from('referrals')
    .select('inviter_id')
    .eq('invitee_id', userId)
    .limit(1)
    .maybeSingle()

  if (existingReferralError) {
    return res.status(500).json({ error: existingReferralError.message })
  }

  if (existingReferral) {
    return res.status(409).json({ error: '你已经填写过好友邀请码' })
  }

  const { data: inviter, error: inviterError } = await supabase
    .from('profiles')
    .select('id')
    .eq('invite_code', inviteCode)
    .maybeSingle()

  if (inviterError) {
    return res.status(500).json({ error: inviterError.message })
  }

  if (!inviter || inviter.id === userId) {
    return res.status(400).json({ error: '无效邀请码' })
  }

  const { error } = await supabase
    .from('referrals')
    .insert({ inviter_id: inviter.id, invitee_id: userId })

  if (error?.code === '23505') {
    return res.status(409).json({ error: '邀请码已提交，请勿重复填写' })
  }

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ success: true })
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  if (req.method === 'GET') return getReferralInfo(userId, res)
  return trackReferral(req, userId, res)
}
