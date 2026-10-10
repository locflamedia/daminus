// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import EmptyStack from './components/EmptyStack.vue'
import HelpRow from './components/HelpRow.vue'

describe('Recognises out of the box', () => {
  it('draws each stack with its own mark, a grey face and a colour face, not a letter', () => {
    const wrapper = mount(EmptyStack, { global: { plugins: [i18n] } })
    const tiles = wrapper.findAll('.tile')
    expect(tiles).toHaveLength(10)
    for (const tile of tiles) {
      expect(tile.findAll('img')).toHaveLength(2)
      expect(tile.text()).toBe('')
    }
    expect(wrapper.findAll('.name').map((n) => n.text())).toEqual([
      'Ubuntu',
      'Debian',
      'Docker',
      'Nginx',
      'PM2',
      'Node.js',
      'Laravel',
      'MySQL',
      'Postgres',
      'Redis',
    ])
    // The wave walks across the row, one tile after the other.
    const delays = wrapper.findAll('img.colour').map((img) => img.attributes('style'))
    expect(delays[0]).toContain('animation-delay: 0ms')
    expect(delays[1]).toContain('animation-delay: 140ms')
  })
})

describe('What Daminus found on this Mac', () => {
  it('draws the glyph of the row in its tile', () => {
    const props = {
      icon: 'file',
      name: '~/.ssh/config',
      sub: 'x',
      chip: 'not found',
      tone: 'warn',
    } as const
    const row = mount(HelpRow, { props })
    expect(row.find('.tile img').exists()).toBe(false)
    expect(row.find('.tile svg').exists()).toBe(true)
  })
})
