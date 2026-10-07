<!--
  The certificate of a URL, from the board "Project · Security": a chip ("TLS 74 d", "TLS −5 d",
  "Not trusted", "Wrong name", "TLS −5 d · Not trusted", "TLS ?") and, with `detail`, the two
  lines under it ("Expires in 74 days / 13 Dec 2026"). The days stay visible when negative; the
  flags join with a dot after the days; a certificate that was not read is grey with its reason
  and never green. Everything comes from the `url.tls` result the core graded.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Item } from '@/api'
import { formatDateLong } from '@/lib/format'
import { chipParts, tlsState, type TlsFlag } from '@/lib/tls-state'
import { useSettingsStore } from '@/stores/settings'
import UiChip, { type ChipTone } from './UiChip.vue'

const props = defineProps<{
  /** The `url.tls` item of the URL; `undefined` reads as not checked. */
  item?: Item
  /** Also draw the detail lines. */
  detail?: boolean
}>()

const { t } = useI18n()
const settings = useSettingsStore()

const state = computed(() => tlsState(props.item))
const parts = computed(() => chipParts(state.value))
const tone = computed<ChipTone>(() => (state.value.tone === 'idle' ? 'neutral' : state.value.tone))

/** A true minus sign for negative days, as the boards draw them. */
function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n)
}

const label = computed(() => {
  const { days, flags } = parts.value
  if (days === null && flags.length === 0) return t('cert.chipUnchecked')
  const words = flags.map((f: TlsFlag) => t(`cert.flag.${f}`))
  return [days === null ? null : t('cert.chipDays', { n: signed(days) }), ...words]
    .filter(Boolean)
    .join(' · ')
})

const host = computed(() => {
  try {
    return new URL(props.item?.key.target ?? '').hostname
  } catch {
    return props.item?.key.target ?? ''
  }
})

const lines = computed<{ title: string; sub: string }>(() => {
  const s = state.value
  if (s.days === null) {
    const why = t(`cert.detail.reason.${s.reason ?? 'other'}`)
    return { title: `${t('cert.detail.unchecked')} · ${why}`, sub: '' }
  }
  const whole = Math.trunc(s.days)
  const date = s.notAfter === null ? '' : formatDateLong(s.notAfter * 1000, settings.language)
  if (s.flags.includes('expired')) {
    const ago =
      whole === 0
        ? t('cert.detail.expiredToday')
        : t('cert.detail.expiredAgo', { n: Math.abs(whole) }, Math.abs(whole))
    const rest = [
      s.flags.includes('untrusted') ? t('cert.detail.joinUntrusted') : '',
      s.flags.includes('mismatch') ? t('cert.detail.joinMismatch') : '',
    ].filter(Boolean)
    return { title: [ago, ...rest].join(' · '), sub: date }
  }
  if (s.flags.includes('untrusted')) {
    return { title: t('cert.detail.untrusted'), sub: t('cert.detail.untrustedSub') }
  }
  if (s.flags.includes('mismatch')) {
    return {
      title: t('cert.detail.mismatch', { host: host.value }),
      sub: t('cert.detail.mismatchSub'),
    }
  }
  return { title: t('cert.detail.expires', { n: whole }, whole), sub: date }
})
</script>

<template>
  <span class="tls" :class="{ detailed: detail }">
    <UiChip :tone="tone" :icon="state.icon">{{ label }}</UiChip>
    <span v-if="detail" class="lines">
      <span class="title">{{ lines.title }}</span>
      <span v-if="lines.sub" class="sub">{{ lines.sub }}</span>
    </span>
  </span>
</template>

<style scoped>
.tls {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.lines {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: var(--text-12);
  line-height: 1.35;
}

.title {
  color: var(--ink);
}

.sub {
  font-size: var(--text-11);
  color: var(--ink-3);
}
</style>
