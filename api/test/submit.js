import { supabase, getUserId } from '../_lib/supabase.js'
import { calculateScores, assignTags } from '../_lib/scoring.js'
import { getUnlockDecision } from '../_lib/unlock.js'

function formatSupabaseError(stage, error) {
  return {
    error: error?.message ?? 'Unknown Supabase error',
    stage,
    message: error?.message ?? null,
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  }
}

function buildSubmitLogSummary({ userId, questions, answers, scores, tags, unlockDecision }) {
  return {
    userIdPrefix: userId ? userId.slice(0, 8) : null,
    questionCount: Array.isArray(questions) ? questions.length : 0,
    answeredCount: answers && typeof answers === 'object' ? Object.keys(answers).length : 0,
    scoreKeys: scores && typeof scores === 'object' ? Object.keys(scores) : [],
    tagsIsArray: Array.isArray(tags),
    unlockMethod: unlockDecision?.method ?? null,
  }
}

export function buildSubmitResponse(result, unlockDecision) {
  const unlocked = Boolean(unlockDecision?.unlocked)

  return {
    ...result,
    is_unlocked: Boolean(result?.is_unlocked ?? unlocked),
    unlock_method: result?.unlock_method ?? unlockDecision?.method ?? null,
    unlocked,
    method: unlockDecision?.method ?? null,
    referral_count: unlockDecision?.referralCount ?? 0,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { answers } = req.body
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: '缺少答案数据' })
  }

  const { data: questions, error: questionsError } = await supabase
    .from('tests')
    .select('*')

  if (questionsError) {
    return res.status(500).json(formatSupabaseError('load_questions', questionsError))
  }

  let unlockDecision = { unlocked: false, method: null }
  try {
    unlockDecision = await getUnlockDecision(userId)
  } catch (error) {
    console.error('Failed to resolve unlock decision during test submit:', error)
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

  const insertSummary = buildSubmitLogSummary({
    userId,
    questions,
    answers,
    scores,
    tags,
    unlockDecision,
  })

  console.log('Submitting test result:', insertSummary)

  const { data, error } = await supabase
    .from('test_results')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    console.error('Failed to insert test result:', {
      ...insertSummary,
      message: error.message,
      code: error.code ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    })
    return res.status(500).json(formatSupabaseError('insert_result', error))
  }
  console.log('Inserted test result:', insertSummary)
  res.json(buildSubmitResponse(data, unlockDecision))
}
