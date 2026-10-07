// "1 unsaved change": how far the edited project is from the one the sheet opened with. Each
// field, URL row and part counts once; moving parts counts once however far.
import { type DraftPart, type DraftProject } from './setup-model'

/** A deep copy that survives reactive proxies (the drafts of the setup store are proxies). */
export function cloneDraft(draft: DraftProject): DraftProject {
  return JSON.parse(JSON.stringify(draft)) as DraftProject
}

function same(a: DraftPart, b: DraftPart): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function countChanges(before: DraftProject, after: DraftProject): number {
  let n = 0
  if (before.name !== after.name) n += 1
  if ((before.color ?? null) !== (after.color ?? null)) n += 1
  if (!after.idFollowsName && before.id !== after.id) n += 1

  const beforeUrls = before.urls.map((u) => u.trim())
  const afterUrls = after.urls.map((u) => u.trim()).filter((u) => u !== '')
  const keptBefore = beforeUrls.filter((u) => u !== '')
  for (let i = 0; i < Math.max(keptBefore.length, afterUrls.length); i += 1) {
    if (keptBefore[i] !== afterUrls[i]) n += 1
  }

  const old = new Map(before.parts.map((p) => [p.key, p]))
  const kept = after.parts.filter((p) => old.has(p.key))
  for (const part of after.parts) {
    const was = old.get(part.key)
    if (!was || !same(was, part)) n += 1
  }
  n += before.parts.filter((p) => !after.parts.some((q) => q.key === p.key)).length
  const order = before.parts.filter((p) => kept.some((q) => q.key === p.key)).map((p) => p.key)
  if (order.join('|') !== kept.map((p) => p.key).join('|')) n += 1
  return n
}
