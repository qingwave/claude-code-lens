<script setup lang="ts">
interface DayActivity {
  date: string
  sessions: number
  messages: number
}
interface ActivityHistory {
  days: DayActivity[]
  range: { start: string; end: string }
}
type MetricKey = 'sessions' | 'messages'

const metric  = ref<MetricKey>('sessions')
const history = ref<ActivityHistory | null>(null)

const { data, pending } = await useFetch<ActivityHistory>('/api/stats/activity-history')
history.value = data.value

// ─── summary ──────────────────────────────────────────────────────────────────

const totalSessions = computed(() =>
  history.value?.days.reduce((s, d) => s + d.sessions, 0) ?? 0
)
const totalMessages = computed(() =>
  history.value?.days.reduce((s, d) => s + d.messages, 0) ?? 0
)
const activeDays = computed(() =>
  history.value?.days.filter(d => d.sessions > 0).length ?? 0
)
const streak = computed(() => {
  if (!history.value) return 0
  const rev = [...history.value.days].reverse()
  let n = 0
  for (const d of rev) { if (d.sessions > 0) n++; else break }
  return n
})

// ─── heatmap ──────────────────────────────────────────────────────────────────

const CELL = 11
const GAP  = 3

const weeks = computed(() => {
  if (!history.value) return []
  const days = [...history.value.days]
  const dow = new Date(days[0].date + 'T00:00:00').getDay()
  const padded: (DayActivity | null)[] = [...Array(dow).fill(null), ...days]
  const cols: (DayActivity | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7))
  while (cols[cols.length - 1].length < 7) cols[cols.length - 1].push(null)
  return cols
})

const maxHeat = computed(() =>
  Math.max(1, ...(history.value?.days.map(d => d[metric.value]) ?? [1]))
)

function cellLevel(day: DayActivity | null): number {
  if (!day) return -1
  const v = day[metric.value]
  if (v === 0) return 0
  return Math.min(4, Math.ceil((v / maxHeat.value) * 4))
}

const OPACITIES = ['', '0.20', '0.42', '0.68', '1.0']

function cellStyle(day: DayActivity | null) {
  const lvl = cellLevel(day)
  const sz = `${CELL}px`
  if (lvl < 0)   return { width: sz, height: sz, borderRadius: '2px', background: 'transparent' }
  if (lvl === 0) return { width: sz, height: sz, borderRadius: '2px', background: 'var(--surface-overlay)', border: '1px solid var(--border-subtle)' }
  return { width: sz, height: sz, borderRadius: '2px', background: 'var(--accent)', opacity: OPACITIES[lvl] }
}

const monthLabels = computed(() => {
  const out: { label: string; col: number }[] = []
  let last = -1
  weeks.value.forEach((week, i) => {
    const real = week.find(d => d !== null)
    if (real) {
      const m = new Date(real.date + 'T00:00:00').getMonth()
      if (m !== last) {
        out.push({ label: new Date(real.date + 'T00:00:00').toLocaleString('default', { month: 'short' }), col: i })
        last = m
      }
    }
  })
  return out
})

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// ─── tooltip ──────────────────────────────────────────────────────────────────

const tooltip = ref<{ x: number; y: number; day: DayActivity } | null>(null)

function onCellEnter(e: MouseEvent, day: DayActivity | null) {
  if (!day) return
  tooltip.value = { x: e.clientX, y: e.clientY, day }
}
function onCellMove(e: MouseEvent) {
  if (tooltip.value) tooltip.value = { ...tooltip.value, x: e.clientX, y: e.clientY }
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('default', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
</script>

<template>
  <div class="rounded-xl overflow-hidden bg-card">

    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-3"
      style="border-bottom: 1px solid var(--border-subtle)"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-activity" class="size-3.5" style="color: var(--accent)" />
        <span class="text-section-title">Activity</span>
        <span
          class="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style="background: var(--surface-overlay); color: var(--text-disabled)"
        >1 year</span>
      </div>
      <div
        class="flex items-center rounded-lg p-0.5 gap-0.5"
        style="background: var(--surface-overlay); border: 1px solid var(--border-subtle)"
      >
        <button
          v-for="m in (['sessions', 'messages'] as MetricKey[])"
          :key="m"
          class="px-2.5 py-0.5 text-[11px] font-medium rounded-md transition-all duration-150 capitalize"
          :style="metric === m
            ? 'background: var(--accent); color: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.25)'
            : 'color: var(--text-secondary)'"
          @click="metric = m"
        >{{ m }}</button>
      </div>
    </div>

    <!-- Stats strip -->
    <div class="grid grid-cols-4" style="border-bottom: 1px solid var(--border-subtle)">
      <div
        v-for="(item, i) in [
          { label: 'Sessions',    value: totalSessions, accent: false },
          { label: 'Messages',    value: totalMessages, accent: false },
          { label: 'Active days', value: activeDays,    accent: false },
          { label: 'Streak',      value: streak,        accent: true, suffix: 'd' },
        ]"
        :key="i"
        class="flex flex-col items-center justify-center py-3 gap-0.5"
        :style="i < 3 ? 'border-right: 1px solid var(--border-subtle)' : ''"
      >
        <span class="text-[10px] text-meta">{{ item.label }}</span>
        <span
          class="text-[18px] font-bold tabular-nums leading-none"
          style="font-family: var(--font-display); letter-spacing: -0.03em"
          :style="(item as any).accent ? 'color: var(--accent)' : ''"
        >{{ item.value.toLocaleString() }}<span
          v-if="(item as any).suffix"
          class="text-[11px] font-normal ml-0.5"
          style="color: var(--text-disabled); letter-spacing: 0"
        >{{ (item as any).suffix }}</span></span>
      </div>
    </div>

    <!-- Heatmap -->
    <div class="px-4 pt-4 pb-4">

      <div v-if="pending" class="h-24 rounded-lg animate-pulse" style="background: var(--surface-overlay)" />

      <template v-else-if="history">
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-[10px] text-meta">{{ metric === 'sessions' ? 'Sessions / day' : 'Messages / day' }}</span>
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-meta">Less</span>
            <div
              v-for="lv in [0,1,2,3,4]" :key="lv"
              :style="{
                width: '9px', height: '9px', borderRadius: '2px', flexShrink: '0',
                ...(lv === 0
                  ? { background: 'var(--surface-overlay)', border: '1px solid var(--border-subtle)' }
                  : { background: 'var(--accent)', opacity: OPACITIES[lv] }),
              }"
            />
            <span class="text-[10px] text-meta">More</span>
          </div>
        </div>

        <div class="overflow-x-auto">
          <div class="inline-flex flex-col" :style="{ gap: GAP + 'px' }">
            <!-- Month labels -->
            <div class="flex" :style="{ gap: GAP + 'px', paddingLeft: '18px' }">
              <div
                v-for="(_, wi) in weeks" :key="wi"
                class="shrink-0 overflow-visible text-[10px] font-medium leading-none"
                :style="{ width: CELL + 'px', color: 'var(--text-disabled)' }"
              >{{ monthLabels.find(m => m.col === wi)?.label ?? '' }}</div>
            </div>
            <!-- Grid -->
            <div class="flex" :style="{ gap: GAP + 'px' }">
              <div class="flex flex-col shrink-0" :style="{ gap: GAP + 'px', width: '14px' }">
                <div
                  v-for="(dl, di) in DAY_LABELS" :key="di"
                  class="text-[9px] leading-none flex items-center justify-end"
                  :style="{ height: CELL + 'px', color: 'var(--text-disabled)' }"
                ><span v-if="di % 2 === 1">{{ dl }}</span></div>
              </div>
              <div
                v-for="(week, wi) in weeks" :key="wi"
                class="flex flex-col shrink-0"
                :style="{ gap: GAP + 'px' }"
              >
                <div
                  v-for="(day, di) in week" :key="di"
                  class="transition-opacity duration-75"
                  :style="cellStyle(day)"
                  @mouseenter="onCellEnter($event, day)"
                  @mousemove="onCellMove"
                  @mouseleave="tooltip = null"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-else-if="!pending" class="flex flex-col items-center justify-center py-8 gap-2">
        <UIcon name="i-lucide-bar-chart-2" class="size-7 opacity-20" style="color: var(--text-primary)" />
        <span class="text-[12px] text-meta">No activity yet</span>
      </div>
    </div>
  </div>

  <!-- Tooltip -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-100"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition-all duration-75"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="tooltip"
        class="fixed z-50 pointer-events-none rounded-xl px-3.5 py-2.5 shadow-xl"
        :style="{
          background: 'var(--surface-overlay)',
          border: '1px solid var(--border-subtle)',
          backdropFilter: 'blur(12px)',
          transform: 'translate(-50%, calc(-100% - 10px))',
          left: tooltip.x + 'px',
          top:  tooltip.y + 'px',
        }"
      >
        <div class="text-[11px] font-semibold mb-1.5" style="color: var(--text-primary)">
          {{ fmtDate(tooltip.day.date) }}
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5">
            <div class="size-1.5 rounded-full" style="background: var(--accent)" />
            <span class="text-[12px] tabular-nums font-semibold" style="color: var(--text-primary)">{{ tooltip.day.sessions }}</span>
            <span class="text-[10px] text-meta">session{{ tooltip.day.sessions !== 1 ? 's' : '' }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="size-1.5 rounded-full" style="background: var(--accent-secondary)" />
            <span class="text-[12px] tabular-nums font-semibold" style="color: var(--text-primary)">{{ tooltip.day.messages }}</span>
            <span class="text-[10px] text-meta">msg</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
