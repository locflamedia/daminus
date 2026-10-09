// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import ProjectMinerCoverage from './ProjectMinerCoverage.vue'
import ProjectPermissionCard from './ProjectPermissionCard.vue'

let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('Permission help', () => {
  const base = {
    title: 'Daminus can’t read booking’s .env on db-main',
    text: 'Nothing is broken on the server.',
    steps: [{ title: 'See who owns the file', command: 'ssh db-main "ls -l /srv/booking/.env"' }],
  }

  it('keeps the steps on the left and puts Check again and the sudo reason in the rail', () => {
    wrapper = mount(ProjectPermissionCard, {
      props: { ...base, note: 'Group changes apply to new SSH sessions.', host: 'db-main' },
      global: { plugins: [i18n] },
    })
    const main = wrapper.find('.perm')
    expect(main.text()).toContain('See who owns the file')
    expect(main.text()).not.toContain('Check again')
    const after = wrapper.find('[data-testid="perm-after"]')
    expect(after.text()).toContain('After you change it')
    expect(after.text()).toContain('Group changes apply to new SSH sessions.')
    expect(after.find('button').text()).toContain('Check again')
    expect(wrapper.find('[data-testid="perm-why"]').text()).toContain('Why we don’t ask for sudo')
  })

  it('leaves out the "After you change it" card when there is nothing to say or check', () => {
    wrapper = mount(ProjectPermissionCard, { props: base, global: { plugins: [i18n] } })
    expect(wrapper.find('[data-testid="perm-after"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="perm-keys"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="perm-why"]').exists()).toBe(true)
  })

  it('lists the .env keys it reads when the tab names them', () => {
    const keys = [
      'DB_CONNECTION',
      'DB_HOST',
      'DB_PORT',
      'DB_DATABASE',
      'DB_USERNAME',
      'DB_PASSWORD',
    ]
    wrapper = mount(ProjectPermissionCard, {
      props: { ...base, keys },
      global: { plugins: [i18n] },
    })
    const card = wrapper.find('[data-testid="perm-keys"]')
    expect(card.text()).toContain('Only these keys are read')
    expect(card.findAll('code').map((c) => c.text())).toEqual(keys)
  })
})

describe('Miner coverage', () => {
  it('says how far the check got, never "none", and offers the two ways to widen it', () => {
    wrapper = mount(ProjectMinerCoverage, {
      props: { host: 'vps-hn-3', seen: 41, total: 212, user: 'ops' },
      global: { plugins: [i18n] },
    })
    const text = wrapper.text()
    expect(text).toContain('Checked 41 of 212 processes')
    expect(text).toContain('Needs permission')
    expect(text).toContain('ops can see its own 41 processes. The other 171')
    expect(text).toContain('A · Scan this host as root')
    expect(text).toContain('B · Relax hidepid or ptrace limits')
    expect(text).toContain('ssh root@vps-hn-3 true')
    expect(text).toContain('mount | grep "proc on /proc"')
    const bar = wrapper.find('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('41')
    expect(bar.attributes('aria-valuemax')).toBe('212')
  })

  it('names no user it was not told, and quotes a host that needs it', () => {
    wrapper = mount(ProjectMinerCoverage, {
      props: { host: 'odd host', seen: 3, total: 9 },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('The SSH user can see its own 3 processes')
    expect(wrapper.text()).toContain("ssh 'root@odd host' true")
  })
})
