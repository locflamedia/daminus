import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAiThreadStore } from './ai-thread'

const whole = { kind: 'whole' } as const
const project = { kind: 'project', id: 'kho-hang' } as const

beforeEach(() => setActivePinia(createPinia()))

describe('AI thread', () => {
  it('keeps one thread per scope, in memory, with earlier answers intact', () => {
    const thread = useAiThreadStore()
    const a = thread.begin(whole, 'one', 12, 1000)
    thread.write(a, { summary: 'A', status: 'done' }, 3000)
    thread.begin(whole, 'two', 12, 4000)
    thread.begin(project, 'other', 12, 5000)
    expect(thread.turnsOf(whole).map((t) => t.question)).toEqual(['one', 'two'])
    expect(thread.turnsOf(project)).toHaveLength(1)
    expect(thread.turnsOf(whole)[0]?.elapsedMs).toBe(2000)
    expect(thread.lastAnswered?.question).toBe('one')
  })

  it('does not change a turn that has ended', () => {
    const thread = useAiThreadStore()
    const id = thread.begin(whole, 'q', null, 0)
    thread.write(id, { status: 'cancelled' }, 10)
    thread.write(id, { summary: 'late', status: 'streaming' }, 20)
    const turn = thread.latest(whole)
    expect(turn?.status).toBe('cancelled')
    expect(turn?.summary).toBe('')
    expect(thread.activeId).toBeNull()
  })

  it('opens, closes and toggles the drawer on a scope', () => {
    const thread = useAiThreadStore()
    thread.toggleDrawer(project)
    expect(thread.drawerOpen).toBe(true)
    expect(thread.drawerScope).toEqual(project)
    thread.toggleDrawer(whole)
    expect(thread.drawerOpen).toBe(false)
  })

  it('forgets one thread on clear', () => {
    const thread = useAiThreadStore()
    thread.begin(whole, 'q', null)
    thread.begin(project, 'p', null)
    thread.clear(whole)
    expect(thread.turnsOf(whole)).toEqual([])
    expect(thread.turnsOf(project)).toHaveLength(1)
  })
})
