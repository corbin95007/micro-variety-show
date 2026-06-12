import { supabase, getUserId } from '../supabase.js'
import { applyUnlockStateToResults, getUnlockDecision } from '../unlock.js'
import { attachRequestId, handleApiError, sendError, sendUnauthorized } from '../errors.js'

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

    if (error) {
      return handleApiError(req, res, error, {
        requestId,
        logLabel: 'Failed to load test results:',
        message: '测试结果列表加载失败，请稍后再试',
        type: 'results_load_failed',
        context: {
          stage: 'load_results',
          userIdPrefix: userId.slice(0, 8),
        },
      })
    }

    return res.json(applyUnlockStateToResults(data, decision))
  } catch (error) {
    return handleApiError(req, res, error, {
      requestId,
      logLabel: 'Unhandled test results API error:',
      message: '测试结果列表加载失败，请稍后再试',
      type: 'results_unhandled_error',
    })
  }
}
