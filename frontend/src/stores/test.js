import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../utils/supabase'

const DRAFT_VERSION = 1
const DRAFT_PREFIX = 'micro-variety-show:test-draft:'

export const useTestStore = defineStore('test', () => {
  const questions = ref([])
  const answers = ref({})
  const loading = ref(false)
  const draftRestored = ref(false)

  function getDraftKey(userId) {
    return `${DRAFT_PREFIX}${userId || 'guest'}`
  }

  function getAllDraftKeys(userId) {
    const keys = new Set([getDraftKey(userId), getDraftKey('guest')])

    try {
      const storedKeys = []
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i)
        if (key?.startsWith(DRAFT_PREFIX)) storedKeys.push(key)
      }
      storedKeys.forEach((key) => keys.add(key))
    } catch (error) {
      console.warn('Failed to scan test draft keys:', error)
    }

    return [...keys]
  }

  function readDraft(userId) {
    try {
      const rawDraft = window.localStorage.getItem(getDraftKey(userId))
      if (!rawDraft) return null

      const draft = JSON.parse(rawDraft)
      if (
        draft?.version !== DRAFT_VERSION ||
        !Array.isArray(draft.questions) ||
        !draft.questions.every(isValidDraftQuestion) ||
        !draft.answers ||
        typeof draft.answers !== 'object' ||
        Array.isArray(draft.answers)
      ) {
        clearStoredDraft(userId)
        return null
      }

      return draft
    } catch {
      return null
    }
  }

  function clearStoredDraft(userId) {
    window.localStorage.removeItem(getDraftKey(userId))
  }

  function clearStoredDrafts(userId) {
    const draftKeys = getAllDraftKeys(userId)
    draftKeys.forEach((key) => {
      window.localStorage.removeItem(key)
    })
    return draftKeys.length
  }

  function isValidDraftQuestion(question) {
    return (
      question &&
      question.id !== undefined &&
      question.id !== null &&
      String(question.id).trim() !== '' &&
      typeof question.question_text === 'string' &&
      question.question_text.trim() !== ''
    )
  }

  function saveDraft(userId) {
    if (!userId || questions.value.length === 0) return

    try {
      const draft = {
        version: DRAFT_VERSION,
        updatedAt: new Date().toISOString(),
        questions: questions.value,
        answers: { ...answers.value },
      }

      window.localStorage.setItem(getDraftKey(userId), JSON.stringify(draft))
    } catch (error) {
      console.warn('Failed to save test draft:', error)
    }
  }

  function clearDraft(userId) {
    if (!userId) return
    try {
      clearStoredDraft(userId)
    } catch (error) {
      console.warn('Failed to clear test draft:', error)
    }
    draftRestored.value = false
  }

  function resetTestData(userId, options = {}) {
    try {
      clearStoredDrafts(userId)
    } catch (error) {
      console.warn('Failed to reset test drafts:', error)
      clearDraft(userId)
      clearDraft('guest')
    }
    answers.value = {}
    draftRestored.value = false
    if (options.clearQuestions) {
      questions.value = []
    }
  }

  function shuffleQuestions(items) {
    const shuffled = [...items]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      const current = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = current
    }
    return shuffled
  }

  async function fetchQuestions(userId) {
    loading.value = true
    try {
      const draft = readDraft(userId)
      if (draft) {
        questions.value = draft.questions
        answers.value = { ...draft.answers }
        draftRestored.value = Object.keys(draft.answers).length > 0
        return
      }

      const { data } = await supabase
        .from('tests')
        .select('id, question_text, sort_order')
        .order('sort_order')
      questions.value = shuffleQuestions(data || [])
    } finally {
      loading.value = false
    }
  }

  function setAnswer(questionId, value) {
    answers.value[questionId] = value
  }

  function setAnswerAndSave(questionId, value, userId) {
    setAnswer(questionId, value)
    saveDraft(userId)
  }

  function reset(options = {}) {
    answers.value = {}
    draftRestored.value = false
    if (options.clearQuestions) {
      questions.value = []
    }
  }

  return {
    questions,
    answers,
    loading,
    draftRestored,
    fetchQuestions,
    setAnswer,
    setAnswerAndSave,
    saveDraft,
    clearDraft,
    resetTestData,
    reset,
  }
})
