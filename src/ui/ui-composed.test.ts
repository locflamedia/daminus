// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { i18n, setI18nLocale } from '@/i18n'
import type { TopologyInput } from '@/lib/topology'
import UiAskComposer from './UiAskComposer.vue'
import UiAskThread from './UiAskThread.vue'
import UiBanner from './UiBanner.vue'
import UiChipMorph from './UiChipMorph.vue'
import UiCommandPalette, { type PaletteGroup } from './UiCommandPalette.vue'
import UiEmptyState from './UiEmptyState.vue'
import UiFindingCard from './UiFindingCard.vue'
import UiFindingRow from './UiFindingRow.vue'
import UiMetricTile from './UiMetricTile.vue'
import UiPayloadViewer from './UiPayloadViewer.vue'
import UiProgressBar from './UiProgressBar.vue'
import UiProjectCard from './UiProjectCard.vue'
import UiProviderRow from './UiProviderRow.vue'
import UiRoll from './UiRoll.vue'
import UiScanStep from './UiScanStep.vue'
import UiSearchField from './UiSearchField.vue'
import UiTopology from './UiTopology.vue'

vi.mock('@/api', () => ({ copyText: vi.fn().mockResolvedValue(undefined) }))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
})

function make(component: object, props: Record<string, unknown> = {}, slots = {}) {
  wrapper = mount(component, {
    props,
    slots,
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return wrapper
}

describe('UiMetricTile', () => {
  const series = [310, 322, 305, 318, 312, 309, 320, 314, 312]

  it('puts the label and the delta on one line, then the value with its unit', () => {
    make(UiMetricTile, { label: 'Latency', delta: 'p50', value: '148', unit: 'ms', series })
    expect(wrapper!.get('.label').text()).toBe('Latency')
    expect(wrapper!.get('.delta').text()).toBe('p50')
    expect(wrapper!.get('.value').text()).toBe('148 ms')
    expect(wrapper!.find('.spark svg').exists()).toBe(true)
  })

  it.each([
    ['warn', 'delta-warn'],
    ['crit', 'delta-crit'],
    ['stale', 'delta-stale'],
  ])('colours the delta of a %s tile', (state, cls) => {
    make(UiMetricTile, { label: 'DB', delta: '+1.1 GB', value: '8.43', series, state })
    expect(wrapper!.get('.delta').classes()).toContain(cls)
  })

  it('draws the stale line dashed', () => {
    make(UiMetricTile, { label: 'Files', value: '1.24', series, state: 'stale' })
    expect(wrapper!.get('path.line').attributes('stroke-dasharray')).toBe('3 4')
  })

  it('shows a dash with a padlock and no line when the check needs permission', () => {
    make(UiMetricTile, {
      label: 'Containers',
      state: 'needs-permission',
      note: 'Needs permission',
      series,
    })
    expect(wrapper!.get('.value').text()).toContain('—')
    expect(wrapper!.find('.spark svg').exists()).toBe(false)
    expect(wrapper!.get('.note').text()).toBe('Needs permission')
    expect(wrapper!.get('.value .sr-only').text()).toBe('Needs permission')
  })

  it('draws no line from fewer than three scans, and keeps the layout', () => {
    make(UiMetricTile, { label: 'Latency', value: '1', series: [1, 2] })
    expect(wrapper!.find('.spark svg').exists()).toBe(false)
    expect(wrapper!.find('.spark').exists()).toBe(true)
  })

  it('renders hostile text as text', () => {
    make(UiMetricTile, { label: '<img src=x onerror=alert(1)>', value: '<b>1</b>' })
    expect(wrapper!.find('img').exists()).toBe(false)
    expect(wrapper!.find('b').exists()).toBe(false)
  })
})

describe('UiRoll', () => {
  it('shows the value, and rolls to a new one without a count-up', async () => {
    make(UiRoll, { text: '7.36' })
    expect(wrapper!.text()).toBe('7.36')
    await wrapper!.setProps({ text: '8.43' })
    await nextTick()
    expect(wrapper!.text()).toContain('8.43')
  })
})

describe('UiProgressBar', () => {
  it('is a progressbar whose fill follows the value', () => {
    make(UiProgressBar, { value: 0.62, label: 'vps-sg-1' })
    const bar = wrapper!.get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('62')
    expect(wrapper!.get('.fill').attributes('style')).toContain('width: 62%')
  })

  it('is 4 px as `sm` and 6 px as `md`', () => {
    make(UiProgressBar, { value: 0.2, size: 'md' })
    expect(wrapper!.classes()).toContain('size-md')
  })
})

describe('UiScanStep', () => {
  it('draws a running step with the command in mono and a progress bar', () => {
    make(UiScanStep, {
      state: 'running',
      title: 'vps-sg-1',
      detail: 'du -sk /var/www/kho-hang',
      mono: true,
      progress: 0.62,
      duration: '1.4 s',
      stateLabel: 'Running',
    })
    expect(wrapper!.get('.detail').classes()).toContain('mono')
    expect(wrapper!.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('62')
    expect(wrapper!.get('.duration').text()).toBe('1.4 s')
    expect(wrapper!.find('svg.ring').exists()).toBe(true)
    expect(wrapper!.get('.sr-only').text()).toBe('Running')
  })

  it('marks done with a tick and failed with a cross and a rose error', () => {
    make(UiScanStep, { state: 'done', title: 'URL checks' })
    expect(wrapper!.get('.disc svg path').attributes('d')).toBe('m2.2 5.2 1.8 1.8 3.8-4')
    wrapper!.unmount()
    make(UiScanStep, { state: 'failed', title: 'vps-hn-3', detail: 'ssh: connect timed out' })
    expect(wrapper!.get('.disc svg path').attributes('d')).toBe('m3 3 4 4M7 3 3 7')
    expect(wrapper!.get('.detail').classes()).toContain('crit')
  })

  it('leaves a waiting step grey with no mark glyph and no duration', () => {
    make(UiScanStep, { state: 'waiting', title: 'Compare with #41', detail: 'Waiting' })
    expect(wrapper!.find('.disc svg').exists()).toBe(false)
    expect(wrapper!.find('.duration').exists()).toBe(false)
  })

  it('shades a zebra row, and shows no progress bar unless it is running', () => {
    make(UiScanStep, { state: 'done', title: 'a', shaded: true, progress: 1 })
    expect(wrapper!.classes()).toContain('shaded')
    expect(wrapper!.find('[role="progressbar"]').exists()).toBe(false)
  })
})

describe('UiBanner', () => {
  it('is a 56 px warn row with a glyph tile, a title and a line', () => {
    make(UiBanner, { title: 'Disk full in about 6 days', text: 'at 1.1 GB of growth per day' })
    expect(wrapper!.classes()).toEqual(expect.arrayContaining(['row-status', 'tone-warn']))
    expect(wrapper!.attributes('role')).toBe('note')
    expect(wrapper!.text()).toContain('at 1.1 GB of growth per day')
  })

  it('is an alert when an error just happened', () => {
    make(UiBanner, { title: 'x', tone: 'crit', alert: true })
    expect(wrapper!.attributes('role')).toBe('alert')
  })
})

describe('UiEmptyState', () => {
  it('has the icon tile, a title, one sentence and one action', () => {
    make(
      UiEmptyState,
      { title: 'No projects yet', text: 'Daminus reads the hosts in your ~/.ssh/config.' },
      { default: '<button>Add servers</button>' },
    )
    expect(wrapper!.get('.tile svg').attributes('width')).toBe('28')
    expect(wrapper!.get('.title').text()).toBe('No projects yet')
    expect(wrapper!.get('.action button').text()).toBe('Add servers')
  })
})

describe('UiSearchField', () => {
  it('is a labelled search input with a key hint', () => {
    make(UiSearchField, { modelValue: '', label: 'Search', hint: '⌘K', placeholder: 'Search' })
    const input = wrapper!.get('input')
    expect(input.attributes('type')).toBe('search')
    expect(wrapper!.get('label').text()).toBe('Search')
    expect(wrapper!.get('kbd').text()).toBe('⌘K')
  })

  it('shows a clear button once there is text, and clears', async () => {
    make(UiSearchField, {
      modelValue: 'kho',
      label: 'Search',
      clearable: true,
      'onUpdate:modelValue': (v: string) => wrapper!.setProps({ modelValue: v }),
    })
    await wrapper!.get('button.clear').trigger('click')
    expect((wrapper!.props() as Record<string, unknown>).modelValue).toBe('')
  })
})

describe('UiCommandPalette', () => {
  const groups: PaletteGroup[] = [
    {
      id: 'projects',
      label: 'Projects',
      items: [
        { id: 'kho-hang', label: 'kho-hang', dot: 'warn' },
        { id: 'tiemtra', label: 'tiemtra-web', dot: 'crit', keywords: ['tiemtra.vn'] },
      ],
    },
    {
      id: 'servers',
      label: 'Servers',
      items: [{ id: 'vps-sg-1', label: 'vps-sg-1', icon: 'server' }],
    },
    {
      id: 'commands',
      label: 'Commands',
      items: [{ id: 'scan', label: 'Scan kho-hang', icon: 'refresh' }],
    },
  ]

  function open(props: Record<string, unknown> = {}) {
    return make(UiCommandPalette, { open: true, groups, label: 'Search', query: '', ...props })
  }
  const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent)
  const input = () => document.querySelector('input') as HTMLInputElement

  it('lists every group with its rows when the query is empty', () => {
    open()
    expect([...document.querySelectorAll('.group-label')].map((g) => g.textContent)).toEqual([
      'Projects',
      'Servers',
      'Commands',
    ])
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(4)
  })

  it('is an ARIA combobox over a listbox with the first row active', () => {
    open()
    expect(input().getAttribute('role')).toBe('combobox')
    const list = document.querySelector('[role="listbox"]')!
    expect(input().getAttribute('aria-controls')).toBe(list.id)
    const first = document.querySelector('[role="option"]')!
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(input().getAttribute('aria-activedescendant')).toBe(first.id)
  })

  it('filters by label and keyword, hides empty groups, and bolds the match', async () => {
    open({ query: 'kho' })
    await nextTick()
    expect(options().map((o) => o?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('kho-hang'),
      expect.stringContaining('Scan kho-hang'),
    ])
    expect(document.querySelectorAll('.group-label')).toHaveLength(2)
    expect(document.querySelector('b.match')?.textContent).toBe('kho')
    wrapper!.unmount()
    open({ query: 'tiemtra.vn' })
    await nextTick()
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1)
  })

  it('says so when nothing matches', async () => {
    open({ query: 'zzz' })
    await nextTick()
    expect(document.querySelector('[role="status"]')?.textContent).toContain('zzz')
  })

  it('moves with the arrows, wraps, and picks with Enter', async () => {
    open()
    const key = (k: string) => {
      input().dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
      )
      return nextTick()
    }
    await key('ArrowDown')
    expect(document.querySelectorAll('[role="option"]')[1]?.getAttribute('aria-selected')).toBe(
      'true',
    )
    await key('ArrowUp')
    await key('ArrowUp')
    expect(document.querySelectorAll('[role="option"]')[3]?.getAttribute('aria-selected')).toBe(
      'true',
    )
    await key('Enter')
    expect(wrapper!.emitted('select')).toEqual([['scan', 'commands']])
    expect(wrapper!.emitted('close')).toBeTruthy()
  })

  it('does not take Enter while an input method is composing', async () => {
    open()
    input().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    )
    await nextTick()
    expect(wrapper!.emitted('select')).toBeUndefined()
  })

  it('closes on Escape and on a press on the scrim, and picks with a click', async () => {
    open()
    await nextTick()
    input().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(wrapper!.emitted('close')).toHaveLength(1)
    document.querySelector('.layer')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(wrapper!.emitted('close')).toHaveLength(2)
    ;(document.querySelectorAll('[role="option"]')[1] as HTMLElement).click()
    expect(wrapper!.emitted('select')?.[0]).toEqual(['tiemtra', 'projects'])
  })

  it('renders nothing while closed, and puts the labels in as text', () => {
    open({ open: false })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    wrapper!.unmount()
    open({
      groups: [
        { id: 'g', label: '<b>x</b>', items: [{ id: 'a', label: '<img src=x onerror=1>' }] },
      ],
    })
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('UiAskComposer', () => {
  const area = () => wrapper!.get('textarea')

  it('has its send button off while empty, and on with text', async () => {
    make(UiAskComposer, { modelValue: '', label: 'Ask AI', placeholder: 'Ask about kho-hang' })
    expect(wrapper!.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper!.get('button').attributes('aria-label')).toBe('Send')
    await wrapper!.setProps({ modelValue: 'Why is events growing?' })
    expect(wrapper!.get('button').attributes('disabled')).toBeUndefined()
  })

  it('sends on Enter and keeps Shift+Enter for a new line', async () => {
    make(UiAskComposer, { modelValue: 'hello', label: 'Ask AI' })
    const shift = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true })
    area().element.dispatchEvent(shift)
    expect(shift.defaultPrevented).toBe(false)
    expect(wrapper!.emitted('send')).toBeUndefined()
    const plain = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    area().element.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(true)
    expect(wrapper!.emitted('send')).toEqual([['hello']])
  })

  it('never takes Enter pressed to accept an input-method candidate', () => {
    make(UiAskComposer, { modelValue: 'xin chào', label: 'Ask AI' })
    area().element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true }),
    )
    expect(wrapper!.emitted('send')).toBeUndefined()
  })

  it('does not send blank text, or while busy', () => {
    make(UiAskComposer, { modelValue: '   ', label: 'Ask AI' })
    area().element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(wrapper!.emitted('send')).toBeUndefined()
    wrapper!.unmount()
    make(UiAskComposer, { modelValue: 'x', label: 'Ask AI', busy: true })
    area().element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(wrapper!.emitted('send')).toBeUndefined()
  })

  it('shows what is attached under the field', () => {
    make(UiAskComposer, { modelValue: '', label: 'Ask AI' }, { note: 'Attaches the snapshot' })
    expect(wrapper!.get('.note').text()).toBe('Attaches the snapshot')
  })
})

describe('UiFindingCard', () => {
  const props = {
    severity: 'crit',
    severityLabel: 'Critical',
    project: 'tiemtra-web',
    since: 'new in #42',
    title: 'Your .env file is downloadable by anyone',
    cause: 'nginx serves the project root.',
    evidence: [
      { key: 'request', value: 'GET https://tiemtra.vn/.env' },
      { key: 'response', value: '200 OK · 1.2 KB', tone: 'crit' },
    ],
    fix: 'root /var/www/tiemtra/public;',
    fixLanguage: 'nginx',
  }

  it('keeps its six blocks in order', () => {
    make(UiFindingCard, props, { actions: '<button>Copy fix</button>' })
    const order = [...wrapper!.element.children].map(
      (el) => el.className.split(' ')[0] || el.tagName,
    )
    expect(order).toEqual(['head', 'title', 'cause', 'evidence', 'block-wrap', 'actions'])
  })

  it('shows the severity and project chips and when it first appeared', () => {
    make(UiFindingCard, props)
    expect(wrapper!.findAll('.head .chip').map((c) => c.text())).toEqual([
      'Critical',
      'tiemtra-web',
    ])
    expect(wrapper!.get('.since').text()).toBe('new in #42')
  })

  it('draws evidence as key and value rows, the problem value in rose', () => {
    make(UiFindingCard, props)
    expect(wrapper!.findAll('dt').map((d) => d.text())).toEqual(['request', 'response'])
    expect(wrapper!.findAll('dd')[1]?.classes()).toContain('crit')
  })

  it('is labelled by its title and renders everything as text', () => {
    make(UiFindingCard, { ...props, title: '<img src=x onerror=1>', cause: '<b>x</b>' })
    const article = wrapper!.get('article')
    expect(article.attributes('aria-labelledby')).toBe(wrapper!.get('h3').attributes('id'))
    expect(wrapper!.find('img').exists()).toBe(false)
    expect(wrapper!.find('.cause b').exists()).toBe(false)
  })

  it('leaves out the blocks it has nothing for', () => {
    make(UiFindingCard, {
      severity: 'warn',
      severityLabel: 'Needs a look',
      project: 'p',
      title: 't',
    })
    expect(wrapper!.find('.cause').exists()).toBe(false)
    expect(wrapper!.find('.evidence').exists()).toBe(false)
    expect(wrapper!.find('.block-wrap').exists()).toBe(false)
    expect(wrapper!.find('.actions').exists()).toBe(false)
  })
})

describe('UiFindingRow', () => {
  it('is a button that reports expand while open', async () => {
    make(UiFindingRow, { severity: 'warn', chip: 'kho-hang', title: 'events grows 1.1 GB' })
    expect(wrapper!.element.tagName).toBe('BUTTON')
    await wrapper!.trigger('click')
    expect(wrapper!.emitted('expand')).toHaveLength(1)
    expect(wrapper!.find('svg.icon').exists()).toBe(true)
  })

  it('waits with a bar while explaining, with no title', () => {
    make(UiFindingRow, { state: 'explaining', chip: 'Explaining' })
    expect(wrapper!.element.tagName).toBe('DIV')
    expect(wrapper!.find('.wait').exists()).toBe(true)
    expect(wrapper!.find('.title').exists()).toBe(false)
    expect(wrapper!.get('.chip').classes()).toContain('chip-info')
  })

  it('dims a known finding and tints a resolved one green', () => {
    make(UiFindingRow, { state: 'known', chip: 'Known', title: '12 files changed' })
    expect(wrapper!.classes()).toContain('state-known')
    expect(wrapper!.get('.chip').classes()).toContain('chip-plain')
    wrapper!.unmount()
    make(UiFindingRow, { state: 'resolved', chip: 'Resolved', title: '.env no longer public' })
    expect(wrapper!.classes()).toContain('state-resolved')
    expect(wrapper!.get('.chip').classes()).toContain('chip-plain-ok')
    expect(wrapper!.element.tagName).toBe('DIV')
  })
})

describe('UiAskThread', () => {
  const messages = [
    { id: 'q', role: 'user' as const, text: 'Is it safe?' },
    {
      id: 'a',
      role: 'ai' as const,
      text: 'Probably, if nothing reads them.',
      code: 'DELETE FROM events LIMIT 50000;',
      language: 'sql' as const,
      basedOn: 'Based on scan #42',
    },
  ]

  it('shows the question as a bubble and the answer with its code and basis', () => {
    make(UiAskThread, { messages })
    expect(wrapper!.get('.user').text()).toContain('Is it safe?')
    expect(wrapper!.get('.ai .bubble').text()).toContain('Probably, if nothing reads them.')
    expect(wrapper!.find('.block-wrap').exists()).toBe(true)
    expect(wrapper!.get('.based').text()).toBe('Based on scan #42')
  })

  it('stands a shimmer bar where the answer will be while pending', () => {
    make(UiAskThread, { messages: [messages[0]!], pending: true })
    expect(wrapper!.get('.think').classes()).toContain('m-think')
    expect(wrapper!.find('[aria-busy="true"]').exists()).toBe(true)
  })

  it('fades the words of the newest answer in 60 ms apart', () => {
    make(UiAskThread, { messages, animate: 'a' })
    const words = wrapper!.findAll('.m-word')
    expect(words.map((w) => w.text())).toEqual(['Probably,', 'if', 'nothing', 'reads', 'them.'])
    expect(words.map((w) => w.attributes('style'))).toEqual([
      expect.stringContaining('--d: 0ms'),
      expect.stringContaining('--d: 60ms'),
      expect.stringContaining('--d: 120ms'),
      expect.stringContaining('--d: 180ms'),
      expect.stringContaining('--d: 240ms'),
    ])
  })

  it('never turns an answer into markup', () => {
    make(UiAskThread, {
      messages: [{ id: 'a', role: 'ai' as const, text: '<img src=x onerror=alert(1)>' }],
    })
    expect(wrapper!.find('img').exists()).toBe(false)
  })
})

describe('UiPayloadViewer', () => {
  const payload = [
    '{',
    '  "env": { "DB_PASSWORD": [redacted],',
    '    "APP_KEY": [redacted] },',
    '  "host": [ip redacted]',
    '}',
  ].join('\n')

  it('marks every redaction in the exact text, which stays whole', () => {
    make(UiPayloadViewer, { payload, provider: 'Anthropic' })
    expect(wrapper!.findAll('mark.red').map((m) => m.text())).toEqual([
      '[redacted]',
      '[redacted]',
      '[ip redacted]',
    ])
    expect(wrapper!.get('pre').text()).toBe(payload)
  })

  it('counts redactions, sizes the payload and names where it goes', () => {
    make(UiPayloadViewer, { payload, provider: 'Anthropic' })
    const chips = wrapper!.findAll('.chip').map((c) => c.text())
    expect(chips[0]).toMatch(/^\d+(\.\d+)? B$/)
    expect(chips[1]).toBe('3 values redacted')
    expect(chips[2]).toBe('to Anthropic')
  })

  it('says one value redacted in the singular, and draws no rose when there are none', () => {
    make(UiPayloadViewer, { payload: '{ "a": [redacted] }', provider: 'x' })
    expect(wrapper!.findAll('.chip')[1]?.text()).toBe('1 value redacted')
    wrapper!.unmount()
    make(UiPayloadViewer, { payload: '{ "a": 1 }', provider: 'x' })
    expect(wrapper!.find('mark').exists()).toBe(false)
    expect(wrapper!.findAll('.chip')[1]?.classes()).toContain('chip-neutral')
  })

  it('treats markup in the payload as text', () => {
    make(UiPayloadViewer, { payload: '{ "log": "<img src=x onerror=alert(1)>" }', provider: 'x' })
    expect(wrapper!.find('img').exists()).toBe(false)
  })
})

describe('UiProviderRow', () => {
  it('shows the monogram tile, the name, the detail and the trailing control', () => {
    make(
      UiProviderRow,
      { name: 'Anthropic', mark: 'A', detail: 'claude-sonnet-5 · key in Keychain' },
      { trailing: '<span class="chip">Connected</span>' },
    )
    expect(wrapper!.get('.tile').text()).toBe('A')
    expect(wrapper!.get('.name').text()).toBe('Anthropic')
    expect(wrapper!.get('.detail').text()).toContain('Keychain')
    expect(wrapper!.get('.trailing').text()).toBe('Connected')
    expect(wrapper!.classes()).toContain('row-status')
  })

  it('reads an error in rose, and shades a zebra row with a white tile', () => {
    make(UiProviderRow, {
      name: 'OpenRouter',
      mark: 'R',
      detail: 'Key rejected: 401 unauthorized',
      error: true,
      shaded: true,
    })
    expect(wrapper!.get('.detail').classes()).toContain('error')
    expect(wrapper!.get('.tile').classes()).toContain('shaded')
  })
})

describe('UiChipMorph', () => {
  it('shows the label in the tone, and swaps the label when it changes', async () => {
    make(UiChipMorph, { tone: 'info', label: 'Scanning', busy: true })
    expect(wrapper!.classes()).toContain('chip-info')
    expect(wrapper!.get('.face').text()).toBe('Scanning')
    await wrapper!.setProps({ tone: 'warn', label: 'Needs a look', busy: false, icon: 'warn' })
    await nextTick()
    expect(wrapper!.classes()).toContain('chip-warn')
    expect(wrapper!.findAll('.face').some((f) => f.text() === 'Needs a look')).toBe(true)
  })

  it('keeps a hidden copy of the label to measure, which screen readers skip', () => {
    make(UiChipMorph, { label: 'Healthy' })
    expect(wrapper!.get('.sizer').attributes('aria-hidden')).toBe('true')
  })
})

describe('UiTopology forms', () => {
  const components: TopologyInput[] = [
    { id: 'fe', label: 'FE', host: 'vps-sg-1', state: 'ok' },
    { id: 'be', label: 'BE', host: 'vps-sg-2', state: 'warn' },
    { id: 'db', label: 'DB', host: 'vps-sg-2', state: 'ok' },
  ]
  const common = {
    components,
    urlLabel: 'URL',
    states: { ok: 'Healthy', warn: 'Warning', crit: 'Critical', unknown: 'Unknown' },
    moreLabel: (n: number) => `and ${n} more`,
    label: 'Request path',
  }

  it('draws the component form with a URL node and dots by default', () => {
    make(UiTopology, common)
    expect(wrapper!.findAll('.node').map((n) => n.find('.label, .role').text())).toEqual([
      'URL',
      'FE',
      'BE',
      'DB',
    ])
    expect(wrapper!.findAll('.dot')).toHaveLength(3)
    expect(wrapper!.findAll('.link')).toHaveLength(3)
  })

  it('draws the server form with the roles of one server in one node and the role colours', () => {
    make(UiTopology, { ...common, mode: 'servers' })
    const nodes = wrapper!.findAll('.node')
    expect(nodes).toHaveLength(2)
    expect(nodes[1]?.findAll('.role').map((r) => r.text())).toEqual(['BE', 'DB'])
    expect(nodes[1]?.get('.caption').text()).toBe('vps-sg-2')
    expect(nodes[1]?.findAll('.role').map((r) => r.classes()[1])).toEqual(['role-be', 'role-db'])
    expect(wrapper!.find('.dot').exists()).toBe(false)
    expect(wrapper!.findAll('.link')).toHaveLength(1)
  })

  it('becomes a list of the same nodes without links, in the narrow range or when asked', () => {
    make(UiTopology, { ...common, list: true })
    expect(wrapper!.classes()).toContain('list')
    expect(wrapper!.findAll('.node')).toHaveLength(4)
    expect(wrapper!.find('.link').exists()).toBe(false)
  })

  it('folds past two servers into +N with a tooltip that names them, and a list folds none', () => {
    const many: TopologyInput[] = [
      { id: 'app', label: 'APP', host: 'vps-sg-2', state: 'ok' },
      { id: 'db', label: 'DB', host: 'db-main', state: 'ok' },
      { id: 'cache', label: 'CACHE', host: 'cache-1', state: 'crit' },
      { id: 'queue', label: 'QUEUE', host: 'queue-1', state: 'ok' },
    ]
    make(UiTopology, { ...common, components: many, mode: 'servers' })
    const nodes = wrapper!.findAll('.node')
    expect(nodes.map((n) => n.text())).toEqual([
      'APPvps-sg-2Healthy',
      'DBdb-mainHealthy',
      '+2and 2 more',
    ])
    expect(nodes[2]?.attributes('title')).toBe('cache-1, queue-1')
    make(UiTopology, { ...common, components: many, mode: 'servers', list: true })
    expect(wrapper!.findAll('.node')).toHaveLength(4)
  })

  it('reads out the state of each node', () => {
    make(UiTopology, { ...common, mode: 'servers' })
    expect(wrapper!.findAll('.sr-only').map((s) => s.text())).toEqual(['Healthy', 'Warning'])
  })
})

describe('UiMetricTile, card form', () => {
  it('has no sparkline and puts the note under the value', () => {
    make(UiMetricTile, {
      form: 'note',
      label: 'Disk',
      value: '3.2',
      unit: 'GB',
      series: [1, 2, 3, 4],
      note: '+0.4',
      noteTone: 'warn',
    })
    expect(wrapper!.classes()).toContain('tile-note')
    expect(wrapper!.find('.spark').exists()).toBe(false)
    expect(wrapper!.get('.note').classes()).toContain('note-warn')
    expect(wrapper!.get('.value').text()).toBe('3.2 GB')
  })

  it('reads the note from the state when no tone is given', () => {
    const tones = { warn: 'note-warn', crit: 'note-crit', stale: 'note-old', normal: 'note-plain' }
    for (const [state, cls] of Object.entries(tones)) {
      make(UiMetricTile, { form: 'note', label: 'Disk', value: '1', note: 'n', state })
      expect(wrapper!.get('.note').classes(), state).toContain(cls)
      wrapper!.unmount()
    }
  })

  it('writes a value that is not set up in grey, and a missing permission as a dash', () => {
    make(UiMetricTile, {
      form: 'note',
      label: 'Database',
      value: 'Not set up',
      state: 'not-set-up',
      note: 'add .env path',
    })
    expect(wrapper!.get('.value').classes()).toContain('muted')
    wrapper!.unmount()
    make(UiMetricTile, {
      form: 'note',
      label: 'Logs',
      state: 'needs-permission',
      note: 'needs permission',
    })
    expect(wrapper!.get('.value').text()).toBe('—')
  })

  it('gives way to two skeleton bars while the host is read, and keeps a given note', () => {
    make(UiMetricTile, { form: 'note', label: 'Disk', state: 'scanning' })
    expect(wrapper!.findAll('.skeleton')).toHaveLength(2)
    wrapper!.unmount()
    make(UiMetricTile, {
      form: 'note',
      label: 'Database',
      state: 'scanning',
      note: 'add .env path',
    })
    expect(wrapper!.findAll('.skeleton')).toHaveLength(1)
    expect(wrapper!.get('.note').text()).toBe('add .env path')
  })
})

describe('UiChipMorph, dot and large forms', () => {
  it('draws a dot before the word, and a halo only on a critical one that pulses', () => {
    make(UiChipMorph, { tone: 'crit', label: '2 critical', dot: true, pulse: true, large: true })
    expect(wrapper!.classes()).toContain('large')
    expect(wrapper!.get('.face .lead').classes()).toContain('m-halo')
    wrapper!.unmount()
    make(UiChipMorph, { tone: 'warn', label: '2 warnings', dot: true, pulse: true })
    expect(wrapper!.get('.face .lead').classes()).not.toContain('m-halo')
  })

  it('swaps the dot for a spinner while busy', () => {
    make(UiChipMorph, { tone: 'info', label: 'waiting', dot: true, busy: true })
    expect(wrapper!.find('.face .lead').exists()).toBe(false)
  })
})

describe('UiProjectCard', () => {
  const base = {
    name: 'kho-hang',
    domain: 'kho-hang.vn',
    where: 'vps-sg-1',
    state: 'warn',
    stateLabel: '2 warnings',
    tags: [
      { label: 'Laravel 10' },
      { label: 'MySQL 8.0' },
      { label: 'compose' },
      { label: 'Redis' },
    ],
    topology: [
      { id: 'fe', label: 'FE', host: 'vps-sg-1', state: 'ok' },
      { id: 'be', label: 'BE', host: 'vps-sg-2', state: 'warn' },
    ] as TopologyInput[],
    nodeStates: { ok: 'Healthy', warn: 'Warning', crit: 'Critical', unknown: 'Unknown' },
    moreLabel: (n: number) => `and ${n} more`,
    topologyLabel: 'Request path',
    status: { tone: 'warn', icon: 'database', title: 'Database grew 1.1 GB' },
    actionLabel: 'Open ›',
    metrics: [
      { label: 'Uptime', value: '200', unit: '· 212 ms', note: 'no change' },
      { label: 'Disk', value: '5.4', unit: 'GB', note: '+0.9', noteTone: 'warn' },
      { label: 'Database', value: '1.82', unit: 'GB', note: '+440 MB', noteTone: 'delta' },
    ],
    checkedAt: Date.now() - 60_000,
    passedLabel: '12 of 14 passed',
    openLabel: 'Open',
  }

  it('keeps its six blocks in order', () => {
    make(UiProjectCard, base)
    const order = [...wrapper!.element.children].map((el) => el.className.split(' ')[0])
    expect(order).toEqual(['head', 'tags', 'topology', 'row', 'metrics', 'foot'])
  })

  it('shows the name, the domain with where it runs, and a state chip for every state', () => {
    make(UiProjectCard, base)
    expect(wrapper!.get('.name').text()).toBe('kho-hang')
    expect(wrapper!.get('.name').attributes('title')).toBe('kho-hang')
    expect(wrapper!.get('.where').text()).toContain('kho-hang.vn')
    expect(wrapper!.get('.where').text()).toContain('vps-sg-1')
    const chip = wrapper!.get('.state')
    expect(chip.classes()).toEqual(expect.arrayContaining(['chip-warn', 'large']))
    expect(chip.get('.face').text()).toBe('2 warnings')
    expect(chip.find('.lead').exists()).toBe(true)
  })

  it('draws the chip of each state as the board does', () => {
    const tones = {
      crit: 'chip-crit',
      warn: 'chip-warn',
      ok: 'chip-ok',
      unreachable: 'chip-neutral',
    }
    for (const [state, tone] of Object.entries(tones)) {
      make(UiProjectCard, { ...base, state, stateLabel: state })
      expect(wrapper!.get('.state').classes(), state).toContain(tone)
      wrapper!.unmount()
    }
    make(UiProjectCard, { ...base, state: 'scanning', stateLabel: 'waiting' })
    expect(wrapper!.get('.state').classes()).toContain('chip-info')
    expect(wrapper!.find('.state .lead').exists()).toBe(false)
    expect(wrapper!.attributes('aria-busy')).toBe('true')
  })

  it('pulses the dot of a critical card and lifts it with the rose shadow, and no other', () => {
    make(UiProjectCard, { ...base, state: 'crit', stateLabel: '2 critical' })
    expect(wrapper!.get('.state .lead').classes()).toContain('m-halo')
    expect(wrapper!.classes()).toContain('critical')
    wrapper!.unmount()
    make(UiProjectCard, base)
    expect(wrapper!.get('.state .lead').classes()).not.toContain('m-halo')
    expect(wrapper!.classes()).not.toContain('critical')
  })

  it('folds tags past the limit into +N, on one line, with a dot in the project colour', () => {
    make(UiProjectCard, { ...base, tint: 'teal' })
    const tags = wrapper!.findAll('.tags .tag').map((t) => t.text())
    expect(tags).toEqual(['Laravel 10', 'MySQL 8.0', 'compose', '+1'])
    expect(wrapper!.classes()).toContain('tint-teal')
    expect(wrapper!.get('.tags .swatch').attributes('style')).toContain('var(--mark)')
  })

  it('draws the servers topology only: no URL node, one node per server', () => {
    make(UiProjectCard, base)
    expect(wrapper!.findAll('.topology .node')).toHaveLength(2)
    expect(wrapper!.get('.topology').text()).not.toContain('URL')
  })

  it('shows the single most severe issue with one text action, never stacked rows', () => {
    make(UiProjectCard, base)
    expect(wrapper!.findAll('.status')).toHaveLength(1)
    expect(wrapper!.get('.status .action').text()).toBe('Open ›')
    expect(wrapper!.find('.count').exists()).toBe(false)
  })

  it('reports action from the status row', async () => {
    make(UiProjectCard, { ...base, state: 'crit' })
    await wrapper!.get('.status .action').trigger('click')
    expect(wrapper!.emitted('action')).toHaveLength(1)
  })

  it('draws the three tiles without a sparkline, each with its note', () => {
    make(UiProjectCard, base)
    const tiles = wrapper!.findAll('.metrics .tile')
    expect(tiles).toHaveLength(3)
    expect(wrapper!.find('.metrics svg.spark, .metrics .spark').exists()).toBe(false)
    expect(tiles.map((t) => t.get('.note').text())).toEqual(['no change', '+0.9', '+440 MB'])
  })

  it('keeps the last result while one tile is read, and dims the tiles when unreachable', () => {
    const metrics = [base.metrics[0], { label: 'Disk', state: 'scanning' }, base.metrics[2]]
    make(UiProjectCard, { ...base, state: 'scanning', stateLabel: 'waiting', metrics })
    const tiles = wrapper!.findAll('.metrics .tile')
    expect(tiles[0]!.attributes('data-state')).toBe('normal')
    expect(tiles[1]!.attributes('data-state')).toBe('scanning')
    expect(wrapper!.get('.metrics').classes()).not.toContain('dim')
    wrapper!.unmount()
    make(UiProjectCard, { ...base, state: 'unreachable', stateLabel: 'Unreachable' })
    expect(wrapper!.get('.metrics').classes()).toContain('dim')
  })

  it('says "this scan" in the foot without a time while the first read runs', () => {
    make(UiProjectCard, {
      ...base,
      state: 'scanning',
      checkedAt: undefined,
      passedLabel: 'this scan · waiting',
    })
    expect(wrapper!.find('.when').exists()).toBe(false)
    expect(wrapper!.get('.passed').text()).toBe('this scan · waiting')
  })

  it('opens from the Open button and from a press on the card, not from its other controls', async () => {
    make(UiProjectCard, base)
    await wrapper!.get('.foot button').trigger('click')
    expect(wrapper!.emitted('open')).toHaveLength(1)
    await wrapper!.get('.head').trigger('click')
    expect(wrapper!.emitted('open')).toHaveLength(2)
    await wrapper!.get('.where a').trigger('click')
    expect(wrapper!.emitted('open')).toHaveLength(2)
    expect(wrapper!.emitted('open-domain')).toEqual([['https://kho-hang.vn']])
  })

  it('does not open from a press when it is not interactive', async () => {
    make(UiProjectCard, { ...base, interactive: false })
    await wrapper!.get('.head').trigger('click')
    expect(wrapper!.emitted('open')).toBeUndefined()
    expect(wrapper!.classes()).not.toContain('m-lift')
  })

  it('lifts on hover when interactive', () => {
    make(UiProjectCard, base)
    expect(wrapper!.classes()).toContain('m-lift')
  })

  it('turns the time warn after a day', () => {
    make(UiProjectCard, base)
    expect(wrapper!.get('.when').classes()).not.toContain('stale')
    wrapper!.unmount()
    make(UiProjectCard, { ...base, checkedAt: Date.now() - 3 * 24 * 3_600_000 })
    expect(wrapper!.get('.when').classes()).toContain('stale')
  })

  it('cuts a long name with an ellipsis style and keeps the full name as the title', () => {
    const long = 'a-very-long-project-name-that-does-not-fit'
    make(UiProjectCard, { ...base, name: long })
    expect(wrapper!.get('.name').attributes('title')).toBe(long)
  })
})
