import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Missing environment variable: SUPABASE_URL')
}

if (!supabaseServiceRoleKey) {
  throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY')
}

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
)

function getAuthLogSummary(req, token, userId = null) {
  return {
    hasAuthHeader: Boolean(req.headers.authorization),
    tokenLength: token ? token.length : 0,
    tokenPrefix: token ? token.slice(0, 8) : null,
    userIdPrefix: userId ? userId.slice(0, 8) : null,
  }
}

export async function getUserId(req) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)

  if (error) {
    console.error('Failed to resolve Supabase user:', {
      ...getAuthLogSummary(req, token),
      message: error.message,
      code: error.code ?? null,
      status: error.status ?? null,
    })
    return null
  }

  const userId = data?.user?.id ?? null
  console.log('Resolved Supabase user:', getAuthLogSummary(req, token, userId))
  return userId
}
