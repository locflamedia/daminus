// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { brandOfEngine, brandOfImage, brandOfKind } from './brand-marks'
import UiBrandMark from './UiBrandMark.vue'

describe('brand marks', () => {
  it('names the technology of an engine, a kind and an image, and nothing else', () => {
    expect(brandOfEngine('postgres')).toBe('postgresql')
    expect(brandOfEngine('mysql')).toBe('mysql')
    expect(brandOfEngine('sqlite')).toBeNull()
    expect(brandOfKind('compose')).toBe('docker')
    expect(brandOfKind('pm2')).toBe('pm2')
    expect(brandOfKind('path')).toBeNull()
    expect(brandOfImage('postgres:16.4')).toBe('postgresql')
    expect(brandOfImage('docker.io/library/redis:7.2')).toBe('redis')
    expect(brandOfImage('tiemtra-api:1.5.0')).toBeNull()
    expect(brandOfImage(null)).toBeNull()
  })

  it('draws the image when named and the fallback otherwise', () => {
    const named = mount(UiBrandMark, { props: { name: 'redis', size: 16 } })
    expect(named.find('img').attributes('width')).toBe('16')
    expect(named.find('img').attributes('aria-hidden')).toBe('true')
    const none = mount(UiBrandMark, { slots: { default: '<i class="dot" />' } })
    expect(none.find('img').exists()).toBe(false)
    expect(none.find('.dot').exists()).toBe(true)
  })
})
