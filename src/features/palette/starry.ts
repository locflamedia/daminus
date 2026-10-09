// The painting under the window, for this session only: a module-level flag, never saved, so a
// restart brings the plain window back.
import { ref } from 'vue'

export const starryOn = ref(false)

/** Turns it on; asking again changes nothing. */
export function activateStarry() {
  starryOn.value = true
}

export function resetStarry() {
  starryOn.value = false
}
