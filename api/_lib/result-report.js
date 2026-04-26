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
    axisLabel: '本土-国际',
    leftLabel: '本土',
    rightLabel: '国际',
    leftNarrative: '判断议题时更重视本土处境、中文语境和当下现实。',
    rightNarrative: '判断议题时更习惯借助跨国案例、国际讨论和全球框架。',
    balanceNarrative: '会在本土现实和国际讨论之间反复校准，不轻易把自己锁死在单一框架里。',
  },
  {
    key: 'dim_female_male',
    sourceKey: 'female_male',
    axisLabel: '女本位-男本位',
    leftLabel: '女本位',
    rightLabel: '男本位',
    leftNarrative: '会把女性主体性和女性利益放在更靠前的位置来思考问题。',
    rightNarrative: '更倾向把男女关系放进更广义的协商框架，而不是单独凸显女性优先。',
    balanceNarrative: '既强调女性处境，也会留出空间考虑更广义的人际协商和关系结构。',
  },
  {
    key: 'dim_equal_merit',
    sourceKey: 'equal_merit',
    axisLabel: '平等主义-优绩主义',
    leftLabel: '平等主义',
    rightLabel: '优绩主义',
    leftNarrative: '更看重结构平等、分配修正和对弱势位置的补偿。',
    rightNarrative: '更看重能力区分、责任分配和个体表现带来的差异。',
    balanceNarrative: '会在平等保障和效率区分之间寻找折中，而不是只押注一边。',
  },
  {
    key: 'dim_accel_reform',
    sourceKey: 'accel_reform',
    axisLabel: '加速主义-改良主义',
    leftLabel: '加速主义',
    rightLabel: '改良主义',
    leftNarrative: '更接受用更激进的推进方式把矛盾和议题快速推到台前。',
    rightNarrative: '更偏向渐进修正、现实协商和可执行的改造路径。',
    balanceNarrative: '会在立场表达和现实推进之间控制节奏，不急着把方法固定成单一路线。',
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

function buildFocusText(spectrum) {
  return spectrum
    .map((item) => {
      if (item.dominantSide === 'balanced') {
        return `在「${item.axisLabel}」上更接近中间值。`
      }
      return `在「${item.axisLabel}」上偏向${item.dominantLabel}（${item.percentage}%）。`
    })
    .join('')
}

function buildOppositeText(primary) {
  if (!primary) {
    return '目前没有足够明显的单轴倾向，因此你的对立面不会集中在某一个固定立场上。'
  }

  if (primary.dominantSide === 'balanced') {
    return '你的结果整体更接近中间带，所以真正的对立面会是那些在单一维度上站得很极端的人。'
  }

  return `如果把你推到相反一端，最明显的反差会出现在「${primary.axisLabel}」上：${primary.oppositeSummary}`
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
    portrait: {
      blocks: [
        { title: '你的画像', body: buildSummary(primary, secondary, tags) },
        { title: '立场重心', body: buildFocusText(spectrum) },
        { title: '对立面画像', body: buildOppositeText(primary) },
      ],
    },
  }
}
