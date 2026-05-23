import { supabase, getUserId } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

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
  res.json({ success: true })
}
