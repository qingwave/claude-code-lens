<script setup lang="ts">
interface ProjectNode {
  id: string
  displayName: string
}

interface ProjectEdge {
  source: string
  target: string
  type: 'referenced'
  bidirectional?: boolean
}

interface SimNode extends ProjectNode {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  color: string
}

const W = 680
const H = 400
const BASE_R = 9
const MAX_R = 18
const REPULSION = 5000
const SPRING_LEN = 150
const SPRING_K = 0.05
const DAMPING = 0.78
const ITERATIONS = 280

// Node colors: purple palette, semantic by in-degree
const NODE_HUB   = '#6b21a8' // purple-800 — high in-degree
const NODE_BASE  = '#9333ea' // purple-600
const NODE_LEAF  = '#d8b4fe' // purple-300 — isolated / low degree

const EDGE_COLOR = '#a78bfa' // violet-400

const nodes    = ref<SimNode[]>([])
const edges    = ref<ProjectEdge[]>([])
const loading  = ref(true)
const error    = ref(false)
const hoveredId = ref<string | null>(null)
const svgRef   = ref<SVGSVGElement | null>(null)

// Pan + zoom state
const zoom      = ref(1)
const panX      = ref(0)
const panY      = ref(0)
let isPanning   = false
let panStart    = { x: 0, y: 0 }
let panOrigin   = { x: 0, y: 0 }
let dragNode: SimNode | null = null
let dragOff = { x: 0, y: 0 }

function nodeColor(_n: unknown, inDeg: number, maxIn: number): string {
  if (maxIn === 0) return NODE_BASE
  const ratio = inDeg / maxIn
  if (ratio >= 0.7) return NODE_HUB
  if (ratio >= 0.3) return NODE_BASE
  return NODE_LEAF
}

async function load() {
  loading.value = true; error.value = false
  try {
    const data = await $fetch<{ nodes: ProjectNode[]; edges: ProjectEdge[] }>('/api/project-relationships')
    edges.value = data.edges

    // Degree maps
    const inDeg  = new Map<string, number>()
    const outDeg = new Map<string, number>()
    const totDeg = new Map<string, number>()
    for (const n of data.nodes) { inDeg.set(n.id, 0); outDeg.set(n.id, 0); totDeg.set(n.id, 0) }
    for (const e of data.edges) {
      inDeg.set(e.target,  (inDeg.get(e.target)  ?? 0) + 1)
      outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1)
      totDeg.set(e.source, (totDeg.get(e.source) ?? 0) + 1)
      totDeg.set(e.target, (totDeg.get(e.target) ?? 0) + 1)
    }
    const maxIn  = Math.max(...inDeg.values(), 1)
    const maxTot = Math.max(...totDeg.values(), 1)

    const n  = data.nodes.length
    const cx = W / 2, cy = H / 2
    const r  = Math.min(W, H) * 0.33

    nodes.value = data.nodes.map((node, i) => {
      const d     = totDeg.get(node.id) ?? 0
      const ratio = d / maxTot
      return {
        ...node,
        x: cx + r * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
        y: cy + r * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
        vx: 0, vy: 0,
        r: BASE_R + Math.round((MAX_R - BASE_R) * ratio),
        color: nodeColor(null, inDeg.get(node.id) ?? 0, maxIn),
      } as SimNode
    })

    runSimulation()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

function runSimulation() {
  const ns = nodes.value
  const es = edges.value
  const idx = new Map(ns.map((n, i) => [n.id, i]))

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const ni = ns[i]!; const nj = ns[j]!
        const dx = nj.x - ni.x || 0.1, dy = nj.y - ni.y || 0.1
        const d2 = Math.max(dx * dx + dy * dy, 1), d = Math.sqrt(d2)
        const f  = REPULSION / d2
        ni.vx -= f * dx / d; ni.vy -= f * dy / d
        nj.vx += f * dx / d; nj.vy += f * dy / d
      }
    }
    for (const e of es) {
      const si = idx.get(e.source), ti = idx.get(e.target)
      if (si == null || ti == null) continue
      const sn = ns[si]!, tn = ns[ti]!
      const dx = tn.x - sn.x, dy = tn.y - sn.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = SPRING_K * (d - SPRING_LEN)
      sn.vx += f * dx / d; sn.vy += f * dy / d
      tn.vx -= f * dx / d; tn.vy -= f * dy / d
    }
    for (const n of ns) {
      n.vx += (W / 2 - n.x) * 0.009; n.vy += (H / 2 - n.y) * 0.009
      n.vx *= DAMPING; n.vy *= DAMPING
      n.x = Math.max(n.r + 8, Math.min(W - n.r - 8, n.x + n.vx))
      n.y = Math.max(n.r + 12, Math.min(H - n.r - 12, n.y + n.vy))
    }
  }
}

// SVG transform string for pan/zoom
const transform = computed(() =>
  `translate(${panX.value},${panY.value}) scale(${zoom.value})`
)

// Convert mouse coords to SVG space (accounting for pan/zoom)
function toSvgCoords(evt: MouseEvent) {
  const rect = svgRef.value!.getBoundingClientRect()
  const mx = (evt.clientX - rect.left) * (W / rect.width)
  const my = (evt.clientY - rect.top)  * (H / rect.height)
  return {
    x: (mx - panX.value) / zoom.value,
    y: (my - panY.value) / zoom.value,
  }
}

function onWheel(evt: WheelEvent) {
  evt.preventDefault()
  const rect = svgRef.value!.getBoundingClientRect()
  const mx = (evt.clientX - rect.left) * (W / rect.width)
  const my = (evt.clientY - rect.top)  * (H / rect.height)

  const delta = evt.deltaY > 0 ? 0.97 : 1.03
  const newZoom = Math.min(4, Math.max(0.3, zoom.value * delta))

  // Zoom towards cursor
  panX.value = mx - (mx - panX.value) * (newZoom / zoom.value)
  panY.value = my - (my - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

function onMouseDown(evt: MouseEvent) {
  // Check if clicking on a node
  const c = toSvgCoords(evt)
  const hit = nodes.value.find(n => {
    const dx = n.x - c.x, dy = n.y - c.y
    return Math.sqrt(dx * dx + dy * dy) <= n.r
  })
  if (hit) {
    dragNode = hit
    dragOff = { x: c.x - hit.x, y: c.y - hit.y }
  } else {
    isPanning = true
    panStart  = { x: evt.clientX, y: evt.clientY }
    panOrigin = { x: panX.value, y: panY.value }
  }
  evt.preventDefault()
}

function onMouseMove(evt: MouseEvent) {
  if (dragNode && svgRef.value) {
    const c = toSvgCoords(evt)
    dragNode.x = Math.max(dragNode.r + 8, Math.min(W - dragNode.r - 8, c.x - dragOff.x))
    dragNode.y = Math.max(dragNode.r + 12, Math.min(H - dragNode.r - 12, c.y - dragOff.y))
  } else if (isPanning) {
    const rect = svgRef.value!.getBoundingClientRect()
    const scaleX = W / rect.width, scaleY = H / rect.height
    panX.value = panOrigin.x + (evt.clientX - panStart.x) * scaleX
    panY.value = panOrigin.y + (evt.clientY - panStart.y) * scaleY
  }
}

function onMouseUp() { dragNode = null; isPanning = false }

function resetView() { zoom.value = 1; panX.value = 0; panY.value = 0 }

// Edge geometry
function edgeLine(e: ProjectEdge) {
  const s = nodes.value.find(n => n.id === e.source)
  const t = nodes.value.find(n => n.id === e.target)
  if (!s || !t) return null
  const dx = t.x - s.x, dy = t.y - s.y
  const d = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / d, uy = dy / d
  const gap = 5
  const startGap = e.bidirectional ? gap : 0
  return {
    x1: s.x + ux * (s.r + startGap), y1: s.y + uy * (s.r + startGap),
    x2: t.x - ux * (t.r + gap),      y2: t.y - uy * (t.r + gap),
  }
}

function isConnected(id: string) {
  if (!hoveredId.value) return true
  if (id === hoveredId.value) return true
  return edges.value.some(e =>
    (e.source === hoveredId.value && e.target === id) ||
    (e.target === hoveredId.value && e.source === id),
  )
}
function edgeOpacity(e: ProjectEdge) {
  if (!hoveredId.value) return 0.55
  return (e.source === hoveredId.value || e.target === hoveredId.value) ? 0.9 : 0.04
}

// Info panel
const hoveredNode = computed(() => nodes.value.find(n => n.id === hoveredId.value))
const hoveredStats = computed(() => {
  const id = hoveredId.value
  if (!id) return null
  return {
    outgoing:  edges.value.filter(e => e.source === id).length,
    incoming:  edges.value.filter(e => e.target === id).length,
  }
})

onMounted(load)
</script>

<template>
  <div
    class="rounded-xl overflow-hidden"
    style="background: #fafafa; border: 1px solid #e4e4e7"
  >
    <!-- Card title -->
    <div class="flex items-center justify-between px-4 py-3" style="border-bottom: 1px solid #e4e4e7">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-git-fork" class="size-3.5" style="color: #71717a" />
        <span class="text-[13px] font-semibold" style="color: #18181b">Project Relationships</span>
        <span
          v-if="nodes.length"
          class="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style="background: #f4f4f5; color: #71717a"
        >{{ nodes.length }} nodes · {{ edges.length }} edges</span>
      </div>
      <button
        v-if="nodes.length"
        class="text-[11px] px-2 py-1 rounded-md transition-colors hover:bg-zinc-100 focus-ring"
        style="color: #71717a"
        @click="resetView"
      >Reset view</button>
    </div>

    <!-- States -->
    <div v-if="loading" class="flex items-center justify-center" style="height: 400px">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: #a1a1aa" />
    </div>
    <div v-else-if="error" class="flex items-center justify-center text-[12px]" style="height: 400px; color: #a1a1aa">
      Failed to load
    </div>
    <div v-else-if="nodes.length === 0" class="flex flex-col items-center justify-center gap-2" style="height: 400px">
      <UIcon name="i-lucide-git-fork" class="size-7" style="color: #d4d4d8" />
      <p class="text-[12px]" style="color: #a1a1aa">No cross-project relationships yet.</p>
      <p class="text-[11px]" style="color: #c4c4c8">Use <code class="font-mono">/add-dir</code> to link projects.</p>
    </div>

    <!-- Graph -->
    <div
      v-else
      class="relative"
      style="height: 400px"
    >
      <svg
        ref="svgRef"
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full h-full select-none"
        :style="`cursor: ${isPanning ? 'grabbing' : 'grab'}`"
        @wheel.prevent="onWheel"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      >
        <defs>
          <!-- Forward arrow (small, light purple) -->
          <marker id="arr-end" viewBox="0 -2.5 5 5" refX="5" refY="0" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,-2.5L5,0L0,2.5" fill="#c4b5fd" />
          </marker>
          <!-- Reverse arrow for bidirectional -->
          <marker id="arr-start" viewBox="0 -2.5 5 5" refX="0" refY="0" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,-2.5L5,0L0,2.5" fill="#c4b5fd" />
          </marker>
        </defs>

        <g :transform="transform">
          <!-- Edges -->
          <line
            v-for="(e, i) in edges"
            :key="`e${i}`"
            v-bind="edgeLine(e) ?? {}"
            :stroke="EDGE_COLOR"
            :stroke-opacity="edgeOpacity(e)"
            :stroke-width="1 / zoom"
            stroke-dasharray="none"
            marker-end="url(#arr-end)"
            :marker-start="e.bidirectional ? 'url(#arr-start)' : undefined"
          />

          <!-- Nodes -->
          <g
            v-for="node in nodes"
            :key="node.id"
            :transform="`translate(${node.x},${node.y})`"
            @mouseenter="hoveredId = node.id"
            @mouseleave="hoveredId = null"
          >
            <circle
              :r="node.r"
              :fill="node.color"
              :fill-opacity="isConnected(node.id) ? 1 : 0.12"
              :stroke="isConnected(node.id) ? 'rgba(255,255,255,0.7)' : 'transparent'"
              :stroke-width="1.5 / zoom"
            />
            <text
              :y="node.r + 11 / zoom"
              text-anchor="middle"
              :font-size="9.5 / zoom"
              font-weight="400"
              font-family="system-ui, sans-serif"
              :fill="hoveredId === node.id ? '#18181b' : '#71717a'"
              :fill-opacity="isConnected(node.id) ? 1 : 0.2"
              style="pointer-events: none"
            >{{ node.displayName.length > 18 ? node.displayName.slice(0, 17) + '…' : node.displayName }}</text>
          </g>
        </g>
      </svg>

      <!-- Info panel -->
      <Transition name="fade">
        <div
          v-if="hoveredNode && hoveredStats"
          class="absolute top-3 right-3 rounded-lg px-4 py-3 pointer-events-none"
          style="background: white; border: 1px solid #e4e4e7; min-width: 170px; box-shadow: 0 2px 8px rgba(0,0,0,0.07)"
        >
          <p class="text-[13px] font-semibold leading-tight" style="color: #18181b">{{ hoveredNode.displayName }}</p>
          <p class="text-[11px] mt-0.5 mb-2" style="color: #a1a1aa">Project</p>
          <div class="space-y-1 text-[11px]" style="color: #52525b">
            <div v-if="hoveredStats.outgoing" class="flex items-center gap-1.5">
              <span class="size-1.5 rounded-full inline-block" style="background:#a78bfa" />
              depends on {{ hoveredStats.outgoing }} project{{ hoveredStats.outgoing > 1 ? 's' : '' }}
            </div>
            <div v-if="hoveredStats.incoming" class="flex items-center gap-1.5">
              <span class="size-1.5 rounded-full inline-block" style="background:#9333ea" />
              depended on by {{ hoveredStats.incoming }} project{{ hoveredStats.incoming > 1 ? 's' : '' }}
            </div>
            <p v-if="!hoveredStats.outgoing && !hoveredStats.incoming" style="color:#d4d4d8">no links</p>
          </div>
        </div>
      </Transition>

      <!-- Zoom hint -->
      <div class="absolute bottom-2 right-3 text-[10px] pointer-events-none" style="color: #c4c4c8">
        scroll to zoom · drag to pan
      </div>
    </div>

    <!-- Footer legend -->
    <div
      v-if="!loading && !error && nodes.length"
      class="flex items-center gap-5 px-4 py-2.5"
      style="border-top: 1px solid #e4e4e7"
    >
      <!-- Edge legend -->
      <span class="flex items-center gap-1.5 text-[11px]" style="color: #71717a">
        <svg width="20" height="8" style="overflow:visible">
          <defs>
            <marker id="leg-arr-end" viewBox="0 -2.5 5 5" refX="5" refY="0" markerWidth="3" markerHeight="3" orient="auto">
              <path d="M0,-2.5L5,0L0,2.5" fill="#c4b5fd" />
            </marker>
          </defs>
          <line x1="0" y1="4" x2="16" y2="4" stroke="#a78bfa" stroke-width="1" marker-end="url(#leg-arr-end)" />
        </svg>
        depends on
      </span>
      <span class="flex items-center gap-1.5 text-[11px]" style="color: #71717a">
        <svg width="24" height="8" style="overflow:visible">
          <defs>
            <marker id="leg-arr-bi-end" viewBox="0 -2.5 5 5" refX="5" refY="0" markerWidth="3" markerHeight="3" orient="auto">
              <path d="M0,-2.5L5,0L0,2.5" fill="#c4b5fd" />
            </marker>
            <marker id="leg-arr-bi-start" viewBox="0 -2.5 5 5" refX="0" refY="0" markerWidth="3" markerHeight="3" orient="auto-start-reverse">
              <path d="M0,-2.5L5,0L0,2.5" fill="#c4b5fd" />
            </marker>
          </defs>
          <line x1="4" y1="4" x2="20" y2="4" stroke="#a78bfa" stroke-width="1" marker-end="url(#leg-arr-bi-end)" marker-start="url(#leg-arr-bi-start)" />
        </svg>
        interdependent
      </span>
      <span class="text-[11px] ml-auto" style="color: #a1a1aa">
        node size = reference count
      </span>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
