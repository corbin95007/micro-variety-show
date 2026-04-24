import { describe, it, expect } from 'vitest'
import { calculateScores, assignTags } from '../api/_lib/scoring.js'

describe('calculateScores - 权重计分系统', () => {
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
  it('单题标签：极度赞同触发+1分，达到阈值', () => {
    const questions = [
      { id: 1, dimension1: '本土国际', weight1: 1, tag_strongly_agree: '家庭主妇:+1, 脱弱役:+1' }
    ]
    const answers = { 1: 5 }
    const tags = assignTags(questions, answers)
    expect(tags).toContain('家庭主妇')  // 1分 < 3分阈值，不触发
    expect(tags).not.toContain('脱弱役')  // 1分 < 4分阈值，不触发
  })

  it('多题累加：脱弱役需要4分', () => {
    const questions = [
      { id: 1, dimension1: '本土国际', weight1: 1, tag_strongly_agree: '脱弱役:+1' },
      { id: 2, dimension1: '激进改革', weight1: -1, tag_strongly_agree: '脱弱役:+1' },
      { id: 3, dimension1: '激进改革', weight1: -1, tag_strongly_agree: '脱弱役:+2' }
    ]
    const answers = { 1: 5, 2: 5, 3: 5 }  // 1+1+2=4分
    const tags = assignTags(questions, answers)
    expect(tags).toContain('脱弱役')
  })

  it('标签分数不足：不触发', () => {
    const questions = [
      { id: 1, dimension1: '本土国际', weight1: 1, tag_strongly_agree: '脱弱役:+1' },
      { id: 2, dimension1: '激进改革', weight1: -1, tag_strongly_agree: '脱弱役:+1' }
    ]
    const answers = { 1: 5, 2: 5 }  // 1+1=2分 < 4分阈值
    const tags = assignTags(questions, answers)
    expect(tags).not.toContain('脱弱役')
  })

  it('不同选择触发不同标签', () => {
    const questions = [
      {
        id: 1,
        dimension1: '本土国际',
        weight1: 1,
        tag_strongly_agree: '家庭主妇:+1, 脱弱役:+1',
        tag_strongly_disagree: '自由主义:+1'
      }
    ]
    const answers1 = { 1: 5 }
    const tags1 = assignTags(questions, answers1)
    expect(tags1).not.toContain('自由主义')

    const answers2 = { 1: 1 }
    const tags2 = assignTags(questions, answers2)
    expect(tags2).not.toContain('家庭主妇')
  })
})
