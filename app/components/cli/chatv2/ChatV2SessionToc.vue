<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'

const props = defineProps<{
  messages: DisplayChatMessage[]
  scrollContainer: HTMLElement | null
}>()

interface TocEntry {
  id: string
  content: string
  index: number
}

const entries = computed<TocEntry[]>(() => {
  const seen = new Set<string>()
  const result: TocEntry[] = []
  let idx = 1
  for (const msg of props.messages) {
    if (msg.role === 'user' && msg.kind === 'text' && msg.content?.trim()) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id)
        result.push({ id: msg.id, content: msg.content.trim(), index: idx++ })
      }
    }
  }
  return result
})

const activeId = ref<string | null>(null)
const hovering = ref(false)
const listRef = ref<HTMLElement | null>(null)
const railPos = ref({ top: 0, right: 0, height: 0 })

// ── Track scroll container position ──
function syncPos() {
  const c = props.scrollContainer
  if (!c) return
  const r = c.getBoundingClientRect()
  railPos.value = { top: r.top, right: window.innerWidth - r.right + 14, height: r.height }
}

let ro: ResizeObserver | null = null

watch(() => props.scrollContainer, (c) => {
  ro?.disconnect()
  if (!c) return
  syncPos()
  ro = new ResizeObserver(syncPos)
  ro.observe(c)
}, { immediate: true })

onMounted(() => window.addEventListener('resize', syncPos))
onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('resize', syncPos)
  observer?.disconnect()
})

// ── Adaptive gap: spread dashes across 70% of container height ──
const gapPx = computed(() => {
  const n = entries.value.length
  if (n <= 1) return 0
  const totalH = railPos.value.height * 0.7
  const raw = (totalH - n * 2) / (n - 1)
  return Math.min(20, Math.max(3, raw))
})

const railStyle = computed(() => ({
  top: `${railPos.value.top}px`,
  right: `${railPos.value.right}px`,
  height: `${railPos.value.height}px`,
}))

const panelStyle = computed(() => ({
  top: `${railPos.value.top + railPos.value.height / 2}px`,
  right: `${railPos.value.right}px`,
  transform: 'translateY(-50%)',
}))

// ── Scroll active item into view when panel opens ──
watch(hovering, (v) => {
  if (!v || !activeId.value) return
  nextTick(() => {
    listRef.value?.querySelector<HTMLElement>(`[data-id="${activeId.value}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })
})

// ── Navigate ──
function navigate(id: string) {
  hovering.value = false
  const container = props.scrollContainer
  if (!container) return
  const el = container.querySelector<HTMLElement>(`#msg-${id}`)
  if (!el) return
  const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16
  container.scrollTo({ top: offset, behavior: 'smooth' })
}

// ── IntersectionObserver: track which message is in view ──
let observer: IntersectionObserver | null = null

function setupObserver() {
  observer?.disconnect()
  const container = props.scrollContainer
  if (!container || entries.value.length === 0) return

  observer = new IntersectionObserver((ioEntries) => {
    for (const e of ioEntries) {
      if (e.isIntersecting) {
        activeId.value = (e.target as HTMLElement).id.replace(/^msg-/, '')
        break
      }
    }
  }, { root: container, threshold: 0.1, rootMargin: '-5% 0px -55% 0px' })

  for (const { id } of entries.value) {
    const el = container.querySelector(`#msg-${id}`)
    if (el) observer.observe(el)
  }
}

onMounted(() => nextTick(setupObserver))
watch(() => [props.scrollContainer, entries.value.length], () => nextTick(setupObserver))

function truncate(text: string, max = 52) {
  return text.length <= max ? text : text.slice(0, max).trimEnd() + '…'
}
</script>

<template>
  <Teleport v-if="entries.length > 0" to="body">
    <!-- Rail -->
    <div
      class="toc-rail"
      :style="railStyle"
      @mouseenter="hovering = true"
      @mouseleave="hovering = false"
    >
      <div class="toc-dashes" :style="{ gap: `${gapPx}px` }">
        <div
          v-for="entry in entries"
          :key="entry.id"
          class="toc-dash"
          :class="{ 'is-active': activeId === entry.id }"
        />
      </div>
    </div>

    <!-- Hover panel -->
    <Transition name="toc-pop">
      <div
        v-if="hovering"
        class="toc-panel"
        :style="panelStyle"
        @mouseenter="hovering = true"
        @mouseleave="hovering = false"
      >
        <div ref="listRef" class="toc-panel-inner">
          <button
            v-for="entry in entries"
            :key="entry.id"
            :data-id="entry.id"
            class="toc-entry"
            :class="{ 'is-active': activeId === entry.id }"
            @click="navigate(entry.id)"
          >
            <span class="toc-entry-rule" />
            <span class="toc-entry-index">{{ entry.index }}</span>
            <span class="toc-entry-text">{{ truncate(entry.content) }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.toc-rail {
  position: fixed;
  z-index: 40;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.toc-dashes {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.toc-dash {
  width: 10px;
  height: 2px;
  border-radius: 2px;
  background: rgba(128,128,128,0.22);
  transition: background 0.15s;
  flex-shrink: 0;
}

.toc-dash.is-active {
  background: var(--accent, #e5a93e);
}

.toc-rail:hover .toc-dash {
  background: rgba(128,128,128,0.45);
}

.toc-rail:hover .toc-dash.is-active {
  background: var(--accent, #e5a93e);
}

.toc-panel {
  position: fixed;
  z-index: 300;
  width: 260px;
  max-height: min(440px, 80vh);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-overlay);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  overflow: hidden;
}

.toc-panel-inner {
  overflow-y: auto;
  max-height: min(440px, 80vh);
  padding: 6px 0;
  scrollbar-width: thin;
}

.toc-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  background: transparent;
  border: none;
  text-align: left;
  transition: background 0.1s;
}

.toc-entry:hover { background: var(--surface-raised); }
.toc-entry.is-active { background: color-mix(in srgb, var(--accent) 9%, transparent); }

.toc-entry-rule {
  width: 2px;
  height: 14px;
  border-radius: 2px;
  flex-shrink: 0;
  background: rgba(128,128,128,0.25);
  transition: background 0.12s;
}

.toc-entry:hover .toc-entry-rule { background: var(--text-disabled); }
.toc-entry.is-active .toc-entry-rule { background: var(--accent, #e5a93e); }

.toc-entry-index {
  font-size: 9px;
  font-weight: 600;
  color: var(--text-disabled);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  min-width: 14px;
  text-align: right;
}

.toc-entry.is-active .toc-entry-index { color: var(--accent, #e5a93e); }

.toc-entry-text {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  transition: color 0.1s;
}

.toc-entry:hover .toc-entry-text,
.toc-entry.is-active .toc-entry-text { color: var(--text-primary); }
.toc-entry.is-active .toc-entry-text { font-weight: 500; }

.toc-pop-enter-active {
  transition: opacity 0.14s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.toc-pop-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.toc-pop-enter-from,
.toc-pop-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(8px);
}
</style>
