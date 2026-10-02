// Server and AI text is always rendered as text. ESLint bans `v-html` and the raw-HTML
// DOM sinks; this test checks the same on the files themselves, so a lint exception cannot
// slip one through.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))
const SINKS =
  /v-html|innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment/

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name === 'bindings') continue
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.(vue|ts)$/.test(name) && !name.endsWith('.test.ts')) out.push(path)
  }
  return out
}

describe('untrusted text', () => {
  it('is never rendered as HTML', () => {
    const offenders = sources(SRC).filter((file) => SINKS.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
