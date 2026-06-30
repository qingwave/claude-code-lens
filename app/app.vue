<script setup lang="ts">
const route = useRoute()
const { claudeDir, exists: claudeDirExists, load: loadConfig } = useClaudeDir()
const { fetchAll: fetchAgents, agents } = useAgents()
const { fetchAll: fetchCommands, commands } = useCommands()
const { fetchAll: fetchPlugins, plugins } = usePlugins()
const { fetchAll: fetchSkills, skills } = useSkills()
const { fetchAll: fetchWorkflows, workflows } = useWorkflows()
const { fetchServers, servers: mcpServers } = useMCP()
const { styles, fetchStyles } = useOutputStyles()

const initialized = ref(false)
const showSearch = ref(false)
const sidebarCollapsed = useState('sidebar-collapsed', () => false)

// Auto-collapse sidebar when entering CLI, restore when leaving
watch(() => route.path, (path) => {
  sidebarCollapsed.value = path.startsWith('/cli')
}, { immediate: true })
const { isPanelOpen: chatOpen } = useChat()
const colorMode = useColorMode()

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

// Cmd+J to toggle chat
if (import.meta.client) {
  const chatHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
      e.preventDefault()
      chatOpen.value = !chatOpen.value
    }
  }
  onMounted(() => document.addEventListener('keydown', chatHandler))
  onUnmounted(() => document.removeEventListener('keydown', chatHandler))
}

onMounted(async () => {
  await loadConfig()
  await Promise.all([fetchAgents(), fetchCommands(), fetchPlugins(), fetchSkills(), fetchWorkflows(), fetchServers()])
  initialized.value = true
})

const navPrimary = [
  { label: 'CLI', icon: 'i-lucide-terminal-square', to: '/cli' },
  { label: 'Artifacts', icon: 'i-lucide-folder-root', to: '/project-artifacts' },
  { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
]

const navTop = [
  { label: 'Agents', icon: 'i-lucide-cpu', to: '/agents' },
  { label: 'Workflows', icon: 'i-lucide-git-branch', to: '/workflows' },
  { label: 'Commands', icon: 'i-lucide-terminal', to: '/commands' },
  { label: 'Skills', icon: 'i-lucide-sparkles', to: '/skills' },
  { label: 'Plugins', icon: 'i-lucide-puzzle', to: '/plugins' },
  { label: 'MCP Servers', icon: 'i-lucide-server', to: '/mcp' },
  { label: 'Output Styles', icon: 'i-lucide-palette', to: '/output-styles' },
]

const navMid: { key: string; label: string; icon: string; to: string }[] = []

const navBottom = [
  { label: 'Explore', icon: 'i-lucide-compass', to: '/explore' },
  { label: 'Graph', icon: 'i-lucide-workflow', to: '/graph' },
]

function isActive(to: string) {
  // Exact match or sub-route
  return route.path === to || route.path.startsWith(to + '/')
}

function badgeFor(to: string) {
  if (to === '/agents') return agents.value.length || null
  if (to === '/commands') return commands.value.length || null
  if (to === '/skills') return skills.value.length || null
  if (to === '/plugins') return plugins.value.length || null
  if (to === '/workflows') return workflows.value.length || null
  if (to === '/mcp') return mcpServers.value.length || null
  return null
}
</script>

<template>
  <UApp>
    <div class="flex h-screen overflow-hidden" style="background: var(--surface-base);">
      <!-- Sidebar -->
      <aside
        class="sidebar shrink-0 flex flex-col relative h-full overflow-hidden transition-all duration-300"
        :style="{
          width: sidebarCollapsed ? '56px' : '200px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border-subtle)',
        }"
      >
        <!-- Ambient glow at top — stronger -->
        <div
          class="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-32 pointer-events-none"
          style="background: radial-gradient(ellipse, rgba(229, 169, 62, 0.1) 0%, transparent 70%);"
        />

        <!-- Brand -->
        <div class="h-[56px] flex items-center gap-2.5 relative" :class="sidebarCollapsed ? 'justify-center px-2' : 'px-4'">
          <NuxtLink to="/cli" class="flex items-center gap-2.5 flex-1 min-w-0 group/brand" v-if="!sidebarCollapsed">
            <div
              class="size-7 rounded-lg flex items-center justify-center relative shrink-0 transition-transform duration-200 group-hover/brand:scale-105"
              style="background: linear-gradient(135deg, rgba(229, 169, 62, 0.18) 0%, rgba(229, 169, 62, 0.06) 100%); border: 1px solid rgba(229, 169, 62, 0.15);"
            >
              <UIcon name="i-lucide-bot" class="size-3.5" style="color: var(--accent);" />
            </div>
            <div class="flex-1 flex flex-col min-w-0">
              <span class="text-[12px] font-semibold tracking-tight group-hover/brand:text-accent transition-colors" style="color: var(--text-primary); font-family: var(--font-display);">
                Agent Manager
              </span>
              <span class="text-[9px] font-mono tracking-wider uppercase" style="color: var(--text-disabled);">
                Claude Code
              </span>
            </div>
          </NuxtLink>
          <!-- Collapsed: clicking the icon expands the sidebar -->
          <button
            v-else
            class="size-7 rounded-lg flex items-center justify-center relative shrink-0 transition-all duration-150 focus-ring press-scale"
            style="background: linear-gradient(135deg, rgba(229, 169, 62, 0.18) 0%, rgba(229, 169, 62, 0.06) 100%); border: 1px solid rgba(229, 169, 62, 0.15);"
            title="Expand sidebar"
            @click="sidebarCollapsed = false"
          >
            <UIcon name="i-lucide-bot" class="size-3.5" style="color: var(--accent);" />
          </button>
          <!-- Collapse toggle — only shown when expanded -->
          <button
            v-if="!sidebarCollapsed"
            class="hidden md:flex size-7 items-center justify-center rounded-lg transition-all duration-150 focus-ring press-scale shrink-0"
            style="color: var(--text-tertiary);"
            :title="'Collapse sidebar'"
            @mouseenter="($event.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.background = 'transparent'"
            @click="sidebarCollapsed = true"
          >
            <UIcon name="i-lucide-panel-left-close" class="size-4" />
          </button>
        </div>

        <!-- Primary Nav -->
        <nav class="flex-1 pt-1 space-y-0.5 overflow-y-auto" :class="sidebarCollapsed ? 'px-1.5' : 'px-2.5'">
          <!-- Primary Section: CLI, Artifacts, Dashboard -->
          <NuxtLink
            v-for="link in navPrimary"
            :key="link.to"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[13px] transition-all duration-150 relative focus-ring"
            :class="[
              sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-[7px]',
              { 'nav-item--active': isActive(link.to) }
            ]"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <span v-if="!sidebarCollapsed" class="flex-1" style="font-family: var(--font-sans);">{{ link.label }}</span>
          </NuxtLink>

          <!-- Separator -->
          <div class="my-3" :class="sidebarCollapsed ? 'mx-1' : 'mx-2'" style="border-top: 1px solid var(--border-subtle);" />

          <!-- Top Section -->
          <NuxtLink
            v-for="link in navTop"
            :key="link.to"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[13px] transition-all duration-150 relative focus-ring"
            :class="[
              sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-[7px]',
              { 'nav-item--active': isActive(link.to) }
            ]"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <!-- Active indicator bar -->
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <template v-if="!sidebarCollapsed">
              <span class="flex-1" style="font-family: var(--font-sans);">{{ link.label }}</span>
              <span
                v-if="badgeFor(link.to)"
                class="font-mono text-[10px] tabular-nums transition-colors duration-150"
                :style="{ color: isActive(link.to) ? 'var(--accent)' : 'var(--text-disabled)' }"
              >
                {{ badgeFor(link.to) }}
              </span>
            </template>
          </NuxtLink>

          <!-- Separator 1 -->
          <div v-if="navMid.length > 0" class="my-3" :class="sidebarCollapsed ? 'mx-1' : 'mx-2'" style="border-top: 1px solid var(--border-subtle);" />

          <!-- Mid Section: Projects & CLI -->
          <NuxtLink
            v-for="link in navMid"
            :key="link.key"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[13px] transition-all duration-150 relative focus-ring"
            :class="[
              sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-[7px]',
              { 'nav-item--active': isActive(link.to) }
            ]"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <template v-if="!sidebarCollapsed">
              <span class="flex-1" style="font-family: var(--font-sans);">{{ link.label }}</span>
            </template>
          </NuxtLink>

          <!-- Separator 2 -->
          <div class="my-3" :class="sidebarCollapsed ? 'mx-1' : 'mx-2'" style="border-top: 1px solid var(--border-subtle);" />

          <!-- Bottom Section -->
          <NuxtLink
            v-for="link in navBottom"
            :key="link.to"
            :to="link.to"
            class="nav-item group flex items-center rounded-lg text-[13px] transition-all duration-150 relative focus-ring"
            :class="[
              sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-3 py-[7px]',
              { 'nav-item--active': isActive(link.to) }
            ]"
            :style="{
              color: isActive(link.to) ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontWeight: isActive(link.to) ? '500' : '400',
              background: isActive(link.to) ? 'var(--accent-muted)' : undefined,
            }"
            :title="sidebarCollapsed ? link.label : undefined"
          >
            <UIcon :name="link.icon" class="size-[15px] shrink-0 transition-colors duration-150" :style="{ color: isActive(link.to) ? 'var(--accent)' : undefined }" />
            <span v-if="!sidebarCollapsed" style="font-family: var(--font-sans);">{{ link.label }}</span>
          </NuxtLink>
        </nav>

        <!-- Search shortcut -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-2.5' : 'px-2.5 pb-2.5'">
          <button
            class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
            style="color: var(--text-disabled); background: var(--input-bg); border: 1px solid var(--border-subtle);"
            :title="sidebarCollapsed ? 'Search (⌘K)' : undefined"
            @mouseenter="($event.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; ($event.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; ($event.currentTarget as HTMLElement).style.color = 'var(--text-disabled)'"
            @click="showSearch = true"
          >
            <UIcon name="i-lucide-search" class="size-3.5" />
            <template v-if="!sidebarCollapsed">
              <span class="text-[12px] flex-1 text-left" style="font-family: var(--font-sans);">Search</span>
              <kbd class="text-[9px] font-mono px-1.5 py-0.5 rounded" style="background: var(--badge-subtle-bg); color: var(--text-disabled);">⌘K</kbd>
            </template>
          </button>
        </div>

        <!-- Chat with Claude -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-1' : 'px-2.5 pb-1'">
          <button
            class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring cursor-pointer press-scale"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
            :style="{
              color: chatOpen ? 'var(--accent)' : 'var(--text-tertiary)',
              background: chatOpen ? 'var(--accent-muted)' : 'transparent',
            }"
            :title="sidebarCollapsed ? 'Claude (⌘J)' : undefined"
            @click="chatOpen = !chatOpen"
          >
            <div class="size-4 relative flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-zap" class="size-4" />
              <div
                v-if="chatOpen"
                class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full"
                style="background: var(--accent); box-shadow: 0 0 8px var(--accent-glow);"
              />
            </div>
            <template v-if="!sidebarCollapsed">
              <span class="text-[12px] flex-1 text-left" style="font-family: var(--font-sans);">Claude</span>
              <kbd class="text-[9px] font-mono px-1.5 py-0.5 rounded" style="background: var(--badge-subtle-bg); color: var(--text-disabled);">⌘J</kbd>
            </template>
          </button>
        </div>

        <!-- Theme toggle -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-1' : 'px-2.5 pb-1'">
          <ClientOnly>
            <button
              class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring press-scale"
              :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
              style="color: var(--text-tertiary);"
              :title="sidebarCollapsed ? (colorMode.value === 'dark' ? 'Light mode' : 'Dark mode') : undefined"
              @click="toggleTheme"
            >
              <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" />
              <span v-if="!sidebarCollapsed" class="text-[12px]" style="font-family: var(--font-sans);">
                {{ colorMode.value === 'dark' ? 'Light mode' : 'Dark mode' }}
              </span>
            </button>
          </ClientOnly>
        </div>

        <!-- Footer: Settings -->
        <div :class="sidebarCollapsed ? 'px-1.5 pb-2.5' : 'px-2.5 pb-2.5'">
          <NuxtLink
            to="/settings"
            class="w-full flex items-center rounded-lg transition-all duration-150 focus-ring press-scale"
            :class="sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2'"
            style="color: var(--text-tertiary);"
            :title="sidebarCollapsed ? 'Settings' : undefined"
          >
            <UIcon name="i-lucide-settings" class="size-4" />
            <span v-if="!sidebarCollapsed" class="text-[12px]" style="font-family: var(--font-sans);">Settings</span>
          </NuxtLink>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar" style="background: var(--surface-base); scrollbar-gutter: stable;">
        <!-- Setup wizard when directory doesn't exist -->
        <SetupWizard
          v-if="initialized && !claudeDirExists"
          @complete="async () => { await loadConfig(); await Promise.all([fetchAgents(), fetchCommands(), fetchPlugins(), fetchSkills(), fetchWorkflows(), fetchServers(), fetchStyles()]) }"
        />

        <div v-show="initialized && claudeDirExists" class="h-full">
          <NuxtPage />
        </div>
        <div v-if="!initialized" class="flex items-center justify-center h-full">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" style="color: var(--text-disabled);" />
        </div>
      </main>
    </div>
    <GlobalSearch v-model:open="showSearch" />
    <ChatPanel v-model:open="chatOpen" />
    <FileEditorSidebar v-if="!route.path.startsWith('/cli')" />
  </UApp>
</template>

<style scoped>
/* Nav item hover with smooth background reveal */
.nav-item {
  transition: background 0.15s, color 0.15s;
}
.nav-item:hover {
  background: var(--surface-hover);
}

/* Fade transition for mobile backdrop */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
