import { computed } from 'vue'
import { useAiProvidersStore } from '@/stores/ai-providers'

/** The model (or provider) name the AI chips show; empty while AI is off or no provider is chosen. */
export function useAiProviderName() {
  const providers = useAiProvidersStore()

  const name = computed(() => {
    const view = providers.view
    if (!view || view.provider === null) return ''
    const entry = view.providers.find((p) => p.profile.id === view.provider)
    return view.model ?? entry?.profile.models[0] ?? entry?.profile.name ?? ''
  })

  if (providers.view === null) void providers.load()
  return name
}
