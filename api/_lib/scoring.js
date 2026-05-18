// 维度常量映射（中文名 -> 英文字段名）
const DIMENSION_MAP = {
  '女本位-男本位': 'female_male',
  '女男倾向': 'female_male',
  '本土-国际': 'local_international',
  '本土国际': 'local_international',
  '加速主义-改良主义': 'accel_reform',
  '激进改革': 'accel_reform',
  '平等主义-优绩主义': 'equal_merit',
  '平等主义-本质主义': 'equal_merit',
  '平等精英': 'equal_merit'
}

const DIMENSIONS = Object.values(DIMENSION_MAP)
const DEFAULT_TAG_THRESHOLD = 3
const TAG_THRESHOLDS = {
  '马派女权': 6,
  '辱男词推广大使': 4,
  '平权主义': 6,
  '女同女权': 6,
  '国际激进女权主义': 6,
  '绝望的直女': 6,
  '社会达尔文主义': 6,
  '反宗教': 2,
  '实干主义派': 6,
  '后现代女权主义': 6,
}

// 用户选择到系数的映射（5点量表）
// 1=极度不赞同(-2), 2=部分不赞同(-1), 3=中立(0), 4=部分赞同(1), 5=极度赞同(2)
const CHOICE_COEFFICIENT = {
  1: -2,
  2: -1,
  3: 0,
  4: 1,
  5: 2
}

function normalizeDimension(dimension) {
  if (!dimension) return null
  return DIMENSION_MAP[dimension] || dimension
}

function normalizeWeight(weight) {
  const numericWeight = Number(weight)
  return Number.isFinite(numericWeight) ? numericWeight : 1
}

function parseTagPairs(rawTags) {
  if (!rawTags) return []

  return rawTags
    .split(/[\r\n,，;；]+/)
    .map(segment => segment.trim())
    .filter(Boolean)
    .map(segment => {
      const match = segment.match(/^(.+?)[：:]\s*([+-]?\d+)(?:\s*分)?$/)
      if (!match) return null

      return {
        tagName: match[1].trim(),
        score: Number.parseInt(match[2], 10),
      }
    })
    .filter(Boolean)
}

export function calculateScores(questions, answers) {
  const sums = {}
  DIMENSIONS.forEach(d => { sums[d] = 0 })

  for (const q of questions) {
    const choice = answers[q.id]
    if (choice == null) continue

    const coefficient = CHOICE_COEFFICIENT[Number(choice)] || 0

    // 处理维度1
    if (q.dimension1) {
      const dimKey = normalizeDimension(q.dimension1)
      if (DIMENSIONS.includes(dimKey)) {
        const weight = normalizeWeight(q.weight1)
        const score = weight * coefficient
        sums[dimKey] += score
      }
    }

    // 处理维度2
    if (q.dimension2) {
      const dimKey = normalizeDimension(q.dimension2)
      if (DIMENSIONS.includes(dimKey)) {
        const weight = normalizeWeight(q.weight2)
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

export function assignTags(questions, answers, tagThresholds = TAG_THRESHOLDS) {
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
      for (const { tagName, score } of parseTagPairs(q[tagField])) {
        if (Number.isFinite(score)) {
          tagScores[tagName] = (tagScores[tagName] || 0) + score
        }
      }
    }
  }

  // 根据标签阈值筛选最终标签
  const tags = []
  for (const [tagName, score] of Object.entries(tagScores)) {
    const threshold = tagThresholds[tagName] ?? DEFAULT_TAG_THRESHOLD
    if (score >= threshold) {
      tags.push(tagName)
    }
  }

  return tags
}
