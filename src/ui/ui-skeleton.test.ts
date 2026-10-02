// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import UiSkeleton from './UiSkeleton.vue'

const source = readFileSync(join(process.cwd(), 'src/ui/UiSkeleton.vue'), 'utf8')

describe('UiSkeleton', () => {
  it('is a hidden bar of the size it stands in for', () => {
    const wrapper = mount(UiSkeleton, { props: { width: '40%', height: '15px', radius: '4px' } })
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    const style = wrapper.attributes('style') ?? ''
    expect(style).toContain('width: 40%')
    expect(style).toContain('height: 15px')
    expect(style).toContain('border-radius: 4px')
  })

  it('has the darker and the lighter bar', () => {
    expect(mount(UiSkeleton).classes()).toContain('skeleton-strong')
    expect(mount(UiSkeleton, { props: { tone: 'soft' } }).classes()).toContain('skeleton-soft')
  })

  it('sheens by default and can be still', () => {
    expect(mount(UiSkeleton).classes()).toContain('sheen')
    expect(mount(UiSkeleton, { props: { sheen: false } }).classes()).not.toContain('sheen')
  })

  it('starts the sheen only after the delay token, and stops it under Reduce Motion', () => {
    expect(source).toContain('var(--delay-sheen)')
    expect(source).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation: none/)
    // No backwards fill, or the sheen would show during the delay.
    expect(source).not.toMatch(/var\(--delay-sheen\) infinite both/)
  })
})
