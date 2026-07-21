<script setup lang="ts">
import { getAgentColor } from "~/utils/colors";
import { getModelBadgeClasses, getModelColor, MODEL_IDS, MODEL_META, DEFAULT_MODEL } from "~/utils/models";

const { claudeDir, set: setDir } = useClaudeDir();
const { agents, fetchAll: fetchAgents } = useAgents();
const { commands, fetchAll: fetchCommands } = useCommands();
const { plugins, fetchAll: fetchPlugins } = usePlugins();
const { skills, fetchAll: fetchSkills } = useSkills();
const { imports: githubImports, fetchImports } = useGithubImports();
const { settings, load: loadSettings } = useSettings();

const dirInput = ref("");
const settingDir = ref(false);

interface Suggestion {
  type: 'missing-skill' | 'missing-description' | 'empty-body' | 'orphan-skill' | string;
  severity: "warning" | "info";
  message: string;
  target: { type: "agent" | "command" | "skill"; slug: string };
}
const suggestions = ref<Suggestion[]>([]);

const suggestionWarnings = computed(() => suggestions.value.filter(s => s.severity === 'warning'))
const suggestionInfos = computed(() => suggestions.value.filter(s => s.severity === 'info'))

const SUGGESTION_META: Record<string, { icon: string; action: string; color: string; colorRaw: string }> = {
  'empty-body':            { icon: 'i-lucide-file-x',   action: 'Add instructions', color: 'var(--error)',            colorRaw: '#dc2626' },
  'missing-description':   { icon: 'i-lucide-text',     action: 'Add description',  color: 'var(--warning)',          colorRaw: '#d97706' },
  'missing-skill':         { icon: 'i-lucide-puzzle',   action: 'Link a skill',     color: 'var(--warning)',          colorRaw: '#d97706' },
  'orphan-skill':          { icon: 'i-lucide-unlink',   action: 'Assign to agent',  color: 'var(--accent-secondary)', colorRaw: '#6366f1' },
}

const TARGET_META: Record<string, { icon: string; color: string; bg: string }> = {
  agent:   { icon: 'i-lucide-bot',      color: 'var(--accent-secondary)', bg: 'rgba(99,102,241,0.12)' },
  command: { icon: 'i-lucide-terminal', color: 'var(--accent)',           bg: 'rgba(180,83,9,0.12)'   },
  skill:   { icon: 'i-lucide-puzzle',   color: 'var(--success)',          bg: 'rgba(5,150,105,0.12)'  },
}

// Animated counters
const animatedCounts = reactive({
  agents: 0,
  commands: 0,
  skills: 0,
  plugins: 0,
});

interface ActivityStats {
  projects: number;
  sessions: number;
  totalMessages: number;
  memoryFiles: number;
}

const activityStats = ref<ActivityStats>({
  projects: 0,
  sessions: 0,
  totalMessages: 0,
  memoryFiles: 0,
});

const animatedActivity = reactive({
  projects: 0,
  sessions: 0,
  totalMessages: 0,
  memoryFiles: 0,
});

function animateValue(target: number, setter: (v: number) => void) {
  if (target === 0) { setter(0); return; }
  const duration = 600;
  const startTime = performance.now();
  function tick(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    setter(Math.round(eased * target));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateCounter(target: number, key: keyof typeof animatedCounts) {
  animateValue(target, (v) => (animatedCounts[key] = v));
}

function animateActivity(target: number, key: keyof typeof animatedActivity) {
  animateValue(target, (v) => (animatedActivity[key] = v));
}

onMounted(async () => {
  dirInput.value = claudeDir.value || "";
  await Promise.all([
    loadSettings(), 
    fetchPlugins(), 
    fetchSkills(), 
    fetchImports('skills'),
    fetchImports('agents')
  ]);

  // Animate counters after data loads
  nextTick(() => {
    animateCounter(agents.value.length, "agents");
    animateCounter(commands.value.length, "commands");
    animateCounter(skills.value.length, "skills");
    animateCounter(plugins.value.length, "plugins");
  });

  // Watch for data changes to re-animate
  watch(
    () => agents.value.length,
    (v) => animateCounter(v, "agents"),
  );
  watch(
    () => commands.value.length,
    (v) => animateCounter(v, "commands"),
  );
  watch(
    () => skills.value.length,
    (v) => animateCounter(v, "skills"),
  );
  watch(
    () => plugins.value.length,
    (v) => animateCounter(v, "plugins"),
  );

  try {
    suggestions.value = await $fetch<Suggestion[]>("/api/suggestions");
  } catch {
    // Non-critical
  }

  try {
    const stats = await $fetch<ActivityStats>("/api/stats/activity");
    activityStats.value = stats;
    nextTick(() => {
      animateActivity(stats.projects, "projects");
      animateActivity(stats.sessions, "sessions");
      animateActivity(stats.totalMessages, "totalMessages");
      animateActivity(stats.memoryFiles, "memoryFiles");
    });
  } catch {
    // Non-critical
  }
});

async function changeDir() {
  settingDir.value = true;
  try {
    await setDir(dirInput.value);
    await Promise.all([
      fetchAgents(),
      fetchCommands(),
      fetchPlugins(),
      fetchSkills(),
      loadSettings(),
    ]);
  } finally {
    settingDir.value = false;
  }
}

const hasContent = computed(
  () =>
    agents.value.length > 0 ||
    commands.value.length > 0 ||
    skills.value.length > 0 ||
    plugins.value.length > 0,
);

const activityItems = computed(() => [
  {
    key: "projects",
    to: "/project-artifacts",
    count: animatedActivity.projects,
    label: "Projects",
    icon: "i-lucide-folder",
  },
  {
    key: "sessions",
    to: "/cli",
    count: animatedActivity.sessions,
    label: "Sessions",
    icon: "i-lucide-message-square",
  },
  {
    key: "totalMessages",
    to: "/cli",
    count: animatedActivity.totalMessages,
    label: "Messages",
    icon: "i-lucide-messages-square",
  },
  {
    key: "memoryFiles",
    to: "/project-artifacts",
    count: animatedActivity.memoryFiles,
    label: "Memory Files",
    icon: "i-lucide-brain",
  },
]);

const statItems = computed(() => [
  {
    key: "agents" as const,
    to: "/agents",
    count: animatedCounts.agents,
    label: "Agents",
    icon: "i-lucide-cpu",
  },
  {
    key: "commands" as const,
    to: "/commands",
    count: animatedCounts.commands,
    label: "Commands",
    icon: "i-lucide-terminal",
  },
  {
    key: "skills" as const,
    to: "/skills",
    count: animatedCounts.skills,
    label: "Skills",
    icon: "i-lucide-sparkles",
  },
  {
    key: "plugins" as const,
    to: "/plugins",
    count: animatedCounts.plugins,
    label: "Plugins",
    icon: "i-lucide-puzzle",
  },
]);

// Agent model distribution for stats strip
const agentModelStats = computed(() =>
  MODEL_IDS.filter(id => id !== DEFAULT_MODEL).map(id => ({
    id,
    label: MODEL_META[id].label,
    color: getModelColor(id),
    count: agents.value.filter(a => (a.frontmatter.model ?? DEFAULT_MODEL) === id).length,
  })).filter(s => s.count > 0)
)
</script>

<template>
  <div>
    <PageHeader title="Dashboard" />

    <div class="px-6 py-5 stagger-section">

      <!-- Overview: activity + config -->
      <div class="mb-6">
        <p class="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-0.5" style="color: var(--text-disabled)">Overview</p>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NuxtLink
            v-for="item in [...activityItems, ...statItems]"
            :key="item.key"
            :to="item.to"
            class="relative rounded-xl p-5 focus-ring hover-stat overflow-hidden group bg-card"
          >
            <div
              class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style="background: radial-gradient(ellipse at top left, var(--accent-muted) 0%, transparent 60%);"
            />
            <div class="relative">
              <div class="flex items-center gap-2 mb-3">
                <UIcon :name="item.icon" class="size-4 text-meta group-hover:text-[var(--accent)] transition-colors duration-200" />
                <span class="text-[12px] font-medium text-label">{{ item.label }}</span>
              </div>
              <span class="stat-number counter-animate">{{ item.count.toLocaleString() }}</span>
            </div>
          </NuxtLink>
        </div>
      </div>

      <!-- Cost & efficiency -->
      <div class="mb-6">
        <p class="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-0.5" style="color: var(--text-disabled)">Cost</p>
        <TokenStats />
      </div>

      <!-- Activity heatmap -->
      <div class="mb-6">
        <p class="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-0.5" style="color: var(--text-disabled)">Activity</p>
        <ActivityHeatmap />
      </div>

      <!-- Project relationships graph -->
      <div class="mb-6">
        <p class="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-0.5" style="color: var(--text-disabled)">Projects</p>
        <ProjectGraph />
      </div>

      <!-- Bento grid: Agents + Commands + Quick Actions -->
      <div v-if="hasContent" class="mb-6">
        <p class="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-0.5" style="color: var(--text-disabled)">Assets</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- Agents card (takes 2 cols) — Activity pattern -->
        <div class="md:col-span-2 rounded-xl overflow-hidden bg-card">
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3" style="border-bottom: 1px solid var(--border-subtle)">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-cpu" class="size-3.5" style="color: var(--accent)" />
              <span class="text-section-title">Agents</span>
              <span
                class="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style="background: var(--surface-overlay); color: var(--text-disabled)"
              >{{ agents.length }}</span>
            </div>
            <NuxtLink
              to="/agents"
              class="text-[12px] focus-ring rounded-lg px-1.5 py-0.5 hover-bg transition-colors"
              style="color: var(--accent)"
            >View all</NuxtLink>
          </div>

          <!-- Stats strip — non-default model distribution -->
          <div
            v-if="agentModelStats.length"
            class="grid"
            :style="`grid-template-columns: repeat(${agentModelStats.length}, 1fr); border-bottom: 1px solid rgba(0,0,0,0.028)`"
          >
            <!-- Per-model counts only -->
            <div
              v-for="(s, i) in agentModelStats"
              :key="s.id"
              class="flex flex-col items-center justify-center py-3 gap-0.5"
              :style="i < agentModelStats.length - 1 ? 'border-right: 1px solid rgba(0,0,0,0.028)' : ''"
            >
              <div class="flex items-center gap-1">
                <div class="size-1.5 rounded-full shrink-0" :style="{ background: s.color }" />
                <span class="text-[10px] text-meta">{{ s.label }}</span>
              </div>
              <span
                class="text-[18px] font-bold tabular-nums leading-none"
                style="font-family: var(--font-display); letter-spacing: -0.03em"
                :style="{ color: s.color }"
              >{{ s.count }}</span>
            </div>
          </div>

          <!-- Agent rows -->
          <div>
            <NuxtLink
              v-for="agent in agents.slice(0, 6)"
              :key="agent.slug"
              :to="`/agents/${agent.slug}`"
              class="flex items-center gap-3 px-4 py-3 group transition-colors hover:bg-black/[0.025]"
              style="border-top: 1px solid rgba(0,0,0,0.028)"
            >
              <div
                class="size-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
                :style="{
                  background: getAgentColor(agent.frontmatter.color) + '18',
                  border: '1px solid ' + getAgentColor(agent.frontmatter.color) + '25',
                }"
              >
                <UIcon name="i-lucide-cpu" class="size-3.5" :style="{ color: getAgentColor(agent.frontmatter.color) }" />
              </div>
              <div class="flex-1 min-w-0">
                <span class="text-[13px] font-medium truncate block">{{ agent.frontmatter.name }}</span>
                <span v-if="agent.frontmatter.description" class="text-[11px] text-label truncate block">
                  {{ agent.frontmatter.description }}
                </span>
                <span v-else class="text-[11px] text-meta truncate block italic">No description</span>
              </div>
              <span
                v-if="agent.frontmatter.model"
                class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full shrink-0"
                :class="[getModelBadgeClasses(agent.frontmatter.model).bg, getModelBadgeClasses(agent.frontmatter.model).text]"
              >{{ agent.frontmatter.model }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Right column: Commands + Quick Actions -->
        <div class="space-y-4">
          <!-- Commands -->
          <div class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-subtle)">
            <div
              class="flex items-center justify-between px-4 py-3"
              style="background: var(--surface-raised); border-bottom: 1px solid var(--border-subtle);"
            >
              <h3 class="text-section-title flex items-center gap-2">
                <UIcon name="i-lucide-terminal" class="size-4" style="color: var(--accent)" />
                Commands
              </h3>
              <NuxtLink to="/commands" class="text-[12px] focus-ring rounded-lg px-1.5 py-0.5 hover-bg transition-colors" style="color: var(--accent)">View all</NuxtLink>
            </div>
            <div class="divide-y" style="divide-color: var(--border-subtle)">
              <NuxtLink
                v-for="cmd in commands.slice(0, 4)"
                :key="cmd.slug"
                :to="`/commands/${cmd.slug}`"
                class="flex items-center gap-2.5 px-4 py-2.5 hover-bg"
              >
                <span class="font-mono text-[11px] shrink-0" style="color: var(--accent)">/</span>
                <span class="text-[12px] truncate text-body flex-1">{{ cmd.frontmatter.name }}</span>
                <span class="text-[10px] shrink-0 text-meta font-mono">{{ cmd.directory }}</span>
              </NuxtLink>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="space-y-2">
            <NuxtLink to="/graph" class="block rounded-xl p-4 focus-ring hover-card bg-card group">
              <div class="flex items-center gap-3">
                <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--accent-muted); border: 1px solid rgba(229,169,62,0.12);">
                  <UIcon name="i-lucide-workflow" class="size-4" style="color: var(--accent)" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-medium">Relationship Graph</div>
                  <div class="text-[11px] text-label">Visualize connections</div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="size-4 text-meta opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5" />
              </div>
            </NuxtLink>

            <NuxtLink to="/workflows" class="block rounded-xl p-4 focus-ring hover-card bg-card group">
              <div class="flex items-center gap-3">
                <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--accent-muted); border: 1px solid rgba(229,169,62,0.12);">
                  <UIcon name="i-lucide-git-branch" class="size-4" style="color: var(--accent)" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-medium">Create Workflow</div>
                  <div class="text-[11px] text-label">Multi-step pipelines</div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="size-4 text-meta opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5" />
              </div>
            </NuxtLink>

            <NuxtLink to="/explore" class="block rounded-xl p-4 focus-ring hover-card bg-card group">
              <div class="flex items-center gap-3">
                <div class="size-8 rounded-lg flex items-center justify-center shrink-0" style="background: var(--accent-muted); border: 1px solid rgba(229,169,62,0.12);">
                  <UIcon name="i-lucide-compass" class="size-4" style="color: var(--accent)" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[13px] font-medium">Explore</div>
                  <div class="text-[11px] text-label">Templates & extensions</div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="size-4 text-meta opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5" />
              </div>
            </NuxtLink>
          </div>
        </div>
        </div>
      </div>
      <!-- Welcome onboarding (first-run) -->
      <WelcomeOnboarding
        v-if="!hasContent"
        @created="(agent) => navigateTo(`/agents/${agent.slug}`)"
      />

      <!-- Suggestions -->
      <div v-if="suggestions.length && hasContent" class="mb-6">
        <div class="flex items-center justify-between mb-1.5 px-0.5">
          <p class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--text-disabled)">Suggestions</p>
          <div class="flex items-center gap-1.5">
            <span
              v-if="suggestionWarnings.length"
              class="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style="background: var(--error); color: #fff"
            >{{ suggestionWarnings.length }} issue{{ suggestionWarnings.length > 1 ? 's' : '' }}</span>
            <span
              v-if="suggestionInfos.length"
              class="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style="background: var(--badge-subtle-bg); color: var(--text-tertiary)"
            >{{ suggestionInfos.length }} tip{{ suggestionInfos.length > 1 ? 's' : '' }}</span>
          </div>
        </div>
        <div class="space-y-2">
          <NuxtLink
            v-for="(s, idx) in [...suggestionWarnings, ...suggestionInfos].slice(0, 6)"
            :key="idx"
            :to="`/${s.target.type}s/${s.target.slug}`"
            class="flex items-center gap-3 rounded-xl p-3.5 focus-ring hover-card bg-card group"
          >
            <!-- Icon block — same pattern as Quick Actions -->
            <div
              class="size-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
              :style="{
                background: (SUGGESTION_META[s.type]?.colorRaw ?? '#82828e') + '20',
                border: '1px solid ' + (SUGGESTION_META[s.type]?.colorRaw ?? '#82828e') + '30',
              }"
            >
              <UIcon
                :name="SUGGESTION_META[s.type]?.icon ?? 'i-lucide-info'"
                class="size-3.5"
                :style="{ color: SUGGESTION_META[s.type]?.color ?? 'var(--text-tertiary)' }"
              />
            </div>
            <!-- Text -->
            <div class="flex-1 min-w-0">
              <p class="text-[12px] font-medium truncate" style="color: var(--text-primary)">{{ s.message }}</p>
              <p class="text-[11px] mt-0.5 truncate" :style="{ color: SUGGESTION_META[s.type]?.color ?? 'var(--text-tertiary)' }">
                {{ SUGGESTION_META[s.type]?.action ?? 'View' }}
              </p>
            </div>
            <!-- Target badge -->
            <span
              class="shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
              :style="{ background: TARGET_META[s.target.type]?.bg, color: TARGET_META[s.target.type]?.color }"
            >
              <UIcon :name="TARGET_META[s.target.type]?.icon ?? 'i-lucide-box'" class="size-2.5" />
              {{ s.target.type }}
            </span>
            <UIcon name="i-lucide-arrow-right" class="size-4 text-meta opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5 shrink-0" />
          </NuxtLink>
          <p v-if="suggestions.length > 6" class="text-[11px] text-meta text-center pt-1">
            +{{ suggestions.length - 6 }} more
          </p>
        </div>
      </div>

      <!-- Advanced: directory picker -->
      <details>
        <summary class="text-[12px] flex items-center gap-1.5 text-meta cursor-pointer">
          <UIcon name="i-lucide-settings" class="size-3" />
          Advanced: Configuration folder
        </summary>
        <div class="rounded-xl p-4 mt-2 bg-card">
          <p class="text-[12px] mb-3 text-label">
            This is where Claude Code stores your agents, commands, and settings. The default is ~/.claude.
          </p>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-folder" class="size-4 shrink-0 text-meta" />
            <form class="flex-1 flex gap-2" @submit.prevent="changeDir">
              <input v-model="dirInput" placeholder="~/.claude" class="field-input flex-1" />
              <UButton type="submit" :loading="settingDir" label="Load" size="sm" variant="soft" />
            </form>
          </div>
        </div>
      </details>

      <!-- Keyboard shortcuts -->
      <div class="flex items-center gap-4 px-2 text-meta">
        <span class="text-[12px] flex items-center gap-1.5">
          <kbd class="text-[10px] font-mono px-1 py-px rounded badge-subtle">&#x2318;K</kbd>
          Search
        </span>
        <span class="text-[12px] flex items-center gap-1.5">
          <kbd class="text-[10px] font-mono px-1 py-px rounded badge-subtle">&#x2318;S</kbd>
          Save
        </span>
      </div>

    </div>
  </div>
</template>
