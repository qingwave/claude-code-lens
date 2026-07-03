<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'

const props = defineProps<{
  messages: DisplayChatMessage[]
  toolName: string
}>()

const emit = defineEmits<{
  (e: 'openFile', filePath: string): void
}>()

// Default collapsed for less noise
const expanded = ref(false)

// Extract file/pattern/query from a single tool_use message (mirror the logic in ChatV2MessageItem)
function extractLabel(msg: DisplayChatMessage): { primary: string; secondary?: string; fullPath?: string } {
  const input = msg.toolInput
  const tn = (msg.toolName || '').toLowerCase()
  const isFileTool = ['read', 'write', 'edit', 'glob', 'grep', 'applypatch', 'replace', 'write_file', 'read_file', 'glob_search'].includes(tn)

  // Partial-JSON streaming case
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const m = raw.match(/"(?:file_path|path|filePath|filename|pattern|file|query|command)"\s*:\s*"([^"]*)"?/)
    if (m && m[1]) {
      const val = m[1]
      const parts = val.split('/')
      return { primary: parts[parts.length - 1] || val, fullPath: val }
    }
    return { primary: '…' }
  }

  if (typeof input === 'string') {
    if (isFileTool) {
      const parts = input.split('/')
      return { primary: parts[parts.length - 1] || input, fullPath: input }
    }
    return { primary: input }
  }

  if (input && typeof input === 'object') {
    // Bash: command
    if (tn === 'bash') {
      const cmd = input.command || ''
      return { primary: cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd, secondary: input.description }
    }
    // Grep: pattern (+ optional path)
    if (tn === 'grep') {
      return { primary: input.pattern || '…', secondary: input.path || input.glob }
    }
    // Glob: pattern
    if (tn === 'glob' || tn === 'glob_search') {
      return { primary: input.pattern || '…' }
    }
    // File-shaped tools
    const path = input.file_path || input.path || input.filePath || input.filename || input.file
    if (path) {
      const parts = String(path).split('/')
      return { primary: parts[parts.length - 1] || path, fullPath: path }
    }
  }
  return { primary: '…' }
}

interface Item {
  id: string
  primary: string
  secondary?: string
  fullPath?: string
  isError?: boolean
}

const items = computed<Item[]>(() =>
  props.messages.map((m) => ({
    id: m.id,
    ...extractLabel(m),
    isError: m.isError,
  }))
)

// Preview: first 3 primaries when collapsed
const preview = computed(() => {
  const heads = items.value.slice(0, 3).map((i) => i.primary)
  return heads.join(' · ')
})

const count = computed(() => props.messages.length)

// Tool color mapping — kept in sync with ChatV2MessageItem.getToolColor
const toolColor = computed(() => {
  const tn = props.toolName.toLowerCase()
  if (tn.includes('read')) return '#3b82f6'
  if (tn.includes('write')) return '#22c55e'
  if (tn.includes('edit') || tn.includes('replace')) return '#f59e0b'
  if (tn.includes('bash') || tn.includes('shell')) return '#8b5cf6'
  if (tn.includes('glob') || tn.includes('grep')) return '#06b6d4'
  return 'var(--accent)'
})

const toolIcon = computed(() => {
  const tn = props.toolName.toLowerCase()
  if (tn.includes('read')) return 'i-lucide-file-text'
  if (tn.includes('glob')) return 'i-lucide-search'
  if (tn.includes('grep')) return 'i-lucide-search-code'
  if (tn.includes('bash')) return 'i-lucide-terminal'
  if (tn.includes('write')) return 'i-lucide-file-plus'
  if (tn.includes('edit')) return 'i-lucide-file-edit'
  return 'i-lucide-wrench'
})

// Whether items in this batch should be individually clickable to open the file
const clickable = computed(() => {
  const tn = props.toolName.toLowerCase()
  return ['read', 'read_file', 'edit', 'write', 'applypatch', 'replace', 'write_file'].includes(tn)
})

function handleItemClick(item: Item) {
  if (clickable.value && item.fullPath) {
    emit('openFile', item.fullPath)
  }
}
</script>

<template>
  <div class="flex items-start gap-2 min-w-0">
    <!-- Left border indicator -->
    <div
      class="w-0.5 self-stretch rounded-full shrink-0"
      :style="{ background: toolColor }"
    />

    <div class="flex-1 min-w-0">
      <!-- Header row: clickable to expand/collapse -->
      <button
        class="inline-flex items-center gap-1.5 text-[12px] font-medium max-w-full text-left"
        style="color: var(--text-secondary);"
        @click="expanded = !expanded"
      >
        <UIcon
          :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-3 shrink-0"
        />
        <UIcon :name="toolIcon" class="size-3.5 shrink-0" :style="{ color: toolColor }" />
        <span>{{ toolName }}</span>
        <span style="color: var(--text-tertiary);">·</span>
        <span :style="{ color: toolColor }">{{ count }} calls</span>

        <!-- Preview text when collapsed -->
        <span
          v-if="!expanded"
          class="text-[11px] ml-1 truncate min-w-0"
          style="color: var(--text-tertiary);"
          :title="preview"
        >
          {{ preview }}<span v-if="count > 3">…</span>
        </span>
      </button>

      <!-- Expanded list -->
      <div v-if="expanded" class="mt-1.5 space-y-0.5">
        <div
          v-for="item in items"
          :key="item.id"
          class="flex items-center gap-1.5 text-[11px] pl-4 py-0.5 min-w-0"
        >
          <span style="color: var(--text-tertiary);">→</span>
          <span
            class="truncate min-w-0"
            :class="{ 'cursor-pointer hover:underline': clickable && item.fullPath }"
            :style="{ color: item.isError ? '#ef4444' : (clickable && item.fullPath ? toolColor : 'var(--text-secondary)') }"
            :title="item.fullPath || item.primary"
            @click="handleItemClick(item)"
          >
            {{ item.primary }}
          </span>
          <span
            v-if="item.secondary"
            class="text-[10px] shrink-0"
            style="color: var(--text-tertiary);"
          >
            {{ item.secondary }}
          </span>
          <span
            v-if="item.isError"
            class="px-1 rounded text-[9px] shrink-0"
            style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"
          >
            Error
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
