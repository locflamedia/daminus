import type { Manifest } from '@/api/bindings/Manifest'
import manifest from '@checks/manifest.json'

/**
 * The check manifest the core ships (`crates/core/checks/manifest.json`): ids,
 * groups, where each check runs and its severity rule. Labels come from
 * `src/i18n` under `checks.<id>.*`.
 */
export const checkManifest = manifest as Manifest
