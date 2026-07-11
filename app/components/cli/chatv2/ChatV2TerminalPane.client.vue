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

// containerRef lives outside v-if so xterm DOM is never destroyed on hide/show
const containerRef = ref<HTMLElement | null>(null)
const { isConnected, shellName, error, mount, unmount, connect, disconnect, focus, clear, syncSize } = useShellTerminal()
let mounted = false

// Init on first open — containerRef is always in DOM so this is reliable
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

// ── Open / close ──────────────────────────────────────────────────────────────

const isOpen = ref(false)

// Toggle visibility — init xterm on first open, subsequent opens just show existing instance
function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    nextTick(() => {
      initTerminal()
      setTimeout(() => {
        if (containerRef.value) { syncSize(containerRef.value, true); focus() }
      }, 220)
    })
  }
}

// Fully destroy — kills PTY, disposes xterm, resets state
function close() {
  disconnect()
  unmount(true)
  mounted = false
  isOpen.value = false
}

defineExpose({ toggle, focus, clear, isOpen })
</script>

<template>
  <!-- Wrapper: visible only when open — but containerRef div is always in DOM -->
  <div
    v-show="isOpen"
    class="shrink-0 flex flex-col border-t"
    style="border-color: var(--border-subtle);"
  >
    <!-- Drag handle to resize height -->
    <div
      class="h-1 w-full cursor-row-resize hover:bg-accent/40 transition-colors shrink-0"
      :class="isDragging ? 'bg-accent/40' : ''"
      @mousedown="onDragStart"
    />

    <!-- Header -->
    <div
      class="shrink-0 h-9 flex items-center justify-between px-3 select-none cursor-pointer"
      style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle);"
      @click="toggle"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-terminal" class="size-3.5" style="color: var(--text-tertiary);" />
        <span class="text-[12px] font-medium" style="color: var(--text-secondary);">Terminal</span>
        <span v-if="shellName" class="text-[10px] font-mono px-1.5 py-0.5 rounded" style="background: var(--surface-sunken); color: var(--text-disabled);">
          {{ shellName }}
        </span>
        <span
          v-if="isConnected"
          class="size-1.5 rounded-full"
          style="background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5);"
        />
      </div>

      <div class="flex items-center gap-0.5">
        <button
          class="p-1 rounded hover-bg transition-all"
          title="Clear"
          style="color: var(--text-tertiary);"
          @click.stop="clear"
        >
          <UIcon name="i-lucide-eraser" class="size-3.5" />
        </button>
        <button
          v-if="!isConnected"
          class="p-1 rounded hover-bg transition-all"
          title="Reconnect"
          style="color: var(--accent);"
          @click.stop="connect({ workingDir: props.workingDir })"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
        </button>
        <!-- Chevron: hide the pane (keeps PTY alive) -->
        <button
          class="p-1 rounded hover-bg transition-all"
          title="Hide terminal"
          style="color: var(--text-tertiary);"
          @click.stop="isOpen = false"
        >
          <UIcon name="i-lucide-chevron-down" class="size-3.5" />
        </button>
        <!-- X: fully close and kill the session -->
        <button
          class="p-1 rounded hover-bg transition-all"
          title="Close terminal"
          style="color: var(--text-tertiary);"
          @click.stop="close"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Terminal body — always in DOM, height animated -->
    <div class="flex" :style="{ height: `${height}px` }">
      <div
        ref="containerRef"
        class="shell-terminal min-h-0 min-w-0 flex-1 overflow-hidden"
      />
    </div>

    <!-- Error banner -->
    <div
      v-if="error"
      class="px-3 py-1.5 text-[11px] shrink-0"
      style="background: rgba(239,68,68,0.08); color: #f87171; border-top: 1px solid rgba(239,68,68,0.2);"
    >
      {{ error }}
    </div>
  </div>
</template>
