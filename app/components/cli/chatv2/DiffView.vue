<script setup lang="ts">
import type { DiffResult } from '~/server/api/projects/[projectName]/git/diff.get'

const props = defineProps<{
  diff: DiffResult | null
  loading: boolean
}>()

function hunkHint(header: string): string {
  const m = header.match(/^@@ [^@]+ @@(.*)$/)
  const hint = m?.[1]?.trim() ?? ''
  return hint.length > 60 ? hint.slice(0, 57) + '…' : hint
}

function hunkRange(header: string): string {
  const m = header.match(/^(@@ [^@]+ @@)/)
  return m?.[1] ?? header
}
</script>

<template>
  <div class="diff-container border-t border-b" style="border-color: var(--border-subtle);">

    <!-- Loading -->
    <div v-if="loading && !diff" class="flex items-center justify-center py-6" style="background: var(--surface-overlay);">
      <UIcon name="i-lucide-loader-2" class="size-4 animate-spin mr-2" style="color: var(--text-tertiary);" />
      <span class="text-[11px] font-mono" style="color: var(--text-tertiary);">Loading diff…</span>
    </div>

    <!-- Error -->
    <div v-else-if="diff?.error" class="px-4 py-3 text-[11px] font-mono" style="background: var(--surface-overlay); color: var(--error);">
      {{ diff.error }}
    </div>

    <!-- Empty diff -->
    <div v-else-if="diff && diff.hunks.length === 0" class="px-4 py-4 text-center" style="background: var(--surface-overlay);">
      <span class="text-[11px] font-mono" style="color: var(--text-tertiary);">No changes to display</span>
    </div>

    <!-- Diff hunks -->
    <div v-else-if="diff" class="overflow-x-auto" style="background: var(--surface-overlay);">
      <table class="diff-table w-full" cellspacing="0" cellpadding="0">
        <tbody>
          <template v-for="(hunk, hi) in diff.hunks" :key="hi">
            <!-- Hunk header row -->
            <tr class="hunk-header-row">
              <td class="gutter-cell gutter-old" />
              <td class="gutter-cell gutter-new" />
              <td class="gutter-cell gutter-sign" />
              <td class="content-cell hunk-header-content">
                <span class="hunk-range">{{ hunkRange(hunk.header) }}</span>
                <span v-if="hunkHint(hunk.header)" class="hunk-hint">{{ hunkHint(hunk.header) }}</span>
              </td>
            </tr>

            <!-- Diff lines -->
            <tr
              v-for="(line, li) in hunk.lines"
              :key="li"
              :class="['diff-line', `diff-line-${line.type}`]"
            >
              <td class="gutter-cell gutter-old">
                <span v-if="line.oldLine !== null">{{ line.oldLine }}</span>
              </td>
              <td class="gutter-cell gutter-new">
                <span v-if="line.newLine !== null">{{ line.newLine }}</span>
              </td>
              <td class="gutter-cell gutter-sign">
                <span v-if="line.type === 'add'" class="sign-add">+</span>
                <span v-else-if="line.type === 'remove'" class="sign-remove">-</span>
              </td>
              <td class="content-cell">
                <pre class="diff-content">{{ line.content }}</pre>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.diff-container {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.diff-table {
  table-layout: fixed;
  border-collapse: collapse;
  min-width: 100%;
}

.gutter-cell {
  padding: 0;
  white-space: nowrap;
  vertical-align: top;
  user-select: none;
  text-align: right;
  color: var(--text-disabled);
  font-size: 11px;
}
.gutter-old {
  width: 36px;
  padding-right: 6px;
  padding-left: 8px;
}
.gutter-new {
  width: 36px;
  padding-right: 6px;
}
.gutter-sign {
  width: 16px;
  padding-right: 4px;
  text-align: center;
}

.content-cell {
  padding: 0 8px 0 2px;
  vertical-align: top;
  width: 100%;
  overflow: hidden;
}

.diff-content {
  margin: 0;
  padding: 0;
  white-space: pre;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: var(--text-primary);
  overflow: visible;
  word-break: break-all;
}

/* ── Line types ── */
.diff-line-add {
  background: rgba(5, 150, 105, 0.07);
}
.diff-line-add .gutter-old,
.diff-line-add .gutter-new,
.diff-line-add .gutter-sign {
  background: rgba(5, 150, 105, 0.05);
}
.diff-line-add .diff-content {
  color: #065f46;
}

.diff-line-remove {
  background: rgba(220, 38, 38, 0.07);
}
.diff-line-remove .gutter-old,
.diff-line-remove .gutter-new,
.diff-line-remove .gutter-sign {
  background: rgba(220, 38, 38, 0.05);
}
.diff-line-remove .diff-content {
  color: #991b1b;
}

.diff-line-context .diff-content {
  color: var(--text-secondary);
}

/* ── Signs ── */
.sign-add {
  color: #059669;
  font-weight: 700;
}
.sign-remove {
  color: #dc2626;
  font-weight: 700;
}

/* ── Hunk header ── */
.hunk-header-row {
  background: rgba(99, 102, 241, 0.06);
}
.hunk-header-row .gutter-cell {
  background: rgba(99, 102, 241, 0.04);
}
.hunk-header-content {
  padding: 1px 8px;
}
.hunk-range {
  color: var(--accent-secondary);
  font-size: 11px;
  margin-right: 8px;
}
.hunk-hint {
  color: var(--text-tertiary);
  font-size: 11px;
  font-style: italic;
}
</style>
