<script setup lang="ts">
import { useClaudeCodeHistory } from '~/composables/useClaudeCodeHistory'
import { formatRelativeTime } from '~/utils/messageFormatting'

// Tick every 60s so isActiveSession stays live without a server round-trip
const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { nowTimer = setInterval(() => { now.value = Date.now() }, 60_000) })
onUnmounted(() => { if (nowTimer) clearInterval(nowTimer) })

function isSessionLive(lastActivity: string): boolean {
  return now.value - new Date(lastActivity).getTime() < 10 * 60 * 1000
}

const emit = defineEmits<{
  (e: 'sessionSelected', payload: { projectName: string; sessionId: string; sessionSummary: string; projectDisplayName: string }): void
  (e: 'projectSelected', payload: { projectName: string; projectDisplayName: string }): void
  (e: 'newChat', payload?: { workingDir?: string; projectDisplayName?: string }): void
  (e: 'selectionCleared'): void
  (e: 'toggleCollapse'): void
  (e: 'sessionRenamed', payload: { projectName: string; sessionId: string; newName: string }): void
  (e: 'sessionDeleted', payload: { projectName: string; sessionId: string }): void
  (e: 'projectRenamed', payload: { projectName: string; newName: string }): void
  (e: 'projectDeleted', payload: { projectName: string }): void
  (e: 'configPanelSelected', panel: string): void
  (e: 'settingsToggled', open: boolean): void
}>()

const props = defineProps<{
  collapsed: boolean
  currentSessionId?: string | null
  isLoadingMessages?: boolean
}>()

const {
  projects,
  selectedProject,
  selectedSession,
  isLoadingProjects,
  fetchProjects,
  clearSelection,
} = useClaudeCodeHistory()

// Output style
const { styles: outputStyles, fetchStyles: fetchOutputStyles } = useOutputStyles()
const selectedOutputStyleId = useState('chat-active-output-style-id', () => 'default')
const selectedOutputStyleName = computed(() => {
  const style = outputStyles.value.find(s => s.id === selectedOutputStyleId.value)
  return style ? style.name : 'Default'
})

// ── Per-project inline sessions ──────────────────────────────────────────────

interface InlineSession {
  id: string
  summary: string
  messageCount: number
  lastActivity: string
  model?: string
  isGrouped?: boolean
  groupSize?: number
}

// Map: projectName → { sessions, loading, hasMore, expanded, sessionsExpanded, tab }
const projectState = reactive<Record<string, {
  sessions: InlineSession[]
  loading: boolean
  hasMore: boolean
  expanded: boolean
  sessionsExpanded: boolean
  tab: 'sessions' | 'artifacts'
}>>({})

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

function isProjectRecent(lastActivity?: string): boolean {
  if (!lastActivity) return false
  return Date.now() - new Date(lastActivity).getTime() < THREE_DAYS_MS
}

function ensureProjectState(name: string, lastActivity?: string) {
  if (!projectState[name]) {
    const expanded = !!lastActivity && isProjectRecent(lastActivity)
    projectState[name] = { sessions: [], loading: false, hasMore: false, expanded, sessionsExpanded: false, tab: 'sessions' }
  }
}

async function loadProjectSessions(projectName: string, limit = 20, offset = 0) {
  ensureProjectState(projectName)
  const state = projectState[projectName]!
  state.loading = true
  try {
    const res = await $fetch<{ sessions: InlineSession[]; hasMore: boolean }>(
      `/api/projects/${encodeURIComponent(projectName)}/sessions`,
      { query: { limit, offset } }
    )
    if (offset === 0) {
      state.sessions = res.sessions
    } else {
      state.sessions = [...state.sessions, ...res.sessions]
    }
    state.hasMore = res.hasMore
    if (offset === 0 && res.sessions.length === 0) {
      state.expanded = false
    }
  } catch {
    state.sessions = []
    state.expanded = false
  } finally {
    state.loading = false
  }
}

async function loadMoreProjectSessions(projectName: string) {
  const state = projectState[projectName]
  if (!state || state.loading || !state.hasMore) return
  await loadProjectSessions(projectName, 20, state.sessions.length)
}

// When projects load, init state and fetch sessions for each
watch(projects, async (list) => {
  for (const p of list) {
    ensureProjectState(p.name, p.lastActivity)
    if ((projectState[p.name]?.sessions.length ?? 0) === 0) {
      await loadProjectSessions(p.name)
    }
  }
}, { immediate: true })

// Refresh
const isRefreshing = ref(false)
async function handleManualRefresh() {
  isRefreshing.value = true
  try {
    await fetchProjects()
    for (const p of projects.value) {
      await loadProjectSessions(p.name)
    }
  } finally {
    isRefreshing.value = false
  }
}

// ── Artifacts per project ────────────────────────────────────────────────────

interface ArtifactItem {
  slug: string
  frontmatter: { name: string; description: string }
  filePath: string
}

const artifactsState = reactive<Record<string, {
  agents: ArtifactItem[]
  skills: ArtifactItem[]
  loading: boolean
  loaded: boolean
}>>({})

async function loadArtifacts(projectName: string) {
  if (!artifactsState[projectName]) {
    artifactsState[projectName] = { agents: [], skills: [], loading: false, loaded: false }
  }
  const state = artifactsState[projectName]!
  if (state.loaded || state.loading) return
  state.loading = true
  try {
    const res = await $fetch<{ agents: ArtifactItem[]; skills: ArtifactItem[] }>(
      `/api/project-artifacts/${encodeURIComponent(projectName)}/local`
    )
    state.agents = res.agents || []
    state.skills = res.skills || []
    state.loaded = true
  } catch {
    state.agents = []
    state.skills = []
  } finally {
    state.loading = false
  }
}

function switchTab(projectName: string, tab: 'sessions' | 'artifacts') {
  ensureProjectState(projectName)
  projectState[projectName]!.tab = tab
  if (tab === 'artifacts') loadArtifacts(projectName)
}

function getProjState(name: string) {
  ensureProjectState(name)
  return projectState[name]!
}

function getArtState(name: string) {
  return artifactsState[name] ?? { agents: [], skills: [], loading: false, loaded: false }
}

// ── Config panel (project settings) ─────────────────────────────────────────

const configProject = ref<string | null>(null)
const configSubPanel = ref<'menu' | 'artifacts'>('menu')
const cleaningProject = ref(false)
const toast = useToast()

async function cleanupProjectSessions(projectName: string) {
  cleaningProject.value = true
  try {
    const res = await $fetch<{ deleted: number }>('/api/projects/cleanup-empty', {
      method: 'POST',
      body: { projectName },
    })
    if (res.deleted > 0) {
      toast.add({ title: `Removed ${res.deleted} empty session${res.deleted === 1 ? '' : 's'}`, color: 'success' })
      await loadProjectSessions(projectName)
    } else {
      toast.add({ title: 'No empty sessions found', color: 'neutral' })
    }
  } catch (e: any) {
    toast.add({ title: 'Cleanup failed', description: e.message, color: 'error' })
  } finally {
    cleaningProject.value = false
  }
}

const route = useRoute()

// Sync config panel with settings route
watch(() => route.path, (path) => {
  if (!path.endsWith('/settings')) {
    configProject.value = null
  }
}, { immediate: true })

watch(selectedProject, (p) => {
  if (!p) configProject.value = null
})

const dirSettings = ref<any>({})
async function fetchDirSettings(projectPath: string) {
  try {
    dirSettings.value = await $fetch('/api/projects/settings', { query: { path: projectPath } })
    if (dirSettings.value.outputStyle) {
      const style = outputStyles.value.find(s =>
        s.name.toLowerCase() === dirSettings.value.outputStyle.toLowerCase() ||
        s.id === dirSettings.value.outputStyle.toLowerCase()
      )
      if (style) selectedOutputStyleId.value = style.id
    }
  } catch { /* ignore */ }
}

watch(selectedOutputStyleId, (newId) => {
  if (configProject.value) {
    const style = outputStyles.value.find(s => s.id === newId)
    if (style) dirSettings.value.outputStyle = style.name
  }
})

function openConfig(projectName: string, projectPath: string) {
  configProject.value = projectName
  configSubPanel.value = 'menu'
  selectedProject.value = projects.value.find(p => p.name === projectName) || null
  emit('settingsToggled', true)
  fetchDirSettings(projectPath)
}

function closeConfig() {
  configProject.value = null
  configSubPanel.value = 'menu'
  emit('settingsToggled', false)
}

// ── Folder input for new chat ────────────────────────────────────────────────

const isChoosingFolder = ref(false)
const folderInput = ref('')
const folderInputRef = ref<HTMLInputElement | null>(null)
const showNewChatMenu = ref(false)
const newChatMenuRef = ref<HTMLElement | null>(null)
const isBrowsingFolder = ref(false)

function handleNewChat(workingDir?: string, displayName?: string) {
  showNewChatMenu.value = false
  if (workingDir) {
    emit('newChat', { workingDir, projectDisplayName: displayName })
  } else {
    emit('newChat', undefined)
  }
}

function openNewChatMenu() {
  showNewChatMenu.value = !showNewChatMenu.value
}

async function openFolderInput() {
  showNewChatMenu.value = false
  isBrowsingFolder.value = true
  try {
    const res = await $fetch<{ path: string | null }>('/api/utils/pick-folder', { method: 'POST' })
    if (res.path) {
      const displayName = res.path.split('/').pop() || res.path
      emit('newChat', { workingDir: res.path, projectDisplayName: displayName })
    }
  } catch {
    // user cancelled or error — fall back to manual input
    if (props.collapsed) emit('toggleCollapse')
    isChoosingFolder.value = true
    nextTick(() => folderInputRef.value?.focus())
  } finally {
    isBrowsingFolder.value = false
  }
}

function confirmFolder() {
  emit('newChat', folderInput.value.trim() ? { workingDir: folderInput.value.trim() } : undefined)
  isChoosingFolder.value = false
  folderInput.value = ''
}

// Close dropdown on outside click
onMounted(() => {
  document.addEventListener('click', (e) => {
    if (newChatMenuRef.value && !newChatMenuRef.value.contains(e.target as Node)) {
      showNewChatMenu.value = false
    }
  })
})

function cancelFolderSelection() {
  isChoosingFolder.value = false
  folderInput.value = ''
}

// ── Session click ────────────────────────────────────────────────────────────

function handleSessionClick(project: typeof projects.value[0], session: InlineSession) {
  if (props.isLoadingMessages) return
  if (selectedSession.value?.id === session.id) return
  selectedSession.value = session as any
  selectedProject.value = project
  emit('sessionSelected', {
    projectName: project.name,
    sessionId: session.id,
    sessionSummary: session.summary || 'Session',
    projectDisplayName: project.displayName,
  })
}

// ── Rename / Delete ──────────────────────────────────────────────────────────

const editingSessionKey = ref<string | null>(null) // `${projectName}:${sessionId}`
const editingInput = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)
const editingProjectName = ref<string | null>(null)
const projectEditInput = ref('')
const projectEditInputRef = ref<HTMLInputElement | null>(null)

const showDeleteModal = ref(false)
const deleteType = ref<'session' | 'project'>('session')
const deleteMeta = ref<{ projectName: string; sessionId?: string; label: string } | null>(null)

function startEditSession(projectName: string, session: InlineSession, event: Event) {
  event.stopPropagation()
  editingSessionKey.value = `${projectName}:${session.id}`
  editingInput.value = session.summary || ''
  nextTick(() => {
    const el = editInputRef.value as any
    if (el) { el.focus?.(); el.select?.() }
  })
}

function saveSessionEdit(projectName: string, sessionId: string) {
  if (editingInput.value.trim()) {
    emit('sessionRenamed', { projectName, sessionId, newName: editingInput.value.trim() })
    const s = projectState[projectName]?.sessions.find(x => x.id === sessionId)
    if (s) s.summary = editingInput.value.trim()
  }
  editingSessionKey.value = null
}

function cancelSessionEdit() { editingSessionKey.value = null }

function startEditProject(project: typeof projects.value[0], event: Event) {
  event.stopPropagation()
  editingProjectName.value = project.name
  projectEditInput.value = project.displayName
  nextTick(() => {
    const el = projectEditInputRef.value as any
    if (el) { el.focus?.(); el.select?.() }
  })
}

function saveProjectEdit() {
  if (editingProjectName.value && projectEditInput.value.trim()) {
    emit('projectRenamed', { projectName: editingProjectName.value, newName: projectEditInput.value.trim() })
  }
  editingProjectName.value = null
}

function openSessionDelete(projectName: string, session: InlineSession, event: Event) {
  event.stopPropagation()
  deleteType.value = 'session'
  deleteMeta.value = { projectName, sessionId: session.id, label: session.summary || 'this session' }
  showDeleteModal.value = true
}

function openProjectDelete(project: typeof projects.value[0], event: Event) {
  event.stopPropagation()
  deleteType.value = 'project'
  deleteMeta.value = { projectName: project.name, label: project.displayName }
  showDeleteModal.value = true
}

function confirmDelete() {
  if (!deleteMeta.value) return
  if (deleteType.value === 'session' && deleteMeta.value.sessionId) {
    emit('sessionDeleted', { projectName: deleteMeta.value.projectName, sessionId: deleteMeta.value.sessionId })
    const state = projectState[deleteMeta.value.projectName]
    if (state) state.sessions = state.sessions.filter(s => s.id !== deleteMeta.value!.sessionId)
    // Remove from recent list immediately
    const deletedId = deleteMeta.value.sessionId
    recentSessions.value = recentSessions.value.filter(s => s.sessionId !== deletedId)
  } else {
    emit('projectDeleted', { projectName: deleteMeta.value.projectName })
  }
  showDeleteModal.value = false
  deleteMeta.value = null
}

function truncate(text: string, max: number) {
  return text.length <= max ? text : text.slice(0, max) + '…'
}

onMounted(async () => {
  await fetchProjects()
  await fetchOutputStyles()
})

// ── Recent sessions (cross-project feed) ─────────────────────────────────────

type SidebarView = 'projects' | 'recent'
const sidebarView = ref<SidebarView>('projects')

interface RecentSession {
  sessionId: string
  projectName: string
  projectDisplayName: string
  title: string
  timestamp: string
  messageCount: number
  toolCallCount: number
}

const recentSessions = ref<RecentSession[]>([])
const recentLoading = ref(false)

async function loadRecentSessions() {
  if (recentLoading.value) return
  recentLoading.value = true
  try {
    recentSessions.value = await $fetch<RecentSession[]>('/api/stats/recent-sessions')
  } catch {
    recentSessions.value = []
  } finally {
    recentLoading.value = false
  }
}

watch(sidebarView, (v) => {
  if (v === 'recent' && recentSessions.value.length === 0) loadRecentSessions()
})

defineExpose({ refreshProject: loadProjectSessions })
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="shrink-0 px-3 min-h-[3.5rem] border-b flex items-center gap-2 py-2" style="border-color: var(--border-subtle);">
      <template v-if="!collapsed">
        <!-- Config back button -->
        <button
          v-if="configProject"
          class="size-7 flex items-center justify-center rounded-lg hover-bg transition-all shrink-0"
          style="background: var(--surface-raised);"
          title="Back to sessions"
          @click="closeConfig"
        >
          <UIcon name="i-lucide-arrow-left" class="size-4" style="color: var(--text-secondary);" />
        </button>

        <div class="flex-1 min-w-0">
          <h3 class="text-[13px] font-semibold leading-tight" style="color: var(--text-primary); font-family: var(--font-display);">
            {{ configProject
              ? (projects.find(p => p.name === configProject)?.displayName || 'Settings')
              : 'Claude Code' }}
          </h3>
          <p v-if="configProject" class="text-[10px] truncate mt-0.5" style="color: var(--text-tertiary);">
            Project Settings
          </p>
        </div>
      </template>

      <button
        class="size-7 flex items-center justify-center rounded-lg hover-bg transition-all shrink-0"
        :class="{ 'ml-auto': !collapsed }"
        @click="emit('toggleCollapse')"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <UIcon
          :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          class="size-4"
          style="color: var(--text-secondary);"
        />
      </button>
    </div>

    <!-- Sidebar Content -->
    <template v-if="!collapsed">

      <!-- Config panel -->
      <div v-if="configProject" class="flex-1 overflow-y-auto p-3 space-y-1">

        <!-- Artifacts sub-panel -->
        <template v-if="configSubPanel === 'artifacts'">
          <button
            class="flex items-center gap-1.5 px-2 mb-3 text-[11px] hover-bg rounded py-1 transition-all"
            style="color: var(--text-tertiary);"
            @click="configSubPanel = 'menu'"
          >
            <UIcon name="i-lucide-arrow-left" class="size-3" />
            <span>Project Settings</span>
          </button>

          <div v-if="artifactsState[configProject]?.loading" class="flex justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-secondary);" />
          </div>
          <template v-else-if="artifactsState[configProject]?.loaded">
            <template v-if="getArtState(configProject).agents.length > 0">
              <div class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style="color: var(--text-disabled);">Agents</div>
              <NuxtLink
                v-for="agent in getArtState(configProject).agents"
                :key="agent.slug"
                :to="`/agents/${agent.slug}`"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover-bg group/art transition-all"
              >
                <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--accent-muted);">
                  <UIcon name="i-lucide-bot" class="size-4" style="color: var(--accent);" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] font-medium truncate" style="color: var(--text-primary);">{{ agent.frontmatter.name || agent.slug }}</div>
                  <div class="text-[10px] truncate" style="color: var(--text-tertiary);">{{ agent.frontmatter.description }}</div>
                </div>
                <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0 opacity-0 group-hover/art:opacity-60 transition-opacity" style="color: var(--text-tertiary);" />
              </NuxtLink>
            </template>
            <template v-if="getArtState(configProject).skills.length > 0">
              <div class="px-2 py-1 mt-1 text-[10px] font-semibold uppercase tracking-wider" style="color: var(--text-disabled);">Skills</div>
              <NuxtLink
                v-for="skill in getArtState(configProject).skills"
                :key="skill.slug"
                :to="`/skills/${skill.slug}`"
                class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover-bg group/art transition-all"
              >
                <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--surface-raised);">
                  <UIcon name="i-lucide-zap" class="size-4" style="color: var(--text-secondary);" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-[12px] font-medium truncate" style="color: var(--text-primary);">{{ skill.frontmatter.name || skill.slug }}</div>
                  <div class="text-[10px] truncate" style="color: var(--text-tertiary);">{{ skill.frontmatter.description }}</div>
                </div>
                <UIcon name="i-lucide-arrow-up-right" class="size-3.5 shrink-0 opacity-0 group-hover/art:opacity-60 transition-opacity" style="color: var(--text-tertiary);" />
              </NuxtLink>
            </template>
            <div
              v-if="getArtState(configProject).agents.length === 0 && getArtState(configProject).skills.length === 0"
              class="text-center py-8 space-y-2"
            >
              <UIcon name="i-lucide-package-open" class="size-8 mx-auto" style="color: var(--text-disabled);" />
              <p class="text-[12px]" style="color: var(--text-secondary);">No local agents or skills</p>
              <p class="text-[10px]" style="color: var(--text-tertiary);">Add .md files in agents/ or skills/ in this project</p>
            </div>
          </template>
        </template>

        <!-- Settings menu -->
        <template v-else>
          <div class="flex items-center gap-2 px-2 mb-3">
            <UIcon name="i-lucide-settings-2" class="size-4" style="color: var(--accent);" />
            <h4 class="text-[12px] font-bold uppercase tracking-wider" style="color: var(--text-primary);">Project Settings</h4>
          </div>
          <button
            v-for="item in [
              { panel: 'claude-md', icon: 'i-lucide-file-text', label: 'CLAUDE.md', desc: 'Project instructions' },
              { panel: 'memory-md', icon: 'i-lucide-brain', label: 'MEMORY.md', desc: 'Persistent facts' },
              { panel: 'output-style', icon: 'i-lucide-palette', label: 'Output Style', desc: selectedOutputStyleName },
              { panel: 'artifacts', icon: 'i-lucide-box', label: 'Artifacts', desc: 'Local agents & skills' },
            ]"
            :key="item.panel"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover-bg group"
            @click="item.panel === 'artifacts'
              ? (configSubPanel = 'artifacts', loadArtifacts(configProject!))
              : emit('configPanelSelected', item.panel)"
          >
            <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--surface-raised);">
              <UIcon :name="item.icon" class="size-4" style="color: var(--accent);" />
            </div>
            <div class="min-w-0">
              <div class="text-[12px] font-medium" style="color: var(--text-primary);">{{ item.label }}</div>
              <div class="text-[10px]" style="color: var(--text-tertiary);">{{ item.desc }}</div>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style="color: var(--text-tertiary);" />
          </button>
          <!-- Cleanup empty sessions -->
          <button
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover-bg group disabled:opacity-50"
            :disabled="cleaningProject"
            @click="configProject && cleanupProjectSessions(configProject)"
          >
            <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--surface-raised);">
              <UIcon :name="cleaningProject ? 'i-lucide-loader-2' : 'i-lucide-trash-2'" class="size-4" :class="{ 'animate-spin': cleaningProject }" style="color: var(--text-tertiary);" />
            </div>
            <div class="min-w-0">
              <div class="text-[12px] font-medium" style="color: var(--text-primary);">Clean Empty Sessions</div>
              <div class="text-[10px]" style="color: var(--text-tertiary);">Remove empty session files</div>
            </div>
          </button>
        </template>
      </div>

      <!-- Main projects list -->
      <template v-else>
        <!-- New Chat bar -->
        <div class="shrink-0 px-3 py-2 flex items-center gap-2">
          <template v-if="!isChoosingFolder">
            <!-- New Chat button with dropdown -->
            <div ref="newChatMenuRef" class="flex-1 relative">
              <button
                class="w-full h-8 flex items-center gap-1.5 px-2.5 rounded-lg text-[12px] font-medium transition-all"
                style="background: var(--accent-muted); color: var(--accent); border: 1px solid rgba(229,169,62,0.2);"
                @mouseenter="($event.currentTarget as HTMLElement).style.background = 'rgba(229,169,62,0.18)'"
                @mouseleave="($event.currentTarget as HTMLElement).style.background = 'var(--accent-muted)'"
                @click="openNewChatMenu"
              >
                <UIcon name="i-lucide-plus" class="size-3.5 shrink-0" />
                <span class="flex-1 text-left">New Chat</span>
                <UIcon name="i-lucide-chevron-down" class="size-3 shrink-0 transition-transform duration-150" :class="{ 'rotate-180': showNewChatMenu }" />
              </button>

              <!-- Dropdown -->
              <Transition name="dropdown">
                <div
                  v-if="showNewChatMenu"
                  class="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-xl py-1 shadow-lg"
                  style="background: var(--surface-overlay); border: 1px solid var(--border-subtle);"
                >
                  <!-- Recent projects -->
                  <div v-if="projects.length" class="px-2 pt-1 pb-0.5">
                    <span class="text-[10px] font-semibold uppercase tracking-wider px-1" style="color: var(--text-disabled);">Recent projects</span>
                  </div>
                  <button
                    v-for="project in projects.slice(0, 5)"
                    :key="project.name"
                    class="w-full flex items-center gap-2 px-3 py-2 text-left transition-all hover-bg"
                    @click="handleNewChat(project.path, project.displayName)"
                  >
                    <UIcon name="i-lucide-folder" class="size-3.5 shrink-0" style="color: var(--accent);" />
                    <span class="text-[12px] truncate" style="color: var(--text-primary);">{{ project.displayName }}</span>
                  </button>
                  <!-- Divider + Choose folder -->
                  <div class="mx-2 my-1" style="border-top: 1px solid var(--border-subtle);" />
                  <button
                    class="w-full flex items-center gap-2 px-3 py-2 text-left transition-all hover-bg disabled:opacity-50"
                    :disabled="isBrowsingFolder"
                    @click="openFolderInput"
                  >
                    <UIcon :name="isBrowsingFolder ? 'i-lucide-loader-2' : 'i-lucide-folder-plus'" class="size-3.5 shrink-0" :class="{ 'animate-spin': isBrowsingFolder }" style="color: var(--text-tertiary);" />
                    <span class="text-[12px]" style="color: var(--text-secondary);">{{ isBrowsingFolder ? 'Selecting...' : 'Choose folder...' }}</span>
                  </button>
                </div>
              </Transition>
            </div>
            <button
              class="size-8 flex items-center justify-center rounded-lg transition-all hover-bg"
              style="color: var(--text-tertiary);"
              title="Refresh"
              :disabled="isRefreshing"
              @click="handleManualRefresh"
            >
              <UIcon name="i-lucide-refresh-cw" class="size-3.5" :class="{ 'animate-spin': isRefreshing }" />
            </button>
          </template>
          <template v-else>
            <input
              ref="folderInputRef"
              v-model="folderInput"
              class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[12px] outline-none"
              style="background: var(--surface-raised); border: 1px solid var(--accent); color: var(--text-primary);"
              placeholder="Folder path..."
              @keyup.enter="confirmFolder"
              @keyup.escape="cancelFolderSelection"
            />
            <button class="h-8 px-3 flex items-center justify-center rounded-lg text-[11px] font-medium shrink-0" style="background: var(--accent-muted); color: var(--accent); border: 1px solid rgba(229,169,62,0.3);" @click="confirmFolder">Go</button>
            <button class="size-8 flex items-center justify-center rounded-lg hover-bg shrink-0" style="color: var(--text-tertiary);" @click="cancelFolderSelection">
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </template>
        </div>

        <!-- Projects / Recent tab bar -->
        <div class="shrink-0 flex px-3 pt-1 gap-1" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 0;">
          <button
            v-for="tab in (['projects', 'recent'] as const)"
            :key="tab"
            class="px-3 py-1.5 text-[11px] font-medium capitalize rounded-t-md relative transition-colors"
            :style="sidebarView === tab
              ? 'color: var(--text-primary); background: var(--surface-base);'
              : 'color: var(--text-tertiary); background: transparent;'"
            @click="sidebarView = tab"
          >
            {{ tab === 'projects' ? 'Projects' : 'Recent' }}
            <div
              v-if="sidebarView === tab"
              class="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
              style="background: var(--accent);"
            />
          </button>
        </div>

        <!-- Projects view -->
        <div v-if="sidebarView === 'projects'" class="flex-1 overflow-y-auto">
          <div v-if="isLoadingProjects" class="flex items-center justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-secondary);" />
          </div>

          <div v-else-if="projects.length === 0" class="text-center py-8 px-4">
            <UIcon name="i-lucide-folder-x" class="size-10 mx-auto mb-3" style="color: var(--text-disabled);" />
            <p class="text-[12px]" style="color: var(--text-secondary);">No projects found</p>
            <p class="text-[10px] mt-1" style="color: var(--text-tertiary);">Projects appear after using Claude Code CLI</p>
          </div>

          <!-- Project cards -->
          <div class="pt-1" />
          <div v-for="project in projects" :key="project.name" class="px-2">
            <!-- Project header -->
            <div
              class="flex items-center gap-2 px-2 py-1 rounded-lg group/proj cursor-pointer select-none hover-bg"
              @click="getProjState(project.name).expanded = !getProjState(project.name).expanded"
            >
              <!-- Folder icon + chevron overlay -->
              <div class="relative shrink-0">
                <UIcon name="i-lucide-layers" class="size-3.5" style="color: var(--text-tertiary);" />
              </div>

              <template v-if="editingProjectName === project.name">
                <input
                  ref="projectEditInputRef"
                  v-model="projectEditInput"
                  class="flex-1 min-w-0 px-1.5 py-0.5 rounded text-[12px] font-medium outline-none"
                  style="background: var(--surface-raised); border: 1px solid var(--accent); color: var(--text-primary);"
                  @keyup.enter="saveProjectEdit"
                  @keyup.escape="editingProjectName = null"
                  @click.stop
                />
                <button class="p-1 rounded shrink-0" @click.stop="saveProjectEdit">
                  <UIcon name="i-lucide-check" class="size-3" style="color: #22c55e;" />
                </button>
                <button class="p-1 rounded shrink-0" @click.stop="editingProjectName = null">
                  <UIcon name="i-lucide-x" class="size-3" style="color: var(--text-tertiary);" />
                </button>
              </template>

              <template v-else>
                <div class="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                  <span class="text-[11px] font-semibold truncate tracking-wide uppercase" style="color: var(--text-tertiary); letter-spacing: 0.04em;">{{ project.displayName }}</span>
                  <span class="text-[10px] shrink-0 tabular-nums" style="color: var(--text-disabled);">{{
                    getProjState(project.name).loading
                      ? project.sessionCount
                      : (getProjState(project.name).hasMore
                          ? `${getProjState(project.name).sessions.length}+`
                          : getProjState(project.name).sessions.length || project.sessionCount)
                  }}</span>
                </div>

                <!-- Time + actions overlay -->
                <div class="relative flex items-center shrink-0" @click.stop>
                  <span class="text-[10px] shrink-0 group-hover/proj:opacity-0 transition-opacity" style="color: var(--text-disabled);">
                    {{ formatRelativeTime(project.lastActivity) }}
                  </span>
                  <div class="absolute right-0 flex items-center gap-0 opacity-0 group-hover/proj:opacity-100 transition-opacity">
                    <button
                      class="p-1 rounded hover-bg"
                      style="color: var(--accent);"
                      title="New chat"
                      @click.stop="handleNewChat(project.path, project.displayName)"
                    >
                      <UIcon name="i-lucide-plus" class="size-3.5" />
                    </button>
                    <button
                      v-if="!project.path?.endsWith('/.claude')"
                      class="p-1 rounded hover-bg"
                      style="color: var(--text-tertiary);"
                      title="Settings"
                      @click.stop="openConfig(project.name, project.path)"
                    >
                      <UIcon name="i-lucide-settings" class="size-3.5" />
                    </button>
                    <button
                      class="p-1 rounded hover-bg"
                      style="color: var(--text-tertiary);"
                      title="Rename"
                      @click.stop="startEditProject(project, $event)"
                    >
                      <UIcon name="i-lucide-pencil" class="size-3" />
                    </button>
                    <button
                      class="p-1 rounded hover-bg"
                      style="color: var(--error, #ef4444);"
                      title="Delete"
                      @click.stop="openProjectDelete(project, $event)"
                    >
                      <UIcon name="i-lucide-trash-2" class="size-3" />
                    </button>
                  </div>
                </div>
              </template>
            </div>

            <!-- Expanded content -->
            <div v-if="getProjState(project.name).expanded" class="mt-0.5 mb-1">

              <!-- Sessions -->
              <div>
                <div v-if="getProjState(project.name).loading && getProjState(project.name).sessions.length === 0" class="flex justify-center py-3">
                  <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" style="color: var(--text-disabled);" />
                </div>

                <div
                  v-for="session in getProjState(project.name).sessionsExpanded
                    ? getProjState(project.name).sessions
                    : getProjState(project.name).sessions.slice(0, 3)"
                  :key="session.id"
                  class="relative flex items-center gap-2 pl-4 pr-2 py-2 cursor-pointer group/session rounded-lg transition-all hover-bg mb-0.5"
                  :class="props.isLoadingMessages ? 'opacity-60 pointer-events-none' : ''"
                  :style="{
                    background: (selectedSession?.id === session.id || currentSessionId === session.id) ? 'rgba(0,0,0,0.04)' : '',
                  }"
                  @click="handleSessionClick(project, session)"
                >
                  <template v-if="editingSessionKey === `${project.name}:${session.id}`">
                    <input ref="editInputRef" v-model="editingInput"
                      class="flex-1 min-w-0 px-1.5 py-0.5 rounded text-[11px] outline-none"
                      style="background: var(--surface-raised); border: 1px solid var(--accent); color: var(--text-primary);"
                      @keyup.enter="saveSessionEdit(project.name, session.id)" @keyup.escape="cancelSessionEdit" @click.stop />
                    <button class="p-0.5 rounded shrink-0" @click.stop="saveSessionEdit(project.name, session.id)">
                      <UIcon name="i-lucide-check" class="size-3" style="color: #22c55e;" />
                    </button>
                    <button class="p-0.5 rounded shrink-0" @click.stop="cancelSessionEdit">
                      <UIcon name="i-lucide-x" class="size-3" style="color: var(--text-tertiary);" />
                    </button>
                  </template>
                  <template v-else>
                    <div class="flex-1 min-w-0">
                      <div class="text-[12px] font-medium truncate" style="color: var(--text-primary);">{{ session.summary || 'Session' }}</div>
                    </div>
                    <div class="relative flex items-center shrink-0">
                      <div class="flex items-center gap-1.5 group-hover/session:opacity-0 transition-opacity">
                        <div v-if="isSessionLive(session.lastActivity)" class="size-1.5 rounded-full animate-pulse shrink-0" style="background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5);" />
                        <span class="text-[10px] shrink-0" style="color: var(--text-disabled);">{{ formatRelativeTime(session.lastActivity) }}</span>
                      </div>
                      <div class="absolute right-0 flex items-center gap-0.5 opacity-0 group-hover/session:opacity-100 transition-opacity">
                        <button class="p-1 rounded hover-bg" @click.stop="startEditSession(project.name, session, $event)">
                          <UIcon name="i-lucide-pencil" class="size-3" style="color: var(--text-tertiary);" />
                        </button>
                        <button class="p-1 rounded hover-bg" @click.stop="openSessionDelete(project.name, session, $event)">
                          <UIcon name="i-lucide-trash-2" class="size-3" style="color: var(--error);" />
                        </button>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- Show more / collapse -->
                <template v-if="!getProjState(project.name).loading">
                  <button
                    v-if="!getProjState(project.name).sessionsExpanded && getProjState(project.name).sessions.length > 3"
                    class="w-full pl-4 pr-2 py-1.5 text-left text-[11px] hover-bg rounded-lg flex items-center gap-1.5"
                    style="color: var(--text-tertiary);"
                    @click.stop="getProjState(project.name).sessionsExpanded = true"
                  >
                    <UIcon name="i-lucide-chevron-down" class="size-3" />
                    <span>{{ getProjState(project.name).sessions.length - 3 }} more sessions</span>
                  </button>

                  <template v-else-if="getProjState(project.name).sessionsExpanded">
                    <button
                      v-if="getProjState(project.name).hasMore"
                      class="w-full pl-4 pr-2 py-1.5 text-left text-[11px] hover-bg rounded-lg"
                      style="color: var(--text-tertiary);"
                      @click.stop="loadMoreProjectSessions(project.name)"
                    >Load more…</button>
                    <button
                      v-if="getProjState(project.name).sessions.length > 3"
                      class="w-full pl-4 pr-2 py-1.5 text-left text-[11px] hover-bg rounded-r-lg flex items-center gap-1.5"
                      style="color: var(--text-tertiary); width: calc(100% - 16px);"
                      @click.stop="getProjState(project.name).sessionsExpanded = false"
                    >
                      <UIcon name="i-lucide-chevron-up" class="size-3" />
                      <span>Show less</span>
                    </button>
                  </template>
                </template>

                <div v-if="!getProjState(project.name).loading && getProjState(project.name).sessions.length === 0"
                  class="pl-4 py-2 text-[11px]" style="color: var(--text-disabled);">No sessions yet</div>
              </div>

              <!-- Spacing between projects -->
              <div class="h-2" />
            </div>
          </div>
        </div>

        <!-- Recent sessions view -->
        <div v-else-if="sidebarView === 'recent'" class="flex-1 overflow-y-auto">
          <div v-if="recentLoading" class="flex items-center justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-secondary);" />
          </div>
          <div v-else-if="recentSessions.length === 0" class="text-center py-8 px-4">
            <UIcon name="i-lucide-history" class="size-8 mx-auto mb-3" style="color: var(--text-disabled);" />
            <p class="text-[12px]" style="color: var(--text-secondary);">No sessions yet</p>
          </div>
          <div v-else class="px-2 pt-1 pb-2">
            <div
              v-for="s in recentSessions"
              :key="s.sessionId"
              class="relative flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer group/session transition-all hover-bg mb-0.5"
              :style="{
                background: currentSessionId === s.sessionId ? 'rgba(0,0,0,0.04)' : '',
              }"
              @click="emit('sessionSelected', {
                projectName: s.projectName,
                sessionId: s.sessionId,
                sessionSummary: s.title,
                projectDisplayName: s.projectDisplayName,
              })"
            >
              <div class="flex-1 min-w-0">
                <div class="text-[12px] font-medium truncate" style="color: var(--text-primary);">{{ s.title || 'Session' }}</div>
                <div class="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                  <div class="flex items-center gap-1 min-w-0">
                    <span
                      class="text-[10px] px-1.5 py-px rounded font-mono truncate max-w-[7rem] shrink"
                      style="background: var(--surface-raised); color: var(--text-disabled);"
                    >{{ s.projectDisplayName }}</span>
                    <span class="text-[10px] shrink-0" style="color: var(--text-disabled);">{{ s.messageCount }}</span>
                  </div>
                  <span class="text-[10px] shrink-0" style="color: var(--text-disabled);">{{ formatRelativeTime(s.timestamp) }}</span>
                </div>
              </div>
              <div class="relative flex items-center shrink-0">
                <div class="flex items-center gap-0.5 opacity-0 group-hover/session:opacity-100 transition-opacity">
                  <button class="p-1 rounded hover-bg" @click.stop="emit('sessionSelected', { projectName: s.projectName, sessionId: s.sessionId, sessionSummary: s.title, projectDisplayName: s.projectDisplayName })">
                    <UIcon name="i-lucide-arrow-up-right" class="size-3" style="color: var(--text-tertiary);" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </template>
    </template>

    <!-- Collapsed state -->
    <template v-else>
      <div class="flex-1 flex flex-col items-center gap-2 pt-3">
        <button
          class="size-8 flex items-center justify-center rounded-lg transition-all"
          style="background: var(--accent-muted); color: var(--accent); border: 1px solid rgba(229,169,62,0.3);"
          title="New Chat"
          @click="() => { emit('toggleCollapse'); nextTick(() => { showNewChatMenu = true }) }"
        >
          <UIcon name="i-lucide-plus" class="size-4" />
        </button>
        <button
          class="size-8 flex items-center justify-center rounded-lg transition-all hover-bg"
          style="background: var(--surface-raised);"
          title="View sessions"
          @click="() => {
            if (selectedProject) getProjState(selectedProject.name).expanded = true
            emit('toggleCollapse')
          }"
        >
          <UIcon name="i-lucide-history" class="size-4" style="color: var(--text-secondary);" />
        </button>
      </div>
    </template>

    <!-- Delete Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteModal"
          class="fixed inset-0 flex items-center justify-center z-[100] modal-backdrop"
          @click.self="showDeleteModal = false"
        >
          <div class="modal-card modal-content" role="dialog" aria-modal="true">
            <!-- Icon + Header -->
            <div class="modal-header">
              <div class="modal-icon-wrap">
                <UIcon name="i-lucide-trash-2" class="size-[18px] text-red-400" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="modal-title">
                  Delete {{ deleteType === 'session' ? 'Session' : 'Project' }}
                </h3>
                <p class="modal-subtitle">This action cannot be undone</p>
              </div>
              <button class="modal-close" @click="showDeleteModal = false" aria-label="Close">
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </div>

            <!-- Divider -->
            <div class="modal-divider" />

            <!-- Body -->
            <div class="modal-body">
              <p class="modal-description">
                You're about to permanently delete
                <span class="modal-target">"{{ truncate(deleteMeta?.label || '', 50) }}"</span>.
                <template v-if="deleteType === 'project'">
                  All chat history in this folder will be removed.
                </template>
              </p>
            </div>

            <!-- Footer -->
            <div class="modal-footer">
              <button class="btn-cancel" @click="showDeleteModal = false">Cancel</button>
              <button class="btn-delete" @click="confirmDelete">
                <UIcon name="i-lucide-trash-2" class="size-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── Modal backdrop & transition ─────────────────────────────── */
.modal-backdrop {
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.modal-enter-active,
.modal-leave-active { transition: opacity 0.22s ease; }
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-active .modal-content { animation: modal-spring 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }
.modal-leave-active .modal-content { animation: modal-spring 0.18s cubic-bezier(0.55, 0, 1, 0.45) reverse both; }
@keyframes modal-spring {
  from { opacity: 0; transform: scale(0.92) translateY(12px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

/* ── Card shell ──────────────────────────────────────────────── */
.modal-card {
  width: 380px;
  border-radius: 18px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-overlay);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04) inset,
    0 8px 32px rgba(0,0,0,0.35),
    0 2px 8px rgba(0,0,0,0.2);
  overflow: hidden;
  position: relative;
  z-index: 101;
}

/* ── Header ──────────────────────────────────────────────────── */
.modal-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 20px 20px 0;
}
.modal-icon-wrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
  margin: 0;
}
.modal-subtitle {
  font-size: 11px;
  color: var(--text-tertiary, var(--text-secondary));
  margin: 2px 0 0;
  letter-spacing: 0.01em;
}
.modal-close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: background 0.15s, color 0.15s;
  margin-left: auto;
}
.modal-close:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

/* ── Divider ─────────────────────────────────────────────────── */
.modal-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 16px 0 0;
  opacity: 0.6;
}

/* ── Body ────────────────────────────────────────────────────── */
.modal-body {
  padding: 16px 20px;
}
.modal-description {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
  margin: 0;
}
.modal-target {
  font-weight: 500;
  color: var(--text-primary);
  word-break: break-all;
}

/* ── Footer ──────────────────────────────────────────────────── */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 18px;
  background: var(--surface-raised, rgba(0,0,0,0.08));
  border-top: 1px solid var(--border-subtle);
}
.btn-cancel {
  height: 32px;
  padding: 0 14px;
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-subtle);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  cursor: pointer;
}
.btn-cancel:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
  border-color: var(--border-default, var(--border-subtle));
}
.btn-delete {
  height: 32px;
  padding: 0 14px;
  border-radius: 9px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: #e53e3e;
  border: 1px solid rgba(255,255,255,0.12);
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(229, 62, 62, 0.4);
}
.btn-delete:hover {
  background: #c53030;
  box-shadow: 0 2px 8px rgba(229, 62, 62, 0.5);
}
.btn-delete:active {
  transform: scale(0.97);
}

/* ── Dropdown transition ─────────────────────────────────────── */
.dropdown-enter-active { transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1); }
.dropdown-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-4px) scale(0.97); }
</style>
