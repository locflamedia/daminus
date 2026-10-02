import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { TOAST_MS, UNDO_MS, useToastStore } from './toasts'

beforeEach(() => setActivePinia(createPinia()))

describe('toast store', () => {
  it('pushes with the neutral tone and the 5 s default', () => {
    const store = useToastStore()
    const id = store.push({ title: 'Fix copied to the clipboard' })
    expect(store.toasts).toEqual([
      { id, tone: 'neutral', title: 'Fix copied to the clipboard', duration: TOAST_MS },
    ])
    expect(TOAST_MS).toBe(5000)
    expect(UNDO_MS).toBe(8000)
  })

  it('keeps order, gives distinct ids, and dismisses one by id', () => {
    const store = useToastStore()
    const a = store.push({ title: 'a' })
    const b = store.push({ title: 'b', tone: 'ok', detail: '2 new issues', duration: 0 })
    expect(a).not.toBe(b)
    store.dismiss(a)
    expect(store.toasts.map((t) => t.title)).toEqual(['b'])
    store.dismiss(999)
    expect(store.toasts).toHaveLength(1)
    store.clear()
    expect(store.toasts).toEqual([])
  })
})
