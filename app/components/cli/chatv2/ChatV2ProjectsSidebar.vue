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

function ensureProjectState(name: string) {
  if (!projectState[name]) {
    projectState[name] = { sessions: [], loading: false, hasMore: false, expanded: true, sessionsExpanded: false, tab: 'sessions' }
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
  } catch {
    state.sessions = []
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
    ensureProjectState(p.name)
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

function handleNewChat(workingDir?: string, displayName?: string) {
  if (workingDir) {
    emit('newChat', { workingDir, projectDisplayName: displayName })
  } else {
    if (props.collapsed) emit('toggleCollapse')
    isChoosingFolder.value = true
    nextTick(() => folderInputRef.value?.focus())
  }
}

function confirmFolder() {
  emit('newChat', folderInput.value.trim() ? { workingDir: folderInput.value.trim() } : undefined)
  isChoosingFolder.value = false
  folderInput.value = ''
}

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
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="shrink-0 px-3 min-h-[3.5rem] border-b flex items-center gap-2 py-2" style="border-color: var(--border-subtle);">
      <template v-if="!collapsed">
        <!-- Config back button -->
        <button
          v-if="configProject"
          class="p-1.5 rounded-lg hover-bg transition-all shrink-0"
          style="background: var(--surface-raised);"
          title="Back to sessions"
          @click="closeConfig"
        >
          <UIcon name="i-lucide-arrow-left" class="size-4" style="color: var(--text-secondary);" />
        </button>

        <div class="flex-1 min-w-0">
          <h3 class="text-[13px] font-semibold leading-tight" style="color: var(--text-primary);">
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
        class="p-1.5 rounded-lg hover-bg transition-all shrink-0"
        :class="{ 'ml-auto': !collapsed }"
        style="background: var(--surface-raised);"
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
        </template>
      </div>

      <!-- Main projects list -->
      <template v-else>
        <!-- New Chat bar -->
        <div class="shrink-0 px-3 py-2 border-b flex items-center gap-2" style="border-color: var(--border-subtle);">
          <template v-if="!isChoosingFolder">
            <button
              class="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style="background: var(--accent-muted); color: var(--accent); border: 1px solid rgba(229,169,62,0.2);"
              @mouseenter="($event.currentTarget as HTMLElement).style.background = 'rgba(229,169,62,0.18)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.background = 'var(--accent-muted)'"
              @click="handleNewChat()"
            >
              <UIcon name="i-lucide-plus" class="size-3.5 shrink-0" />
              <span>New Chat</span>
            </button>
            <button
              class="p-1.5 rounded-lg transition-all hover-bg"
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
            <button class="px-2 py-1.5 rounded-lg text-[11px] font-medium shrink-0" style="background: var(--accent); color: white;" @click="confirmFolder">Go</button>
            <button class="p-1.5 rounded-lg hover-bg shrink-0" style="color: var(--text-tertiary);" @click="cancelFolderSelection">
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </template>
        </div>

        <!-- Projects -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="isLoadingProjects" class="flex items-center justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-secondary);" />
          </div>

          <div v-else-if="projects.length === 0" class="text-center py-8 px-4">
            <UIcon name="i-lucide-folder-x" class="size-10 mx-auto mb-3" style="color: var(--text-disabled);" />
            <p class="text-[12px]" style="color: var(--text-secondary);">No projects found</p>
            <p class="text-[10px] mt-1" style="color: var(--text-tertiary);">Projects appear after using Claude Code CLI</p>
          </div>

          <!-- Project cards -->
          <div v-for="project in projects" :key="project.name" class="px-2 pt-1">
            <!-- Project header -->
            <div
              class="flex items-center gap-2 px-2 py-2 rounded-lg group/proj cursor-pointer select-none hover-bg"
              @click="getProjState(project.name).expanded = !getProjState(project.name).expanded"
            >
              <!-- Folder icon + chevron overlay -->
              <div class="relative shrink-0">
                <UIcon name="i-lucide-folder" class="size-3.5" style="color: var(--accent);" />
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
                <!-- Project name + count + time — single row -->
                <div class="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                  <span class="text-[12px] font-medium truncate" style="color: var(--text-primary);">{{ project.displayName }}</span>
                  <span class="text-[10px] shrink-0 tabular-nums" style="color: var(--text-disabled);">{{
                    getProjState(project.name).loading
                      ? project.sessionCount
                      : (getProjState(project.name).hasMore
                          ? `${getProjState(project.name).sessions.length}+`
                          : getProjState(project.name).sessions.length || project.sessionCount)
                  }}</span>
                  <span class="text-[10px] shrink-0 ml-auto group-hover/proj:opacity-0 transition-opacity" style="color: var(--text-disabled);">
                    {{ formatRelativeTime(project.lastActivity) }}
                  </span>
                </div>

                <!-- Actions: fade in on hover, positioned over the time text -->
                <div class="flex items-center gap-0 opacity-0 group-hover/proj:opacity-100 transition-opacity shrink-0" @click.stop>
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
              </template>
            </div>

            <!-- Expanded content -->
            <div v-if="getProjState(project.name).expanded" class="mb-1">

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
                  class="relative flex items-center gap-2 pl-4 pr-2 py-2 cursor-pointer group/session rounded-r-lg"
                  :class="props.isLoadingMessages ? 'opacity-60 pointer-events-none' : 'hover-bg'"
                  :style="{
                    background: (selectedSession?.id === session.id || currentSessionId === session.id) ? 'var(--accent-light)' : '',
                    borderLeft: (selectedSession?.id === session.id || currentSessionId === session.id) ? '3px solid var(--accent)' : '3px solid transparent',
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
                      <div class="text-[10px] mt-0.5" style="color: var(--text-tertiary);">{{ session.messageCount }} msgs · {{ formatRelativeTime(session.lastActivity) }}</div>
                    </div>
                    <div class="relative flex items-center shrink-0">
                      <div v-if="isSessionLive(session.lastActivity)" class="absolute inset-0 flex items-center justify-center group-hover/session:opacity-0 transition-opacity pointer-events-none">
                        <div class="size-1.5 rounded-full animate-pulse" style="background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5);" />
                      </div>
                      <div class="flex items-center gap-0.5 opacity-0 group-hover/session:opacity-100 transition-opacity">
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
                    class="w-full pl-4 pr-2 py-1.5 text-left text-[11px] hover-bg rounded-r-lg flex items-center gap-1.5"
                    style="color: var(--text-tertiary); width: calc(100% - 16px);"
                    @click.stop="getProjState(project.name).sessionsExpanded = true"
                  >
                    <UIcon name="i-lucide-chevron-down" class="size-3" />
                    <span>{{ getProjState(project.name).sessions.length - 3 }} more sessions</span>
                  </button>

                  <template v-else-if="getProjState(project.name).sessionsExpanded">
                    <button
                      v-if="getProjState(project.name).hasMore"
                      class="w-full pl-4 pr-2 py-1.5 text-left text-[11px] hover-bg rounded-r-lg"
                      style="color: var(--text-tertiary); width: calc(100% - 16px);"
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
      </template>
    </template>

    <!-- Collapsed state -->
    <template v-else>
      <div class="flex-1 flex flex-col items-center gap-2 pt-3">
        <button
          class="p-2 rounded-lg transition-all"
          style="background: var(--accent);"
          title="New Chat"
          @click="handleNewChat()"
        >
          <UIcon name="i-lucide-plus" class="size-4" style="color: white;" />
        </button>
        <button
          class="p-2 rounded-lg transition-all hover-bg"
          style="background: var(--surface-raised);"
          title="Claude Code History"
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
          class="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100]"
          @click.self="showDeleteModal = false"
        >
          <div class="w-[400px] p-6 rounded-2xl shadow-2xl border modal-content" style="background: var(--surface-overlay); border-color: var(--border-subtle); position: relative; z-index: 101;">
            <div class="flex items-center gap-3 mb-4">
              <div class="p-2 rounded-full bg-red-500/10">
                <UIcon name="i-lucide-alert-triangle" class="size-5 text-red-500" />
              </div>
              <h3 class="text-[16px] font-bold" style="color: var(--text-primary);">
                Delete {{ deleteType === 'session' ? 'Session' : 'Project' }}
              </h3>
            </div>
            <p class="text-[13px] leading-relaxed mb-6" style="color: var(--text-secondary);">
              Are you sure you want to delete <span class="font-medium" style="color: var(--text-primary);">"{{ truncate(deleteMeta?.label || '', 60) }}"</span>?
              <template v-if="deleteType === 'project'"> This will permanently delete all chat history for this folder.</template>
              <template v-else> This action cannot be undone.</template>
            </p>
            <div class="flex items-center justify-end gap-3">
              <button
                class="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all"
                style="background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);"
                @click="showDeleteModal = false"
              >Cancel</button>
              <button
                class="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all"
                style="background: var(--error); color: white;"
                @click="confirmDelete"
              >Delete</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .modal-content { animation: modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.modal-leave-active .modal-content { animation: modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) reverse; }
@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}
</style>
