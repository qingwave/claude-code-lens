import type { DiffResult } from '~/server/api/projects/[projectName]/git/diff.get'

export interface FileEditorState {
  isOpen: boolean
  pending: boolean
  filePath: string | null
  content: string | null
  diffInfo: {
    oldContent: string
    newContent: string
  } | null
  diffResult: DiffResult | null
}

export function useFileEditor() {
  const state = useState<FileEditorState>('file-editor-state', () => ({
    isOpen: false,
    pending: false,
    filePath: null,
    content: null,
    diffInfo: null,
    diffResult: null,
  }))

  function openFile(filePath: string, diffInfo?: { oldContent: string; newContent: string }) {
    state.value.filePath = filePath
    state.value.diffInfo = diffInfo || null
    state.value.diffResult = null
    state.value.pending = false
    state.value.isOpen = true
  }

  // Call with null diffResult to show a loading spinner while fetch is in-flight
  function openDiff(filePath: string, diffResult: DiffResult | null) {
    state.value.filePath = filePath
    state.value.diffResult = diffResult
    state.value.diffInfo = null
    state.value.content = null
    state.value.pending = diffResult === null
    state.value.isOpen = true
  }

  function closeEditor() {
    state.value.isOpen = false
    state.value.pending = false
    state.value.filePath = null
    state.value.content = null
    state.value.diffInfo = null
    state.value.diffResult = null
  }

  return {
    state: readonly(state),
    openFile,
    openDiff,
    closeEditor,
  }
}
