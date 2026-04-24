// 维度常量映射（中文名 -> 英文字段名）
const DIMENSION_MAP = {
  '女男倾向': 'female_male',
  '本土国际': 'local_international',
  '激进改革': 'accel_reform',
  '平等精英': 'equal_merit'
}

const DIMENSIONS = Object.values(DIMENSION_MAP)

// 用户选择到系数的映射（5点量表）
// 1=极度不赞同(-2), 2=部分不赞同(-1), 3=中立(0), 4=部分赞同(1), 5=极度赞同(2)
const CHOICE_COEFFICIENT = {
  1: -2,
  2: -1,
  3: 0,
  4: 1,
  5: 2
}

export function calculateScores(questions, answers) {
  const sums = {}
  DIMENSIONS.forEach(d => { sums[d] = 0 })

  for (const q of questions) {
    const choice = answers[q.id]
    if (choice == null) continue

    const coefficient = CHOICE_COEFFICIENT[choice] || 0

    // 处理维度1
    if (q.dimension1) {
      const dimKey = DIMENSION_MAP[q.dimension1] || q.dimension1
      if (DIMENSIONS.includes(dimKey)) {
        const weight = q.weight1 || 1
        const score = weight * coefficient
        sums[dimKey] += score
      }
    }

    // 处理维度2
    if (q.dimension2) {
      const dimKey = DIMENSION_MAP[q.dimension2] || q.dimension2
      if (DIMENSIONS.includes(dimKey)) {
        const weight = q.weight2 || 1
        const score = weight * coefficient
        sums[dimKey] += score
      }
    }
  }

  // 返回分数（-100到100范围，前端转换为百分比）
  const scores = {}
  DIMENSIONS.forEach(d => {
    scores[`dim_${d}`] = sums[d]
  })
  return scores
}

export function assignTags(questions, answers, scores) {
  const tagScores = {}

  for (const q of questions) {
    const choice = answers[q.id]
    if (choice == null) continue

    // 根据选择触发对应的标签
    const tagField = {
      5: 'tag_strongly_agree',
      4: 'tag_agree',
      3: 'tag_neutral',
      2: 'tag_disagree',
      1: 'tag_strongly_disagree'
    }[choice]

    if (tagField && q[tagField]) {
      // 解析标签字符串，格式如 "脱弱役:+1, 家庭主妇:+1"
      const tagPairs = q[tagField].split(',').map(s => s.trim())
      for (const pair of tagPairs) {
        const match = pair.match(/^(.+?):([+-]?\d+)$/)
        if (match) {
          const [, tagName, scoreStr] = match
          const score = parseInt(scoreStr)
          tagScores[tagName] = (tagScores[tagName] || 0) + score
        }
      }
    }
  }

  // 根据标签阈值筛选最终标签
  const TAG_THRESHOLDS = {
    '脱弱役': 4,
    '家庭主妇': 3,
    '自由主义': 3
  }

  const tags = []
  for (const [tagName, score] of Object.entries(tagScores)) {
    const threshold = TAG_THRESHOLDS[tagName] || 3
    if (score >= threshold) {
      tags.push(tagName)
    }
  }

  return tags
}
