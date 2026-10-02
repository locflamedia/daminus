// Per-viewer conveniences (theme, language, folded sidebar) live in localStorage. It can
// throw or come back empty (blocked site data, private windows), so every access is
// wrapped and the app renders correctly without it.
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not persisted; the setting still applies for this session.
  }
}
