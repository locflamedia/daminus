// Every message key the source names must exist in both bundled locales. The scan reads each
// `.vue`/`.ts` file for string and template literals that look like a key under a top-level
// message group (`group.sub.leaf`). A template literal may build the key from a variable
// (`project.tabs.${name}`): a `${…}` segment stands for "every child of that node", so the
// rest of the key must exist under each child (`kindMenu.${kind}.hint` needs a hint on every
// kind). A segment that is only partly a variable (`holdNote${n}`) needs at least one match.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from './messages'

type Tree = { [key: string]: string | Tree }

const SRC = join(process.cwd(), 'src')
const SKIP_DIRS = new Set(['bindings', 'node_modules'])

/** Literals that look like a key but name something else, e.g. a file or an object path. */
const NOT_KEYS: readonly RegExp[] = [
  /^project\.json$/,
  /^projects\.json$/,
  // Names of the settings field a refused AI setting points at (the mock's error detail).
  /^ai\.(provider|model|base_url)$/,
]

/**
 * Variable keys whose variable is not one child of the node. `checks.${id}.name` takes a
 * dotted check id (`sys.load`) and is guarded by a `te()` lookup that falls back to the id.
 */
const DYNAMIC_ALLOWED: readonly string[] = ['checks.${}.name']

/** A helper that prefixes its own group (the gallery's `k('empty.title')`), so the literal is relative. */
const RELATIVE_HELPER = /\bk\(\s*$/

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...sourceFiles(full))
    } else if (/\.(vue|ts)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full)
  }
  return out
}

const GROUPS = new Set(Object.keys(messages.en))
const LITERAL = /(`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g
const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9_]*(\$\{[^}]*\}[A-Za-z0-9_]*)*[A-Za-z0-9_]*)+$/

/** The key-shaped literals of a source text, with the line they sit on. */
export function keyLiterals(text: string): { key: string; line: number }[] {
  const found: { key: string; line: number }[] = []
  for (const m of text.matchAll(LITERAL)) {
    const body = m[1]!.slice(1, -1)
    const top = body.split('.')[0] ?? ''
    if (!GROUPS.has(top) || !KEY_SHAPE.test(body)) continue
    if (m[1]![0] !== '`' && body.includes('${')) continue
    if (RELATIVE_HELPER.test(text.slice(Math.max(0, m.index - 4), m.index))) continue
    const line = text.slice(0, m.index).split('\n').length
    found.push({ key: body.replace(/\$\{[^}]*\}/g, '${}'), line })
  }
  return found
}

function isTree(node: string | Tree | undefined): node is Tree {
  return typeof node === 'object' && node !== null
}

/**
 * Why `segments` do not all resolve under `node`, or `null` when they do. A literal that
 * stops at a group (`empty.help`) or ends in a dot is a prefix other code appends to, so it
 * only has to name an existing group.
 */
export function unresolved(node: string | Tree | undefined, segments: string[]): string | null {
  const [seg, ...rest] = segments
  if (seg === undefined || (seg === '' && rest.length === 0)) {
    return node === undefined ? 'missing' : null
  }
  if (!isTree(node)) return `"${seg}" has no parent group`
  if (!seg.includes('${')) {
    if (!(seg in node)) return `missing "${seg}"`
    return unresolved(node[seg], rest)
  }
  const matcher = new RegExp(
    '^' +
      seg
        .split('${}')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.+') +
      '$',
  )
  // Children of another shape (a group where a message is wanted, or the reverse) belong to
  // other keys that share the group; the ones of this shape must all resolve.
  const children = Object.entries(node).filter(([name, child]) => {
    if (!matcher.test(name)) return false
    return rest.length === 0 ? !isTree(child) : isTree(child)
  })
  if (children.length === 0) return `nothing of the right shape matches "${seg}"`
  const partial = seg !== '${}'
  if (partial) {
    return children.some(([, child]) => unresolved(child, rest) === null)
      ? null
      : `no child of "${seg}" has the rest`
  }
  for (const [name, child] of children) {
    const why = unresolved(child, rest)
    if (why !== null) return `under "${name}": ${why}`
  }
  return null
}

describe('message keys used by the source', () => {
  const used = sourceFiles(SRC).flatMap((file) =>
    keyLiterals(readFileSync(file, 'utf8'))
      .filter(({ key }) => !NOT_KEYS.some((re) => re.test(key)) && !DYNAMIC_ALLOWED.includes(key))
      .map((u) => ({ ...u, file: relative(SRC, file) })),
  )

  it('finds the keys at all', () => {
    expect(used.length).toBeGreaterThan(100)
  })

  for (const locale of ['en', 'vi'] as const) {
    it(`has every key in the ${locale} messages`, () => {
      const problems = used.flatMap(({ key, file, line }) => {
        const why = unresolved(messages[locale] as Tree, key.split('.'))
        return why === null ? [] : [`${file}:${line} ${key}: ${why}`]
      })
      expect(problems).toEqual([])
    })
  }

  it('reads the literal shapes it promises to', () => {
    const text = "t('setupPick.chip.ok') `project.tabs.${name}` 'plain.word' 'not a key'"
    expect(keyLiterals(text).map((k) => k.key)).toEqual(['setupPick.chip.ok', 'project.tabs.${}'])
  })

  it('flags a variable segment whose rest is missing on a child', () => {
    const tree: Tree = { a: { x: { hint: 'h' }, y: {} } }
    expect(unresolved(tree, ['a', '${}', 'hint'])).toContain('under "y"')
    expect(unresolved(tree, ['a', 'x', 'hint'])).toBeNull()
  })
})
