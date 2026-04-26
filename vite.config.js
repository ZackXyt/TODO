import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages deploys to https://zackxyt.github.io/TODO/
  base: '/TODO/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'heartflow.svg',
      ],
      manifest: {
        name: '心流 HeartFlow',
        short_name: '心流',
        description: '专注、高效、心流状态——优雅的任务管理应用',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/TODO/',
        start_url: '/TODO/',
        lang: 'zh-CN',
        icons: [
          { src: 'pwa-64x64.png',  sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache all built assets + index.html, with version-based cache busting
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // When a new SW takes over, claim clients immediately so users get fresh code on next nav
        clientsClaim: true,
        skipWaiting: false, // we'll prompt the user instead of forcing
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false, // PWA only on production builds
      },
    }),
  ],
})
