import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { placeBox, type Placement, type Side } from './anchor'

export interface AnchoredOptions {
  placement?: Placement
  gap?: number
}

/**
 * Keeps a floating element (menu, popover, tooltip) next to its trigger while it is open:
 * measured once it is in the document, again when the window resizes or anything scrolls.
 * The element is `position: fixed`, so a clipping ancestor never cuts it; bind `style`.
 */
export function useAnchored(
  anchor: Ref<HTMLElement | null | undefined>,
  floating: Ref<HTMLElement | null | undefined>,
  options: AnchoredOptions = {},
) {
  const style = ref<Record<string, string>>({ left: '0px', top: '0px', visibility: 'hidden' })
  const side = ref<Side>('bottom')
  const arrowLeft = ref(0)

  function update() {
    const a = anchor.value
    const f = floating.value
    if (!a || !f) return
    const rect = a.getBoundingClientRect()
    const placed = placeBox(
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: f.offsetWidth, height: f.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      { placement: options.placement, gap: options.gap },
    )
    side.value = placed.side
    arrowLeft.value = placed.arrowLeft
    style.value = {
      left: `${placed.left}px`,
      top: `${placed.top}px`,
      transformOrigin: placed.origin,
    }
  }

  let listening = false
  function listen(on: boolean) {
    if (on === listening) return
    listening = on
    const method = on ? 'addEventListener' : 'removeEventListener'
    window[method]('resize', update)
    window[method]('scroll', update, true)
  }

  watch(
    floating,
    (el) => {
      listen(!!el)
      if (el) update()
      else style.value = { left: '0px', top: '0px', visibility: 'hidden' }
    },
    { flush: 'post' },
  )
  onBeforeUnmount(() => listen(false))

  return { style, side, arrowLeft, update }
}
