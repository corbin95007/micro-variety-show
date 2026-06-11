<template>
  <div class="spectrum-bar" :class="{ 'is-animated': animated }">
    <div class="spectrum-labels">
      <span class="label-left">{{ leftLabel }}</span>
      <span class="label-right">{{ rightLabel }}</span>
    </div>
    <div
      class="spectrum-track"
      role="meter"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="rightDisplayValue"
      :aria-valuetext="ariaValueText"
      :aria-label="axisLabel"
    >
      <div class="spectrum-gradient" aria-hidden="true"></div>
      <div class="spectrum-ticks" aria-hidden="true">
        <span class="tick is-edge"></span>
        <span class="tick"></span>
        <span class="tick is-middle"></span>
        <span class="tick"></span>
        <span class="tick is-edge"></span>
      </div>
      <div class="spectrum-indicator" :style="indicatorStyle" aria-hidden="true">
        <div class="indicator-dot"></div>
        <div class="indicator-line"></div>
      </div>
    </div>
    <div class="spectrum-value">
      <span class="value-left" :style="{ opacity: clampedDisplayValue < 50 ? 1 : 0.45 }">{{ leftDisplayValue }}%</span>
      <span class="value-right" :style="{ opacity: clampedDisplayValue >= 50 ? 1 : 0.45 }">{{ rightDisplayValue }}%</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'

const props = defineProps({
  leftLabel: String,
  rightLabel: String,
  value: { type: Number, default: 50 },
})

const animated = ref(false)
const displayValue = ref(50)
const normalizePercent = (value) => {
  if (value === null || value === undefined || value === '') return 50

  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 50

  return Math.min(100, Math.max(0, numericValue))
}

const clampedDisplayValue = computed(() => normalizePercent(displayValue.value))
const rightDisplayValue = computed(() => Math.round(clampedDisplayValue.value))
const leftDisplayValue = computed(() => 100 - rightDisplayValue.value)
const indicatorStyle = computed(() => ({
  '--indicator-progress': `${clampedDisplayValue.value}%`,
}))
const axisLabel = computed(() => `${props.leftLabel || '左侧'} 到 ${props.rightLabel || '右侧'}`)
const ariaValueText = computed(() => `${props.leftLabel || '左侧'} ${leftDisplayValue.value}%，${props.rightLabel || '右侧'} ${rightDisplayValue.value}%`)

onMounted(() => {
  setTimeout(() => {
    animated.value = true
    displayValue.value = normalizePercent(props.value)
  }, 300)
})

watch(() => props.value, (v) => { displayValue.value = normalizePercent(v) })
</script>

<style scoped>
.spectrum-bar {
  margin-bottom: 30px;
}

.spectrum-bar:last-child {
  margin-bottom: 0;
}

.spectrum-labels {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 14px;
  margin-bottom: 10px;
}

.spectrum-labels span {
  min-width: 0;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink);
  letter-spacing: 0.02em;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.label-right {
  text-align: right;
}

.spectrum-track {
  position: relative;
  --indicator-width: 16px;
  --track-height: 14px;
  height: 26px;
  border-radius: 999px;
  overflow: visible;
  cursor: default;
  user-select: none;
}

.spectrum-gradient {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  width: 100%;
  height: var(--track-height);
  transform: translateY(-50%);
  border-radius: inherit;
  border: 1px solid rgba(232, 228, 239, 0.95);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(250, 248, 245, 0.98)),
    var(--color-primary-soft);
  box-shadow: inset 0 1px 2px rgba(45, 38, 64, 0.05);
}

.spectrum-gradient::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 8px;
  right: 8px;
  height: 2px;
  transform: translateY(-50%);
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(45, 106, 106, 0.36) 0%,
    rgba(139, 157, 131, 0.32) 34%,
    rgba(52, 1, 134, 0.34) 66%,
    rgba(232, 80, 91, 0.34) 100%
  );
}

.spectrum-ticks {
  position: absolute;
  inset: 0 2px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 5px;
  pointer-events: none;
}

.tick {
  width: 1px;
  height: 6px;
  border-radius: 999px;
  background: rgba(45, 38, 64, 0.18);
}

.tick.is-edge {
  height: 10px;
  background: rgba(45, 38, 64, 0.28);
}

.tick.is-middle {
  height: 18px;
  background: rgba(52, 1, 134, 0.34);
}

.spectrum-indicator {
  position: absolute;
  top: 50%;
  left: clamp(
    calc(var(--indicator-width) / 2),
    var(--indicator-progress),
    calc(100% - (var(--indicator-width) / 2))
  );
  transform: translate(-50%, -50%);
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--indicator-width);
  pointer-events: none;
  transition: none;
}

.is-animated .spectrum-indicator {
  transition: left 0.72s cubic-bezier(0.22, 1, 0.36, 1);
}

.indicator-dot {
  box-sizing: border-box;
  position: relative;
  width: 14px;
  height: 22px;
  border-radius: 999px;
  background: var(--color-primary);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 4px rgba(45, 38, 64, 0.18);
}

.indicator-dot::after {
  content: "";
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
}

.indicator-line {
  width: 1px;
  height: 3px;
  margin-top: 1px;
  border-radius: 999px;
  background: rgba(52, 1, 134, 0.36);
}

.spectrum-value {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 14px;
  margin-top: 8px;
}

.spectrum-value span {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink);
  transition: opacity 0.4s ease;
  font-variant-numeric: tabular-nums;
}

.value-right {
  text-align: right;
}

@media (max-width: 360px) {
  .spectrum-labels span {
    font-size: 13px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-animated .spectrum-indicator,
  .spectrum-value span {
    transition: none;
  }
}
</style>
