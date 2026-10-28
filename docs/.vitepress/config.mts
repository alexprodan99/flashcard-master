import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Flashcard Master',
  description: 'Local-First, Grounded AI Flashcard Generation & Study Knowledge Base',
  base: '/flashcard-master/',
  cleanUrls: true,
  rewrites: {
    'ARCHITECTURE.md': 'architecture.md',
  },
  themeConfig: {
    siteTitle: 'Flashcard Master',
    logo: { text: '🎴' },
    nav: [
      { text: 'Home', link: '/' },
      { text: 'User Guide', link: '/user-guide/quickstart' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Settings', link: '/settings-configuration' },
      { text: 'GitHub', link: 'https://github.com/alexprodan99/flashcard-master' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Documentation Hub', link: '/' },
          { text: '3-Minute Quickstart', link: '/user-guide/quickstart' },
        ],
      },
      {
        text: 'User Guide',
        items: [
          { text: 'Ingestion Playbook', link: '/user-guide/ingestion-playbook' },
          { text: 'Synthesis & Prompt Tuning', link: '/user-guide/synthesis-and-prompting' },
          { text: 'Study & Export Workflows', link: '/user-guide/study-and-export' },
          { text: 'Troubleshooting & FAQ', link: '/user-guide/troubleshooting-faq' },
        ],
      },
      {
        text: 'Configuration & Integrations',
        items: [
          { text: 'Settings & Environment', link: '/settings-configuration' },
          { text: 'Notion Setup & Permissions', link: '/notion-setup' },
          { text: 'BMAD Methodology Guide', link: '/bmad-guide' },
        ],
      },
      {
        text: 'Architecture & System Design',
        items: [
          { text: 'Monorepo Architecture', link: '/architecture' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/alexprodan99/flashcard-master' },
    ],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Released under the GNU Affero General Public License v3.0 (AGPL-3.0).',
      copyright: 'Copyright © 2026 Ionut-Alexandru Prodan (alexprodan99) and Flashcard Master contributors.',
    },
  },
});
