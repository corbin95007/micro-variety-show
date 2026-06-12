import { supabase, getUserId } from '../supabase.js'
import { buildResultReport } from '../result-report.js'
import { applyUnlockStateToResult, getUnlockDecision } from '../unlock.js'
import { attachRequestId, handleApiError, logApiError, sendError, sendUnauthorized } from '../errors.js'

export default async function handler(req, res) {
  const requestId = attachRequestId(req, res)
  if (req.method !== 'GET') {
    return sendError(res, 405, '请求方法不支持', {
      type: 'method_not_allowed',
      requestId,
    })
  }

  try {
    const userId = await getUserId(req)
    if (!userId) return sendUnauthorized(res, { requestId })

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

    if (error) {
      logApiError('Test result not found or inaccessible:', {
        req,
        requestId,
        error,
        context: {
          stage: 'load_result',
          userIdPrefix: userId.slice(0, 8),
          resultId: id,
        },
        level: 'warn',
      })
      return sendError(res, 404, '结果不存在', {
        type: 'result_not_found',
        requestId,
      })
    }

    if (questionsError) {
      return handleApiError(req, res, questionsError, {
        requestId,
        logLabel: 'Failed to load result report questions:',
        message: '结果加载失败，请稍后再试',
        type: 'result_questions_load_failed',
        context: {
          stage: 'load_report_questions',
          userIdPrefix: userId.slice(0, 8),
          resultId: id,
        },
      })
    }

    const effectiveResult = applyUnlockStateToResult(data, decision)

    return res.json({
      ...effectiveResult,
      report: buildResultReport(effectiveResult, questions || []),
    })
  } catch (error) {
    return handleApiError(req, res, error, {
      requestId,
      logLabel: 'Unhandled test result API error:',
      message: '结果加载失败，请稍后再试',
      type: 'result_unhandled_error',
    })
  }
}
