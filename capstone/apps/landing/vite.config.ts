import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset URLs so the built site can be hosted from any path.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  server: { host: true },
})
