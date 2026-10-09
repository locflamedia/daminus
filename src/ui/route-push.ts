// Opening a detail (a project or a server) slides the new view 12 px in from the right in
// 220 ms, ease-out; going back slides it in from the left. Keyboard-driven moves are instant,
// and under Reduce Motion the shift is 0 so only the fade remains (tokens.css).

export type PushDirection = 'push' | 'pop'
export type InputKind = 'pointer' | 'keyboard'

const DETAIL_ROUTES = new Set(['project', 'server'])

/** Push into a detail, pop out of one; null when neither side is a detail or nothing changed. */
export function pushDirection(
  from: string | symbol | null | undefined,
  to: string | symbol | null | undefined,
): PushDirection | null {
  if (from === undefined || from === null || from === to) return null
  const fromDetail = typeof from === 'string' && DETAIL_ROUTES.has(from)
  const toDetail = typeof to === 'string' && DETAIL_ROUTES.has(to)
  if (toDetail) return 'push'
  if (fromDetail) return 'pop'
  return null
}

/** Remembers whether the last input was the pointer or the keyboard. */
export function createInputTracker(target: Window) {
  let last: InputKind | null = null
  const onPointer = () => (last = 'pointer')
  const onKey = () => (last = 'keyboard')
  target.addEventListener('pointerdown', onPointer, true)
  target.addEventListener('keydown', onKey, true)
  return {
    last: () => last,
    stop() {
      target.removeEventListener('pointerdown', onPointer, true)
      target.removeEventListener('keydown', onKey, true)
    },
  }
}

function ms(value: string): number {
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n)) return 0
  return value.trim().endsWith('ms') ? n : n * 1000
}

function rootVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name)
}

/** Plays the slide on the view inside `main`; decorative (aria-hidden) children stay put. */
export function playPush(
  main: Element,
  direction: PushDirection,
  read: (name: string) => string = rootVar,
): void {
  const duration = ms(read('--dur-push'))
  if (duration <= 0) return
  const shift = read('--push-shift').trim() || '0px'
  const offset = direction === 'push' ? shift : `-${shift}`
  const easing = read('--ease-out').trim() || 'ease-out'
  for (const child of Array.from(main.children)) {
    if (child.getAttribute('aria-hidden') === 'true') continue
    if (typeof (child as HTMLElement).animate !== 'function') continue
    ;(child as HTMLElement).animate(
      [
        { opacity: 0, transform: `translateX(${offset})` },
        { opacity: 1, transform: 'none' },
      ],
      { duration, easing },
    )
  }
}
