import { sendFeedbackEmail, getMailerRuntimeErrorMessage } from '../_lib/mailer.js'
import { supabase, getUserId } from '../_lib/supabase.js'

const MESSAGE_MIN_LENGTH = 10
const MESSAGE_MAX_LENGTH = 1000
const RECENT_WINDOW_MS = 60 * 1000
const DAILY_LIMIT = 20

function normalizeBody(body) {
  if (!body) return {}
  if (typeof body === 'object') return body

  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

function truncateText(value, maxLength) {
  if (value == null) return null

  const text = String(value).trim()
  if (!text) return null

  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function sanitizeMessage(value) {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
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

function getTodayStartIso() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

async function enforceFeedbackRateLimit(userId) {
  const { data: latest, error: latestError } = await supabase
    .from('feedback_reports')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) {
    throw Object.assign(new Error(latestError.message), { supabaseError: latestError, stage: 'check_recent_feedback' })
  }

  if (latest?.created_at) {
    const lastSubmittedAt = new Date(latest.created_at).getTime()
    if (Date.now() - lastSubmittedAt < RECENT_WINDOW_MS) {
      return {
        limited: true,
        status: 429,
        error: '提交太频繁，请稍后再试',
      }
    }
  }

  const { count, error: countError } = await supabase
    .from('feedback_reports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', getTodayStartIso())

  if (countError) {
    throw Object.assign(new Error(countError.message), { supabaseError: countError, stage: 'check_daily_feedback' })
  }

  if ((count ?? 0) >= DAILY_LIMIT) {
    return {
      limited: true,
      status: 429,
      error: '今日反馈次数已达上限，请明天再试',
    }
  }

  return { limited: false }
}

async function loadUserContext(userId) {
  const [{ data: authUserData, error: authUserError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase
      .from('profiles')
      .select('nickname, invite_code')
      .eq('id', userId)
      .maybeSingle(),
  ])

  if (authUserError) {
    console.error('Failed to load feedback auth user:', {
      userIdPrefix: userId.slice(0, 8),
      message: authUserError.message,
      code: authUserError.code ?? null,
    })
  }

  if (profileError) {
    console.error('Failed to load feedback profile:', {
      userIdPrefix: userId.slice(0, 8),
      message: profileError.message,
      code: profileError.code ?? null,
      details: profileError.details ?? null,
    })
  }

  return {
    email: authUserData?.user?.email ?? null,
    nickname: profile?.nickname ?? null,
    inviteCode: profile?.invite_code ?? null,
  }
}

function toClientFeedback(report) {
  return {
    id: report.id,
    email_status: report.email_status,
    created_at: report.created_at,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const userId = await getUserId(req)
    if (!userId) return res.status(401).json({ error: '未登录' })

    const body = normalizeBody(req.body)
    const message = sanitizeMessage(body.message)

    if (message.length < MESSAGE_MIN_LENGTH) {
      return res.status(400).json({ error: `反馈内容至少需要 ${MESSAGE_MIN_LENGTH} 个字` })
    }

    if (message.length > MESSAGE_MAX_LENGTH) {
      return res.status(400).json({ error: `反馈内容不能超过 ${MESSAGE_MAX_LENGTH} 个字` })
    }

    const rateLimit = await enforceFeedbackRateLimit(userId)
    if (rateLimit.limited) {
      return res.status(rateLimit.status).json({ error: rateLimit.error })
    }

    const userContext = await loadUserContext(userId)
    const reportPayload = {
      user_id: userId,
      email: userContext.email,
      nickname: userContext.nickname,
      invite_code: userContext.inviteCode,
      message,
      page_url: truncateText(body.page_url, 1000),
      user_agent: truncateText(body.user_agent || req.headers['user-agent'], 1000),
      email_status: 'pending',
      metadata: {
        source: 'user_center',
      },
    }

    const { data: report, error: insertError } = await supabase
      .from('feedback_reports')
      .insert(reportPayload)
      .select()
      .single()

    if (insertError) {
      console.error('Failed to insert feedback report:', {
        userIdPrefix: userId.slice(0, 8),
        message: insertError.message,
        code: insertError.code ?? null,
        details: insertError.details ?? null,
        hint: insertError.hint ?? null,
      })
      return res.status(500).json(formatSupabaseError('insert_feedback', insertError))
    }

    try {
      const mailResult = await sendFeedbackEmail({ report })
      const { data: sentReport, error: sentUpdateError } = await supabase
        .from('feedback_reports')
        .update({
          email_status: 'sent',
          email_error: null,
          email_message_id: mailResult?.messageId ?? null,
          email_sent_at: new Date().toISOString(),
        })
        .eq('id', report.id)
        .select()
        .single()

      if (sentUpdateError) {
        console.error('Failed to update feedback email sent state:', {
          feedbackId: report.id,
          message: sentUpdateError.message,
          code: sentUpdateError.code ?? null,
          details: sentUpdateError.details ?? null,
        })
      }

      return res.json({
        feedback: toClientFeedback(sentReport ?? { ...report, email_status: 'sent' }),
        email_status: 'sent',
      })
    } catch (mailError) {
      const emailError = getMailerRuntimeErrorMessage(mailError)
      console.error('Failed to send feedback email:', {
        feedbackId: report.id,
        userIdPrefix: userId.slice(0, 8),
        message: emailError,
      })

      const { data: failedReport, error: failedUpdateError } = await supabase
        .from('feedback_reports')
        .update({
          email_status: 'failed',
          email_error: truncateText(emailError, 1000),
        })
        .eq('id', report.id)
        .select()
        .single()

      if (failedUpdateError) {
        console.error('Failed to update feedback email failed state:', {
          feedbackId: report.id,
          message: failedUpdateError.message,
          code: failedUpdateError.code ?? null,
          details: failedUpdateError.details ?? null,
        })
      }

      return res.status(202).json({
        feedback: toClientFeedback(failedReport ?? { ...report, email_status: 'failed' }),
        email_status: 'failed',
        warning: '问题反馈已保存，但邮件通知暂未发送成功，管理员可在数据库中查看',
      })
    }
  } catch (error) {
    if (error?.supabaseError) {
      return res.status(500).json(formatSupabaseError(error.stage, error.supabaseError))
    }

    console.error('Failed to create feedback report:', error)
    return res.status(500).json({ error: '提交问题反馈失败' })
  }
}
