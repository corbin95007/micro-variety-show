import { buildPortraitBlocks, DIMENSION_COPY, TAG_COPY } from './result-copy.js'

const DIMENSION_ALIASES = {
  '女本位-男本位': 'female_male',
  '女男倾向': 'female_male',
  '本土-国际': 'local_international',
  '本土国际': 'local_international',
  '加速主义-改良主义': 'accel_reform',
  '激进改革': 'accel_reform',
  '平等主义-优绩主义': 'equal_merit',
  '平等精英': 'equal_merit',
}

const DIMENSIONS = [
  {
    key: 'dim_local_international',
    sourceKey: 'local_international',
    ...DIMENSION_COPY.local_international,
  },
  {
    key: 'dim_female_male',
    sourceKey: 'female_male',
    ...DIMENSION_COPY.female_male,
  },
  {
    key: 'dim_equal_merit',
    sourceKey: 'equal_merit',
    ...DIMENSION_COPY.equal_merit,
  },
  {
    key: 'dim_accel_reform',
    sourceKey: 'accel_reform',
    ...DIMENSION_COPY.accel_reform,
  },
]

function normalizeDimension(dimension) {
  if (!dimension) return null
  return DIMENSION_ALIASES[dimension] || dimension
}

function normalizeWeight(weight) {
  const numericWeight = Number(weight)
  return Number.isFinite(numericWeight) ? numericWeight : 1
}

function clampPercentage(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getStrength(distance) {
  if (distance >= 35) return '强烈'
  if (distance >= 20) return '明显'
  if (distance >= 8) return '轻度'
  return '均衡'
}

function getDominantSide(percentage) {
  const distance = Math.abs(percentage - 50)
  if (distance < 8) return 'balanced'
  return percentage > 50 ? 'right' : 'left'
}

function buildMaximums(questions = []) {
  const maximums = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension.sourceKey, 0]))

  const addWeight = (rawDimension, rawWeight) => {
    const dimensionKey = normalizeDimension(rawDimension)
    if (!dimensionKey || !(dimensionKey in maximums)) return
    maximums[dimensionKey] += Math.abs(normalizeWeight(rawWeight)) * 2
  }

  for (const question of questions) {
    addWeight(question.dimension1, question.weight1)
    addWeight(question.dimension2, question.weight2)
  }

  return maximums
}

function buildSpectrumItem(dimension, result, maximums) {
  const rawScore = Number(result?.[dimension.key] || 0)
  const maxScore = maximums[dimension.sourceKey] || 0
  const percentage = maxScore > 0
    ? clampPercentage(50 + rawScore / maxScore * 50)
    : 50

  const dominantSide = getDominantSide(percentage)
  const distance = Math.abs(percentage - 50)
  const dominantLabel = dominantSide === 'left'
    ? dimension.leftLabel
    : dominantSide === 'right'
      ? dimension.rightLabel
      : '中间地带'

  const summary = dominantSide === 'left'
    ? dimension.leftNarrative
    : dominantSide === 'right'
      ? dimension.rightNarrative
      : dimension.balanceNarrative

  const oppositeSummary = dominantSide === 'left'
    ? dimension.rightNarrative
    : dominantSide === 'right'
      ? dimension.leftNarrative
      : `如果被推向两端，通常会优先选择更${dimension.leftLabel}或更${dimension.rightLabel}的处理方式。`

  return {
    key: dimension.key,
    axisLabel: dimension.axisLabel,
    leftLabel: dimension.leftLabel,
    rightLabel: dimension.rightLabel,
    rawScore,
    percentage,
    dominantSide,
    dominantLabel,
    strength: getStrength(distance),
    distance,
    summary,
    oppositeSummary,
  }
}

function buildHeadline(primary, secondary) {
  if (!primary || primary.dominantSide === 'balanced') {
    return '中间地带观察者'
  }

  if (!secondary || secondary.distance < 12 || secondary.dominantSide === 'balanced') {
    return `${primary.dominantLabel}倾向`
  }

  return `${primary.dominantLabel} x ${secondary.dominantLabel}`
}

function buildSummary(primary, secondary, tags) {
  const segments = []

  if (primary) {
    segments.push(`你最显眼的轴是「${primary.axisLabel}」，整体呈现${primary.strength}的${primary.dominantLabel}倾向。`)
    segments.push(primary.summary)
  }

  if (secondary && secondary.distance >= 12) {
    segments.push(`第二显著的偏向出现在「${secondary.axisLabel}」上，整体更靠近${secondary.dominantLabel}。`)
  }

  if (tags?.length) {
    segments.push(`特殊标签把你进一步归到「${tags.join('、')}」这类议题位置上。`)
  }

  return segments.join('')
}

export function buildResultReport(result, questions = []) {
  const maximums = buildMaximums(questions)
  const spectrum = DIMENSIONS.map((dimension) => buildSpectrumItem(dimension, result, maximums))
  const sorted = [...spectrum].sort((a, b) => b.distance - a.distance)
  const primary = sorted[0]
  const secondary = sorted[1]
  const tags = result?.tags || []

  return {
    headline: buildHeadline(primary, secondary),
    summary: buildSummary(primary, secondary, tags),
    spectrum,
    tagMeanings: TAG_COPY,
    portrait: {
      blocks: buildPortraitBlocks(spectrum, tags, primary, secondary),
    },
  }
}
