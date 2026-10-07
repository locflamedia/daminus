// Drag and drop of a leftover onto a project card. The menu stays the way that works from the
// keyboard; this only adds the pointer path. The key of the dragged leftover is kept here, so a
// card knows whether what is over it is one of ours (the drag data of other things is ignored).
import { ref } from 'vue'

const dragging = ref<string | null>(null)

export function useLooseDrag() {
  return {
    dragging,
    start(event: DragEvent, key: string) {
      dragging.value = key
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', key)
      }
    },
    end() {
      dragging.value = null
    },
  }
}
