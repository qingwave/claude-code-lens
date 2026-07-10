<script setup lang="ts">
const props = defineProps<{
  modelValue: string | undefined
  options: Array<{
    value: string | undefined
    label: string
    description?: string
  }>
  placeholder?: string
  icon?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | undefined): void
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

const selectedOption = computed(() => props.options.find(o => o.value === props.modelValue))

function selectOption(value: string | undefined) {
  emit('update:modelValue', value)
  isOpen.value = false
}

function openDropdown() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const estimatedHeight = Math.min(props.options.length * 52 + 8, 320)
  const showAbove = spaceBelow < estimatedHeight + 8 && rect.top > estimatedHeight + 8

  dropdownStyle.value = {
    position: 'fixed',
    left: rect.left + 'px',
    width: rect.width + 'px',
    zIndex: '9999',
    ...(showAbove
      ? { bottom: (window.innerHeight - rect.top + 4) + 'px' }
      : { top: (rect.bottom + 4) + 'px' }),
  }
  isOpen.value = true
}

function handleMouseDown(e: MouseEvent) {
  if (triggerRef.value && !triggerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleMouseDown))
onUnmounted(() => document.removeEventListener('mousedown', handleMouseDown))
</script>

<template>
  <div ref="triggerRef" class="relative w-full">
    <button
      type="button"
      class="field-input flex items-center gap-2 text-left w-full"
      @click="isOpen ? (isOpen = false) : openDropdown()"
    >
      <UIcon v-if="icon" :name="icon" class="size-3.5 text-meta" />
      <span
        class="flex-1 truncate"
        :style="!selectedOption ? 'color: var(--text-disabled); font-family: var(--font-sans)' : ''"
      >
        {{ selectedOption?.label || placeholder || 'Select...' }}
      </span>
      <UIcon :name="isOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3.5 text-meta" />
    </button>

    <Teleport to="body">
      <Transition name="dropdown">
        <div
          v-if="isOpen"
          :style="dropdownStyle"
          class="rounded-xl overflow-hidden"
          style="background: var(--surface-overlay); border: 1px solid var(--border-default); box-shadow: 0 4px 20px rgba(0,0,0,0.15)"
        >
          <div class="py-1 overflow-y-auto max-h-80">
            <button
              v-for="option in options"
              :key="String(option.value)"
              type="button"
              class="w-full px-3 py-2 text-left transition-all hover-bg"
              :style="{ background: option.value === modelValue ? 'var(--accent-muted)' : 'transparent' }"
              @click="selectOption(option.value)"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  v-if="option.value === modelValue"
                  name="i-lucide-check"
                  class="size-3.5 shrink-0"
                  style="color: var(--accent)"
                />
                <span v-else class="size-3.5 shrink-0" />
                <span class="text-[12px] font-medium" style="color: var(--text-primary)">{{ option.label }}</span>
              </div>
              <div v-if="option.description" class="text-[10px] mt-0.5 ml-5" style="color: var(--text-secondary)">
                {{ option.description }}
              </div>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dropdown-enter-active, .dropdown-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
