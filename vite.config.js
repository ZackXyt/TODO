import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  // Expose version to client code as __APP_VERSION__
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // GitHub Pages deploys to https://zackxyt.github.io/TODO/
  base: '/TODO/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    VitePWA({
      // 'prompt' = 检测到新版本时触发 onNeedRefresh 回调（显示横幅让用户选）
      // 'autoUpdate' = 静默自动更新，不通知用户（不是我们想要的）
      registerType: 'prompt',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'heartflow.svg',
        'release-notes.json',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
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
