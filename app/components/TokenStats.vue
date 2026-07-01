<script setup lang="ts">
interface TokenStats {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  estimatedCostUsd: number
  cacheHitRate: number
  tokensSavedByCache: number
}

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

const { data, pending } = await useFetch<TokenStats>('/api/stats/tokens')
const { data: history } = await useFetch<ActivityHistory>('/api/stats/activity-history')

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function fmtCost(usd: number): string {
  if (usd >= 100) return '$' + usd.toFixed(0)
  if (usd >= 1) return '$' + usd.toFixed(2)
  return '$' + usd.toFixed(3)
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const totalTokens = computed(() => {
  if (!data.value) return 0
  return data.value.inputTokens + data.value.outputTokens +
    data.value.cacheCreationTokens + data.value.cacheReadTokens
})

const hitRatePct = computed(() =>
  data.value ? Math.round(data.value.cacheHitRate * 100) : 0
)

// ── Sparkline (last 30 days) ──────────────────────────────────────────────────

const last30 = computed(() => history.value?.days.slice(-30) ?? [])

// Estimated daily cost: output * $15/1M + cacheRead * $0.3/1M
const dailyCost = computed(() =>
  last30.value.map(d => d.outputTokens * 15 / 1_000_000 + d.cacheReadTokens * 0.3 / 1_000_000)
)

const savedAmount = computed(() =>
  data.value ? data.value.cacheReadTokens / 1_000_000 * 3.0 * 0.9 : 0
)

function buildSparkline(values: number[]): string {
  const W = 80, H = 28
  const max = Math.max(...values, 1)
  const n = values.length
  if (n < 2) return ''
  const points = values.map((v, i) => {
    const x = (i / (n - 1)) * W
    const y = H - (v / max) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M ${points.join(' L ')}`
}

const outputSparkPath = computed(() =>
  buildSparkline(last30.value.map(d => d.outputTokens))
)
const cacheSparkPath = computed(() =>
  buildSparkline(last30.value.map(d => d.cacheReadTokens))
)
const costSparkPath = computed(() =>
  buildSparkline(dailyCost.value)
)

// ── Expanded chart modal ──────────────────────────────────────────────────────

type ExpandedView = 'output' | 'cache' | 'cost' | null
const expanded = ref<ExpandedView>(null)

// Chart for modal: 30-day bar chart
const chartDays = computed(() => last30.value)

function getValue(d: DayActivity): number {
  if (expanded.value === 'output') return d.outputTokens
  if (expanded.value === 'cache') return d.cacheReadTokens
  // cost: estimated from output + cache read
  return d.outputTokens * 15 / 1_000_000 + d.cacheReadTokens * 0.3 / 1_000_000
}

const maxVal = computed(() => Math.max(...chartDays.value.map(getValue), 1))

const W = 560, H = 120, BAR_GAP = 3

const barWidth = computed(() => {
  const n = chartDays.value.length || 30
  return (W - BAR_GAP * (n - 1)) / n
})

function barHeight(d: DayActivity) {
  const v = getValue(d)
  return v > 0 ? Math.max(3, (v / maxVal.value) * H) : 0
}

function barX(i: number) {
  return i * (barWidth.value + BAR_GAP)
}

const chartTotal = computed(() =>
  chartDays.value.reduce((s, d) => s + getValue(d), 0)
)

// Tooltip inside modal
const tooltip = ref<{ x: number; y: number; day: DayActivity } | null>(null)
const tooltipStyle = computed(() =>
  tooltip.value ? { left: tooltip.value.x + 'px', top: tooltip.value.y + 'px' } : {}
)

function onBarEnter(e: MouseEvent, day: DayActivity) {
  const svg = (e.currentTarget as SVGElement).closest('svg')!
  const rect = svg.getBoundingClientRect()
  tooltip.value = { x: e.clientX - rect.left, y: e.clientY - rect.top - 12, day }
}
</script>

<template>
  <div v-if="pending || (data && totalTokens > 0)" class="grid grid-cols-1 md:grid-cols-3 gap-3">

    <!-- Total tokens -->
    <button
      class="rounded-xl p-5 bg-card relative overflow-hidden group flex flex-col text-left cursor-pointer focus-ring hover-stat"
      @click="expanded = 'output'"
    >
      <div
        class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style="background: radial-gradient(ellipse at top left, var(--accent-muted) 0%, transparent 60%)"
      />
      <div class="relative w-full">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-lucide-zap" class="size-4 text-meta group-hover:text-[var(--accent)] transition-colors duration-200" />
          <span class="text-[12px] font-medium text-label">Total Tokens</span>
        </div>
        <div v-if="pending" class="h-8 w-24 rounded animate-pulse" style="background: var(--surface-raised)" />
        <template v-else>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="stat-number counter-animate">{{ fmtTokens(totalTokens) }}</span>
              <div class="mt-2 flex items-center gap-3">
                <span class="text-[10px] text-meta tabular-nums">↑ {{ fmtTokens(data!.inputTokens + data!.cacheCreationTokens) }} in</span>
                <span class="text-[10px] text-meta tabular-nums">↓ {{ fmtTokens(data!.outputTokens) }} out</span>
              </div>
            </div>
            <div v-if="outputSparkPath" class="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
              <svg width="80" height="36" viewBox="0 0 80 28" style="overflow: visible; display: block">
                <path :d="outputSparkPath" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="text-[9px] text-meta block text-right mt-0.5">30d</span>
            </div>
          </div>
        </template>
      </div>
    </button>

    <!-- Cache hit rate -->
    <button
      class="rounded-xl p-5 bg-card relative overflow-hidden group flex flex-col text-left cursor-pointer focus-ring hover-stat"
      @click="expanded = 'cache'"
    >
      <div
        class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style="background: radial-gradient(ellipse at top left, var(--accent-muted) 0%, transparent 60%)"
      />
      <div class="relative w-full">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-lucide-database" class="size-4 text-meta group-hover:text-[var(--accent)] transition-colors duration-200" />
          <span class="text-[12px] font-medium text-label">Cache Hit Rate</span>
        </div>
        <div v-if="pending" class="h-8 w-20 rounded animate-pulse" style="background: var(--surface-raised)" />
        <template v-else>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-baseline gap-1.5">
                <span class="stat-number counter-animate" style="color: var(--accent)">{{ hitRatePct }}%</span>
              </div>
              <p class="text-[10px] text-meta tabular-nums mt-2">
                {{ fmtTokens(data!.cacheReadTokens) }} from cache
              </p>
            </div>
            <div v-if="cacheSparkPath" class="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
              <svg width="80" height="36" viewBox="0 0 80 28" style="overflow: visible; display: block">
                <path :d="cacheSparkPath" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="text-[9px] text-meta block text-right mt-0.5">30d</span>
            </div>
          </div>
        </template>
      </div>
    </button>

    <!-- Estimated cost -->
    <button
      class="rounded-xl p-5 bg-card relative overflow-hidden group text-left cursor-pointer focus-ring hover-stat"
      @click="expanded = 'cost'"
    >
      <div
        class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style="background: radial-gradient(ellipse at top left, var(--accent-muted) 0%, transparent 60%)"
      />
      <div class="relative">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-lucide-circle-dollar-sign" class="size-4 text-meta group-hover:text-[var(--accent)] transition-colors duration-200" />
          <span class="text-[12px] font-medium text-label">Estimated Cost</span>
        </div>
        <div v-if="pending" class="h-8 w-16 rounded animate-pulse" style="background: var(--surface-raised)" />
        <template v-else>
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="stat-number counter-animate">{{ fmtCost(data!.estimatedCostUsd) }}</span>
              <p class="text-[10px] text-meta mt-2 tabular-nums">
                saved ~{{ fmtCost(savedAmount) }} vs no-cache
              </p>
            </div>
            <div v-if="costSparkPath" class="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
              <svg width="80" height="36" viewBox="0 0 80 28" style="overflow: visible; display: block">
                <path :d="costSparkPath" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="text-[9px] text-meta block text-right mt-0.5">30d</span>
            </div>
          </div>
        </template>
      </div>
    </button>

  </div>

  <!-- Expanded chart modal -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="expanded"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        style="background: rgba(0,0,0,0.5)"
        @click.self="expanded = null"
      >
        <div
          class="rounded-2xl p-6 w-full max-w-2xl shadow-2xl"
          style="background: var(--surface-overlay); border: 1px solid var(--border-subtle)"
        >
          <!-- Modal header -->
          <div class="flex items-center justify-between mb-5">
            <div>
              <h3 class="text-[15px] font-semibold">
                {{ expanded === 'output' ? 'Output Tokens' : expanded === 'cache' ? 'Cache Read Tokens' : 'Estimated Cost' }} — Last 30 Days
              </h3>
              <p class="text-[12px] text-meta mt-0.5 tabular-nums">
                Total: {{ fmtTokens(chartTotal) }}
              </p>
            </div>
            <button class="p-1.5 rounded-lg hover-bg" @click="expanded = null">
              <UIcon name="i-lucide-x" class="size-4 text-meta" />
            </button>
          </div>

          <!-- Bar chart -->
          <div class="relative">
            <svg
              :viewBox="`0 0 ${W} ${H}`"
              class="w-full"
              :height="H"
              style="overflow: visible"
              @mouseleave="tooltip = null"
            >
              <g v-for="(day, i) in chartDays" :key="day.date">
                <rect
                  :x="barX(i)" :y="0"
                  :width="barWidth" :height="H"
                  fill="transparent"
                  @mouseenter="onBarEnter($event, day)"
                />
                <rect
                  v-if="barHeight(day) > 0"
                  :x="barX(i)" :y="H - barHeight(day)"
                  :width="barWidth" :height="barHeight(day)"
                  :fill="tooltip?.day === day ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 40%, transparent)'"
                  rx="2"
                  class="transition-colors duration-75"
                />
              </g>
            </svg>

            <!-- Tooltip -->
            <div
              v-if="tooltip"
              class="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg text-[11px] shadow-lg -translate-x-1/2 -translate-y-full"
              style="background: var(--surface-overlay); border: 1px solid var(--border-subtle)"
              :style="tooltipStyle"
            >
              <div class="font-medium">{{ fmtDate(tooltip.day.date) }}</div>
              <div class="tabular-nums" style="color: var(--accent)">{{ expanded === 'cost' ? fmtCost(getValue(tooltip.day)) : fmtTokens(getValue(tooltip.day)) }}</div>
            </div>

            <!-- X-axis labels -->
            <div class="flex justify-between mt-2">
              <span class="text-[10px] text-meta">{{ chartDays.length ? fmtDate(chartDays[0].date) : '' }}</span>
              <span class="text-[10px] text-meta">{{ chartDays.length ? fmtDate(chartDays[chartDays.length - 1].date) : '' }}</span>
            </div>
          </div>

          <!-- Y-axis hints -->
          <div class="flex justify-between mt-3 pt-3" style="border-top: 1px solid var(--border-subtle)">
            <span class="text-[10px] text-meta">Peak: {{ expanded === 'cost' ? fmtCost(maxVal) : fmtTokens(maxVal) }}</span>
            <span class="text-[10px] text-meta">Avg: {{ expanded === 'cost' ? fmtCost(chartTotal / (chartDays.filter(d => getValue(d) > 0).length || 1)) : fmtTokens(Math.round(chartTotal / (chartDays.filter(d => getValue(d) > 0).length || 1))) }} / active day</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active { transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16,1,0.3,1); }
.modal-fade-leave-active { transition: opacity 0.1s ease; }
.modal-fade-enter-from { opacity: 0; transform: scale(0.97); }
.modal-fade-leave-to { opacity: 0; }
</style>
