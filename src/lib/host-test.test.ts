import { describe, expect, it } from 'vitest'
import type { HostOutcome, LoginReport, LoginResult } from '@/api'
import {
  addKeyCommand,
  protectKeyCommand,
  chipOf,
  isEndOfLife,
  isFailed,
  isReady,
  keyName,
  latencyBars,
  missingPermissions,
  permissionRows,
  safeUser,
  shellQuote,
  shortDistro,
} from './host-test'

const report: LoginReport = {
  os: 'Linux',
  kernel: '6.8',
  arch: 'x86_64',
  distro: 'Ubuntu 24.04.1 LTS',
  user: 'deploy',
  uid: 1001,
  root: false,
  docker_group: true,
  adm_group: false,
  journal_group: false,
  docker: 'ok',
  gnu_find: true,
}

const login = (over: Partial<LoginReport> = {}, paths: LoginResult['paths'] = []): LoginResult => ({
  login: { ...report, ...over },
  paths,
})

const finished = (outcome: HostOutcome, result: LoginResult | null = login()) =>
  chipOf({ state: 'finished', outcome }, result)

describe('the ten chips', () => {
  it('follow the run while it goes, then the outcome', () => {
    expect(chipOf({ state: 'queued' }, null)).toBe('queued')
    expect(chipOf({ state: 'connecting' }, null)).toBe('connecting')
    expect(chipOf({ state: 'agent_wait' }, null)).toBe('agent_wait')
    expect(chipOf({ state: 'running' }, null)).toBe('testing')
    expect(finished({ state: 'reached' })).toBe('reached')
    expect(finished({ state: 'auth_failed' })).toBe('key_rejected')
    expect(finished({ state: 'unreachable', cause: 'dns' })).toBe('unreachable')
    expect(finished({ state: 'timeout' })).toBe('timed_out')
    expect(finished({ state: 'host_key_unknown', fp: 'x' })).toBe('host_key_unknown')
    expect(finished({ state: 'host_key_changed', fp: 'x' })).toBe('host_key_changed')
  })

  it('count a partial answer as reached only when the host identified itself', () => {
    expect(finished({ state: 'partial' })).toBe('reached')
    expect(finished({ state: 'partial' }, null)).toBe('unreachable')
  })

  it('know a host from an earlier run without live progress', () => {
    expect(chipOf(null, login())).toBe('reached')
    expect(chipOf(null, null)).toBe('queued')
  })

  it('split ready from failed', () => {
    expect(isReady('reached')).toBe(true)
    expect(isFailed('key_rejected')).toBe(true)
    expect(isFailed('testing')).toBe(false)
    expect(isFailed('reached')).toBe(false)
  })
})

describe('the system line', () => {
  it('shortens the distribution and flags the ones past their updates', () => {
    expect(shortDistro('Ubuntu 22.04.3 LTS')).toBe('Ubuntu 22.04')
    expect(shortDistro('Debian GNU/Linux 12 (bookworm)')).toBe('Debian 12')
    expect(shortDistro('Rocky Linux 9.4 (Blue Onyx)')).toBe('Rocky Linux 9.4')
    expect(isEndOfLife('Ubuntu 20.04.6 LTS')).toBe(true)
    expect(isEndOfLife('Ubuntu 22.04.3 LTS')).toBe(false)
    expect(isEndOfLife('Debian GNU/Linux 11 (bullseye)')).toBe(true)
    expect(isEndOfLife('Alpine Linux v3.20')).toBe(false)
  })

  it('reads the key name and the latency bars', () => {
    expect(keyName(['~/.ssh/id_ed25519'])).toBe('id_ed25519')
    expect(keyName([])).toBeNull()
    expect(latencyBars(380)).toBe(3)
    expect(latencyBars(1120)).toBe(2)
  })
})

describe('permission rows', () => {
  it('name what is missing with the one line that fixes it', () => {
    const rows = permissionRows(login({ docker: 'ok' }, [{ path: '/srv/shop', state: 'denied' }]))
    expect(rows.map((r) => [r.kind, r.answer, r.tone])).toEqual([
      ['docker', 'ok', 'ok'],
      ['logs', 'no_permission', 'warn'],
      ['folder', 'denied', 'warn'],
    ])
    expect(rows[1]?.fix).toBe('sudo usermod -aG systemd-journal deploy')
    expect(rows[2]?.fix).toBe('sudo setfacl -R -m u:deploy:rX /srv/shop')
    expect(missingPermissions(rows)).toBe(2)
  })

  it('answer for docker in each of its four ways', () => {
    const docker = (d: LoginReport['docker']) => permissionRows(login({ docker: d }))[0]
    expect(docker('no_permission')).toMatchObject({
      answer: 'no_permission',
      fix: 'sudo usermod -aG docker deploy',
      missing: true,
    })
    expect(docker('stopped')).toMatchObject({ fix: 'sudo systemctl start docker', missing: false })
    expect(permissionRows(login({ docker: 'missing' }))[0]?.kind).toBe('logs')
  })

  it('count root and the adm group as able to read the logs', () => {
    expect(permissionRows(login({ root: true }))[1]?.answer).toBe('ok')
    expect(permissionRows(login({ adm_group: true }))[1]?.answer).toBe('ok')
  })

  it('mark a folder that does not exist without a fix', () => {
    const row = permissionRows(login({}, [{ path: '/srv/gone', state: 'missing' }])).at(-1)
    expect(row).toMatchObject({ tone: 'crit', fix: null, missing: false })
  })

  it('never put server text in a command unquoted', () => {
    expect(safeUser('deploy')).toBe('deploy')
    expect(safeUser('x; reboot')).toBe('<user>')
    expect(shellQuote('/srv/my shop')).toBe("'/srv/my shop'")
    expect(shellQuote("/srv/it's")).toBe("'/srv/it'\\''s'")
    const row = permissionRows(login({}, [{ path: '/srv/a b;c', state: 'denied' }])).at(-1)
    expect(row?.fix).toBe("sudo setfacl -R -m u:deploy:rX '/srv/a b;c'")
  })

  it('gives no rows before the host identified itself', () => {
    expect(permissionRows({ login: null, paths: [] })).toEqual([])
  })

  it('builds the ssh-add line for the key the config names', () => {
    expect(addKeyCommand(['~/.ssh/staging_ed25519'])).toBe('ssh-add ~/.ssh/staging_ed25519')
    expect(addKeyCommand([])).toBeNull()
  })

  it('builds the chmod line for the same key, quoted like the ssh-add line', () => {
    expect(protectKeyCommand(['~/.ssh/staging_ed25519'])).toBe('chmod 600 ~/.ssh/staging_ed25519')
    expect(protectKeyCommand(['~/.ssh/my key'])).toBe("chmod 600 ~/'.ssh/my key'")
    expect(protectKeyCommand([])).toBeNull()
  })
})
