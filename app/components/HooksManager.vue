<script setup lang="ts">
// ── Types ────────────────────────────────────────────────────────────────────

interface HookEntry {
  command: string
  matcher?: string
  disabled?: boolean
}

interface HookGroup {
  event: string
  entries: HookEntry[]
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
  /** Raw hooks object from settings.json */
  modelValue: Record<string, unknown[]> | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown[]> | undefined]
}>()

// ── Event metadata ────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; icon: string; hint: string }> = {
  PreToolUse:   { label: 'Before tool use',         icon: 'i-lucide-play',            hint: 'Runs before each tool call. Return non-zero to block.' },
  PostToolUse:  { label: 'After tool use',           icon: 'i-lucide-check',           hint: 'Runs after each tool call completes.' },
  Notification: { label: 'On notification',          icon: 'i-lucide-bell',            hint: 'Runs when Claude sends a system notification.' },
  Stop:         { label: 'When Claude finishes',     icon: 'i-lucide-square',          hint: 'Runs when the session ends or Claude stops.' },
  SubagentStop: { label: 'When sub-agent finishes',  icon: 'i-lucide-cpu',             hint: 'Runs when a background sub-agent completes.' },
  PreCompact:   { label: 'Before context compaction',icon: 'i-lucide-package',         hint: 'Runs before the context window is compressed.' },
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
    label: 'macOS notification on finish',
    description: 'Pop a native notification when Claude stops.',
    event: 'Stop',
    command: `osascript -e 'display notification "Claude finished" with title "Claude Code"'`,
    icon: 'i-lucide-bell',
  },
  {
    id: 'bash-log',
    label: 'Log Bash commands',
    description: 'Append every Bash command to a log file.',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: `echo "[$(date +%H:%M:%S)] $TOOL_INPUT" >> ~/.claude/bash-log.txt`,
    icon: 'i-lucide-scroll-text',
  },
  {
    id: 'git-commit',
    label: 'Auto git commit after writes',
    description: 'Commit changes automatically after Write/Edit tool calls.',
    event: 'PostToolUse',
    matcher: 'Write|Edit',
    command: `bash -c 'cd "$CWD" && git diff --quiet || git add -A && git commit -m "auto: claude edit" --no-verify 2>/dev/null || true'`,
    icon: 'i-lucide-git-commit-horizontal',
  },
  {
    id: 'notify-sound',
    label: 'Play sound on finish',
    description: 'Play a system sound when Claude finishes.',
    event: 'Stop',
    command: `afplay /System/Library/Sounds/Glass.aiff 2>/dev/null || paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || true`,
    icon: 'i-lucide-volume-2',
  },
]

// ── Derived state ────────────────────────────────────────────────────────────

const groups = computed<HookGroup[]>(() => {
  if (!props.modelValue) return []
  return Object.entries(props.modelValue).map(([event, list]) => ({
    event,
    entries: (Array.isArray(list) ? list : []).map(item =>
      typeof item === 'string' ? { command: item } : (item as HookEntry)
    ),
  }))
})

// ── Mutation helpers ──────────────────────────────────────────────────────────

function patch(updated: Record<string, HookEntry[]>) {
  const cleaned: Record<string, unknown[]> = {}
  for (const [event, entries] of Object.entries(updated)) {
    if (entries.length > 0) cleaned[event] = entries
  }
  emit('update:modelValue', Object.keys(cleaned).length > 0 ? cleaned : undefined)
}

function currentMap(): Record<string, HookEntry[]> {
  const map: Record<string, HookEntry[]> = {}
  for (const g of groups.value) map[g.event] = [...g.entries]
  return map
}

function toggleHook(event: string, idx: number) {
  const map = currentMap()
  const entry = map[event]?.[idx]
  if (!entry) return
  entry.disabled = !entry.disabled
  patch(map)
}

function deleteHook(event: string, idx: number) {
  const map = currentMap()
  map[event]?.splice(idx, 1)
  patch(map)
}

function saveEdit(event: string, idx: number, command: string, matcher: string) {
  const map = currentMap()
  const entry = map[event]?.[idx]
  if (!entry) return
  entry.command = command
  entry.matcher = matcher || undefined
  patch(map)
  editingKey.value = null
}

function addHook(event: string, command: string, matcher: string) {
  const map = currentMap()
  const entry: HookEntry = { command }
  if (matcher) entry.matcher = matcher
  map[event] = [...(map[event] ?? []), entry]
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
}

// ── Inline edit state ────────────────────────────────────────────────────────

// key = `${event}:${idx}`
const editingKey = ref<string | null>(null)
const editCommand = ref('')
const editMatcher = ref('')

function startEdit(event: string, idx: number, entry: HookEntry) {
  editingKey.value = `${event}:${idx}`
  editCommand.value = entry.command
  editMatcher.value = entry.matcher ?? ''
}

function cancelEdit() {
  editingKey.value = null
}

// ── Delete confirm ───────────────────────────────────────────────────────────

const pendingDelete = ref<{ event: string; idx: number } | null>(null)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-section-title">Automations</h3>
        <p class="text-[12px] text-meta mt-0.5">Run shell commands when Claude Code events fire.</p>
      </div>
      <UButton
        label="Add"
        icon="i-lucide-plus"
        size="xs"
        variant="soft"
        @click="showAddPanel = !showAddPanel"
      />
    </div>

    <!-- Add panel -->
    <Transition name="slide-down">
      <div
        v-if="showAddPanel"
        class="rounded-xl overflow-hidden"
        style="border: 1px solid var(--border-subtle)"
      >
        <!-- Templates -->
        <div class="px-4 pt-4 pb-3" style="border-bottom: 1px solid var(--border-subtle)">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-meta mb-2.5">Quick templates</p>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="t in TEMPLATES"
              :key="t.id"
              class="text-left rounded-lg px-3 py-2 transition-all focus-ring"
              :style="selectedTemplate === t.id
                ? 'background: var(--accent-muted); border: 1px solid rgba(229,169,62,0.25)'
                : 'background: var(--surface-raised); border: 1px solid var(--border-subtle)'"
              @click="applyTemplate(t)"
            >
              <div class="flex items-center gap-1.5 mb-0.5">
                <UIcon :name="t.icon" class="size-3 shrink-0" style="color: var(--accent)" />
                <span class="text-[12px] font-medium truncate">{{ t.label }}</span>
              </div>
              <p class="text-[10px] text-meta leading-tight">{{ t.description }}</p>
            </button>
          </div>
        </div>

        <!-- Form -->
        <div class="p-4 space-y-3">
          <div class="field-group">
            <label class="field-label" data-required>Event</label>
            <USelectDropdown v-model="formEvent" :options="EVENT_OPTIONS" placeholder="Select event..." />
            <span v-if="formEvent && EVENT_META[formEvent]" class="field-hint">
              {{ EVENT_META[formEvent]?.hint }}
            </span>
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
            <label class="field-label">Tool matcher <span class="text-meta font-normal">(optional)</span></label>
            <input
              v-model="formMatcher"
              class="field-input font-mono text-[12px]"
              placeholder="Bash  or  Write|Edit"
            />
            <span class="field-hint">Only trigger for specific tools. Use <code class="font-mono">|</code> to match multiple.</span>
          </div>

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showAddPanel = false; resetForm()" />
            <UButton
              label="Add automation"
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
      v-if="groups.length === 0"
      class="rounded-xl px-4 py-8 flex flex-col items-center gap-2 text-center"
      style="border: 1px dashed var(--border-subtle)"
    >
      <UIcon name="i-lucide-webhook" class="size-6 text-meta" />
      <p class="text-[12px] text-label">No automations yet.</p>
      <p class="text-[11px] text-meta">Use the templates above to get started quickly.</p>
    </div>

    <!-- Hook groups -->
    <div v-else class="space-y-3">
      <div
        v-for="group in groups"
        :key="group.event"
        class="rounded-xl overflow-hidden"
        style="border: 1px solid var(--border-subtle)"
      >
        <!-- Event header -->
        <div
          class="flex items-center gap-2 px-4 py-2.5"
          style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle)"
        >
          <UIcon
            :name="EVENT_META[group.event]?.icon ?? 'i-lucide-webhook'"
            class="size-3.5"
            style="color: var(--accent)"
          />
          <span class="text-[12px] font-medium">
            {{ EVENT_META[group.event]?.label ?? group.event }}
          </span>
          <span class="font-mono text-[10px] text-meta">{{ group.entries.length }}</span>
        </div>

        <!-- Entries -->
        <div class="divide-y" style="divide-color: var(--border-subtle)">
          <div
            v-for="(entry, idx) in group.entries"
            :key="idx"
            class="px-4 py-3"
            :style="entry.disabled ? 'opacity: 0.45' : ''"
          >
            <!-- View mode -->
            <div v-if="editingKey !== `${group.event}:${idx}`" class="flex items-start gap-3 group">
              <!-- Toggle -->
              <button
                class="mt-0.5 size-4 rounded shrink-0 flex items-center justify-center transition-colors focus-ring"
                :style="entry.disabled
                  ? 'background: var(--surface-raised); border: 1px solid var(--border-subtle)'
                  : 'background: var(--accent-muted); border: 1px solid rgba(229,169,62,0.3)'"
                :title="entry.disabled ? 'Enable' : 'Disable'"
                @click="toggleHook(group.event, idx)"
              >
                <UIcon
                  v-if="!entry.disabled"
                  name="i-lucide-check"
                  class="size-2.5"
                  style="color: var(--accent)"
                />
              </button>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <p class="font-mono text-[12px] text-body break-all">{{ entry.command }}</p>
                <p v-if="entry.matcher" class="text-[10px] text-meta mt-0.5 font-mono">
                  matcher: <span style="color: var(--accent)">{{ entry.matcher }}</span>
                </p>
              </div>

              <!-- Actions (show on hover) -->
              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  class="p-1.5 rounded hover-bg focus-ring"
                  title="Edit"
                  @click="startEdit(group.event, idx, entry)"
                >
                  <UIcon name="i-lucide-pencil" class="size-3.5 text-meta" />
                </button>
                <button
                  class="p-1.5 rounded hover-bg focus-ring"
                  title="Delete"
                  style="color: var(--error)"
                  @click="pendingDelete = { event: group.event, idx }"
                >
                  <UIcon name="i-lucide-trash-2" class="size-3.5" />
                </button>
              </div>
            </div>

            <!-- Edit mode -->
            <div v-else class="space-y-2">
              <input
                v-model="editCommand"
                class="field-input font-mono text-[12px] w-full"
                placeholder="command"
                @keydown.escape="cancelEdit"
              />
              <input
                v-model="editMatcher"
                class="field-input font-mono text-[12px] w-full"
                placeholder="matcher (optional)"
                @keydown.escape="cancelEdit"
              />
              <div class="flex justify-end gap-2">
                <UButton label="Cancel" variant="ghost" color="neutral" size="xs" @click="cancelEdit" />
                <UButton
                  label="Save"
                  size="xs"
                  :disabled="!editCommand"
                  @click="saveEdit(group.event, idx, editCommand, editMatcher)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirm inline modal -->
    <Teleport to="body">
      <div
        v-if="pendingDelete"
        class="fixed inset-0 z-50 flex items-center justify-center"
        style="background: rgba(0,0,0,0.4)"
        @click.self="pendingDelete = null"
      >
        <div
          class="rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4"
          style="background: var(--surface-raised); border: 1px solid var(--border-subtle)"
        >
          <p class="text-[14px] font-semibold">Delete this automation?</p>
          <p class="text-[12px] text-label">This cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="pendingDelete = null" />
            <UButton
              label="Delete"
              color="error"
              size="sm"
              @click="deleteHook(pendingDelete!.event, pendingDelete!.idx); pendingDelete = null"
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
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
