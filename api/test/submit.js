import { supabase, getUserId } from '../_lib/supabase.js'
import { calculateScores, assignTags } from '../_lib/scoring.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { answers } = req.body
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: '缺少答案数据' })
  }

  const { data: questions } = await supabase
    .from('tests')
    .select('*')

  const scores = calculateScores(questions, answers)
  const tags = assignTags(questions, answers, scores)

  const { data, error } = await supabase
    .from('test_results')
    .insert({
      user_id: userId,
      ...scores,
      tags,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}
