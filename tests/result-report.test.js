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

  it('女本位维度不反转光谱原始百分比，只修正卡片倾向强度口径', () => {
    const femaleReport = buildResultReport({
      dim_local_international: 0,
      dim_female_male: -2,
      dim_equal_merit: 0,
      dim_accel_reform: 0,
      tags: [],
    }, questions)

    const maleReport = buildResultReport({
      dim_local_international: 0,
      dim_female_male: 2,
      dim_equal_merit: 0,
      dim_accel_reform: 0,
      tags: [],
    }, questions)

    const femaleItem = femaleReport.spectrum.find((item) => item.key === 'dim_female_male')
    const maleItem = maleReport.spectrum.find((item) => item.key === 'dim_female_male')
    const femaleBlock = femaleReport.portrait.blocks.find((block) => block.title === '女本位-男本位')
    const maleBlock = maleReport.portrait.blocks.find((block) => block.title === '女本位-男本位')

    expect(femaleItem?.percentage).toBe(0)
    expect(femaleItem?.dominantLabel).toBe('女本位')
    expect(femaleBlock?.body).toContain('当前结果：强烈女本位倾向（100%）')
    expect(maleItem?.percentage).toBe(100)
    expect(maleItem?.dominantLabel).toBe('男本位')
    expect(maleBlock?.body).toContain('当前结果：强烈男本位倾向（100%）')
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
    expect(report.portrait.blocks.length).toBeGreaterThan(3)
    expect(report.portrait.blocks.map((block) => block.title)).toEqual(expect.arrayContaining([
      '本土-国际',
      '立场重心',
      '对立面画像',
    ]))
    expect(report.portrait.blocks.map((block) => block.title)).not.toEqual(expect.arrayContaining([
      '维度叙述',
      '马派女权',
    ]))
    expect(report.tagMeanings['马派女权']).toContain('劳动视角')
  })

  it('维度卡只展示当前命中的分支，不混入另一侧或均衡正文', () => {
    const report = buildResultReport({
      dim_local_international: 2,
      dim_female_male: -2,
      dim_equal_merit: 0,
      dim_accel_reform: 1,
      tags: [],
    }, questions)

    const localBlock = report.portrait.blocks.find((block) => block.title === '本土-国际')
    expect(localBlock?.body).toContain('当前结果：强烈国际倾向（100%）')
    expect(localBlock?.body).toContain('跨国案例、国际讨论和全球框架')
    expect(localBlock?.body).not.toContain('中文语境、当下处境和本地现实')
    expect(localBlock?.body).not.toContain('本土现实和国际讨论之间反复校准')

    const balancedBlock = report.portrait.blocks.find((block) => block.title === '平等主义-优绩主义')
    expect(balancedBlock?.body).toContain('当前结果：均衡状态（50%）')
    expect(balancedBlock?.body).toContain('平等保障和效率区分之间寻找折中')
    expect(balancedBlock?.body).not.toContain('更看重结构平等、分配修正')
    expect(balancedBlock?.body).not.toContain('更看重能力区分、责任分配')
  })

  it('立场重心按当前结果裁剪，不无条件追加总览和均衡文案', () => {
    const report = buildResultReport({
      dim_local_international: 2,
      dim_female_male: -2,
      dim_equal_merit: 0,
      dim_accel_reform: 1,
      tags: [],
    }, questions)

    const focusBlock = report.portrait.blocks.find((block) => block.title === '立场重心')
    expect(focusBlock?.body).toContain('本土-国际主导时')
    expect(focusBlock?.body).toContain('女本位-男本位主导时')
    expect(focusBlock?.body).not.toContain('当你在多个维度上都有明显倾向时')
    expect(focusBlock?.body).not.toContain('如果你在多个维度上都接近中间值')
  })

  it('整体均衡时立场重心只显示均衡状态文案', () => {
    const report = buildResultReport({
      dim_local_international: 0,
      dim_female_male: 0,
      dim_equal_merit: 0,
      dim_accel_reform: 0,
      tags: [],
    }, questions)

    const focusBlock = report.portrait.blocks.find((block) => block.title === '立场重心')
    expect(report.headline).toBe('中间地带观察者')
    expect(focusBlock?.body).toContain('如果你在多个维度上都接近中间值')
    expect(focusBlock?.body).not.toContain('主导时')
    expect(focusBlock?.body).not.toContain('当你在多个维度上都有明显倾向时')
  })

  it('primary 为 left 时，对立面画像使用当前维度的 right/opposite 文案', () => {
    const report = buildResultReport({
      dim_local_international: -2,
      dim_female_male: 0,
      dim_equal_merit: 0,
      dim_accel_reform: 0,
      tags: [],
    }, questions)

    const oppositeBlock = report.portrait.blocks.find((block) => block.title === '对立面画像')
    expect(report.headline).toContain('本土')
    expect(oppositeBlock?.body).toContain('最明显的反差会出现在「本土-国际」上')
    expect(oppositeBlock?.body).toContain('她们会优先参考国际讨论、跨国案例和全球框架')
    expect(oppositeBlock?.body).not.toContain('她们会优先考虑更广义的人际协商和关系结构')
    expect(oppositeBlock?.body).not.toContain('她们会优先考虑能力区分、责任分配和个体表现')
  })

  it('primary 为 right 时，对立面画像使用当前维度的 left/opposite 文案', () => {
    const report = buildResultReport({
      dim_local_international: 2,
      dim_female_male: 0,
      dim_equal_merit: 0,
      dim_accel_reform: 0,
      tags: [],
    }, questions)

    const oppositeBlock = report.portrait.blocks.find((block) => block.title === '对立面画像')
    expect(report.headline).toContain('国际')
    expect(oppositeBlock?.body).toContain('最明显的反差会出现在「本土-国际」上')
    expect(oppositeBlock?.body).toContain('她们会优先立足本土现实、中文语境和当下处境')
    expect(oppositeBlock?.body).not.toContain('她们会优先考虑女性主体性和女性利益')
    expect(oppositeBlock?.body).not.toContain('她们会优先考虑结构平等、分配修正和弱势补偿')
  })

  it('primary 为 balanced 时，对立面画像返回均衡对立面说明', () => {
    const report = buildResultReport({
      dim_local_international: 0,
      dim_female_male: 0,
      dim_equal_merit: 0,
      dim_accel_reform: 0,
      tags: [],
    }, questions)

    const oppositeBlock = report.portrait.blocks.find((block) => block.title === '对立面画像')
    expect(report.headline).toBe('中间地带观察者')
    expect(oppositeBlock?.body).toContain('你的结果整体更接近中间带')
    expect(oppositeBlock?.body).toContain('真正的对立面会是那些在单一维度上站得很极端的人')
    expect(oppositeBlock?.body).not.toContain('最明显的反差会出现在')
    expect(oppositeBlock?.body).not.toContain('她们会优先参考国际讨论、跨国案例和全球框架')
  })
})
