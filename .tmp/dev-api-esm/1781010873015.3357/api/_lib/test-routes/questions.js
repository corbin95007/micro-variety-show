import { supabase } from '../supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { data, error } = await supabase
    .from('tests')
    .select('id, question_text, sort_order')
    .order('sort_order')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}
