<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { getAgentColor } from '~/utils/colors'
import { getModelLabel } from '~/utils/models'

const props = defineProps<{
  data: {
    label: string
    agentSlug: string
    agentColor?: string
    agentModel?: string
    stepNumber: number
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  }
}>()

const emit = defineEmits<{
  remove: []
  moveUp: []
  moveDown: []
}>()

const color = computed(() => getAgentColor(props.data.agentColor))

const modelLabel = computed(() => getModelLabel(props.data.agentModel) ?? 'Default')
</script>

<template>
  <div
    class="workflow-node relative rounded-2xl group"
    style="width: 172px; background: var(--surface-raised); border: 1px solid var(--border-subtle);"
    :class="{
      'workflow-node--running': data.status === 'running',
      'workflow-node--completed': data.status === 'completed',
      'workflow-node--failed': data.status === 'failed',
      'workflow-node--skipped': data.status === 'skipped',
    }"
  >
    <Handle type="target" :position="Position.Left" />

    <div class="px-3 pt-2.5 pb-2.5 flex flex-col gap-2">
      <!-- Top row: dot + step number + actions -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <div
            class="size-2 rounded-full shrink-0"
            :style="{ background: color }"
          />
          <span class="text-[10px] font-mono" style="color: var(--text-disabled);">{{ data.stepNumber }}</span>
        </div>
        <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/8 transition-colors" @click="emit('moveUp')">
            <UIcon name="i-lucide-chevron-left" class="size-3" style="color: var(--text-disabled);" />
          </button>
          <button class="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/8 transition-colors" @click="emit('moveDown')">
            <UIcon name="i-lucide-chevron-right" class="size-3" style="color: var(--text-disabled);" />
          </button>
          <button class="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/8 transition-colors" @click="emit('remove')">
            <UIcon name="i-lucide-x" class="size-3" style="color: var(--text-disabled);" />
          </button>
        </div>
      </div>

      <!-- Agent name -->
      <div class="text-[12px] font-medium leading-snug truncate" style="color: var(--text-primary);">{{ data.label }}</div>

      <!-- Bottom row: model badge + status -->
      <div class="flex items-center justify-between">
        <span
          class="text-[9px] font-medium px-1.5 py-0.5 rounded-md"
          style="background: var(--surface-base); color: var(--text-tertiary);"
        >{{ modelLabel }}</span>

        <!-- Status indicator -->
        <template v-if="data.status && data.status !== 'pending'">
          <div v-if="data.status === 'running'" class="flex items-center gap-1">
            <span class="status-dot status-dot--running" />
          </div>
          <UIcon v-else-if="data.status === 'completed'" name="i-lucide-check" class="size-3" style="color: var(--success, #22c55e);" />
          <UIcon v-else-if="data.status === 'failed'" name="i-lucide-x" class="size-3" style="color: var(--error);" />
          <UIcon v-else-if="data.status === 'skipped'" name="i-lucide-minus" class="size-3" style="color: var(--text-disabled);" />
        </template>
      </div>
    </div>

    <Handle type="source" :position="Position.Right" />
  </div>
</template>

<style scoped>
.workflow-node--running {
  border-color: var(--accent) !important;
  box-shadow: 0 0 12px var(--accent-glow);
  animation: nodePulse 1.5s ease-in-out infinite;
}
.workflow-node--completed { border-color: var(--success, #22c55e) !important; }
.workflow-node--failed { border-color: var(--error) !important; }
.workflow-node--skipped { opacity: 0.4; }

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-dot--running {
  background: var(--accent);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes nodePulse {
  0%, 100% { box-shadow: 0 0 8px var(--accent-glow); }
  50% { box-shadow: 0 0 20px var(--accent-glow); }
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.75); }
}
</style>
