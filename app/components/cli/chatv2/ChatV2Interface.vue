<script setup lang="ts">
import { useChatV2Handler } from '~/composables/useChatV2Handler'
import { useClaudeCodeHistory } from '~/composables/useClaudeCodeHistory'
import { convertToDisplayMessages } from '~/utils/chatMessageConverter'
import { convertClaudeCodeMessages } from '~/utils/claudeCodeMessageConverter'
import type { DisplayChatMessage, PermissionMode } from '~/types'
import { MODEL_OPTIONS_CHAT, DEFAULT_MODEL } from '~/utils/models'
import ChatV2TerminalPane from '~/components/cli/chatv2/ChatV2TerminalPane.vue'

const props = defineProps<{
  executionOptions: {
    workingDir?: string
  }
}>()

// Toast for notifications
const toast = useToast()

// Route for URL-based session navigation
const route = useRoute()

// Chat v2 handler with integrated streaming, permissions, and session store
const {
  isConnected,
  error,
  currentSessionId,
  sessionCreatedWorkingDir,
  isStreaming,
  streamingText,
  permissions,
  hasPendingPermissions,
  connect,
  disconnect,
  sendChat,
  abort,
  respondToPermission,
  respondToPrompt,
  sessionStore,
  setCurrentSessionId,
  contextMonitor,
} = useChatV2Handler()

// Claude Code history
const history = useClaudeCodeHistory()
const {
  messages: claudeCodeMessages,
  isLoadingMessages: isLoadingClaudeCodeMessages,
  messagesHasMore: claudeCodeMessagesHasMore,
  fetchMessages: fetchClaudeCodeMessages,
  silentSyncMessages,
  renameSession,
  deleteSession
} = history

// Handle project renamed
async function handleProjectRenamed(payload: { projectName: string; newName: string }) {
  console.log('[ChatV2] Project renaming:', payload)
  try {
    await history.renameProject(payload.projectName, payload.newName)

    // Update local state if this is the current project
    if (urlProjectName.value === payload.projectName) {
      currentProjectDisplayName.value = payload.newName
    }

    toast.add({
      title: 'Project renamed',
      color: 'success',
      duration: 1000
    })
  } catch (e: any) {
    console.error('[ChatV2] Failed to rename project:', e)
    toast.add({
      title: 'Failed to rename project',
      description: e.data?.message || e.message,
      color: 'error'
    })
  }
}

// Handle project deleted
async function handleProjectDeleted(payload: { projectName: string }) {
  console.log('[ChatV2] Project deleting:', payload)
  try {
    await history.deleteProject(payload.projectName)

    // If the deleted project is currently selected, clear selection
    if (urlProjectName.value === payload.projectName) {
      handleSelectionCleared()
    }

    toast.add({
      title: 'Project history deleted',
      color: 'success',
      duration: 1000
    })
  } catch (e: any) {
    console.error('[ChatV2] Failed to delete project:', e)
    toast.add({
      title: 'Failed to delete project',
      description: e.data?.message || e.message,
      color: 'error'
    })
  }
}

// Session list
const sessions = ref<any[]>([])
const isLoadingSessions = ref(false)

// UI state
const inputText = ref('')
const messagesContainerRef = ref<HTMLElement | null>(null)
const terminalPaneRef = ref<InstanceType<typeof ChatV2TerminalPane> | null>(null)
const sidebarCollapsed = ref(false)
const sidebarRef = ref<{ refreshProject: (projectName: string) => Promise<void> } | null>(null)
const mobileSidebarOpen = ref(false)
const showRightSidebar = ref(false)
const activeRightTab = ref<'context' | 'explorer' | 'git' | 'preview'>('context')
const isCreatingSession = ref(false)
const isInputFocused = ref(false)

// Panel split: left tree width, draggable
const panelTreeWidth = ref(220)
const isDraggingPanelTree = ref(false)
const panelTreeDragStartX = ref(0)
const panelTreeDragStartWidth = ref(0)

// Currently open file in panel (explorer/git split view)
const panelOpenFile = ref<{ path: string; kind: 'file' | 'diff'; staged?: boolean } | null>(null)
const panelDiffResult = ref<any | null>(null)
const panelDiffPending = ref(false)
const panelFileContent = ref<string | null>(null)
const panelFileLoading = ref(false)

function onPanelTreeDragStart(e: MouseEvent) {
  isDraggingPanelTree.value = true
  panelTreeDragStartX.value = e.clientX
  panelTreeDragStartWidth.value = panelTreeWidth.value
  document.addEventListener('mousemove', onPanelTreeDragMove)
  document.addEventListener('mouseup', onPanelTreeDragEnd)
  e.preventDefault()
}
function onPanelTreeDragMove(e: MouseEvent) {
  if (!isDraggingPanelTree.value) return
  const delta = e.clientX - panelTreeDragStartX.value
  panelTreeWidth.value = Math.min(380, Math.max(140, panelTreeDragStartWidth.value + delta))
}
function onPanelTreeDragEnd() {
  isDraggingPanelTree.value = false
  document.removeEventListener('mousemove', onPanelTreeDragMove)
  document.removeEventListener('mouseup', onPanelTreeDragEnd)
}

async function openPanelFile(filePath: string) {
  panelOpenFile.value = { path: filePath, kind: 'file' }
  panelDiffResult.value = null
  panelFileContent.value = null
  panelFileLoading.value = true
  try {
    const data = await $fetch<{ content: string }>('/api/files', {
      query: { path: filePath }
    })
    panelFileContent.value = data.content
  } catch {
    panelFileContent.value = null
  } finally {
    panelFileLoading.value = false
  }
}

async function openPanelDiff(filePath: string, staged: boolean) {
  const projectName = urlProjectName.value || localWorkingDir.value
  if (!projectName) return
  panelOpenFile.value = { path: filePath, kind: 'diff', staged }
  panelDiffResult.value = null
  panelDiffPending.value = true
  try {
    const result = await $fetch<any>(
      `/api/projects/${encodeURIComponent(projectName)}/git/diff`,
      { query: { file: filePath, staged: String(staged) } }
    )
    panelDiffResult.value = result
    gitPanelRef.value?.cacheDiff(result, staged)
  } catch {
    panelDiffResult.value = { file: filePath, hunks: [], addCount: 0, removeCount: 0, error: 'Failed to load diff' }
  } finally {
    panelDiffPending.value = false
  }
}

// Context details sidebar drag-to-resize
const contextSidebarWidth = ref(680)
const isDraggingContextSidebar = ref(false)
const dragStartX = ref(0)
const dragStartWidth = ref(0)

function onContextSidebarDragStart(e: MouseEvent) {
  if (isMobileScreen.value) return
  isDraggingContextSidebar.value = true
  dragStartX.value = e.clientX
  dragStartWidth.value = contextSidebarWidth.value
  document.body.classList.add('dragging-context-sidebar')
  document.addEventListener('mousemove', onContextSidebarDragMove)
  document.addEventListener('mouseup', onContextSidebarDragEnd)
  e.preventDefault()
}

function onContextSidebarDragMove(e: MouseEvent) {
  if (!isDraggingContextSidebar.value) return
  const delta = dragStartX.value - e.clientX
  contextSidebarWidth.value = Math.min(800, Math.max(300, dragStartWidth.value + delta))
}

function onContextSidebarDragEnd() {
  isDraggingContextSidebar.value = false
  document.body.classList.remove('dragging-context-sidebar')
  document.removeEventListener('mousemove', onContextSidebarDragMove)
  document.removeEventListener('mouseup', onContextSidebarDragEnd)
}

function openRightTab(tab: 'context' | 'explorer' | 'git' | 'preview') {
  activeRightTab.value = tab
  showRightSidebar.value = true
}

// Responsive sidebar width based on window size
const windowWidth = ref(1200)
const isSmallScreen = computed(() => windowWidth.value < 1024)
const isMobileScreen = computed(() => windowWidth.value < 768)
const isHeaderTwoRow = computed(() => false)

function updateWidth() {
  if (typeof window !== 'undefined') {
    windowWidth.value = window.innerWidth
  }
}

onMounted(async () => {
  // Set the correct width only after mounting on the client to avoid hydration mismatch
  leftSidebarWidth.value = getDefaultSidebarWidth()
  updateWidth()
  window.addEventListener('resize', updateWidth)
  document.addEventListener('click', handleEffortClickOutside)
  
  // Fetch sessions on mount
  await fetchSessions()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateWidth)
  document.removeEventListener('mousemove', onContextSidebarDragMove)
  document.removeEventListener('mouseup', onContextSidebarDragEnd)
  document.removeEventListener('mousemove', onLeftSidebarDragMove)
  document.removeEventListener('mouseup', onLeftSidebarDragEnd)
  document.removeEventListener('mousemove', onPanelTreeDragMove)
  document.removeEventListener('mouseup', onPanelTreeDragEnd)
  document.removeEventListener('click', handleEffortClickOutside)
})

watch(isMobileScreen, (isMobile) => {
  if (!isMobile) {
    mobileSidebarOpen.value = false
    sidebarCollapsed.value = false
  }
})

function getDefaultSidebarWidth() {
  if (typeof window === 'undefined') return 320
  if (window.innerWidth < 1024) return 220
  if (window.innerWidth < 1280) return 260
  return 320
}
// Initialize with a stable value to avoid hydration mismatch
const leftSidebarWidth = ref(320)

const sidebarWidth = computed(() =>
  sidebarCollapsed.value ? '56px' : `${leftSidebarWidth.value}px`
)

// Left sidebar drag-to-resize
const isDraggingLeftSidebar = ref(false)
const leftDragStartX = ref(0)
const leftDragStartWidth = ref(0)

function onLeftSidebarDragStart(e: MouseEvent) {
  if (sidebarCollapsed.value) return
  isDraggingLeftSidebar.value = true
  leftDragStartX.value = e.clientX
  leftDragStartWidth.value = leftSidebarWidth.value
  document.body.classList.add('dragging-left-sidebar')
  document.addEventListener('mousemove', onLeftSidebarDragMove)
  document.addEventListener('mouseup', onLeftSidebarDragEnd)
  e.preventDefault()
}

function onLeftSidebarDragMove(e: MouseEvent) {
  if (!isDraggingLeftSidebar.value) return
  const delta = e.clientX - leftDragStartX.value
  leftSidebarWidth.value = Math.min(480, Math.max(160, leftDragStartWidth.value + delta))
}

function onLeftSidebarDragEnd() {
  isDraggingLeftSidebar.value = false
  document.body.classList.remove('dragging-left-sidebar')
  document.removeEventListener('mousemove', onLeftSidebarDragMove)
  document.removeEventListener('mouseup', onLeftSidebarDragEnd)
}

// Track the working directory for the current session (defaults to prop)
const localWorkingDir = ref(props.executionOptions.workingDir || '')

// Watch prop changes and update local state if not in a session
watch(() => props.executionOptions.workingDir, (newDir) => {
  if (!currentSessionId.value && newDir) {
    localWorkingDir.value = newDir
  }
})

// View mode: 'live' (new chat) or 'history' (viewing Claude Code history)
const viewMode = ref<'live' | 'history'>('live')

// Track if we've explicitly started a "New Chat" session
const isLiveChat = ref(false)

// Track if we're continuing a history session (showing history + new messages)
const isContinuingHistory = ref(false)

// Local loading state with minimum duration for smooth UX
const isLoadingHistoryWithDelay = ref(false)
const isInitialScroll = ref(false)

// URL state for history sessions
const urlProjectName = ref<string | null>(null)
const urlSessionId = ref<string | null>(null)

// Live sync: poll messages every 3s when viewing a history session from the terminal
const syncTimer = ref<ReturnType<typeof setInterval> | null>(null)

function startSessionSync() {
  stopSessionSync()
  syncTimer.value = setInterval(async () => {
    if (viewMode.value !== 'history' || !urlSessionId.value || !urlProjectName.value) return
    if (isStreaming.value) return
    const prevCount = claudeCodeMessages.value.length
    await silentSyncMessages(urlProjectName.value, urlSessionId.value)
    if (claudeCodeMessages.value.length > prevCount) {
      const session = history.sessions.value.find(s => s.id === urlSessionId.value)
      if (session) session.lastActivity = new Date().toISOString()
    }
  }, 3000)
}

function stopSessionSync() {
  if (syncTimer.value) {
    clearInterval(syncTimer.value)
    syncTimer.value = null
  }
}

watch([() => urlSessionId.value, () => viewMode.value], ([sessionId, mode]) => {
  if (sessionId && mode === 'history') {
    startSessionSync()
  } else {
    stopSessionSync()
  }
}, { immediate: true })

onUnmounted(() => {
  stopSessionSync()
})

// Session info for header display
const currentSessionSummary = ref<string>('')
const currentProjectDisplayName = ref<string>('')

// Permission mode selector
const permissionModeOptions: { value: PermissionMode; label: string; description: string }[] = [
  { value: 'default',            label: 'Ask',          description: 'Confirm each tool use before running' },
  { value: 'acceptEdits',        label: 'Auto Edit',    description: 'File edits auto-approved, others ask' },
  { value: 'bypassPermissions',  label: 'Auto',         description: 'All actions run without confirmation' },
  { value: 'plan',               label: 'Plan',         description: 'Plan only, no tools executed' },
]

const selectedPermissionMode = ref<PermissionMode>('default')

// Model selector — options and default come from the shared model registry
const selectedModel = ref<string>(DEFAULT_MODEL)

// Output style selector
const selectedOutputStyleId = ref<string>('')

// Sync model selection with historical session if available
watch(() => history.selectedSession.value, (newSession) => {
  if (newSession?.model) {
    selectedModel.value = newSession.model
  }
}, { immediate: true, deep: true })

// Effort level selector
type EffortLevel = 'low' | 'medium' | 'high' | 'max'
const effortLevel = ref<EffortLevel>('high')
const showEffortMenu = ref(false)

const effortOptions: { value: EffortLevel; label: string; icon: string; description: string; color: string }[] = [
  { value: 'max', label: 'Max', icon: 'i-lucide-flame', description: 'Deepest reasoning, no constraints', color: '#ef4444' },
  { value: 'high', label: 'High', icon: 'i-lucide-brain', description: 'Complex reasoning (default)', color: '#8b5cf6' },
  { value: 'medium', label: 'Medium', icon: 'i-lucide-gauge', description: 'Balanced speed & quality', color: '#f59e0b' },
  { value: 'low', label: 'Low', icon: 'i-lucide-zap', description: 'Fastest, most efficient', color: '#22c55e' },
]

const currentEffort = computed(() => effortOptions.find(o => o.value === effortLevel.value)!)
const effortMenuRef = ref<HTMLElement | null>(null)

// Max turns selector
const maxTurns = ref<number | null>(10)
const maxTurnsOptions: { value: number | null; label: string; description: string }[] = [
  { value: null,  label: '∞',   description: 'No limit' },
  { value: 5,    label: '5',   description: 'Quick tasks' },
  { value: 10,   label: '10',  description: 'Default' },
  { value: 20,   label: '20',  description: 'Extended tasks' },
  { value: 50,   label: '50',  description: 'Long running' },
]

const contextUsageColorHex = computed(() => {
  const c = contextMonitor.contextUsageColor.value
  if (c === 'red') return '#ef4444'
  if (c === 'orange') return '#f97316'
  if (c === 'yellow') return '#eab308'
  return '#22c55e'
})

function handleEffortClickOutside(e: MouseEvent) {
  if (effortMenuRef.value && !effortMenuRef.value.contains(e.target as Node)) {
    showEffortMenu.value = false
  }
}

// Selected project path (from history selection or working dir)
const selectedProjectPath = computed(() => {
  return history.selectedProject.value?.path || localWorkingDir.value || null
})

// ── Config Panel (rendered in main content area) ──
const activeConfigPanel = ref<string | null>(null)

// Whether we're on the settings route (controls main panel view)
const isOnSettingsRoute = ref(false)

function handleSettingsToggled(open: boolean) {
  if (open) {
    isOnSettingsRoute.value = true
    activeConfigPanel.value = null // Start on landing page
    if (urlProjectName.value) {
      const targetPath = `/cli/project/${encodeURIComponent(urlProjectName.value)}/settings`
      if (route.path !== targetPath) {
        navigateTo(targetPath, { replace: false })
      }
    }
  } else {
    isOnSettingsRoute.value = false
    activeConfigPanel.value = null
    if (urlProjectName.value) {
      const targetPath = `/cli/project/${encodeURIComponent(urlProjectName.value)}`
      if (route.path !== targetPath) {
        navigateTo(targetPath, { replace: false })
      }
    }
  }
}

function handleConfigPanelSelected(panel: string) {
  activeConfigPanel.value = panel
  if (panel === 'claude-md') {
    fetchClaudeMd()
  } else if (panel === 'memory-md') {
    fetchMemoryMd()
  } else if (panel === 'output-style') {
    fetchOutputStyles()
    fetchConfigDirSettings()
  }
}

function closeConfigPanel() {
  activeConfigPanel.value = null
}

// Output styles for config panel
const { styles: configOutputStyles, fetchStyles: fetchOutputStyles } = useOutputStyles()
const selectedOutputStyleId2 = useState('chat-active-output-style-id', () => 'default')
const selectedOutputStyleName = computed(() => {
  const style = configOutputStyles.value.find(s => s.id === selectedOutputStyleId2.value)
  return style ? style.name : 'Default'
})

// CLAUDE.md state
const claudeMdExists = ref(false)
const claudeMdContent = ref('')
const claudeMdDraft = ref('')
const claudeMdEditing = ref(false)
const isLoadingClaudeMd = ref(false)
const isSavingClaudeMd = ref(false)

// MEMORY.md state
const memoryMdExists = ref(false)
const memoryMdContent = ref('')
const memoryMdDraft = ref('')
const isLoadingMemoryMd = ref(false)
const isSavingMemoryMd = ref(false)

// Project settings for output style
const configDirSettings = ref<any>({})
const isSavingConfigSettings = ref(false)

async function fetchClaudeMd() {
  const projectPath = selectedProjectPath.value
  if (!projectPath) return
  isLoadingClaudeMd.value = true
  claudeMdExists.value = false
  claudeMdEditing.value = false
  claudeMdDraft.value = ''
  try {
    const res = await $fetch<{ exists: boolean; content: string }>('/api/projects/claude-md', {
      query: { path: projectPath }
    })
    claudeMdExists.value = res.exists
    claudeMdContent.value = res.content
    claudeMdDraft.value = res.content
    claudeMdEditing.value = res.exists
  } catch (e) {
    console.error('Failed to fetch CLAUDE.md:', e)
  } finally {
    isLoadingClaudeMd.value = false
  }
}

async function saveClaudeMd() {
  const projectPath = selectedProjectPath.value
  if (!projectPath) return
  isSavingClaudeMd.value = true
  try {
    await $fetch('/api/projects/claude-md', {
      method: 'PUT',
      body: { path: projectPath, content: claudeMdDraft.value }
    })
    claudeMdContent.value = claudeMdDraft.value
    claudeMdExists.value = true
    claudeMdEditing.value = true
    toast.add({ title: 'CLAUDE.md saved', color: 'success', duration: 1000 })
  } catch (e: any) {
    toast.add({ title: 'Failed to save CLAUDE.md', description: e.message, color: 'error' })
  } finally {
    isSavingClaudeMd.value = false
  }
}

async function fetchMemoryMd() {
  const projectPath = selectedProjectPath.value
  if (!projectPath) return
  isLoadingMemoryMd.value = true
  memoryMdExists.value = false
  memoryMdDraft.value = ''
  try {
    const res = await $fetch<{ exists: boolean; content: string }>('/api/projects/memory-md', {
      query: { path: projectPath }
    })
    memoryMdExists.value = res.exists
    memoryMdContent.value = res.content
    memoryMdDraft.value = res.content
  } catch (e) {
    console.error('Failed to fetch MEMORY.md:', e)
  } finally {
    isLoadingMemoryMd.value = false
  }
}

async function saveMemoryMd() {
  const projectPath = selectedProjectPath.value
  if (!projectPath) return
  isSavingMemoryMd.value = true
  try {
    await $fetch('/api/projects/memory-md', {
      method: 'PUT',
      body: { path: projectPath, content: memoryMdDraft.value }
    })
    memoryMdContent.value = memoryMdDraft.value
    memoryMdExists.value = true
    toast.add({ title: 'MEMORY.md saved', color: 'success', duration: 1000 })
  } catch (e: any) {
    toast.add({ title: 'Failed to save MEMORY.md', description: e.message, color: 'error' })
  } finally {
    isSavingMemoryMd.value = false
  }
}

async function fetchConfigDirSettings() {
  const projectPath = selectedProjectPath.value
  if (!projectPath) return
  try {
    configDirSettings.value = await $fetch('/api/projects/settings', {
      query: { path: projectPath }
    })
    if (configDirSettings.value.outputStyle) {
      const style = configOutputStyles.value.find(
        s => s.name.toLowerCase() === configDirSettings.value.outputStyle.toLowerCase() || s.id === configDirSettings.value.outputStyle.toLowerCase()
      )
      if (style) selectedOutputStyleId2.value = style.id
    }
  } catch (e) {
    console.error('Failed to fetch directory settings:', e)
  }
}

async function saveOutputStyleSetting() {
  const projectPath = selectedProjectPath.value
  if (!projectPath) return
  isSavingConfigSettings.value = true
  try {
    const style = configOutputStyles.value.find(s => s.id === selectedOutputStyleId2.value)
    if (style) configDirSettings.value.outputStyle = style.name
    await $fetch('/api/projects/settings', {
      method: 'PUT',
      body: { path: projectPath, settings: configDirSettings.value }
    })
    toast.add({ title: 'Output style saved', color: 'success', duration: 1000 })
  } catch (e: any) {
    toast.add({ title: 'Failed to save settings', description: e.message, color: 'error' })
  } finally {
    isSavingConfigSettings.value = false
  }
}

// Get display messages - either from live session or Claude Code history
const displayMessages = computed<DisplayChatMessage[]>(() => {
  // Determine which session ID to use for live messages
  const liveSessionId = currentSessionId.value || urlSessionId.value

  let merged: DisplayChatMessage[] = []

  // If viewing Claude Code history
  if (viewMode.value === 'history') {
    const historyMessages = convertClaudeCodeMessages(claudeCodeMessages.value)

    // If we have history messages and NOT continuing, just return history
    if (historyMessages.length > 0 && !isContinuingHistory.value) {
      merged = historyMessages
    } else {
      // Continuing a history session: show history + any new live messages
      if (liveSessionId) {
        const liveMessages = sessionStore.getMessages(liveSessionId)
        if (liveMessages.length > 0 || streamingText.value) {
          const newMessages = convertToDisplayMessages(liveMessages, streamingText.value)

          // History message IDs are JSONL uuids (e.g. "abc123-text-...").
          // Live message IDs are random (e.g. "text_1719..._abc"). IDs never match across sources.
          // Dedup by content for text messages, keyed by role+turnIndex+content so identical
          // replies in different turns are not wrongly filtered.
          const historyIds = new Set(historyMessages.map(m => m.id))
          let turnIndex = 0
          const historyContentKeys = new Set<string>()
          for (const m of historyMessages) {
            if (m.role === 'user') turnIndex++
            if ((m.role === 'user' || m.role === 'assistant') && m.kind === 'text') {
              historyContentKeys.add(`${m.role}:${turnIndex}:${(m.content || '').toString().trim().substring(0, 200)}`)
            }
          }
          // Count turns in live messages to align with history turn numbering
          const liveTurnOffset = turnIndex
          let liveTurn = liveTurnOffset
          // Find the latest complete among live messages — only keep this one Done card.
          const liveCompletes = newMessages.filter(m => m.kind === 'complete')
          const latestCompleteId = liveCompletes.at(-1)?.id ?? null
          const uniqueNewMessages = newMessages.filter(m => {
            if (historyIds.has(m.id)) return false
            if (m.kind === 'complete') return m.id === latestCompleteId
            if (m.role === 'user') liveTurn++
            if ((m.role === 'user' || m.role === 'assistant') && m.kind === 'text' && !m.isStreaming) {
              const key = `${m.role}:${liveTurn}:${(m.content || '').toString().trim().substring(0, 200)}`
              if (historyContentKeys.has(key)) return false
            }
            return true
          })

          merged = [...historyMessages, ...uniqueNewMessages]
        } else {
          merged = historyMessages
        }
      } else {
        merged = historyMessages
      }
    }
  } else {
    // Live session only (new chat)
    if (!liveSessionId) {
      merged = []
    } else {
      const messages = sessionStore.getMessages(liveSessionId)
      merged = convertToDisplayMessages(messages, streamingText.value)
    }
  }

  // Final logical deduplication pass (for the whole turn/response)
  // This catches cases where the same tool call might have different IDs between history and live store
  const finalMessages: DisplayChatMessage[] = []
  const seenToolCalls = new Set<string>()

  for (const msg of merged) {
    if (msg.role === 'user') {
      seenToolCalls.clear()
      finalMessages.push(msg)
      continue
    }

    if (msg.kind === 'tool_use') {
      const tn = (msg.toolName || '').toLowerCase()
      // Normalize name
      let normName = tn
      if (tn === 'read_file' || tn === 'read') normName = 'read'
      if (tn === 'write_file' || tn === 'write') normName = 'write'
      if (tn === 'glob_search' || tn === 'glob') normName = 'glob'
      if (tn === 'grep_search' || tn === 'grep') normName = 'grep'

      // Extract target (mimicking ChatV2MessageItem)
      let target = ''
      const input = msg.toolInput as any
      if (typeof input === 'string') {
        target = input.replace(/^\.\//, '')
      } else if (input && typeof input === 'object') {
        const val = input.file_path || input.path || input.filePath || input.filename || input.pattern || input.file || input.command || ''
        target = typeof val === 'string' ? val.replace(/^\.\//, '') : JSON.stringify(val)
      }

      const key = `${normName}:${target}`
      if (seenToolCalls.has(key)) continue
      seenToolCalls.add(key)
    }
    
    finalMessages.push(msg)
  }

  return finalMessages
})

// Message search
const searchQuery = ref('')
const showSearch = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)

function openSearch() {
  showSearch.value = true
  nextTick(() => searchInputRef.value?.focus())
}

function closeSearch() {
  showSearch.value = false
  searchQuery.value = ''
}

const filteredMessages = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return displayMessages.value
  return displayMessages.value.filter(m => {
    if (m.content && m.content.toLowerCase().includes(q)) return true
    if (m.thinking && m.thinking.toLowerCase().includes(q)) return true
    if (m.toolName && m.toolName.toLowerCase().includes(q)) return true
    return false
  })
})

const searchMatchCount = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return 0
  return filteredMessages.value.length
})

// Watch for errors and show toast
watch(error, (newError) => {
  if (newError) {
    toast.add({
      title: 'Error',
      description: newError,
      color: 'error',
    })
  }
})

// Handle Claude Code project selection
function handleClaudeCodeProjectSelected(payload: { projectName: string; projectDisplayName: string }) {
  activeConfigPanel.value = null
  isOnSettingsRoute.value = false
  urlProjectName.value = payload.projectName
  urlSessionId.value = null
  setCurrentSessionId(null) // Clear active session
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = payload.projectDisplayName

  // Ensure we are in live view mode but haven't started a chat yet
  viewMode.value = 'live'
  isLiveChat.value = false

  // Clear any history selection in shared state
  history.selectedSession.value = null

  // Update URL to reflect selected project
  const targetPath = `/cli/project/${encodeURIComponent(payload.projectName)}`
  if (route.path !== targetPath) {
    navigateTo(targetPath, { replace: false })
  }
}

// Utility: delay for minimum loading time
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Scroll to bottom helper — returns a Promise that resolves once scroll + layout settle
function scrollToBottom(behavior: ScrollBehavior = 'auto'): Promise<void> {
  return new Promise(resolve => {
    nextTick(() => {
      if (!messagesContainerRef.value) {
        isInitialScroll.value = false
        resolve()
        return
      }
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight

      // Wait for layout shifts from async rendering (markdown, code blocks, images)
      // 300ms gives enough time for most content to fully render and calculate heights
      setTimeout(() => {
        if (messagesContainerRef.value) {
          messagesContainerRef.value.scrollTo({
            top: messagesContainerRef.value.scrollHeight,
            behavior
          })
        }
        // Make container visible — no CSS transition so it appears instantly (no flash)
        isInitialScroll.value = false
        resolve()
      }, 300)
    })
  })
}

// Handle Claude Code history session selection
async function handleClaudeCodeSessionSelected(payload: { projectName: string; sessionId: string; sessionSummary: string; projectDisplayName: string }) {
  // Guard: if this session is the one we're currently live-chatting (or just finished),
  // don't switch to history mode — just sync sidebar state.
  // Check both currentSessionId (set by session_created) and urlSessionId (set by refreshProjectForNewSession).
  if (payload.sessionId === currentSessionId.value || (payload.sessionId === urlSessionId.value && viewMode.value === 'live')) {
    urlProjectName.value = payload.projectName
    urlSessionId.value = payload.sessionId
    currentSessionSummary.value = payload.sessionSummary
    currentProjectDisplayName.value = payload.projectDisplayName
    return
  }

  activeConfigPanel.value = null
  isOnSettingsRoute.value = false
  viewMode.value = 'history'
  isLiveChat.value = false
  urlProjectName.value = payload.projectName
  urlSessionId.value = payload.sessionId
  setCurrentSessionId(payload.sessionId) // Sync active session
  currentSessionSummary.value = payload.sessionSummary
  currentProjectDisplayName.value = payload.projectDisplayName
  isContinuingHistory.value = false  // Reset when selecting a new history session
  isInitialScroll.value = true // Set initial scroll flag
  isLoadingHistoryWithDelay.value = true // Show spinner before any awaits to avoid blank gap

  // Finding and setting the session in shared state to sync metadata (like model)
  const session = history.sessions.value.find(s => s.id === payload.sessionId)
  const project = history.projects.value.find(p => p.name === payload.projectName)

  if (session) {
    history.selectedSession.value = session
    // Sync working directory to the session's recorded cwd
    if (session.cwd) {
      localWorkingDir.value = session.cwd
    } else if (project) {
      localWorkingDir.value = project.path
    }
  } else {
    // Fallback: create a skeleton session if not in the current list
    history.selectedSession.value = {
      id: payload.sessionId,
      summary: payload.sessionSummary,
      lastActivity: new Date().toISOString(),
      messageCount: 0,
      cwd: project?.path || '',
    }
    if (project) {
      localWorkingDir.value = project.path
    }
  }

  // Clear any realtime messages for this session ID to prevent doubling with history
  sessionStore.clearRealtime(payload.sessionId)

  // Update URL only if not already there (avoids redundant navigation when triggered by route watcher)
  const targetPath = `/cli/project/${encodeURIComponent(payload.projectName)}/session/${encodeURIComponent(payload.sessionId)}`
  if (route.path !== targetPath) {
    await navigateTo(targetPath, { replace: false })
  }

  // Load messages with minimum 1000ms delay for smooth UX
  const [historyResult] = await Promise.all([
    fetchClaudeCodeMessages(payload.projectName, payload.sessionId, 100, 0),
    delay(1000)
  ])

  if (historyResult?.tokenUsage) {
    contextMonitor.updateTokenUsage(historyResult.tokenUsage)
  } else {
    contextMonitor.resetMetrics()
  }

  // Scroll to bottom first — waits for layout to settle and makes messages visible
  // Only then hide the spinner so there's no blank flash between loader and content
  await scrollToBottom()
  isLoadingHistoryWithDelay.value = false
}

// Handle selection cleared (back to projects list)
function handleSelectionCleared() {
  activeConfigPanel.value = null
  isOnSettingsRoute.value = false
  viewMode.value = 'live'
  isLiveChat.value = false
  urlProjectName.value = null
  urlSessionId.value = null
  setCurrentSessionId(null) // Clear active session
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = ''
  isContinuingHistory.value = false
  contextMonitor.resetMetrics()
  if (route.path !== '/cli') {
    navigateTo('/cli', { replace: false })
  }
}

// Handle new chat - switch to live mode without affecting sidebar
// Note: We don't pre-create a session anymore. The SDK will create the session
// when the first message is sent, and we'll get the session ID via session_created event.
function handleNewChat(payload?: { workingDir?: string; projectDisplayName?: string }) {
  viewMode.value = 'live'
  isLiveChat.value = true
  urlProjectName.value = null
  urlSessionId.value = null
  setCurrentSessionId(null) // Clear active session
  currentSessionSummary.value = ''
  currentProjectDisplayName.value = payload?.projectDisplayName || ''
  isContinuingHistory.value = false
  // Clear the current session so the user can start fresh
  sessionStore.setActiveSession(null)
  contextMonitor.resetMetrics()
  
  // Clear history selection
  history.selectedSession.value = null
  // If no working directory, also clear project selection
  if (!payload?.workingDir) {
    history.selectedProject.value = null
  }

  // If a working directory was provided, update the local working dir
  if (payload?.workingDir) {
    localWorkingDir.value = payload.workingDir
  } else {
    // Reset to prop's default if not provided
    localWorkingDir.value = props.executionOptions.workingDir || ''
  }

  if (route.path !== '/cli') {
    navigateTo('/cli', { replace: false })
  }
}


// Helper: find project by path and refresh its session list, with one retry for timing
async function refreshProjectForNewSession(newId: string, workingDir: string) {
  const normalizedDir = workingDir.replace(/\/$/, '')
  let matchingProject = history.projects.value.find(p => p.path.replace(/\/$/, '') === normalizedDir)

  if (!matchingProject) {
    // Project may be brand new — refetch and try once more
    await history.fetchProjects()
    matchingProject = history.projects.value.find(p => p.path.replace(/\/$/, '') === normalizedDir)
  }

  if (!matchingProject) return

  // Update sidebar state
  urlProjectName.value = matchingProject.name
  urlSessionId.value = newId  // Set before any awaits so route watcher guard fires correctly
  currentProjectDisplayName.value = matchingProject.displayName
  history.selectedProject.value = matchingProject

  // Refresh sessions list
  await history.fetchSessions(matchingProject.name)
  await sidebarRef.value?.refreshProject(matchingProject.name)

  let newSession = history.sessions.value.find(s => s.id === newId)

  // JSONL may not be flushed yet — poll up to 3 times at 300ms intervals
  for (let i = 0; i < 3 && !newSession; i++) {
    await new Promise(resolve => setTimeout(resolve, 300))
    await history.fetchSessions(matchingProject.name)
    newSession = history.sessions.value.find(s => s.id === newId)
  }

  if (newSession) {
    currentSessionSummary.value = newSession.summary
    history.selectedSession.value = newSession
  }

  // Update URL (replace so back button skips the empty new-chat state)
  await navigateTo(
    `/cli/project/${encodeURIComponent(matchingProject.name)}/session/${encodeURIComponent(newId)}`,
    { replace: true }
  )
}

// Watch for session created event from SDK
watch(currentSessionId, async (newId, oldId) => {
  if (newId && !newId.startsWith('new-session-') && (!oldId || oldId.startsWith('new-session-'))) {
    console.log('[ChatV2] New session created, refreshing history:', newId)

    // Refresh projects so the list is up to date
    await history.fetchProjects()

    // Use the working dir reported by the server (most accurate) or fall back to local state
    const effectiveWorkingDir = sessionCreatedWorkingDir.value || localWorkingDir.value

    if (effectiveWorkingDir) {
      await refreshProjectForNewSession(newId, effectiveWorkingDir)
    }
  }
})

// Deep link / browser nav: sync URL params → internal session state
// Runs on mount (immediate) and whenever route params or projects change (browser back/forward)
watch(
  () => ({
    projectName: route.params.projectName as string | undefined,
    sessionId: route.params.sessionId as string | undefined,
    isSettings: route.path.endsWith('/settings'),
    projectsLoaded: history.projects.value.length > 0,
  }),
  async ({ projectName, sessionId, isSettings, projectsLoaded }) => {
    // No params — nothing to restore
    if (!projectName) return

    // Wait for projects to be loaded before resolving metadata
    if (!projectsLoaded) {
      await history.fetchProjects()
    }

    // 1. Resolve project - some URLs might use dash-encoded paths
    let project = history.projects.value.find(p => p.name === projectName)
    
    // If project not found by name, try to resolve via API (fuzzy/path match)
    if (!project) {
      try {
        const res = await $fetch<{ projectName: string | null }>('/api/projects/resolve', {
          query: { name: projectName }
        })
        if (res.projectName && res.projectName !== projectName) {
          // Redirect to the correct canonical URL - replacing only the project part of the path
          const currentPath = route.path
          const oldSegment = encodeURIComponent(projectName)
          const newSegment = encodeURIComponent(res.projectName)
          
          if (currentPath.includes(oldSegment)) {
            const newPath = currentPath.replace(oldSegment, newSegment)
            return navigateTo(newPath, { replace: true })
          } else if (currentPath.includes(projectName)) {
             // Try unencoded version if encoded wasn't in path
             const newPath = currentPath.replace(projectName, res.projectName)
             return navigateTo(newPath, { replace: true })
          }
        }
        // If it resolved to a known name, get the project object
        if (res.projectName) {
          project = history.projects.value.find(p => p.name === res.projectName)
        }
      } catch (e) {
        console.error('[ChatV2] Failed to resolve project:', e)
      }
    }

    const resolvedProjectName = project?.name || projectName
    const projectDisplayName = project?.displayName || resolvedProjectName

    // Sync sidebar state
    if (project && history.selectedProject.value?.name !== resolvedProjectName) {
      history.selectedProject.value = project
      // Load sessions for this project immediately
      await history.fetchSessions(resolvedProjectName)
    }

    if (isSettings) {
      // Settings URL: /cli/project/:projectName/settings
      urlProjectName.value = resolvedProjectName
      urlSessionId.value = null
      currentProjectDisplayName.value = projectDisplayName
      isOnSettingsRoute.value = true
      activeConfigPanel.value = activeConfigPanel.value || null
    } else {
      // Not on settings route
      isOnSettingsRoute.value = false
      activeConfigPanel.value = null

      if (sessionId) {
        // Full session URL: /cli/project/:projectName/session/:sessionId
        // Guard: already showing this session (history mode) or actively live-chatting it (live mode)
        if (urlProjectName.value === resolvedProjectName && urlSessionId.value === sessionId &&
          (viewMode.value === 'history' || viewMode.value === 'live')) return

        const session = history.sessions.value.find(s => s.id === sessionId)
        const sessionSummary = session?.summary || ''

        await handleClaudeCodeSessionSelected({
          projectName: resolvedProjectName,
          sessionId,
          sessionSummary,
          projectDisplayName,
        })
      } else {
        // Project-only URL: /cli/project/:projectName
        // Guard: already showing this project with no session
        if (urlProjectName.value === resolvedProjectName && !urlSessionId.value && viewMode.value === 'live') return

        handleClaudeCodeProjectSelected({ projectName: resolvedProjectName, projectDisplayName })
      }
    }
  },
  { immediate: true, flush: 'post' }
)

// Debounce timer for history refreshes during live chat
let refreshTimer: NodeJS.Timeout | null = null
const REFRESH_DEBOUNCE_MS = 2000

// Refresh history sessions list if in a project
async function refreshHistorySessions() {
  if (viewMode.value === 'live' && urlProjectName.value) {
    await history.fetchSessions(urlProjectName.value)
    
    // Also update current session info from history
    if (currentSessionId.value) {
      const newSession = history.sessions.value.find(s => s.id === currentSessionId.value)
      if (newSession) {
        currentSessionSummary.value = newSession.summary
        history.selectedSession.value = newSession
      }
    }
  }
}

// Auto-scroll on new messages (when in live mode or continuing history)
watch([displayMessages, streamingText], () => {
  // Trigger history refresh (debounced)
  if (viewMode.value === 'live' && urlProjectName.value) {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshHistorySessions()
    }, REFRESH_DEBOUNCE_MS)
  }

  if (viewMode.value === 'live' || isContinuingHistory.value) {
    scrollToBottom()
  }
})

// Track if we're loading more to prevent duplicate calls
const isLoadingMore = ref(false)

// Load more messages for history mode
async function loadMoreHistoryMessages(options?: { preserveScroll?: boolean }) {
  if (!claudeCodeMessagesHasMore.value) return
  if (isLoadingClaudeCodeMessages.value || isLoadingMore.value) return
  if (!urlProjectName.value || !urlSessionId.value) return

  isLoadingMore.value = true

  // Save current scroll state to restore position after loading
  const container = messagesContainerRef.value
  const scrollTop = container?.scrollTop ?? 0
  const previousScrollHeight = container?.scrollHeight ?? 0

  // Calculate offset for older messages
  const currentMessageCount = claudeCodeMessages.value.length

  try {
    await fetchClaudeCodeMessages(
      urlProjectName.value,
      urlSessionId.value,
      50,  // limit
      currentMessageCount  // offset - skip messages we already have
    )

    if (options?.preserveScroll && container) {
      nextTick(() => {
        // Restore scroll position so user stays at same place
        const newScrollHeight = container.scrollHeight
        const scrollDiff = newScrollHeight - previousScrollHeight
        container.scrollTop = scrollTop + scrollDiff
      })
    }
  } finally {
    isLoadingMore.value = false
  }
}

// Handle scroll to load more messages (for history mode)
function handleMessagesScroll(event: Event) {
  if (viewMode.value !== 'history') return

  const container = event.target as HTMLElement
  const scrollTop = container.scrollTop

  // Load more when scrolled near the top (within 100px)
  if (scrollTop < 100) {
    loadMoreHistoryMessages({ preserveScroll: true })
  }
}

// Fetch sessions list
async function fetchSessions() {
  isLoadingSessions.value = true
  try {
    const data = await $fetch<any[]>('/api/chat-ws/sessions')
    sessions.value = data
  } catch (e) {
    console.error('[ChatV2] Failed to fetch sessions:', e)
  } finally {
    isLoadingSessions.value = false
  }
}

// Load a session
async function loadSession(sessionId: string) {
  sessionStore.setActiveSession(sessionId)

  // Fetch messages from server if stale
  if (sessionStore.isStale(sessionId) || !sessionStore.has(sessionId)) {
    await sessionStore.fetchFromServer(sessionId, {
      limit: 50,
      offset: 0,
    })
  }
}

// Create new session
async function createSession() {
  isCreatingSession.value = true
  try {
    const data = await $fetch<any>('/api/chat-ws/sessions', {
      method: 'POST',
      body: {
        workingDir: localWorkingDir.value,
      },
    })

    sessionStore.setActiveSession(data.id)
    // Don't navigate away - just set the session
    // await router.push(`/cli/${data.id}`)
    // Fetch sessions in background without blocking
    fetchSessions()
  } catch (e: any) {
    console.error('[ChatV2] Failed to create session:', e)
    toast.add({
      title: 'Failed to create session',
      description: e.data?.message || e.message || 'Unknown error',
      color: 'error',
    })
  } finally {
    isCreatingSession.value = false
  }
}

// Select session (for live chat sessions, not history)
async function selectSession(sessionId: string | null) {
  if (sessionId) {
    await loadSession(sessionId)
  } else {
    await createSession()
  }
}

// Composables for slash command resolution
const { commands: allCommands, fetchAll: fetchCommands } = useCommands()
const { skills: allSkills, fetchAll: fetchSkills } = useSkills()

// Ensure commands/skills are loaded for slash command matching
onMounted(async () => {
  await Promise.all([
    allCommands.value.length === 0 ? fetchCommands() : Promise.resolve(),
    allSkills.value.length === 0 ? fetchSkills() : Promise.resolve(),
  ])
})

/**
 * Execute a slash command via HTTP API (not WebSocket).
 * Built-in commands are handled inline; custom commands are re-submitted as regular messages.
 */
async function executeSlashCommand(rawInput: string): Promise<boolean> {
  const trimmed = rawInput.trim()
  const firstSpace = trimmed.indexOf(' ')
  const commandName = firstSpace > 0 ? trimmed.slice(0, firstSpace) : trimmed
  const argsStr = firstSpace > 0 ? trimmed.slice(firstSpace + 1).trim() : ''
  const args = argsStr ? argsStr.split(/\s+/) : []

  // Find matching command or skill
  const nameWithoutSlash = commandName.slice(1) // remove leading "/"
  const matchedCommand = allCommands.value.find(c => c.frontmatter.name === nameWithoutSlash)
  const matchedSkill = allSkills.value.find(s => s.frontmatter.name === nameWithoutSlash)

  // Determine path for custom commands/skills
  const commandPath = matchedCommand?.filePath || matchedSkill?.filePath || undefined

  // If no match found in custom commands/skills and not a known built-in, just send as regular message
  const knownBuiltins = ['help', 'clear', 'model', 'cost', 'memory', 'config', 'status']
  if (!commandPath && !knownBuiltins.includes(nameWithoutSlash)) {
    return false // Not a command — let it be sent as a regular message
  }

  // Add user message bubble so the command shows in chat
  addLocalUserMessage(rawInput)

  try {
    const response = await $fetch<any>('/api/commands/execute', {
      method: 'POST',
      body: {
        commandName,
        commandPath,
        args,
        context: {
          projectPath: localWorkingDir.value,
          model: selectedModel.value,
          sessionId: currentSessionId.value,
        },
      },
    })

    if (response.type === 'builtin') {
      handleBuiltInCommandResult(response)
    } else if (response.type === 'custom') {
      // Re-submit the processed command content as a regular message
      sendRegularMessage(response.content, [])
    }

    return true
  } catch (err: any) {
    console.error('[ChatV2] Error executing command:', err)
    // Add error as assistant message
    addLocalAssistantMessage(`Error executing command: ${err.data?.message || err.message || 'Unknown error'}`)
    return true // consumed the command (even though it errored)
  }
}

/**
 * Handle built-in command results by adding messages to the chat
 */
function handleBuiltInCommandResult(result: any) {
  const { action, data } = result
  switch (action) {
    case 'clear':
      // Switch to live mode so the confirmation appears in a clean slate,
      // consistent with /clear semantics (context cleared = fresh start).
      viewMode.value = 'live'
      if (currentSessionId.value) {
        sessionStore.clearRealtime(currentSessionId.value)
      }
      addLocalAssistantMessage(data.message)
      break
    case 'help':
      addLocalAssistantMessage(data.content)
      break
    case 'model':
      addLocalAssistantMessage(data.message)
      break
    case 'cost': {
      const msg = `**Token Usage**: ${data.tokenUsage.used.toLocaleString()} / ${data.tokenUsage.total.toLocaleString()} (${data.tokenUsage.percentage}%)\n\n**Model**: ${data.model}`
      addLocalAssistantMessage(msg)
      break
    }
    case 'status': {
      const msg = `**System Status**\n- Uptime: ${data.uptime}\n- Model: ${data.model}\n- Node.js: ${data.nodeVersion}\n- Platform: ${data.platform}`
      addLocalAssistantMessage(msg)
      break
    }
    case 'memory':
      addLocalAssistantMessage(data.message)
      break
    case 'config':
      addLocalAssistantMessage(data.message)
      break
    default:
      addLocalAssistantMessage(`Command executed: ${action}`)
  }
}

/**
 * Add a local user message to the current session
 */
function addLocalUserMessage(content: string) {
  if (viewMode.value === 'history') isContinuingHistory.value = true
  const sid = currentSessionId.value || `local-${Date.now()}`
  if (!currentSessionId.value) {
    setCurrentSessionId(sid)
  }
  sessionStore.appendRealtime(sid, {
    kind: 'text',
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionId: sid,
    timestamp: new Date().toISOString(),
    role: 'user',
    content,
  })
}

/**
 * Add a local assistant message to the current session
 */
function addLocalAssistantMessage(content: string) {
  // In history mode, local messages only appear when continuing the session.
  // /clear sets viewMode to live itself; all other callers just need the flag.
  if (viewMode.value === 'history') isContinuingHistory.value = true
  const sid = currentSessionId.value || `local-${Date.now()}`
  if (!currentSessionId.value) {
    setCurrentSessionId(sid)
  }
  sessionStore.appendRealtime(sid, {
    kind: 'text',
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionId: sid,
    timestamp: new Date().toISOString(),
    role: 'assistant',
    content,
  })
}

/**
 * Send a regular (non-command) message through the WebSocket/SDK
 */
function sendRegularMessage(text: string, images: string[]) {
  if (viewMode.value === 'history' && !isContinuingHistory.value) {
    isContinuingHistory.value = true
    sendChat(text, {
      sessionId: urlSessionId.value || undefined,
      workingDir: localWorkingDir.value || undefined,
      permissionMode: selectedPermissionMode.value,
      model: selectedModel.value,
      effort: effortLevel.value,
      maxTurns: maxTurns.value ?? undefined,
      outputStyleId: selectedOutputStyleId.value,
      images,
    })
    return
  }

  sendChat(text, {
    sessionId: currentSessionId.value || undefined,
    workingDir: localWorkingDir.value || undefined,
    permissionMode: selectedPermissionMode.value,
    model: selectedModel.value,
    effort: effortLevel.value,
    maxTurns: maxTurns.value ?? undefined,
    outputStyleId: selectedOutputStyleId.value,
    images,
  })
}

// Send message (works in both live and history mode)
async function handleSendMessage(images: string[] = []) {
  if ((!inputText.value.trim() && images.length === 0) || isStreaming.value) return

  const trimmed = inputText.value.trim()

  // Intercept slash commands — handle via HTTP API, not WebSocket
  if (trimmed.startsWith('/')) {
    const consumed = await executeSlashCommand(trimmed)
    if (consumed) {
      inputText.value = ''
      return
    }
    // If not consumed (not a known command), fall through to regular message
  }

  sendRegularMessage(inputText.value, images)
  inputText.value = ''
}

// Abort current stream then immediately send the queued input
async function handleAbortAndSend(images: string[] = []) {
  const text = inputText.value
  inputText.value = ''
  abort()
  await nextTick()
  if (text.trim() || images.length > 0) {
    sendRegularMessage(text, images)
  }
}

// Handle permission response
async function handlePermissionResponse(permissionId: string, decision: 'allow' | 'deny', remember = false, updatedInput?: any) {
  respondToPermission(permissionId, decision, remember, updatedInput)
}

// Handle interactive prompt response
function handlePromptResponse(promptId: string, value: string) {
  respondToPrompt(promptId, value)
}

// Handle message resend
function handleResend(content: string, images?: string[]) {
  sendRegularMessage(content, images || [])
}

// Handle session renamed
async function handleSessionRenamed(payload: { projectName: string; sessionId: string; newName: string }) {
  console.log('[ChatV2] Session renaming:', payload)
  try {
    await renameSession(payload.projectName, payload.sessionId, payload.newName)

    // Update local state if this is the current session
    if (urlSessionId.value === payload.sessionId) {
      currentSessionSummary.value = payload.newName
    }

    toast.add({
      title: 'Session renamed',
      color: 'success',
      duration: 1000
    })
  } catch (e: any) {
    console.error('[ChatV2] Failed to rename session:', e)
    toast.add({
      title: 'Failed to rename session',
      description: e.data?.message || e.message,
      color: 'error'
    })
  }
}

// Handle session deleted
async function handleSessionDeleted(payload: { projectName: string; sessionId: string }) {
  console.log('[ChatV2] Session deleting:', payload)
  try {
    await deleteSession(payload.projectName, payload.sessionId)

    // If the deleted session is currently selected, clear selection
    if (urlSessionId.value === payload.sessionId) {
      handleSelectionCleared()
    }

    toast.add({
      title: 'Session deleted',
      color: 'success',
      duration: 1000
    })
  } catch (e: any) {
    console.error('[ChatV2] Failed to delete session:', e)
    toast.add({
      title: 'Failed to delete session',
      description: e.data?.message || e.message,
      color: 'error'
    })
  }
}

const { openFile, openDiff, closeEditor, state: fileEditorState } = useFileEditor()

// Click file/image in message → Preview tab
function handleOpenFile(filePath: string) {
  if (!filePath) return
  let absolutePath = filePath
  if (!filePath.startsWith('/')) {
    const projectPath = selectedProjectPath.value
    if (projectPath) {
      absolutePath = projectPath.endsWith('/') ? `${projectPath}${filePath}` : `${projectPath}/${filePath}`
    }
  }
  openFile(absolutePath)
  activeRightTab.value = 'preview'
  showRightSidebar.value = true
}

// Ref to the Git panel so we can push diff stats back to it after fetch
const gitPanelRef = ref<{ cacheDiff: (diff: any, staged: boolean) => void } | null>(null)

// Git panel click file → show diff on right side
async function handleOpenDiff(filePath: string, staged: boolean) {
  await openPanelDiff(filePath, staged)
}

function handleClosePreview() {
  closeEditor()
  if (activeRightTab.value === 'preview') {
    activeRightTab.value = 'explorer'
  }
}
</script>

<template>
  <div class="flex-1 flex min-h-0">
    <!-- Left Sidebar - Claude Code History -->
    <div
      :class="[
        'flex flex-col border-r relative overflow-hidden shrink-0',
        !isDraggingLeftSidebar ? 'transition-[width] duration-300' : '',
      ]"
      :style="{
        width: sidebarWidth,
        borderColor: 'var(--border-subtle)',
        background: 'var(--surface-base)',
        userSelect: isDraggingLeftSidebar ? 'none' : undefined,
      }"
    >
      <!-- Drag handle on right edge -->
      <div
        v-if="!sidebarCollapsed"
        class="absolute right-0 inset-y-0 w-1 cursor-col-resize z-10"
        :class="isDraggingLeftSidebar ? 'bg-accent/40' : 'hover:bg-accent/30'"
        @mousedown="onLeftSidebarDragStart"
      />
      <!-- Projects Sidebar -->
      <ChatV2ProjectsSidebar
        ref="sidebarRef"
        :collapsed="sidebarCollapsed"
        :current-session-id="urlSessionId"
        :is-loading-messages="isLoadingClaudeCodeMessages"
        @project-selected="handleClaudeCodeProjectSelected"
        @session-selected="handleClaudeCodeSessionSelected"
        @new-chat="handleNewChat"
        @selection-cleared="handleSelectionCleared"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        @session-renamed="handleSessionRenamed"
        @session-deleted="handleSessionDeleted"
        @project-renamed="handleProjectRenamed"
        @project-deleted="handleProjectDeleted"
        @config-panel-selected="handleConfigPanelSelected"
        @settings-toggled="handleSettingsToggled"
      />
    </div>

    <!-- Right Panel -->
    <div class="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      <!-- ── Settings View ── -->
      <template v-if="isOnSettingsRoute">

        <!-- Settings Landing (no specific panel selected) -->
        <template v-if="!activeConfigPanel">
          <div class="shrink-0 border-b h-14 flex items-center gap-3 px-4" style="border-color: var(--border-subtle); background: var(--surface-base);">
            <UIcon name="i-lucide-settings-2" class="size-4" style="color: var(--accent);" />
            <h3 class="text-[14px] font-semibold" style="color: var(--text-primary);">Project Settings</h3>
            <span class="text-[11px] font-mono" style="color: var(--text-tertiary);">
              {{ currentProjectDisplayName || selectedProjectPath }}
            </span>
          </div>
          <div class="flex-1 flex items-center justify-center">
            <div class="text-center max-w-sm px-6">
              <div class="size-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style="background: var(--surface-raised);">
                <UIcon name="i-lucide-settings-2" class="size-8" style="color: var(--text-tertiary);" />
              </div>
              <h2 class="text-[17px] font-semibold mb-2" style="color: var(--text-primary);">Project Settings</h2>
              <p class="text-[13px] leading-relaxed" style="color: var(--text-secondary);">
                Choose a setting from the sidebar to configure this project.
              </p>
            </div>
          </div>
        </template>

        <!-- Specific Config Panel -->
        <template v-else>
        <!-- Config Header -->
        <div class="shrink-0 border-b h-14 flex items-center gap-3 px-4" style="border-color: var(--border-subtle); background: var(--surface-base);">
          <button
            class="p-1.5 rounded-lg hover-bg transition-all"
            style="background: var(--surface-raised);"
            @click="closeConfigPanel"
          >
            <UIcon name="i-lucide-arrow-left" class="size-4" style="color: var(--text-secondary);" />
          </button>
          <UIcon
            :name="activeConfigPanel === 'claude-md' ? 'i-lucide-file-text' : activeConfigPanel === 'memory-md' ? 'i-lucide-brain' : 'i-lucide-palette'"
            class="size-4"
            style="color: var(--accent);"
          />
          <h3 class="text-[14px] font-semibold" style="color: var(--text-primary);">
            {{ activeConfigPanel === 'claude-md' ? 'CLAUDE.md' : activeConfigPanel === 'memory-md' ? 'MEMORY.md' : 'Output Style' }}
          </h3>
          <span class="text-[11px] font-mono" style="color: var(--text-tertiary);">
            {{ currentProjectDisplayName || selectedProjectPath }}
          </span>
        </div>

        <!-- CLAUDE.md Panel -->
        <div v-if="activeConfigPanel === 'claude-md'" class="flex-1 flex flex-col min-h-0 min-w-0">
          <!-- Loading -->
          <div v-if="isLoadingClaudeMd" class="flex-1 flex items-center justify-center">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" style="color: var(--text-secondary);" />
          </div>

          <!-- InstructionEditor fills the panel -->
          <template v-else>
            <div class="shrink-0 flex items-center justify-between px-4 py-2 border-b" style="border-color: var(--border-subtle);">
              <p class="text-[12px]" style="color: var(--text-secondary);">
                Project instructions that Claude Code reads automatically.
              </p>
              <button
                class="px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all flex items-center gap-2"
                :style="{ background: 'var(--accent)', color: 'white', opacity: isSavingClaudeMd ? 0.7 : 1 }"
                :disabled="isSavingClaudeMd"
                @click="saveClaudeMd"
              >
                <UIcon v-if="isSavingClaudeMd" name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                <UIcon v-else name="i-lucide-save" class="size-3.5" />
                {{ isSavingClaudeMd ? 'Saving...' : 'Save' }}
              </button>
            </div>
            <div v-if="!claudeMdEditing" class="flex-1 flex items-center justify-center">
              <div class="text-center space-y-3">
                <UIcon name="i-lucide-file-text" class="size-8 mx-auto" style="color: var(--text-tertiary);" />
                <p class="text-[13px]" style="color: var(--text-secondary);">No CLAUDE.md yet.</p>
                <button
                  class="px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 mx-auto"
                  style="background: var(--surface-raised); color: var(--text-primary);"
                  @click="claudeMdDraft = '# Project Instructions\n\n'; claudeMdEditing = true"
                >
                  <UIcon name="i-lucide-plus" class="size-3.5" />
                  Create CLAUDE.md
                </button>
              </div>
            </div>
            <InstructionEditor
              v-if="claudeMdEditing"
              v-model="claudeMdDraft"
              class="flex-1 min-h-0"
              agent-name="CLAUDE.md"
              :agent-description="currentProjectDisplayName || 'Project instructions'"
              placeholder="# CLAUDE.md&#10;&#10;Write project instructions here..."
            />
          </template>
        </div>

        <!-- MEMORY.md Panel -->
        <div v-else-if="activeConfigPanel === 'memory-md'" class="flex-1 flex flex-col min-h-0 min-w-0">
          <div v-if="isLoadingMemoryMd" class="flex-1 flex items-center justify-center">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" style="color: var(--text-secondary);" />
          </div>
          <template v-else>
            <div class="shrink-0 flex items-center justify-between px-4 py-2 border-b" style="border-color: var(--border-subtle);">
              <p class="text-[12px]" style="color: var(--text-secondary);">
                Persistent facts Claude remembers across all sessions in this project.
              </p>
              <button
                class="px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all flex items-center gap-2"
                :style="{ background: 'var(--accent)', color: 'white', opacity: isSavingMemoryMd ? 0.7 : 1 }"
                :disabled="isSavingMemoryMd"
                @click="saveMemoryMd"
              >
                <UIcon v-if="isSavingMemoryMd" name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                <UIcon v-else name="i-lucide-save" class="size-3.5" />
                {{ isSavingMemoryMd ? 'Saving...' : 'Save' }}
              </button>
            </div>
            <div v-if="!memoryMdExists && !memoryMdDraft" class="flex-1 flex items-center justify-center">
              <div class="text-center space-y-3">
                <UIcon name="i-lucide-brain" class="size-8 mx-auto" style="color: var(--text-tertiary);" />
                <p class="text-[13px]" style="color: var(--text-secondary);">No MEMORY.md yet.</p>
                <button
                  class="px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 mx-auto"
                  style="background: var(--surface-raised); color: var(--text-primary);"
                  @click="memoryMdDraft = '# Memory\n\n- '"
                >
                  <UIcon name="i-lucide-plus" class="size-3.5" />
                  Create MEMORY.md
                </button>
              </div>
            </div>
            <InstructionEditor
              v-else
              v-model="memoryMdDraft"
              class="flex-1 min-h-0"
              agent-name="MEMORY.md"
              :agent-description="currentProjectDisplayName || 'Project memory'"
              placeholder="# Memory&#10;&#10;- Fact one&#10;- Fact two"
            />
          </template>
        </div>

        <!-- Output Style Panel -->
        <div v-else-if="activeConfigPanel === 'output-style'" class="flex-1 overflow-y-auto">
          <div class="max-w-3xl mx-auto px-6 py-8 space-y-6">
            <div class="flex items-center justify-between">
              <p class="text-[12px]" style="color: var(--text-secondary);">
                Default output style for new sessions in this project. Saved to <code class="text-[11px] px-1 py-0.5 rounded" style="background: var(--surface-raised);">.claude/settings.local.json</code>
              </p>
              <button
                class="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all flex items-center gap-2"
                :style="{ background: 'var(--accent)', color: 'white', opacity: isSavingConfigSettings ? 0.7 : 1 }"
                :disabled="isSavingConfigSettings"
                @click="saveOutputStyleSetting"
              >
                <UIcon v-if="isSavingConfigSettings" name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                <UIcon v-else name="i-lucide-save" class="size-3.5" />
                {{ isSavingConfigSettings ? 'Saving...' : 'Save' }}
              </button>
            </div>

            <div class="grid gap-3">
              <button
                v-for="style in configOutputStyles"
                :key="style.id"
                class="w-full flex items-start gap-4 p-4 rounded-xl text-left transition-all border"
                :style="{
                  background: selectedOutputStyleId2 === style.id ? 'var(--accent-muted)' : 'var(--surface-raised)',
                  borderColor: selectedOutputStyleId2 === style.id ? 'var(--accent)' : 'var(--border-subtle)',
                }"
                @click="selectedOutputStyleId2 = style.id"
              >
                <div class="size-10 rounded-xl flex items-center justify-center shrink-0" :style="{ background: selectedOutputStyleId2 === style.id ? 'var(--accent)' : 'var(--surface-sunken)' }">
                  <UIcon name="i-lucide-palette" class="size-5" :style="{ color: selectedOutputStyleId2 === style.id ? 'white' : 'var(--text-tertiary)' }" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-[13px] font-semibold" style="color: var(--text-primary);">{{ style.name }}</span>
                    <UIcon v-if="selectedOutputStyleId2 === style.id" name="i-lucide-check" class="size-4" style="color: var(--accent);" />
                  </div>
                  <p class="text-[12px] mt-0.5" style="color: var(--text-secondary);">{{ style.description }}</p>
                </div>
              </button>
            </div>
          </div>
        </div>
        </template>
      </template>

      <!-- ── Chat Interface (default view) ── -->
      <template v-else>
      <!-- Header - Fixed height for consistent alignment -->
      <div
        :key="urlSessionId || 'live'"
        class="shrink-0 border-b relative z-20"
        style="border-color: var(--border-subtle); background: var(--surface-base);"
      >
        <div class="flex items-center justify-between px-4 h-14">
          <div class="flex items-center gap-2 min-w-0 flex-1">
          <!-- History Mode - Session Info -->
          <template v-if="viewMode === 'history'">
            <div class="grid min-w-0 py-0.5 flex-1">
              <!-- Session Name -->
              <div class="text-[13px] font-medium leading-tight text-ellipsis overflow-hidden whitespace-nowrap" style="color: var(--text-primary);">
                <span v-if="isLoadingHistoryWithDelay && !isLoadingMore" class="animate-pulse opacity-50">Loading session...</span>
                <span v-else>{{ currentSessionSummary || 'Session' }}</span>
              </div>
              <!-- Folder Name -->
              <NuxtLink
                v-if="currentProjectDisplayName || (isLoadingHistoryWithDelay && !isLoadingMore)"
                :to="urlProjectName ? `/cli/project/${encodeURIComponent(urlProjectName)}` : '/project-artifacts'"
                class="text-[9px] md:text-[10px] font-mono leading-tight mt-0.5 text-ellipsis overflow-hidden whitespace-nowrap hover:text-accent transition-colors"
                style="color: var(--text-tertiary);"
                @click.prevent="urlProjectName && handleClaudeCodeProjectSelected({ projectName: urlProjectName, projectDisplayName: currentProjectDisplayName })"
              >
                <span v-if="isLoadingHistoryWithDelay && !isLoadingMore" class="animate-pulse opacity-50">Loading session...</span>
                <span v-else>{{ currentProjectDisplayName || 'Artifacts' }}</span>
              </NuxtLink>
            </div>
          </template>

          <!-- Live Mode Indicators -->
          <template v-else>
            <div class="flex flex-wrap items-center gap-2">
              <!-- Connection Status -->
              <div
                v-if="isConnected"
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: rgba(13, 188, 121, 0.1); color: #0dbc79;"
              >
                <div class="size-1.5 rounded-full animate-pulse" style="background: #0dbc79;" />
                <span>Connected</span>
              </div>
              <div
                v-else
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: var(--surface-raised); color: var(--text-disabled);"
              >
                <div class="size-1.5 rounded-full" style="background: var(--text-disabled);" />
                <span>Disconnected</span>
              </div>

              <!-- Streaming indicator -->
              <div
                v-if="isStreaming"
                class="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-medium"
                style="background: rgba(229, 169, 62, 0.1); color: var(--accent);"
              >
                <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
                <span>Generating...</span>
              </div>

              <!-- Project/Folder indicator in live mode -->
              <NuxtLink
                v-if="localWorkingDir || urlProjectName"
                :to="urlProjectName ? `/project-artifacts/${encodeURIComponent(urlProjectName)}` : '/project-artifacts'"
                class="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium min-w-0 hover-bg transition-all"
                style="background: var(--surface-raised); color: var(--text-secondary);"
                :title="localWorkingDir || selectedProjectPath || ''"
              >
                <UIcon name="i-lucide-layers" class="size-3 shrink-0" />
                <span class="truncate">{{ currentProjectDisplayName || localWorkingDir?.split('/').filter(Boolean).pop() || localWorkingDir }}</span>
              </NuxtLink>
            </div>
          </template>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Sidebar Toggles -->
          <div v-if="(urlProjectName || currentSessionId || urlSessionId) && !isLoadingHistoryWithDelay && !isCreatingSession" class="flex items-center gap-0.5">
            <UTooltip text="Context Details" :popper="{ placement: 'top' }" :ui="{ wrapper: 'flex' }">
              <button
                class="size-7 flex items-center justify-center rounded-md transition-all hover-bg"
                :style="{ color: showRightSidebar && activeRightTab === 'context' ? 'var(--accent)' : 'var(--text-tertiary)' }"
                @click="openRightTab('context')"
              >
                <UIcon name="i-lucide-database" class="size-4" />
              </button>
            </UTooltip>
            <UTooltip text="File Browser" :popper="{ placement: 'top' }" :ui="{ wrapper: 'flex' }">
              <button
                class="size-7 flex items-center justify-center rounded-md transition-all hover-bg"
                :style="{ color: showRightSidebar && activeRightTab === 'explorer' ? 'var(--accent)' : 'var(--text-tertiary)' }"
                @click="openRightTab('explorer')"
              >
                <UIcon name="i-lucide-folder-tree" class="size-4" />
              </button>
            </UTooltip>
            <UTooltip text="Git Control" :popper="{ placement: 'top' }" :ui="{ wrapper: 'flex' }">
              <button
                class="size-7 flex items-center justify-center rounded-md transition-all hover-bg"
                :style="{ color: showRightSidebar && activeRightTab === 'git' ? 'var(--accent)' : 'var(--text-tertiary)' }"
                @click="openRightTab('git')"
              >
                <UIcon name="i-lucide-git-branch" class="size-4" />
              </button>
            </UTooltip>
            <UTooltip text="Terminal" :popper="{ placement: 'top' }" :ui="{ wrapper: 'flex' }">
              <button
                class="size-7 flex items-center justify-center rounded-md transition-all hover-bg"
                :style="{ color: terminalPaneRef?.isOpen ? 'var(--accent)' : 'var(--text-tertiary)' }"
                @click="terminalPaneRef?.toggle()"
              >
                <UIcon name="i-lucide-terminal" class="size-4" />
              </button>
            </UTooltip>
            <UTooltip text="Search Messages" :popper="{ placement: 'top' }" :ui="{ wrapper: 'flex' }">
              <button
                class="size-7 flex items-center justify-center rounded-md transition-all hover-bg"
                :style="{ color: showSearch ? 'var(--accent)' : 'var(--text-tertiary)' }"
                @click="showSearch ? closeSearch() : openSearch()"
              >
                <UIcon name="i-lucide-search" class="size-4" />
              </button>
            </UTooltip>
          </div>

        </div>
        </div>
      </div>

      <!-- Messages Area -->
      <div class="flex-1 relative min-h-0 min-w-0 overflow-x-hidden">
        <!-- Loading spinners live outside the opacity-controlled container so they're always visible -->
        <div v-if="isCreatingSession" class="absolute inset-0 flex items-center justify-center z-10" :style="{ background: 'var(--surface-base)' }">
          <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="size-8 animate-spin mb-3" style="color: var(--accent);" />
            <p class="text-[13px]" style="color: var(--text-secondary);">Creating new chat...</p>
          </div>
        </div>
        <div v-else-if="viewMode === 'history' && isLoadingHistoryWithDelay && !isLoadingMore" class="absolute inset-0 flex items-center justify-center z-10" :style="{ background: 'var(--surface-base)' }">
          <div class="text-center">
            <UIcon name="i-lucide-loader-2" class="size-8 animate-spin mb-3" style="color: var(--text-secondary);" />
            <p class="text-[13px]" style="color: var(--text-secondary);">Loading history...</p>
          </div>
        </div>

        <!-- Search Bar (fixed sub-header, shown when search is active) -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div
            v-if="showSearch"
            class="shrink-0 flex items-center gap-2 px-4 py-2 border-b"
            style="border-color: var(--border-subtle); background: var(--surface-base);"
          >
            <UIcon name="i-lucide-search" class="size-3.5 shrink-0" style="color: var(--text-tertiary);" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              autocomplete="off"
              placeholder="Search messages..."
              class="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--text-disabled)]"
              style="color: var(--text-primary);"
              @keydown.escape="closeSearch"
            />
            <span v-if="searchQuery.trim()" class="text-[11px] shrink-0" style="color: var(--text-tertiary);">
              {{ searchMatchCount }} result{{ searchMatchCount !== 1 ? 's' : '' }}
            </span>
            <button
              class="p-0.5 rounded hover-bg shrink-0"
              style="color: var(--text-tertiary);"
              @click="closeSearch"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </Transition>

        <div
          ref="messagesContainerRef"
          class="h-full overflow-y-auto overflow-x-hidden pb-[220px]"
          :class="(viewMode === 'live' && !isLiveChat && !currentSessionId) ? 'flex items-center justify-center' : ''"
          :style="{
            background: 'var(--surface-base)',
            opacity: isInitialScroll ? 0 : 1,
          }"
          @scroll="handleMessagesScroll"
        >
          <!-- Welcome / Select State (centered in the full scroll area) -->
          <div v-if="viewMode === 'live' && !isLiveChat && !currentSessionId" class="text-center max-w-md px-6">
                <component
                  :is="urlProjectName ? 'NuxtLink' : 'div'"
                  :to="urlProjectName ? `/project-artifacts/${encodeURIComponent(urlProjectName)}` : undefined"
                  class="size-20 mx-auto mb-6 rounded-3xl flex items-center justify-center transition-all"
                  :class="urlProjectName ? 'hover:scale-105 cursor-pointer' : ''"
                  style="background: linear-gradient(135deg, rgba(229, 169, 62, 0.1) 0%, rgba(229, 169, 62, 0.05) 100%); border: 1px solid rgba(229, 169, 62, 0.1);"
                >
                  <UIcon :name="urlProjectName ? 'i-lucide-folder-root' : 'i-lucide-terminal'" class="size-10" style="color: var(--accent);" />
                </component>
                <h2 class="text-[20px] font-semibold mb-3" style="color: var(--text-primary); font-family: var(--font-display);">
                  {{ urlProjectName ? currentProjectDisplayName : 'Claude Code CLI' }}
                </h2>
                <p class="text-[14px] leading-relaxed mb-8" style="color: var(--text-secondary);">
                  {{ urlProjectName ? 'Select a session from this folder or start a new conversation below.' : 'Select an existing session from the history or start a new conversation to begin.' }}
                </p>
                <div class="flex flex-col gap-3">
                  <button
                    class="w-full py-3 rounded-2xl text-[13px] font-semibold transition-all flex items-center justify-center gap-2 press-scale"
                    style="background: var(--accent-muted); color: var(--accent); border: 1px solid rgba(229,169,62,0.3); box-shadow: 0 0 20px rgba(229,169,62,0.08);"
                    @mouseenter="($event.currentTarget as HTMLElement).style.background = 'rgba(229,169,62,0.18)'"
                    @mouseleave="($event.currentTarget as HTMLElement).style.background = 'var(--accent-muted)'"
                    @click="handleNewChat({ workingDir: localWorkingDir })"
                  >
                    <UIcon name="i-lucide-plus" class="size-4" />
                    Start a New Chat {{ urlProjectName ? 'in Folder' : '' }}
                  </button>
                  <NuxtLink
                    v-if="urlProjectName"
                    :to="`/project-artifacts/${encodeURIComponent(urlProjectName)}`"
                    class="w-full py-3 rounded-2xl text-[13px] font-semibold transition-all flex items-center justify-center gap-2 hover-bg"
                    style="color: var(--text-secondary); border: 1px solid var(--border-subtle);"
                  >
                    <UIcon name="i-lucide-box" class="size-4" />
                    View Artifacts
                  </NuxtLink>
                  <p v-if="!urlProjectName" class="text-[11px]" style="color: var(--text-tertiary);">
                    Browse your project history in the left sidebar
                  </p>
                </div>
            </div>

          <!-- Content column for messages (non-welcome states) -->
          <template v-else>
          <div class="max-w-[800px] mx-auto pl-4 pr-8 py-4 space-y-4 min-h-full min-w-0">

            <!-- Empty state -->
            <div v-if="!isLoadingHistoryWithDelay && !isCreatingSession && displayMessages.length === 0 && !isStreaming && !isLoadingClaudeCodeMessages" class="flex items-center justify-center h-full">
              <div class="text-center max-w-md">
                <div class="size-16 mx-auto mb-4 rounded-full flex items-center justify-center" style="background: var(--surface-raised);">
                  <UIcon :name="viewMode === 'history' ? 'i-lucide-history' : 'i-lucide-message-circle'" class="size-8" style="color: var(--text-secondary);" />
                </div>
                <h2 class="text-[16px] font-semibold mb-2" style="color: var(--text-primary);">
                  {{ viewMode === 'history' ? 'No Messages Found' : 'Start a Conversation' }}
                </h2>
                <p class="text-[13px]" style="color: var(--text-secondary);">
                  {{ viewMode === 'history' ? 'This session has no displayable messages.' : 'Ask Claude anything. Your message will create a new session automatically.' }}
                </p>
              </div>
            </div>

            <!-- Message list -->
            <template v-else>
              <!-- Loading more indicator at top -->
              <div
                v-if="viewMode === 'history' && isLoadingMore"
                class="flex items-center justify-center py-4"
              >
                <UIcon name="i-lucide-loader-2" class="size-4 animate-spin mr-2" style="color: var(--text-secondary);" />
                <span class="text-[12px]" style="color: var(--text-secondary);">Loading older messages...</span>
              </div>

              <!-- Scroll to top hint when more messages available -->
              <div
                v-else-if="viewMode === 'history' && claudeCodeMessagesHasMore && !isLoadingMore"
                class="flex items-center justify-center py-2"
              >
                <span class="text-[11px]" style="color: var(--text-tertiary);">
                  ↑ Scroll up for older messages
                </span>
              </div>

              <ChatV2Messages
                :messages="filteredMessages"
                :is-streaming="isStreaming"
                @permission-respond="handlePermissionResponse"
                @prompt-respond="handlePromptResponse"
                @resend="handleResend"
                @open-file="handleOpenFile"
              />

            </template>
          </div>
          </template>
        </div>

        <!-- TOC: teleports to body, tracks scroll container position -->
        <ChatV2SessionToc
          v-if="filteredMessages.length > 0"
          :messages="filteredMessages"
          :scroll-container="messagesContainerRef"
        />

        <!-- Input dock — floats over messages via absolute positioning so backdrop-blur works -->
        <div
          v-if="(isLiveChat || currentSessionId || (viewMode === 'history' && urlSessionId)) && !isLoadingHistoryWithDelay && !isCreatingSession"
          class="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        >
          <!-- Gradient fades message list into dock; controls area sits on solid bg -->
          <div
            class="pointer-events-auto"
            style="background: linear-gradient(to top, var(--surface-base), var(--surface-base) 60%, transparent);"
          >
            <div class="max-w-[800px] mx-auto pl-[52px] md:pl-[60px] pr-8">
              <!-- Pending permission floats above input -->
              <ChatV2PendingPermission
                v-if="hasPendingPermissions"
                :permissions="permissions.getAllPending()"
                @respond="handlePermissionResponse"
              />
              <!-- Chat Input -->
              <ChatV2Input
                v-model="inputText"
                :disabled="isCreatingSession"
                :is-streaming="isStreaming"
                :placeholder="viewMode === 'history' && !isContinuingHistory ? 'Continue this conversation...' : 'Message Claude...'"
                @send="handleSendMessage"
                @abort="abort()"
                @abort-and-send="handleAbortAndSend"
                @focus="isInputFocused = true"
                @blur="isInputFocused = false"
              >
                <template #controls>
                  <!-- Model Selector -->
                  <ChatV2ModelSelector
                    v-if="(viewMode === 'history' && urlSessionId) || (viewMode === 'live' && (isLiveChat || !!currentSessionId))"
                    v-model="selectedModel"
                    :options="MODEL_OPTIONS_CHAT"
                  />

                  <!-- Permission Mode Selector -->
                  <ChatV2PermissionModeSelector
                    v-if="(viewMode === 'history' && urlSessionId) || (viewMode === 'live' && (isLiveChat || !!currentSessionId))"
                    v-model="selectedPermissionMode"
                    :options="permissionModeOptions"
                  />

                  <!-- Effort Level Selector -->
                  <div ref="effortMenuRef" class="relative">
                    <button
                      class="ctrl-btn"
                      :title="`Effort: ${currentEffort.label}`"
                      @click="showEffortMenu = !showEffortMenu"
                    >
                      <UIcon :name="currentEffort.icon" class="size-3.5 shrink-0" :style="{ color: currentEffort.color }" />
                      <span>{{ currentEffort.label }}</span>
                    </button>

                    <Transition
                      enter-active-class="transition duration-150 ease-out"
                      enter-from-class="opacity-0 translate-y-2 scale-95"
                      enter-to-class="opacity-100 translate-y-0 scale-100"
                      leave-active-class="transition duration-100 ease-in"
                      leave-from-class="opacity-100 translate-y-0 scale-100"
                      leave-to-class="opacity-0 translate-y-2 scale-95"
                    >
                      <div
                        v-if="showEffortMenu"
                        class="absolute bottom-full right-0 mb-1 w-56 rounded-xl border shadow-xl backdrop-blur-md overflow-hidden z-[200]"
                        style="background: var(--surface-overlay); border-color: var(--border-subtle);"
                      >
                        <div class="p-1.5">
                          <button
                            v-for="option in effortOptions"
                            :key="option.value"
                            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left"
                            :style="{
                              background: effortLevel === option.value ? `color-mix(in srgb, ${option.color} 12%, transparent)` : 'transparent',
                              color: effortLevel === option.value ? option.color : 'var(--text-primary)',
                            }"
                            @mouseenter="($event.currentTarget as HTMLElement).style.background = effortLevel === option.value ? `color-mix(in srgb, ${option.color} 12%, transparent)` : 'color-mix(in srgb, var(--text-primary) 5%, transparent)'"
                            @mouseleave="($event.currentTarget as HTMLElement).style.background = effortLevel === option.value ? `color-mix(in srgb, ${option.color} 12%, transparent)` : 'transparent'"
                            @click="effortLevel = option.value; showEffortMenu = false"
                          >
                            <UIcon :name="option.icon" class="size-4 shrink-0" :style="{ color: option.color }" />
                            <div class="min-w-0">
                              <div class="text-sm font-medium">{{ option.label }}</div>
                              <div class="text-xs truncate" style="color: var(--text-tertiary);">{{ option.description }}</div>
                            </div>
                            <UIcon v-if="effortLevel === option.value" name="i-lucide-check" class="size-3.5 ml-auto shrink-0" :style="{ color: option.color }" />
                          </button>
                        </div>
                      </div>
                    </Transition>
                  </div>

                  <!-- Context Usage -->
                  <button
                    class="ctrl-btn"
                    :title="`Context: ${contextMonitor.contextUsageText.value} — click for details`"
                    @click="openRightTab('context')"
                  >
                    <UIcon name="i-lucide-activity" class="size-3.5 shrink-0" :style="{ color: contextUsageColorHex }" />
                    <span :style="{ color: contextUsageColorHex }">{{ Math.round(contextMonitor.metrics.value.contextWindow.percentage) }}%</span>
                  </button>
                </template>
              </ChatV2Input>
            </div>
          </div>
        </div>
      </div><!-- end Messages Area -->

      </template>

      <!-- Terminal Pane — flex-col child of right panel, always at the bottom -->
      <ChatV2TerminalPane
        ref="terminalPaneRef"
        :working-dir="localWorkingDir || undefined"
      />
    </div>

  </div>

  <!-- Floating Right Sidebar - Details Panels -->
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] pointer-events-none">
      <!-- Backdrop -->
      <Transition name="fade">
        <div 
          v-if="showRightSidebar" 
          class="absolute inset-0 bg-black/10 backdrop-blur-[1px] pointer-events-auto" 
          @click="showRightSidebar = false" 
        />
      </Transition>

      <!-- Sidebar Panel -->
      <Transition name="slide">
        <div
          v-if="showRightSidebar"
          class="absolute inset-y-0 right-0 flex flex-col shadow-2xl pointer-events-auto border-l"
          :style="{
            background: 'var(--surface-overlay)',
            borderColor: 'var(--border-subtle)',
            width: `${contextSidebarWidth}px`,
            userSelect: isDraggingContextSidebar ? 'none' : undefined,
          }"
        >
          <!-- Drag handle -->
          <div
            class="absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group"
            :class="isDraggingContextSidebar ? 'bg-accent/40' : 'hover:bg-accent/30'"
            @mousedown="onContextSidebarDragStart"
          />
          
          <!-- Sidebar Header & Tabs -->
          <div class="shrink-0 h-14 border-b flex items-center justify-between" style="border-color: var(--border-subtle);">
            <div class="flex h-full items-stretch overflow-x-auto no-scrollbar">
              <button 
                class="px-4 flex items-center gap-2 border-b-2 transition-all text-[13px] font-semibold whitespace-nowrap"
                :style="{ 
                  borderColor: activeRightTab === 'context' ? 'var(--accent)' : 'transparent',
                  color: activeRightTab === 'context' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  background: activeRightTab === 'context' ? 'var(--surface-raised)' : 'transparent'
                }"
                @click="activeRightTab = 'context'"
              >
                <UIcon name="i-lucide-database" class="size-4" />
                <span>Context</span>
              </button>
              <button 
                class="px-4 flex items-center gap-2 border-b-2 transition-all text-[13px] font-semibold whitespace-nowrap"
                :style="{ 
                  borderColor: activeRightTab === 'explorer' ? 'var(--accent)' : 'transparent',
                  color: activeRightTab === 'explorer' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  background: activeRightTab === 'explorer' ? 'var(--surface-raised)' : 'transparent'
                }"
                @click="activeRightTab = 'explorer'"
              >
                <UIcon name="i-lucide-folder-tree" class="size-4" />
                <span>Explorer</span>
              </button>
              <button 
                class="px-4 flex items-center gap-2 border-b-2 transition-all text-[13px] font-semibold whitespace-nowrap"
                :style="{ 
                  borderColor: activeRightTab === 'git' ? 'var(--accent)' : 'transparent',
                  color: activeRightTab === 'git' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  background: activeRightTab === 'git' ? 'var(--surface-raised)' : 'transparent'
                }"
                @click="activeRightTab = 'git'"
              >
                <UIcon name="i-lucide-git-branch" class="size-4" />
                <span>Git</span>
              </button>
              <div
                class="flex items-center gap-1 border-b-2 transition-all text-[13px] font-semibold whitespace-nowrap"
                :style="{
                  borderColor: activeRightTab === 'preview' ? 'var(--accent)' : 'transparent',
                  background: activeRightTab === 'preview' ? 'var(--surface-raised)' : 'transparent',
                  opacity: fileEditorState.isOpen ? 1 : 0.4
                }"
              >
                <button
                  class="pl-4 pr-1 py-4 flex items-center gap-2"
                  :style="{ color: activeRightTab === 'preview' ? 'var(--text-primary)' : 'var(--text-tertiary)' }"
                  :disabled="!fileEditorState.isOpen"
                  @click="activeRightTab = 'preview'"
                >
                  <UIcon name="i-lucide-eye" class="size-4" />
                  <span>Preview</span>
                </button>
                <button
                  v-if="fileEditorState.isOpen"
                  class="mr-2 p-1 rounded-md hover:bg-[var(--surface-hover)] text-meta transition-colors"
                  @click.stop="handleClosePreview"
                >
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </div>
            </div>
            <button
              class="mx-4 p-1.5 rounded-lg hover-bg transition-all"
              style="background: var(--surface-raised);"
              @click="showRightSidebar = false"
            >
              <UIcon name="i-lucide-x" class="size-4" style="color: var(--text-tertiary);" />
            </button>
          </div>

          <!-- Tab Content -->
          <div class="flex-1 overflow-hidden flex flex-col">
            <ChatV2ContextDetails
              v-if="activeRightTab === 'context'"
              :metrics="contextMonitor.metrics.value"
              :max-turns="maxTurns"
              :max-turns-options="maxTurnsOptions"
              @update:max-turns="maxTurns = $event"
            />

            <!-- Explorer: left file tree + right file content -->
            <div v-else-if="activeRightTab === 'explorer'" class="flex-1 flex min-h-0 overflow-hidden">
              <!-- Left file tree -->
              <div
                class="flex flex-col overflow-hidden shrink-0 border-r"
                :style="{ width: panelTreeWidth + 'px', borderColor: 'var(--border-subtle)', userSelect: isDraggingPanelTree ? 'none' : undefined }"
              >
                <ChatV2FileTree
                  :project-name="urlProjectName || localWorkingDir"
                  @open-file="openPanelFile"
                />
              </div>
              <!-- Drag divider -->
              <div class="flex-1 min-w-0 flex flex-col overflow-hidden" style="background: var(--surface-overlay);">
                <!-- Empty state -->
                <div v-if="!panelOpenFile || panelOpenFile.kind !== 'file'" class="flex-1 flex flex-col items-center justify-center gap-2" style="background: var(--surface-overlay);">
                  <UIcon name="i-lucide-file-code" class="size-8 opacity-20" style="color: var(--text-tertiary);" />
                  <span class="text-[11px]" style="color: var(--text-tertiary);">Select a file to preview</span>
                </div>
                <!-- Loading -->
                <div v-else-if="panelFileLoading" class="flex-1 flex items-center justify-center" style="background: var(--surface-overlay);">
                  <UIcon name="i-lucide-loader-2" class="size-5 animate-spin mr-2" style="color: var(--text-tertiary);" />
                  <span class="text-[11px]" style="color: var(--text-tertiary);">Loading…</span>
                </div>
                <!-- File content -->
                <template v-else-if="panelOpenFile?.kind === 'file'">
                  <div class="shrink-0 px-3 py-2 border-b flex items-center gap-2" style="border-color: var(--border-subtle); background: var(--surface-raised);">
                    <UIcon name="i-lucide-file-code" class="size-3.5 shrink-0" style="color: var(--accent);" />
                    <span class="text-[11px] font-mono truncate" style="color: var(--text-primary);">{{ panelOpenFile.path.split('/').pop() }}</span>
                    <span class="text-[10px] font-mono truncate opacity-50 min-w-0" style="color: var(--text-tertiary);">{{ panelOpenFile.path.replace(/\/[^/]+$/, '/') }}</span>
                  </div>
                  <PanelFileContent :file-path="panelOpenFile.path" :content="panelFileContent" />
                </template>
              </div>
            </div>

            <!-- Git: left change list + right diff content -->
            <div v-else-if="activeRightTab === 'git'" class="flex-1 flex min-h-0 overflow-hidden">
              <!-- Left git list -->
              <div
                class="flex flex-col overflow-hidden shrink-0 border-r"
                :style="{ width: panelTreeWidth + 'px', borderColor: 'var(--border-subtle)', userSelect: isDraggingPanelTree ? 'none' : undefined }"
              >
                <ChatV2GitPanel
                  ref="gitPanelRef"
                  :project-name="urlProjectName || localWorkingDir"
                  @open-diff="handleOpenDiff"
                />
              </div>
              <!-- Drag divider -->
              <div
                class="w-1 shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors z-10"
                :class="isDraggingPanelTree ? 'bg-accent/40' : ''"
                @mousedown="onPanelTreeDragStart"
              />
              <!-- Right diff area -->
              <div class="flex-1 min-w-0 flex flex-col overflow-hidden" style="background: var(--surface-overlay);">
                <!-- Empty state -->
                <div v-if="!panelOpenFile || panelOpenFile.kind !== 'diff'" class="flex-1 flex flex-col items-center justify-center gap-2" style="background: var(--surface-overlay);">
                  <UIcon name="i-lucide-git-branch" class="size-8 opacity-20" style="color: var(--text-tertiary);" />
                  <span class="text-[11px]" style="color: var(--text-tertiary);">Select a file to view diff</span>
                </div>
                <!-- Loading -->
                <div v-else-if="panelDiffPending" class="flex-1 flex items-center justify-center" style="background: var(--surface-overlay);">
                  <UIcon name="i-lucide-loader-2" class="size-5 animate-spin mr-2" style="color: var(--text-tertiary);" />
                  <span class="text-[11px]" style="color: var(--text-tertiary);">Loading diff…</span>
                </div>
                <!-- Diff content -->
                <template v-else-if="panelOpenFile?.kind === 'diff' && panelDiffResult">
                  <div class="shrink-0 px-3 py-2 border-b flex items-center gap-2" style="border-color: var(--border-subtle); background: var(--surface-raised);">
                    <UIcon name="i-lucide-git-branch" class="size-3.5 shrink-0" style="color: var(--accent);" />
                    <span class="text-[11px] font-mono truncate" style="color: var(--text-primary);">{{ panelOpenFile.path.split('/').pop() }}</span>
                    <span class="text-[10px] font-mono truncate opacity-50 min-w-0 flex-1" style="color: var(--text-tertiary);">{{ panelOpenFile.path.replace(/\/[^/]+$/, '/') }}</span>
                    <span class="shrink-0 text-[10px] font-mono tabular-nums" style="color: #22c55e;">+{{ panelDiffResult.addCount }}</span>
                    <span class="shrink-0 text-[10px] font-mono tabular-nums" style="color: #ef4444;">-{{ panelDiffResult.removeCount }}</span>
                  </div>
                  <div class="flex-1 overflow-y-auto">
                    <DiffView :diff="panelDiffResult" :loading="false" />
                  </div>
                </template>
              </div>
            </div>

            <div v-else-if="activeRightTab === 'preview'" class="flex-1 overflow-hidden flex flex-col">
              <FileEditorSidebarContent />
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 6px;
  color: var(--text-secondary);
  transition: color 0.15s;
}
.ctrl-btn:hover {
  color: var(--text-primary);
}

:global(body.dragging-context-sidebar) {
  cursor: col-resize !important;
  user-select: none !important;
}

.slide-enter-active, .slide-leave-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(100%);
  opacity: 0.8;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
