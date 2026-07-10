<script setup lang="ts">
import type { PendingPermission } from '~/types'

const props = defineProps<{
  permissions: PendingPermission[]
}>()

const emit = defineEmits<{
  (e: 'focus', permissionId: string): void
}>()

const firstPermission = computed(() => props.permissions[0])
const count = computed(() => props.permissions.length)

function handleClick() {
  if (firstPermission.value) {
    emit('focus', firstPermission.value.id)
  }
}
</script>

<template>
  <button
    v-if="permissions.length > 0"
    class="shrink-0 w-full px-4 py-2 flex items-center gap-2.5 text-left transition-colors hover:opacity-90"
    style="background: rgba(229, 169, 62, 0.1);"
    @click="handleClick"
  >
    <UIcon name="i-lucide-shield-question" class="size-4 shrink-0" style="color: var(--accent);" />
    <span class="text-[12px] font-medium" style="color: var(--text-primary);">
      {{ count }} pending {{ count === 1 ? 'approval' : 'approvals' }}
    </span>
    <span class="text-[11px]" style="color: var(--text-secondary);">
      · click to review
    </span>
    <UIcon name="i-lucide-chevron-down" class="size-3.5 ml-auto shrink-0" style="color: var(--text-tertiary);" />
  </button>
</template>
