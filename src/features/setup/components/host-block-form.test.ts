// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { copyText } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n } from '@/i18n'
import { emptyFields, type HostBlockFields } from '@/lib/host-block'
import { useSetupStore } from '@/stores/setup'
import AddHostSheet from './AddHostSheet.vue'
import HostBlockForm from './HostBlockForm.vue'

vi.mock('@/api/clipboard', () => ({ copyText: vi.fn() }))

const mounted: VueWrapper[] = []

/** The form with its v-model held by a host, as a screen does. */
function mountForm(props: Record<string, unknown> = {}) {
  const fields = ref<HostBlockFields>(emptyFields())
  const Host = defineComponent({
    components: { HostBlockForm },
    setup: () => ({ fields, props }),
    template: '<HostBlockForm v-model="fields" v-bind="props" />',
  })
  const wrapper = mount(Host, { attachTo: document.body, global: { plugins: [i18n] } })
  mounted.push(wrapper)
  return { wrapper, fields }
}

async function fill(wrapper: VueWrapper, values: Partial<HostBlockFields>) {
  const order = ['alias', 'hostName', 'user', 'port', 'identityFile'] as const
  const inputs = wrapper.findAll('input')
  for (const [i, key] of order.entries()) {
    const value = values[key]
    if (value !== undefined) await inputs[i]?.setValue(value)
  }
}

const lines = (wrapper: VueWrapper) =>
  wrapper.findAll('.snippet .ln').map((l) =>
    l
      .findAll('span')
      .map((s) => s.text())
      .join(' '),
  )

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(copyText).mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  clearMocks()
  document.body.replaceChildren()
})

describe('HostBlockForm', () => {
  it('draws the five fields and an example block before anything is typed', () => {
    const { wrapper } = mountForm()
    expect(wrapper.findAll('label').map((l) => l.text())).toEqual([
      'Alias',
      'HostName',
      'User',
      'Port',
      'IdentityFile',
    ])
    expect(lines(wrapper)).toEqual([
      'Host vps-sg-1',
      'HostName 203.0.113.14',
      'User root',
      'Port 22',
      'IdentityFile ~/.ssh/id_ed25519',
      'AddKeysToAgent yes',
      'UseKeychain yes',
    ])
    expect(wrapper.findAll('.v.example')).toHaveLength(4)
  })

  it('types the block live as the form is filled', async () => {
    const { wrapper } = mountForm()
    await fill(wrapper, { alias: 'db-main', hostName: '10.0.0.40' })
    expect(lines(wrapper).slice(0, 2)).toEqual(['Host db-main', 'HostName 10.0.0.40'])
    await fill(wrapper, { user: 'admin', port: '2222', identityFile: '~/.ssh/db_key' })
    expect(lines(wrapper)).toEqual([
      'Host db-main',
      'HostName 10.0.0.40',
      'User admin',
      'Port 2222',
      'IdentityFile ~/.ssh/db_key',
      'AddKeysToAgent yes',
      'UseKeychain yes',
    ])
    expect(wrapper.findAll('.v.example')).toHaveLength(0)
  })

  it('names what is wrong in the field, in words', async () => {
    const { wrapper } = mountForm()
    await fill(wrapper, {
      alias: 'my server',
      hostName: 'a b',
      port: '70000',
      identityFile: 'key',
      user: '-x',
    })
    const notes = wrapper.findAll('.note').map((n) => n.text())
    expect(notes).toEqual([
      'Letters, digits, dot, underscore and dash; start with a letter or digit.',
      'Use a domain or an IP address, without spaces.',
      'Letters, digits, dot, underscore and dash; no spaces.',
      'A number from 1 to 65535.',
      'A path that starts with ~/ or /, without spaces.',
    ])
    expect(wrapper.findAll('input[aria-invalid="true"]')).toHaveLength(5)
  })

  it('stays quiet about a required field until it was left', async () => {
    const { wrapper } = mountForm()
    expect(wrapper.findAll('.note')).toHaveLength(0)
    await wrapper.findAll('input')[0]?.trigger('focusout')
    expect(wrapper.get('.note').text()).toBe('Give the host a name.')
  })

  it('does not copy until the block is valid, then copies exactly the block', async () => {
    const { wrapper } = mountForm()
    const copy = wrapper.get('.copy')
    expect(copy.attributes('disabled')).toBeDefined()
    await copy.trigger('click')
    expect(copyText).not.toHaveBeenCalled()

    await fill(wrapper, { alias: 'vps-sg-1', hostName: '203.0.113.14', user: 'root' })
    expect(copy.attributes('disabled')).toBeUndefined()
    await copy.trigger('click')
    await flushPromises()
    expect(copyText).toHaveBeenCalledWith(
      'Host vps-sg-1\n  HostName 203.0.113.14\n  User root\n  Port 22\n  AddKeysToAgent yes\n  UseKeychain yes\n',
    )
    expect(copy.text()).toBe('Copied')
  })

  it('never copies a value that carries a line break', async () => {
    const { wrapper } = mountForm()
    await fill(wrapper, { alias: 'a', hostName: 'h\nHost evil' })
    expect(wrapper.get('.copy').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.snippet').text()).not.toContain('evil')
  })

  it('says Daminus never writes the file, and one block per server', () => {
    const { wrapper } = mountForm()
    expect(wrapper.get('.snippet').text()).toContain('Daminus never writes this file.')
    expect(wrapper.get('.head span').text()).toBe('one per server')
  })

  it('has no title and no hint in the sheet form', () => {
    const { wrapper } = mountForm({ variant: 'sheet' })
    expect(wrapper.find('.head').exists()).toBe(false)
  })
})

describe('AddHostSheet', () => {
  function mountSheet(listing?: () => unknown) {
    mockCommands((cmd) => {
      if (cmd === 'hosts_list')
        return (
          listing?.() ?? {
            list: { config_found: false, hosts: [], skipped: [], empty: 'no_config' },
            entries: [],
          }
        )
      if (cmd === 'ssh_environment') return { agent: 'keys', keys: 1 }
      return null
    })
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/setup', component: { template: '<div />' } },
        { path: '/setup/discover', component: { template: '<div />' } },
      ],
    })
    const wrapper = mount(AddHostSheet, {
      props: {
        modelValue: true,
        'onUpdate:modelValue': (v: boolean) => wrapper.setProps({ modelValue: v }),
      },
      attachTo: document.body,
      global: { plugins: [i18n, router] },
    })
    mounted.push(wrapper)
    return wrapper
  }
  let router: ReturnType<typeof createRouter>

  const dialog = () => document.body.querySelector('[role="dialog"]')
  const footerButton = (label: string) =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] footer button')].find(
      (b) => b.textContent?.includes(label),
    )
  /** The config holds `aliases` (line 9, 14, …) in ~/.ssh/config. */
  function configWith(aliases: string[], skipped: unknown[] = []) {
    const hosts = aliases.map((alias, i) => ({
      alias,
      file: '/Users/someone/.ssh/config',
      line: 9 + 5 * i,
    }))
    return {
      list: { config_found: true, hosts, skipped },
      entries: hosts.map((host) => ({ host, resolved: null })),
    }
  }
  async function fillValidBlock() {
    const inputs = [...(dialog()?.querySelectorAll<HTMLInputElement>('input') ?? [])]
    const values = ['apollo-2', '103.75.186.31', 'root', '24700', '~/.ssh/id_rsa']
    for (const [i, v] of values.entries()) {
      const input = inputs[i]
      if (!input) continue
      input.value = v
      input.dispatchEvent(new Event('input'))
      await flushPromises()
    }
  }
  async function typeAlias(alias: string) {
    const input = dialog()?.querySelector<HTMLInputElement>('input')
    if (!input) throw new Error('no alias field')
    input.value = alias
    input.dispatchEvent(new Event('input'))
    await flushPromises()
  }

  it('says where the typed host was found, and Import replaces Check again', async () => {
    let added = false
    mountSheet(() => configWith(added ? ['vps-a', 'apollo-2'] : ['vps-a']))
    await flushPromises()
    await typeAlias('apollo-2')
    expect(dialog()?.querySelector('.result')).toBeNull()

    added = true
    footerButton('Check again')?.click()
    await flushPromises()
    const result = dialog()?.querySelector('.result')
    expect(result?.classList.contains('found')).toBe(true)
    expect(result?.textContent).toContain('Found apollo-2 in ~/.ssh/config, line 14')
    expect(footerButton('Check again')).toBeUndefined()
    const importButton = footerButton('Import apollo-2')
    expect(importButton).toBeDefined()
    importButton?.click()
    await flushPromises()
    expect(useSetupStore().ticked).toEqual(['apollo-2'])
    expect(router.currentRoute.value.path).toBe('/setup')
  })

  it('brings the answer into view, below the block it may sit under', async () => {
    const seen: Element[] = []
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (
      this: Element,
    ) {
      seen.push(this)
    })
    mountSheet(() => configWith(['apollo-2']))
    await flushPromises()
    await typeAlias('apollo-2')
    footerButton('Check again')?.click()
    await flushPromises()
    expect(seen.some((el) => el.classList.contains('found'))).toBe(true)
    spy.mockRestore()
  })

  it('says the typed host is not in the config yet, and Copy block copies and says so', async () => {
    mountSheet(() => configWith(['vps-a']))
    await flushPromises()
    await fillValidBlock()
    footerButton('Check again')?.click()
    await flushPromises()
    const result = dialog()?.querySelector('.result')
    expect(result?.classList.contains('missing')).toBe(true)
    expect(result?.textContent).toContain(
      'apollo-2 is not in ~/.ssh/config yet. Paste the block at the end, save, then check again.',
    )
    const copyButton = result?.querySelector('button')
    expect(copyButton?.textContent).toContain('Copy block')
    copyButton?.click()
    await flushPromises()
    expect(vi.mocked(copyText)).toHaveBeenCalledWith(expect.stringContaining('Host apollo-2'))
    expect(result?.querySelector('button')?.textContent).toContain('Copied')
  })

  it('offers no Copy block while the form cannot make a block', async () => {
    mountSheet(() => configWith(['vps-a']))
    await flushPromises()
    await typeAlias('apollo 2')
    footerButton('Check again')?.click()
    await flushPromises()
    const result = dialog()?.querySelector('.result.missing')
    expect(result).not.toBeNull()
    expect(result?.querySelector('button')).toBeNull()
  })

  it('says a typed host that is in the file but left out is left out, not missing', async () => {
    mountSheet(() =>
      configWith(
        ['vps-a'],
        [
          {
            pattern: 'apollo-2',
            reason: 'no_host_name',
            file: '/Users/someone/.ssh/config',
            line: 9,
          },
        ],
      ),
    )
    await flushPromises()
    await typeAlias('apollo-2')
    footerButton('Check again')?.click()
    await flushPromises()
    const result = dialog()?.querySelector('.result')
    expect(result?.classList.contains('left-out')).toBe(true)
    expect(result?.textContent).toContain(
      'apollo-2 is in ~/.ssh/config, line 9, but left out: no HostName.',
    )
    expect(footerButton('Import')).toBeUndefined()
  })

  it('follows the config when it is read again from elsewhere, and drops a stale answer', async () => {
    let added = false
    mountSheet(() => configWith(added ? ['apollo-2'] : []))
    await flushPromises()
    await typeAlias('apollo-2')
    footerButton('Check again')?.click()
    await flushPromises()
    expect(dialog()?.querySelector('.result.missing')).not.toBeNull()
    added = true
    await useSetupStore().reload()
    await flushPromises()
    expect(dialog()?.querySelector('.result.found')).not.toBeNull()
    await typeAlias('apollo-3')
    expect(dialog()?.querySelector('.result')).toBeNull()
  })

  it('offers no Import after a failed read, nor on a later setup step', async () => {
    let fail = false
    mountSheet(() => {
      if (fail) throw { code: { kind: 'internal' }, retryable: false }
      return configWith(['apollo-2'])
    })
    await flushPromises()
    await typeAlias('apollo-2')
    fail = true
    footerButton('Check again')?.click()
    await flushPromises()
    expect(footerButton('Import')).toBeUndefined()
    expect(dialog()?.querySelector('.result')).toBeNull()

    fail = false
    await router.push('/setup/discover')
    footerButton('Check again')?.click()
    await flushPromises()
    expect(dialog()?.querySelector('.result.found')).not.toBeNull()
    expect(footerButton('Import')).toBeUndefined()
  })

  it('reads the config while Check again runs', async () => {
    let finish: (v: unknown) => void = () => {}
    mountSheet(() => configWith([]))
    mockCommands((cmd) => {
      if (cmd === 'hosts_list') return new Promise((r) => (finish = r))
      if (cmd === 'ssh_environment') return { agent: 'keys', keys: 1 }
      return null
    })
    await flushPromises()
    await typeAlias('apollo-2')
    footerButton('Check again')?.click()
    await flushPromises()
    expect(dialog()?.querySelector('.result.reading')?.textContent).toContain(
      'Reading ~/.ssh/config…',
    )
    finish(configWith([]))
    await flushPromises()
    expect(dialog()?.querySelector('.result.missing')).not.toBeNull()
  })

  it('says Daminus never writes ~/.ssh/config and holds the same form', async () => {
    const wrapper = mountSheet()
    await flushPromises()
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Add a host by hand')
    expect(dialog?.textContent).toContain('Daminus never writes ~/.ssh/config.')
    expect(dialog?.querySelectorAll('input')).toHaveLength(5)
    // A form sheet: pinned to the top, so an error line under a field moves nothing above it.
    expect(document.body.querySelector('.layer')?.classList.contains('pinned')).toBe(true)
    wrapper.unmount()
  })

  it('closes with Close and reads the config again with Check again', async () => {
    const wrapper = mountSheet()
    await flushPromises()
    const setup = useSetupStore()
    const buttons = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] footer button'),
    ]
    const check = buttons.find((b) => b.textContent?.includes('Check again'))
    check?.click()
    await flushPromises()
    expect(setup.configFound).toBe(false)
    expect(setup.listing).not.toBeNull()

    buttons.find((b) => b.textContent?.includes('Close'))?.click()
    await flushPromises()
    expect(wrapper.props('modelValue')).toBe(false)
  })

  it('says which line ssh refused after Check again, inside the sheet', async () => {
    let broken = false
    const host = { alias: 'vps-a', file: '/u/.ssh/config', line: 1 }
    const wrapper = mountSheet(() => ({
      list: { config_found: true, hosts: [host], skipped: [] },
      entries: [{ host, resolved: null }],
      ...(broken && {
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
      }),
    }))
    await flushPromises()
    const dialog = () => document.body.querySelector('[role="dialog"]')
    expect(dialog()?.querySelector('[role="alert"]')).toBeNull()

    broken = true
    const check = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] footer button'),
    ].find((b) => b.textContent?.includes('Check again'))
    check?.click()
    await flushPromises()
    const alert = dialog()?.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Could not read your SSH config')
    expect(alert?.textContent).toContain('ssh stops at line 6 of /u/.ssh/config')
    wrapper.unmount()
  })
})

describe('host fields', () => {
  it('leave ssh values as typed: no autocorrect, capitals or spell check', () => {
    const { wrapper } = mountForm()
    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('autocorrect')).toBe('off')
      expect(input.attributes('autocapitalize')).toBe('off')
      expect(input.attributes('spellcheck')).toBe('false')
    }
  })
})
