<script setup lang="ts">
import type { Command } from '~/types'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
  isStreaming?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send', images: string[]): void
  (e: 'abort'): void
  (e: 'abortAndSend', images: string[]): void
  (e: 'focus'): void
  (e: 'blur'): void
}>()

const { commands: allCommands, fetchAll: fetchCommands } = useCommands()
const { skills: allSkills, fetchAll: fetchSkills } = useSkills()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isFocused = ref(false)

// Built-in Claude Code slash commands
const builtinCommands = [
  { name: 'help', description: 'Show help and available commands' },
  { name: 'clear', description: 'Clear conversation history and free up context' },
  { name: 'compact', description: 'Compact conversation with optional focus instructions', argumentHint: '[instructions]' },
  { name: 'config', description: 'Open settings interface' },
  { name: 'cost', description: 'Show token usage statistics' },
  { name: 'model', description: 'Select or change the AI model', argumentHint: '[model]' },
  { name: 'memory', description: 'Edit CLAUDE.md memory files' },
  { name: 'permissions', description: 'Manage tool permission rules' },
  { name: 'resume', description: 'Resume a previous conversation', argumentHint: '[session]' },
  { name: 'exit', description: 'Exit the CLI' },
  { name: 'init', description: 'Initialize project with CLAUDE.md guide' },
  { name: 'plan', description: 'Enter plan mode', argumentHint: '[description]' },
  { name: 'mcp', description: 'Manage MCP server connections' },
  { name: 'diff', description: 'Open an interactive diff viewer' },
  { name: 'rewind', description: 'Rewind conversation to a previous point' },
  { name: 'doctor', description: 'Diagnose and verify installation' },
  { name: 'vim', description: 'Toggle Vim editing mode' },
  { name: 'theme', description: 'Change the color theme' },
  { name: 'login', description: 'Sign in to Anthropic account' },
  { name: 'logout', description: 'Sign out from account' },
  { name: 'status', description: 'Show current session status' },
  { name: 'debug', description: 'Enable debug logging for the current session', argumentHint: '[description]' },
  { name: 'copy', description: 'Copy the last assistant response to clipboard', argumentHint: '[N]' },
  { name: 'export', description: 'Export the current conversation as plain text', argumentHint: '[filename]' },
  { name: 'context', description: 'Visualize current context usage' },
  { name: 'effort', description: 'Set the model effort level', argumentHint: '[level]' },
  { name: 'fast', description: 'Toggle fast mode', argumentHint: '[on|off]' },
  { name: 'hooks', description: 'View hook configurations' },
  { name: 'tasks', description: 'List and manage background tasks' },
  { name: 'add-dir', description: 'Add a working directory for file access', argumentHint: '<path>' },
  { name: 'rename', description: 'Rename the current session', argumentHint: '[name]' },
  { name: 'sandbox', description: 'Toggle sandbox mode' },
  { name: 'usage', description: 'Show plan usage limits' },
  { name: 'feedback', description: 'Submit feedback about Claude Code', argumentHint: '[report]' },
  { name: 'release-notes', description: 'View the changelog' },
  { name: 'ide', description: 'Manage IDE integrations' },
  { name: 'skills', description: 'List available skills' },
  { name: 'pr-comments', description: 'Fetch and display GitHub PR comments', argumentHint: '[PR]' },
  { name: 'voice', description: 'Toggle push-to-talk voice dictation' },
  { name: 'terminal-setup', description: 'Configure terminal keybindings' },
  { name: 'upgrade', description: 'Open upgrade page' },
  { name: 'stats', description: 'Visualize daily usage and session history' },
  { name: 'branch', description: 'Create a branch of the current conversation', argumentHint: '[name]' },
  { name: 'color', description: 'Set the prompt bar color', argumentHint: '[color|default]' },
  { name: 'keybindings', description: 'Open keybindings configuration' },
  { name: 'statusline', description: 'Configure status line display' },
  { name: 'privacy-settings', description: 'View and update privacy settings' },
]

// Command/Skill Menu State
const isMenuOpen = ref(false)
const selectedItemIdx = ref(0)
const menuSearchQuery = ref('')

const menuItems = computed(() => {
  const items = [
    ...allCommands.value.map(c => ({ type: 'command' as const, name: c.frontmatter.name, description: c.frontmatter.description, slug: c.slug, directory: c.directory, filePath: c.filePath })),
    ...allSkills.value.map(s => ({ type: 'skill' as const, name: s.frontmatter.name, description: s.frontmatter.description, slug: s.slug, filePath: s.filePath })),
    ...builtinCommands.map(b => ({ type: 'builtin' as const, name: b.name, description: b.description, slug: b.name, argumentHint: b.argumentHint })),
  ]

  if (!menuSearchQuery.value) return items

  const q = menuSearchQuery.value.toLowerCase()
  return items.filter(i =>
    i.name.toLowerCase().includes(q) ||
    i.description?.toLowerCase().includes(q)
  )
})

// Local value for v-model
const localValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const fileInputRef = ref<HTMLInputElement | null>(null)
const attachedImages = ref<{ url: string; file: File }[]>([])

// Whether user has typed something while streaming (enables abort+send mode)
const hasInputWhileStreaming = computed(() =>
  props.isStreaming && (localValue.value.trim().length > 0 || attachedImages.value.length > 0)
)

// Char count display: only show when >= 8000
const charCountVisible = computed(() => localValue.value.length >= 8000)
const charCountColor = computed(() => localValue.value.length > 10000 ? '#ef4444' : 'var(--text-tertiary)')

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files?.length) return

  Array.from(target.files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          attachedImages.value.push({ url: e.target.result, file })
        }
      }
      reader.readAsDataURL(file)
    }
  })
  target.value = ''
}

function removeImage(index: number) {
  attachedImages.value.splice(index, 1)
}

function triggerSend() {
  const images = attachedImages.value.map(img => img.url)
  emit('send', images)
  attachedImages.value = []
}

function triggerAbortAndSend() {
  const images = attachedImages.value.map(img => img.url)
  emit('abortAndSend', images)
  attachedImages.value = []
}

// Auto-resize textarea
function autoResize() {
  if (!textareaRef.value) return

  textareaRef.value.style.height = 'auto'
  const maxHeight = window.innerWidth < 640 ? 120 : window.innerWidth < 768 ? 160 : 200
  const newHeight = Math.min(textareaRef.value.scrollHeight, maxHeight)
  textareaRef.value.style.height = `${newHeight}px`
}

function selectItem(item: { type: 'command' | 'skill' | 'builtin'; name: string }) {
  localValue.value = `/${item.name} `
  isMenuOpen.value = false
  textareaRef.value?.focus()
}

// Handle keydown
function handleKeydown(e: KeyboardEvent) {
  // Command Menu Navigation
  if (isMenuOpen.value && menuItems.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedItemIdx.value = (selectedItemIdx.value + 1) % menuItems.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedItemIdx.value = (selectedItemIdx.value - 1 + menuItems.value.length) % menuItems.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const item = menuItems.value[selectedItemIdx.value]
      if (item) selectItem(item)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      isMenuOpen.value = false
      return
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (props.disabled) return
    if (props.isStreaming && hasInputWhileStreaming.value) {
      triggerAbortAndSend()
    } else if (!props.isStreaming && (localValue.value.trim() || attachedImages.value.length > 0)) {
      triggerSend()
    }
  }
}

// Watch value changes to resize and detect slash
watch(localValue, (newVal) => {
  nextTick(() => autoResize())

  // Detect "/" at start
  if (newVal.startsWith('/')) {
    const query = newVal.slice(1).split(' ')[0] || ''
    if (newVal.includes(' ')) {
      isMenuOpen.value = false
    } else {
      menuSearchQuery.value = query
      isMenuOpen.value = true
      selectedItemIdx.value = 0
    }
  } else {
    isMenuOpen.value = false
  }
})

// Focus on mount
onMounted(async () => {
  textareaRef.value?.focus()
  await Promise.all([
    allCommands.value.length === 0 ? fetchCommands() : Promise.resolve(),
    allSkills.value.length === 0 ? fetchSkills() : Promise.resolve()
  ])
})
</script>

<template>
  <div class="pb-2 sm:pb-3 relative">
    <!-- Command Menu -->
    <ChatV2CommandMenu
      :items="menuItems"
      :selected-index="selectedItemIdx"
      :is-open="isMenuOpen"
      @select="selectItem"
    />

    <!-- Input container (images live inside now) -->
    <div
      class="relative rounded-2xl transition-all duration-200"
      :style="{
        background: 'var(--surface-raised)',
        border: isFocused
          ? '1px solid var(--accent)'
          : '1px solid var(--border-default)',
        boxShadow: isFocused
          ? '0 0 0 3px rgba(229,169,62,0.08), 0 4px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.12)'
          : '0 2px 12px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.08)',
      }"
    >
      <!-- Attached images (inside box, above textarea) -->
      <div v-if="attachedImages.length > 0" class="flex gap-2 px-3 pt-2.5 pb-2 overflow-x-auto" style="border-bottom: 1px solid var(--border-subtle);">
        <div v-for="(img, idx) in attachedImages" :key="idx" class="relative shrink-0">
          <img :src="img.url" class="h-14 w-14 object-cover rounded-lg border" style="border-color: var(--border-subtle);" />
          <button
            class="absolute -top-1.5 -right-1.5 size-4 rounded-full flex items-center justify-center"
            style="background: #ef4444; color: white; border: 1.5px solid var(--surface-raised);"
            @click="removeImage(idx)"
          >
            <UIcon name="i-lucide-x" class="size-2.5" />
          </button>
        </div>
      </div>

      <!-- Textarea row -->
      <div class="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <!-- Char count badge (absolute, shown when >= 8000) -->
        <Transition name="char-count">
          <span
            v-if="charCountVisible"
            class="absolute top-2 right-12 text-[10px] font-mono pointer-events-none select-none"
            :style="{ color: charCountColor }"
          >{{ localValue.length.toLocaleString() }}</span>
        </Transition>

        <!-- Textarea -->
        <textarea
          ref="textareaRef"
          v-model="localValue"
          :disabled="disabled"
          rows="1"
          autocomplete="off"
          class="flex-1 bg-transparent text-[13px] resize-none focus:outline-none leading-5"
          :style="{
            color: disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
          }"
          :placeholder="isStreaming ? '' : (placeholder || 'Message Claude...')"
          @keydown="handleKeydown"
          @input="autoResize"
          @focus="isFocused = true; emit('focus')"
          @blur="isFocused = false; emit('blur')"
        />

        <!-- Action buttons -->
        <div class="flex items-center gap-1 shrink-0">
          <!-- Attach button (hidden while streaming to reduce noise) -->
          <button
            v-if="!isStreaming"
            class="size-7 rounded-full flex items-center justify-center transition-all duration-200 hover:bg-[var(--surface-hover)] shrink-0"
            style="color: var(--text-secondary);"
            title="Attach image"
            @click="fileInputRef?.click()"
          >
            <UIcon name="i-lucide-paperclip" class="size-3.5" />
          </button>
          <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFileSelect" />

          <!-- Streaming: single button — square when no input, arrow when has input -->
          <button
            v-if="isStreaming"
            class="size-7 rounded-full flex items-center justify-center transition-all duration-200 hover:opacity-80 shrink-0"
            style="background: var(--text-primary); color: var(--surface-base);"
            :title="hasInputWhileStreaming ? 'Stop and send' : 'Stop generating'"
            @click="hasInputWhileStreaming ? triggerAbortAndSend() : emit('abort')"
          >
            <Transition name="btn-icon" mode="out-in">
              <UIcon v-if="hasInputWhileStreaming" key="send" name="i-lucide-arrow-up" class="size-3.5" />
              <UIcon v-else key="stop" name="i-lucide-square" class="size-3" />
            </Transition>
          </button>

          <!-- Idle: send button -->
          <button
            v-else
            class="size-7 rounded-full flex items-center justify-center transition-all duration-200 shrink-0"
            :class="{ 'send-btn-active': localValue.trim() || attachedImages.length > 0 }"
            :style="{
              background: (!localValue.trim() && attachedImages.length === 0) ? 'var(--border-default)' : undefined,
              color: (!localValue.trim() && attachedImages.length === 0) ? 'var(--text-disabled)' : undefined,
              cursor: (!localValue.trim() && attachedImages.length === 0) ? 'not-allowed' : 'pointer',
            }"
            :disabled="!localValue.trim() && attachedImages.length === 0"
            title="Send message"
            @click="triggerSend"
          >
            <UIcon name="i-lucide-arrow-up" class="size-3.5" />
          </button>
        </div>
      </div>

    </div>

    <!-- Controls bar -->
    <div class="flex items-center justify-center mt-1.5 px-1 gap-0.5 flex-wrap">
      <slot name="controls" />
    </div>
  </div>
</template>

<style scoped>
/* ── Send button — active state ──────────────────────────────── */
.send-btn-active {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--text-primary);
  color: var(--surface-base);
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  flex-shrink: 0;
  border: none;
}
.send-btn-active:hover { opacity: 0.85; }
.send-btn-active:active { transform: scale(0.93); }

/* ── Char count fade ─────────────────────────────────────────── */
.char-count-enter-active, .char-count-leave-active { transition: opacity 0.2s; }
.char-count-enter-from, .char-count-leave-to { opacity: 0; }

/* ── Button icon swap ────────────────────────────────────────── */
.btn-icon-enter-active, .btn-icon-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.btn-icon-enter-from { opacity: 0; transform: scale(0.6); }
.btn-icon-leave-to   { opacity: 0; transform: scale(0.6); }

</style>
