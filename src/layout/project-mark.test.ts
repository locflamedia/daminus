// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProjectDot from './ProjectDot.vue'
import ProjectTile from './ProjectTile.vue'

describe('ProjectDot', () => {
  it('is a dot in the colour of the project', () => {
    const wrapper = mount(ProjectDot, { props: { level: 'crit', color: '#e0649a' } })
    expect(wrapper.find('.own').attributes('style')).toContain('--mark: #e0649a')
    expect(wrapper.find('.state-crit').exists()).toBe(false)
  })

  it('shows the status when the project has no colour yet', () => {
    const wrapper = mount(ProjectDot, { props: { level: 'crit' } })
    expect(wrapper.find('.own').exists()).toBe(false)
    expect(wrapper.find('.state-crit').exists()).toBe(true)
  })

  it('turns into the reading ring while the project is read, whatever its colour', () => {
    const wrapper = mount(ProjectDot, { props: { level: 'ok', color: '#4f6bed', reading: true } })
    expect(wrapper.find('.spinner').exists()).toBe(true)
    expect(wrapper.find('.own').exists()).toBe(false)
  })
})

describe('ProjectTile', () => {
  it('holds a dot in the project colour when there is no logo', () => {
    const wrapper = mount(ProjectTile, { props: { color: '#9a7bea' } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.dot').classes()).not.toContain('plain')
    expect(wrapper.attributes('style')).toContain('--mark: #9a7bea')
  })

  it('shows a grey dot when it has neither a logo nor a colour', () => {
    const wrapper = mount(ProjectTile)
    expect(wrapper.find('.dot').classes()).toContain('plain')
  })

  it('shows the logo of the main framework when it is known', () => {
    const wrapper = mount(ProjectTile, { props: { color: '#9a7bea', logo: '/laravel.svg' } })
    expect(wrapper.get('img').attributes('src')).toBe('/laravel.svg')
    expect(wrapper.find('.dot').exists()).toBe(false)
  })

  it('carries the issue count in the severity colour, and nothing when healthy', () => {
    const crit = mount(ProjectTile, { props: { level: 'crit', count: 3 } })
    expect(crit.get('.badge').text()).toBe('3')
    expect(crit.get('.badge').classes()).toContain('crit')
    const warn = mount(ProjectTile, { props: { level: 'warn', count: 120 } })
    expect(warn.get('.badge').text()).toBe('99+')
    expect(warn.get('.badge').classes()).toContain('warn')
    expect(
      mount(ProjectTile, { props: { count: 0 } })
        .find('.badge')
        .exists(),
    ).toBe(false)
  })

  it('rings the open project in its own colour only when it has one', () => {
    expect(mount(ProjectTile, { props: { color: '#e0649a', active: true } }).classes()).toContain(
      'active',
    )
    expect(mount(ProjectTile, { props: { active: true } }).classes()).not.toContain('active')
  })
})
