// Whether the command palette is open, and whether the shortcut (no motion) opened it.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePaletteStore = defineStore('palette', () => {
  const open = ref(false)
  const instant = ref(false)
  /** `fromKeyboard`: the palette appears at once; a click on the Search row fades it in. */
  function show(fromKeyboard = false) {
    instant.value = fromKeyboard
    open.value = true
  }
  function close() {
    open.value = false
  }
  return { open, instant, show, close }
})
