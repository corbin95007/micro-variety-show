import { supabase } from './supabase'

export const AVATAR_BUCKET = 'avatars'
export const AVATAR_MAX_SIZE = 5 * 1024 * 1024
export const AVATAR_ACCEPT_ATTR = '.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif'

const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const AVATAR_ALLOWED_EXTENSION_RE = /\.(jpe?g|png|webp|gif)$/i

export function getAvatarUrl(path) {
  if (!path) return ''

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  return data?.publicUrl || ''
}

export function getAvatarFileError(file) {
  if (!file) return '请选择图片'

  const hasAllowedType = AVATAR_ALLOWED_TYPES.includes(file.type) || AVATAR_ALLOWED_EXTENSION_RE.test(file.name || '')
  if (!hasAllowedType) {
    return '仅支持 JPG、PNG、WEBP 或 GIF 图片'
  }

  if (file.size > AVATAR_MAX_SIZE) {
    return '头像图片不能超过 5MB'
  }

  return ''
}
