<script setup lang="ts">
import type { DisplayChatMessage } from '~/types'

const props = defineProps<{
  messages: DisplayChatMessage[]
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  (e: 'permissionRespond', permissionId: string, decision: 'allow' | 'deny', remember?: boolean, updatedInput?: any): void
  (e: 'promptRespond', promptId: string, value: string): void
  (e: 'resend', content: string, images?: string[]): void
  (e: 'openFile', filePath: string): void
}>()

// Track which user message is showing "copied" state
const copiedMessageId = ref<string | null>(null)

async function copyUserMessage(messageId: string, content: string) {
  try {
    await navigator.clipboard.writeText(content)
    copiedMessageId.value = messageId
    setTimeout(() => { copiedMessageId.value = null }, 2000)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

// Track which assistant group is showing "copied" state
const copiedGroupId = ref<string | null>(null)

async function copyAssistantGroup(group: MessageGroup) {
  const text = group.messages
    .filter(m => m.kind === 'text' && m.content)
    .map(m => m.content)
    .join('\n\n')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copiedGroupId.value = group.id
    setTimeout(() => { copiedGroupId.value = null }, 2000)
  } catch (e) {
    console.error('Failed to copy:', e)
  }
}

// Group consecutive assistant messages together
interface MessageGroup {
  id: string
  role: 'user' | 'assistant'
  timestamp: string
  messages: DisplayChatMessage[]
}

const messageGroups = computed<MessageGroup[]>(() => {
  const groups: MessageGroup[] = []
  let currentGroup: MessageGroup | null = null

  for (const message of props.messages) {
    const messageRole = message.role || (message.kind === 'text' && message.content ? 'assistant' : 'assistant')

    // Check if we should continue the current group or start a new one
    if (currentGroup && currentGroup.role === messageRole) {
      // Same role - add to current group
      currentGroup.messages.push(message)
    } else {
      // Different role - push current group and start a new one
      if (currentGroup) {
        groups.push(currentGroup)
      }
      currentGroup = {
        id: message.id,
        role: messageRole,
        timestamp: message.timestamp,
        messages: [message]
      }
    }
  }

  if (currentGroup) {
    groups.push(currentGroup)
  }

  return groups
})

function handlePermissionRespond(permissionId: string, decision: 'allow' | 'deny', remember = false, updatedInput?: any) {
  emit('permissionRespond', permissionId, decision, remember, updatedInput)
}

function handlePromptRespond(promptId: string, value: string) {
  emit('promptRespond', promptId, value)
}

function handleOpenFile(filePath: string) {
  emit('openFile', filePath)
}

function handleResend(content: string, images?: string[]) {
  emit('resend', content, images)
}
</script>

<template>
  <div class="space-y-5">
    <!-- Message Groups -->
    <div
      v-for="group in messageGroups"
      :key="group.id"
      :id="`msg-${group.id}`"
      class="message-group min-w-0"
    >
      <!-- User Message Group -->
      <div v-if="group.role === 'user'" class="flex justify-end min-w-0">
        <div class="group flex items-start gap-2 md:gap-3 max-w-[95%] md:max-w-[85%] min-w-0">
          <div class="flex flex-col items-end gap-1.5 min-w-0">
            <!-- All user messages in this group -->
            <div
              v-for="(msg, idx) in group.messages"
              :key="msg.id"
              class="min-w-0"
            >
              <div
                class="px-3 md:px-4 py-2 md:py-2.5 min-w-0"
                :class="idx === 0 ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-r-md'"
                style="background: var(--surface-raised); color: var(--text-primary); border: 1px solid var(--border-default);"
              >
                <div v-if="msg.images && msg.images.length > 0" class="flex flex-wrap gap-2 mb-2">
                  <img v-for="(img, i) in msg.images" :key="i" :src="img" class="max-w-[160px] md:max-w-[200px] max-h-[160px] md:max-h-[200px] rounded-lg object-contain bg-white/10" />
                </div>
                <div v-if="msg.content" class="text-[12px] md:text-[13px] whitespace-pre-wrap break-words overflow-wrap-anywhere max-w-full">{{ msg.content.trim() }}</div>
              </div>
            </div>

            <!-- Timestamp + copy + resend buttons on same row -->
            <ClientOnly>
              <div class="flex items-center gap-2 px-1">
                <template v-if="group.messages.at(-1)?.content">
                  <button
                    class="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Resend message"
                    @click="handleResend(group.messages.at(-1)!.content!, group.messages.at(-1)!.images)"
                  >
                    <UIcon name="i-lucide-rotate-ccw" class="size-3" style="color: var(--text-tertiary);" />
                  </button>
                  <button
                    class="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy to clipboard"
                    @click="copyUserMessage(group.messages.at(-1)!.id, group.messages.at(-1)!.content!)"
                  >
                    <UIcon
                      :name="copiedMessageId === group.messages.at(-1)!.id ? 'i-lucide-check' : 'i-lucide-copy'"
                      class="size-3"
                      :style="{ color: copiedMessageId === group.messages.at(-1)!.id ? '#22c55e' : 'var(--text-tertiary)' }"
                    />
                  </button>
                </template>
                <span class="text-[9px] md:text-[10px]" style="color: var(--text-tertiary);">
                  {{ new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </span>
              </div>
            </ClientOnly>
          </div>
          <!-- User Avatar -->
          <div
            class="size-7 md:size-8 rounded-full shrink-0 flex items-center justify-center"
            style="background: var(--accent-muted); border: 1px solid rgba(229,169,62,0.25);"
          >
            <UIcon name="i-lucide-user" class="size-3.5 md:size-4" style="color: var(--accent);" />
          </div>
        </div>
      </div>

      <!-- Assistant Message Group -->
      <div v-else class="flex items-start gap-2 md:gap-3 min-w-0 group/assistant">
        <!-- Claude Avatar -->
        <div
          class="size-7 md:size-8 rounded-full shrink-0 flex items-center justify-center mt-0.5"
          style="background: linear-gradient(135deg, #d97706 0%, #ea580c 100%);"
        >
          <svg class="size-3.5 md:size-4" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
          </svg>
        </div>

        <div class="flex-1 min-w-0 overflow-wrap-anywhere">
          <!-- Messages in this group -->
          <div class="space-y-2">
            <template v-for="message in group.messages" :key="message.id">
              <ChatV2MessageItem
                :message="message"
                :show-timestamp="false"
                :group-timestamp="message.kind === 'complete' ? group.timestamp : undefined"
                :group-copied="message.kind === 'complete' ? (copiedGroupId === group.id) : undefined"
                :show-copy="message.kind === 'complete' && group.messages.some(m => m.kind === 'text' && m.content)"
                @permission-respond="handlePermissionRespond"
                @prompt-respond="handlePromptRespond"
                @open-file="handleOpenFile"
                @copy-group="copyAssistantGroup(group)"
              />
            </template>
          </div>

          <!-- Bottom toolbar: timestamp + copy (only when no complete card) -->
          <div
            v-if="!group.messages.some(m => m.kind === 'complete')"
            class="flex items-center gap-2 mt-1.5 opacity-0 group-hover/assistant:opacity-100 transition-opacity"
          >
            <ClientOnly>
              <span class="text-[9px] md:text-[10px]" style="color: var(--text-tertiary);">
                {{ new Date(group.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </ClientOnly>
            <button
              v-if="group.messages.some(m => m.kind === 'text' && m.content && !m.isStreaming)"
              class="p-1 rounded"
              title="Copy to clipboard"
              @click="copyAssistantGroup(group)"
            >
              <UIcon
                :name="copiedGroupId === group.id ? 'i-lucide-check' : 'i-lucide-copy'"
                class="size-3.5"
                :style="{ color: copiedGroupId === group.id ? '#22c55e' : 'var(--text-tertiary)' }"
              />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Streaming indicator when streaming but no text yet -->
    <div
      v-if="isStreaming && messageGroups.length > 0 && !messageGroups[messageGroups.length - 1]?.messages.some(m => m.isStreaming)"
      class="flex items-start gap-2 md:gap-3"
    >
      <!-- Claude Avatar -->
      <div
        class="size-7 md:size-8 rounded-full shrink-0 flex items-center justify-center mt-0.5"
        style="background: linear-gradient(135deg, #d97706 0%, #ea580c 100%);"
      >
        <svg class="size-3.5 md:size-4" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
        </svg>
      </div>

      <div class="flex-1 min-w-0 pt-0.5">
        <span class="streaming-cursor" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.overflow-wrap-anywhere {
  overflow-wrap: anywhere;
  word-wrap: break-word;
  word-break: break-word;
}

.max-w-full {
  max-width: 100%;
}

.streaming-cursor {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  margin-left: 4px;
  vertical-align: middle;
  animation: cursor-breathe 1.2s ease-in-out infinite;
}
@keyframes cursor-breathe {
  0%, 100% { transform: scale(0.6); opacity: 0.4; }
  50%       { transform: scale(1);   opacity: 1; }
}
</style>
