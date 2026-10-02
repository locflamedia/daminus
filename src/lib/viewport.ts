// The window width decides the sidebar: full at 1280 and wider, narrower from 1080, and a
// 64 px rail below that. The user can fold or unfold at any width (⌘\); the choice is
// remembered per range.
import { type InjectionKey, type Ref, inject, onMounted, onUnmounted, readonly, ref } from 'vue'

export const SIDEBAR_RANGES = ['wide', 'medium', 'narrow'] as const
export type SidebarRange = (typeof SIDEBAR_RANGES)[number]

export function rangeOf(width: number): SidebarRange {
  if (width >= 1280) return 'wide'
  if (width >= 1080) return 'medium'
  return 'narrow'
}

export function useViewportWidth() {
  const width = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
  const update = () => (width.value = window.innerWidth)
  onMounted(() => window.addEventListener('resize', update))
  onUnmounted(() => window.removeEventListener('resize', update))
  return readonly(width)
}

/** The range the window is in, provided by `Window` so headers can adapt without props. */
export const LAYOUT_RANGE: InjectionKey<Readonly<Ref<SidebarRange>>> = Symbol('layout-range')

export function useLayoutRange(): Readonly<Ref<SidebarRange>> {
  return inject(LAYOUT_RANGE, ref<SidebarRange>('wide'))
}
