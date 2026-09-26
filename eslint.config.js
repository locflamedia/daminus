import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from 'eslint-config-prettier/flat'
import pluginVue from 'eslint-plugin-vue'

// `src/api/` is the only place allowed to talk to Tauri, so IPC stays typed and auditable.
const tauriImportBan = {
  patterns: [
    {
      group: ['@tauri-apps/*'],
      message: 'Only src/api/ may import @tauri-apps/*. Use the wrappers in @/api instead.',
    },
  ],
}
const tauriBoundaryMessage = 'Only src/api/ may talk to Tauri. Use the wrappers in @/api instead.'
// `no-restricted-imports` only sees static imports, so dynamic `import()` and the
// injected globals are banned separately.
const tauriDynamicImportBan = {
  selector: 'ImportExpression[source.value=/^@tauri-apps\\//]',
  message: tauriBoundaryMessage,
}
const tauriGlobalBan = ['__TAURI__', '__TAURI_INTERNALS__'].flatMap((property) => [
  { object: 'window', property, message: tauriBoundaryMessage },
  { object: 'globalThis', property, message: tauriBoundaryMessage },
])

export default defineConfigWithVueTs(
  {
    name: 'daminus/ignores',
    ignores: ['dist/**', 'target/**', 'src-tauri/**', 'crates/**', 'coverage/**', 'plans/**'],
  },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,
  {
    name: 'daminus/rules',
    files: ['**/*.{ts,vue,js}'],
    rules: {
      'vue/no-v-html': 'error',
      'no-restricted-imports': ['error', tauriImportBan],
      'no-restricted-syntax': ['error', tauriDynamicImportBan],
      'no-restricted-properties': ['error', ...tauriGlobalBan],
    },
  },
  {
    name: 'daminus/api-boundary',
    files: ['src/api/**'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-properties': 'off',
    },
  },
  skipFormatting,
)
