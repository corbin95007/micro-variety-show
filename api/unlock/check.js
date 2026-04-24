import { supabase, getUserId } from '../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { result_id } = req.body

  // 优先级 1: EPISODE_ONE_AIRED
  if (process.env.EPISODE_ONE_AIRED === 'true') {
    await unlock(result_id, 'auto')
    return res.json({ unlocked: true, method: 'auto' })
  }

  // 优先级 2: 裂变 ≥ 3 人
  const { count: referralCount } = await supabase
    .from('referrals')
    .select('*', { count: 'exact', head: true })
    .eq('inviter_id', userId)

  if (referralCount >= 3) {
    await unlock(result_id, 'referral')
    return res.json({ unlocked: true, method: 'referral' })
  }

  // 优先级 3: 付费成功
  const { data: payment } = await supabase
    .from('payments')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'success')
    .limit(1)
    .single()

  if (payment) {
    await unlock(result_id, 'payment')
    return res.json({ unlocked: true, method: 'payment' })
  }

  res.json({ unlocked: false, referral_count: referralCount })
}

async function unlock(resultId, method) {
  await supabase
    .from('test_results')
    .update({ is_unlocked: true, unlock_method: method, unlocked_at: new Date().toISOString() })
    .eq('id', resultId)
}
