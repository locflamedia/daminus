<!--
  The board's "What leaves this Mac" card, with what holds for every send: keys and tokens are
  always masked, and four things are never sent. The two switches of the board (mask IPs and
  hostnames, ask before every send) are not here: no setting stores them yet
  (`ui-change-requests.md`). "See a full payload" opens the payload sheet on the whole last
  scan to read only; with no scan yet there is nothing to show, so it is off and says why.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiPayloadStore } from '@/stores/ai-payload'
import { useReportStore } from '@/stores/report'
import UiIcon from '@/ui/UiIcon.vue'
import UiSwitch from '@/ui/UiSwitch.vue'

const { t } = useI18n()
const NEVER = ['neverEnv', 'neverSsh', 'neverFiles', 'neverUrl'] as const
const reports = useReportStore()
const payload = useAiPayloadStore()
const lastSeq = computed(() => reports.latest?.seq ?? null)

function seeFull() {
  if (lastSeq.value === null) return
  void payload.inspect({
    scope: { kind: 'whole' },
    context: `${t('aiProviders.privacy.fullContext')} · #${lastSeq.value}`,
  })
}
</script>

<template>
  <section class="card" :aria-label="t('aiProviders.privacy.title')">
    <h3 class="title"><UiIcon name="shield" :size="16" />{{ t('aiProviders.privacy.title') }}</h3>
    <div class="tog">
      <div class="words">
        <b>{{ t('aiProviders.privacy.maskKeys') }}</b>
        <span>{{ t('aiProviders.privacy.maskKeysDesc') }}</span>
      </div>
      <UiSwitch
        :model-value="true"
        disabled
        :aria-label="t('aiProviders.privacy.maskKeys')"
        class="locked"
      />
    </div>
    <div class="never">
      <span class="lbl">{{ t('aiProviders.privacy.never') }}</span>
      <span v-for="key in NEVER" :key="key" class="item">
        <span class="lock"><UiIcon name="lock" :size="10" :stroke="1.8" /></span>
        {{ t(`aiProviders.privacy.${key}`) }}
      </span>
    </div>
    <button
      type="button"
      class="full"
      :disabled="lastSeq === null"
      :title="lastSeq === null ? t('aiProviders.privacy.needScan') : undefined"
      @click="seeFull"
    >
      {{ t('aiProviders.privacy.full') }}<UiIcon name="chevron-right" :size="12" />
    </button>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
  padding: var(--space-5);
  border-radius: 14px;
  background: var(--surface-0);
  box-shadow: var(--shadow-hairline);
}

.title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.tog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  padding: 10px 0;
}

.words {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-12);
  color: var(--ink-3);
  line-height: 1.45;
}

.words b {
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.locked {
  opacity: 0.45;
}

.never {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: 14px;
}

.lbl {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-2);
  font-size: var(--text-12);
}

.lock {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  background: var(--surface-1);
  color: var(--ink-3);
}
.full {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin-top: auto;
  padding-top: var(--space-4);
  color: var(--accent-ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.full:disabled {
  color: var(--ink-4);
  cursor: default;
}
</style>
