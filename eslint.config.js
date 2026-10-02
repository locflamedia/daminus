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

// Server and AI text is always rendered as text. `vue/no-v-html` covers templates; these
// cover the same sinks in scripts and render functions, everywhere (src/api/ included).
const htmlMessage = 'Server and AI text is rendered as text, never as HTML.'
const htmlSinkSyntax = [
  {
    selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
    message: htmlMessage,
  },
  { selector: 'Property[key.name=/^(innerHTML|outerHTML)$/]', message: htmlMessage },
  {
    selector:
      'CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment|parseFromString|setHTMLUnsafe|parseHTMLUnsafe)$/]',
    message: htmlMessage,
  },
  // A parser or a computed key reaches the same sinks without naming them.
  { selector: "NewExpression[callee.name='DOMParser']", message: htmlMessage },
  { selector: 'MemberExpression[computed=true][property.value=/HTML/]', message: htmlMessage },
  { selector: 'AssignmentExpression[left.property.name=/^srcdoc$/]', message: htmlMessage },
]
const htmlSinkProperties = [{ object: 'document', property: 'write', message: htmlMessage }]

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
      'no-restricted-syntax': ['error', tauriDynamicImportBan, ...htmlSinkSyntax],
      'no-restricted-properties': ['error', ...tauriGlobalBan, ...htmlSinkProperties],
    },
  },
  {
    name: 'daminus/api-boundary',
    files: ['src/api/**'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': ['error', ...htmlSinkSyntax],
      'no-restricted-properties': ['error', ...htmlSinkProperties],
    },
  },
  skipFormatting,
)
