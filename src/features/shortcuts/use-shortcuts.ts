// Registers the window-wide keys once and carries them out.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePaletteStore } from '@/features/palette/palette-store'
import { useProjectsStore } from '@/stores/projects'
import { useScanPanelStore } from '@/stores/scan-panel'
import { useScanStore } from '@/stores/scan'
import { globalAction } from './keys'
import { useShortcutsStore } from './shortcuts-store'

export function useShortcuts() {
  const route = useRoute()
  const router = useRouter()
  const sheet = useShortcutsStore()
  const palette = usePaletteStore()
  const scan = useScanStore()
  const panel = useScanPanelStore()
  const projects = useProjectsStore()

  const routeName = computed(() => String(route.name ?? ''))

  function onKeydown(e: KeyboardEvent) {
    const action = globalAction(e, {
      route: routeName.value,
      suspended: route.meta.setup === true || route.meta.bare === true,
      overlayOpen: palette.open || sheet.open,
      scanning: scan.scanning,
      canScan: projects.loaded && projects.details.length > 0,
    })
    if (!action) return
    e.preventDefault()
    if (action === 'sheet') sheet.toggle()
    else if (action === 'settings') void router.push({ name: 'settings' })
    else if (action === 'overview') void router.push({ name: 'overview' })
    else if (action === 'history') void router.push({ name: 'history' })
    else void panel.start()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
