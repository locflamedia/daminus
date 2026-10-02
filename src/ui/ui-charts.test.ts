// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetPlayed } from '@/lib/motion'
import UiBarChart from './UiBarChart.vue'
import UiDonut from './UiDonut.vue'
import UiGauge from './UiGauge.vue'
import UiHeatmap from './UiHeatmap.vue'
import UiHeatStrip from './UiHeatStrip.vue'
import UiHistoryChart from './UiHistoryChart.vue'
import UiIssueColumns from './UiIssueColumns.vue'
import UiMeter from './UiMeter.vue'
import UiSparkline from './UiSparkline.vue'
import UiStackedBar from './UiStackedBar.vue'
import UiTopology from './UiTopology.vue'
import UiTreemap from './UiTreemap.vue'

beforeEach(() => resetPlayed())

describe('UiMeter', () => {
  const props = { label: 'Disk', value: '92%', pct: 92, band: 'crit' as const, abs: '73.6 / 80 GB' }

  it('is a meter that reads out the value, the amount and the band word', () => {
    const wrapper = mount(UiMeter, { props: { ...props, bandLabel: 'Critical' } })
    expect(wrapper.attributes('role')).toBe('meter')
    expect(wrapper.attributes('aria-label')).toBe('Disk')
    expect(wrapper.attributes('aria-valuenow')).toBe('92')
    expect(wrapper.attributes('aria-valuetext')).toBe('92%, 73.6 / 80 GB, Critical')
    expect(wrapper.classes()).toContain('band-crit')
    expect(wrapper.get('.fill').attributes('style')).toContain('width: 92%')
  })

  it('draws no bar for a missing reading and gives no number', () => {
    const wrapper = mount(UiMeter, { props: { label: 'Load', value: '—', pct: null, band: 'off' } })
    expect(wrapper.attributes('aria-valuenow')).toBeUndefined()
    expect(wrapper.get('.fill').attributes('style')).toContain('width: 0%')
  })

  it('holds the bar to the track', () => {
    const wrapper = mount(UiMeter, { props: { ...props, pct: 130 } })
    expect(wrapper.get('.fill').attributes('style')).toContain('width: 100%')
  })

  it('has a row shape with the label beside the bar', () => {
    const wrapper = mount(UiMeter, { props: { ...props, shape: 'row' } })
    expect(wrapper.classes()).toContain('shape-row')
    expect(wrapper.find('.label').text()).toBe('Disk')
  })

  it('renders its text as text', () => {
    const wrapper = mount(UiMeter, { props: { ...props, abs: '<img src=x onerror=alert(1)>' } })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})

describe('UiGauge', () => {
  it('describes the whole gauge once and shows the number, caption and label', () => {
    const wrapper = mount(UiGauge, {
      props: {
        pct: 92,
        band: 'crit',
        value: '92%',
        caption: '73.6 of 80 GB',
        label: 'Disk',
        description: 'Disk 92 percent',
      },
    })
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toBe('Disk 92 percent')
    expect(wrapper.text()).toContain('92%')
    expect(wrapper.text()).toContain('73.6 of 80 GB')
    expect(wrapper.classes()).toContain('band-crit')
  })

  it('draws no value arc or knob without a reading', () => {
    const wrapper = mount(UiGauge, {
      props: { pct: null, band: 'off', value: '—', label: 'Disk', description: 'Disk unknown' },
    })
    expect(wrapper.find('.value-arc').exists()).toBe(false)
    expect(wrapper.find('.knob').exists()).toBe(false)
  })

  it('sweeps from empty the first time and shows the value after', () => {
    const props = {
      pct: 50,
      value: '50%',
      label: 'Memory',
      description: 'Memory 50',
      once: 'gauge-test',
    }
    const first = mount(UiGauge, { props })
    const again = mount(UiGauge, { props })
    expect(first.get('.value-arc').attributes('stroke-dashoffset')).toBe('1')
    expect(again.get('.value-arc').attributes('stroke-dashoffset')).toBe('0.5')
  })

  it('follows a new value', async () => {
    const wrapper = mount(UiGauge, {
      props: { pct: 20, value: '20%', label: 'Disk', description: 'Disk' },
    })
    await wrapper.setProps({ pct: 60 })
    expect(wrapper.get('.value-arc').attributes('stroke-dashoffset')).toBe('0.4')
  })
})

describe('UiSparkline', () => {
  it('draws nothing under three scans', () => {
    expect(
      mount(UiSparkline, { props: { values: [1, 2] } })
        .find('svg')
        .exists(),
    ).toBe(false)
  })

  it('draws a line, a fill and a dot for nine scans', () => {
    const wrapper = mount(UiSparkline, {
      props: { values: [1, 2, 3, 2, 4, 5, 4, 6, 7], label: 'Latency' },
    })
    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.findAll('path')).toHaveLength(2)
    expect(wrapper.find('.dot').exists()).toBe(true)
  })

  it('is decorative without a label', () => {
    const wrapper = mount(UiSparkline, { props: { values: [1, 2, 3] } })
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.attributes('role')).toBeUndefined()
  })

  it('dashes a stale line and skips the draw animation', () => {
    const wrapper = mount(UiSparkline, { props: { values: [1, 2, 3], tone: 'stale' } })
    const line = wrapper.findAll('path')[1]
    expect(line?.attributes('stroke-dasharray')).toBe('3 4')
    expect(line?.classes()).not.toContain('m-draw')
  })

  it('draws once for a key, then shows the final state', () => {
    const first = mount(UiSparkline, { props: { values: [1, 2, 3], once: 'spark-key' } })
    const second = mount(UiSparkline, { props: { values: [1, 2, 3], once: 'spark-key' } })
    expect(first.findAll('path')[1]?.classes()).toContain('m-draw')
    expect(second.findAll('path')[1]?.classes()).not.toContain('m-draw')
  })
})

describe('UiHistoryChart', () => {
  const values = [6.7, 6.8, 6.9, 7, 8.4]
  const tips = values.map((v, i) => ({
    title: `scan ${i}`,
    value: `${v} GB`,
    delta: i ? '+0.1' : undefined,
  }))
  const base = {
    series: [{ id: 'a', values }],
    formatY: (v: number) => `${v} GB`,
    label: 'Size',
    tips,
  }

  it('is a labelled group with gridlines at round values', () => {
    const wrapper = mount(UiHistoryChart, { props: { ...base, domain: [6.5, 8.75] as const } })
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Size')
    const labels = wrapper.findAll('.axis').map((n) => n.text())
    expect(labels).toEqual(['7 GB', '7.5 GB', '8 GB', '8.5 GB'])
  })

  it('moves a cursor with the arrow keys and clears it on Escape', async () => {
    const wrapper = mount(UiHistoryChart, { props: base })
    const stage = wrapper.get('.stage')
    expect(wrapper.find('.tip').exists()).toBe(false)
    await stage.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('.tip').text()).toContain('scan 4')
    await stage.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('.tip').text()).toContain('scan 3')
    await stage.trigger('keydown', { key: 'Home' })
    expect(wrapper.get('.tip').text()).toContain('scan 0')
    await stage.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.tip').exists()).toBe(false)
  })

  it('announces the scan under the cursor to screen readers', async () => {
    const wrapper = mount(UiHistoryChart, { props: base })
    await wrapper.get('.stage').trigger('keydown', { key: 'End' })
    expect(wrapper.get('[aria-live]').text()).toBe('scan 4, 8.4 GB, +0.1')
  })

  it('announces a sentence of its own when the tip has one', async () => {
    const spoken = tips.map((t, i) => ({ ...t, spoken: `Scan ${i}, 24 September, ${t.value}` }))
    const wrapper = mount(UiHistoryChart, { props: { ...base, tips: spoken } })
    await wrapper.get('.stage').trigger('keydown', { key: 'End' })
    expect(wrapper.get('[aria-live]').text()).toBe('Scan 4, 24 September, 8.4 GB')
  })

  it('marks the keyboard cursor with the ink crosshair and the ink label, not the pointer', async () => {
    const wrapper = mount(UiHistoryChart, {
      props: { ...base, xLabels: [{ index: 4, text: 'today' }], hovered: 4 },
    })
    expect(wrapper.get('.stage').classes()).not.toContain('keyboard')
    await wrapper.get('.stage').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('.stage').classes()).toContain('keyboard')
    await wrapper.get('.stage').trigger('keydown', { key: 'End' })
    expect(wrapper.get('.axis.now').text()).toBe('today')
    await wrapper.get('.stage').trigger('blur')
    expect(wrapper.get('.stage').classes()).not.toContain('keyboard')
  })

  it('is a single tab stop, with the card hidden from screen readers', async () => {
    const wrapper = mount(UiHistoryChart, { props: base })
    expect(wrapper.findAll('[tabindex="0"]')).toHaveLength(1)
    await wrapper.get('.stage').trigger('keydown', { key: 'End' })
    expect(wrapper.get('.tip').attributes('aria-hidden')).toBe('true')
  })

  it('takes a pinned scan from its model', () => {
    const wrapper = mount(UiHistoryChart, { props: { ...base, hovered: 2 } })
    expect(wrapper.get('.tip').text()).toContain('scan 2')
  })

  it('warms the stroke to amber only from the threshold on', () => {
    const wrapper = mount(UiHistoryChart, { props: { ...base, threshold: 8 } })
    const stops = wrapper.findAll('linearGradient')[1]?.findAll('stop') ?? []
    expect(stops.map((s) => s.attributes('style'))).toEqual([
      expect.stringContaining('--chart-accent-70'),
      expect.stringContaining('--accent)'),
      expect.stringContaining('--chart-amber'),
    ])
    // The accent stop sits at the scan before the first one past the threshold.
    expect(Number(stops[1]?.attributes('offset'))).toBeCloseTo((48 + (692 * 3) / 4) / 760, 2)
  })

  it('draws two series, the second in lilac, and a warning band', () => {
    const wrapper = mount(UiHistoryChart, {
      props: {
        ...base,
        series: [
          { id: 'a', values },
          { id: 'b', values: [4, 4, 5, 4, 4], tone: 'lilac' as const },
        ],
        band: { from: 85, to: 100, label: 'warn from 85%' },
        domain: [30, 100] as const,
      },
    })
    expect(wrapper.findAll('.curve')).toHaveLength(2)
    expect(wrapper.find('.band-text').text()).toBe('warn from 85%')
    expect(wrapper.findAll('.curve')[0]?.attributes('style')).toContain('--chart-lilac')
  })
})

describe('UiBarChart', () => {
  it('draws a track and a bar for every scan and marks only the last as the latest', () => {
    const wrapper = mount(UiBarChart, {
      props: { values: [2, 3, 2.5], label: 'Durations', labels: { first: '#1', last: '#3' } },
    })
    expect(wrapper.findAll('.track')).toHaveLength(3)
    const bars = wrapper.findAll('.bar')
    expect(bars.map((b) => b.classes().includes('latest'))).toEqual([false, false, true])
    expect(wrapper.findAll('.axis').map((a) => a.text())).toEqual(['#1', '#3'])
    expect(wrapper.attributes('role') ?? wrapper.get('svg').attributes('role')).toBe('img')
  })

  it('is one tab stop with a card for every bar when it is given tips', async () => {
    const tips = [1, 2, 3].map((n) => ({
      title: `Scan #${n}`,
      value: `${n} s`,
      spoken: `Scan ${n}, ${n} s`,
    }))
    const wrapper = mount(UiBarChart, {
      props: { values: [1, 2, 3], label: 'Durations', labels: { first: '#1', last: '#3' }, tips },
    })
    const stage = wrapper.get('[role="group"]')
    expect(stage.attributes('tabindex')).toBe('0')
    expect(stage.attributes('aria-label')).toBe('Durations')
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('title').map((t) => t.text())).toEqual([
      'Scan 1, 1 s',
      'Scan 2, 2 s',
      'Scan 3, 3 s',
    ])
    await stage.trigger('keydown', { key: 'Home' })
    expect(wrapper.get('.tip').text()).toContain('Scan #1')
    expect(wrapper.get('[aria-live]').text()).toBe('Scan 1, 1 s')
    expect(wrapper.find('.cursor').exists()).toBe(true)
    expect(wrapper.findAll('.axis')[0]?.classes()).toContain('now')
    await stage.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.tip').exists()).toBe(false)
  })

  it('without tips it stays a plain picture', () => {
    const wrapper = mount(UiBarChart, { props: { values: [1, 2], label: 'Durations' } })
    expect(wrapper.find('[tabindex]').exists()).toBe(false)
    expect(wrapper.get('svg').attributes('role')).toBe('img')
  })

  it('staggers the rise 40 ms apart', () => {
    const wrapper = mount(UiBarChart, { props: { values: [1, 2, 3], label: 'x' } })
    expect(wrapper.findAll('.bar').map((b) => b.attributes('style'))).toEqual([
      expect.stringContaining('--d: 0ms'),
      expect.stringContaining('--d: 40ms'),
      expect.stringContaining('--d: 80ms'),
    ])
  })
})

describe('UiStackedBar and UiDonut', () => {
  it('sizes stacked parts by value and names every one in the legend', () => {
    const wrapper = mount(UiStackedBar, {
      props: {
        label: 'Folders',
        parts: [
          { id: 'a', label: 'logs', value: 640, display: '640 MB' },
          { id: 'b', label: 'vendor', value: 312, display: '312 MB' },
          { id: 'o', label: 'other', value: 39, display: '39 MB', other: true },
        ],
      },
    })
    expect(wrapper.findAll('.seg').map((s) => s.attributes('style'))).toEqual([
      expect.stringContaining('flex-grow: 640'),
      expect.stringContaining('flex-grow: 312'),
      expect.stringContaining('flex-grow: 39'),
    ])
    expect(wrapper.findAll('.row').map((r) => r.text())).toEqual([
      'logs640 MB',
      'vendor312 MB',
      'other39 MB',
    ])
  })

  it('reads the donut legend largest first with "other" last', () => {
    const wrapper = mount(UiDonut, {
      props: {
        label: 'Disk',
        value: '73.6',
        caption: 'of 80 GB',
        parts: [
          {
            id: 'o',
            label: 'Other',
            value: 27,
            display: '27',
            color: 'grey' as const,
            other: true,
          },
          { id: 'd', label: 'Docker', value: 18, display: '18', color: 'accent' as const },
          { id: 's', label: 'System', value: 12, display: '12', color: 'accent-70' as const },
        ],
      },
    })
    expect(wrapper.findAll('.name').map((n) => n.text())).toEqual(['Docker', 'System', 'Other'])
    expect(wrapper.findAll('path')).toHaveLength(3)
    expect(wrapper.text()).toContain('of 80 GB')
  })
})

describe('UiTreemap', () => {
  const tiles = [
    {
      id: 'a',
      label: 'public/uploads',
      value: 2.6,
      display: '2.6 GB',
      delta: '+40 MB',
      deltaTone: 'warn' as const,
    },
    { id: 'b', label: 'storage/logs', value: 0.9, display: '0.9 GB', grow: true },
    { id: 'c', label: 'storage/app', value: 1.1, display: '1.1 GB' },
    { id: 'd', label: 'other', value: 0.4, display: '0.4 GB', other: true },
  ]

  it('is a labelled list with one tile per folder, name and size inside', () => {
    const wrapper = mount(UiTreemap, { props: { tiles, label: 'Folders' } })
    expect(wrapper.attributes('aria-label')).toBe('Folders')
    const items = wrapper.findAll('li')
    expect(items).toHaveLength(4)
    expect(items[0]?.text()).toContain('public/uploads')
    expect(items[0]?.text()).toContain('2.6 GB')
  })

  it('outlines the grower, greys the rest and tints the others by size', () => {
    const wrapper = mount(UiTreemap, { props: { tiles, label: 'Folders' } })
    // Largest first, the grower pulled up behind it, the rest bucket last.
    expect(
      wrapper
        .findAll('li')
        .map((l) => [l.attributes('data-tile'), l.classes().find((c) => c.startsWith('tone-'))]),
    ).toEqual([
      ['a', 'tone-tile-1'],
      ['b', 'tone-grow'],
      ['c', 'tone-tile-2'],
      ['d', 'tone-other'],
    ])
  })

  it('puts half the tiles in row one, two thirds of the height, with a 3 px inset', () => {
    const wrapper = mount(UiTreemap, { props: { tiles, height: 300, label: 'Folders' } })
    const [first, second, third] = wrapper.findAll('li').map((l) => l.attributes('style') ?? '')
    expect(first).toContain('left: calc(0% + 3px)')
    expect(first).toContain('top: 3px')
    expect(first).toContain(`height: ${(2 / 3) * 300 - 6}px`)
    // Two of the four tiles are in the first row, side by side; the rest sit below it.
    expect(second).toContain('top: 3px')
    expect(third).toContain(`top: ${(2 / 3) * 300 + 3}px`)
    expect(third).toContain(`height: ${(1 / 3) * 300 - 6}px`)
  })

  it('reads every tile as its name, size and change, in its title and its accessible name', () => {
    const wrapper = mount(UiTreemap, { props: { tiles, label: 'Folders' } })
    const first = wrapper.findAll('li')[0]
    expect(first?.attributes('title')).toBe('public/uploads, 2.6 GB, +40 MB')
    expect(first?.attributes('aria-label')).toBe('public/uploads, 2.6 GB, +40 MB')
  })

  it('stagger the rise in reading order, a step more for each row', () => {
    const wrapper = mount(UiTreemap, { props: { tiles, label: 'Folders' } })
    expect(
      wrapper.findAll('li').map((l) => /--d: (\d+)ms/.exec(l.attributes('style') ?? '')?.[1]),
    ).toEqual(['0', '60', '180', '240'])
  })

  describe('small tiles', () => {
    afterEach(() => vi.restoreAllMocks())

    it('shows the name alone when the size does not fit, and nothing under 40 px', async () => {
      const widths: Record<string, number> = { a: 200, b: 70, c: 30, d: 120 }
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.dataset.tile) return widths[this.dataset.tile] ?? 0
        return this.classList.contains('amount') ? 62 : 0
      })
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100)
      const wrapper = mount(UiTreemap, { props: { tiles, label: 'Folders' } })
      await wrapper.vm.$nextTick()
      const forms = Object.fromEntries(
        wrapper
          .findAll('li')
          .map((l) => [l.attributes('data-tile'), l.classes().find((c) => c.startsWith('form-'))]),
      )
      expect(forms).toEqual({ a: 'form-full', b: 'form-name', c: 'form-none', d: 'form-full' })
      // What a tile leaves out is still in its tooltip.
      expect(wrapper.get('[data-tile="b"]').attributes('title')).toBe('storage/logs, 0.9 GB')
    })
  })

  it('shows growth in amber only when told it is growth', () => {
    const wrapper = mount(UiTreemap, { props: { tiles, label: 'Folders' } })
    expect(wrapper.find('.delta.grew').text()).toBe('+40 MB')
  })
})

describe('UiHeatStrip and UiHeatmap', () => {
  it('draws one cell per scan with its title and a tally beside the name', () => {
    const wrapper = mount(UiHeatStrip, {
      props: {
        name: 'kho-hang',
        summary: '2 warning',
        cells: ['ok', 'warn', 'crit', 'none'],
        titles: ['#1 ok'],
      },
    })
    expect(wrapper.findAll('.cell')).toHaveLength(4)
    expect(wrapper.text()).toContain('2 warning')
    expect(wrapper.findAll('.cell')[0]?.attributes('title')).toBe('#1 ok')
    expect(wrapper.get('.cells').attributes('style')).toContain('repeat(4')
  })

  it('gives a warning cell a triangle and a critical one a cross, and ok none', () => {
    const wrapper = mount(UiHeatStrip, {
      props: { name: 'p', summary: 's', cells: ['ok', 'warn', 'crit', 'none'] },
    })
    expect(wrapper.findAll('.cell').map((c) => c.find('svg').exists())).toEqual([
      false,
      true,
      true,
      false,
    ])
  })

  it('makes the strip one tab stop and walks its cells with the arrows', async () => {
    const wrapper = mount(UiHeatStrip, {
      attachTo: document.body,
      props: {
        name: 'p',
        summary: 's',
        cells: ['ok', 'warn', 'crit'],
        titles: ['#1 · healthy', '#2 · warning', '#3 · critical'],
      },
    })
    const cells = () => wrapper.findAll('.cell')
    expect(cells().map((c) => c.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
    expect(cells()[1]?.attributes('aria-label')).toBe('#2 · warning')
    await wrapper.get('.cells').trigger('keydown', { key: 'ArrowRight' })
    expect(cells().map((c) => c.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
    expect(document.activeElement).toBe(cells()[1]?.element)
    await wrapper.get('.cells').trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(cells()[2]?.element)
    await wrapper.get('.cells').trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(cells()[0]?.element)
    wrapper.unmount()
  })

  it('has no tab stop in a strip without titles', () => {
    const wrapper = mount(UiHeatStrip, { props: { name: 'p', summary: 's', cells: ['ok', 'ok'] } })
    expect(wrapper.find('[tabindex]').exists()).toBe(false)
  })

  const heat = {
    label: 'History',
    columns: [
      { id: '1', label: '#1' },
      { id: '2', label: '#2' },
      { id: '3', label: '#3' },
    ],
    rows: [
      {
        id: 'disk',
        label: 'Disk',
        icon: 'database' as const,
        cells: ['ok', 'warn', 'expected'] as const,
      },
      {
        id: 'sec',
        label: 'Security',
        icon: 'shield' as const,
        cells: ['none', 'crit', 'ok'] as const,
      },
    ],
  }

  it('gives every state but ok a glyph, so colour is never alone', () => {
    const wrapper = mount(UiHeatmap, { props: heat })
    const states = wrapper
      .findAll('.cell')
      .map((c) => [c.classes().find((k) => k.startsWith('state-')), c.find('svg').exists()])
    expect(states).toEqual([
      ['state-ok', false],
      ['state-warn', true],
      ['state-expected', true],
      ['state-none', true],
      ['state-crit', true],
      ['state-ok', false],
    ])
  })

  it('is a grid of rows and cells, one tab stop, walked with the four arrows', async () => {
    const titles = {
      titles: ['a', 'b', 'c'] as const,
    }
    const wrapper = mount(UiHeatmap, {
      attachTo: document.body,
      props: { ...heat, rows: heat.rows.map((row) => ({ ...row, ...titles })) },
    })
    expect(wrapper.attributes('role')).toBe('grid')
    expect(wrapper.findAll('[role="row"]')).toHaveLength(3)
    expect(wrapper.findAll('[role="columnheader"]')).toHaveLength(3)
    expect(wrapper.findAll('[role="rowheader"]')).toHaveLength(2)
    const cells = () => wrapper.findAll('[role="gridcell"]')
    expect(cells().filter((c) => c.attributes('tabindex') === '0')).toHaveLength(1)
    await wrapper.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cells()[3]?.element)
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cells()[4]?.element)
    await wrapper.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(cells()[1]?.element)
    wrapper.unmount()
  })

  it('does not make cells without a title focusable', () => {
    const wrapper = mount(UiHeatmap, { props: heat })
    expect(wrapper.find('[tabindex]').exists()).toBe(false)
  })

  it('rings the compared scans and marks their numbers', () => {
    const wrapper = mount(UiHeatmap, { props: { ...heat, selected: ['2'] } })
    expect(wrapper.findAll('.cell').filter((c) => c.classes().includes('ringed'))).toHaveLength(2)
    expect(wrapper.findAll('.col').map((c) => c.classes().includes('picked'))).toEqual([
      false,
      true,
      false,
    ])
  })

  it('pops cells in column then row order', () => {
    const wrapper = mount(UiHeatmap, { props: heat })
    expect(
      wrapper.findAll('.cell').map((c) => /--d: (\d+)ms/.exec(c.attributes('style') ?? '')?.[1]),
    ).toEqual(['0', '90', '180', '30', '120', '210'])
  })
})

describe('UiTopology', () => {
  const states = { ok: 'Healthy', warn: 'Warning', crit: 'Critical', unknown: 'Unknown' }
  const mountIt = (
    components: {
      id: string
      label: string
      host: string
      state: 'ok' | 'warn' | 'crit' | 'unknown'
    }[],
  ) =>
    mount(UiTopology, {
      props: {
        components,
        urlLabel: 'URL',
        states,
        moreLabel: (n: number) => `and ${n} more`,
        label: 'Path',
      },
    })

  it('starts at the URL and names a server only where it changes', () => {
    const wrapper = mountIt([
      { id: 'fe', label: 'FE', host: 'vps-a', state: 'ok' },
      { id: 'be', label: 'BE', host: 'vps-b', state: 'warn' },
      { id: 'db', label: 'DB', host: 'vps-b', state: 'crit' },
    ])
    const nodes = wrapper.findAll('.node')
    expect(nodes.map((n) => n.find('.label').text())).toEqual(['URL', 'FE', 'BE', 'DB'])
    expect(nodes.map((n) => n.find('.caption').exists())).toEqual([false, true, true, false])
    expect(wrapper.findAll('.link')).toHaveLength(3)
  })

  it('writes each state for screen readers', () => {
    const wrapper = mountIt([{ id: 'db', label: 'DB', host: 'a', state: 'crit' }])
    expect(wrapper.findAll('.node')[1]?.find('.sr-only').text()).toBe('Critical')
  })

  it('folds past four into "+N" and says how many', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
      id,
      label: id.toUpperCase(),
      host: 'h',
      state: 'ok' as const,
    }))
    const wrapper = mountIt(many)
    const nodes = wrapper.findAll('.node')
    expect(nodes).toHaveLength(6)
    expect(nodes[5]?.text()).toContain('+2')
    expect(nodes[5]?.find('.sr-only').text()).toBe('and 2 more')
  })
})

describe('UiIssueColumns', () => {
  const scans = [
    { id: '1', label: '#1', crit: 0, warn: 2, info: 1, description: '2 warning, 1 info' },
    { id: '2', label: '#2', crit: 1, warn: 3, info: 0, description: '1 critical, 3 warning' },
  ]

  it('stacks 16 px an issue and gives each column its description', () => {
    const wrapper = mount(UiIssueColumns, { props: { scans, label: 'Issues' } })
    const columns = wrapper.findAll('.column')
    expect(columns[1]?.findAll('.segment').map((s) => s.attributes('style'))).toEqual([
      expect.stringContaining('height: 16px'),
      expect.stringContaining('height: 48px'),
    ])
    expect(columns[1]?.attributes('title')).toBe('#2: 1 critical, 3 warning')
    expect(columns[1]?.find('.sr-only').text()).toBe('#2: 1 critical, 3 warning')
  })

  it('can be focused once every scan has a card, and reads the same words it shows', async () => {
    const withTips = scans.map((scan, i) => ({
      ...scan,
      tip: {
        title: `Scan #${i + 1} · 24 Sep`,
        value: '3 issues',
        spoken: `Scan ${i + 1}, 24 September, 3 issues, ${scan.description}`,
      },
    }))
    const wrapper = mount(UiIssueColumns, { props: { scans: withTips, label: 'Issues' } })
    const stage = wrapper.get('[role="group"]')
    expect(stage.attributes('tabindex')).toBe('0')
    await stage.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('.tip').text()).toContain('Scan #2 · 24 Sep')
    expect(wrapper.get('[aria-live]').text()).toBe(
      'Scan 2, 24 September, 3 issues, 1 critical, 3 warning',
    )
    expect(wrapper.findAll('.num').map((n) => n.classes().includes('now'))).toEqual([false, true])
    await stage.trigger('keydown', { key: 'Home' })
    expect(wrapper.findAll('.num').map((n) => n.classes().includes('now'))).toEqual([true, false])
  })

  it('stays a plain list while a scan has no card', () => {
    const wrapper = mount(UiIssueColumns, { props: { scans, label: 'Issues' } })
    expect(wrapper.find('[tabindex]').exists()).toBe(false)
    expect(wrapper.get('ul').attributes('aria-label')).toBe('Issues')
  })

  it('numbers the scans in ink, and faded ones in ink-3 as the board does', () => {
    const source = readFileSync(join(process.cwd(), 'src/ui/UiIssueColumns.vue'), 'utf8')
    expect(source).toMatch(/\.num \{[^}]*color: var\(--ink\);/)
    expect(source).toMatch(/\.faded \.num \{\s*color: var\(--ink-3\);/)
  })

  it('fades the scans that are not being compared', () => {
    const wrapper = mount(UiIssueColumns, { props: { scans, compared: ['2'], label: 'Issues' } })
    expect(wrapper.findAll('.column').map((c) => c.classes().includes('faded'))).toEqual([
      true,
      false,
    ])
    expect(
      mount(UiIssueColumns, { props: { scans, label: 'Issues' } }).findAll('.faded'),
    ).toHaveLength(0)
  })
})

describe('chart sources', () => {
  const files = [
    'UiBarChart',
    'UiChartLegend',
    'UiChartTip',
    'UiColumnStage',
    'UiDonut',
    'UiGauge',
    'UiHeatStrip',
    'UiHeatmap',
    'UiHistoryChart',
    'UiIssueColumns',
    'UiMeter',
    'UiShareBar',
    'UiSparkline',
    'UiStackedBar',
    'UiTopology',
    'UiTopologyNode',
    'UiTreemap',
  ]

  it.each(files)('%s draws no emoji and no raw html', (name) => {
    const source = readFileSync(join(process.cwd(), `src/ui/${name}.vue`), 'utf8')
    expect(source).not.toMatch(/v-html|innerHTML/)
    expect(source).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it.each(files)('%s animates only through the shared motion classes', (name) => {
    const source = readFileSync(join(process.cwd(), `src/ui/${name}.vue`), 'utf8')
    expect(source).not.toMatch(/@keyframes/)
  })
})
