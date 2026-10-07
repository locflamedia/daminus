// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { copyText } from '@/api'
import { i18n, setI18nLocale } from '@/i18n'
import UiCountBadge from './UiCountBadge.vue'
import UiDeltaPill from './UiDeltaPill.vue'
import UiDomainLink from './UiDomainLink.vue'
import UiEmptyValue from './UiEmptyValue.vue'
import UiHostChip from './UiHostChip.vue'
import UiInlineCode from './UiInlineCode.vue'
import UiMonogram from './UiMonogram.vue'
import { MONOGRAM_TINTS } from './monogram-tints'
import UiPathChip from './UiPathChip.vue'
import UiProgressRing from './UiProgressRing.vue'
import UiSectionHeader from './UiSectionHeader.vue'
import UiSeverityTile from './UiSeverityTile.vue'
import UiStatusDot from './UiStatusDot.vue'
import UiTimestamp from './UiTimestamp.vue'

vi.mock('@/api', () => ({ copyText: vi.fn() }))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(copyText).mockReset().mockResolvedValue(undefined)
  setActivePinia(createPinia())
  setI18nLocale('en')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  document.body.replaceChildren()
})

function make(component: object, props: Record<string, unknown> = {}, slot?: string) {
  wrapper = mount(component, {
    props,
    slots: slot ? { default: slot } : undefined,
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return wrapper
}

describe('UiHostChip', () => {
  it('shows the server icon and the alias in mono', () => {
    make(UiHostChip, { host: 'vps-sg-1' })
    expect(wrapper!.find('svg.icon').exists()).toBe(true)
    expect(wrapper!.get('.name').text()).toBe('vps-sg-1')
  })

  it('swaps the icon for a hollow dot when the host is unreachable, and says so in words', () => {
    make(UiHostChip, { host: 'vps-hn-3', reachable: false, unreachableLabel: 'Unreachable' })
    expect(wrapper!.find('svg.icon').exists()).toBe(false)
    expect(wrapper!.find('.hollow').exists()).toBe(true)
    expect(wrapper!.get('.sr-only').text()).toBe('Unreachable')
  })

  it('renders the host as text', () => {
    make(UiHostChip, { host: '<img src=x onerror=alert(1)>' })
    expect(wrapper!.find('img').exists()).toBe(false)
  })
})

describe('UiPathChip', () => {
  const path = '/var/www/kho-hang/storage/logs'

  it('cuts the middle and keeps root and leaf', () => {
    make(UiPathChip, { path })
    expect(wrapper!.get('.text').text()).toBe('/var/www/…/storage/logs')
  })

  it('shows a short path whole, and copies the full path', async () => {
    make(UiPathChip, { path: '/srv/app' })
    expect(wrapper!.get('.text').text()).toBe('/srv/app')
    wrapper!.unmount()
    make(UiPathChip, { path })
    await wrapper!.get('button.copy').trigger('click')
    expect(copyText).toHaveBeenCalledWith(path)
    expect(wrapper!.emitted('copied')).toEqual([[path]])
  })

  it('names its copy button, and has none when it is not copyable', () => {
    make(UiPathChip, { path })
    expect(wrapper!.get('button.copy').attributes('aria-label')).toBe('Copy path')
    wrapper!.unmount()
    make(UiPathChip, { path, copyable: false })
    expect(wrapper!.find('button').exists()).toBe(false)
  })
})

describe('UiDomainLink', () => {
  it('opens through the owner, never by navigating the webview', async () => {
    make(UiDomainLink, { domain: 'kho-hang.vn' })
    const link = wrapper!.get('a')
    expect(link.attributes('href')).toBe('https://kho-hang.vn')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(wrapper!.emitted('open')).toEqual([['https://kho-hang.vn']])
  })

  it.each([
    [41, 'ssl-ok', 'SSL 41 d'],
    [13, 'ssl-warn', 'SSL 13 d'],
    [2, 'ssl-crit', 'SSL 2 d'],
    [-4, 'ssl-crit', 'SSL expired'],
  ])('shows %i days of certificate as %s', (days, cls, text) => {
    make(UiDomainLink, { domain: 'a.b', sslDays: days })
    expect(wrapper!.get('.ssl').classes()).toContain(cls)
    expect(wrapper!.get('.ssl').text()).toBe(text)
  })

  it('shows no certificate part without a day count', () => {
    make(UiDomainLink, { domain: 'a.b' })
    expect(wrapper!.find('.ssl').exists()).toBe(false)
  })
})

describe('UiDeltaPill', () => {
  it('draws the arrow of its direction and the tone of its meaning', () => {
    make(UiDeltaPill, { direction: 'up', tone: 'warn' }, '1.1 GB')
    expect(wrapper!.classes()).toContain('tone-warn')
    expect(wrapper!.text()).toBe('1.1 GB')
    wrapper!.unmount()
    make(UiDeltaPill, { direction: 'flat' }, '0')
    expect(wrapper!.classes()).toContain('tone-neutral')
  })
})

describe('UiTimestamp', () => {
  const now = Date.parse('2026-09-26T12:00:00Z')

  it('stays ink-3 within a day and turns warn after 24 hours', () => {
    make(UiTimestamp, { at: '2026-09-26T11:58:00Z', now })
    expect(wrapper!.get('time').classes()).not.toContain('stale')
    wrapper!.unmount()
    make(UiTimestamp, { at: '2026-09-23T12:00:00Z', now })
    expect(wrapper!.get('time').classes()).toContain('stale')
  })

  it('is a time element with a machine value', () => {
    make(UiTimestamp, { at: '2026-09-26T11:58:00Z', now })
    expect(wrapper!.get('time').attributes('datetime')).toBe('2026-09-26T11:58:00.000Z')
  })
})

describe('UiCountBadge', () => {
  it('is not drawn at zero', () => {
    make(UiCountBadge, { count: 0 })
    expect(wrapper!.find('.badge').exists()).toBe(false)
  })

  it('caps at 99+ and keeps the number as text', () => {
    make(UiCountBadge, { count: 42, tone: 'crit' })
    expect(wrapper!.text()).toBe('42')
    expect(wrapper!.classes()).toContain('tone-crit')
    wrapper!.unmount()
    make(UiCountBadge, { count: 150 })
    expect(wrapper!.text()).toBe('99+')
  })
})

describe('UiMonogram', () => {
  it('shows the first letter in capitals, or an icon when given one', () => {
    make(UiMonogram, { name: 'kho-hang', size: 24, tint: 'amber' })
    expect(wrapper!.text()).toBe('K')
    expect(wrapper!.classes()).toEqual(expect.arrayContaining(['size-24', 'tint-amber']))
    wrapper!.unmount()
    make(UiMonogram, { icon: 'cart', size: 36 })
    expect(wrapper!.find('svg.icon').attributes('width')).toBe('18')
    expect(wrapper!.text()).toBe('')
  })

  it('draws the 40 px tile of a project card head with a 20 px glyph', () => {
    make(UiMonogram, { icon: 'cart', size: 40, tint: 'teal' })
    expect(wrapper!.classes()).toEqual(expect.arrayContaining(['size-40', 'tint-teal']))
    expect(wrapper!.find('svg.icon').attributes('width')).toBe('20')
  })

  it('has one class and one token pair for each of the eight project colours', () => {
    for (const tint of MONOGRAM_TINTS) {
      make(UiMonogram, { name: 'x', tint })
      expect(wrapper!.classes()).toContain(`tint-${tint}`)
      wrapper!.unmount()
    }
    expect(MONOGRAM_TINTS).toEqual([
      'blue',
      'lilac',
      'rose',
      'amber',
      'green',
      'teal',
      'coral',
      'slate',
    ])
  })

  it('takes the first character of a name written with accents or an emoji-free script', () => {
    make(UiMonogram, { name: 'đặt-lịch' })
    expect(wrapper!.text()).toBe('Đ')
  })
})

describe('UiSeverityTile', () => {
  it.each([
    ['crit', 'M5.5 1.8'],
    ['warn', 'M8 2.2'],
    ['ok', 'M8 2a6'],
    ['locked', 'M5 7h6'],
  ] as const)('draws the shape of %s', (kind, start) => {
    make(UiSeverityTile, { kind })
    expect(wrapper!.get('path').attributes('d')?.startsWith(start)).toBe(true)
  })
})

describe('UiProgressRing', () => {
  it('reports its value as a progressbar', () => {
    make(UiProgressRing, { value: 0.62, label: 'vps-sg-1' })
    const ring = wrapper!.get('svg')
    expect(ring.attributes('role')).toBe('progressbar')
    expect(ring.attributes('aria-valuenow')).toBe('62')
    expect(ring.attributes('aria-label')).toBe('vps-sg-1')
  })

  it('draws 62 % of the 2 pi r circumference, and clamps', () => {
    make(UiProgressRing, { value: 0.62 })
    const dash = wrapper!.get('.fill').attributes('stroke-dasharray')
    expect(dash).toBe('31.2 50.3')
    wrapper!.unmount()
    make(UiProgressRing, { value: 4 })
    expect(wrapper!.get('svg').attributes('aria-valuenow')).toBe('100')
    wrapper!.unmount()
    make(UiProgressRing, { value: -1 })
    expect(wrapper!.get('svg').attributes('aria-valuenow')).toBe('0')
  })
})

describe('UiInlineCode', () => {
  it('copies the whole token on a click, without hidden characters', async () => {
    const hidden = `ssh-add${String.fromCharCode(0x200b)} ~/.ssh/id_ed25519`
    make(UiInlineCode, { text: hidden })
    expect(wrapper!.text()).toBe('ssh-add ~/.ssh/id_ed25519')
    await wrapper!.trigger('click')
    expect(copyText).toHaveBeenCalledWith('ssh-add ~/.ssh/id_ed25519')
    await nextTick()
    expect(wrapper!.classes()).toContain('done')
  })
})

describe('UiEmptyValue', () => {
  it('is a dash with the reason written out for screen readers', () => {
    make(UiEmptyValue, { reason: 'permission' })
    expect(wrapper!.get('[aria-hidden="true"]').text()).toBe('—')
    expect(wrapper!.get('.sr-only').text()).toBe('Needs permission')
    expect(wrapper!.find('svg.icon').exists()).toBe(true)
  })

  it('draws a dashed circle for "not set up", and no mark for a plain gap', () => {
    make(UiEmptyValue, { reason: 'not-set-up' })
    expect(wrapper!.get('svg.icon').attributes('stroke-dasharray')).toBe('2 2')
    wrapper!.unmount()
    make(UiEmptyValue, { reason: 'none', hint: 'No data yet' })
    expect(wrapper!.find('svg.icon').exists()).toBe(false)
    expect(wrapper!.get('.sr-only').text()).toBe('No data yet')
  })
})

describe('UiSectionHeader', () => {
  it('shows the icon tile, title and sub line', () => {
    make(UiSectionHeader, { icon: 'database', title: 'Largest tables', sub: 'kho_prod' })
    expect(wrapper!.get('.title').text()).toBe('Largest tables')
    expect(wrapper!.get('.sub').text()).toBe('kho_prod')
    expect(wrapper!.find('button.more').exists()).toBe(false)
  })

  it('reports the overflow button as the anchor of a menu', async () => {
    make(UiSectionHeader, { icon: 'database', title: 'Largest tables', overflow: true })
    const button = wrapper!.get('button.more')
    expect(button.attributes('aria-label')).toBe('More actions')
    await button.trigger('click')
    expect(wrapper!.emitted('more')?.[0]?.[0]).toBe(button.element)
  })
})

describe('UiStatusDot', () => {
  it.each(['crit', 'warn', 'ok', 'unknown'] as const)('draws %s as an 8 px dot', (state) => {
    make(UiStatusDot, { state })
    expect(wrapper!.classes()).toContain(`state-${state}`)
  })

  it('adds the soft halo only when asked, and the pulse only on critical', () => {
    make(UiStatusDot, { state: 'crit', halo: true, pulse: true })
    expect(wrapper!.classes()).toEqual(expect.arrayContaining(['halo', 'm-halo']))
    wrapper!.unmount()
    make(UiStatusDot, { state: 'warn', pulse: true })
    expect(wrapper!.classes()).not.toContain('m-halo')
  })

  it('turns a small ring while it is being read', () => {
    make(UiStatusDot, { state: 'reading' })
    expect(wrapper!.classes()).toContain('spinner')
  })
})
