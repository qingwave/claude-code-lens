<script setup lang="ts">

// ── Types ────────────────────────────────────────────────────────────────────

interface MemoryFileMeta {
  filename: string
  name: string
  description: string
  type: string
  size: number
  mtime: string
}

type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_META: Record<MemoryType, { label: string; icon: string; bg: string; text: string; hint: string }> = {
  user:      { label: 'User',      icon: 'i-lucide-user',        bg: 'rgba(59,130,246,0.1)',  text: '#3b82f6', hint: 'Who you are, your role, preferences' },
  feedback:  { label: 'Feedback',  icon: 'i-lucide-message-circle', bg: 'rgba(234,179,8,0.1)', text: '#ca8a04', hint: 'How you want Claude to work' },
  project:   { label: 'Project',   icon: 'i-lucide-folder',      bg: 'rgba(168,85,247,0.1)', text: '#a855f7', hint: 'Ongoing work context and goals' },
  reference: { label: 'Reference', icon: 'i-lucide-link',        bg: 'rgba(34,197,94,0.1)',  text: '#22c55e', hint: 'Pointers to external resources' },
}

const TYPE_OPTIONS = (Object.keys(TYPE_META) as MemoryType[]).map(k => ({
  value: k,
  label: TYPE_META[k].label,
  description: TYPE_META[k].hint,
}))

// ── State ─────────────────────────────────────────────────────────────────────

const toast = useToast()
const files = ref<MemoryFileMeta[]>([])
const loading = ref(true)
const selectedFile = ref<string | null>(null)
const editorContent = ref('')
const editorOriginal = ref('')
const editorLoading = ref(false)
const saving = ref(false)
const isDirty = computed(() => editorContent.value !== editorOriginal.value)

// New file form
const showNewModal = ref(false)
const newName = ref('')
const newType = ref<MemoryType>('user')
const newDescription = ref('')
const creating = ref(false)

// Delete confirm
const pendingDelete = ref<string | null>(null)
const deleting = ref(false)

// ── Load list ─────────────────────────────────────────────────────────────────

async function loadFiles() {
  loading.value = true
  try {
    files.value = await $fetch<MemoryFileMeta[]>('/api/memory')
  } catch {
    files.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadFiles)

// ── Select + load file ────────────────────────────────────────────────────────

async function selectFile(filename: string) {
  if (isDirty.value && selectedFile.value && !confirm('Discard unsaved changes?')) return
  selectedFile.value = filename
  editorLoading.value = true
  try {
    const res = await $fetch<{ content: string }>(`/api/memory/${filename}`)
    editorContent.value = res.content
    editorOriginal.value = res.content
  } catch {
    toast.add({ title: 'Failed to load file', color: 'error' })
  } finally {
    editorLoading.value = false
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function save() {
  if (!selectedFile.value) return
  saving.value = true
  try {
    await $fetch(`/api/memory/${selectedFile.value}`, {
      method: 'PUT',
      body: { content: editorContent.value },
    })
    editorOriginal.value = editorContent.value
    toast.add({ title: 'Saved', color: 'success' })
    await loadFiles()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e.data?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// ── Create ────────────────────────────────────────────────────────────────────

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
    const { filename } = await $fetch<{ filename: string }>('/api/memory', {
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

// ── Delete ────────────────────────────────────────────────────────────────────

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await $fetch(`/api/memory/${pendingDelete.value}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', color: 'success' })
    if (selectedFile.value === pendingDelete.value) {
      selectedFile.value = null
      editorContent.value = ''
      editorOriginal.value = ''
    }
    pendingDelete.value = null
    await loadFiles()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e.data?.message, color: 'error' })
  } finally {
    deleting.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeOf(file: MemoryFileMeta): MemoryType {
  return (file.type as MemoryType) in TYPE_META ? (file.type as MemoryType) : 'user'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(1) + ' KB'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Cmd+S to save
if (import.meta.client) {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && selectedFile.value) {
      e.preventDefault()
      if (isDirty.value && !saving.value) save()
    }
  }
  onMounted(() => document.addEventListener('keydown', handler))
  onUnmounted(() => document.removeEventListener('keydown', handler))
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-section-title">Memory Files</h3>
        <p class="text-[12px] text-meta mt-0.5">
          Persistent facts Claude recalls across sessions, stored in
          <span class="font-mono">~/.claude/memory/</span>
        </p>
      </div>
      <UButton label="New file" icon="i-lucide-plus" size="xs" variant="soft" @click="showNewModal = true" />
    </div>

    <!-- Type legend -->
    <div class="flex flex-wrap gap-2">
      <span
        v-for="(meta, key) in TYPE_META"
        :key="key"
        class="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full"
        :style="{ background: meta.bg, color: meta.text }"
      >
        <UIcon :name="meta.icon" class="size-3" />
        {{ meta.label }}
      </span>
    </div>

    <!-- Two-column layout -->
    <div class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-subtle); min-height: 320px">
      <div class="flex h-full" style="min-height: 320px">

        <!-- Left: file list -->
        <div class="w-48 shrink-0 flex flex-col" style="border-right: 1px solid var(--border-subtle)">
          <div v-if="loading" class="p-3 space-y-2">
            <div v-for="i in 3" :key="i" class="h-10 rounded-lg animate-pulse" style="background: var(--surface-raised)" />
          </div>

          <div
            v-else-if="files.length === 0"
            class="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2"
          >
            <UIcon name="i-lucide-brain" class="size-6 text-meta" />
            <p class="text-[11px] text-meta">No memory files yet</p>
          </div>

          <div v-else class="flex-1 overflow-y-auto divide-y" style="divide-color: var(--border-subtle)">
            <button
              v-for="file in files"
              :key="file.filename"
              class="w-full text-left px-3 py-2.5 flex flex-col gap-0.5 transition-colors group relative"
              :style="selectedFile === file.filename
                ? 'background: var(--accent-muted)'
                : 'background: transparent'"
              @click="selectFile(file.filename)"
            >
              <!-- Type dot -->
              <div class="flex items-center gap-1.5 min-w-0">
                <div
                  class="size-1.5 rounded-full shrink-0"
                  :style="{ background: TYPE_META[typeOf(file)]?.text ?? '#888' }"
                />
                <span class="text-[12px] font-medium truncate">{{ file.name }}</span>
              </div>
              <div class="flex items-center gap-2 ml-3">
                <span
                  class="text-[9px] font-medium px-1 rounded"
                  :style="{ background: TYPE_META[typeOf(file)]?.bg, color: TYPE_META[typeOf(file)]?.text }"
                >
                  {{ TYPE_META[typeOf(file)]?.label ?? file.type }}
                </span>
                <span class="text-[9px] text-meta">{{ formatDate(file.mtime) }}</span>
              </div>

              <!-- Delete button on hover -->
              <button
                class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity focus-ring"
                style="color: var(--error)"
                title="Delete"
                @click.stop="pendingDelete = file.filename"
              >
                <UIcon name="i-lucide-trash-2" class="size-3" />
              </button>
            </button>
          </div>
        </div>

        <!-- Right: editor -->
        <div class="flex-1 flex flex-col min-w-0">
          <!-- No selection -->
          <div
            v-if="!selectedFile"
            class="flex-1 flex flex-col items-center justify-center gap-2 text-center p-6"
          >
            <UIcon name="i-lucide-file-text" class="size-8 text-meta" />
            <p class="text-[12px] text-label">Select a file to edit</p>
          </div>

          <!-- Loading -->
          <div v-else-if="editorLoading" class="flex-1 flex items-center justify-center">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-meta" />
          </div>

          <!-- Editor -->
          <template v-else>
            <div
              class="flex items-center justify-between px-3 py-2 shrink-0"
              style="border-bottom: 1px solid var(--border-subtle); background: var(--surface-raised)"
            >
              <span class="text-[11px] font-mono text-meta">{{ selectedFile }}</span>
              <div class="flex items-center gap-2">
                <span v-if="isDirty" class="text-[10px] text-meta">Unsaved</span>
                <UButton
                  label="Save"
                  icon="i-lucide-save"
                  size="xs"
                  :variant="isDirty ? 'solid' : 'soft'"
                  :color="isDirty ? 'primary' : 'neutral'"
                  :disabled="!isDirty || saving"
                  :loading="saving"
                  @click="save"
                />
              </div>
            </div>
            <textarea
              v-model="editorContent"
              class="editor-textarea flex-1 font-mono text-[12px] rounded-none border-none"
              style="min-height: 280px; resize: none"
              spellcheck="false"
            />
          </template>
        </div>

      </div>
    </div>

    <!-- New file modal -->
    <UModal v-model:open="showNewModal">
      <template #content>
        <div class="p-6 space-y-4 bg-overlay">
          <h3 class="text-page-title">New Memory File</h3>

          <div class="field-group">
            <label class="field-label" data-required>Name</label>
            <input
              v-model="newName"
              class="field-input"
              placeholder="e.g., work-context"
              @keydown.enter.prevent="createFile"
            />
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
            <UButton
              label="Create"
              size="sm"
              :disabled="!newName.trim() || creating"
              :loading="creating"
              @click="createFile"
            />
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
        <div
          class="rounded-2xl p-5 max-w-sm w-full mx-4 space-y-4"
          style="background: var(--surface-raised); border: 1px solid var(--border-subtle)"
        >
          <p class="text-[14px] font-semibold">Delete <span class="font-mono text-[13px]">{{ pendingDelete }}</span>?</p>
          <p class="text-[12px] text-label">This cannot be undone.</p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="pendingDelete = null" />
            <UButton label="Delete" color="error" size="sm" :loading="deleting" @click="confirmDelete" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
