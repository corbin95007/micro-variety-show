import { describe, it, expect } from 'vitest'
import { calculateScores, assignTags } from '../api/_lib/scoring.js'

describe('calculateScores - 权重计分系统', () => {
  it('兼容 Excel 维度名：女本位-男本位', () => {
    const questions = [
      { id: 1, dimension1: '女本位-男本位', weight1: 1, dimension2: null, weight2: null }
    ]
    const answers = { 1: 5 }
    const scores = calculateScores(questions, answers)
    expect(scores.dim_female_male).toBe(2)
  })

  it('正向题：极度赞同(5) → 权重1 × 系数2 = +2分', () => {
    const questions = [
      { id: 1, dimension1: '女男倾向', weight1: 1, dimension2: null, weight2: null }
    ]
    const answers = { 1: 5 }
    const scores = calculateScores(questions, answers)
    expect(scores.dim_female_male).toBe(2)
  })

  it('反向题：极度赞同(5) → 权重-2 × 系数2 = -4分', () => {
    const questions = [
      { id: 1, dimension1: '女男倾向', weight1: -2, dimension2: null, weight2: null }
    ]
    const answers = { 1: 5 }
    const scores = calculateScores(questions, answers)
    expect(scores.dim_female_male).toBe(-4)
  })

  it('中立(3) → 系数0，任何权重都得0分', () => {
    const questions = [
      { id: 1, dimension1: '本土国际', weight1: 2, dimension2: null, weight2: null }
    ]
    const answers = { 1: 3 }
    const scores = calculateScores(questions, answers)
    expect(scores.dim_local_international).toBe(0)
  })

  it('双维度题：同时影响两个维度', () => {
    const questions = [
      { id: 1, dimension1: '女男倾向', weight1: 1, dimension2: '本土国际', weight2: -1 }
    ]
    const answers = { 1: 5 }
    const scores = calculateScores(questions, answers)
    expect(scores.dim_female_male).toBe(2)  // 1 × 2
    expect(scores.dim_local_international).toBe(-2)  // -1 × 2
  })

  it('多题累加分数', () => {
    const questions = [
      { id: 1, dimension1: '女男倾向', weight1: 1, dimension2: null, weight2: null },
      { id: 2, dimension1: '女男倾向', weight1: 1, dimension2: null, weight2: null },
    ]
    const answers = { 1: 5, 2: 1 }  // 5=+2系数, 1=-2系数
    const scores = calculateScores(questions, answers)
    expect(scores.dim_female_male).toBe(0)  // (1×2) + (1×-2) = 0
  })

  it('按题目 id 取答案，题目顺序乱序不改变评分', () => {
    const questions = [
      { id: 1, dimension1: '女男倾向', weight1: 1, dimension2: null, weight2: null },
      { id: 2, dimension1: '本土国际', weight1: 2, dimension2: null, weight2: null },
      { id: 3, dimension1: '激进改革', weight1: -1, dimension2: '平等精英', weight2: 1 },
    ]
    const shuffledQuestions = [questions[2], questions[0], questions[1]]
    const answers = { 1: 5, 2: 1, 3: 4 }

    expect(calculateScores(shuffledQuestions, answers)).toEqual(calculateScores(questions, answers))
  })

  it('按题目 id 取答案，题目顺序乱序不改变标签', () => {
    const questions = [
      { id: 1, tag_strongly_agree: '反宗教：+2' },
      { id: 2, tag_strongly_disagree: '辱男词推广大使：+2' },
      { id: 3, tag_strongly_disagree: '辱男词推广大使：+2' },
    ]
    const shuffledQuestions = [questions[1], questions[2], questions[0]]
    const answers = { 1: 5, 2: 1, 3: 1 }

    expect(assignTags(shuffledQuestions, answers).sort()).toEqual(assignTags(questions, answers).sort())
  })

  it('无题的维度默认0分', () => {
    const questions = [
      { id: 1, dimension1: '女男倾向', weight1: 1, dimension2: null, weight2: null }
    ]
    const answers = { 1: 4 }
    const scores = calculateScores(questions, answers)
    expect(scores.dim_accel_reform).toBe(0)
  })

  it('Excel示例：T1题极度赞同', () => {
    const questions = [
      { id: 1, dimension1: '女男倾向', weight1: 1, dimension2: '本土国际', weight2: -1 }
    ]
    const answers = { 1: 5 }
    const scores = calculateScores(questions, answers)
    expect(scores.dim_female_male).toBe(2)
    expect(scores.dim_local_international).toBe(-2)
  })

  it('兼容新版题库维度名：平等主义-本质主义', () => {
    const questions = [
      { id: 1, dimension1: '平等主义-本质主义', weight1: 2, dimension2: null, weight2: null }
    ]
    const answers = { 1: 5 }
    const scores = calculateScores(questions, answers)
    expect(scores.dim_equal_merit).toBe(4)
  })
})

describe('assignTags - 累计分数触发', () => {
  it('支持 Excel 中的全角冒号和换行分隔', () => {
    const questions = [
      {
        id: 1,
        dimension1: '本土-国际',
        weight1: 1,
        tag_strongly_agree: "马派女权：+2\n平权主义：+1"
      }
    ]
    const answers = { 1: 5 }
    const tags = assignTags(questions, answers)
    expect(tags).toEqual([])
  })

  it('支持冒号后空格和分数字样', () => {
    const questions = [
      {
        id: 1,
        dimension1: '本土-国际',
        weight1: 1,
        tag_strongly_agree: '反宗教： +2分'
      }
    ]
    const answers = { 1: 5 }
    const tags = assignTags(questions, answers)
    expect(tags).toContain('反宗教')
  })

  it('按 Excel 阈值累计标签分数', () => {
    const questions = [
      { id: 1, dimension1: '本土-国际', weight1: 1, tag_strongly_disagree: '辱男词推广大使：+2' },
      { id: 2, dimension1: '本土-国际', weight1: 1, tag_strongly_disagree: '辱男词推广大使：+2' }
    ]
    const answers = { 1: 1, 2: 1 }
    const tags = assignTags(questions, answers)
    expect(tags).toContain('辱男词推广大使')
  })

  it('标签分数不足：不触发', () => {
    const questions = [
      { id: 1, dimension1: '本土-国际', weight1: 1, tag_strongly_agree: '平权主义：+1' },
      { id: 2, dimension1: '加速主义-改良主义', weight1: -1, tag_strongly_agree: '平权主义：+1' }
    ]
    const answers = { 1: 5, 2: 5 }  // 1+1=2分 < 4分阈值
    const tags = assignTags(questions, answers)
    expect(tags).not.toContain('平权主义')
  })

  it('不同选择触发不同标签', () => {
    const questions = [
      {
        id: 1,
        dimension1: '本土-国际',
        weight1: 1,
        tag_strongly_agree: '平权主义：+6',
        tag_strongly_disagree: '辱男词推广大使：+4'
      }
    ]
    const answers1 = { 1: 5 }
    const tags1 = assignTags(questions, answers1)
    expect(tags1).toContain('平权主义')
    expect(tags1).not.toContain('辱男词推广大使')

    const answers2 = { 1: 1 }
    const tags2 = assignTags(questions, answers2)
    expect(tags2).toContain('辱男词推广大使')
    expect(tags2).not.toContain('平权主义')
  })
})
