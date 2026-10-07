// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useToastStore } from '@/stores/toasts'
import UiToast from './UiToast.vue'
import UiToastHost from './UiToastHost.vue'

let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('UiToast', () => {
  it('is a polite status with a mark, a title and one line of detail', () => {
    wrapper = mount(UiToast, {
      props: { tone: 'ok', title: 'Scan #43 finished', detail: '2 new issues, 1 resolved' },
    })
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.get('.title').text()).toBe('Scan #43 finished')
    expect(wrapper.get('.detail').text()).toBe('2 new issues, 1 resolved')
    expect(wrapper.get('.mark').classes()).toContain('mark-ok')
    expect(wrapper.find('.mark svg').exists()).toBe(true)
  })

  it('sets a one-line confirmation in regular weight and a titled toast in medium', () => {
    wrapper = mount(UiToast, { props: { tone: 'neutral', title: 'Fix copied to the clipboard' } })
    expect(wrapper.get('.title').classes()).toContain('solo')
    wrapper.unmount()
    wrapper = mount(UiToast, { props: { title: 'Scan #43 finished', detail: '2 new issues' } })
    expect(wrapper.get('.title').classes()).not.toContain('solo')
  })

  it('draws the tick on a 10 px grid, as the scan step does', () => {
    wrapper = mount(UiToast, { props: { tone: 'ok', title: 'Done' } })
    const tick = wrapper.get('.mark svg')
    expect(tick.attributes('viewBox')).toBe('0 0 10 10')
    expect(tick.get('path').attributes('d')).toBe('m2.2 5.2 1.8 1.8 3.8-4')
  })

  it('draws a failure as a plain rose dot, with no tick', () => {
    wrapper = mount(UiToast, { props: { tone: 'crit', title: "Claude didn't answer" } })
    expect(wrapper.get('.mark').classes()).toContain('mark-crit')
    expect(wrapper.find('.mark svg').exists()).toBe(false)
  })

  it('hides itself after its duration and not before', () => {
    wrapper = mount(UiToast, { props: { title: 'Fix copied to the clipboard', duration: 5000 } })
    vi.advanceTimersByTime(4999)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('runs its bar over the same time', () => {
    wrapper = mount(UiToast, { props: { title: 'x', duration: 8000 } })
    expect(wrapper.get('.timer-fill').attributes('style')).toContain('animation-duration: 8000ms')
  })

  it('stays until dismissed when the duration is 0, with no bar', () => {
    wrapper = mount(UiToast, { props: { title: 'x', duration: 0 } })
    vi.advanceTimersByTime(60_000)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    expect(wrapper.find('.timer').exists()).toBe(false)
  })

  it('pauses on hover and resumes with what is left', async () => {
    wrapper = mount(UiToast, { props: { title: 'x', duration: 5000 } })
    vi.advanceTimersByTime(3000)
    await wrapper.trigger('pointerenter')
    expect(wrapper.get('.timer-fill').classes()).toContain('paused')
    vi.advanceTimersByTime(60_000)
    expect(wrapper.emitted('dismiss')).toBeUndefined()

    await wrapper.trigger('pointerleave')
    expect(wrapper.get('.timer-fill').classes()).not.toContain('paused')
    vi.advanceTimersByTime(1999)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('pauses while focus is inside, and resumes when it leaves', async () => {
    wrapper = mount(UiToast, {
      props: { title: 'x', duration: 1000, action: { label: 'Undo', run: () => {} } },
    })
    await wrapper.trigger('focusin')
    vi.advanceTimersByTime(5000)
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    await wrapper.trigger('focusout', { relatedTarget: null })
    vi.advanceTimersByTime(1000)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('offers one action that runs and closes the toast', async () => {
    const run = vi.fn()
    wrapper = mount(UiToast, {
      props: { title: 'Project removed', action: { label: 'Undo', run } },
    })
    const action = wrapper.get('button.action')
    expect(action.text()).toBe('Undo')
    await action.trigger('click')
    expect(run).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('renders title and detail as text', () => {
    wrapper = mount(UiToast, {
      props: { title: '<img src=x onerror=alert(1)>', detail: '<b>x</b>' },
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.detail b').exists()).toBe(false)
    expect(wrapper.get('.title').text()).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('UiToastHost', () => {
  it('shows what the store holds, newest last, and removes a toast when it hides', async () => {
    const store = useToastStore()
    wrapper = mount(UiToastHost)
    store.push({ title: 'first', duration: 1000 })
    store.push({ title: 'second', duration: 0, tone: 'ok' })
    await nextTick()
    expect(wrapper.findAll('.title').map((t) => t.text())).toEqual(['first', 'second'])

    vi.advanceTimersByTime(1000)
    await nextTick()
    expect(store.toasts.map((t) => t.title)).toEqual(['second'])
    expect(wrapper.findAll('.title').map((t) => t.text())).toEqual(['second'])
  })

  it('runs an action from the store and closes that toast only', async () => {
    const store = useToastStore()
    const run = vi.fn()
    wrapper = mount(UiToastHost)
    store.push({ title: 'Project removed', duration: 8000, action: { label: 'Undo', run } })
    store.push({ title: 'other', duration: 0 })
    await nextTick()
    await wrapper.get('button.action').trigger('click')
    expect(run).toHaveBeenCalledTimes(1)
    expect(store.toasts.map((t) => t.title)).toEqual(['other'])
  })
})
