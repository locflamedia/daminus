// The bundled messages. `en.json` and `vi.json` hold the shared vocabulary; a screen that
// brings a lot of its own text keeps it in `parts/<screen>.<locale>.json`, one top-level key
// per file (a test refuses two files that claim the same key, and a locale with a key the
// other lacks).
import en from './en.json'
import vi from './vi.json'

type Tree = { [key: string]: string | Tree }

const enParts = import.meta.glob<Tree>('./parts/*.en.json', { eager: true, import: 'default' })
const viParts = import.meta.glob<Tree>('./parts/*.vi.json', { eager: true, import: 'default' })

/** The shared tree with every part added at its top-level key. */
export function withParts(base: Tree, parts: Record<string, Tree>): Tree {
  const out: Tree = { ...base }
  for (const [file, tree] of Object.entries(parts)) {
    for (const [key, value] of Object.entries(tree)) {
      if (key in out) throw new Error(`message key "${key}" of ${file} is already taken`)
      out[key] = value
    }
  }
  return out
}

export const messages = {
  en: withParts(en as Tree, enParts),
  vi: withParts(vi as Tree, viParts),
}
