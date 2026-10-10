// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
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

  it('says Daminus never writes the file, and keeps the Termius hint to Termius users', () => {
    const { wrapper } = mountForm()
    expect(wrapper.get('.snippet').text()).toContain('Daminus never writes this file.')
    expect(wrapper.text()).not.toContain('copy from Termius host settings')
    const withTermius = mountForm({ termius: true })
    expect(withTermius.wrapper.text()).toContain('copy from Termius host settings')
  })

  it('has no title and no hint in the sheet form', () => {
    const { wrapper } = mountForm({ variant: 'sheet', termius: true })
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
      if (cmd === 'ssh_environment') return { agent: 'keys', keys: 1, termius_installed: false }
      return null
    })
    const wrapper = mount(AddHostSheet, {
      props: {
        modelValue: true,
        'onUpdate:modelValue': (v: boolean) => wrapper.setProps({ modelValue: v }),
      },
      attachTo: document.body,
      global: { plugins: [i18n] },
    })
    mounted.push(wrapper)
    return wrapper
  }

  it('says Daminus never writes ~/.ssh/config and holds the same form', async () => {
    const wrapper = mountSheet()
    await flushPromises()
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Add a host by hand')
    expect(dialog?.textContent).toContain('Daminus never writes ~/.ssh/config.')
    expect(dialog?.querySelectorAll('input')).toHaveLength(5)
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
          code: { kind: 'ssh_config_invalid', path: '/u/.ssh/config', line: 6 },
          retryable: false,
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
