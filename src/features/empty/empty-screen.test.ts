// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HostListing, SshEnvironment } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { useProjectsStore } from '@/stores/projects'
import { useSetupStore } from '@/stores/setup'
import { emptyListing, sampleListing } from '@/testing/setup-fixture'
import EmptyScreen from './EmptyScreen.vue'

vi.mock('@/api/clipboard', () => ({ copyText: vi.fn().mockResolvedValue(undefined) }))

interface World {
  listing: HostListing
  env: SshEnvironment
  reads: number
}

const KEYS: SshEnvironment = { agent: 'keys', keys: 2 }
let world: World
const mounted: VueWrapper[] = []

async function mountScreen() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/setup', name: 'setup', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const wrapper = mount(EmptyScreen, {
    attachTo: document.body,
    global: { plugins: [i18n, router] },
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  world = { listing: sampleListing(), env: KEYS, reads: 0 }
  mockCommands((cmd) => {
    if (cmd === 'hosts_list') {
      world.reads++
      return world.listing
    }
    if (cmd === 'ssh_environment') return world.env
    return null
  })
  // `projects.json` was read and holds nothing: the empty app.
  useProjectsStore().loaded = true
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  clearMocks()
  document.body.replaceChildren()
})

describe('the first screen', () => {
  it('pitches one way forward and previews the hosts of the config', async () => {
    const { wrapper } = await mountScreen()
    expect(wrapper.text()).toContain('Check every server in one pass.')
    const rows = wrapper.findAll('.host')
    expect(rows).toHaveLength(6)
    expect(rows[0]?.text()).toContain('vps-sg-1')
    expect(rows[0]?.text()).toContain('203.0.113.14')
    expect(rows[0]?.text()).toContain('id_ed25519')
    expect(wrapper.text()).toContain('6 servers found')
    expect(wrapper.find('.help').exists()).toBe(false)
  })

  it('says which line of the ssh config ssh refused, above the hosts it read', async () => {
    world.listing = {
      ...sampleListing(),
      config_error: {
        error: {
          code: { kind: 'ssh_config_invalid', path: '/u/.ssh/config', line: 6 },
          retryable: false,
        },
        excerpt: [
          { number: 5, text: 'Host apollo-2' },
          { number: 6, text: '  Port 99999' },
          { number: 7, text: '  User root' },
        ],
      },
    }
    const { wrapper } = await mountScreen()
    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('Could not read your SSH config')
    expect(alert.text()).toContain('ssh stops at line 6 of /u/.ssh/config')
    expect(wrapper.findAll('.host')).toHaveLength(6)
  })

  it('says why a skipped git remote is left out and keeps patterns quiet', async () => {
    const { wrapper } = await mountScreen()
    const skips = wrapper.findAll('.skip').map((s) => s.text())
    expect(skips).toEqual([
      'github.com looks like a git remote, so it is left out. You can add it back.',
    ])
  })

  it('shows the agent chip with the count of keys and the Scan all button, off, with a reason', async () => {
    const { wrapper } = await mountScreen()
    expect(wrapper.get('.agent').text()).toBe('ssh-agent · 2 keys loaded')
    const scan = wrapper.get('.scan')
    expect(scan.attributes('aria-disabled')).toBe('true')
    expect(scan.attributes('title')).toBe('Add a project first')
    expect(scan.text()).toContain('Scan all')
  })

  it('goes to setup when Import is pressed, or Return is', async () => {
    const { wrapper, router } = await mountScreen()
    const button = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Import from ~/.ssh/config'))
    await button?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/setup')

    await router.push('/')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/setup')
  })

  it('opens the sheet to add a host by hand, by button and by ⌘N', async () => {
    const { wrapper } = await mountScreen()
    const setup = useSetupStore()
    const button = wrapper.findAll('button').find((b) => b.text().includes('Add a host by hand'))
    await button?.trigger('click')
    expect(setup.addHostOpen).toBe(true)
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()

    setup.addHostOpen = false
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true }))
    expect(setup.addHostOpen).toBe(true)
  })

  it('reads the ssh config and the agent once when it appears', async () => {
    await mountScreen()
    expect(world.reads).toBe(1)
  })
})

describe('the help screen', () => {
  it('cause A: names the missing file, with the two rows and the three steps', async () => {
    world.listing = emptyListing('no_config')
    world.env = { agent: 'empty', keys: 0 }
    const { wrapper } = await mountScreen()
    expect(wrapper.find('h2').text()).toBe(
      'No ssh config yet. Let’s make your servers visible to ssh.',
    )
    const rows = wrapper.findAll('.found .row').map((r) => r.text())
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('No file yet. Daminus reads Host blocks from here.')
    expect(rows[0]).toContain('not found')
    expect(rows[1]).toContain('Running, but holds no keys.')
    expect(rows[1]).toContain('0 keys')
    expect(wrapper.findAll('.steps .step')).toHaveLength(3)
    expect(wrapper.find('.left-out').exists()).toBe(false)
  })

  it('cause B: says the config has no usable host and lists what was left out, with where', async () => {
    world.listing = emptyListing('no_usable_hosts')
    world.env = { agent: 'empty', keys: 0 }
    const { wrapper } = await mountScreen()
    expect(wrapper.find('h2').text()).toBe('Your ssh config has no host Daminus can use yet.')
    expect(wrapper.get('.found').text()).toContain('4 entries, 0 usable')
    expect(wrapper.get('.left-out .toggle').text()).toBe('Left out (4)')
    const rows = wrapper
      .findAll('.left-out .row')
      .map((r) => r.findAll('span').map((s) => s.text()))
    expect(rows).toEqual([
      ['*', 'pattern', '~/.ssh/config:1'],
      ['Match host *.corp', 'Match block', '~/.ssh/config:6'],
      ['bastion', 'no HostName', 'config.d/jump:2'],
      ['my server', 'unusable alias', '~/.ssh/config:19'],
    ])
    // Step 3 becomes "Add one Host block with a HostName".
    expect(wrapper.text()).toContain('Add one Host block with a HostName')
    expect(wrapper.text()).not.toContain('Describe each server once')
  })

  it('folds the left-out list', async () => {
    world.listing = emptyListing('no_usable_hosts')
    const { wrapper } = await mountScreen()
    const toggle = wrapper.get('.left-out .toggle')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.left-out .list').isVisible()).toBe(false)
  })

  it('shows only the agent row and its steps when the config is fine', async () => {
    world.env = { agent: 'empty', keys: 0 }
    const { wrapper } = await mountScreen()
    expect(wrapper.find('h2').text()).toBe('Your ssh-agent holds no key yet. Let’s load one.')
    expect(wrapper.findAll('.found .row')).toHaveLength(1)
    expect(wrapper.get('.found').text()).toContain('ssh-agent')
    expect(wrapper.findAll('.steps .step')).toHaveLength(2)
    expect(wrapper.find('.fields').exists()).toBe(false)
  })

  it('tells to put the key in ~/.ssh, or create one, in the first step', async () => {
    world.listing = emptyListing('no_config')
    world.env = { agent: 'empty', keys: 0 }
    const { wrapper } = await mountScreen()
    expect(wrapper.get('.steps .step').text()).toContain(
      'Put the private key for your servers in ~/.ssh (or create one with ssh-keygen).',
    )
  })

  it('keeps Import off until the config has a host and the agent a key', async () => {
    world.listing = emptyListing('no_config')
    world.env = { agent: 'empty', keys: 0 }
    const { wrapper } = await mountScreen()
    const button = () => wrapper.get('.import')
    expect(button().attributes('aria-disabled')).toBe('true')
    expect(button().text()).toContain('Import 0 hosts')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(useSetupStore().addHostOpen).toBe(false)
  })

  it('Check again reads the config and the agent again, and the rows turn green in place', async () => {
    world.listing = emptyListing('no_config')
    world.env = { agent: 'empty', keys: 0 }
    const { wrapper, router } = await mountScreen()
    expect(world.reads).toBe(1)

    world.listing = sampleListing([
      {
        alias: 'vps-sg-1',
        hostname: '203.0.113.14',
        user: 'root',
        port: 22,
        key: '~/.ssh/id_ed25519',
        outcome: { state: 'reached' },
        ms: 1,
        delay: 0,
      },
    ])
    world.env = { agent: 'keys', keys: 1 }
    const check = wrapper.findAll('button').find((b) => b.text().includes('Check again'))
    await check?.trigger('click')
    await flushPromises()

    expect(world.reads).toBe(2)
    // The screen stays, with the rows green and Import live.
    expect(wrapper.find('.help').exists()).toBe(true)
    expect(wrapper.find('h2').text()).toBe('Ready. Import 1 host.')
    // No step is left, so no subtitle counts any.
    expect(wrapper.find('.words p').exists()).toBe(false)
    const steps = wrapper.findAll('.step')
    expect(steps.length).toBeGreaterThan(0)
    for (const step of steps) {
      expect(step.classes()).toContain('done')
      expect(step.text()).toContain('Done')
    }
    const rows = wrapper.findAll('.found .row').map((r) => r.text())
    expect(rows[0]).toContain('Found 1 Host block: vps-sg-1.')
    expect(rows[0]).toContain('1 host')
    expect(rows[1]).toContain('1 key loaded.')
    const importButton = wrapper.get('.import')
    expect(importButton.attributes('aria-disabled')).toBeUndefined()
    expect(importButton.text()).toContain('Import 1 host')

    await importButton.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/setup')
  })

  it('says one step is left once the key is loaded, without leaving the screen', async () => {
    world.listing = emptyListing('no_config')
    world.env = { agent: 'empty', keys: 0, termius_installed: true }
    const { wrapper } = await mountScreen()
    world.env = { agent: 'keys', keys: 1, termius_installed: true }
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Check again'))
      ?.trigger('click')
    await flushPromises()
    expect(wrapper.find('h2').text()).toBe('Key loaded. One step left: describe your servers.')
    expect(wrapper.find('.words p').text()).toContain('1 one-time step.')
    const done = wrapper.findAll('.step.done').map((s) => s.text())
    expect(done).toHaveLength(2)
    expect(wrapper.findAll('.step:not(.done)')).toHaveLength(1)
    expect(wrapper.get('.import').attributes('aria-disabled')).toBe('true')
  })

  it('counts the hosts on the Import button with the plural form', async () => {
    const host = (alias: string) => ({
      alias,
      hostname: '203.0.113.14',
      user: 'root',
      port: 22,
      key: '~/.ssh/id_ed25519',
      outcome: { state: 'reached' as const },
      ms: 1,
      delay: 0,
    })
    world.listing = sampleListing([host('a'), host('b')])
    world.env = { agent: 'empty', keys: 0 }
    const { wrapper } = await mountScreen()
    expect(wrapper.get('.import').text()).toContain('Import 2 hosts')
  })

  it('checks again on ⇧⌘R', async () => {
    world.listing = emptyListing('no_config')
    await mountScreen()
    expect(world.reads).toBe(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', metaKey: true, shiftKey: true }))
    await flushPromises()
    expect(world.reads).toBe(2)
  })

  it('follows what is typed in the form: the block, and the alias in the test line', async () => {
    world.listing = emptyListing('no_config')
    world.env = { agent: 'empty', keys: 0 }
    const { wrapper } = await mountScreen()
    const inputs = wrapper.findAll('.fields input')
    await inputs[0]?.setValue('db-main')
    await inputs[1]?.setValue('10.0.0.40')
    const first = wrapper.get('.snippet .ln').findAll('span')
    expect(first.map((s) => s.text())).toEqual(['Host', 'db-main'])
    expect(wrapper.get('.test .text').text()).toBe("ssh db-main 'echo ok'")
  })
})
