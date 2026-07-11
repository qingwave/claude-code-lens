export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  devtools: { enabled: true },

  future: { compatibilityVersion: 4 },

  css: ['~/assets/css/main.css', '@xterm/xterm/css/xterm.css'],

  compatibilityDate: '2025-01-15',

  runtimeConfig: {
    claudeDir: process.env.CLAUDE_DIR || '',
    claudeCliPath: process.env.CLAUDE_CLI_PATH || '',
  },

  nitro: {
    experimental: {
      websocket: true,
    },
  },

  app: {
    head: {
      title: 'Claude Code Lens',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'Visual manager for Claude Code agents, commands, skills, and plugins. Configure AI assistants without touching the terminal.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#F7F8FA' },
        { property: 'og:title', content: 'Claude Code Lens — Claude Code' },
        { property: 'og:description', content: 'Visual manager for Claude Code agents, commands, skills, and plugins. Configure AI assistants without touching the terminal.' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  components: [
    { path: '~/components/chat', pathPrefix: false },
    { path: '~/components/studio', pathPrefix: false },
    { path: '~/components/cli', pathPrefix: false },
    { path: '~/components' },
  ],

  colorMode: {
    preference: 'light',
  },

  routeRules: {
    '/templates': { redirect: '/explore' },
  },
})
