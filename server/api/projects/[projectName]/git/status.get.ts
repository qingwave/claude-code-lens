import { validateGitRepository, getCurrentBranchName, spawnAsync } from '../../../../utils/gitUtils'
import { resolveProjectPath } from '../../../../utils/resolveProjectPath'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName')
  if (!projectName) {
    throw createError({ statusCode: 400, message: 'Project name is required' })
  }

  const projectPath = await resolveProjectPath(projectName)

  try {
    await validateGitRepository(projectPath)
    const branch = await getCurrentBranchName(projectPath)

    const { stdout: statusOutput } = await spawnAsync('git', ['status', '--porcelain=v1'], { cwd: projectPath })

    interface FileEntry {
      path: string
      origPath?: string
    }

    const stagedModified: FileEntry[] = []
    const stagedAdded: FileEntry[] = []
    const stagedDeleted: FileEntry[] = []
    const stagedRenamed: FileEntry[] = []
    const workingModified: FileEntry[] = []
    const workingDeleted: FileEntry[] = []
    const untracked: FileEntry[] = []

    const lines = statusOutput.split('\n').filter(Boolean)
    for (const line of lines) {
      const x = line[0]
      const y = line[1]
      const rawPath = line.slice(3)
      const parts = rawPath.split(' -> ')
      const path = (parts[parts.length - 1] || '').replace(/^"|"$/g, '')
      const origPath = parts.length > 1 ? parts[0].replace(/^"|"$/g, '') : undefined

      if (x === '?' && y === '?') { untracked.push({ path }); continue }
      if (x === '!' && y === '!') continue

      if (x === 'M') stagedModified.push({ path })
      else if (x === 'A') stagedAdded.push({ path })
      else if (x === 'D') stagedDeleted.push({ path })
      else if (x === 'R') stagedRenamed.push({ path, origPath })
      else if (x === 'C') stagedAdded.push({ path })

      if (y === 'M') workingModified.push({ path })
      else if (y === 'D') workingDeleted.push({ path })
    }

    return {
      branch,
      stagedModified: stagedModified.map(f => f.path),
      stagedAdded: stagedAdded.map(f => f.path),
      stagedDeleted: stagedDeleted.map(f => f.path),
      stagedRenamed: stagedRenamed.map(f => f.origPath ? `${f.origPath} → ${f.path}` : f.path),
      modified: workingModified.map(f => f.path),
      deleted: workingDeleted.map(f => f.path),
      untracked: untracked.map(f => f.path),
      // Legacy fields kept for any other consumers
      staged: [
        ...stagedModified.map(f => f.path),
        ...stagedAdded.map(f => f.path),
        ...stagedDeleted.map(f => f.path),
        ...stagedRenamed.map(f => f.path),
      ],
      added: stagedAdded.map(f => f.path),
      projectPath
    }
  } catch (error: any) {
    return { error: error.message, projectPath }
  }
})
