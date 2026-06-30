import { getClaudeCodeProjects, getClaudeCodeSessions } from '../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event) as { q?: string }

  if (!q || !q.trim()) {
    return { projects: [], sessions: [] }
  }

  const query = q.trim().toLowerCase()

  const projects = await getClaudeCodeProjects()

  const matchedProjects = projects
    .filter(p =>
      p.displayName.toLowerCase().includes(query) ||
      p.name.toLowerCase().includes(query)
    )
    .slice(0, 5)
    .map(p => ({
      name: p.name,
      displayName: p.displayName,
      sessionCount: p.sessionCount,
      lastActivity: p.lastActivity,
    }))

  // Search sessions across up to 20 most recent projects
  const projectsToSearch = projects.slice(0, 20)

  const sessionResults = await Promise.all(
    projectsToSearch.map(async (project) => {
      try {
        const { sessions } = await getClaudeCodeSessions(project.name, 50, 0)
        return sessions
          .filter(s => s.summary.toLowerCase().includes(query))
          .map(s => ({
            sessionId: s.id,
            summary: s.summary,
            projectName: project.name,
            projectDisplayName: project.displayName,
            lastActivity: s.lastActivity,
          }))
      } catch {
        return []
      }
    })
  )

  const sessions = sessionResults
    .flat()
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    .slice(0, 10)

  return { projects: matchedProjects, sessions }
})
