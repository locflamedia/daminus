// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { HostOutcome } from '@/api'
import { clearMocks, mockCommands } from '@/api/testing'
import { i18n, setI18nLocale } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import { useSetupStore } from '@/stores/setup'
import { SAMPLE_HOSTS, emptyListing, sampleListing, sampleSetup } from '@/testing/setup-fixture'
import PickHostsView from '../PickHostsView.vue'

const ACCEPTED: HostOutcome = { state: 'reached' }

async function mountPick() {
  const rail = document.createElement('div')
  rail.id = 'setup-rail'
  document.body.append(rail)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'overview', component: { template: '<div />' } },
      { path: '/setup', component: { template: '<div />' } },
      { path: '/setup/discover', component: { template: '<div />' } },
    ],
  })
  await router.push('/setup')
  const wrapper = mount(PickHostsView, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

/** The six sample servers as the store holds them after their login tests ended. */
function seed(opts: { tick?: string[]; answered?: string[] } = {}) {
  const setup = useSetupStore()
  setup.listing = sampleListing()
  const answered = opts.answered ?? SAMPLE_HOSTS.map((h) => h.alias)
  for (const host of SAMPLE_HOSTS) {
    if (!answered.includes(host.alias)) continue
    setup.answers[host.alias] = { outcome: host.outcome, ms: host.ms, hostKey: null }
    if (host.login) setup.logins = { ...setup.logins, [host.alias]: sampleSetup(host) }
  }
  setup.ticked = opts.tick ?? SAMPLE_HOSTS.map((h) => h.alias)
  return setup
}

const row = (w: VueWrapper, alias: string) =>
  w.findAll('.item').find((r) => r.find('.alias').text() === alias)!

beforeEach(() => {
  setActivePinia(createPinia())
  setI18nLocale('en')
  mockCommands((cmd) => {
    if (cmd === 'setup_start') return { setup_id: 'x', joined: false }
    return null
  })
})
afterEach(() => {
  clearMocks()
  document.body.replaceChildren()
})

describe('Pick hosts rows', () => {
  it('lists each host with its user, port, route and key', async () => {
    seed()
    const { wrapper } = await mountPick()
    expect(wrapper.findAll('.item')).toHaveLength(6)
    const hn = row(wrapper, 'vps-hn-3')
    expect(hn.find('.user').text()).toBe('deploy:2222')
    expect(hn.find('.key').text()).toBe('hn_deploy')
    expect(row(wrapper, 'db-main').find('.jump').text()).toBe('via vps-sg-1')
    expect(row(wrapper, 'vps-sg-1').find('.direct').text()).toBe('Direct')
  })

  it('counts entries and left-out entries in the subtitle, with the config path in mono', async () => {
    seed()
    const { wrapper } = await mountPick()
    const line = wrapper.find('.titles p')
    expect(line.text()).toBe(
      'From ~/.ssh/config · 8 entries, 2 left out. Login is tested as soon as a host is ticked.',
    )
    expect(line.find('.mono').text()).toBe('~/.ssh/config')
  })

  it('shows the latency of a reached host, the system and the end-of-life tag', async () => {
    seed()
    const { wrapper } = await mountPick()
    const sg1 = row(wrapper, 'vps-sg-1')
    expect(sg1.find('.system').text()).toContain('Ubuntu 22.04')
    expect(sg1.find('.login').text()).toContain('Connected')
    expect(sg1.find('.login').text()).toContain('0.38 s')
    const legacy = row(wrapper, 'legacy-shop')
    expect(legacy.find('.system').text()).toContain('Ubuntu 20.04')
    expect(legacy.find('.eol').text()).toBe('EOL')
    expect(legacy.find('.login').text()).toContain('Slow')
  })

  it('says what a host that was never tested is waiting for', async () => {
    seed({ tick: [], answered: [] })
    const { wrapper } = await mountPick()
    const first = row(wrapper, 'vps-sg-1')
    expect(first.find('.system').text()).toBe('Waiting for login')
    expect(first.find('.login').text()).toBe('Queued')
  })

  it('words a host the run is reading, live', async () => {
    const setup = seed({ answered: ['vps-sg-1'] })
    setup.run = {
      setup_id: 'r',
      step: 'test',
      started_at: '2026-10-07T10:00:00Z',
      next_seq: 0,
      hosts: {
        'vps-sg-2': { state: 'agent_wait', items: 0, dropped: 0 },
        'vps-hn-3': { state: 'running', items: 0, dropped: 0 },
        'db-main': { state: 'connecting', items: 0, dropped: 0 },
      },
    }
    const { wrapper } = await mountPick()
    expect(row(wrapper, 'vps-sg-2').find('.login').text()).toBe('Waiting for SSH agent')
    expect(row(wrapper, 'vps-hn-3').find('.login').text()).toBe('Testing…')
    expect(row(wrapper, 'db-main').find('.login').text()).toBe('Connecting')
    expect(row(wrapper, 'vps-hn-3').find('.scan').exists()).toBe(true)
    expect(row(wrapper, 'vps-sg-1').find('.scan').exists()).toBe(false)
  })

  it('flashes a row once when its login lands, not a row that was already reached', async () => {
    const setup = seed({ answered: ['vps-sg-1'] })
    const { wrapper } = await mountPick()
    expect(row(wrapper, 'vps-sg-1').find('.row').classes()).not.toContain('flashing')
    const host = SAMPLE_HOSTS[1]!
    setup.logins = { ...setup.logins, [host.alias]: sampleSetup(host) }
    setup.answers[host.alias] = { outcome: ACCEPTED, ms: host.ms, hostKey: null }
    await flushPromises()
    expect(row(wrapper, host.alias).find('.row').classes()).toContain('flashing')
  })
})

describe('Header chip and footer', () => {
  it('says how many tests are pending while some run, then that all ended', async () => {
    const setup = seed({ answered: ['vps-sg-1', 'vps-sg-2'] })
    const { wrapper } = await mountPick()
    expect(wrapper.find('.status').text()).toContain('Testing 4 of 6')
    for (const host of SAMPLE_HOSTS) {
      setup.answers[host.alias] = { outcome: host.outcome, ms: host.ms, hostKey: null }
      if (host.login) setup.logins = { ...setup.logins, [host.alias]: sampleSetup(host) }
    }
    await flushPromises()
    expect(wrapper.find('.status').text()).toContain('All 6 tested')
  })

  it('opens with every host ticked, so each one gets its login test', async () => {
    const setup = seed({ tick: [], answered: [] })
    await mountPick()
    expect(setup.ticked).toHaveLength(setup.entries.length)
  })

  it('counts the ticked hosts and how many of them ended', async () => {
    seed()
    const { wrapper } = await mountPick()
    expect(wrapper.find('.counts').text()).toBe('5 ready·1 failed·0 testing')
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100')
  })

  it('counts the hosts it will discover, and goes on when asked', async () => {
    const setup = seed()
    const start = vi.fn().mockResolvedValue(undefined)
    setup.startDiscover = start
    const { wrapper, router } = await mountPick()
    const go = wrapper.find('.btn-primary')
    expect(go.text()).toContain('Discover 5 hosts')
    await go.trigger('click')
    await flushPromises()
    expect(start).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/setup/discover')
  })

  it('is off, with the reason, when no host logged in', async () => {
    seed({ tick: [] })
    const { wrapper } = await mountPick()
    const go = wrapper.find('.btn-primary')
    expect(go.attributes('aria-disabled')).toBe('true')
    expect(go.text()).toContain('Discover 0 hosts')
  })

  it('goes on with Enter only when no field has focus', async () => {
    const setup = seed()
    const start = vi.fn().mockResolvedValue(undefined)
    setup.startDiscover = start
    await mountPick()
    const input = document.querySelector('input[type="search"]') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(start).not.toHaveBeenCalled()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(start).toHaveBeenCalledOnce()
  })

  it('focuses the filter with the slash key', async () => {
    seed()
    await mountPick()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    expect(document.activeElement).toBe(document.querySelector('input[type="search"]'))
  })
})

describe('Filter and selection', () => {
  it('filters by alias or address and by segment, with counts', async () => {
    seed()
    const { wrapper } = await mountPick()
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((t) => t.text())).toEqual(['All 6', 'Ready 5', 'Failed 1'])
    await wrapper.find('input[type="search"]').setValue('203.0.113.9')
    expect(wrapper.findAll('.item')).toHaveLength(1)
    await wrapper.find('input[type="search"]').setValue('')
    await tabs[2]!.trigger('click')
    expect(wrapper.findAll('.item').map((r) => r.find('.alias').text())).toEqual(['staging'])
  })

  it('says so when the filter keeps no host', async () => {
    seed()
    const { wrapper } = await mountPick()
    await wrapper.find('input[type="search"]').setValue('zzz')
    expect(wrapper.find('.none').text()).toBe('No host matches this filter.')
  })

  it('draws the select-all box mixed for some, ticks all when it is clicked', async () => {
    const setup = seed({ tick: ['vps-sg-1'], answered: [] })
    setup.tick = vi.fn((host: string, on: boolean) => {
      setup.ticked = on
        ? [...new Set([...setup.ticked, host])]
        : setup.ticked.filter((h) => h !== host)
    })
    const { wrapper } = await mountPick()
    const box = wrapper.find('.all input')
    expect(box.attributes('aria-checked')).toBe('mixed')
    await box.setValue(true)
    expect(setup.ticked).toHaveLength(6)
    await flushPromises()
    expect(wrapper.find('.all input').attributes('aria-checked')).toBe('true')
    await wrapper.find('.all input').setValue(false)
    expect(setup.ticked).toHaveLength(0)
  })

  it('ticks the hosts that logged in with "Select all ready"', async () => {
    const setup = seed({ tick: [] })
    const { wrapper } = await mountPick()
    await wrapper.find('.btn-link').trigger('click')
    expect(setup.ticked.sort()).toEqual(
      SAMPLE_HOSTS.filter((h) => h.outcome.state === 'reached')
        .map((h) => h.alias)
        .sort(),
    )
  })

  it('ticks and unticks a host from its row', async () => {
    const setup = seed({ tick: [], answered: [] })
    const { wrapper } = await mountPick()
    const box = row(wrapper, 'db-main').find('input')
    await box.setValue(true)
    expect(setup.ticked).toContain('db-main')
    await box.setValue(false)
    expect(setup.ticked).not.toContain('db-main')
  })
})

describe('Failures stay inline', () => {
  it('opens the ssh-add card of a rejected key, which Skip and Retry act on', async () => {
    const setup = seed()
    const { wrapper } = await mountPick()
    const staging = row(wrapper, 'staging')
    expect(staging.find('.login').text()).toContain('Key rejected')
    expect(staging.find('.login').text()).toContain('kept · retries on first scan')
    const card = staging.find('.card')
    expect(card.text()).toContain('The key in your config is not loaded in ssh-agent.')
    expect(card.find('code').text()).toBe('$ ssh-add ~/.ssh/staging_ed25519')
    expect(card.text()).toContain('Key only in Termius? Export it to ~/.ssh/ first')
    const retest = vi.spyOn(setup, 'retest').mockImplementation(() => undefined)
    const buttons = card.findAll('button').filter((b) => ['Skip host', 'Retry'].includes(b.text()))
    await buttons.find((b) => b.text() === 'Retry')!.trigger('click')
    expect(retest).toHaveBeenCalledWith('staging')
    await buttons.find((b) => b.text() === 'Skip host')!.trigger('click')
    expect(setup.ticked).not.toContain('staging')
    expect(setup.skippedHosts).toContain('staging')
    expect(row(wrapper, 'staging').find('.card').exists()).toBe(false)
  })

  it('has no ssh-add line when the config names no key file', async () => {
    const setup = seed()
    const staging = setup.listing!.entries.find((e) => e.host.alias === 'staging')!
    if (staging.resolved) staging.resolved.identity_files = []
    setup.listing = { ...setup.listing!, entries: [...setup.listing!.entries] }
    const { wrapper } = await mountPick()
    const card = row(wrapper, 'staging').find('.card')
    expect(card.find('code').exists()).toBe(false)
    expect(card.text()).toContain('The keys ssh offered were not accepted.')
    expect(card.text()).toContain('then retry.')
  })

  it('gives each kind of failure its own sentence', async () => {
    const setup = seed()
    const failures: [string, HostOutcome, string][] = [
      ['vps-sg-1', { state: 'unreachable', cause: 'dns' }, 'The address did not resolve.'],
      [
        'vps-sg-2',
        { state: 'unreachable', cause: 'refused' },
        'The server refused the connection.',
      ],
      [
        'vps-hn-3',
        { state: 'timeout' },
        'No answer in 10 s. Retry, or raise it in Settings › Scan.',
      ],
    ]
    for (const [host, outcome] of failures) {
      setup.answers[host] = { outcome, ms: null, hostKey: null }
      setup.logins = Object.fromEntries(Object.entries(setup.logins).filter(([h]) => h !== host))
    }
    const { wrapper } = await mountPick()
    for (const [host, , sentence] of failures) {
      expect(row(wrapper, host).find('.card').text()).toContain(sentence)
    }
    expect(row(wrapper, 'vps-sg-1').find('.login').text()).toContain('Unreachable')
    expect(row(wrapper, 'vps-hn-3').find('.login').text()).toContain('Timed out')
  })

  it('shows the offered fingerprint and the ssh line of a host key that is not trusted yet', async () => {
    const setup = seed()
    setup.answers['db-main'] = {
      outcome: { state: 'host_key_unknown', fp: 'ED25519 SHA256:abc' },
      ms: null,
      hostKey: { state: 'unknown', offered: 'ED25519 SHA256:abc', known: [] },
    }
    const { wrapper } = await mountPick()
    const card = row(wrapper, 'db-main').find('.card')
    expect(card.text()).toContain('Offers ED25519 SHA256:abc')
    expect(card.find('code').text()).toBe('$ ssh db-main')
    expect(row(wrapper, 'db-main').find('.login').text()).toContain('Host key unknown')
  })

  it('stops a host whose key changed, with both fingerprints and no line to run', async () => {
    const setup = seed()
    setup.answers['db-main'] = {
      outcome: { state: 'host_key_changed', fp: 'ED25519 SHA256:new' },
      ms: null,
      hostKey: { state: 'changed', offered: 'ED25519 SHA256:new', known: ['ED25519 SHA256:old'] },
    }
    const { wrapper } = await mountPick()
    const card = row(wrapper, 'db-main').find('.card')
    expect(card.text()).toContain('Offers ED25519 SHA256:new')
    expect(card.text()).toContain('On record ED25519 SHA256:old')
    expect(card.find('code').exists()).toBe(false)
  })

  it('quotes an alias that is not plain before it goes into the line', async () => {
    const setup = seed()
    setup.listing = sampleListing([{ ...SAMPLE_HOSTS[0]!, alias: 'my host; rm' }])
    setup.ticked = ['my host; rm']
    setup.answers['my host; rm'] = {
      outcome: { state: 'host_key_unknown', fp: 'fp' },
      ms: null,
      hostKey: null,
    }
    const { wrapper } = await mountPick()
    expect(wrapper.find('.card code').text()).toBe("$ ssh 'my host; rm'")
  })
})

describe('Permission rows', () => {
  it('opens on a click of a reached row, names what is missing and copies the fix, and closes', async () => {
    seed()
    const { wrapper } = await mountPick()
    const sg2 = row(wrapper, 'vps-sg-2')
    expect(sg2.find('.panel').exists()).toBe(false)
    await sg2.find('.row').trigger('click')
    const panel = row(wrapper, 'vps-sg-2').find('.panel')
    expect(panel.text()).toContain('Reached · 0.41 s')
    expect(panel.text()).toContain('2 permissions missing')
    expect(panel.text()).toContain('Ubuntu 24.04 · x86_64 · logged in as deploy')
    expect(panel.text()).toContain('Docker')
    expect(panel.text()).toContain('Answers · deploy can use docker')
    expect(panel.text()).toContain('System logs')
    expect(panel.text()).toContain('Folder /srv/shop')
    const commands = panel.findAll('code').map((c) => c.text())
    expect(commands).toEqual([
      '$ sudo usermod -aG systemd-journal deploy',
      '$ sudo setfacl -R -m u:deploy:rX /srv/shop',
    ])
    await panel.find('.missing').trigger('click')
    expect(row(wrapper, 'vps-sg-2').find('.panel').exists()).toBe(false)
  })

  it('does not open for a host that is not reached, nor from the tick', async () => {
    seed()
    const { wrapper } = await mountPick()
    await row(wrapper, 'staging').find('.row').trigger('click')
    await row(wrapper, 'vps-sg-1').find('.tick input').setValue(false)
    expect(wrapper.findAll('.panel')).toHaveLength(0)
  })

  it('hides the docker row of a host without docker and words a stopped daemon with the command in its words', async () => {
    const setup = seed()
    const db = SAMPLE_HOSTS.find((h) => h.alias === 'db-main')!
    const { wrapper } = await mountPick()
    await row(wrapper, 'db-main').find('.row').trigger('click')
    expect(db.login?.docker).toBe('missing')
    expect(row(wrapper, 'db-main').find('.panel').text()).not.toContain('Docker')
    const hn = SAMPLE_HOSTS.find((h) => h.alias === 'vps-hn-3')!
    setup.logins = {
      ...setup.logins,
      'vps-hn-3': sampleSetup({ ...hn, login: { ...hn.login!, docker: 'stopped' } }),
    }
    await row(wrapper, 'vps-hn-3').find('.row').trigger('click')
    expect(row(wrapper, 'vps-hn-3').find('.panel').text()).toContain(
      'Stopped · systemctl start docker',
    )
  })
})

describe('Left out, Termius tip and rail', () => {
  it('lists what was left out with the reason, and folds away', async () => {
    seed()
    const { wrapper } = await mountPick()
    const left = wrapper.find('.left')
    expect(left.text()).toContain('Left out 2')
    expect(left.text()).toContain('github.com no HostName')
    expect(left.text()).toContain('Host * wildcard')
    expect(left.text()).toContain('Wildcards set defaults, so they are read but never listed.')
    await left.find('.toggle').trigger('click')
    expect(wrapper.find('.left .tag').exists()).toBe(false)
  })

  it('reloads the config, keeping the ticks', async () => {
    const setup = seed()
    const reload = vi.spyOn(setup, 'reload').mockResolvedValue(undefined)
    const { wrapper } = await mountPick()
    await wrapper.find('.tip button').trigger('click')
    expect(reload).toHaveBeenCalledOnce()
    expect(setup.ticked).toHaveLength(6)
  })

  it('prints the real ssh options and script commands in the rail, for the row in focus', async () => {
    seed()
    const { wrapper } = await mountPick()
    await row(wrapper, 'db-main').find('.row').trigger('mouseenter')
    const rail = document.querySelector('#setup-rail')!
    const code = rail.querySelector('code')!.textContent!
    expect(code).toContain('-o BatchMode=yes')
    expect(code).toContain('-o StrictHostKeyChecking=yes')
    expect(code).toContain('-o ConnectTimeout=10')
    expect(code).toContain('-- db-main sh -s')
    expect(code).toContain('uname -s')
    expect(code).toContain('id -Gn')
    expect(code).toContain('/etc/os-release')
    expect(wrapper.exists()).toBe(true)
  })
})

describe('Loading, errors and no hosts', () => {
  it('holds the place of the rows while the config is read', async () => {
    const setup = useSetupStore()
    setup.loading = true
    const { wrapper } = await mountPick()
    expect(wrapper.findAll('.ghost')).toHaveLength(4)
    expect(wrapper.find('.table').attributes('aria-busy')).toBe('true')
  })

  it('says the config could not be read and tries again', async () => {
    const setup = seed()
    setup.error = { code: { kind: 'internal' }, retryable: true } as never
    const load = vi.spyOn(setup, 'load').mockResolvedValue(undefined)
    const { wrapper } = await mountPick()
    const banner = wrapper.find('[role="alert"]')
    expect(banner.text()).toContain('Could not read your SSH config')
    await banner.find('button').trigger('click')
    expect(load).toHaveBeenCalledOnce()
  })

  it('goes to the empty app when the config has no host at all', async () => {
    const setup = useSetupStore()
    setup.listing = emptyListing('no_config')
    const { router } = await mountPick()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('stays when the config is not read yet', async () => {
    const { router } = await mountPick()
    expect(router.currentRoute.value.path).toBe('/setup')
  })
})

describe('Language', () => {
  it('speaks Vietnamese with the same structure', async () => {
    setI18nLocale('vi')
    useSettingsStore().language = 'vi'
    seed()
    const { wrapper } = await mountPick()
    expect(wrapper.find('h2').text()).toBe('Daminus nên theo dõi những máy chủ nào?')
    expect(row(wrapper, 'staging').find('.login').text()).toContain('Khóa bị từ chối')
    expect(wrapper.find('.btn-primary').text()).toContain('Khám phá 5 host')
    expect(row(wrapper, 'vps-sg-1').find('.login').text()).toContain('0,38 s')
    useSettingsStore().language = 'en'
    setI18nLocale('en')
  })
})
