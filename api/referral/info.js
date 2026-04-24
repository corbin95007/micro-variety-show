import { supabase, getUserId } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('invite_code')
    .eq('id', userId)
    .single()

  const { count } = await supabase
    .from('referrals')
    .select('*', { count: 'exact', head: true })
    .eq('inviter_id', userId)

  res.json({
    invite_code: profile?.invite_code,
    referral_count: count || 0,
    target: 3,
  })
}
