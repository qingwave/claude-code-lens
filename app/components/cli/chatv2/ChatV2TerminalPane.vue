<script setup lang="ts">
import { useShellTerminal } from '~/composables/useShellTerminal'

const props = defineProps<{
  workingDir?: string
  dark?: boolean
}>()

const emit = defineEmits<{
  (e: 'heightChange', height: number): void
}>()

// ── Terminal ─────────────────────────────────────────────────────────────────

const containerRef = ref<HTMLElement | null>(null)
const { isConnected, shellName, error, mount, unmount, connect, disconnect, focus, clear, syncSize } = useShellTerminal()

// Mount only once when containerRef is first assigned (DOM ready)
// The actual terminal init happens on first open() call
let mounted = false

function initTerminal() {
  if (mounted || !containerRef.value) return
  mounted = true
  mount(containerRef.value, props.dark !== false)
  connect({ workingDir: props.workingDir })
}

watch(() => props.workingDir, (dir) => {
  if (!isConnected.value || !containerRef.value) return
  disconnect()
  unmount()
  mounted = false
  nextTick(() => {
    if (containerRef.value) {
      mounted = true
      mount(containerRef.value, props.dark !== false)
      connect({ workingDir: dir })
    }
  })
})

onUnmounted(() => { disconnect(); unmount() })

// ── Height / drag-to-resize ───────────────────────────────────────────────────

const MIN_HEIGHT = 120
const DEFAULT_HEIGHT = 280
const MAX_HEIGHT = 600

const height = ref(DEFAULT_HEIGHT)
const isDragging = ref(false)
let dragStartY = 0
let dragStartH = 0

function onDragStart(e: MouseEvent) {
  isDragging.value = true
  dragStartY = e.clientY
  dragStartH = height.value
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd, { once: true })
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return
  const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartH - (e.clientY - dragStartY)))
  height.value = next
  emit('heightChange', next)
  if (containerRef.value) syncSize(containerRef.value)
}

function onDragEnd() {
  isDragging.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onDragMove)
}

// ── Collapse / expand ─────────────────────────────────────────────────────────

const isOpen = ref(false)

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    // Init on first open so container has real dimensions
    nextTick(() => {
      initTerminal()
      // Give the CSS transition time to finish, then sync size
      setTimeout(() => {
        if (containerRef.value) {
          syncSize(containerRef.value, true)
          focus()
        }
      }, 220)
    })
  }
}

defineExpose({ toggle, focus, clear, isOpen })
</script>

<template>
  <div
    class="shrink-0 flex flex-col border-t select-none"
    style="border-color: var(--border-subtle);"
  >
    <!-- Drag handle — sits above the header, only visible when open -->
    <div
      v-if="isOpen"
      class="h-1 w-full cursor-row-resize hover:bg-accent/40 transition-colors shrink-0"
      :class="isDragging ? 'bg-accent/40' : ''"
      @mousedown="onDragStart"
    />

    <!-- Header bar -->
    <div
      class="shrink-0 h-9 flex items-center justify-between px-3 cursor-pointer"
      style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle);"
      @click="toggle"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-terminal" class="size-3.5" style="color: var(--text-tertiary);" />
        <span class="text-[12px] font-medium" style="color: var(--text-secondary);">Terminal</span>
        <span v-if="shellName && isOpen" class="text-[10px] font-mono px-1.5 py-0.5 rounded" style="background: var(--surface-sunken); color: var(--text-disabled);">
          {{ shellName }}
        </span>
        <span
          v-if="isConnected && isOpen"
          class="size-1.5 rounded-full"
          style="background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5);"
        />
      </div>

      <div class="flex items-center gap-1">
        <button
          v-if="isOpen"
          class="p-1 rounded hover-bg transition-all"
          title="Clear"
          style="color: var(--text-tertiary);"
          @click.stop="clear"
        >
          <UIcon name="i-lucide-eraser" class="size-3.5" />
        </button>
        <button
          v-if="isOpen && !isConnected"
          class="p-1 rounded hover-bg transition-all"
          title="Reconnect"
          style="color: var(--accent);"
          @click.stop="connect({ workingDir: props.workingDir })"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
        </button>
        <UIcon
          :name="isOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
          class="size-3.5"
          style="color: var(--text-tertiary);"
        />
      </div>
    </div>

    <!-- Terminal body -->
    <div
      class="flex overflow-hidden"
      :style="{
        height: isOpen ? `${height}px` : '0px',
        transition: isDragging ? 'none' : 'height 0.2s ease',
      }"
    >
      <div
        ref="containerRef"
        class="shell-terminal min-h-0 min-w-0 flex-1 overflow-hidden"
      />
    </div>

    <!-- Error banner -->
    <div
      v-if="error && isOpen"
      class="px-3 py-1.5 text-[11px] shrink-0"
      style="background: rgba(239,68,68,0.08); color: #f87171; border-top: 1px solid rgba(239,68,68,0.2);"
    >
      {{ error }}
    </div>
  </div>
</template>

