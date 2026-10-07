import { describe, expect, it } from 'vitest'
import { buildHostBlock, emptyFields, hostBlockErrors, type HostBlockFields } from './host-block'

const GOOD: HostBlockFields = {
  alias: 'vps-sg-1',
  hostName: '203.0.113.14',
  user: 'root',
  port: '22',
  identityFile: '~/.ssh/id_ed25519',
}

describe('buildHostBlock', () => {
  it('builds the board block, with the two lines that keep the key across restarts', () => {
    const block = buildHostBlock(GOOD)
    expect(block.valid).toBe(true)
    expect(block.text).toBe(
      [
        'Host vps-sg-1',
        '  HostName 203.0.113.14',
        '  User root',
        '  Port 22',
        '  IdentityFile ~/.ssh/id_ed25519',
        '  AddKeysToAgent yes',
        '  UseKeychain yes',
        '',
      ].join('\n'),
    )
  })

  it('draws examples while the form is empty and copies nothing', () => {
    const block = buildHostBlock(emptyFields())
    expect(block.valid).toBe(false)
    expect(block.text).toBe('')
    const host = block.lines.find((l) => l.key === 'HostName')
    expect(host).toMatchObject({ value: '203.0.113.14', example: true })
    // The port starts at 22, which is a real value, not an example.
    expect(block.lines.find((l) => l.key === 'Port')).toMatchObject({ example: false })
  })

  it('follows each field as it is typed', () => {
    const block = buildHostBlock({ ...emptyFields(), alias: 'db-main', hostName: 'db.example.com' })
    expect(block.lines[0]).toMatchObject({ key: 'Host', value: 'db-main', example: false })
    expect(block.lines[1]).toMatchObject({ value: 'db.example.com', example: false })
  })

  it('leaves out the optional lines that were left blank', () => {
    const block = buildHostBlock({ ...GOOD, user: '', port: '', identityFile: '' })
    expect(block.valid).toBe(true)
    expect(block.text).toBe(
      'Host vps-sg-1\n  HostName 203.0.113.14\n  AddKeysToAgent yes\n  UseKeychain yes\n',
    )
  })

  it('ignores blanks around a value', () => {
    expect(buildHostBlock({ ...GOOD, alias: '  vps-sg-1 ' }).text).toContain('Host vps-sg-1\n')
  })
})

describe('hostBlockErrors', () => {
  it('requires an alias and a host name', () => {
    expect(hostBlockErrors({ ...GOOD, alias: '', hostName: '' })).toEqual({
      alias: 'aliasRequired',
      hostName: 'hostRequired',
    })
  })

  it('takes the alias rule of the core: starts with a letter or digit, then . _ -', () => {
    for (const alias of ['a', 'vps-sg-1', 'db_main.2', '1host']) {
      expect(hostBlockErrors({ ...GOOD, alias }).alias, alias).toBeUndefined()
    }
    for (const alias of ['-x', '.x', 'my server', 'a*b', 'a/b', 'é']) {
      expect(hostBlockErrors({ ...GOOD, alias }).alias, alias).toBe('aliasInvalid')
    }
  })

  it('keeps the port between 1 and 65535', () => {
    for (const port of ['1', '22', '65535']) {
      expect(hostBlockErrors({ ...GOOD, port }).port, port).toBeUndefined()
    }
    for (const port of ['0', '65536', '-1', '22.5', 'ssh', '1e3', '000000']) {
      expect(hostBlockErrors({ ...GOOD, port }).port, port).toBe('portInvalid')
    }
  })

  it('accepts names and addresses, refuses anything that is not one', () => {
    for (const hostName of ['example.com', '203.0.113.14', 'fe80::1', 'a-b.c_d']) {
      expect(hostBlockErrors({ ...GOOD, hostName }).hostName, hostName).toBeUndefined()
    }
    for (const hostName of ['a b', '-oProxyCommand=x', 'a#b', "a'b", 'a;b']) {
      expect(hostBlockErrors({ ...GOOD, hostName }).hostName, hostName).toBe('hostInvalid')
    }
  })

  it('wants a key path that starts at ~/ or /', () => {
    expect(hostBlockErrors({ ...GOOD, identityFile: '/Users/me/.ssh/id' }).identityFile).toBe(
      undefined,
    )
    for (const identityFile of ['id_ed25519', '~/.ssh/my key', '~/.ssh/a;b', '../x']) {
      expect(hostBlockErrors({ ...GOOD, identityFile }).identityFile, identityFile).toBe(
        'identityInvalid',
      )
    }
  })

  it('refuses a user that could carry an option or a space', () => {
    expect(hostBlockErrors({ ...GOOD, user: 'deploy' }).user).toBeUndefined()
    expect(hostBlockErrors({ ...GOOD, user: '-oX' }).user).toBe('userInvalid')
    expect(hostBlockErrors({ ...GOOD, user: 'a b' }).user).toBe('userInvalid')
  })
})

describe('a typed value can never add a line to the block', () => {
  const NEWLINES = ['\n', '\r\n', '\r', ' ', '\u0085', '\u0000', '\t', '\u001b']
  const FIELDS = ['alias', 'hostName', 'user', 'port', 'identityFile'] as const

  it('refuses a control character in any field and copies nothing', () => {
    for (const field of FIELDS) {
      for (const ch of NEWLINES) {
        const base = field === 'identityFile' ? '~/.ssh/id' : 'abc'
        const input = { ...GOOD, [field]: `${base}${ch}Host evil` }
        const block = buildHostBlock(input)
        expect(block.valid, `${field} ${JSON.stringify(ch)}`).toBe(false)
        expect(block.text).toBe('')
      }
    }
  })

  it('draws an example, not the typed text, for a field that failed', () => {
    const block = buildHostBlock({ ...GOOD, hostName: 'a\nHost evil' })
    expect(block.lines.map((l) => l.value).join('|')).not.toContain('evil')
  })
})
