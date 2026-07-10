<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-section-title">Memory Files</h3>
        <p class="text-[12px] text-meta mt-0.5">
          Persistent facts Claude recalls across sessions, stored in
          <span class="font-mono">~/.claude/memory/</span>
        </p>
      </div>
    </div>
    <ProjectMemoryManager />
  </div>
</template>
