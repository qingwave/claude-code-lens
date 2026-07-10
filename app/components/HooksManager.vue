<script setup lang="ts">
// ── Types — matches Claude Code's actual hooks schema ────────────────────────
//
// settings.json shape:
// {
//   "hooks": {
//     "EventName": [
//       { "matcher": "Bash", "hooks": [ { "command": "...", "type": "command" } ] }
//     ]
//   }
// }

interface HookCmd {
  command: string
  type?: string
  [k: string]: unknown
}

interface HookBlock {
  matcher?: string
  hooks: HookCmd[]
  disabled?: boolean
  [k: string]: unknown   // preserve unknown keys like _otty
}

// Flat view row — one per command for display/edit
interface FlatRow {
  blockIdx: number
  cmdIdx: number
  command: string
  matcher?: string
  disabled?: boolean
  source?: string              // detected app/tool that registered this hook
  extra: Record<string, unknown>
}

interface HookGroup {
  event: string
  blocks: HookBlock[]
  rows: FlatRow[]
}

interface Template {
  id: string
  label: string
  description: string
  event: string
  command: string
  matcher?: string
  icon: string
}

// ── Props / Emits ────────────────────────────────────────────────────────────

const props = defineProps<{
  modelValue: Record<string, unknown[]> | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown[]> | undefined]
}>()

// ── Event metadata ────────────────────────────────────────────────────────────

interface EventMeta {
  label: string
  icon: string
  hint: string
  color: string
  colorRaw: string
}

const EVENT_META: Record<string, EventMeta> = {
  PreToolUse:        { label: 'Before tool use',          icon: 'i-lucide-play-circle',    hint: 'Runs before each tool call. Return non-zero to block.',         color: 'var(--accent)',           colorRaw: '#b45309' },
  PostToolUse:       { label: 'After tool use',            icon: 'i-lucide-check-circle-2', hint: 'Runs after each tool call completes successfully.',             color: 'var(--success)',          colorRaw: '#059669' },
  PermissionRequest: { label: 'Permission request',        icon: 'i-lucide-shield-check',   hint: 'Runs when Claude asks for permission. Non-zero = deny.',        color: 'var(--warning)',          colorRaw: '#d97706' },
  Notification:      { label: 'On notification',           icon: 'i-lucide-bell',           hint: 'Runs when Claude sends a system notification.',                 color: 'var(--accent-secondary)', colorRaw: '#6366f1' },
  Stop:              { label: 'When Claude finishes',      icon: 'i-lucide-circle-stop',    hint: 'Runs when the session ends or Claude stops responding.',        color: 'var(--error)',            colorRaw: '#dc2626' },
  SubagentStop:      { label: 'When sub-agent finishes',   icon: 'i-lucide-cpu',            hint: 'Runs when a background sub-agent completes its task.',          color: 'var(--model-opus)',       colorRaw: '#7c3aed' },
  SessionStart:      { label: 'Session start',             icon: 'i-lucide-log-in',         hint: 'Runs when a new Claude Code session begins.',                   color: 'var(--success)',          colorRaw: '#059669' },
  UserPromptSubmit:  { label: 'User message sent',         icon: 'i-lucide-send',           hint: 'Runs each time the user submits a message.',                   color: 'var(--accent-secondary)', colorRaw: '#6366f1' },
  PreCompact:        { label: 'Before context compaction', icon: 'i-lucide-archive',        hint: 'Runs before the context window is compressed to save tokens.',  color: 'var(--text-tertiary)',    colorRaw: '#82828e' },
}

const EVENT_OPTIONS = Object.entries(EVENT_META).map(([value, m]) => ({
  value,
  label: m.label,
  description: m.hint,
}))

// ── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES: Template[] = [
  {
    id: 'macos-notify',
    label: 'macOS notification',
    description: 'Native notification when Claude stops.',
    event: 'Stop',
    command: `osascript -e 'display notification "Claude finished" with title "Claude Code"'`,
    icon: 'i-lucide-bell-ring',
  },
  {
    id: 'bash-log',
    label: 'Log Bash commands',
    description: 'Append every Bash call to a log file.',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: `echo "[$(date +%H:%M:%S)] $TOOL_INPUT" >> ~/.claude/bash-log.txt`,
    icon: 'i-lucide-scroll-text',
  },
  {
    id: 'git-commit',
    label: 'Auto git commit',
    description: 'Commit after Write or Edit tool calls.',
    event: 'PostToolUse',
    matcher: 'Write|Edit',
    command: `bash -c 'cd "$CWD" && git diff --quiet || git add -A && git commit -m "auto: claude edit" --no-verify 2>/dev/null || true'`,
    icon: 'i-lucide-git-commit-horizontal',
  },
  {
    id: 'notify-sound',
    label: 'Play sound',
    description: 'Play a system sound when Claude finishes.',
    event: 'Stop',
    command: `afplay /System/Library/Sounds/Glass.aiff 2>/dev/null || paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || true`,
    icon: 'i-lucide-volume-2',
  },
]

// ── Parse raw hooks data → HookGroup[] ──────────────────────────────────────

function parseBlocks(raw: unknown[]): HookBlock[] {
  return raw.map(item => {
    if (typeof item === 'string') {
      return { hooks: [{ command: item, type: 'command' }] }
    }
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>
      // New schema: { matcher?, hooks: [{command, type}], ...extra }
      if (Array.isArray(obj.hooks)) {
        return obj as HookBlock
      }
      // Old flat schema: { command, matcher, disabled }
      if (typeof obj.command === 'string') {
        const { command, matcher, disabled, ...extra } = obj as Record<string, unknown>
        return {
          matcher: typeof matcher === 'string' ? matcher : undefined,
          disabled: disabled === true,
          hooks: [{ command: command as string, type: 'command' }],
          ...extra,
        } as HookBlock
      }
    }
    return { hooks: [] } as HookBlock
  }).filter(b => b.hooks.length > 0)
}

// Detect which app/tool registered a hook block.
// 1. Look for _appname: true private marker keys (convention used by Otty etc.)
// 2. Fall back to extracting the first .app name from the command path
function detectSource(extra: Record<string, unknown>, command: string): string | undefined {
  // Private marker: _otty → "Otty", _myapp → "Myapp"
  for (const key of Object.keys(extra)) {
    if (key.startsWith('_') && extra[key] === true) {
      const name = key.slice(1)
      return name.charAt(0).toUpperCase() + name.slice(1)
    }
  }
  // Extract from .app path in command: /Applications/Otty.app/... → "Otty"
  const appMatch = command.match(/\/([^/]+)\.app\//)
  if (appMatch) return appMatch[1]
  return undefined
}

function flattenBlocks(blocks: HookBlock[]): FlatRow[] {
  const rows: FlatRow[] = []
  blocks.forEach((block, blockIdx) => {
    const { matcher, disabled, hooks, ...extra } = block
    hooks.forEach((cmd, cmdIdx) => {
      rows.push({
        blockIdx,
        cmdIdx,
        command: cmd.command,
        matcher: typeof matcher === 'string' ? matcher : undefined,
        disabled: disabled === true,
        source: detectSource(extra, cmd.command),
        extra,
      })
    })
  })
  return rows
}

// ── Derived state ────────────────────────────────────────────────────────────

const groups = computed<HookGroup[]>(() => {
  if (!props.modelValue) return []
  return Object.entries(props.modelValue).map(([event, list]) => {
    const blocks = parseBlocks(Array.isArray(list) ? list : [])
    return { event, blocks, rows: flattenBlocks(blocks) }
  })
})

const totalActive = computed(() =>
  groups.value.reduce((n, g) => n + g.rows.filter(r => !r.disabled).length, 0)
)
const totalDisabled = computed(() =>
  groups.value.reduce((n, g) => n + g.rows.filter(r => r.disabled).length, 0)
)

// ── Write-back helpers ────────────────────────────────────────────────────────
//
// We store each row as its own HookBlock with one hooks[] entry so edits
// never touch unrelated commands. Extra unknown keys (_otty etc.) are preserved.

function rowsToBlocks(rows: FlatRow[]): HookBlock[] {
  return rows.map(r => {
    const block: HookBlock = {
      ...r.extra,
      hooks: [{ command: r.command, type: 'command' }],
    }
    if (r.matcher) block.matcher = r.matcher
    if (r.disabled) block.disabled = true
    return block
  })
}

function currentRowMap(): Record<string, FlatRow[]> {
  const map: Record<string, FlatRow[]> = {}
  for (const g of groups.value) map[g.event] = [...g.rows]
  return map
}

function patch(rowMap: Record<string, FlatRow[]>) {
  const out: Record<string, unknown[]> = {}
  for (const [event, rows] of Object.entries(rowMap)) {
    const blocks = rowsToBlocks(rows)
    if (blocks.length > 0) out[event] = blocks
  }
  emit('update:modelValue', Object.keys(out).length > 0 ? out : undefined)
}

function toggleRow(event: string, rowIdx: number) {
  const map = currentRowMap()
  const row = map[event]?.[rowIdx]
  if (!row) return
  row.disabled = !row.disabled
  patch(map)
}

function deleteRow(event: string, rowIdx: number) {
  const map = currentRowMap()
  map[event]?.splice(rowIdx, 1)
  patch(map)
}

function saveEdit(event: string, rowIdx: number, command: string, matcher: string) {
  const map = currentRowMap()
  const row = map[event]?.[rowIdx]
  if (!row) return
  row.command = command
  row.matcher = matcher || undefined
  patch(map)
  editingKey.value = null
}

function addHook(event: string, command: string, matcher: string) {
  const map = currentRowMap()
  const newRow: FlatRow = {
    blockIdx: 0,
    cmdIdx: 0,
    command,
    matcher: matcher || undefined,
    disabled: false,
    extra: {},
  }
  map[event] = [...(map[event] ?? []), newRow]
  patch(map)
  showAddPanel.value = false
  resetForm()
}

// ── Add panel state ──────────────────────────────────────────────────────────

const showAddPanel = ref(false)
const formEvent = ref('')
const formCommand = ref('')
const formMatcher = ref('')
const selectedTemplate = ref<string | null>(null)

function resetForm() {
  formEvent.value = ''
  formCommand.value = ''
  formMatcher.value = ''
  selectedTemplate.value = null
}

function applyTemplate(t: Template) {
  formEvent.value = t.event
  formCommand.value = t.command
  formMatcher.value = t.matcher ?? ''
  selectedTemplate.value = t.id
  showAddPanel.value = true
}

function toggleAddPanel() {
  showAddPanel.value = !showAddPanel.value
  if (!showAddPanel.value) resetForm()
}

// ── Inline edit state ────────────────────────────────────────────────────────

const editingKey = ref<string | null>(null)
const editCommand = ref('')
const editMatcher = ref('')

function startEdit(event: string, rowIdx: number, row: FlatRow) {
  editingKey.value = `${event}:${rowIdx}`
  editCommand.value = row.command
  editMatcher.value = row.matcher ?? ''
}

function cancelEdit() {
  editingKey.value = null
}

// ── Delete confirm ───────────────────────────────────────────────────────────

const pendingDelete = ref<{ event: string; rowIdx: number } | null>(null)
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-section-title">Automations</h3>
        <p class="text-[12px] text-meta mt-0.5">Run shell commands when Claude Code events fire.</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <template v-if="groups.length > 0">
          <span
            class="text-[11px] px-2 py-0.5 rounded-full font-medium"
            style="background: rgba(5,150,105,0.1); color: var(--success)"
          >{{ totalActive }} active</span>
          <span
            v-if="totalDisabled > 0"
            class="text-[11px] px-2 py-0.5 rounded-full font-medium"
            style="background: var(--badge-subtle-bg); color: var(--text-tertiary)"
          >{{ totalDisabled }} off</span>
        </template>
        <UButton
          :label="showAddPanel ? 'Cancel' : 'Add'"
          :icon="showAddPanel ? 'i-lucide-x' : 'i-lucide-plus'"
          size="xs"
          variant="soft"
          @click="toggleAddPanel"
        />
      </div>
    </div>

    <!-- Template gallery -->
    <div v-if="showAddPanel || groups.length === 0">
      <p class="text-[10px] font-semibold uppercase tracking-widest text-meta mb-2.5">Quick start</p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="t in TEMPLATES"
          :key="t.id"
          class="group relative text-left rounded-xl p-3 transition-all duration-200 overflow-hidden focus-ring"
          :style="selectedTemplate === t.id
            ? 'background: var(--accent-muted); border: 1px solid rgba(180,83,9,0.25)'
            : 'background: var(--surface-raised); border: 1px solid var(--border-subtle)'"
          @mouseenter="e => { if (selectedTemplate !== t.id) { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border-default)'; el.style.transform = 'translateY(-1px)' } }"
          @mouseleave="e => { if (selectedTemplate !== t.id) { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border-subtle)'; el.style.transform = '' } }"
          @click="applyTemplate(t)"
        >
          <div
            class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style="background: radial-gradient(ellipse at top, rgba(180,83,9,0.06) 0%, transparent 65%)"
          />
          <div class="flex items-center gap-2 mb-1.5 relative">
            <div
              class="size-6 rounded-md flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
              :style="selectedTemplate === t.id ? 'background: var(--accent-muted)' : 'background: var(--surface-inset)'"
            >
              <UIcon
                :name="t.icon"
                class="size-3.5"
                :style="selectedTemplate === t.id ? 'color: var(--accent)' : 'color: var(--text-tertiary)'"
              />
            </div>
            <span class="text-[12px] font-medium truncate" style="color: var(--text-primary)">{{ t.label }}</span>
          </div>
          <p class="text-[10px] leading-relaxed relative" style="color: var(--text-tertiary)">{{ t.description }}</p>
          <div class="flex items-center gap-1 mt-2 relative">
            <UIcon
              :name="EVENT_META[t.event]?.icon ?? 'i-lucide-webhook'"
              class="size-2.5 shrink-0"
              :style="{ color: EVENT_META[t.event]?.color }"
            />
            <span class="text-[9px] font-mono" :style="{ color: EVENT_META[t.event]?.color }">{{ t.event }}</span>
            <span v-if="t.matcher" class="text-[9px] font-mono text-meta ml-1">· {{ t.matcher }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- Add form panel -->
    <Transition name="slide-down">
      <div
        v-if="showAddPanel"
        class="rounded-xl overflow-hidden"
        style="border: 1px solid var(--border-subtle)"
      >
        <div
          class="flex items-center gap-2 px-4 py-2.5"
          style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle)"
        >
          <UIcon name="i-lucide-plus-circle" class="size-3.5" style="color: var(--accent)" />
          <span class="text-[12px] font-medium">New automation</span>
        </div>
        <div class="p-4 space-y-3">
          <div class="field-group">
            <label class="field-label" data-required>Event</label>
            <USelectDropdown v-model="formEvent" :options="EVENT_OPTIONS" placeholder="Select event…" />
            <Transition name="fade">
              <div v-if="formEvent && EVENT_META[formEvent]" class="flex items-center gap-1.5 mt-1.5">
                <UIcon :name="EVENT_META[formEvent]!.icon" class="size-3 shrink-0" :style="{ color: EVENT_META[formEvent]!.color }" />
                <span class="text-[11px]" style="color: var(--text-tertiary)">{{ EVENT_META[formEvent]!.hint }}</span>
              </div>
            </Transition>
          </div>
          <div class="field-group">
            <label class="field-label" data-required>Command</label>
            <input
              v-model="formCommand"
              class="field-input font-mono text-[12px]"
              placeholder="bash -c 'echo hello'"
              @keydown.enter.prevent="formEvent && formCommand && addHook(formEvent, formCommand, formMatcher)"
            />
          </div>
          <div class="field-group">
            <label class="field-label">
              Tool matcher
              <span class="text-meta font-normal">(optional)</span>
            </label>
            <input
              v-model="formMatcher"
              class="field-input font-mono text-[12px]"
              placeholder="Bash  or  Write|Edit"
            />
            <span class="field-hint">Only trigger for specific tools. Use <code class="font-mono">|</code> to match multiple.</span>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showAddPanel = false; resetForm()" />
            <UButton
              label="Add automation"
              icon="i-lucide-plus"
              size="sm"
              :disabled="!formEvent || !formCommand"
              @click="addHook(formEvent, formCommand, formMatcher)"
            />
          </div>
        </div>
      </div>
    </Transition>

    <!-- Empty state -->
    <div
      v-if="groups.length === 0 && !showAddPanel"
      class="rounded-xl px-4 py-10 flex flex-col items-center gap-3 text-center"
      style="border: 1px dashed var(--border-subtle)"
    >
      <div class="size-12 rounded-2xl flex items-center justify-center" style="background: var(--surface-raised)">
        <UIcon name="i-lucide-webhook" class="size-6 text-meta" />
      </div>
      <div>
        <p class="text-[13px] font-medium" style="color: var(--text-secondary)">No automations yet</p>
        <p class="text-[11px] text-meta mt-0.5">Pick a template above or add a custom command.</p>
      </div>
      <UButton label="Add automation" icon="i-lucide-plus" size="sm" variant="soft" @click="() => { showAddPanel = true }" />
    </div>

    <!-- Hook groups -->
    <div v-else-if="groups.length > 0" class="space-y-3">
      <div
        v-for="group in groups"
        :key="group.event"
        class="rounded-xl overflow-hidden"
        style="border: 1px solid var(--border-subtle)"
      >
        <!-- Event header -->
        <div
          class="flex items-center gap-2.5 px-3 py-2.5"
          style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle)"
        >
          <div
            class="size-5 rounded-md flex items-center justify-center shrink-0"
            :style="`background: ${EVENT_META[group.event]?.colorRaw ?? '#82828e'}18`"
          >
            <UIcon
              :name="EVENT_META[group.event]?.icon ?? 'i-lucide-webhook'"
              class="size-3"
              :style="{ color: EVENT_META[group.event]?.color ?? 'var(--text-tertiary)' }"
            />
          </div>
          <div class="flex-1 min-w-0">
            <span class="text-[12px] font-semibold" style="color: var(--text-primary)">
              {{ EVENT_META[group.event]?.label ?? group.event }}
            </span>
            <span class="font-mono text-[10px] text-meta ml-1.5">{{ group.event }}</span>
          </div>
          <span
            class="text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0"
            style="background: var(--badge-subtle-bg); color: var(--text-disabled)"
          >{{ group.rows.length }}</span>
        </div>

        <!-- Rows -->
        <div class="divide-y" style="divide-color: var(--border-subtle)">
          <div
            v-for="(row, rowIdx) in group.rows"
            :key="rowIdx"
            class="transition-opacity"
            :style="row.disabled ? 'opacity: 0.45' : ''"
          >
            <!-- View mode -->
            <div
              v-if="editingKey !== `${group.event}:${rowIdx}`"
              class="flex items-center gap-3 px-3 py-2.5 group"
            >
              <!-- Toggle -->
              <label class="field-toggle shrink-0" style="margin-top: 0" @click.stop>
                <input
                  type="checkbox"
                  :checked="!row.disabled"
                  @change="toggleRow(group.event, rowIdx)"
                >
                <span class="field-toggle__track">
                  <span class="field-toggle__thumb" />
                </span>
              </label>

              <!-- Content: single row — command pill + optional chips -->
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <code
                  class="flex-1 min-w-0 text-[11px] font-mono truncate rounded px-2 py-1"
                  style="background: var(--surface-inset); color: var(--text-primary)"
                  :title="row.command"
                >{{ row.command }}</code>
                <!-- Source app badge -->
                <span
                  v-if="row.source"
                  class="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                  style="background: var(--accent-secondary-muted); color: var(--accent-secondary)"
                >{{ row.source }}</span>
                <!-- Matcher chip -->
                <span
                  v-if="row.matcher"
                  class="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full whitespace-nowrap"
                  style="background: var(--accent-muted); color: var(--accent); border: 1px solid rgba(180,83,9,0.18)"
                >{{ row.matcher }}</span>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  class="p-1.5 rounded-lg hover-bg focus-ring"
                  title="Edit"
                  @click="startEdit(group.event, rowIdx, row)"
                >
                  <UIcon name="i-lucide-pencil" class="size-3.5 text-meta" />
                </button>
                <button
                  class="p-1.5 rounded-lg hover-bg focus-ring"
                  title="Delete"
                  style="color: var(--error)"
                  @click="pendingDelete = { event: group.event, rowIdx }"
                >
                  <UIcon name="i-lucide-trash-2" class="size-3.5" />
                </button>
              </div>
            </div>

            <!-- Edit mode -->
            <div v-else class="px-3 py-3 space-y-2">
              <input
                v-model="editCommand"
                class="field-input font-mono text-[12px] w-full"
                placeholder="command"
                @keydown.escape="cancelEdit"
              />
              <input
                v-model="editMatcher"
                class="field-input font-mono text-[12px] w-full"
                placeholder="tool matcher (optional)"
                @keydown.escape="cancelEdit"
              />
              <div class="flex justify-end gap-2">
                <UButton label="Cancel" variant="ghost" color="neutral" size="xs" @click="cancelEdit" />
                <UButton
                  label="Save"
                  size="xs"
                  :disabled="!editCommand"
                  @click="saveEdit(group.event, rowIdx, editCommand, editMatcher)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirm -->
    <Teleport to="body">
      <div
        v-if="pendingDelete"
        class="fixed inset-0 z-50 flex items-center justify-center"
        style="background: rgba(0,0,0,0.45)"
        @click.self="pendingDelete = null"
      >
        <div
          class="rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4"
          style="background: var(--surface-raised); border: 1px solid var(--border-subtle)"
        >
          <div class="flex items-center gap-2">
            <div class="size-8 rounded-xl flex items-center justify-center shrink-0" style="background: rgba(220,38,38,0.1)">
              <UIcon name="i-lucide-trash-2" class="size-4" style="color: var(--error)" />
            </div>
            <p class="text-[14px] font-semibold">Delete automation?</p>
          </div>
          <p class="text-[12px] text-label">This cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="() => { pendingDelete = null }" />
            <UButton
              label="Delete"
              color="error"
              size="sm"
              @click="deleteRow(pendingDelete!.event, pendingDelete!.rowIdx); pendingDelete = null"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.slide-down-enter-active { transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16,1,0.3,1); }
.slide-down-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.slide-down-enter-from,
.slide-down-leave-to    { opacity: 0; transform: translateY(-6px); }

.fade-enter-active { transition: opacity 0.15s ease; }
.fade-leave-active { transition: opacity 0.1s ease; }
.fade-enter-from,
.fade-leave-to     { opacity: 0; }
</style>
