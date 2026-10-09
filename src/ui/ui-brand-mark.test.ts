// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { brandOfDistro, brandOfEngine, brandOfImage, brandOfKind } from './brand-marks'
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

  it('names only the distributions that have a mark, from the login report text', () => {
    expect(brandOfDistro('Ubuntu 22.04.5 LTS')).toBe('ubuntu')
    expect(brandOfDistro('Debian GNU/Linux 12 (bookworm)')).toBe('debian')
    expect(brandOfDistro('Rocky Linux 9.4')).toBeNull()
    expect(brandOfDistro('')).toBeNull()
    expect(brandOfDistro(null)).toBeNull()
  })

  it('turns a black single-colour mark white on dark, and lifts a dark coloured one', () => {
    const termius = mount(UiBrandMark, { props: { name: 'termius' } })
    expect(termius.classes()).toContain('brand-invert')
    expect(termius.classes()).not.toContain('brand-lift')
    const mysql = mount(UiBrandMark, { props: { name: 'mysql' } })
    expect(mysql.classes()).toContain('brand-lift')
    expect(mysql.classes()).not.toContain('brand-invert')
  })

  it('draws the image when named and the fallback otherwise', () => {
    const named = mount(UiBrandMark, { props: { name: 'redis', size: 16 } })
    expect(named.find('img').attributes('width')).toBe('16')
    expect(named.find('img').attributes('aria-hidden')).toBe('true')
    const none = mount(UiBrandMark, { slots: { default: '<i class="dot" />' } })
    expect(none.find('img').exists()).toBe(false)
    expect(none.find('.dot').exists()).toBe(true)
  })

  it('keeps the class from the caller on a single mark and on a light and dark pair', () => {
    const single = mount(UiBrandMark, { props: { name: 'docker' }, attrs: { class: 'mark' } })
    expect(single.find('img.mark').exists()).toBe(true)
    const pair = mount(UiBrandMark, { props: { name: 'anthropic' }, attrs: { class: 'mark' } })
    expect(pair.classes()).toContain('mark')
    expect(pair.findAll('img').map((i) => i.classes())).toEqual([
      expect.arrayContaining(['brand-light']),
      expect.arrayContaining(['brand-dark']),
    ])
  })

  it('names the owner only when the mark stands alone', () => {
    const quiet = mount(UiBrandMark, { props: { name: 'redis' } })
    expect(quiet.attributes('aria-hidden')).toBe('true')
    const single = mount(UiBrandMark, { props: { name: 'redis', labelled: true } })
    expect(single.attributes('alt')).toBe('Redis')
    expect(single.attributes('aria-hidden')).toBeUndefined()
    const pair = mount(UiBrandMark, { props: { name: 'openai', labelled: true } })
    expect(pair.attributes('role')).toBe('img')
    expect(pair.attributes('aria-label')).toBe('OpenAI')
  })
})
