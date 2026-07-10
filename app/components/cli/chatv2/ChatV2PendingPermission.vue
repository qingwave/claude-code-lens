<script setup lang="ts">
import type { PendingPermission } from '~/types'

const props = defineProps<{
  permissions: PendingPermission[]
}>()

const emit = defineEmits<{
  (e: 'respond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean, updatedInput?: any): void
}>()

const currentIndex = ref(0)

watch(() => props.permissions.length, (newLen) => {
  if (currentIndex.value >= newLen) currentIndex.value = Math.max(0, newLen - 1)
})

const current = computed(() => props.permissions[currentIndex.value])
const total = computed(() => props.permissions.length)

const isAskUserQuestion = computed(() => {
  const tn = current.value?.toolName?.toLowerCase() || ''
  return ['askuserquestion', 'ask_user', 'askuser', 'ask_user_question', 'prompt', 'input_request'].includes(tn)
})

interface AskUserQuestionItem {
  question: string
  header?: string
  options?: Array<{ label: string; description?: string }>
  multiSelect?: boolean
}

const askUserQuestions = computed<AskUserQuestionItem[] | null>(() => {
  if (!isAskUserQuestion.value || !current.value?.toolInput) return null
  const input = current.value.toolInput
  if (typeof input === 'string') return [{ question: input }]
  if (input.questions && Array.isArray(input.questions)) return input.questions
  const question = input.question || input.message || input.prompt || input.text || input.content
  if (question) return [{ question, header: input.header, options: input.options, multiSelect: input.multiSelect }]
  return [{ question: JSON.stringify(input) }]
})

const selectedAnswers = ref<Map<number, Set<string>>>(new Map())

watch(currentIndex, () => { selectedAnswers.value = new Map() })
watch(() => current.value?.id, () => { selectedAnswers.value = new Map() })

function toggleAnswer(qi: number, label: string, multiSelect: boolean) {
  const cur = selectedAnswers.value.get(qi) ?? new Set<string>()
  if (multiSelect) {
    cur.has(label) ? cur.delete(label) : cur.add(label)
  } else {
    cur.clear()
    cur.add(label)
  }
  selectedAnswers.value.set(qi, cur)
  selectedAnswers.value = new Map(selectedAnswers.value)
  if (!multiSelect && askUserQuestions.value?.length === 1) handleAllow()
}

function isSelected(qi: number, label: string) {
  return selectedAnswers.value.get(qi)?.has(label) ?? false
}

const hasSelected = computed(() => {
  if (!askUserQuestions.value) return false
  for (let i = 0; i < askUserQuestions.value.length; i++) {
    if ((selectedAnswers.value.get(i)?.size ?? 0) > 0) return true
  }
  return false
})

function buildUpdatedInput(): any {
  if (!isAskUserQuestion.value || !askUserQuestions.value || !current.value) return undefined
  const answers: Record<string, string> = {}
  for (let i = 0; i < askUserQuestions.value.length; i++) {
    const selected = selectedAnswers.value.get(i)
    if (selected?.size) answers[askUserQuestions.value[i]!.question] = Array.from(selected).join(', ')
  }
  const base = typeof current.value.toolInput === 'object'
    ? JSON.parse(JSON.stringify(current.value.toolInput))
    : { question: current.value.toolInput }
  return { ...base, answers }
}

function handleAllow() {
  if (!current.value) return
  emit('respond', current.value.id, 'allow', false, buildUpdatedInput())
}

function handleDeny() {
  if (!current.value) return
  emit('respond', current.value.id, 'deny', false)
}

function toolIcon(toolName: string) {
  const tn = toolName.toLowerCase()
  if (tn.includes('read')) return 'i-lucide-file-text'
  if (tn.includes('write')) return 'i-lucide-file-plus'
  if (tn.includes('edit') || tn.includes('replace')) return 'i-lucide-file-edit'
  if (tn.includes('bash') || tn.includes('shell')) return 'i-lucide-terminal'
  if (tn.includes('glob')) return 'i-lucide-search'
  if (tn.includes('grep')) return 'i-lucide-search-code'
  return 'i-lucide-wrench'
}

function toolColor(toolName: string) {
  const tn = toolName.toLowerCase()
  if (tn.includes('read')) return '#3b82f6'
  if (tn.includes('write')) return '#22c55e'
  if (tn.includes('edit') || tn.includes('replace')) return '#f59e0b'
  if (tn.includes('bash') || tn.includes('shell')) return '#8b5cf6'
  if (tn.includes('glob') || tn.includes('grep')) return '#06b6d4'
  return 'var(--accent)'
}

const toolDetail = computed(() => {
  if (!current.value?.toolInput) return null
  const input = current.value.toolInput
  if (input && typeof input === 'object' && '_partialJson' in input) {
    const raw = input._partialJson as string
    const m = raw.match(/"(?:file_path|path|command|pattern)"\s*:\s*"([^"]*)"/)
    return m?.[1] ?? null
  }
  if (typeof input === 'string') return input.length > 80 ? input.slice(0, 80) + '…' : input
  if (typeof input === 'object') {
    const val = input.file_path || input.path || input.command || input.pattern
    if (val) return String(val).length > 80 ? String(val).slice(0, 80) + '…' : String(val)
  }
  return null
})

const EDIT_TOOLS = new Set(['edit', 'write', 'applypatch', 'replace', 'write_file', 'apply_patch'])

const isEditTool = computed(() => EDIT_TOOLS.has((current.value?.toolName || '').toLowerCase()))

const diffData = computed(() => {
  if (!isEditTool.value || !current.value?.toolInput) return null
  const input = current.value.toolInput
  if (typeof input !== 'object' || '_partialJson' in input) return null
  if (input.old_string === undefined && input.new_string === undefined) return null
  const filePath = input.file_path || input.path || ''
  const parts = String(filePath).split('/')
  return {
    filePath: String(filePath),
    fileName: parts[parts.length - 1] || filePath,
    oldString: input.old_string as string | undefined,
    newString: input.new_string as string | undefined,
  }
})

const showDiff = ref(false)
watch(() => current.value?.id, () => { showDiff.value = false })
</script>

<template>
  <div v-if="permissions.length > 0 && current" class="mb-2">
    <div class="permission-card rounded-2xl overflow-hidden" style="border: 1px solid rgba(229,169,62,0.25); background: var(--surface-overlay);">

      <!-- Top accent strip -->
      <div class="h-[2px] w-full" style="background: linear-gradient(90deg, rgba(229,169,62,0.8) 0%, rgba(234,88,12,0.5) 100%);" />

      <!-- Header -->
      <div class="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <div
          class="size-6 rounded-lg flex items-center justify-center shrink-0"
          style="background: rgba(229,169,62,0.12);"
        >
          <UIcon name="i-lucide-shield-question" class="size-3.5" style="color: var(--accent);" />
        </div>

        <div class="flex-1 min-w-0">
          <span class="text-[11px] font-semibold tracking-wide uppercase" style="color: var(--accent); letter-spacing: 0.06em;">
            Permission Request
          </span>
        </div>

        <!-- Multi-pending pagination -->
        <template v-if="total > 1">
          <div class="flex items-center gap-1 px-2 py-0.5 rounded-full" style="background: var(--surface-raised);">
            <button
              class="p-0.5 rounded transition-opacity disabled:opacity-25"
              :disabled="currentIndex === 0"
              @click="currentIndex--"
            >
              <UIcon name="i-lucide-chevron-left" class="size-3" style="color: var(--text-secondary);" />
            </button>
            <span class="text-[11px] font-mono px-0.5" style="color: var(--text-secondary);">{{ currentIndex + 1 }}/{{ total }}</span>
            <button
              class="p-0.5 rounded transition-opacity disabled:opacity-25"
              :disabled="currentIndex === total - 1"
              @click="currentIndex++"
            >
              <UIcon name="i-lucide-chevron-right" class="size-3" style="color: var(--text-secondary);" />
            </button>
          </div>
        </template>
      </div>

      <!-- Divider -->
      <div class="mx-4" style="height: 1px; background: var(--border-subtle);" />

      <!-- Body -->
      <div class="px-4 py-3">

        <!-- AskUserQuestion -->
        <template v-if="isAskUserQuestion && askUserQuestions">
          <div v-for="(q, qi) in askUserQuestions" :key="qi" :class="qi > 0 ? 'mt-4' : ''">
            <p v-if="q.header" class="text-[11px] font-semibold mb-1" style="color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em;">{{ q.header }}</p>
            <p class="text-[13px] leading-snug mb-3" style="color: var(--text-primary);">{{ q.question }}</p>
            <div v-if="q.options?.length" class="space-y-1.5">
              <button
                v-for="(opt, oi) in q.options"
                :key="oi"
                class="option-btn flex items-start gap-3 px-3 py-2.5 rounded-xl w-full text-left transition-all"
                :class="{ 'option-selected': isSelected(qi, opt.label) }"
                :style="{
                  background: isSelected(qi, opt.label) ? 'rgba(229,169,62,0.1)' : 'var(--surface-raised)',
                  border: '1px solid',
                  borderColor: isSelected(qi, opt.label) ? 'rgba(229,169,62,0.5)' : 'var(--border-subtle)',
                }"
                @click="toggleAnswer(qi, opt.label, !!q.multiSelect)"
              >
                <div
                  class="size-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all"
                  :style="{
                    borderColor: isSelected(qi, opt.label) ? 'var(--accent)' : 'var(--border-default)',
                    background: isSelected(qi, opt.label) ? 'var(--accent)' : 'transparent',
                  }"
                >
                  <div v-if="isSelected(qi, opt.label)" class="size-1.5 rounded-full bg-white" />
                </div>
                <div class="min-w-0 flex-1">
                  <span class="text-[12px] font-medium" style="color: var(--text-primary);">{{ opt.label }}</span>
                  <p v-if="opt.description" class="text-[11px] mt-0.5 leading-snug" style="color: var(--text-tertiary);">{{ opt.description }}</p>
                </div>
              </button>
            </div>
          </div>
        </template>

        <!-- Regular tool permission -->
        <template v-else>
          <!-- Tool identity row -->
          <div class="flex items-center gap-3">
            <div
              class="size-8 rounded-xl flex items-center justify-center shrink-0"
              :style="{ background: `${toolColor(current.toolName || '')}18` }"
            >
              <UIcon
                :name="toolIcon(current.toolName || '')"
                class="size-4"
                :style="{ color: toolColor(current.toolName || '') }"
              />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-semibold" style="color: var(--text-primary);">{{ current.toolName }}</div>
              <div v-if="toolDetail" class="text-[11px] truncate mt-0.5 font-mono" style="color: var(--text-tertiary);" :title="toolDetail">
                {{ toolDetail }}
              </div>
            </div>

            <!-- Diff toggle -->
            <button
              v-if="diffData"
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0"
              :style="{
                background: showDiff ? 'rgba(245,158,11,0.12)' : 'var(--surface-raised)',
                color: showDiff ? '#f59e0b' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: showDiff ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)',
              }"
              @click="showDiff = !showDiff"
            >
              <UIcon :name="showDiff ? 'i-lucide-eye-off' : 'i-lucide-diff'" class="size-3" />
              {{ showDiff ? 'Hide' : 'Diff' }}
            </button>
          </div>

          <!-- Inline diff -->
          <div v-if="diffData && showDiff" class="mt-3">
            <ToolDiffViewer
              :file-path="diffData.filePath"
              :old-content="diffData.oldString"
              :new-content="diffData.newString"
            />
          </div>
        </template>
      </div>

      <!-- Footer: action buttons -->
      <div
        class="flex items-center gap-2 px-4 py-3"
        style="background: var(--surface-raised);"
      >
        <!-- AskUserQuestion: submit button -->
        <template v-if="isAskUserQuestion && askUserQuestions">
          <button
            v-if="askUserQuestions.some(q => q.multiSelect) || askUserQuestions.length > 1"
            class="flex-1 py-2 rounded-xl text-[12px] font-semibold transition-all"
            :style="{
              background: hasSelected ? 'var(--accent)' : 'var(--surface-base)',
              color: hasSelected ? '#000' : 'var(--text-tertiary)',
              opacity: hasSelected ? '1' : '0.5',
              cursor: hasSelected ? 'pointer' : 'not-allowed',
            }"
            :disabled="!hasSelected"
            @click="handleAllow"
          >
            Submit
          </button>
        </template>

        <!-- Regular allow/deny -->
        <template v-else>
          <button
            class="allow-btn flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-all"
            style="background: var(--accent); color: #000;"
            @click="handleAllow"
          >
            <UIcon name="i-lucide-check" class="size-3.5" />
            Allow
          </button>
          <button
            class="deny-btn flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
            style="background: rgba(239,68,68,0.08); color: #ef4444; border: 1px solid rgba(239,68,68,0.2);"
            @click="handleDeny"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
            Deny
          </button>
        </template>
      </div>

    </div>
  </div>
</template>

<style scoped>
.permission-card {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08);
}

.allow-btn:hover {
  filter: brightness(1.08);
}

.deny-btn:hover {
  background: rgba(239, 68, 68, 0.14) !important;
}

.option-btn:hover:not(.option-selected) {
  border-color: var(--border-default) !important;
}
</style>
