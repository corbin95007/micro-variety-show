import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../utils/supabase'

export const useTestStore = defineStore('test', () => {
  const questions = ref([])
  const answers = ref({})
  const loading = ref(false)

  async function fetchQuestions() {
    loading.value = true
    const { data } = await supabase
      .from('tests')
      .select('id, question_text, sort_order')
      .order('sort_order')
    questions.value = data || []
    loading.value = false
  }

  function setAnswer(questionId, value) {
    answers.value[questionId] = value
  }

  function reset() {
    answers.value = {}
  }

  return { questions, answers, loading, fetchQuestions, setAnswer, reset }
})
