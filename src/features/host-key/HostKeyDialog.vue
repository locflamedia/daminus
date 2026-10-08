<!--
  The host key screen (board "Host key changed"): a dialog that stops until the person has
  checked the key themselves. Three faces: the key is unknown (its fingerprint and `ssh <alias>`),
  the key changed (both fingerprints side by side, the impersonation warning, three steps to
  verify it out of band), and the fingerprint could not be read (only `ssh <alias>`). There is
  never a Trust button: Daminus reads known_hosts through ssh and does not write it. Retry looks
  again and says one of three things in a line under the buttons. Escape keeps the host blocked.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { connectCommand, forgetCommand, fingerprintParts } from '@/lib/host-key'
import { useHostKeyStore } from '@/stores/host-key'
import UiButton from '@/ui/UiButton.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiKbd from '@/ui/UiKbd.vue'
import HostKeyFingerprint from './HostKeyFingerprint.vue'

const { t } = useI18n()
const store = useHostKeyStore()
const why = ref(false)

const host = computed(() => store.alias ?? '')
const face = computed(() => store.face)
const changed = computed(() => face.value === 'changed')
const offered = computed(() => store.info?.offered ?? null)
const known = computed(() => store.info?.known ?? [])
const algorithm = computed(() => (offered.value ? fingerprintParts(offered.value).algorithm : ''))

const title = computed(() => t(`hostKey.face.${face.value}.title`, { host: host.value }))
const text = computed(() => t(`hostKey.face.${face.value}.text`, { host: host.value }))
const resultTone = computed(() => (store.result === 'accepted' ? 'ok' : 'warn'))

function skip() {
  store.close()
}
</script>

<template>
  <UiDialog
    :open="store.isOpen"
    :title="title"
    :description="text"
    icon="shield"
    :tone="changed ? 'crit' : 'warn'"
    :alert="changed"
    @close="skip"
  >
    <div class="body">
      <p v-if="store.reading && !offered" class="reading">{{ t('hostKey.reading') }}</p>

      <template v-if="face === 'unknown' && offered">
        <HostKeyFingerprint
          :label="t('hostKey.offeredAlg', { alg: algorithm || '—' })"
          :fingerprint="offered"
          tone="plain"
        />
        <span class="step">{{ t('hostKey.face.unknown.step') }}</span>
        <UiCommandCopy :command="connectCommand(host)" />
      </template>

      <template v-else-if="face === 'changed'">
        <div class="pair">
          <HostKeyFingerprint
            v-for="key in known.slice(0, 1)"
            :key="key"
            :label="t('hostKey.recorded')"
            :fingerprint="key"
            tone="accent"
            pattern
          />
          <span v-if="known.length > 0 && offered" class="neq" aria-hidden="true">≠</span>
          <HostKeyFingerprint
            v-if="offered"
            :label="t('hostKey.offered')"
            :fingerprint="offered"
            tone="crit"
            pattern
          />
        </div>
        <p v-if="known.length > 1" class="more">
          <span v-for="key in known.slice(1)" :key="key" class="mono">{{ key }}</span>
        </p>
        <p class="warn" role="note">
          <UiIcon name="warn" :size="14" />
          <span>{{ t('hostKey.face.changed.warn', { host }) }}</span>
        </p>
        <b class="step">{{ t('hostKey.face.changed.check') }}</b>
        <ol class="steps">
          <li>{{ t('hostKey.face.changed.step1', { host }) }}</li>
          <li>{{ t('hostKey.face.changed.step2') }}</li>
          <li>{{ t('hostKey.face.changed.step3') }}</li>
        </ol>
        <UiCommandCopy :command="forgetCommand(host, store.info?.lookup_name)" />
        <span class="step">{{ t('hostKey.face.changed.after', { host }) }}</span>
        <UiCommandCopy :command="connectCommand(host)" />
        <p class="quiet">{{ t('hostKey.face.changed.run') }}</p>
      </template>

      <template v-else>
        <span class="step">{{ t('hostKey.face.unavailable.step') }}</span>
        <UiCommandCopy :command="connectCommand(host)" />
      </template>

      <p v-if="why" class="quiet" role="note">{{ t('hostKey.whyText') }}</p>

      <div v-if="store.result" class="result" :class="resultTone" role="status" aria-live="polite">
        <UiIcon :name="store.result === 'accepted' ? 'check' : 'info'" :size="14" />
        <span class="words">
          <b>{{ t(`hostKey.result.${store.result}.title`, { host }) }}</b>
          <span>{{ t(`hostKey.result.${store.result}.text`, { host }) }}</span>
        </span>
      </div>
    </div>

    <template #footer>
      <UiButton variant="link" class="why" :aria-expanded="why" @click="why = !why">
        {{ t('hostKey.action.why') }}
      </UiButton>
      <span class="grow" />
      <UiButton @click="skip">
        {{ changed ? t('hostKey.action.skipScan') : t('hostKey.action.skipHost') }}
      </UiButton>
      <UiButton icon="refresh" :busy="store.retrying" @click="store.retry()">
        {{ t('hostKey.action.retry', { host }) }}
      </UiButton>
      <UiButton v-if="changed" variant="primary" @click="skip">
        {{ t('hostKey.action.keep') }}<UiKbd tone="on-button">⏎</UiKbd>
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.reading,
.quiet,
.more {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.5;
}

.more {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-wrap: anywhere;
}

.pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
}

.pair > :only-child {
  grid-column: 1 / -1;
}

.neq {
  color: var(--crit-ink);
  font-size: 18px;
}

.step {
  color: var(--ink-2);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.5;
}

.warn {
  display: flex;
  gap: var(--space-2);
  margin: 0;
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--crit-soft);
  color: var(--crit-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
  line-height: 1.45;
}

.result {
  display: flex;
  gap: var(--space-2);
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-12);
  line-height: 1.45;
}

.result.ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.result.warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.words {
  display: flex;
  flex-direction: column;
}

.words b {
  font-weight: var(--weight-medium);
}

.grow {
  flex: 1;
}

.why {
  align-self: center;
}
</style>
