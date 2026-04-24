import { supabase, getUserId } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { invite_code } = req.body
  if (!invite_code) return res.status(400).json({ error: '缺少邀请码' })

  const { data: inviter } = await supabase
    .from('profiles')
    .select('id')
    .eq('invite_code', invite_code)
    .single()

  if (!inviter || inviter.id === userId) {
    return res.status(400).json({ error: '无效邀请码' })
  }

  const { error } = await supabase
    .from('referrals')
    .insert({ inviter_id: inviter.id, invitee_id: userId })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
}
