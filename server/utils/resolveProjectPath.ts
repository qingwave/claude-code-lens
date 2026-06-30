export async function resolveProjectPath(projectName: string): Promise<string> {
  try {
    const res = await $fetch<{ projectName: string | null }>(`/api/projects/resolve?name=${encodeURIComponent(projectName)}`)
    if (!res.projectName) {
      return projectName.replace(/-/g, '/')
    }
    const projects = await $fetch<any[]>('/api/projects')
    const project = projects.find((p: any) => p.name === res.projectName)
    if (!project) throw new Error('Project not found')
    return project.path
  } catch {
    return projectName.replace(/-/g, '/')
  }
}
