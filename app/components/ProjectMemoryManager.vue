<script setup lang="ts">
const props = defineProps<{ projectName?: string }>()

interface MemoryFileMeta {
  filename: string
  name: string
  description: string
  type: string
  size: number
  mtime: string
}

type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

const TYPE_META: Record<MemoryType, { label: string; icon: string; bg: string; text: string; hint: string }> = {
  user:      { label: 'User',      icon: 'i-lucide-user',           bg: 'rgba(59,130,246,0.1)',  text: '#3b82f6', hint: 'Who you are, your role, preferences' },
  feedback:  { label: 'Feedback',  icon: 'i-lucide-message-circle', bg: 'rgba(234,179,8,0.1)',   text: '#ca8a04', hint: 'How you want Claude to work' },
  project:   { label: 'Project',   icon: 'i-lucide-folder',         bg: 'rgba(168,85,247,0.1)',  text: '#a855f7', hint: 'Ongoing work context and goals' },
  reference: { label: 'Reference', icon: 'i-lucide-link',           bg: 'rgba(34,197,94,0.1)',   text: '#22c55e', hint: 'Pointers to external resources' },
}

const TYPE_OPTIONS = (Object.keys(TYPE_META) as MemoryType[]).map(k => ({
  value: k,
  label: TYPE_META[k].label,
  description: TYPE_META[k].hint,
}))

const toast = useToast()
const files = ref<MemoryFileMeta[]>([])
const loading = ref(true)
const selectedFile = ref<string | null>(null)
const selectedMeta = computed(() => files.value.find(f => f.filename === selectedFile.value) ?? null)
const bodyContent = ref('')
const bodyOriginal = ref('')
const cachedFrontmatter = ref('')
const contentLoading = ref(false)
const saving = ref(false)
const isDirty = computed(() => bodyContent.value !== bodyOriginal.value)

const showNewModal = ref(false)
const newName = ref('')
const newType = ref<MemoryType>(props.projectName ? 'project' : 'user')
const newDescription = ref('')
const creating = ref(false)

const pendingDelete = ref<string | null>(null)
const deleting = ref(false)

const apiBase = computed(() =>
  props.projectName ? `/api/projects/${props.projectName}/memory` : '/api/memory'
)
  loading.value = true
  try {
    files.value = await $fetch<MemoryFileMeta[]>(apiBase.value)
  } catch {
    files.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadFiles)

async function selectFile(filename: string) {
  selectedFile.value = filename
  contentLoading.value = true
  bodyContent.value = ''
  cachedFrontmatter.value = ''
  try {
    const res = await $fetch<{ content: string }>(`${apiBase.value}/${filename}`)
    if (res.content.startsWith('---')) {
      const end = res.content.indexOf('\n---', 3)
      if (end !== -1) {
        cachedFrontmatter.value = res.content.slice(0, end + 4)
        bodyContent.value = res.content.slice(end + 4).replace(/^\n/, '')
      } else {
        bodyContent.value = res.content
      }
    } else {
      bodyContent.value = res.content
    }
    bodyOriginal.value = bodyContent.value
  } catch {
    toast.add({ title: 'Failed to load file', color: 'error' })
  } finally {
    contentLoading.value = false
  }
}

async function save() {
  if (!selectedFile.value) return
  saving.value = true
  try {
    const newContent = cachedFrontmatter.value
      ? cachedFrontmatter.value + '\n' + bodyContent.value
      : bodyContent.value
    await $fetch(`${apiBase.value}/${selectedFile.value}`, {
      method: 'PUT',
      body: { content: newContent },
    })
    bodyOriginal.value = bodyContent.value
    toast.add({ title: 'Saved', color: 'success' })
    await loadFiles()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e.data?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

function closePreview() {
  if (isDirty.value && !confirm('Discard unsaved changes?')) return
  selectedFile.value = null
  bodyContent.value = ''
  bodyOriginal.value = ''
  cachedFrontmatter.value = ''
}

const BODY_TEMPLATES: Record<MemoryType, string> = {
  user:      'I am a software engineer. My preferences:\n\n- ',
  feedback:  'Rule: \n\n**Why:** \n\n**How to apply:** ',
  project:   'Fact: \n\n**Why:** \n\n**How to apply:** ',
  reference: 'Resource at: \n\nUsed for: ',
}

async function createFile() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const { filename } = await $fetch<{ filename: string }>(apiBase.value, {
      method: 'POST',
      body: {
        name: newName.value.trim(),
        type: newType.value,
        description: newDescription.value.trim(),
        content: BODY_TEMPLATES[newType.value],
      },
    })
    toast.add({ title: 'Memory file created', color: 'success' })
    showNewModal.value = false
    newName.value = ''
    newDescription.value = ''
    await loadFiles()
    await selectFile(filename)
  } catch (e: any) {
    toast.add({ title: 'Failed to create', description: e.data?.message, color: 'error' })
  } finally {
    creating.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await $fetch(`${apiBase.value}/${pendingDelete.value}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', color: 'success' })
    if (selectedFile.value === pendingDelete.value) {
      selectedFile.value = null
      bodyContent.value = ''
      bodyOriginal.value = ''
      cachedFrontmatter.value = ''
    }
    pendingDelete.value = null
    await loadFiles()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e.data?.message, color: 'error' })
  } finally {
    deleting.value = false
  }
}

function typeOf(file: MemoryFileMeta): MemoryType {
  return (file.type as MemoryType) in TYPE_META ? (file.type as MemoryType) : (props.projectName ? 'project' : 'user')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(1) + ' KB'
}
</script>

<template>
  <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
    <div v-for="i in 3" :key="i" class="h-24 rounded-xl animate-pulse" style="background: var(--surface-raised)" />
  </div>

  <div v-else-if="files.length === 0" class="text-center py-16 rounded-xl border border-dashed" style="border-color: var(--border-subtle)">
    <UIcon name="i-lucide-brain" class="size-8 mx-auto mb-3 opacity-20" style="color: var(--text-primary)" />
    <p class="text-[14px] mb-1" style="color: var(--text-secondary)">No memory files yet</p>
    <p class="text-[12px] mb-4 text-meta">Claude will create these automatically as you work</p>
    <UButton label="Create manually" icon="i-lucide-plus" size="sm" variant="soft" @click="showNewModal = true" />
  </div>

  <template v-else>
    <!-- File cards grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <button
        v-for="file in files"
        :key="file.filename"
        class="group relative text-left rounded-xl p-4 transition-all duration-200 overflow-hidden"
        style="background: var(--surface-raised); border: 1px solid var(--border-subtle)"
        @mouseenter="e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border-default)'; el.style.transform = 'translateY(-2px)'; el.style.boxShadow = '0 4px 20px var(--card-shadow)' }"
        @mouseleave="e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border-subtle)'; el.style.transform = ''; el.style.boxShadow = '' }"
        @click="selectFile(file.filename)"
      >
        <!-- Hover glow -->
        <div
          class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          :style="{ background: `radial-gradient(ellipse at top, ${TYPE_META[typeOf(file)].text}08 0%, transparent 60%)` }"
        />

        <div class="flex items-center gap-2 relative">
          <div
            class="size-5 rounded-md shrink-0 flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
            :style="{ background: TYPE_META[typeOf(file)].bg }"
          >
            <UIcon :name="TYPE_META[typeOf(file)].icon" class="size-3" :style="{ color: TYPE_META[typeOf(file)].text }" />
          </div>
          <p class="text-[13px] font-medium truncate flex-1 min-w-0" style="color: var(--text-primary)">{{ file.name }}</p>
          <button
            class="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            style="color: var(--text-disabled)"
            title="Delete"
            @click.stop="pendingDelete = file.filename"
          >
            <UIcon name="i-lucide-trash-2" class="size-3.5" />
          </button>
        </div>
        <p class="text-[11px] mt-1.5 line-clamp-2" style="color: var(--text-tertiary)">
          {{ file.description || 'No description' }}
        </p>

        <div class="flex items-center gap-2 mt-3 pt-3 relative" style="border-top: 1px solid var(--border-subtle)">
          <span
            class="text-[10px] px-1.5 py-0.5 rounded-full"
            :style="{ background: TYPE_META[typeOf(file)].bg, color: TYPE_META[typeOf(file)].text }"
          >{{ TYPE_META[typeOf(file)].label }}</span>
          <span class="text-[10px]" style="color: var(--text-disabled)">{{ formatDate(file.mtime) }}</span>
        </div>
      </button>

      <!-- Add card -->
      <button
        class="group rounded-xl p-4 transition-all duration-200 border border-dashed flex flex-col items-center justify-center gap-2"
        style="border-color: var(--border-subtle); color: var(--text-disabled)"
        @click="showNewModal = true"
      >
        <UIcon name="i-lucide-plus" class="size-5 group-hover:text-meta transition-colors" />
        <span class="text-[12px] group-hover:text-meta transition-colors">New memory file</span>
      </button>
    </div>

    <!-- Preview modal -->
    <UModal
      :open="!!selectedFile"
      :ui="{ container: 'items-center', content: 'max-w-3xl w-full' }"
      @update:open="val => { if (!val) closePreview() }"
    >
      <template #content>
        <div class="bg-overlay rounded-2xl overflow-hidden flex flex-col" style="max-height: 80vh">
          <!-- Modal header -->
          <div class="flex items-center gap-3 px-5 py-3.5 shrink-0" style="border-bottom: 1px solid var(--border-subtle)">
            <div
              v-if="selectedMeta"
              class="size-7 rounded-lg flex items-center justify-center shrink-0"
              :style="{ background: TYPE_META[typeOf(selectedMeta)].bg }"
            >
              <UIcon :name="TYPE_META[typeOf(selectedMeta)].icon" class="size-3.5" :style="{ color: TYPE_META[typeOf(selectedMeta)].text }" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-semibold" style="color: var(--text-primary)">{{ selectedMeta?.name ?? selectedFile }}</p>
              <p v-if="selectedMeta?.description" class="text-[11px] text-meta">{{ selectedMeta.description }}</p>
            </div>
            <span
              class="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 hidden sm:block"
              :style="selectedMeta ? { background: TYPE_META[typeOf(selectedMeta)].bg, color: TYPE_META[typeOf(selectedMeta)].text } : {}"
            >{{ selectedMeta ? TYPE_META[typeOf(selectedMeta)].label : '' }}</span>
            <UButton
              v-if="isDirty"
              label="Save"
              icon="i-lucide-save"
              size="xs"
              :loading="saving"
              @click="save"
            />
            <button
              class="p-1.5 rounded-lg transition-colors hover-bg shrink-0"
              style="color: var(--text-disabled)"
              @click="closePreview"
            >
              <UIcon name="i-lucide-x" class="size-4" />
            </button>
          </div>

          <!-- Content -->
          <div v-if="contentLoading" class="flex items-center justify-center py-20">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
          </div>
          <InstructionEditor
            v-else
            :model-value="bodyContent"
            default-mode="preview"
            class="flex-1 min-h-0"
            style="min-height: 360px"
            @update:model-value="bodyContent = $event"
          />
        </div>
      </template>
    </UModal>
  </template>

  <!-- New file modal -->
  <UModal v-model:open="showNewModal">
    <template #content>
      <div class="p-6 space-y-4 bg-overlay">
        <h3 class="text-page-title">New Memory File</h3>
        <div class="field-group">
          <label class="field-label" data-required>Name</label>
          <input v-model="newName" class="field-input" placeholder="e.g., deployment-notes" @keydown.enter.prevent="createFile" />
          <span class="field-hint">Becomes the filename (special chars replaced with dashes)</span>
        </div>
        <div class="field-group">
          <label class="field-label" data-required>Type</label>
          <USelectDropdown v-model="newType" :options="TYPE_OPTIONS" />
          <span v-if="newType" class="field-hint">{{ TYPE_META[newType]?.hint }}</span>
        </div>
        <div class="field-group">
          <label class="field-label">Description <span class="text-meta font-normal">(optional)</span></label>
          <input v-model="newDescription" class="field-input" placeholder="One-line summary" />
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="showNewModal = false" />
          <UButton label="Create" size="sm" :disabled="!newName.trim() || creating" :loading="creating" @click="createFile" />
        </div>
      </div>
    </template>
  </UModal>

  <!-- Delete confirm -->
  <Teleport to="body">
    <div
      v-if="pendingDelete"
      class="fixed inset-0 z-50 flex items-center justify-center"
      style="background: rgba(0,0,0,0.4)"
      @click.self="pendingDelete = null"
    >
      <div class="rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
        <p class="text-[14px] font-semibold">Delete <span class="font-mono text-[13px]">{{ pendingDelete }}</span>?</p>
        <p class="text-[12px] text-label">This cannot be undone.</p>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="pendingDelete = null" />
          <UButton label="Delete" color="error" size="sm" :loading="deleting" @click="confirmDelete" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
