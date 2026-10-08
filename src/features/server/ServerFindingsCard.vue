<!--
  Findings of the server page, from the board "Server detail": only what is not ok gets a row,
  each naming its check, how long it has stood and what it measured; "Security lite" under them
  lists the six security checks compactly, with how far the miner check got when it could not
  see every process. The wording of a finding is the one the project cards use.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { checkName, issueText } from '@/lib/issue-text'
import { itemIssue } from '@/lib/server-issue'
import type { Finding, FindingTally, SecurityLite, SecurityRow } from '@/lib/server-security'
import { useSettingsStore } from '@/stores/settings'
import UiIcon from '@/ui/UiIcon.vue'
import type { IconName } from '@/ui/icon-paths'
import { vEnter } from '@/lib/motion'
import { findingEvidence, securityValue } from './server-text'

const props = defineProps<{
  host: string
  findings: readonly Finding[]
  tally: FindingTally
  security: SecurityLite
  scope: string
}>()

const { t } = useI18n()
const settings = useSettingsStore()

const FINDING_ICON: Record<Finding['level'], IconName> = {
  crit: 'critical',
  warn: 'warn',
  unknown: 'info',
  info: 'info',
}

const meta = computed(() => {
  const n = props.tally
  const pieces = [
    n.crit > 0 && t('serverScreen.findings.crit', { n: n.crit }),
    n.warn > 0 && t('serverScreen.findings.warn', { n: n.warn }),
    n.unknown > 0 && t('serverScreen.findings.unknown', { n: n.unknown }),
    n.info > 0 && t('serverScreen.findings.info', { n: n.info }),
    t('serverScreen.findings.ok', { n: n.ok }),
    n.expected > 0 && t('serverScreen.findings.expected', { n: n.expected }),
  ]
  return pieces.filter(Boolean).join(' · ')
})

function findingTitle(item: Finding['item']): string {
  const value = item.fact?.value
  if (item.severity.level === 'unknown' && typeof value !== 'number') {
    return t('serverScreen.findings.unread', {
      check: checkName(item.key.check, settings.language),
      target: item.key.target,
    })
  }
  return issueText(itemIssue(item), settings.language)
}

const rows = computed(() =>
  props.findings.map((f) => ({
    f,
    title: findingTitle(f.item),
    evidence: findingEvidence(f.item, settings.language),
  })),
)

const lite = computed(() =>
  props.security.rows.map((row) => ({ row, value: securityValue(row, settings.language) })),
)
const liteTitle = computed(() =>
  props.security.counted > 0
    ? t('serverScreen.security.title', {
        clean: props.security.clean,
        total: props.security.counted,
      })
    : t('serverScreen.security.titleNone'),
)

const SEC_ICON: Record<SecurityRow['state'], IconName> = {
  ok: 'check',
  info: 'info',
  warn: 'warn',
  crit: 'critical',
  unknown: 'lock',
  off: 'minus',
  none: 'minus',
}
</script>

<template>
  <section class="card" :aria-label="t('serverScreen.findings.title')">
    <h3 class="head">
      <UiIcon name="shield" :size="16" class="mark" />
      {{ t('serverScreen.findings.title') }}
      <span class="meta">{{ meta }}</span>
    </h3>
    <ul
      v-if="rows.length > 0"
      class="finds"
      :aria-label="t('serverScreen.findings.list', { host })"
    >
      <li
        v-for="(r, i) in rows"
        :key="`${scope}:${r.f.id}`"
        v-enter="{ index: i, once: `${scope}:finding:${r.f.id}` }"
        class="find"
        :class="`level-${r.f.level}`"
      >
        <span class="badge" :class="{ 'm-halo': r.f.level === 'crit' }">
          <UiIcon :name="FINDING_ICON[r.f.level]" :size="12" :stroke="1.8" />
        </span>
        <div class="text">
          <span class="title">{{ r.title }}</span>
          <span class="sub">
            <span class="mono">{{ r.f.item.key.check }}</span>
            <template v-if="r.evidence"> · {{ r.evidence }}</template>
          </span>
        </div>
      </li>
    </ul>
    <p v-else class="empty">{{ t('serverScreen.findings.empty') }}</p>

    <h4 class="lite-title">{{ liteTitle }}</h4>
    <ul class="lite" :aria-label="t('serverScreen.security.list', { host })">
      <li
        v-for="(l, i) in lite"
        :key="l.row.check"
        v-enter="{ index: i, kind: 'reveal', once: `${scope}:sec:${l.row.check}` }"
        class="sec"
        :class="`state-${l.row.state}`"
      >
        <span class="glyph"><UiIcon :name="SEC_ICON[l.row.state]" :size="8" :stroke="2.6" /></span>
        <span class="mono check">{{ l.row.check }}</span>
        <span class="value">{{ l.value }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: 0 1px 2px rgba(40, 48, 90, 0.05);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.mark {
  flex: none;
  color: var(--ink-3);
}

.meta {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-regular);
  white-space: nowrap;
}

.finds {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.find {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-well);
}

.find.level-warn {
  background: color-mix(in srgb, var(--warn-soft) 38%, var(--surface-0));
}

.find.level-crit {
  background: color-mix(in srgb, var(--crit-soft) 45%, var(--surface-0));
}

.badge {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--info-soft);
  color: var(--info-ink);
}

.level-warn .badge {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.level-crit .badge {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.level-unknown .badge {
  background: var(--surface-2);
  color: var(--ink-3);
}

.badge :deep(svg),
.glyph :deep(svg) {
  color: inherit;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.title {
  overflow-wrap: anywhere;
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.sub {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  margin: 0;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.lite-title {
  margin: 6px 2px 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.lite {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sec {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  height: 24px;
  color: var(--ink-2);
  font-size: var(--text-11);
}

.glyph {
  display: grid;
  flex: none;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--ink-3);
}

.state-ok .glyph {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.state-info .glyph {
  background: var(--info-soft);
  color: var(--info-ink);
}

.state-warn .glyph {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.state-crit .glyph {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.check {
  flex: none;
  white-space: nowrap;
}

.value {
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  color: var(--ink-3);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-info .value {
  color: var(--info-ink);
}

.state-warn .value {
  color: var(--warn-ink);
}

.state-crit .value {
  color: var(--crit-ink);
}
</style>
