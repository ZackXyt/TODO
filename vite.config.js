import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages deploys to https://zackxyt.github.io/TODO/
  base: '/TODO/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
