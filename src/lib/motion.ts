// Motion helpers for the utilities in styles/motion.css. Every motion plays once, when its
// event happens; Reduce Motion is read from the OS and CSS handles the fallback per kind.
import { onScopeDispose, readonly, ref, type Directive } from 'vue'

const QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true
}

/** Reactive Reduce Motion, for the few things CSS cannot switch off (JS-driven tweens). */
export function useReducedMotion() {
  const reduced = ref(prefersReducedMotion())
  if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => (reduced.value = e.matches)
    query.addEventListener('change', onChange)
    onScopeDispose(() => query.removeEventListener('change', onChange))
  }
  return readonly(reduced)
}

/** Delay of item `index` in a staggered group: cards arrive 80 ms apart. */
export function staggerDelay(index: number, stepMs = 80): string {
  return `${Math.max(0, index) * stepMs}ms`
}

const played = new Set<string>()

/**
 * True the first time `key` is asked for, false after. For "draws once, the first time it
 * appears; rescans only update": a chart passes its own id and plays only when this is true.
 */
export function playOnce(key: string): boolean {
  if (played.has(key)) return false
  played.add(key)
  return true
}

/**
 * Whether a chart should play its arrival: always when it has no key (it is new on screen),
 * and only the first time for a key, so a card that returns to view shows its final state.
 */
export function shouldPlay(key?: string): boolean {
  return key === undefined ? true : playOnce(key)
}

/** Forgets what has played (tests, and a full reset of the window). */
export function resetPlayed(): void {
  played.clear()
}

export interface EnterOptions {
  /** Position in a staggered group. */
  index?: number
  /** When set, the element plays only the first time this key is seen. */
  once?: string
  /** `reveal` unblurs a landed value; the default rises a block. */
  kind?: 'enter' | 'reveal'
}

/**
 * `v-enter` plays the arrival of an element once, at mount: `v-enter="{ index: 2 }"`.
 * A CSS animation on insertion runs exactly once, so nothing repeats on re-render.
 */
export const vEnter: Directive<HTMLElement, EnterOptions | undefined> = {
  mounted(el, { value }) {
    if (value?.once && !playOnce(value.once)) return
    el.classList.add(value?.kind === 'reveal' ? 'm-reveal' : 'm-enter')
    el.style.setProperty('--d', staggerDelay(value?.index ?? 0))
  },
}

/**
 * `v-draw` draws an SVG path once, at mount (`pathLength` is set to 1 so the dash maths
 * does not depend on the path's real length): `v-draw` or `v-draw="{ once: 'cpu-spark' }"`.
 */
export const vDraw: Directive<SVGGeometryElement, { once?: string; delay?: string } | undefined> = {
  mounted(el, { value }) {
    if (value?.once && !playOnce(value.once)) return
    el.setAttribute('pathLength', '1')
    el.classList.add('m-draw')
    if (value?.delay) el.style.setProperty('--d', value.delay)
  },
}
