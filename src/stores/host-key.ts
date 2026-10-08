// The host key screen's state: which host is open, what the lookup says about its key, and what
// Retry found. The lookup is `ssh-keygen` and `ssh-keyscan` in Rust (nothing is sent to the
// host but the key exchange); the app never trusts a key and never writes known_hosts.
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { type HostAlias, type HostKeyInfo, hostKeyCheck } from '@/api'
import { type HostKeyFace, type RetryResult, faceOf, retryResult } from '@/lib/host-key'

export const useHostKeyStore = defineStore('host-key', () => {
  const alias = ref<string | null>(null)
  const info = shallowRef<HostKeyInfo | null>(null)
  /** The face on screen; it stays when the key turns known, so the screen can say why it closes. */
  const face = ref<HostKeyFace>('unavailable')
  const reading = ref(false)
  const retrying = ref(false)
  const result = ref<RetryResult | null>(null)
  const isOpen = computed(() => alias.value !== null)
  let turn = 0

  async function look(host: string): Promise<HostKeyInfo | null> {
    try {
      return await hostKeyCheck(host as HostAlias)
    } catch (e) {
      console.error(e)
      return null
    }
  }

  function take(next: HostKeyInfo | null) {
    info.value = next
    const nextFace = faceOf(next)
    if (nextFace) face.value = nextFace
  }

  /**
   * Opens the screen for `host`. `hint` is what the scan already knew (the fingerprint the host
   * offered), shown at once while the lookup adds the recorded keys.
   */
  async function open(host: string, hint: HostKeyInfo | null = null) {
    const mine = ++turn
    alias.value = host
    result.value = null
    retrying.value = false
    reading.value = true
    take(hint)
    if (!hint) face.value = 'unavailable'
    const found = await look(host)
    if (mine !== turn) return
    if (found) take(found)
    reading.value = false
  }

  /** Looks again, without logging in, after the person ran `ssh <alias>` in Terminal. */
  async function retry(): Promise<RetryResult | null> {
    const host = alias.value
    if (host === null || retrying.value) return null
    const mine = turn
    const before = face.value
    retrying.value = true
    const found = await look(host)
    if (mine !== turn) return null
    retrying.value = false
    result.value = retryResult(before, found)
    if (found) take(found)
    return result.value
  }

  function close() {
    turn++
    alias.value = null
    info.value = null
    result.value = null
    reading.value = false
    retrying.value = false
  }

  return { alias, info, face, reading, retrying, result, isOpen, open, retry, close }
})
