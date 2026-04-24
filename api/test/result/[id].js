import { supabase, getUserId } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const userId = await getUserId(req)
  if (!userId) return res.status(401).json({ error: '未登录' })

  const { id } = req.query

  const { data, error } = await supabase
    .from('test_results')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error) return res.status(404).json({ error: '结果不存在' })
  res.json(data)
}
