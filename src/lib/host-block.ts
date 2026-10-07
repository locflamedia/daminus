// The "Host block" a person pastes into `~/.ssh/config` by hand. Daminus never writes that
// file: it checks what was typed and builds the text, and the person copies it. Only a block
// whose every field passed is ever copied, and the checks refuse control characters and
// whitespace, so a typed value can never add a line (or a second `Host`) to the block.

export interface HostBlockFields {
  alias: string
  hostName: string
  user: string
  port: string
  identityFile: string
}

export type HostBlockField = keyof HostBlockFields

/** The keys of `empty.hostBlock.errors.*`. */
export type HostBlockError =
  | 'aliasRequired'
  | 'aliasInvalid'
  | 'hostRequired'
  | 'hostInvalid'
  | 'userInvalid'
  | 'portInvalid'
  | 'identityInvalid'

export interface HostBlockLine {
  /** The ssh keyword (`Host`, `HostName`, ...). */
  key: string
  /** What goes after it: the typed value, or the example shown until the field is valid. */
  value: string
  /** The value is an example, not what was typed. */
  example: boolean
  /** Indented under `Host`. */
  nested: boolean
}

export interface HostBlock {
  errors: Partial<Record<HostBlockField, HostBlockError>>
  /** Every required field is filled and every filled field passed. */
  valid: boolean
  lines: HostBlockLine[]
  /** The block to copy; empty until `valid`. */
  text: string
}

/** The same rule as `HostAlias::parse` in the core, so a pasted alias is one the app lists. */
const ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export const MAX_ALIAS_LEN = 253
/** A DNS name, an IPv4 address or an IPv6 address; never a space, quote or `#`. */
const HOST_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const USER = /^[A-Za-z_][A-Za-z0-9._-]*$/
/** `~/` or `/` and path characters that need no quoting in ssh_config. */
const IDENTITY = /^(~\/|\/)[A-Za-z0-9._/+=,-]+$/

export const DEFAULT_PORT = '22'
export const DEFAULT_IDENTITY_FILE = '~/.ssh/id_ed25519'

/** What the form starts with: the usual port, the rest to be typed. */
export function emptyFields(): HostBlockFields {
  return { alias: '', hostName: '', user: '', port: DEFAULT_PORT, identityFile: '' }
}

/** Examples shown in the block until the field holds a valid value (and as placeholders). */
export const EXAMPLES: Readonly<HostBlockFields> = {
  alias: 'vps-sg-1',
  hostName: '203.0.113.14',
  user: 'root',
  port: DEFAULT_PORT,
  identityFile: DEFAULT_IDENTITY_FILE,
}

function checkPort(port: string): boolean {
  if (!/^\d{1,5}$/.test(port)) return false
  const n = Number(port)
  return n >= 1 && n <= 65535
}

/** The first problem of each field; an optional field left blank has none. */
export function hostBlockErrors(f: HostBlockFields): HostBlock['errors'] {
  const errors: HostBlock['errors'] = {}
  if (f.alias === '') errors.alias = 'aliasRequired'
  else if (f.alias.length > MAX_ALIAS_LEN || !ALIAS.test(f.alias)) errors.alias = 'aliasInvalid'
  if (f.hostName === '') errors.hostName = 'hostRequired'
  else if (!HOST_NAME.test(f.hostName)) errors.hostName = 'hostInvalid'
  if (f.user !== '' && !USER.test(f.user)) errors.user = 'userInvalid'
  if (f.port !== '' && !checkPort(f.port)) errors.port = 'portInvalid'
  if (f.identityFile !== '' && !IDENTITY.test(f.identityFile))
    errors.identityFile = 'identityInvalid'
  return errors
}

/** Surrounding blanks are not part of a value; anything else is judged as typed. */
export function trimmed(f: HostBlockFields): HostBlockFields {
  return {
    alias: f.alias.trim(),
    hostName: f.hostName.trim(),
    user: f.user.trim(),
    port: f.port.trim(),
    identityFile: f.identityFile.trim(),
  }
}

/** Builds the block from the fields; the text is empty until every field passed. */
export function buildHostBlock(input: HostBlockFields): HostBlock {
  const f = trimmed(input)
  const errors = hostBlockErrors(f)
  const valid = Object.keys(errors).length === 0

  const shown = (field: HostBlockField): { value: string; example: boolean } =>
    f[field] !== '' && errors[field] === undefined
      ? { value: f[field], example: false }
      : { value: EXAMPLES[field], example: true }

  const lines: HostBlockLine[] = [{ key: 'Host', ...shown('alias'), nested: false }]
  lines.push({ key: 'HostName', ...shown('hostName'), nested: true })
  // Optional lines are drawn while empty (as examples) and left out of the copied text.
  lines.push({ key: 'User', ...shown('user'), nested: true })
  lines.push({ key: 'Port', ...shown('port'), nested: true })
  lines.push({ key: 'IdentityFile', ...shown('identityFile'), nested: true })
  lines.push({ key: 'AddKeysToAgent', value: 'yes', example: false, nested: true })
  lines.push({ key: 'UseKeychain', value: 'yes', example: false, nested: true })

  const text = valid
    ? lines
        .filter((l) => !(l.example && ['User', 'Port', 'IdentityFile'].includes(l.key)))
        .map((l) => `${l.nested ? '  ' : ''}${l.key} ${l.value}`)
        .join('\n') + '\n'
    : ''
  return { errors, valid, lines, text }
}
