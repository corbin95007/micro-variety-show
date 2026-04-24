<template>
  <div class="spectrum-bar" :class="{ 'is-animated': animated }">
    <div class="spectrum-labels">
      <span class="label-left">{{ leftLabel }}</span>
      <span class="label-right">{{ rightLabel }}</span>
    </div>
    <div class="spectrum-track">
      <div class="spectrum-gradient"></div>
      <div class="spectrum-indicator" :style="{ left: displayValue + '%' }">
        <div class="indicator-dot"></div>
        <div class="indicator-line"></div>
      </div>
    </div>
    <div class="spectrum-value">
      <span class="value-left" :style="{ opacity: displayValue < 50 ? 1 : 0.4 }">{{ 100 - displayValue }}%</span>
      <span class="value-right" :style="{ opacity: displayValue >= 50 ? 1 : 0.4 }">{{ displayValue }}%</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const props = defineProps({
  leftLabel: String,
  rightLabel: String,
  value: { type: Number, default: 50 },
})

const animated = ref(false)
const displayValue = ref(50)

onMounted(() => {
  setTimeout(() => {
    animated.value = true
    displayValue.value = props.value
  }, 300)
})

watch(() => props.value, (v) => { displayValue.value = v })
</script>

<style scoped>
.spectrum-bar {
  margin-bottom: 28px;
}

.spectrum-labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.spectrum-labels span {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-ink);
  letter-spacing: 0.02em;
}

.spectrum-track {
  position: relative;
  height: 8px;
  border-radius: 4px;
  overflow: visible;
}

.spectrum-gradient {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(
    to right,
    var(--color-teal) 0%,
    var(--color-sage) 30%,
    var(--color-amber) 70%,
    var(--color-accent) 100%
  );
  opacity: 0.7;
}

.spectrum-indicator {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: left 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.is-animated .spectrum-indicator {
  transition: left 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.indicator-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-ink);
  border: 3px solid var(--color-bg);
  box-shadow: 0 2px 8px rgba(29, 29, 31, 0.2);
}

.indicator-line {
  width: 2px;
  height: 0;
  background: var(--color-ink);
  opacity: 0;
}

.spectrum-value {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}

.spectrum-value span {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink);
  transition: opacity 0.4s ease;
  font-variant-numeric: tabular-nums;
}
</style>
