import { supabase, getUserId } from '../_lib/supabase.js'

function jsonError(res, status, error, details = {}) {
  return res.status(status).json({
    error,
    ...details,
  })
}

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

export function buildDraftPayload(body = {}, userId, now = new Date()) {
  const { questions, answers, updatedAt } = body

  if (!Array.isArray(questions)) {
    return {
      error: {
        status: 400,
        body: { error: '缺少题目数据' },
      },
    }
  }

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return {
      error: {
        status: 400,
        body: { error: '缺少答案数据' },
      },
    }
  }

  const normalizedUpdatedAt = updatedAt ? new Date(updatedAt) : now
  if (Number.isNaN(normalizedUpdatedAt.getTime())) {
    return {
      error: {
        status: 400,
        body: { error: 'updatedAt 格式无效' },
      },
    }
  }

  return {
    payload: {
      user_id: userId,
      draft: {
        questions,
        answers,
      },
      updated_at: normalizedUpdatedAt.toISOString(),
    },
  }
}

async function handleGet(userId, res) {
  const { data, error } = await supabase
    .from('test_drafts')
    .select('draft, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return res.status(500).json(formatSupabaseError('load_draft', error))
  }

  return res.json({
    questions: data?.draft?.questions ?? [],
    answers: data?.draft?.answers ?? {},
    updatedAt: data?.updated_at ?? null,
  })
}

async function handlePut(req, userId, res) {
  const { payload, error: validationError } = buildDraftPayload(req.body, userId)

  if (validationError) {
    return res.status(validationError.status).json(validationError.body)
  }

  const { data, error } = await supabase
    .from('test_drafts')
    .upsert(payload, { onConflict: 'user_id' })
    .select('draft, updated_at')
    .single()

  if (error) {
    return res.status(500).json(formatSupabaseError('save_draft', error))
  }

  return res.json({
    questions: data?.draft?.questions ?? [],
    answers: data?.draft?.answers ?? {},
    updatedAt: data?.updated_at ?? null,
  })
}

async function handleDelete(userId, res) {
  const { error } = await supabase
    .from('test_drafts')
    .delete()
    .eq('user_id', userId)

  if (error) {
    return res.status(500).json(formatSupabaseError('delete_draft', error))
  }

  return res.json({ ok: true })
}

export default async function handler(req, res) {
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    return jsonError(res, 405, 'Method Not Allowed')
  }

  const userId = await getUserId(req)
  if (!userId) return jsonError(res, 401, '未登录')

  try {
    if (req.method === 'GET') return await handleGet(userId, res)
    if (req.method === 'PUT') return await handlePut(req, userId, res)
    return await handleDelete(userId, res)
  } catch (error) {
    console.error('Unhandled test draft API error:', error)
    return jsonError(res, 500, '草稿服务异常', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
