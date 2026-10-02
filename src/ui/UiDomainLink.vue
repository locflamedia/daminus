<!--
  Domain link, from the board "Micro UI": a 12 px globe, the domain in ink-2, and a small ↗
  in ink-4 that says it opens the browser. With `sslDays` a second part shows the certificate
  as a lock and "SSL 41 d": green while it is fine, amber under 14 days, rose under 3 (an
  expired one reads "SSL expired"). The link does not navigate the app's own webview: it
  reports `open` with the address and the owner hands it to the system browser.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import { sslTone } from '@/lib/micro'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ domain: string; sslDays?: number }>()
const emit = defineEmits<{ open: [url: string] }>()

const { t } = useI18n()
const fmt = useFormat()

const url = computed(() => `https://${props.domain}`)
const tone = computed(() => (props.sslDays === undefined ? 'ok' : sslTone(props.sslDays)))
const ssl = computed(() => {
  if (props.sslDays === undefined) return null
  if (props.sslDays < 0) return t('ui.sslExpired')
  return t('ui.ssl', { days: fmt.measure(props.sslDays, 'days').text })
})
</script>

<template>
  <span class="domain">
    <a
      class="link"
      :href="url"
      rel="noopener noreferrer"
      :aria-label="t('ui.openInBrowser', { site: domain })"
      @click.prevent="emit('open', url)"
    >
      <UiIcon name="globe" :size="12" />
      <span class="name">{{ domain }}</span>
      <UiIcon name="external" :size="12" class="out" />
    </a>
    <span v-if="ssl" class="ssl" :class="`ssl-${tone}`">
      <UiIcon name="lock" :size="12" />{{ ssl }}
    </span>
  </span>
</template>

<style scoped>
.domain {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-12);
}

.link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border-radius: var(--radius-xs);
  color: var(--ink-2);
}

.link:hover {
  color: var(--ink);
}

.link:focus-visible {
  box-shadow: var(--focus-ring);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.out {
  color: var(--ink-4);
}

.ssl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  white-space: nowrap;
}

.ssl-ok {
  color: var(--ok-ink);
}

.ssl-warn {
  color: var(--warn-ink);
}

.ssl-crit {
  color: var(--crit-ink);
}
</style>
