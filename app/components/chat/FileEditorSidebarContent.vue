<script setup lang="ts">
import { highlightCode } from '~/utils/markdown'

const { state, closeEditor } = useFileEditor()
const { workingDir } = useWorkingDir()

const content = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const fileName = computed(() => state.value.filePath?.split('/').pop() || '')
const displayPath = computed(() => state.value.filePath || '')
const fileExt = computed(() => fileName.value.split('.').pop()?.toLowerCase() || '')

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
const isImage = computed(() => IMAGE_EXTS.includes(fileExt.value))

// For images, build a URL the browser can load directly via the files API
const imageUrl = computed(() => {
  if (!isImage.value || !state.value.filePath) return null
  return `/api/files/raw?path=${encodeURIComponent(state.value.filePath)}`
})

async function fetchFileContent() {
  if (!state.value.filePath || isImage.value) return

  loading.value = true
  error.value = null

  try {
    const data = await $fetch<{ content: string }>('/api/files', {
      query: {
        path: state.value.filePath,
        projectDir: workingDir.value
      }
    })
    content.value = data.content
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to read file'
  } finally {
    loading.value = false
  }
}

watch(() => state.value.filePath, (newPath) => {
  if (!newPath || state.value.diffResult || isImage.value) return
  if (state.value.diffInfo) {
    content.value = state.value.diffInfo.newContent
  } else {
    fetchFileContent()
  }
}, { immediate: true })

const highlightedHtml = ref('')

async function updateHighlighting() {
  if (!content.value || state.value.diffResult || isImage.value) {
    highlightedHtml.value = ''
    return
  }
  const lang = state.value.diffInfo ? 'diff' : (fileExt.value || 'text')
  highlightedHtml.value = await highlightCode(content.value, lang)
}

watch(content, updateHighlighting, { immediate: true })
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <UIcon
          :name="state.diffResult ? 'i-lucide-git-branch' : isImage ? 'i-lucide-image' : 'i-lucide-file-code'"
          class="size-4 text-accent shrink-0"
        />
        <div class="flex flex-col min-w-0">
          <span class="text-[13px] font-semibold truncate">{{ fileName }}</span>
          <span class="text-[10px] text-meta truncate">{{ displayPath }}</span>
        </div>
      </div>
      <div v-if="state.diffResult" class="flex items-center gap-2 shrink-0">
        <span class="text-[10px] font-mono tabular-nums" style="color: #22c55e;">+{{ state.diffResult.addCount }}</span>
        <span class="text-[10px] font-mono tabular-nums" style="color: #ef4444;">-{{ state.diffResult.removeCount }}</span>
      </div>
    </div>

    <!-- Diff loading spinner -->
    <div v-if="state.pending" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin mr-2" style="color: var(--text-tertiary);" />
      <span class="text-[11px]" style="color: var(--text-tertiary);">Loading…</span>
    </div>

    <!-- Diff view -->
    <div v-else-if="state.diffResult" class="flex-1 overflow-y-auto custom-scrollbar">
      <DiffView :diff="state.diffResult" :loading="false" />
    </div>

    <!-- Image view -->
    <div v-else-if="isImage" class="flex-1 flex items-center justify-center overflow-auto p-4 custom-scrollbar">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="fileName"
        class="max-w-full max-h-full object-contain rounded"
        style="border: 1px solid var(--border-subtle);"
      />
    </div>

    <!-- File content -->
    <template v-else>
      <div class="flex-1 overflow-hidden relative">
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-accent" />
        </div>

        <div v-if="error" class="p-8 text-center space-y-3">
          <UIcon name="i-lucide-alert-circle" class="size-8 text-error mx-auto" />
          <p class="text-sm text-error">{{ error }}</p>
          <UButton label="Retry" size="sm" variant="soft" @click="fetchFileContent" />
        </div>

        <div v-else class="h-full overflow-auto p-4 custom-scrollbar">
          <div v-if="highlightedHtml" class="shiki-editor" v-html="highlightedHtml" />
          <pre v-else class="text-[12px] font-mono whitespace-pre-wrap">{{ content }}</pre>
        </div>
      </div>

      <div class="px-4 py-2 border-t border-border-subtle shrink-0 flex items-center justify-between">
        <span class="text-[10px] text-meta font-mono">{{ content.split('\n').length }} lines</span>
        <div v-if="state.diffInfo" class="text-[10px] px-2 py-0.5 rounded-full bg-accent-muted text-accent font-medium">
          Viewing Changes
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.shiki-editor :deep(pre) {
  margin: 0;
  padding: 0;
  background: transparent !important;
  font-size: 12px;
  line-height: 1.6;
}

.shiki-editor :deep(.shiki-wrapper) {
  background: transparent !important;
}

.shiki-editor :deep(code) {
  background: transparent !important;
  padding: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-disabled);
}
</style>
