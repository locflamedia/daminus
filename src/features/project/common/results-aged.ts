// Results over a day old keep their values, but the screen stops comparing and colouring them
// until a fresh scan: deltas are left out and severity colours turn neutral. The screen that
// knows the age provides it; any card under it asks.
import { type InjectionKey, type Ref, computed, inject, provide } from 'vue'

const AGED: InjectionKey<Readonly<Ref<boolean>>> = Symbol('results-aged')

export function provideResultsAged(aged: Readonly<Ref<boolean>>): void {
  provide(AGED, aged)
}

/** Whether the results on screen are over a day old; `false` outside a result screen. */
export function useResultsAged(): Readonly<Ref<boolean>> {
  return inject(
    AGED,
    computed(() => false),
    true,
  )
}
