import { supabase, getUserId } from '../../_lib/supabase.js'
import { buildResultReport } from '../../_lib/result-report.js'
import { applyUnlockStateToResult, getUnlockDecision } from '../../_lib/unlock.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { id } = req.query

  const [
    decision,
    { data, error },
    { data: questions, error: questionsError },
  ] = await Promise.all([
    getUnlockDecision(userId),
    supabase
      .from('test_results')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('tests')
      .select('dimension1, weight1, dimension2, weight2'),
  ])

  if (error) return res.status(404).json({ error: '结果不存在' })
  if (questionsError) return res.status(500).json({ error: questionsError.message })

  const effectiveResult = applyUnlockStateToResult(data, decision)

  res.json({
    ...effectiveResult,
    report: buildResultReport(effectiveResult, questions || []),
  })
}
