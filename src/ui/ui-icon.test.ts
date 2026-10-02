// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiIcon from './UiIcon.vue'
import { ICON_PATHS, strokeForSize } from './icon-paths'

describe('strokeForSize', () => {
  it.each([
    [12, 1.8],
    [14, 1.6],
    [16, 1.5],
    [18, 1.4],
    [24, 1.3],
  ])('thins the stroke as the icon grows: %ipx is %f', (size, stroke) => {
    expect(strokeForSize(size)).toBe(stroke)
  })

  it('takes the nearest step between two sizes', () => {
    expect(strokeForSize(13)).toBe(1.8)
    expect(strokeForSize(15)).toBe(1.6)
    expect(strokeForSize(20)).toBe(1.4)
    expect(strokeForSize(28)).toBe(1.3)
  })
})

describe('UiIcon', () => {
  it('draws with the stroke its size calls for, unless told otherwise', () => {
    expect(mount(UiIcon, { props: { name: 'check', size: 12 } }).attributes('stroke-width')).toBe(
      '1.8',
    )
    expect(mount(UiIcon, { props: { name: 'check' } }).attributes('stroke-width')).toBe('1.5')
    expect(
      mount(UiIcon, { props: { name: 'check', size: 14, stroke: 2 } }).attributes('stroke-width'),
    ).toBe('2')
  })

  it('draws the dashed ring of "not set up"', () => {
    const icon = mount(UiIcon, { props: { name: 'circle', dashed: true } })
    expect(icon.attributes('stroke-dasharray')).toBe('2 2')
    expect(
      mount(UiIcon, { props: { name: 'circle' } }).attributes('stroke-dasharray'),
    ).toBeUndefined()
  })

  it('has the arrows of the delta pill and the overflow dots', () => {
    for (const name of ['arrow-up', 'arrow-down', 'minus', 'more'] as const) {
      expect(ICON_PATHS[name].length).toBeGreaterThan(3)
    }
    expect(ICON_PATHS['arrow-up']).toBe(ICON_PATHS.send)
  })
})
