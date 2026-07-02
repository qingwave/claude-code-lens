<script setup lang="ts">
import type { PermissionMode } from '~/types'

const props = defineProps<{
  modelValue: PermissionMode
  options: Array<{
    value: PermissionMode
    label: string
    description: string
  }>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PermissionMode): void
}>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedOption = computed(() => props.options.find((o) => o.value === props.modelValue))

const modeIcon: Record<string, string> = {
  default:            'i-lucide-shield-question',
  acceptEdits:        'i-lucide-file-check',
  bypassPermissions:  'i-lucide-shield-off',
  plan:               'i-lucide-map',
}

const modeMeta: Record<string, { color?: string }> = {
  bypassPermissions: { color: '#f97316' },
}

function getIcon(value: string) {
  return modeIcon[value] ?? 'i-lucide-shield'
}

function getMeta(value: string) {
  return modeMeta[value] ?? {}
}

function selectOption(value: PermissionMode) {
  emit('update:modelValue', value)
  isOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="dropdownRef" class="relative z-10 min-w-0">
    <button
      class="ctrl-btn max-w-full"
      :style="getMeta(modelValue).color ? { color: getMeta(modelValue).color } : {}"
      @click="isOpen = !isOpen"
    >
      <UIcon :name="getIcon(modelValue)" class="size-3.5 shrink-0" />
      <span class="truncate">{{ selectedOption?.label || 'Ask' }}</span>
    </button>

    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="absolute bottom-full right-0 mb-2 w-60 max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden z-[200]"
        style="background: var(--surface-overlay); border: 1px solid var(--border-default); box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 1px var(--border-subtle);"
      >
        <div class="p-1">
          <button
            v-for="option in options"
            :key="option.value"
            class="w-full px-3 py-2 rounded-lg text-left transition-all flex items-start gap-2.5"
            :style="{
              background: option.value === modelValue ? 'var(--surface-hover)' : 'transparent',
            }"
            :class="option.value !== modelValue ? 'hover:bg-[var(--surface-hover)]' : ''"
            @click="selectOption(option.value)"
          >
            <UIcon
              :name="getIcon(option.value)"
              class="size-3.5 shrink-0 mt-0.5"
              :style="{ color: getMeta(option.value).color ?? (option.value === modelValue ? 'var(--accent)' : 'var(--text-tertiary)') }"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span
                  class="text-[12px] font-medium"
                  :style="{ color: getMeta(option.value).color ?? 'var(--text-primary)' }"
                >{{ option.label }}</span>
                <UIcon
                  v-if="option.value === modelValue"
                  name="i-lucide-check"
                  class="size-3 shrink-0"
                  style="color: var(--accent);"
                />
              </div>
              <p class="text-[10px] mt-0.5 leading-relaxed" style="color: var(--text-tertiary);">
                {{ option.description }}
              </p>
            </div>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 6px;
  color: var(--text-secondary);
  transition: color 0.15s;
}
.ctrl-btn:hover { color: var(--text-primary); }

.dropdown-enter-active, .dropdown-leave-active { transition: all 0.15s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }
</style>
