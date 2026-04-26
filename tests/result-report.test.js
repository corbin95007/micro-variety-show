import { describe, it, expect } from 'vitest'
import { buildResultReport } from '../api/_lib/result-report.js'

const questions = [
  { id: 1, dimension1: '本土-国际', weight1: 1, dimension2: null, weight2: null },
  { id: 2, dimension1: '女本位-男本位', weight1: 1, dimension2: null, weight2: null },
  { id: 3, dimension1: '平等主义-优绩主义', weight1: 2, dimension2: null, weight2: null },
  { id: 4, dimension1: '加速主义-改良主义', weight1: 1, dimension2: null, weight2: null },
]

describe('buildResultReport', () => {
  it('将原始分数按题库权重映射成 0-100 的光谱值', () => {
    const report = buildResultReport({
      dim_local_international: 2,
      dim_female_male: -2,
      dim_equal_merit: 0,
      dim_accel_reform: 1,
      tags: [],
    }, questions)

    expect(report.spectrum.find((item) => item.key === 'dim_local_international')?.percentage).toBe(100)
    expect(report.spectrum.find((item) => item.key === 'dim_female_male')?.percentage).toBe(0)
    expect(report.spectrum.find((item) => item.key === 'dim_equal_merit')?.percentage).toBe(50)
    expect(report.spectrum.find((item) => item.key === 'dim_accel_reform')?.percentage).toBe(75)
  })

  it('生成可直接用于结果页的标题和画像文案', () => {
    const report = buildResultReport({
      dim_local_international: 2,
      dim_female_male: -2,
      dim_equal_merit: 0,
      dim_accel_reform: 1,
      tags: ['马派女权'],
    }, questions)

    expect(report.headline).toContain('国际')
    expect(report.summary).toContain('马派女权')
    expect(report.portrait.blocks).toHaveLength(3)
    expect(report.portrait.blocks[0].title).toBe('你的画像')
  })
})
