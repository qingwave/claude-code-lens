<script setup lang="ts">
import { highlightCode } from '~/utils/markdown'

const props = defineProps<{
  filePath: string
  content: string | null
}>()

const highlightedHtml = ref('')

watch(() => props.content, async (val) => {
  if (!val) { highlightedHtml.value = ''; return }
  const ext = props.filePath.split('.').pop() || 'text'
  highlightedHtml.value = await highlightCode(val, ext)
}, { immediate: true })
</script>

<template>
  <div class="flex-1 overflow-auto custom-scrollbar p-4" style="background: var(--surface-overlay);">
    <div v-if="highlightedHtml" class="shiki-editor" v-html="highlightedHtml" />
    <pre v-else-if="content" class="text-[12px] font-mono whitespace-pre-wrap" style="color: var(--text-primary);">{{ content }}</pre>
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
.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
</style>
