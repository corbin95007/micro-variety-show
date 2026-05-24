import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Missing environment variable: SUPABASE_URL')
}

export const supabase = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null

export function createSupabaseAuthClient() {
  if (!supabaseAnonKey) {
    throw new Error('Missing environment variable: SUPABASE_ANON_KEY')
  }

  return createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}

function getAuthLogSummary(req, token, userId = null) {
  return {
    hasAuthHeader: Boolean(req.headers.authorization),
    tokenLength: token ? token.length : 0,
    tokenPrefix: token ? token.slice(0, 8) : null,
    userIdPrefix: userId ? userId.slice(0, 8) : null,
  }
}

export async function getUserId(req) {
  if (!supabase) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY')
  }

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
