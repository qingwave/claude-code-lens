<script setup lang="ts">
interface DayActivity {
  date: string
  sessions: number
  messages: number
  outputTokens: number
  cacheReadTokens: number
}
interface ActivityHistory {
  days: DayActivity[]
  range: { start: string; end: string }
}

type Metric = 'output' | 'cache'

const { data, pending } = await useFetch<ActivityHistory>('/api/stats/activity-history')
const metric = ref<Metric>('output')

// Last 30 days with data
const activeDays = computed(() => {
  if (!data.value) return []
  return data.value.days.filter(d =>
    metric.value === 'output' ? d.outputTokens > 0 : d.cacheReadTokens > 0
  ).slice(-30)
})

// Show last 30 days regardless (zeros included for continuity)
const chartDays = computed(() => {
  if (!data.value) return []
  return data.value.days.slice(-30)
})

const getValue = (d: DayActivity) =>
  metric.value === 'output' ? d.outputTokens : d.cacheReadTokens

const maxVal = computed(() => Math.max(...chartDays.value.map(getValue), 1))

const totalVal = computed(() =>
  chartDays.value.reduce((s, d) => s + getValue(d), 0)
)

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Chart dimensions
const W = 600
const H = 80
const BAR_GAP = 2

const barWidth = computed(() => {
  const n = chartDays.value.length || 30
  return (W - BAR_GAP * (n - 1)) / n
})

function barHeight(d: DayActivity) {
  const v = getValue(d)
  return v > 0 ? Math.max(2, (v / maxVal.value) * H) : 0
}

function barX(i: number) {
  return i * (barWidth.value + BAR_GAP)
}

// Tooltip
const tooltip = ref<{ x: number; y: number; day: DayActivity } | null>(null)

const tooltipStyle = computed(() =>
  tooltip.value
    ? { left: tooltip.value.x + 'px', top: tooltip.value.y + 'px' }
    : {}
)

function onMouseEnter(e: MouseEvent, day: DayActivity) {
  const rect = (e.currentTarget as SVGElement).closest('svg')!.getBoundingClientRect()
  tooltip.value = {
    x: (e.clientX - rect.left),
    y: (e.clientY - rect.top) - 8,
    day,
  }
}

function onMouseLeave() {
  tooltip.value = null
}
</script>

<template>
  <div
    v-if="pending || (data && totalVal > 0)"
    class="rounded-xl px-5 py-4 bg-card"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <span class="text-section-title">Daily Token Usage</span>
        <span class="text-[11px] text-meta ml-2 tabular-nums">30d · {{ fmtTokens(totalVal) }} total</span>
      </div>
      <!-- Metric toggle -->
      <div class="flex items-center gap-1 p-0.5 rounded-lg" style="background: var(--surface-raised)">
        <button
          v-for="m in (['output', 'cache'] as Metric[])"
          :key="m"
          class="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
          :style="metric === m
            ? 'background: var(--surface-base); color: var(--text-primary); box-shadow: 0 1px 2px rgba(0,0,0,0.08)'
            : 'color: var(--text-tertiary)'"
          @click="metric = m"
        >
          {{ m === 'output' ? 'Output' : 'Cache read' }}
        </button>
      </div>
    </div>

    <!-- Chart -->
    <div v-if="pending" class="h-20 rounded-lg animate-pulse" style="background: var(--surface-raised)" />
    <div v-else class="relative">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full"
        :height="H"
        style="overflow: visible"
        @mouseleave="onMouseLeave"
      >
        <g v-for="(day, i) in chartDays" :key="day.date">
          <!-- Background hit area -->
          <rect
            :x="barX(i)"
            :y="0"
            :width="barWidth"
            :height="H"
            fill="transparent"
            @mouseenter="onMouseEnter($event, day)"
          />
          <!-- Bar -->
          <rect
            v-if="barHeight(day) > 0"
            :x="barX(i)"
            :y="H - barHeight(day)"
            :width="barWidth"
            :height="barHeight(day)"
            :fill="tooltip?.day === day ? 'var(--accent)' : 'var(--accent-muted)'"
            rx="1.5"
            class="transition-all duration-100"
          />
        </g>
      </svg>

      <!-- Tooltip -->
      <div
        v-if="tooltip"
        class="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg text-[11px] shadow-lg -translate-x-1/2 -translate-y-full"
        style="background: var(--surface-overlay); border: 1px solid var(--border-subtle);"
        :style="tooltipStyle"
      >
        <div class="font-medium" style="color: var(--text-primary)">{{ fmtDate(tooltip.day.date) }}</div>
        <div class="tabular-nums" style="color: var(--accent)">
          {{ fmtTokens(getValue(tooltip.day)) }} tokens
        </div>
      </div>

      <!-- X-axis: first and last date labels -->
      <div class="flex justify-between mt-1">
        <span class="text-[10px] text-meta">{{ chartDays.length ? fmtDate(chartDays[0].date) : '' }}</span>
        <span class="text-[10px] text-meta">{{ chartDays.length ? fmtDate(chartDays[chartDays.length - 1].date) : '' }}</span>
      </div>
    </div>
  </div>
</template>
