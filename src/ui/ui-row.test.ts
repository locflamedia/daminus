// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiRow from './UiRow.vue'
import UiRowList from './UiRowList.vue'

describe('UiRow actions', () => {
  it('holds actions that reveal on hover and focus, and marks the row as their host', () => {
    const wrapper = mount(UiRow, {
      props: { size: 'compact', title: 'storage/logs' },
      slots: { actions: '<button type="button">Copy</button>' },
    })
    expect(wrapper.classes()).toContain('m-actions-host')
    expect(wrapper.get('.actions').classes()).toContain('m-actions')
    expect(wrapper.get('.actions button').text()).toBe('Copy')
  })

  it('has no host mark without actions', () => {
    expect(mount(UiRow, { props: { title: 'x' } }).classes()).not.toContain('m-actions-host')
  })
})

describe('UiRow', () => {
  it('draws a tile, a title, a meta line and a trailing slot', () => {
    const wrapper = mount(UiRow, {
      props: {
        size: 'status',
        tone: 'warn',
        tile: 'warn',
        title: 'Database grew 1.1 GB',
        meta: 'Warning, since scan #41',
      },
      slots: { trailing: '<span class="chip">+1.1 GB</span>' },
    })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['row-status', 'tone-warn']))
    expect(wrapper.get('.tile svg').attributes('width')).toBe('16')
    expect(wrapper.get('.title').text()).toBe('Database grew 1.1 GB')
    expect(wrapper.get('.meta').text()).toBe('Warning, since scan #41')
    expect(wrapper.get('.trailing').text()).toBe('+1.1 GB')
    expect(wrapper.attributes('data-flat')).toBe('true')
  })

  it('has the three board heights as classes', () => {
    for (const size of ['compact', 'default', 'status'] as const) {
      expect(mount(UiRow, { props: { size } }).classes()).toContain(`row-${size}`)
    }
  })

  it('uses a 14 px glyph in the 28 px tile of the smaller rows', () => {
    const wrapper = mount(UiRow, { props: { tile: 'server', title: 'api' } })
    expect(wrapper.get('.tile svg').attributes('width')).toBe('14')
  })

  it('starts the text at the padding when there is no leading mark', () => {
    expect(mount(UiRow, { props: { title: 'x' } }).classes()).toContain('no-lead')
    expect(mount(UiRow, { props: { title: 'x', tile: 'server' } }).classes()).not.toContain(
      'no-lead',
    )
    expect(
      mount(UiRow, { props: { title: 'x' }, slots: { leading: '<i class="mine" />' } }).classes(),
    ).not.toContain('no-lead')
  })

  it('shows a spinner in the tile while the row is being read, and can be a white row on grey', () => {
    const wrapper = mount(UiRow, {
      props: { busy: true, raised: true, title: 'Scanning vps-sg-1' },
    })
    expect(wrapper.find('.tile svg.spinner').exists()).toBe(true)
    expect(wrapper.classes()).toContain('row-raised')
    expect(wrapper.classes()).not.toContain('no-lead')
  })

  it('shows host names in the mono face', () => {
    const wrapper = mount(UiRow, { props: { title: 'vps-sg-1', meta: 'up 41 d', mono: true } })
    expect(wrapper.get('.title').classes()).toContain('mono')
    expect(wrapper.get('.meta').classes()).toContain('mono')
  })

  it('is a grid of its own cells with `columns`, and a column header with `header`', () => {
    const wrapper = mount(UiRow, {
      props: { columns: 'minmax(0, 1.7fr) repeat(4, minmax(0, 1fr)) 110px', header: true },
      slots: { default: '<span>Host</span><span>Disk</span>' },
    })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['row-cells', 'row-header']))
    expect(wrapper.attributes('style')).toContain('grid-template-columns')
    expect(wrapper.findAll('span').map((s) => s.text())).toEqual(['Host', 'Disk'])
    expect(wrapper.find('.tile').exists()).toBe(false)
  })

  it('is a real button when asked, and reports clicks', async () => {
    const wrapper = mount(UiRow, { props: { as: 'button', title: 'events grows 1.1 GB' } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('renders every string as text', () => {
    const hostile = '<img src=x onerror=alert(1)>'
    const wrapper = mount(UiRow, { props: { title: hostile, meta: hostile } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.title').text()).toBe(hostile)
  })
})

describe('UiRowList', () => {
  it('is a zebra list of rows 2 px apart, and says which rows keep their own tint', () => {
    const wrapper = mount(UiRowList, {
      props: { label: 'Steps' },
      slots: {
        default: ['<li>one</li>', '<li>two</li>'],
      },
    })
    expect(wrapper.element.tagName).toBe('UL')
    expect(wrapper.classes()).toContain('zebra')
    expect(wrapper.attributes('aria-label')).toBe('Steps')

    const tinted = mount(UiRow, { props: { tone: 'warn', title: 'x', as: 'li' } })
    const header = mount(UiRow, { props: { header: true, columns: '1fr', as: 'li' } })
    const plain = mount(UiRow, { props: { title: 'x', as: 'li' } })
    expect(tinted.attributes('data-flat')).toBe('true')
    expect(header.attributes('data-flat')).toBe('true')
    expect(plain.attributes('data-flat')).toBeUndefined()
  })

  it('can turn the stripes off or be a div', () => {
    const wrapper = mount(UiRowList, { props: { zebra: false, as: 'div' } })
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.classes()).not.toContain('zebra')
  })
})
