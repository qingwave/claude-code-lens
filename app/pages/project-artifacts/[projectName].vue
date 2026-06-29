<script setup lang="ts">
import type { Agent, Skill } from '~/types'

const route = useRoute()
const toast = useToast()
const projectName = route.params.projectName as string

interface ProjectArtifactsResponse {
  project: { name: string; path: string; displayName: string }
  agents: Agent[]
  skills: Skill[]
}

const { data, pending, error } = useFetch<ProjectArtifactsResponse>(`/api/project-artifacts/${encodeURIComponent(projectName)}/local`)

// CLAUDE.md
const claudeMdContent = ref('')
const claudeMdExists = ref(false)
const claudeMdDraft = ref('')
const claudeMdLoading = ref(false)
const claudeMdSaving = ref(false)
const claudeMdDirty = computed(() => claudeMdDraft.value !== claudeMdContent.value)

async function loadClaudeMd(projectPath: string) {
  claudeMdLoading.value = true
  try {
    const res = await $fetch<{ exists: boolean; content: string }>('/api/projects/claude-md', { query: { path: projectPath } })
    claudeMdExists.value = res.exists
    claudeMdContent.value = res.content
    claudeMdDraft.value = res.content
  } catch {
    // non-critical
  } finally {
    claudeMdLoading.value = false
  }
}

async function saveClaudeMd(projectPath: string) {
  claudeMdSaving.value = true
  try {
    await $fetch('/api/projects/claude-md', { method: 'PUT', body: { path: projectPath, content: claudeMdDraft.value } })
    claudeMdContent.value = claudeMdDraft.value
    claudeMdExists.value = true
    toast.add({ title: 'CLAUDE.md saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Failed to save CLAUDE.md', description: e.message, color: 'error' })
  } finally {
    claudeMdSaving.value = false
  }
}

function createClaudeMd() {
  claudeMdDraft.value = '# Project Instructions\n\n'
  claudeMdExists.value = true
}

// MEMORY.md
const memoryMdContent = ref('')
const memoryMdExists = ref(false)
const memoryMdDraft = ref('')
const memoryMdLoading = ref(false)
const memoryMdSaving = ref(false)
const memoryMdDirty = computed(() => memoryMdDraft.value !== memoryMdContent.value)

async function loadMemoryMd(projectPath: string) {
  memoryMdLoading.value = true
  try {
    const res = await $fetch<{ exists: boolean; content: string }>('/api/projects/memory-md', { query: { path: projectPath } })
    memoryMdExists.value = res.exists
    memoryMdContent.value = res.content
    memoryMdDraft.value = res.content
  } catch {
    // non-critical
  } finally {
    memoryMdLoading.value = false
  }
}

async function saveMemoryMd(projectPath: string) {
  memoryMdSaving.value = true
  try {
    await $fetch('/api/projects/memory-md', { method: 'PUT', body: { path: projectPath, content: memoryMdDraft.value } })
    memoryMdContent.value = memoryMdDraft.value
    memoryMdExists.value = true
    toast.add({ title: 'MEMORY.md saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Failed to save MEMORY.md', description: e.message, color: 'error' })
  } finally {
    memoryMdSaving.value = false
  }
}

function createMemoryMd() {
  memoryMdDraft.value = '# Memory\n\n'
  memoryMdExists.value = true
}

watch(() => data.value?.project?.path, (path) => {
  if (path) {
    loadClaudeMd(path)
    loadMemoryMd(path)
  }
}, { immediate: true })

useHead({
  title: computed(() => data.value ? `${data.value.project.displayName} Artifacts | Agent Manager` : 'Project Artifacts')
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <PageHeader :title="data?.project?.displayName || projectName">
      <template #trailing>
        <span class="text-[12px] text-meta">Project Artifacts</span>
      </template>
      <template #right>
        <div class="flex items-center gap-3">
          <NuxtLink
            :to="`/cli/project/${encodeURIComponent(projectName)}`"
            class="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-2"
            style="background: var(--accent); color: white;"
          >
            <UIcon name="i-lucide-terminal-square" class="size-4" />
            Open in CLI
          </NuxtLink>
        </div>
      </template>
    </PageHeader>

    <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div v-if="pending" class="flex items-center justify-center py-20">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin" style="color: var(--accent);" />
      </div>

      <div v-else-if="error" class="flex flex-col items-center justify-center py-20 text-center">
        <UIcon name="i-lucide-alert-triangle" class="size-10 mb-4" style="color: var(--error);" />
        <h2 class="text-[18px] font-semibold mb-2" style="color: var(--text-primary);">Failed to load project</h2>
        <p class="text-[14px] text-meta mb-6">{{ error.message || 'Project not found' }}</p>
        <NuxtLink to="/project-artifacts" class="text-[13px] font-semibold" style="color: var(--accent);">
          &larr; Back to Artifacts
        </NuxtLink>
      </div>

      <div v-else-if="data" class="space-y-12 max-w-6xl mx-auto">
        <div class="rounded-xl p-4 flex flex-col gap-1" style="background: var(--surface-raised); border: 1px solid var(--border-subtle);">
          <span class="text-[11px] font-mono uppercase tracking-wider" style="color: var(--text-tertiary);">Project Path</span>
          <code class="text-[13px]" style="color: var(--text-primary);">{{ data.project.path }}</code>
        </div>

        <!-- CLAUDE.md -->
        <section>
          <div class="flex items-center gap-3 mb-6 border-b pb-3" style="border-color: var(--border-subtle);">
            <div class="p-2 rounded-lg" style="background: rgba(99,102,241,0.1);">
              <UIcon name="i-lucide-file-text" class="size-5" style="color: #6366f1;" />
            </div>
            <div>
              <h3 class="text-[18px] font-semibold" style="color: var(--text-primary);">CLAUDE.md</h3>
              <p class="text-[13px]" style="color: var(--text-secondary);">Project-level instructions for Claude Code</p>
            </div>
            <span
              v-if="claudeMdExists"
              class="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium"
              style="background: rgba(34,197,94,0.1); color: var(--success, #22c55e);"
            >exists</span>
            <span
              v-else
              class="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium"
              style="background: var(--surface-raised); color: var(--text-tertiary);"
            >not created</span>
          </div>

          <div v-if="claudeMdLoading" class="flex justify-center py-6">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
          </div>
          <template v-else>
            <div v-if="!claudeMdExists" class="text-center py-10 rounded-xl border border-dashed" style="border-color: var(--border-subtle);">
              <UIcon name="i-lucide-file-text" class="size-8 mx-auto mb-3 opacity-20" style="color: var(--text-primary);" />
              <p class="text-[14px] mb-3" style="color: var(--text-secondary);">No CLAUDE.md in this project yet.</p>
              <UButton label="Create CLAUDE.md" icon="i-lucide-plus" size="sm" variant="soft" @click="createClaudeMd" />
            </div>
            <div v-else class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-subtle); height: 380px; display: flex; flex-direction: column;">
              <InstructionEditor v-model="claudeMdDraft" default-mode="preview" placeholder="# Project Instructions&#10;&#10;Write instructions for Claude here..." />
              <div class="shrink-0 flex items-center justify-between px-4 py-2 border-t" style="border-color: var(--border-subtle); background: var(--surface-raised);">
                <span class="text-[11px] text-meta font-mono">{{ claudeMdDraft.split('\n').length }} lines · {{ claudeMdDraft.length.toLocaleString() }} chars</span>
                <div class="flex items-center gap-2">
                  <span v-if="claudeMdDirty" class="text-[11px] text-meta">Unsaved changes</span>
                  <UButton label="Save" icon="i-lucide-save" size="xs" :loading="claudeMdSaving" :disabled="!claudeMdDirty" @click="saveClaudeMd(data.project.path)" />
                </div>
              </div>
            </div>
          </template>
        </section>

        <!-- MEMORY.md -->
        <section>
          <div class="flex items-center gap-3 mb-6 border-b pb-3" style="border-color: var(--border-subtle);">
            <div class="p-2 rounded-lg" style="background: rgba(251,191,36,0.1);">
              <UIcon name="i-lucide-brain" class="size-5" style="color: #fbbf24;" />
            </div>
            <div>
              <h3 class="text-[18px] font-semibold" style="color: var(--text-primary);">MEMORY.md</h3>
              <p class="text-[13px]" style="color: var(--text-secondary);">Persistent facts Claude remembers for this project</p>
            </div>
            <span
              v-if="memoryMdExists"
              class="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium"
              style="background: rgba(34,197,94,0.1); color: var(--success, #22c55e);"
            >exists</span>
            <span
              v-else
              class="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium"
              style="background: var(--surface-raised); color: var(--text-tertiary);"
            >not created</span>
          </div>

          <div v-if="memoryMdLoading" class="flex justify-center py-6">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
          </div>
          <template v-else>
            <div v-if="!memoryMdExists" class="text-center py-10 rounded-xl border border-dashed" style="border-color: var(--border-subtle);">
              <UIcon name="i-lucide-brain" class="size-8 mx-auto mb-3 opacity-20" style="color: var(--text-primary);" />
              <p class="text-[14px] mb-3" style="color: var(--text-secondary);">No MEMORY.md in this project yet.</p>
              <UButton label="Create MEMORY.md" icon="i-lucide-plus" size="sm" variant="soft" @click="createMemoryMd" />
            </div>
            <div v-else class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-subtle); height: 380px; display: flex; flex-direction: column;">
              <InstructionEditor v-model="memoryMdDraft" default-mode="preview" placeholder="# Memory&#10;&#10;- Fact one&#10;- Fact two" />
              <div class="shrink-0 flex items-center justify-between px-4 py-2 border-t" style="border-color: var(--border-subtle); background: var(--surface-raised);">
                <span class="text-[11px] text-meta font-mono">{{ memoryMdDraft.split('\n').length }} lines · {{ memoryMdDraft.length.toLocaleString() }} chars</span>
                <div class="flex items-center gap-2">
                  <span v-if="memoryMdDirty" class="text-[11px] text-meta">Unsaved changes</span>
                  <UButton label="Save" icon="i-lucide-save" size="xs" :loading="memoryMdSaving" :disabled="!memoryMdDirty" @click="saveMemoryMd(data.project.path)" />
                </div>
              </div>
            </div>
          </template>
        </section>
        <section>
          <div class="flex items-center gap-3 mb-6 border-b pb-3" style="border-color: var(--border-subtle);">
            <div class="p-2 rounded-lg" style="background: rgba(251, 191, 36, 0.1);">
              <UIcon name="i-lucide-sparkles" class="size-5" style="color: #fbbf24;" />
            </div>
            <div>
              <h3 class="text-[18px] font-semibold" style="color: var(--text-primary);">Local Skills</h3>
              <p class="text-[13px]" style="color: var(--text-secondary);">Custom skills scanned by file name <code>SKILL.MD</code></p>
            </div>
            <div class="ml-auto px-2.5 py-1 rounded-full text-[12px] font-medium" style="background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);">
              {{ data.skills.length }}
            </div>
          </div>

          <div v-if="data.skills.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
              v-for="skill in data.skills"
              :key="skill.slug"
              :to="`/skills/${skill.slug}?workingDir=${encodeURIComponent(data.project.path)}&filePath=${encodeURIComponent(skill.filePath)}`"
              class="rounded-xl p-4 transition-all duration-200 block cursor-pointer hover-surface"
              style="background: var(--surface-raised); border: 1px solid var(--border-subtle);"
            >
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-lucide-sparkles" class="size-4" style="color: #fbbf24;" />
                <div class="font-medium text-[14px]" style="color: var(--text-primary);">{{ skill.frontmatter.name }}</div>
              </div>
              <p class="text-[12px] line-clamp-3" style="color: var(--text-secondary);">
                {{ skill.frontmatter.description || 'No description' }}
              </p>
              <div class="mt-4 pt-3 flex" style="border-top: 1px solid var(--border-subtle);">
                <span class="text-[10px] font-mono" style="color: var(--text-tertiary);">{{ skill.filePath.split('/').pop() }}</span>
              </div>
            </NuxtLink>
          </div>

          <div v-else class="text-center py-10 rounded-xl border border-dashed" style="border-color: var(--border-subtle);">
            <UIcon name="i-lucide-sparkles" class="size-8 mx-auto mb-3 opacity-20" style="color: var(--text-primary);" />
            <p class="text-[14px]" style="color: var(--text-secondary);">No local skills found in this project.</p>
          </div>
        </section>

        <!-- Local Agents -->
        <section>
          <div class="flex items-center gap-3 mb-6 border-b pb-3" style="border-color: var(--border-subtle);">
            <div class="p-2 rounded-lg" style="background: rgba(99, 102, 241, 0.1);">
              <UIcon name="i-lucide-cpu" class="size-5" style="color: #6366f1;" />
            </div>
            <div>
              <h3 class="text-[18px] font-semibold" style="color: var(--text-primary);">Local Agents</h3>
              <p class="text-[13px]" style="color: var(--text-secondary);">Custom agents scanned in folder name <code>`agents`</code></p>
            </div>
            <div class="ml-auto px-2.5 py-1 rounded-full text-[12px] font-medium" style="background: var(--surface-raised); color: var(--text-secondary); border: 1px solid var(--border-subtle);">
              {{ data.agents.length }}
            </div>
          </div>

          <div v-if="data.agents.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
              v-for="agent in data.agents"
              :key="agent.slug"
              :to="`/agents/${agent.slug}?workingDir=${encodeURIComponent(data.project.path)}`"
              class="rounded-xl p-4 transition-all duration-200 block cursor-pointer hover-surface"
              style="background: var(--surface-raised); border: 1px solid var(--border-subtle);"
            >
              <div class="flex items-center gap-3 mb-3">
                <UIcon name="i-lucide-cpu" class="size-4" style="color: #6366f1;" />
                <div class="font-medium text-[14px]" style="color: var(--text-primary);">{{ agent.frontmatter.name }}</div>
              </div>
              <p class="text-[12px] line-clamp-3" style="color: var(--text-secondary);">
                {{ agent.frontmatter.description || 'No description' }}
              </p>
              <div class="mt-4 pt-3 flex" style="border-top: 1px solid var(--border-subtle);">
                <span class="text-[10px] font-mono" style="color: var(--text-tertiary);">{{ agent.filePath.split('/').pop() }}</span>
              </div>
            </NuxtLink>
          </div>

          <div v-else class="text-center py-10 rounded-xl border border-dashed" style="border-color: var(--border-subtle);">
            <UIcon name="i-lucide-cpu" class="size-8 mx-auto mb-3 opacity-20" style="color: var(--text-primary);" />
            <p class="text-[14px]" style="color: var(--text-secondary);">No local agents found in this project.</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>