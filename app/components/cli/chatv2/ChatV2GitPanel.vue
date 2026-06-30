<script setup lang="ts">
import type { DiffResult } from '~/server/api/projects/[projectName]/git/diff.get'

const props = defineProps<{
  projectName: string
}>()

const emit = defineEmits<{
  'open-diff': [path: string, staged: boolean]
}>()

// ── Types ────────────────────────────────────────────────────────────────────

interface GitStatus {
  branch?: string
  stagedModified?: string[]
  stagedAdded?: string[]
  stagedDeleted?: string[]
  stagedRenamed?: string[]
  modified?: string[]
  deleted?: string[]
  untracked?: string[]
  projectPath: string
  error?: string
}

// ── Status fetch ─────────────────────────────────────────────────────────────

const { data: rawStatus, pending: statusPending, refresh: refreshStatus } = useFetch<GitStatus>(
  () => `/api/projects/${encodeURIComponent(props.projectName)}/git/status`
)
const status = computed(() => rawStatus.value as GitStatus | null)

// ── Diff stats cache (for +N -N display after a file is opened) ───────────────

const diffCache = reactive<Record<string, DiffResult>>({})

function diffCacheKey(path: string, staged: boolean) {
  return `${staged ? 'S' : 'U'}:${path}`
}

// Called by parent after it fetches the diff, so we can show stats in the list
function cacheDiff(diff: DiffResult, staged: boolean) {
  diffCache[diffCacheKey(diff.file, staged)] = diff
}

defineExpose({ cacheDiff })

// ── Selected file highlight ───────────────────────────────────────────────────

const selectedKey = ref<string | null>(null)

function selectFile(path: string, staged: boolean) {
  const key = diffCacheKey(path, staged)
  selectedKey.value = selectedKey.value === key ? null : key
  if (selectedKey.value) emit('open-diff', path, staged)
}

function isSelected(path: string, staged: boolean) {
  return selectedKey.value === diffCacheKey(path, staged)
}

// ── Collapsible sections ──────────────────────────────────────────────────────

const collapsedSections = reactive(new Set<string>())

function toggleSection(id: string) {
  if (collapsedSections.has(id)) {
    collapsedSections.delete(id)
  } else {
    collapsedSections.add(id)
  }
}

function isSectionOpen(id: string) {
  return !collapsedSections.has(id)
}

// ── Refresh ───────────────────────────────────────────────────────────────────

function refresh() {
  Object.keys(diffCache).forEach(k => delete diffCache[k])
  selectedKey.value = null
  refreshStatus()
}

// ── Derived data ─────────────────────────────────────────────────────────────

interface FileEntry {
  path: string
  badge: string
  badgeClass: string
  staged: boolean
  stats: { add: number; remove: number } | null
}

function withStats(path: string, staged: boolean, badge: string, badgeClass: string): FileEntry {
  const d = diffCache[diffCacheKey(path, staged)]
  return { path, badge, badgeClass, staged, stats: d ? { add: d.addCount, remove: d.removeCount } : null }
}

const stagedFiles = computed((): FileEntry[] => {
  if (!status.value || status.value.error) return []
  const s = status.value
  return [
    ...(s.stagedModified ?? []).map(p => withStats(p, true, 'M', 'badge-M')),
    ...(s.stagedAdded ?? []).map(p => withStats(p, true, 'A', 'badge-A')),
    ...(s.stagedRenamed ?? []).map(p => withStats(p, true, 'R', 'badge-R')),
    ...(s.stagedDeleted ?? []).map(p => withStats(p, true, 'D', 'badge-D')),
  ]
})

const changedFiles = computed((): FileEntry[] => {
  if (!status.value || status.value.error) return []
  const s = status.value
  return [
    ...(s.modified ?? []).map(p => withStats(p, false, 'M', 'badge-M')),
    ...(s.deleted ?? []).map(p => withStats(p, false, 'D', 'badge-D')),
  ]
})

const untrackedFiles = computed((): FileEntry[] => {
  if (!status.value || status.value.error) return []
  return (status.value.untracked ?? []).map(p => withStats(p, false, 'U', 'badge-U'))
})

const totalCount = computed(() =>
  stagedFiles.value.length + changedFiles.value.length + untrackedFiles.value.length
)

// ── Path helpers ──────────────────────────────────────────────────────────────

function basename(p: string) {
  const target = p.includes(' → ') ? p.split(' → ')[1] : p
  const i = target.lastIndexOf('/')
  return i === -1 ? target : target.slice(i + 1)
}

function dirname(p: string) {
  const target = p.includes(' → ') ? p.split(' → ')[1] : p
  const i = target.lastIndexOf('/')
  return i === -1 ? '' : target.slice(0, i + 1)
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Header -->
    <div class="shrink-0 flex items-center justify-between px-3 h-10 border-b" style="border-color: var(--border-subtle); background: var(--surface-raised);">
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-lucide-git-branch" class="size-3.5 shrink-0" style="color: var(--accent);" />
        <span
          v-if="status && !status.error && status.branch"
          class="text-[11px] font-semibold font-mono truncate"
          style="color: var(--text-primary);"
        >{{ status.branch }}</span>
        <span v-else class="text-[11px] font-bold uppercase tracking-wider" style="color: var(--text-tertiary);">Source Control</span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <span
          v-if="!statusPending && totalCount > 0"
          class="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
          style="background: var(--accent-muted); color: var(--accent);"
        >{{ totalCount }}</span>
        <button @click="refresh()" class="p-1.5 rounded hover-bg transition-all" title="Refresh">
          <UIcon name="i-lucide-refresh-cw" class="size-3.5" :class="{ 'animate-spin': statusPending }" style="color: var(--text-tertiary);" />
        </button>
      </div>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">

      <!-- Loading -->
      <div v-if="statusPending && !status" class="flex items-center justify-center h-24">
        <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-tertiary);" />
      </div>

      <!-- Error -->
      <div v-else-if="status?.error" class="text-center py-12 px-4">
        <div class="size-10 mx-auto mb-3 rounded-full flex items-center justify-center" style="background: var(--surface-raised);">
          <UIcon name="i-lucide-git-branch-x" class="size-5" style="color: var(--text-tertiary);" />
        </div>
        <p class="text-[12px] font-semibold mb-1" style="color: var(--text-primary);">Not a Git Repository</p>
        <p class="text-[11px]" style="color: var(--text-tertiary);">{{ status.error }}</p>
      </div>

      <template v-else-if="status">
        <!-- Clean -->
        <div v-if="totalCount === 0" class="text-center py-12 px-4">
          <div class="size-10 mx-auto mb-3 rounded-full flex items-center justify-center" style="background: rgba(5,150,105,0.08);">
            <UIcon name="i-lucide-check-circle-2" class="size-5" style="color: #059669;" />
          </div>
          <p class="text-[12px] font-semibold" style="color: var(--text-primary);">No changes</p>
          <p class="text-[11px] mt-0.5" style="color: var(--text-tertiary);">Working tree clean</p>
        </div>

        <div v-else>

          <!-- ── STAGED CHANGES ── -->
          <template v-if="stagedFiles.length > 0">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 hover-bg transition-colors text-left"
              @click="toggleSection('staged')"
            >
              <UIcon
                :name="isSectionOpen('staged') ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3 shrink-0"
                style="color: var(--text-tertiary);"
              />
              <span class="text-[10px] font-bold uppercase tracking-widest flex-1" style="color: var(--text-tertiary);">Staged Changes</span>
              <span class="text-[10px] font-semibold tabular-nums" style="color: var(--text-tertiary);">{{ stagedFiles.length }}</span>
            </button>

            <template v-if="isSectionOpen('staged')">
              <button
                v-for="f in stagedFiles" :key="'S:' + f.path"
                class="w-full flex items-center gap-2 pl-7 pr-3 py-1 text-left transition-colors file-row"
                :class="isSelected(f.path, true) ? 'file-row-active' : ''"
                @click="selectFile(f.path, true)"
              >
                <span class="shrink-0 status-badge" :class="f.badgeClass">{{ f.badge }}</span>
                <span class="flex-1 min-w-0 flex flex-col leading-tight">
                  <span class="text-[12px] font-medium truncate" style="color: var(--text-primary);">{{ basename(f.path) }}</span>
                  <span v-if="dirname(f.path)" class="text-[10px] font-mono truncate" style="color: var(--text-tertiary);">{{ dirname(f.path) }}</span>
                </span>
                <span v-if="f.stats" class="shrink-0 flex items-center gap-1 text-[10px] font-mono tabular-nums ml-2">
                  <span style="color: #22c55e;">+{{ f.stats.add }}</span>
                  <span style="color: #ef4444;">-{{ f.stats.remove }}</span>
                </span>
              </button>
            </template>
          </template>

          <!-- ── CHANGES ── -->
          <template v-if="changedFiles.length > 0">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 hover-bg transition-colors text-left"
              :class="stagedFiles.length > 0 ? 'border-t' : ''"
              style="border-color: var(--border-subtle);"
              @click="toggleSection('changes')"
            >
              <UIcon
                :name="isSectionOpen('changes') ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3 shrink-0"
                style="color: var(--text-tertiary);"
              />
              <span class="text-[10px] font-bold uppercase tracking-widest flex-1" style="color: var(--text-tertiary);">Changes</span>
              <span class="text-[10px] font-semibold tabular-nums" style="color: var(--text-tertiary);">{{ changedFiles.length }}</span>
            </button>

            <template v-if="isSectionOpen('changes')">
              <button
                v-for="f in changedFiles" :key="'U:' + f.path"
                class="w-full flex items-center gap-2 pl-7 pr-3 py-1 text-left transition-colors file-row"
                :class="isSelected(f.path, false) ? 'file-row-active' : ''"
                @click="selectFile(f.path, false)"
              >
                <span class="shrink-0 status-badge" :class="f.badgeClass">{{ f.badge }}</span>
                <span class="flex-1 min-w-0 flex flex-col leading-tight">
                  <span class="text-[12px] font-medium truncate" style="color: var(--text-primary);">{{ basename(f.path) }}</span>
                  <span v-if="dirname(f.path)" class="text-[10px] font-mono truncate" style="color: var(--text-tertiary);">{{ dirname(f.path) }}</span>
                </span>
                <span v-if="f.stats" class="shrink-0 flex items-center gap-1 text-[10px] font-mono tabular-nums ml-2">
                  <span style="color: #22c55e;">+{{ f.stats.add }}</span>
                  <span style="color: #ef4444;">-{{ f.stats.remove }}</span>
                </span>
              </button>
            </template>
          </template>

          <!-- ── UNTRACKED ── -->
          <template v-if="untrackedFiles.length > 0">
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 hover-bg transition-colors text-left"
              :class="(stagedFiles.length > 0 || changedFiles.length > 0) ? 'border-t' : ''"
              style="border-color: var(--border-subtle);"
              @click="toggleSection('untracked')"
            >
              <UIcon
                :name="isSectionOpen('untracked') ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3 shrink-0"
                style="color: var(--text-tertiary);"
              />
              <span class="text-[10px] font-bold uppercase tracking-widest flex-1" style="color: var(--text-tertiary);">Untracked</span>
              <span class="text-[10px] font-semibold tabular-nums" style="color: var(--text-tertiary);">{{ untrackedFiles.length }}</span>
            </button>

            <template v-if="isSectionOpen('untracked')">
              <button
                v-for="f in untrackedFiles" :key="'N:' + f.path"
                class="w-full flex items-center gap-2 pl-7 pr-3 py-1 text-left transition-colors file-row"
                :class="isSelected(f.path, false) ? 'file-row-active' : ''"
                @click="selectFile(f.path, false)"
              >
                <span class="shrink-0 status-badge badge-U">U</span>
                <span class="flex-1 min-w-0 flex flex-col leading-tight">
                  <span class="text-[12px] font-medium truncate" style="color: var(--text-primary);">{{ basename(f.path) }}</span>
                  <span v-if="dirname(f.path)" class="text-[10px] font-mono truncate" style="color: var(--text-tertiary);">{{ dirname(f.path) }}</span>
                </span>
                <span v-if="f.stats" class="shrink-0 text-[10px] font-mono tabular-nums ml-2" style="color: #22c55e;">
                  +{{ f.stats.add }}
                </span>
              </button>
            </template>
          </template>

        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.file-row {
  background: transparent;
}
.file-row:hover {
  background: var(--surface-hover);
}
.file-row-active {
  background: var(--accent-muted) !important;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
}
.badge-M { background: rgba(229,169,62,0.18); color: #e5a93e; }
.badge-A { background: rgba(34,197,94,0.14); color: #22c55e; }
.badge-D { background: rgba(239,68,68,0.14); color: #ef4444; }
.badge-R { background: rgba(139,92,246,0.14); color: #a78bfa; }
.badge-U { background: rgba(100,116,139,0.14); color: #94a3b8; }
</style>
