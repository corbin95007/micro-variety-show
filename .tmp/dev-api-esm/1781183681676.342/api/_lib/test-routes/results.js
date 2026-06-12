import { supabase, getUserId } from '../supabase.js'
import { applyUnlockStateToResults, getUnlockDecision } from '../unlock.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const [
    decision,
    { data, error },
  ] = await Promise.all([
    getUnlockDecision(userId),
    supabase
      .from('test_results')
      .select('id, is_unlocked, unlock_method, unlocked_at, created_at, tags')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  if (error) return res.status(500).json({ error: error.message })
  res.json(applyUnlockStateToResults(data, decision))
}
