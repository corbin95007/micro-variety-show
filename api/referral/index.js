import { supabase, getUserId } from '../_lib/supabase.js'
import {
  attachRequestId,
  handleApiError,
  sendBadRequest,
  sendConflict,
  sendError,
  sendUnauthorized,
} from '../_lib/errors.js'

async function getReferralInfo(req, userId, res) {
  const [
    profileResponse,
    referralCountResponse,
    usedReferralResponse,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('invite_code')
      .eq('id', userId)
      .single(),
    supabase
      .from('referrals')
      .select('*', { count: 'exact', head: true })
      .eq('inviter_id', userId),
    supabase
      .from('referrals')
      .select('inviter_id')
      .eq('invitee_id', userId)
      .limit(1)
      .maybeSingle(),
  ])

  if (profileResponse.error) {
    return handleApiError(req, res, profileResponse.error, {
      logLabel: 'Failed to load referral profile:',
      message: '邀请信息加载失败，请稍后再试',
      type: 'referral_profile_load_failed',
      context: {
        stage: 'load_profile',
        userIdPrefix: userId.slice(0, 8),
      },
    })
  }

  if (referralCountResponse.error) {
    return handleApiError(req, res, referralCountResponse.error, {
      logLabel: 'Failed to count referrals:',
      message: '邀请信息加载失败，请稍后再试',
      type: 'referral_count_failed',
      context: {
        stage: 'count_referrals',
        userIdPrefix: userId.slice(0, 8),
      },
    })
  }

  if (usedReferralResponse.error) {
    return handleApiError(req, res, usedReferralResponse.error, {
      logLabel: 'Failed to load used referral:',
      message: '邀请信息加载失败，请稍后再试',
      type: 'used_referral_load_failed',
      context: {
        stage: 'load_used_referral',
        userIdPrefix: userId.slice(0, 8),
      },
    })
  }

  let usedInviteCode = ''
  let usedInviterNickname = ''

  if (usedReferralResponse.data?.inviter_id) {
    const { data: inviterProfile, error: inviterProfileError } = await supabase
      .from('profiles')
      .select('invite_code, nickname')
      .eq('id', usedReferralResponse.data.inviter_id)
      .maybeSingle()

    if (inviterProfileError) {
      return handleApiError(req, res, inviterProfileError, {
        logLabel: 'Failed to load inviter profile:',
        message: '邀请信息加载失败，请稍后再试',
        type: 'inviter_profile_load_failed',
        context: {
          stage: 'load_inviter_profile',
          userIdPrefix: userId.slice(0, 8),
          inviterIdPrefix: usedReferralResponse.data.inviter_id.slice(0, 8),
        },
      })
    }

    usedInviteCode = inviterProfile?.invite_code || ''
    usedInviterNickname = inviterProfile?.nickname || ''
  }

  return res.json({
    invite_code: profileResponse.data?.invite_code,
    referral_count: referralCountResponse.count || 0,
    target: 3,
    used_invite_code: usedInviteCode,
    used_inviter_nickname: usedInviterNickname,
  })
}

async function trackReferral(req, userId, res) {
  const inviteCode = String(req.body?.invite_code || '').trim().toLowerCase()
  if (!inviteCode) {
    return sendBadRequest(res, '缺少邀请码', {
      requestId: req.requestId,
      type: 'missing_invite_code',
    })
  }

  const { data: existingReferral, error: existingReferralError } = await supabase
    .from('referrals')
    .select('inviter_id')
    .eq('invitee_id', userId)
    .limit(1)
    .maybeSingle()

  if (existingReferralError) {
    return handleApiError(req, res, existingReferralError, {
      logLabel: 'Failed to check existing referral:',
      message: '邀请码提交失败，请稍后再试',
      type: 'existing_referral_check_failed',
      context: {
        stage: 'check_existing_referral',
        userIdPrefix: userId.slice(0, 8),
      },
    })
  }

  if (existingReferral) {
    return sendConflict(res, '你已经填写过好友邀请码', {
      requestId: req.requestId,
      type: 'referral_already_used',
    })
  }

  const { data: inviter, error: inviterError } = await supabase
    .from('profiles')
    .select('id')
    .eq('invite_code', inviteCode)
    .maybeSingle()

  if (inviterError) {
    return handleApiError(req, res, inviterError, {
      logLabel: 'Failed to load inviter by invite code:',
      message: '邀请码提交失败，请稍后再试',
      type: 'inviter_lookup_failed',
      context: {
        stage: 'lookup_inviter',
        userIdPrefix: userId.slice(0, 8),
      },
    })
  }

  if (!inviter || inviter.id === userId) {
    return sendBadRequest(res, '无效邀请码', {
      requestId: req.requestId,
      type: 'invalid_invite_code',
    })
  }

  const { error } = await supabase
    .from('referrals')
    .insert({ inviter_id: inviter.id, invitee_id: userId })

  if (error?.code === '23505') {
    return sendConflict(res, '邀请码已提交，请勿重复填写', {
      requestId: req.requestId,
      type: 'referral_duplicate',
    })
  }

  if (error) {
    return handleApiError(req, res, error, {
      logLabel: 'Failed to insert referral:',
      message: '邀请码提交失败，请稍后再试',
      type: 'referral_insert_failed',
      context: {
        stage: 'insert_referral',
        userIdPrefix: userId.slice(0, 8),
        inviterIdPrefix: inviter.id.slice(0, 8),
      },
    })
  }
  return res.json({ success: true })
}

export default async function handler(req, res) {
  const requestId = attachRequestId(req, res)
  if (!['GET', 'POST'].includes(req.method)) {
    return sendError(res, 405, '请求方法不支持', {
      type: 'method_not_allowed',
      requestId,
    })
  }

  try {
    const userId = await getUserId(req)
    if (!userId) return sendUnauthorized(res, { requestId })

    if (req.method === 'GET') return getReferralInfo(req, userId, res)
    return trackReferral(req, userId, res)
  } catch (error) {
    return handleApiError(req, res, error, {
      requestId,
      logLabel: 'Unhandled referral API error:',
      message: req.method === 'GET' ? '邀请信息加载失败，请稍后再试' : '邀请码提交失败，请稍后再试',
      type: 'referral_unhandled_error',
    })
  }
}
