<script setup lang="ts">
interface RecentSession {
  sessionId: string
  projectName: string
  projectDisplayName: string
  title: string
  timestamp: string
  messageCount: number
  toolCallCount: number
}

const { data, pending } = await useFetch<RecentSession[]>('/api/stats/recent-sessions')
const sessions = computed(() => data.value ?? [])

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div
    v-if="pending || sessions.length > 0"
    class="rounded-xl overflow-hidden"
    style="border: 1px solid var(--border-subtle)"
  >
    <div
      class="flex items-center justify-between px-4 py-3"
      style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle)"
    >
      <h3 class="text-section-title flex items-center gap-2">
        <UIcon name="i-lucide-history" class="size-4" style="color: var(--accent)" />
        Recent Sessions
      </h3>
      <NuxtLink
        to="/cli"
        class="text-[12px] focus-ring rounded px-1.5 py-0.5 hover-bg transition-colors"
        style="color: var(--accent)"
      >View all</NuxtLink>
    </div>

    <!-- skeleton -->
    <div v-if="pending" class="divide-y" style="divide-color: var(--border-subtle)">
      <div v-for="i in 5" :key="i" class="px-4 py-3">
        <SkeletonRow />
      </div>
    </div>

    <div v-else class="divide-y" style="divide-color: var(--border-subtle)">
      <NuxtLink
        v-for="s in sessions"
        :key="s.sessionId"
        to="/cli"
        class="flex items-start gap-3 px-4 py-3 hover-bg group"
      >
        <!-- icon -->
        <div
          class="size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style="background: var(--accent-muted); border: 1px solid rgba(229,169,62,0.15)"
        >
          <UIcon name="i-lucide-message-square" class="size-3.5" style="color: var(--accent)" />
        </div>

        <!-- main content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <span class="text-[13px] font-medium truncate">
              {{ s.title || 'Untitled session' }}
            </span>
          </div>
          <div class="flex items-center gap-3 mt-0.5">
            <span
              class="text-[11px] font-mono px-1.5 py-px rounded-full"
              style="background: var(--surface-raised); color: var(--text-disabled); border: 1px solid var(--border-subtle)"
            >{{ s.projectDisplayName }}</span>
            <span class="text-[11px] text-meta flex items-center gap-1">
              <UIcon name="i-lucide-messages-square" class="size-3" />
              {{ s.messageCount }}
            </span>
            <span v-if="s.toolCallCount > 0" class="text-[11px] text-meta flex items-center gap-1">
              <UIcon name="i-lucide-wrench" class="size-3" />
              {{ s.toolCallCount }}
            </span>
          </div>
        </div>

        <!-- timestamp -->
        <span class="text-[11px] text-meta shrink-0 mt-0.5 tabular-nums">
          {{ formatRelative(s.timestamp) }}
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
