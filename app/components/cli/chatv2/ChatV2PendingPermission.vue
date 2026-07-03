<script setup lang="ts">
import type { PendingPermission } from '~/types'

const props = defineProps<{
  permissions: PendingPermission[]
}>()

const emit = defineEmits<{
  (e: 'respond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean, updatedInput?: any): void
}>()

// Index of currently shown permission (for multi-pending pagination)
const currentIndex = ref(0)

// Reset index when permissions list changes
watch(() => props.permissions.length, (newLen) => {
  if (currentIndex.value >= newLen) currentIndex.value = Math.max(0, newLen - 1)
})

const current = computed(() => props.permissions[currentIndex.value])
const total = computed(() => props.permissions.length)

const isAskUserQuestion = computed(() => {
  const tn = current.value?.toolName?.toLowerCase() || ''
  return ['askuserquestion', 'ask_user', 'askuser', 'ask_user_question', 'prompt', 'input_request'].includes(tn)
})

// Parse AskUserQuestion structured input
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

// Per-question selected answers
const selectedAnswers = ref<Map<number, Set<string>>>(new Map())

// Reset selections when current permission changes
watch(currentIndex, () => {
  selectedAnswers.value = new Map()
})

watch(() => current.value?.id, () => {
  selectedAnswers.value = new Map()
})

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
  // Auto-submit single-select single-question
  if (!multiSelect && askUserQuestions.value?.length === 1) {
    handleAllow()
  }
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
    if (selected?.size) {
      answers[askUserQuestions.value[i]!.question] = Array.from(selected).join(', ')
    }
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

// Tool display helpers
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

// Extract file path / command from tool input
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

// Whether this is an edit/write tool that has diff data
const EDIT_TOOLS = new Set(['edit', 'write', 'applypatch', 'replace', 'write_file', 'apply_patch'])

const isEditTool = computed(() => {
  const tn = (current.value?.toolName || '').toLowerCase()
  return EDIT_TOOLS.has(tn)
})

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

// Reset diff state when permission changes
watch(() => current.value?.id, () => {
  showDiff.value = false
})
</script>

<template>
  <div
    v-if="permissions.length > 0 && current"
    class="mx-auto max-w-[800px] px-4 md:px-8 mb-2"
  >
    <div
      class="rounded-xl border overflow-hidden"
      style="background: var(--surface-overlay); border-color: var(--accent);"
    >
      <!-- Header bar -->
      <div
        class="flex items-center gap-2 px-3 py-2 border-b"
        style="background: rgba(229,169,62,0.08); border-color: rgba(229,169,62,0.2);"
      >
        <UIcon name="i-lucide-shield-question" class="size-3.5 shrink-0" style="color: var(--accent);" />
        <span class="text-[12px] font-semibold flex-1" style="color: var(--text-primary);">Action Required</span>

        <!-- Multi-pending pagination -->
        <template v-if="total > 1">
          <span class="text-[11px]" style="color: var(--text-tertiary);">{{ currentIndex + 1 }} / {{ total }}</span>
          <button
            class="p-0.5 rounded disabled:opacity-30"
            :disabled="currentIndex === 0"
            @click="currentIndex--"
          >
            <UIcon name="i-lucide-chevron-up" class="size-3.5" style="color: var(--text-secondary);" />
          </button>
          <button
            class="p-0.5 rounded disabled:opacity-30"
            :disabled="currentIndex === total - 1"
            @click="currentIndex++"
          >
            <UIcon name="i-lucide-chevron-down" class="size-3.5" style="color: var(--text-secondary);" />
          </button>
        </template>
      </div>

      <!-- Body -->
      <div class="px-3 py-2.5">

        <!-- AskUserQuestion -->
        <template v-if="isAskUserQuestion && askUserQuestions">
          <div v-for="(q, qi) in askUserQuestions" :key="qi" class="mb-2 last:mb-0">
            <p v-if="q.header" class="text-[11px] font-semibold mb-0.5" style="color: var(--text-primary);">{{ q.header }}</p>
            <p class="text-[12px] mb-2" style="color: var(--text-secondary);">{{ q.question }}</p>
            <div v-if="q.options?.length" class="space-y-1">
              <button
                v-for="(opt, oi) in q.options"
                :key="oi"
                class="flex items-start gap-2 px-2.5 py-1.5 rounded-lg w-full text-left transition-all"
                :style="{
                  background: isSelected(qi, opt.label) ? 'rgba(229,169,62,0.15)' : 'var(--surface-raised)',
                  border: '1px solid',
                  borderColor: isSelected(qi, opt.label) ? 'var(--accent)' : 'transparent',
                }"
                @click="toggleAnswer(qi, opt.label, !!q.multiSelect)"
              >
                <UIcon
                  :name="isSelected(qi, opt.label) ? (q.multiSelect ? 'i-lucide-check-square' : 'i-lucide-circle-dot') : (q.multiSelect ? 'i-lucide-square' : 'i-lucide-circle')"
                  class="size-3.5 mt-0.5 shrink-0"
                  :style="{ color: isSelected(qi, opt.label) ? 'var(--accent)' : 'var(--text-tertiary)' }"
                />
                <div class="min-w-0">
                  <span class="text-[12px] font-medium" style="color: var(--text-primary);">{{ opt.label }}</span>
                  <p v-if="opt.description" class="text-[11px] mt-0.5" style="color: var(--text-tertiary);">{{ opt.description }}</p>
                </div>
              </button>
            </div>
          </div>
        </template>

        <!-- Regular tool -->
        <template v-else>
          <div class="flex items-center gap-2">
            <UIcon
              :name="toolIcon(current.toolName || '')"
              class="size-4 shrink-0"
              :style="{ color: toolColor(current.toolName || '') }"
            />
            <span class="text-[13px] font-semibold" style="color: var(--text-primary);">{{ current.toolName }}</span>
            <span v-if="toolDetail" class="text-[11px] truncate min-w-0" style="color: var(--text-tertiary);" :title="toolDetail">
              {{ toolDetail }}
            </span>

            <!-- Diff toggle for Edit/Write tools -->
            <button
              v-if="diffData"
              class="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors shrink-0"
              :style="{
                background: showDiff ? 'rgba(245,158,11,0.12)' : 'var(--surface-raised)',
                color: showDiff ? '#f59e0b' : 'var(--text-tertiary)',
              }"
              @click="showDiff = !showDiff"
            >
              <UIcon :name="showDiff ? 'i-lucide-chevron-up' : 'i-lucide-diff'" class="size-3" />
              {{ showDiff ? 'Hide diff' : 'View diff' }}
            </button>
          </div>

          <!-- Inline diff preview -->
          <div v-if="diffData && showDiff" class="mt-2">
            <ToolDiffViewer
              :file-path="diffData.filePath"
              :old-content="diffData.oldString"
              :new-content="diffData.newString"
            />
          </div>
        </template>

        <!-- Action buttons -->
        <div class="flex items-center gap-2 mt-2.5">
          <!-- AskUserQuestion: submit only when multi-select or multi-question -->
          <template v-if="isAskUserQuestion && askUserQuestions">
            <button
              v-if="askUserQuestions.some(q => q.multiSelect) || askUserQuestions.length > 1"
              class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              :style="{
                background: hasSelected ? 'var(--accent)' : 'var(--surface-raised)',
                color: hasSelected ? 'white' : 'var(--text-tertiary)',
                opacity: hasSelected ? '1' : '0.5',
                cursor: hasSelected ? 'pointer' : 'not-allowed',
              }"
              :disabled="!hasSelected"
              @click="handleAllow"
            >
              Submit
            </button>
          </template>
          <template v-else>
            <button
              class="px-3 py-1.5 rounded-lg text-[12px] font-medium hover:opacity-90 transition-all"
              style="background: var(--accent); color: white;"
              @click="handleAllow"
            >
              Allow
            </button>
          </template>
          <button
            class="px-3 py-1.5 rounded-lg text-[12px] font-medium hover:opacity-90 transition-all"
            style="background: rgba(239,68,68,0.1); color: #ef4444;"
            @click="handleDeny"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
