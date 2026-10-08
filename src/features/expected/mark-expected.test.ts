// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExpectedRule, Item } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useHistoryStore } from '@/stores/history'
import { secItem } from '@/testing/security-items'
import ExpectedBroken from './ExpectedBroken.vue'
import ExpectedUndo from './ExpectedUndo.vue'
import FindingActions from './FindingActions.vue'
import MarkExpectedForm from './MarkExpectedForm.vue'

const php = (level: 'crit' | 'warn' = 'crit'): Item =>
  secItem({
    check: 'sec.upload_php',
    target: '/srv/booking/storage/app/public/uploads/index.php',
    level: { level },
    value: 1,
    data: { total: 1, mtime: 1, size: 52 },
  })

let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  clearMocks()
  document.body.replaceChildren()
})

function form(item: Item, level: 'crit' | 'warn', refused: string | null = null) {
  wrapper = mount(MarkExpectedForm, {
    props: { item, level, busy: false, refused },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return wrapper
}

const segment = (label: string) =>
  [...document.body.querySelectorAll('.segment')].find((b) => b.textContent?.trim() === label) as
    HTMLButtonElement | undefined

describe('Mark as expected popover', () => {
  it('starts as the board draws it: meant to be there, this file as it is now, 30 d', () => {
    form(php(), 'crit')
    const radios = [...document.body.querySelectorAll<HTMLInputElement>('input[type=radio]')]
    expect(radios.map((r) => r.checked)).toEqual([true, false, false])
    expect(document.body.textContent).toContain('It is meant to be there')
    expect(document.body.textContent).toContain('The check is wrong here')
    expect(segment('This file, as it is now')?.classList.contains('on')).toBe(true)
    expect(segment('30 d')?.classList.contains('on')).toBe(true)
    expect(document.body.textContent).toContain('sec.upload_php')
    expect(document.body.textContent).toContain('Saved in projects.json · shown in History')
  })

  it('locks the evidence switch on for a critical result and says so', () => {
    form(php(), 'crit')
    const box = document.body.querySelector<HTMLInputElement>('input[type=checkbox]')
    expect(box?.checked).toBe(true)
    expect(box?.disabled).toBe(true)
    expect(document.body.textContent).toContain('always on for critical')
  })

  it('does not take Never for a critical result, or for an accepted risk', async () => {
    const view = form(php(), 'crit')
    segment('Never')?.click()
    await view.vm.$nextTick()
    expect(segment('30 d')?.classList.contains('on')).toBe(true)

    view.unmount()
    const warn = form(php('warn'), 'warn')
    segment('Never')?.click()
    await warn.vm.$nextTick()
    expect(segment('Never')?.classList.contains('on')).toBe(true)
    const risk = document.body.querySelectorAll<HTMLInputElement>('input[type=radio]')[1]
    risk?.dispatchEvent(new Event('change'))
    await warn.vm.$nextTick()
    expect(segment('30 d')?.classList.contains('on')).toBe(true)
  })

  it('sends what was chosen, with the note trimmed by Rust and capped here', async () => {
    const view = form(php('warn'), 'warn')
    const note = document.body.querySelector<HTMLInputElement>('input[type=text]')!
    note.value = 'Laravel silence file'
    note.dispatchEvent(new Event('input'))
    segment('90 d')?.click()
    await view.vm.$nextTick()
    document.body.querySelector('form')?.dispatchEvent(new Event('submit'))
    await view.vm.$nextTick()
    expect(view.emitted('submit')?.[0]).toEqual([
      { reason: 'intended', covers: 'as_it_is', review: '90', note: 'Laravel silence file' },
    ])
  })

  it('submits with ⌘⏎ and cancels with the button', async () => {
    const view = form(php('warn'), 'warn')
    document.body
      .querySelector('form')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    expect(view.emitted('submit')).toHaveLength(1)
    const cancel = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancel',
    )
    cancel?.click()
    expect(view.emitted('cancel')).toHaveLength(1)
  })

  it('names what Rust refused, in words', () => {
    form(php(), 'crit', 'rule_needs_date')
    expect(document.body.textContent).toContain('Pick a day to check again.')
    wrapper?.unmount()
    form(php(), 'crit', 'something_new')
    expect(document.body.textContent).toContain('Daminus could not save the rule.')
  })

  it('speaks Vietnamese', () => {
    setI18nLocale('vi')
    form(php(), 'crit')
    expect(document.body.textContent).toContain('Cố ý để như vậy')
    expect(document.body.textContent).toContain('luôn bật với mức nghiêm trọng')
  })
})

describe('the ⋯ of a finding', () => {
  function actions(item: Item) {
    wrapper = mount(FindingActions, { props: { item }, global: { plugins: [i18n] } })
    return wrapper
  }

  it('is there for an open critical or warning result', () => {
    expect(actions(php()).find('button.more').exists()).toBe(true)
  })

  it('is not there for exposed files, a result that is fine, or one already expected', () => {
    const exposed = secItem({
      check: 'url.exposed',
      target: 'https://khohang.vn/.env',
      level: { level: 'crit' },
    })
    const fine = secItem({ check: 'sec.ports', target: '0.0.0.0:80', level: { level: 'ok' } })
    const expected = secItem({
      check: 'sec.ports',
      target: '0.0.0.0:6379',
      level: { level: 'warn' },
      disposition: { kind: 'expected', rule: 'r1' },
    })
    for (const item of [exposed, fine, expected]) {
      expect(actions(item).find('button.more').exists()).toBe(false)
      wrapper?.unmount()
    }
  })

  it('offers only Mark as expected for a result that has no file path', () => {
    const port = secItem({ check: 'sec.ports', target: '0.0.0.0:6379', level: { level: 'warn' } })
    expect(actions(port).find('button.more').exists()).toBe(true)
  })
})

describe('after marking', () => {
  it('Undo takes the rule out', async () => {
    const calls: string[] = []
    mockCommands((cmd) => {
      calls.push(cmd)
      return cmd === 'rules_remove'
        ? true
        : cmd === 'history_list'
          ? { scans: [], keep: 20, bytes: 0 }
          : []
    })
    wrapper = mount(ExpectedUndo, {
      props: { ruleId: 'r1', check: 'sec.upload_php' },
      global: { plugins: [i18n] },
    })
    await wrapper.get('button').trigger('click')
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toContain('rules_remove')
    expect(wrapper.get('button').text()).toBe('Undo')
  })

  it('a rule whose evidence changed says so and quotes the note', () => {
    const rule: ExpectedRule = {
      id: 'r1',
      host: 'vps-sg-2',
      check: 'sec.upload_php',
      target: '/x',
      reason: 'intended',
      note: 'Laravel silence file, blocks dir listing.',
    } as ExpectedRule
    useHistoryStore().rules = [rule]
    const broken = { ...php(), rule_broken: 'r1' } as Item
    wrapper = mount(ExpectedBroken, { props: { items: [broken] }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('Was expected, now different')
    expect(wrapper.text()).toContain('Your note: “Laravel silence file, blocks dir listing.”')
  })

  it('draws nothing for a result whose rule still holds', () => {
    wrapper = mount(ExpectedBroken, { props: { items: [php()] }, global: { plugins: [i18n] } })
    expect(wrapper.find('.broken').exists()).toBe(false)
  })
})
