import { supabase, getUserId } from '../_lib/supabase.js'
import { calculateScores, assignTags } from '../_lib/scoring.js'
import { getUnlockDecision } from '../_lib/unlock.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { answers } = req.body
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: '缺少答案数据' })
  }

  const [
    { data: questions, error: questionsError },
    unlockDecision,
  ] = await Promise.all([
    supabase
      .from('tests')
      .select('*'),
    getUnlockDecision(userId),
  ])

  if (questionsError) {
    return res.status(500).json({ error: questionsError.message })
  }

  const scores = calculateScores(questions, answers)
  const tags = assignTags(questions, answers)
  const insertPayload = {
    user_id: userId,
    ...scores,
    tags,
  }

  if (unlockDecision.unlocked) {
    insertPayload.is_unlocked = true
    insertPayload.unlock_method = unlockDecision.method
    insertPayload.unlocked_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('test_results')
    .insert(insertPayload)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}
