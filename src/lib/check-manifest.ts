import type { Manifest } from '@/api/bindings/Manifest'
import manifest from '@checks/manifest.json'

/**
 * The check manifest the core ships (`crates/core/checks/manifest.json`): ids,
 * groups, where each check runs and its severity rule. Labels come from
 * `src/i18n` under `checks.<id>.*`.
 *
 * The JSON's inferred type is a union with one member per check, whose `facts`
 * documentation maps list different keys; TypeScript cannot relate that union
 * to `Manifest` directly, so it goes through `unknown`. The Rust side parses
 * the same file into `Manifest`, which is where its shape is enforced.
 */
export const checkManifest = manifest as unknown as Manifest
