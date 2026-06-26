<script setup lang="ts">
import type { Settings } from '~/types'
import { MODEL_OPTIONS_COMPACT, DEFAULT_MODEL } from '~/utils/models'
import type { AgentModel } from '~/types'

const { settings, loading, load, save } = useSettings()
const {
  skillImports,
  agentImports,
  loading: importsLoading,
  fetchImports: fetchGithubImports,
  checkUpdates,
  updateImport,
  removeImport,
} = useGithubImports()

const githubImports = computed(() => {
  return [
    ...(skillImports?.value || []).map(i => ({ ...i, type: 'skills' as const })),
    ...(agentImports?.value || []).map(i => ({ ...i, type: 'agents' as const }))
  ]
})

const toast = useToast()

const rawJson = ref('')
const saving = ref(false)
const viewMode = ref<'structured' | 'raw'>('structured')
const showRemoveConfirm = ref(false)
const repoToRemove = ref<{ owner: string; repo: string; type: 'skills' | 'agents'; count: number } | null>(null)

onMounted(async () => {
  await load()
  syncRawJson()
  loadClaudeMd()
  loadMemoryMd()
})

onMounted(async () => {
  await Promise.all([
    fetchGithubImports('skills'),
    fetchGithubImports('agents')
  ])
})

async function onUpdateImport(owner: string, repo: string, type: 'skills' | 'agents') {
  try {
    await updateImport(owner, repo, type)
    toast.add({ title: 'Import updated', color: 'success' })
  } catch {
    toast.add({ title: 'Update failed', color: 'error' })
  }
}

async function onRemoveImport(owner: string, repo: string, type: 'skills' | 'agents') {
  const list = type === 'skills' ? skillImports : agentImports
  const entry = list.value.find(i => i.owner === owner && i.repo === repo)
  
  repoToRemove.value = {
    owner,
    repo,
    type,
    count: entry?.selectedItems?.length || 0
  }
  showRemoveConfirm.value = true
}

async function confirmRemove() {
  if (!repoToRemove.value) return
  const { owner, repo, type } = repoToRemove.value
  
  try {
    await removeImport(owner, repo, type)
    toast.add({ title: 'Import removed', color: 'success' })
  } catch {
    toast.add({ title: 'Remove failed', color: 'error' })
  } finally {
    showRemoveConfirm.value = false
    repoToRemove.value = null
  }
}

async function onCheckUpdates() {
  try {
    await Promise.all([
      checkUpdates('skills'),
      checkUpdates('agents')
    ])
    toast.add({ title: 'Update check complete', color: 'success' })
  } catch {
    toast.add({ title: 'Update check failed', color: 'error' })
  }
}

watch(settings, () => syncRawJson())

function syncRawJson() {
  if (settings.value) rawJson.value = JSON.stringify(settings.value, null, 2)
}

// ---- Structured field helpers ----

async function updateSetting(patch: Partial<Settings>) {
  if (!settings.value) return
  saving.value = true
  try {
    await save({ ...settings.value, ...patch })
    toast.add({ title: 'Settings saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Failed to save', description: e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function toggleAlwaysThinking(enabled: boolean) {
  await updateSetting({ alwaysThinkingEnabled: enabled })
}

// ---- Default model ----

const defaultModel = ref<AgentModel | ''>('')

watch(settings, (val) => {
  defaultModel.value = (val?.model as AgentModel) || ''
}, { immediate: true })

async function saveDefaultModel(val: AgentModel | '') {
  defaultModel.value = val
  if (!val) {
    const { model: _, ...rest } = settings.value || {}
    await updateSetting(rest as Settings)
  } else {
    await updateSetting({ model: val })
  }
}

// ---- Environment variables ----

const envRows = ref<{ key: string; value: string }[]>([])

watch(settings, (val) => {
  const env = (val?.env as Record<string, string>) || {}
  envRows.value = Object.entries(env).map(([key, value]) => ({ key, value }))
  if (envRows.value.length === 0) envRows.value.push({ key: '', value: '' })
}, { immediate: true })

function addEnvRow() {
  envRows.value.push({ key: '', value: '' })
}

function removeEnvRow(idx: number) {
  envRows.value.splice(idx, 1)
  if (envRows.value.length === 0) envRows.value.push({ key: '', value: '' })
  saveEnvVars()
}

async function saveEnvVars() {
  const env: Record<string, string> = {}
  for (const row of envRows.value) {
    if (row.key.trim()) env[row.key.trim()] = row.value
  }
  await updateSetting({ env: Object.keys(env).length > 0 ? env : undefined })
}

async function togglePlugin(name: string, enabled: boolean) {
  if (!settings.value) return
  await updateSetting({
    enabledPlugins: {
      ...settings.value.enabledPlugins,
      [name]: enabled,
    },
  })
}

async function removePlugin(name: string) {
  if (!settings.value?.enabledPlugins) return
  const { [name]: _, ...rest } = settings.value.enabledPlugins as Record<string, boolean>
  await updateSetting({ enabledPlugins: rest })
}

// ---- Permissions ----

const permAllowRules = ref<string[]>([])
const permDenyRules = ref<string[]>([])
const newAllowRule = ref('')
const newDenyRule = ref('')

watch(settings, (val) => {
  const perms = val?.permissions as { allow?: string[]; deny?: string[] } | undefined
  permAllowRules.value = [...(perms?.allow || [])]
  permDenyRules.value = [...(perms?.deny || [])]
}, { immediate: true })

async function savePermissions() {
  const allow = permAllowRules.value.filter(r => r.trim())
  const deny = permDenyRules.value.filter(r => r.trim())
  const permissions: Record<string, string[]> = {}
  if (allow.length) permissions.allow = allow
  if (deny.length) permissions.deny = deny
  await updateSetting({ permissions: Object.keys(permissions).length > 0 ? permissions : undefined })
}

function addAllowRule() {
  const rule = newAllowRule.value.trim()
  if (!rule || permAllowRules.value.includes(rule)) return
  permAllowRules.value.push(rule)
  newAllowRule.value = ''
  savePermissions()
}

function removeAllowRule(idx: number) {
  permAllowRules.value.splice(idx, 1)
  savePermissions()
}

function addDenyRule() {
  const rule = newDenyRule.value.trim()
  if (!rule || permDenyRules.value.includes(rule)) return
  permDenyRules.value.push(rule)
  newDenyRule.value = ''
  savePermissions()
}

function removeDenyRule(idx: number) {
  permDenyRules.value.splice(idx, 1)
  savePermissions()
}

// ---- Status line ----

const statusLineType = ref('')
const statusLineCommand = ref('')

const statusLineOptions = [
  { value: '', label: 'None', description: 'Disable the status line' },
  { value: 'command', label: 'Command', description: 'Run a bash command to get status' },
]

watch(settings, (val) => {
  if (val?.statusLine) {
    statusLineType.value = val.statusLine.type || ''
    statusLineCommand.value = val.statusLine.command || ''
  }
}, { immediate: true })

async function saveStatusLine() {
  if (!statusLineType.value && !statusLineCommand.value) {
    const { statusLine: _, ...rest } = settings.value || {}
    await updateSetting(rest as Settings)
  } else {
    await updateSetting({
      statusLine: {
        type: statusLineType.value,
        command: statusLineCommand.value,
      },
    })
  }
}

// ---- Hooks ----

const hooks = computed(() => {
  if (!settings.value?.hooks) return []
  return Object.entries(settings.value.hooks as Record<string, unknown[]>).map(([event, list]) => ({
    event,
    commands: Array.isArray(list) ? list : [],
  }))
})

const showAddHookModal = ref(false)
const newHookEvent = ref<string | undefined>('')
const newHookCommand = ref('')
const newHookMatcher = ref('')

const hookEventOptions = [
  { value: 'PreToolUse', label: 'Before Claude uses a tool', description: 'Triggered just before a tool is executed' },
  { value: 'PostToolUse', label: 'After Claude uses a tool', description: 'Triggered after a tool execution completes' },
  { value: 'Notification', label: 'When a notification is sent', description: 'Triggered when the system sends a notification' },
  { value: 'Stop', label: 'When Claude finishes', description: 'Triggered when the session finishes' },
  { value: 'SubagentStop', label: 'When a sub-agent finishes', description: 'Triggered when a background sub-agent finishes' },
  { value: 'PreCompact', label: 'Before context is compacted', description: 'Triggered before Claude compresses the context window' },
]

const hookEventLabels: Record<string, string> = {
  PreToolUse: 'Before Claude uses a tool',
  PostToolUse: 'After Claude uses a tool',
  Notification: 'When a notification is sent',
  Stop: 'When Claude finishes',
  SubagentStop: 'When a sub-agent finishes',
  PreCompact: 'Before context is compacted',
}

async function addHook() {
  if (!newHookEvent.value || !newHookCommand.value) return
  const currentHooks = (settings.value?.hooks || {}) as Record<string, unknown[]>
  const eventHooks = [...(currentHooks[newHookEvent.value] || [])]

  const hookEntry: Record<string, string> = { command: newHookCommand.value }
  if (newHookMatcher.value) hookEntry.matcher = newHookMatcher.value

  eventHooks.push(hookEntry)

  await updateSetting({
    hooks: { ...currentHooks, [newHookEvent.value]: eventHooks },
  })

  newHookEvent.value = ''
  newHookCommand.value = ''
  newHookMatcher.value = ''
  showAddHookModal.value = false
}

async function removeHook(event: string, index: number) {
  const currentHooks = (settings.value?.hooks || {}) as Record<string, unknown[]>
  const eventHooks = [...(currentHooks[event] || [])]
  eventHooks.splice(index, 1)

  const updatedHooks = { ...currentHooks }
  if (eventHooks.length === 0) {
    delete updatedHooks[event]
  } else {
    updatedHooks[event] = eventHooks
  }

  await updateSetting({ hooks: Object.keys(updatedHooks).length > 0 ? updatedHooks : undefined })
}

// ---- CLAUDE.md ----

const claudeMdContent = ref('')
const claudeMdDraft = ref('')
const claudeMdExists = ref(false)
const claudeMdLoading = ref(false)
const claudeMdSaving = ref(false)
const claudeMdEditing = ref(false)
const claudeMdDirty = computed(() => claudeMdDraft.value !== claudeMdContent.value)

const CLAUDE_MD_DEFAULT = `# Project Instructions

This file provides instructions to Claude Code when working in this directory.

## Guidelines

-
`

async function loadClaudeMd() {
  claudeMdLoading.value = true
  try {
    const res = await $fetch<{ exists: boolean; content: string }>('/api/claude-md')
    claudeMdExists.value = res.exists
    claudeMdContent.value = res.content
    claudeMdDraft.value = res.content
    claudeMdEditing.value = res.exists
  } catch (e: any) {
    toast.add({ title: 'Failed to load CLAUDE.md', description: e.message, color: 'error' })
  } finally {
    claudeMdLoading.value = false
  }
}

async function saveClaudeMd() {
  claudeMdSaving.value = true
  try {
    await $fetch('/api/claude-md', { method: 'PUT', body: { content: claudeMdDraft.value } })
    claudeMdContent.value = claudeMdDraft.value
    claudeMdExists.value = true
    claudeMdEditing.value = true
    toast.add({ title: 'CLAUDE.md saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Failed to save CLAUDE.md', description: e.message, color: 'error' })
  } finally {
    claudeMdSaving.value = false
  }
}

function createClaudeMd() {
  claudeMdDraft.value = CLAUDE_MD_DEFAULT
  claudeMdEditing.value = true
}

// ---- MEMORY.md ----

const memoryMdContent = ref('')
const memoryMdDraft = ref('')
const memoryMdExists = ref(false)
const memoryMdLoading = ref(false)
const memoryMdSaving = ref(false)
const memoryMdEditing = ref(false)
const memoryMdDirty = computed(() => memoryMdDraft.value !== memoryMdContent.value)

const MEMORY_MD_DEFAULT = `# Memory

Claude will remember the following facts across all conversations:

-
`

async function loadMemoryMd() {
  memoryMdLoading.value = true
  try {
    const res = await $fetch<{ exists: boolean; content: string }>('/api/memory-md')
    memoryMdExists.value = res.exists
    memoryMdContent.value = res.content
    memoryMdDraft.value = res.content
    memoryMdEditing.value = res.exists
  } catch (e: any) {
    toast.add({ title: 'Failed to load MEMORY.md', description: e.message, color: 'error' })
  } finally {
    memoryMdLoading.value = false
  }
}

async function saveMemoryMd() {
  memoryMdSaving.value = true
  try {
    await $fetch('/api/memory-md', { method: 'PUT', body: { content: memoryMdDraft.value } })
    memoryMdContent.value = memoryMdDraft.value
    memoryMdExists.value = true
    memoryMdEditing.value = true
    toast.add({ title: 'MEMORY.md saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Failed to save MEMORY.md', description: e.message, color: 'error' })
  } finally {
    memoryMdSaving.value = false
  }
}

function createMemoryMd() {
  memoryMdDraft.value = MEMORY_MD_DEFAULT
  memoryMdEditing.value = true
}

// ---- Raw JSON ----

async function saveRaw() {
  saving.value = true
  try {
    const parsed = JSON.parse(rawJson.value)
    await save(parsed)
    toast.add({ title: 'Settings saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Invalid JSON', description: e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// Cmd+S
if (import.meta.client) {
  const onKeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (viewMode.value === 'raw') saveRaw()
    }
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}

const plugins = computed(() => {
  if (!settings.value?.enabledPlugins) return []
  return Object.entries(settings.value.enabledPlugins).map(([name, enabled]) => ({
    name,
    enabled: Boolean(enabled),
  }))
})

const charCount = computed(() => rawJson.value.length)
const lineCount = computed(() => rawJson.value.split('\n').length)
</script>

<template>
  <div>
    <PageHeader title="Settings">
      <template #right>
        <button
          class="text-[12px] px-2 py-1 rounded focus-ring text-label"
          style="background: var(--surface-raised); border: 1px solid var(--border-default);"
          @click="viewMode = viewMode === 'structured' ? 'raw' : 'structured'"
        >
          {{ viewMode === 'structured' ? 'Raw JSON' : 'Structured' }}
        </button>
        <UButton v-if="viewMode === 'raw'" label="Save" icon="i-lucide-save" size="sm" :loading="saving" @click="saveRaw" />
      </template>
    </PageHeader>

    <div v-if="loading" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-meta" />
    </div>

    <!-- Structured view -->
    <div v-else-if="viewMode === 'structured'" class="px-6 py-4 space-y-6">

      <!-- General -->
      <div
        class="rounded-xl p-5 space-y-4 bg-card"
      >
        <h3 class="text-section-title">General</h3>

        <div class="space-y-4">
          <!-- Always Thinking toggle -->
          <div class="flex items-center justify-between">
            <div>
              <div class="text-[13px] font-medium">Always Thinking</div>
              <div class="text-[12px] mt-0.5 text-label">
                When enabled, Claude takes more time to reason through complex problems before responding. Better answers, but slower and uses more resources.
              </div>
            </div>
            <label class="field-toggle">
              <input
                type="checkbox"
                :checked="settings?.alwaysThinkingEnabled"
                @change="toggleAlwaysThinking(($event.target as HTMLInputElement).checked)"
              />
              <span class="field-toggle__track">
                <span class="field-toggle__thumb" />
              </span>
            </label>
          </div>

          <!-- Default model -->
          <div>
            <div class="text-[13px] font-medium mb-1">Default Model</div>
            <div class="text-[12px] text-label mb-2">Model used when no agent specifies one.</div>
            <div class="flex gap-1.5">
              <button
                v-for="opt in MODEL_OPTIONS_COMPACT"
                :key="opt.value"
                class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors focus-ring"
                :style="defaultModel === opt.value
                  ? 'background: var(--accent); color: var(--accent-fg);'
                  : 'background: var(--input-bg); color: var(--text-secondary);'"
                @click="saveDefaultModel(opt.value)"
              >
                {{ opt.label }}
              </button>
              <button
                class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors focus-ring"
                :style="!defaultModel
                  ? 'background: var(--accent); color: var(--accent-fg);'
                  : 'background: var(--input-bg); color: var(--text-secondary);'"
                @click="saveDefaultModel('')"
              >
                Default
              </button>
            </div>
          </div>

          <!-- Environment variables -->
          <div>
            <div class="text-[13px] font-medium mb-1">Environment Variables</div>
            <div class="text-[12px] text-label mb-2">Passed to every Claude Code session.</div>
            <div class="space-y-1.5">
              <div
                v-for="(row, idx) in envRows"
                :key="idx"
                class="flex gap-2 items-center"
              >
                <input
                  v-model="row.key"
                  class="field-input font-mono text-[12px] flex-1"
                  placeholder="KEY"
                  @blur="saveEnvVars"
                  @keydown.enter="saveEnvVars"
                />
                <span class="text-meta text-[12px]">=</span>
                <input
                  v-model="row.value"
                  class="field-input font-mono text-[12px] flex-[2]"
                  placeholder="value"
                  @blur="saveEnvVars"
                  @keydown.enter="saveEnvVars"
                />
                <button
                  class="p-1.5 rounded focus-ring text-meta hover:text-error transition-colors shrink-0"
                  aria-label="Remove variable"
                  @click="removeEnvRow(idx)"
                >
                  <UIcon name="i-lucide-x" class="size-3.5" />
                </button>
              </div>
            </div>
            <button
              class="mt-2 flex items-center gap-1 text-[12px] text-meta hover:text-body transition-colors"
              @click="addEnvRow"
            >
              <UIcon name="i-lucide-plus" class="size-3.5" />
              Add variable
            </button>
          </div>
        </div>
      </div>

      <!-- Permissions -->
      <div class="rounded-xl p-5 space-y-5 bg-card">
        <div>
          <h3 class="text-section-title">Permissions</h3>
          <p class="text-[12px] text-meta mt-1">
            Control which tools and operations Claude is allowed or blocked from using. Format: <span class="font-mono">Tool</span> or <span class="font-mono">Tool(pattern)</span>.
          </p>
        </div>

        <!-- Allow list -->
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <div class="size-2 rounded-full shrink-0" style="background: var(--success, #22c55e);" />
            <span class="text-[12px] font-medium text-body">Always allow</span>
          </div>
          <div class="ml-4 space-y-1">
            <div
              v-for="(rule, idx) in permAllowRules"
              :key="idx"
              class="flex items-center justify-between py-1.5 px-3 rounded-lg group"
              style="background: var(--input-bg);"
            >
              <span class="font-mono text-[12px] text-label">{{ rule }}</span>
              <button
                class="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded focus-ring"
                style="color: var(--error);"
                @click="removeAllowRule(idx)"
              >
                <UIcon name="i-lucide-x" class="size-3" />
              </button>
            </div>
            <div v-if="permAllowRules.length === 0" class="text-[12px] text-meta italic pl-1">No rules — all tools require approval</div>
          </div>
          <div class="ml-4 flex gap-2">
            <input
              v-model="newAllowRule"
              class="field-input font-mono text-[12px] flex-1"
              placeholder="e.g. Bash(git *) or Read"
              @keydown.enter="addAllowRule"
            />
            <UButton label="Add" size="xs" variant="soft" color="success" :disabled="!newAllowRule.trim()" @click="addAllowRule" />
          </div>
        </div>

        <!-- Deny list -->
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <div class="size-2 rounded-full shrink-0" style="background: var(--error, #ef4444);" />
            <span class="text-[12px] font-medium text-body">Always deny</span>
          </div>
          <div class="ml-4 space-y-1">
            <div
              v-for="(rule, idx) in permDenyRules"
              :key="idx"
              class="flex items-center justify-between py-1.5 px-3 rounded-lg group"
              style="background: var(--input-bg);"
            >
              <span class="font-mono text-[12px] text-label">{{ rule }}</span>
              <button
                class="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded focus-ring"
                style="color: var(--error);"
                @click="removeDenyRule(idx)"
              >
                <UIcon name="i-lucide-x" class="size-3" />
              </button>
            </div>
            <div v-if="permDenyRules.length === 0" class="text-[12px] text-meta italic pl-1">No rules</div>
          </div>
          <div class="ml-4 flex gap-2">
            <input
              v-model="newDenyRule"
              class="field-input font-mono text-[12px] flex-1"
              placeholder="e.g. Bash(rm -rf *)"
              @keydown.enter="addDenyRule"
            />
            <UButton label="Add" size="xs" variant="soft" color="error" :disabled="!newDenyRule.trim()" @click="addDenyRule" />
          </div>
        </div>
      </div>

      <!-- Status Line -->
      <div
        class="rounded-xl p-5 space-y-4 bg-card"
      >
        <h3 class="text-section-title">Status Line</h3>
        <p class="text-[12px] text-meta">
          Shows custom information in Claude Code's interface. Use a bash command to display dynamic content.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="field-group">
            <label class="field-label">Type</label>
            <USelectDropdown v-model="statusLineType" :options="statusLineOptions" />
          </div>
          <div class="field-group">
            <label class="field-label">Command</label>
            <input v-model="statusLineCommand" class="field-input" placeholder="echo 'status...'" />
          </div>
        </div>

        <div class="flex justify-end">
          <UButton label="Save Status Line" size="sm" variant="soft" :loading="saving" @click="saveStatusLine" />
        </div>
      </div>

      <!-- Plugins -->
      <div
        class="rounded-xl p-5 space-y-4 bg-card"
      >
        <h3 class="text-section-label flex items-center gap-2">
          Extensions
          <HelpTip title="Managing extensions" body="Enable or disable extensions here. Install new ones via the Claude Code CLI." />
        </h3>
        <div v-if="plugins.length === 0" class="text-[13px] text-label">
          No plugins configured.
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="plugin in plugins"
            :key="plugin.name"
            class="flex items-center justify-between py-2 px-3 rounded-lg"
            style="background: var(--input-bg);"
          >
            <span class="font-mono text-[12px] text-body">{{ plugin.name }}</span>
            <div class="flex items-center gap-3">
              <label class="field-toggle">
                <input
                  type="checkbox"
                  :checked="plugin.enabled"
                  @change="togglePlugin(plugin.name, ($event.target as HTMLInputElement).checked)"
                />
                <span class="field-toggle__track">
                  <span class="field-toggle__thumb" />
                </span>
              </label>
              <button
                class="p-1.5 -m-0.5 rounded focus-ring text-meta"
                aria-label="Remove plugin from settings"
                @click="removePlugin(plugin.name)"
              >
                <UIcon name="i-lucide-x" class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- GitHub Imports -->
      <div class="rounded-xl p-5 space-y-4 bg-card">
        <div class="flex items-center justify-between">
          <h3 class="text-section-title">GitHub Imports</h3>
          <UButton
            v-if="githubImports.length > 0"
            label="Check for updates"
            icon="i-lucide-refresh-cw"
            size="xs"
            variant="soft"
            @click="onCheckUpdates"
          />
        </div>
        <p class="text-[12px] text-meta">
          Manage repositories imported from GitHub.
        </p>

        <div v-if="githubImports.length === 0" class="text-[13px] text-label">
          No GitHub imports. Use the Explore page to import skills from GitHub.
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="entry in githubImports"
            :key="`${entry.type}/${entry.owner}/${entry.repo}`"
            class="flex items-center justify-between py-2 px-3 rounded-lg"
            style="background: var(--input-bg);"
          >
            <div class="flex-1 min-w-0 flex items-center gap-2">
              <span class="font-mono text-[12px] text-body">{{ entry.owner }}/{{ entry.repo }}</span>
              <span 
                class="text-[9px] font-mono px-1.5 py-px rounded-full uppercase" 
                style="background: var(--badge-subtle-bg); color: var(--text-tertiary); border: 1px solid var(--border-subtle);"
              >
                {{ entry.type }}
              </span>
              <span class="text-[10px] text-meta ml-1">{{ entry.selectedItems?.length || 0 }} items</span>
            </div>
            <div class="flex items-center gap-2">
              <span
                v-if="entry.currentSha !== entry.remoteSha"
                class="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style="background: rgba(59, 130, 246, 0.1); color: var(--info, #3b82f6);"
              >
                Update available
              </span>
              <UButton
                v-if="entry.currentSha !== entry.remoteSha"
                label="Update"
                size="xs"
                variant="soft"
                @click="onUpdateImport(entry.owner, entry.repo, entry.type)"
              />
              <button
                class="p-1.5 -m-0.5 rounded focus-ring text-meta hover:text-error transition-colors"
                aria-label="Remove import"
                @click="onRemoveImport(entry.owner, entry.repo, entry.type)"
              >
                <UIcon name="i-lucide-trash-2" class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Hooks -->
      <div
        class="rounded-xl p-5 space-y-4 bg-card"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-section-title">Automations</h3>
          <UButton label="Add Automation" icon="i-lucide-plus" size="xs" variant="soft" @click="showAddHookModal = true" />
        </div>
        <p class="text-[12px] text-meta">
          Run shell commands automatically when certain events happen in Claude Code.
        </p>

        <div v-if="hooks.length === 0" class="text-[13px] text-label">
          No automations configured.
        </div>

        <div v-else class="space-y-3">
          <div v-for="hook in hooks" :key="hook.event">
            <div class="flex items-center gap-2 mb-1.5">
              <UIcon name="i-lucide-webhook" class="size-3.5 text-meta" />
              <span class="text-[12px] font-medium text-body">{{ hookEventLabels[hook.event] || hook.event }}</span>
              <span class="font-mono text-[10px] text-meta">{{ hook.commands.length }}</span>
            </div>
            <div class="ml-5 space-y-1">
              <div
                v-for="(cmd, idx) in hook.commands"
                :key="idx"
                class="flex items-center justify-between py-1.5 px-3 rounded-lg group"
                style="background: var(--input-bg);"
              >
                <div class="flex-1 min-w-0">
                  <span class="font-mono text-[12px] truncate block text-label">
                    {{ typeof cmd === 'string' ? cmd : (cmd as any).command || JSON.stringify(cmd) }}
                  </span>
                  <span
                    v-if="typeof cmd === 'object' && (cmd as any).matcher"
                    class="font-mono text-[10px] block mt-0.5 text-meta"
                  >
                    matcher: {{ (cmd as any).matcher }}
                  </span>
                </div>
                <button
                  class="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 -m-0.5 rounded focus-ring"
                  style="color: var(--error);"
                  aria-label="Delete hook"
                  @click="removeHook(hook.event, idx)"
                >
                  <UIcon name="i-lucide-trash-2" class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- CLAUDE.md -->
      <div class="rounded-xl p-5 space-y-4 bg-card">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h3 class="text-section-title">CLAUDE.md</h3>
            <span
              v-if="claudeMdExists"
              class="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style="background: rgba(34,197,94,0.1); color: var(--success, #22c55e);"
            >exists</span>
            <span
              v-else
              class="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style="background: var(--surface-raised); color: var(--text-tertiary);"
            >not created</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="claudeMdDirty"
              label="Save"
              icon="i-lucide-save"
              size="xs"
              :loading="claudeMdSaving"
              @click="saveClaudeMd"
            />
          </div>
        </div>
        <p class="text-[12px] text-meta">
          Global instructions for Claude Code. Loaded automatically at the start of every session from <span class="font-mono">~/.claude/CLAUDE.md</span>.
        </p>

        <div v-if="claudeMdLoading" class="flex justify-center py-6">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
        </div>

        <template v-else>
          <div v-if="!claudeMdEditing" class="text-center py-6 space-y-3">
            <UIcon name="i-lucide-file-text" class="size-8 text-meta mx-auto" />
            <p class="text-[13px] text-label">No global CLAUDE.md yet.</p>
            <UButton label="Create CLAUDE.md" icon="i-lucide-plus" size="sm" variant="soft" @click="createClaudeMd" />
          </div>

          <div v-else class="space-y-2">
            <textarea
              v-model="claudeMdDraft"
              class="editor-textarea font-mono text-[12px]"
              style="min-height: 240px; max-height: 480px; resize: vertical;"
              spellcheck="false"
              placeholder="# Project Instructions&#10;&#10;Write instructions for Claude here..."
            />
            <div class="flex items-center justify-between">
              <span class="text-[11px] text-meta font-mono">{{ claudeMdDraft.split('\n').length }} lines · {{ claudeMdDraft.length.toLocaleString() }} chars</span>
              <div class="flex items-center gap-2">
                <span v-if="claudeMdDirty" class="text-[11px] text-meta">Unsaved changes</span>
                <UButton
                  label="Save"
                  icon="i-lucide-save"
                  size="xs"
                  :loading="claudeMdSaving"
                  :disabled="!claudeMdDirty"
                  @click="saveClaudeMd"
                />
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- MEMORY.md -->
      <div class="rounded-xl p-5 space-y-4 bg-card">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h3 class="text-section-title">MEMORY.md</h3>
            <span
              v-if="memoryMdExists"
              class="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style="background: rgba(34,197,94,0.1); color: var(--success, #22c55e);"
            >exists</span>
            <span
              v-else
              class="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style="background: var(--surface-raised); color: var(--text-tertiary);"
            >not created</span>
          </div>
        </div>
        <p class="text-[12px] text-meta">
          Persistent facts Claude remembers across all sessions. Stored at <span class="font-mono">~/.claude/MEMORY.md</span>.
        </p>

        <div v-if="memoryMdLoading" class="flex justify-center py-6">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
        </div>

        <template v-else>
          <div v-if="!memoryMdEditing" class="text-center py-6 space-y-3">
            <UIcon name="i-lucide-brain" class="size-8 text-meta mx-auto" />
            <p class="text-[13px] text-label">No global MEMORY.md yet.</p>
            <UButton label="Create MEMORY.md" icon="i-lucide-plus" size="sm" variant="soft" @click="createMemoryMd" />
          </div>

          <div v-else class="space-y-2">
            <textarea
              v-model="memoryMdDraft"
              class="editor-textarea font-mono text-[12px]"
              style="min-height: 240px; max-height: 480px; resize: vertical;"
              spellcheck="false"
              placeholder="# Memory&#10;&#10;- Fact one&#10;- Fact two"
            />
            <div class="flex items-center justify-between">
              <span class="text-[11px] text-meta font-mono">{{ memoryMdDraft.split('\n').length }} lines · {{ memoryMdDraft.length.toLocaleString() }} chars</span>
              <div class="flex items-center gap-2">
                <span v-if="memoryMdDirty" class="text-[11px] text-meta">Unsaved changes</span>
                <UButton
                  label="Save"
                  icon="i-lucide-save"
                  size="xs"
                  :loading="memoryMdSaving"
                  :disabled="!memoryMdDirty"
                  @click="saveMemoryMd"
                />
              </div>
            </div>
          </div>
        </template>
      </div>

    </div>

    <!-- Raw JSON editor -->
    <div v-else class="px-6 py-4">
      <div
        class="rounded-xl overflow-hidden"
        style="border: 1px solid var(--border-subtle);"
      >
        <div class="flex items-center justify-between px-4 py-2.5" style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle);">
          <h3 class="text-section-title">settings.json</h3>
          <div class="flex items-center gap-3">
            <span class="font-mono text-[10px] text-meta">
              {{ lineCount }} lines
            </span>
            <span class="font-mono text-[10px] text-meta">
              {{ charCount.toLocaleString() }} chars
            </span>
          </div>
        </div>
        <textarea
          v-model="rawJson"
          class="editor-textarea"
          style="min-height: 600px;"
          spellcheck="false"
        />
      </div>
    </div>

    <!-- Add Hook Modal -->
    <UModal v-model:open="showAddHookModal">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay">
          <h3 class="text-page-title">Add Automation</h3>
          <p class="text-[12px] leading-relaxed text-label">
            Run a shell command automatically when a specific event happens.
          </p>

          <div class="field-group">
            <label class="field-label" data-required>When this happens</label>
            <USelectDropdown v-model="newHookEvent" :options="hookEventOptions" placeholder="Select an event..." />
          </div>

          <div class="field-group">
            <label class="field-label" data-required>Run this command</label>
            <input v-model="newHookCommand" class="field-input" placeholder="e.g., bash -c 'echo done'" />
            <span class="field-hint">The shell command that will be executed</span>
          </div>

          <div class="field-group">
            <label class="field-label">Only for specific tools</label>
            <input v-model="newHookMatcher" class="field-input" placeholder="Leave blank for all (optional)" />
            <span class="field-hint">Only trigger when a specific tool is used (e.g., "Write" or "Bash")</span>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showAddHookModal = false" />
            <UButton
              label="Add"
              size="sm"
              :disabled="!newHookEvent || !newHookCommand"
              @click="addHook"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showRemoveConfirm">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay">
          <div class="flex items-center gap-3">
            <div class="size-10 rounded-full flex items-center justify-center shrink-0" style="background: rgba(239, 68, 68, 0.1);">
              <UIcon name="i-lucide-alert-triangle" class="size-6 text-error" />
            </div>
            <div>
              <h3 class="text-[15px] font-semibold text-primary">Remove Repository?</h3>
              <p class="text-[12px] text-label mt-1">This action cannot be undone.</p>
            </div>
          </div>

          <div class="rounded-lg p-3 border" style="background: var(--surface-base); border-color: var(--border-subtle);">
            <p class="text-[13px] leading-relaxed">
              Removing <span class="font-mono font-bold">{{ repoToRemove?.owner }}/{{ repoToRemove?.repo }}</span> will delete the local clone and unlink 
              <strong class="text-error">{{ repoToRemove?.count }} {{ repoToRemove?.type }}</strong> currently installed on your system.
            </p>
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <UButton
              label="Cancel"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="showRemoveConfirm = false"
            />
            <UButton
              label="Confirm Delete"
              color="error"
              size="sm"
              @click="confirmRemove"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
