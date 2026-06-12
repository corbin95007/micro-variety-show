import nodemailer from 'nodemailer'

const DEFAULT_SITE_NAME = '微综艺测试网站'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }

  return value
}

export function getFeedbackMailConfig() {
  return {
    adminEmail: requireEnv('FEEDBACK_ADMIN_EMAIL'),
    fromEmail: process.env.FEEDBACK_FROM_EMAIL || requireEnv('GMAIL_SMTP_USER'),
    smtpUser: requireEnv('GMAIL_SMTP_USER'),
    smtpAppPassword: requireEnv('GMAIL_SMTP_APP_PASSWORD'),
    siteName: process.env.FEEDBACK_SITE_NAME || DEFAULT_SITE_NAME,
  }
}

export function createGmailTransport(config = getFeedbackMailConfig()) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.smtpUser,
      pass: config.smtpAppPassword,
    },
  })
}

function normalizeText(value, fallback = '未提供') {
  if (value == null) return fallback

  const text = String(value).trim()
  return text || fallback
}

function buildFeedbackEmailText({ report, config }) {
  return [
    `${config.siteName} 收到新的问题反馈`,
    '',
    `反馈 ID: ${report.id}`,
    `提交时间: ${report.created_at}`,
    `用户 ID: ${report.user_id}`,
    `用户邮箱: ${normalizeText(report.email)}`,
    `昵称: ${normalizeText(report.nickname)}`,
    `邀请码: ${normalizeText(report.invite_code)}`,
    `页面: ${normalizeText(report.page_url)}`,
    `浏览器: ${normalizeText(report.user_agent)}`,
    '',
    '反馈内容:',
    normalizeText(report.message),
  ].join('\n')
}

export async function sendFeedbackEmail({ report }) {
  const config = getFeedbackMailConfig()
  const transport = createGmailTransport(config)
  const subject = `[${config.siteName}] 新的问题反馈 #${report.id}`

  return transport.sendMail({
    from: config.fromEmail,
    to: config.adminEmail,
    subject,
    text: buildFeedbackEmailText({ report, config }),
  })
}

export function getMailerRuntimeErrorMessage(error) {
  const message = error?.message || '邮件发送失败'

  if (message.includes('Missing environment variable')) {
    return `${message}。请在 Vercel 环境变量中配置 Gmail SMTP 和管理员邮箱。`
  }

  return message
}
