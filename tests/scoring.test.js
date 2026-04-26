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

  it('按 Excel 阈值累计标签分数', () => {
    const questions = [
      { id: 1, dimension1: '本土-国际', weight1: 1, tag_strongly_disagree: '辱男词推广大使：+1' },
      { id: 2, dimension1: '本土-国际', weight1: 1, tag_strongly_disagree: '辱男词推广大使：+1' }
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
        tag_strongly_agree: '平权主义：+4',
        tag_strongly_disagree: '辱男词推广大使：+2'
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
