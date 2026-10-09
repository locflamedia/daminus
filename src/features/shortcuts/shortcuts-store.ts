// Whether the shortcuts sheet is open. A menu or the palette calls `show()`.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useShortcutsStore = defineStore('shortcuts', () => {
  const open = ref(false)
  function show() {
    open.value = true
  }
  function close() {
    open.value = false
  }
  function toggle() {
    open.value = !open.value
  }
  return { open, show, close, toggle }
})
