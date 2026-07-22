# Changelog

All notable changes to CCLens are documented here.

## [0.2.0] - 2026-07-22

### Added

**CLI Mode** — manage Claude Code config and sessions from the terminal, no browser needed:

- `cclens search` / `-s` — full-text search across all sessions, interactive picker to resume
- `cclens sessions [project]` — browse recent sessions, select to resume
- `cclens export <id|query> [-o file.md]` — export session history to markdown
- `cclens cleanup [project]` — remove empty sessions
- `cclens projects` — list all projects with session counts
- `cclens rename <old> <new>` — rename a project entry in `~/.claude`
- `cclens agents / skills / commands / workflows / plugins / memory / mcp` — browse config
- `cclens stats` — overview: tokens, cost, recent sessions, agent usage
- `--port / -p` flag and auto-open browser on startup

**UI**

- Redesigned global search with frosted-glass overlay (`⌘K`) — searches agents, commands, skills, projects, and session content
- Cross-project relationship graph on dashboard

### Changed

- Default `maxTurns` increased to 20, with continue-on-limit prompt

### Fixed

- Prevent message duplication on session resume

---

## [0.1.0] - 2026-06-25

Initial release.

- Visual agent, command, skill, workflow editor
- Relationship graph
- Agent Studio with SSE streaming
- CLI terminal emulator with real-time context monitoring
- Chat mode with session persistence
- GitHub skill import
- Marketplace & plugin system
