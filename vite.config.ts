import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Tauri expects a fixed dev port and must see Rust errors in the terminal.
export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Check manifest and scripts, shared with the Rust core (one source of truth).
      '@checks': fileURLToPath(new URL('./crates/core/checks', import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: 'localhost',
    watch: { ignored: ['**/src-tauri/**', '**/crates/**', '**/target/**'] },
  },
  build: {
    target: 'safari16',
  },
})
