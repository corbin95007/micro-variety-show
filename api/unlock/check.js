import { getUserId } from '../_lib/supabase.js'
import { getUnlockDecision, persistUnlockDecision } from '../_lib/unlock.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { result_id } = req.body
  const decision = await getUnlockDecision(userId)

  await persistUnlockDecision(userId, result_id, decision)

  res.json({
    unlocked: decision.unlocked,
    method: decision.method,
    referral_count: decision.referralCount,
  })
}
