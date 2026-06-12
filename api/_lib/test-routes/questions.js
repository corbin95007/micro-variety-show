import { supabase } from '../supabase.js'
import { attachRequestId, handleApiError } from '../errors.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const requestId = attachRequestId(req, res)
  const { data, error } = await supabase
    .from('tests')
    .select('id, question_text, sort_order')
    .order('sort_order')

  if (error) {
    return handleApiError(req, res, error, {
      requestId,
      logLabel: 'Failed to load public test questions:',
      message: '题目加载失败，请稍后再试',
      type: 'questions_load_failed',
      context: { stage: 'load_questions' },
    })
  }

  res.json(data)
}
