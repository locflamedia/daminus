// Settings › About: whether an SSH agent answers, and the diagnostics text for a bug report.
// The core builds the text (secrets removed) and returns it here; this store puts it on the
// clipboard and nowhere else.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type AgentStatus, agentStatus, copyText, diagnosticsCollect } from '@/api'
import { t } from '@/i18n'
import { useToastStore } from './toasts'

export const useAboutStore = defineStore('about', () => {
  const agent = ref<AgentStatus | null>(null)
  /** True when the agent could not be asked at all, so "none" is not claimed. */
  const agentFailed = ref(false)
  const copying = ref(false)

  async function loadAgent() {
    try {
      agent.value = await agentStatus()
      agentFailed.value = false
    } catch {
      agentFailed.value = true
    }
  }

  async function copyDiagnostics() {
    if (copying.value) return
    copying.value = true
    const toasts = useToastStore()
    try {
      await copyText((await diagnosticsCollect()).text)
      toasts.push({ tone: 'ok', title: t('settingsAbout.diagnostics.copied') })
    } catch {
      toasts.push({ tone: 'crit', title: t('settingsAbout.diagnostics.failed') })
    } finally {
      copying.value = false
    }
  }

  return { agent, agentFailed, copying, loadAgent, copyDiagnostics }
})
