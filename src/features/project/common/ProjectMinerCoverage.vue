<!--
  The miner check's partial coverage (board "Permission help", panel 9): `sec.miner` could only
  inspect the processes the SSH user may read, so it says how far it got ("Checked 41 of 212
  processes", an amber bar), why the rest is hidden, and the two ways to widen it: scan the host
  as root with a second Host block, or relax hidepid or ptrace (which only raises the count).
  The commands are for the person to run; Daminus never runs them. Never "none" while partial.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { shellQuote } from '@/lib/host-test'
import UiChip from '@/ui/UiChip.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'

const props = defineProps<{
  /** The ssh alias the check ran on. */
  host: string
  seen: number
  total: number
  /** The SSH user the check ran as, when the login test said which. */
  user?: string | null
}>()

const { t } = useI18n()

/** Lists `/proc` with its mount options: shows whether hidepid hides other users' processes. */
const HIDEPID_COMMAND = 'mount | grep "proc on /proc"'

const total = computed(() => Math.max(props.total, props.seen, 0))
const rest = computed(() => Math.max(total.value - props.seen, 0))
const share = computed(() => (total.value === 0 ? 0 : props.seen / total.value))
const rootCommand = computed(() => `ssh ${shellQuote(`root@${props.host}`)} true`)
</script>

<template>
  <section class="miner" data-testid="miner-coverage">
    <span class="label">{{ t('permissionHelp.miner.label', { host }) }}</span>
    <div class="count">
      <span class="headline">
        <b>{{ t('permissionHelp.miner.title', { seen, total }) }}</b>
        <UiChip tone="warn" icon="lock">{{ t('permissionHelp.miner.chip') }}</UiChip>
      </span>
      <span
        class="track"
        role="progressbar"
        :aria-label="t('permissionHelp.miner.bar', { seen, total })"
        aria-valuemin="0"
        :aria-valuemax="total"
        :aria-valuenow="seen"
      >
        <i class="fill" :style="{ transform: `scaleX(${share})` }" />
      </span>
    </div>
    <p class="text">
      {{
        t('permissionHelp.miner.text', {
          user: user || t('permissionHelp.miner.someUser'),
          seen,
          rest,
        })
      }}
    </p>
    <div class="ways">
      <div class="way">
        <b>{{ t('permissionHelp.miner.rootTitle') }}</b>
        <span>{{ t('permissionHelp.miner.rootText') }}</span>
        <UiCommandCopy :command="rootCommand" />
      </div>
      <div class="way">
        <b>{{ t('permissionHelp.miner.hidepidTitle') }}</b>
        <span>{{ t('permissionHelp.miner.hidepidText') }}</span>
        <UiCommandCopy :command="HIDEPID_COMMAND" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.miner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 14px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.label {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.count {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.headline {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-13);
}

.headline b {
  font-weight: var(--weight-medium);
}

.track {
  position: relative;
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--surface-2);
}

.fill {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  background: var(--warn-solid);
  transform-origin: left center;
}

.text {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.ways {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.way {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-3);
  border-radius: 14px;
  background: var(--surface-well);
}

.way b {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.way span {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

@media (max-width: 1080px) {
  .ways {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
