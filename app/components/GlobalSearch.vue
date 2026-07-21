<script setup lang="ts">
import { getAgentColor } from '~/utils/colors'
import { getModelBadgeClasses } from '~/utils/models'

const router = useRouter()
const { agents } = useAgents()
const { commands } = useCommands()
const { plugins } = usePlugins()
const { skills } = useSkills()

const open = defineModel<boolean>('open', { default: false })
const query = ref('')
const selectedIndex = ref(0)

type ResultItem = {
  type: string
  label: string
  sublabel: string
  to: string
  icon: string
  color?: string
  model?: string
  matchedText?: string
}

// Remote search results (projects + sessions)
const remoteResults = ref<ResultItem[]>([])
const isSearching = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function fetchRemote(q: string) {
  if (!q.trim()) {
    remoteResults.value = []
    return
  }
  isSearching.value = true
  try {
    const data = await $fetch<{
      projects: { name: string; displayName: string; sessionCount: number; lastActivity?: string }[]
      sessions: { sessionId: string; summary: string; projectName: string; projectDisplayName: string; lastActivity: string; matchedText?: string }[]
    }>(`/api/search?q=${encodeURIComponent(q)}`)

    const items: ResultItem[] = []

    for (const p of data.projects) {
      items.push({
        type: 'Project',
        label: p.displayName,
        sublabel: `${p.sessionCount} sessions`,
        to: `/cli/project/${encodeURIComponent(p.name)}`,
        icon: 'i-lucide-folder',
      })
    }

    for (const s of data.sessions) {
      items.push({
        type: 'Session',
        label: s.summary,
        sublabel: s.projectDisplayName,
        to: `/cli/project/${encodeURIComponent(s.projectName)}/session/${s.sessionId}`,
        icon: 'i-lucide-message-square',
        matchedText: s.matchedText,
      })
    }

    remoteResults.value = items
  } catch {
    remoteResults.value = []
  } finally {
    isSearching.value = false
  }
}

watch(query, (q) => {
  selectedIndex.value = 0
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchRemote(q), 200)
})

watch(open, async (val) => {
  if (!val) {
    query.value = ''
    remoteResults.value = []
    if (debounceTimer) clearTimeout(debounceTimer)
  } else {
    await nextTick()
    document.querySelector<HTMLInputElement>('.search-input')?.focus()
  }
})

// Close on ESC
if (import.meta.client) {
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open.value) {
      open.value = false
    }
  }
  onMounted(() => document.addEventListener('keydown', escHandler))
  onUnmounted(() => document.removeEventListener('keydown', escHandler))
}

const localResults = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return []

  const items: ResultItem[] = []

  for (const agent of agents.value) {
    if (agent.frontmatter.name.toLowerCase().includes(q) || agent.frontmatter.description?.toLowerCase().includes(q)) {
      items.push({
        type: 'Agent',
        label: agent.frontmatter.name,
        sublabel: agent.frontmatter.description || '',
        to: `/agents/${agent.slug}`,
        icon: 'i-lucide-cpu',
        color: getAgentColor(agent.frontmatter.color),
        model: agent.frontmatter.model,
      })
    }
  }

  for (const cmd of commands.value) {
    if (cmd.frontmatter.name.toLowerCase().includes(q) || cmd.frontmatter.description?.toLowerCase().includes(q)) {
      items.push({
        type: 'Command',
        label: `/${cmd.frontmatter.name}`,
        sublabel: cmd.frontmatter.description || '',
        to: `/commands/${cmd.slug}`,
        icon: 'i-lucide-terminal',
      })
    }
  }

  for (const skill of skills.value) {
    if (skill.frontmatter.name.toLowerCase().includes(q) || skill.frontmatter.description?.toLowerCase().includes(q)) {
      items.push({
        type: 'Skill',
        label: skill.frontmatter.name,
        sublabel: skill.frontmatter.description || '',
        to: `/skills/${skill.slug}`,
        icon: 'i-lucide-sparkles',
      })
    }
  }

  for (const plugin of plugins.value) {
    if (plugin.name.toLowerCase().includes(q) || plugin.description?.toLowerCase().includes(q)) {
      items.push({
        type: 'Plugin',
        label: plugin.name,
        sublabel: plugin.description || '',
        to: `/plugins/${encodeURIComponent(plugin.id)}`,
        icon: 'i-lucide-puzzle',
      })
    }
  }

  return items
})

const results = computed(() => {
  const combined = [...localResults.value, ...remoteResults.value]
  return combined.slice(0, 12)
})

function navigate(to: string) {
  router.push(to)
  open.value = false
  query.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter' && results.value[selectedIndex.value]) {
    e.preventDefault()
    navigate(results.value[selectedIndex.value].to)
  }
}

// Global Cmd+K
if (import.meta.client) {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      open.value = !open.value
      if (!open.value) query.value = ''
    }
  }
  onMounted(() => document.addEventListener('keydown', handler))
  onUnmounted(() => document.removeEventListener('keydown', handler))
}
</script>

<template>
  <!-- Backdrop with blur -->
  <Teleport to="body">
    <Transition name="search-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
        style="backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); background: rgba(0,0,0,0.2);"
        @click.self="open = false"
      >
        <!-- Search card -->
        <Transition name="search-slide">
          <div
            v-if="open"
            class="search-card w-full mx-4"
            style="max-width: 580px;"
            @click.stop
          >
            <!-- Input row -->
            <div class="search-input-row">
              <div class="search-icon-wrap">
                <UIcon v-if="!isSearching" name="i-lucide-search" class="size-4" />
                <UIcon v-else name="i-lucide-loader-2" class="size-4 animate-spin" />
              </div>
              <input
                v-model="query"
                class="search-input"
                placeholder="Search agents, commands, skills, sessions..."
                autofocus
                @keydown="onKeydown"
              />
              <div class="search-shortcuts">
                <kbd class="search-kbd">↑↓</kbd>
                <kbd class="search-kbd">↵</kbd>
                <kbd class="search-kbd">ESC</kbd>
              </div>
            </div>

            <!-- Results area -->
            <div class="search-results-wrap">
              <!-- Empty state -->
              <div v-if="!query" class="search-empty">
                <UIcon name="i-lucide-search" class="size-5 mb-2 opacity-30" />
                <p class="text-[12px] text-meta">Type to search across all items</p>
              </div>
              <div v-else-if="!results.length && !isSearching" class="search-empty">
                <UIcon name="i-lucide-search-x" class="size-5 mb-2 opacity-30" />
                <p class="text-[13px] text-label">No results for <span class="font-mono">"{{ query }}"</span></p>
              </div>

              <!-- Result groups by type -->
              <template v-else>
                <div
                  v-for="(result, idx) in results"
                  :key="result.to"
                  class="search-result-item"
                  :class="{ 'is-selected': idx === selectedIndex }"
                  @mouseenter="selectedIndex = idx"
                  @click="navigate(result.to)"
                >
                  <!-- Icon / color dot -->
                  <div class="search-result-icon">
                    <div
                      v-if="result.color"
                      class="size-2.5 rounded-full"
                      :style="{ background: result.color }"
                    />
                    <UIcon v-else :name="result.icon" class="size-3.5" />
                  </div>

                  <!-- Main content -->
                  <div class="search-result-body">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="search-result-label truncate">{{ result.label }}</span>
                      <span
                        v-if="result.model"
                        class="search-result-model shrink-0"
                        :class="[getModelBadgeClasses(result.model).bg, getModelBadgeClasses(result.model).text]"
                      >{{ result.model }}</span>
                    </div>
                    <div class="flex items-center gap-2 min-w-0">
                      <span v-if="result.sublabel" class="search-result-sub truncate">{{ result.sublabel }}</span>
                      <span v-if="result.matchedText" class="search-result-match truncate font-mono">{{ result.matchedText }}</span>
                    </div>
                  </div>

                  <!-- Type badge -->
                  <span class="search-result-type" :data-type="result.type">{{ result.type }}</span>

                  <!-- Arrow indicator when selected -->
                  <UIcon v-if="idx === selectedIndex" name="i-lucide-corner-down-left" class="size-3 shrink-0 text-meta opacity-60" />
                </div>
              </template>
            </div>

            <!-- Footer hint -->
            <div v-if="results.length" class="search-footer">
              <span>{{ results.length }} result{{ results.length > 1 ? 's' : '' }}</span>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.search-card {
  background: color-mix(in srgb, var(--color-background, #fff) 88%, transparent);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid color-mix(in srgb, var(--border-subtle, #e5e7eb) 70%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.14), 0 1px 4px rgba(0,0,0,0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 480px;
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle, #e5e7eb) 50%, transparent);
}

.search-icon-wrap {
  color: var(--color-text-meta, #9ca3af);
  flex-shrink: 0;
  display: flex;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, inherit);
  caret-color: var(--color-text, inherit);
}

.search-input::placeholder {
  color: var(--color-text-meta, #9ca3af);
  font-weight: 400;
}

.search-shortcuts {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.search-kbd {
  font-family: ui-monospace, monospace;
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--surface-hover, #f3f4f6) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle, #e5e7eb) 70%, transparent);
  color: var(--color-text-meta, #9ca3af);
  line-height: 1.4;
}

.search-results-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
}

.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--color-text-meta, #9ca3af);
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.1s ease;
  text-align: left;
  width: 100%;
}

.search-result-item.is-selected {
  background: color-mix(in srgb, var(--color-primary, #6366f1) 10%, transparent);
}

.search-result-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-hover, #f3f4f6) 70%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle, #e5e7eb) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-text-meta, #6b7280);
}

.is-selected .search-result-icon {
  background: color-mix(in srgb, var(--color-primary, #6366f1) 15%, transparent);
  border-color: color-mix(in srgb, var(--color-primary, #6366f1) 25%, transparent);
  color: var(--color-primary, #6366f1);
}

.search-result-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.search-result-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, inherit);
  font-family: ui-monospace, monospace;
}

.search-result-sub {
  font-size: 11px;
  color: var(--color-text-meta, #9ca3af);
}

.search-result-match {
  font-size: 11px;
  color: var(--color-text-meta, #9ca3af);
}

.search-result-model {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 20px;
}

.search-result-type {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 20px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--surface-hover, #f3f4f6) 80%, transparent);
  color: var(--color-text-meta, #6b7280);
  border: 1px solid color-mix(in srgb, var(--border-subtle, #e5e7eb) 60%, transparent);
}

.search-result-type[data-type="Agent"] { background: color-mix(in srgb, #6366f1 12%, transparent); color: #6366f1; border-color: color-mix(in srgb, #6366f1 20%, transparent); }
.search-result-type[data-type="Command"] { background: color-mix(in srgb, #10b981 12%, transparent); color: #10b981; border-color: color-mix(in srgb, #10b981 20%, transparent); }
.search-result-type[data-type="Skill"] { background: color-mix(in srgb, #f59e0b 12%, transparent); color: #f59e0b; border-color: color-mix(in srgb, #f59e0b 20%, transparent); }
.search-result-type[data-type="Plugin"] { background: color-mix(in srgb, #ec4899 12%, transparent); color: #ec4899; border-color: color-mix(in srgb, #ec4899 20%, transparent); }
.search-result-type[data-type="Project"] { background: color-mix(in srgb, #3b82f6 12%, transparent); color: #3b82f6; border-color: color-mix(in srgb, #3b82f6 20%, transparent); }
.search-result-type[data-type="Session"] { background: color-mix(in srgb, #8b5cf6 12%, transparent); color: #8b5cf6; border-color: color-mix(in srgb, #8b5cf6 20%, transparent); }

.search-footer {
  padding: 6px 16px;
  border-top: 1px solid color-mix(in srgb, var(--border-subtle, #e5e7eb) 40%, transparent);
  font-size: 11px;
  color: var(--color-text-meta, #9ca3af);
  font-family: ui-monospace, monospace;
}

/* Transitions */
.search-fade-enter-active,
.search-fade-leave-active {
  transition: opacity 0.18s ease;
}
.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}

.search-slide-enter-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.2, 0.64, 1);
}
.search-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.search-slide-enter-from,
.search-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
</style>
