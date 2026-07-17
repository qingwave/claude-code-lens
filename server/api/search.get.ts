import { getClaudeCodeProjects, searchUserMessages } from '../utils/claudeCodeHistory'

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event) as { q?: string }

  if (!q || !q.trim()) {
    return { projects: [], sessions: [] }
  }

  const query = q.trim().toLowerCase()

  const projects = await getClaudeCodeProjects()
  const projectDisplayNames = Object.fromEntries(projects.map(p => [p.name, p.displayName]))

  const matchedSessions = await searchUserMessages(query, projectDisplayNames)

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

  const sessions = matchedSessions.slice(0, 20)

  return { projects: matchedProjects, sessions }
})
