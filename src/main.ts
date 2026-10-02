import { createPinia } from 'pinia'
import { createApp } from 'vue'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/motion.css'
import App from './App.vue'
import { i18n } from './i18n'
import { createAppRouter } from './router'
import { useSettingsStore } from './stores/settings'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia).use(i18n).use(createAppRouter())

// Theme and language are applied before the first paint, so there is no flash of the wrong one.
useSettingsStore(pinia).init()

// A development aid: `?mock` answers the commands with a fixed report (see api/dev-mock.ts).
async function start() {
  const mock = import.meta.env.DEV ? new URLSearchParams(location.search).get('mock') : null
  if (mock !== null) {
    const { installDevMock } = await import('./api/dev-mock')
    installDevMock(mock)
  }
  app.mount('#app')
}

void start()
