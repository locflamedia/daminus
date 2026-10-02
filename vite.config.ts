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
  // vue-i18n's feature flags, set explicitly so the bundle does not warn about them. Message
  // compilation is JIT without `eval`, which the strict CSP (no unsafe-eval) requires.
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  build: {
    target: 'safari16',
    // Never inline assets as data: URIs; the CSP allows `font-src 'self'` only.
    assetsInlineLimit: 0,
  },
})
