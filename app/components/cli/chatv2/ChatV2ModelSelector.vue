<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  options: Array<{
    value: string
    label: string
    description: string
  }>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedOption = computed(() => {
  return props.options.find((o) => o.value === props.modelValue)
})

function selectOption(value: string) {
  emit('update:modelValue', value)
  isOpen.value = false
}

// Close on click outside
function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div ref="dropdownRef" class="relative z-10 min-w-0">
    <button
      class="ctrl-btn max-w-full"
      @click="isOpen = !isOpen"
    >
      <UIcon name="i-lucide-cpu" class="size-3.5 shrink-0" />
      <span class="truncate">{{ selectedOption?.label || 'Model' }}</span>
    </button>

    <!-- Dropdown -->
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="absolute bottom-full right-0 mb-2 w-52 max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden z-[200]"
        style="background: var(--surface-overlay); border: 1px solid var(--border-default); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px var(--border-subtle);"
      >
        <div class="py-1">
          <button
            v-for="option in options"
            :key="option.value"
            class="w-full px-3 py-2.5 text-left transition-all"
            :style="{
              background: option.value === modelValue ? 'var(--accent-muted)' : 'transparent',
            }"
            :class="option.value !== modelValue ? 'hover:bg-[var(--surface-hover)]' : ''"
            @click="selectOption(option.value)"
          >
            <div class="flex items-center gap-2">
              <UIcon
                v-if="option.value === modelValue"
                name="i-lucide-check"
                class="size-3.5"
                style="color: var(--accent);"
              />
              <span
                v-else
                class="size-3.5"
              />
              <span class="text-[12px] font-medium" style="color: var(--text-primary);">
                {{ option.label }}
              </span>
            </div>
            <div class="text-[10px] mt-0.5 ml-5.5" style="color: var(--text-secondary);">
              {{ option.description }}
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
.ctrl-btn:hover {
  color: var(--text-primary);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
