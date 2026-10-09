<!--
  The "needs permission" state of a project tab (board "Permission help"), in two columns. On the
  left an amber-washed card says what Daminus could not do and that the server is fine, then one
  or more steps, each with a command to copy; Daminus never runs them. Every command goes
  through `UiCommandCopy`. On the right a 320 px rail: "After you change it" with Check again
  (which scans only that host), the `.env` keys read when the caller names them, and why
  Daminus does not ask for sudo. Under 1080 px the rail
  drops below the card.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useScanStore } from '@/stores/scan'
import UiButton from '@/ui/UiButton.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import UiIcon from '@/ui/UiIcon.vue'

export interface PermissionStep {
  title: string
  text?: string
  /** `null` when the command could not be built safely: the step shows its words only. */
  command: string | null
}

const props = defineProps<{
  title: string
  text: string
  steps: readonly PermissionStep[]
  /** What applies once the change is made; it opens the "After you change it" rail card. */
  note?: string
  /** The host to read again: shows Check again, which scans only that host. */
  host?: string
  /** The `.env` keys the check reads on the server (the Database tab): "Only these keys are read". */
  keys?: readonly string[]
}>()

const { t } = useI18n()
const scan = useScanStore()

function checkAgain() {
  if (props.host && !scan.scanning) void scan.start({ projects: [], hosts: [props.host] })
}
</script>

<template>
  <div class="perm-help">
    <section class="perm">
      <header class="head">
        <span class="tile" aria-hidden="true"><UiIcon name="lock" :size="20" /></span>
        <div class="words">
          <h3 class="title">{{ title }}</h3>
          <p class="text">{{ text }}</p>
        </div>
      </header>
      <ol class="steps">
        <li v-for="(s, i) in steps" :key="i" class="step">
          <b class="step-title">{{ s.title }}</b>
          <p v-if="s.text" class="step-text">{{ s.text }}</p>
          <UiCommandCopy v-if="s.command" :command="s.command" />
        </li>
      </ol>
    </section>

    <aside class="rail">
      <section v-if="note || host" class="rail-card" data-testid="perm-after">
        <h4 class="sect">{{ t('permissionHelp.afterTitle') }}</h4>
        <p v-if="note" class="body">{{ note }}</p>
        <UiButton
          v-if="host"
          class="again"
          variant="primary"
          icon="refresh"
          :busy="scan.scanning"
          :disabled="scan.scanning"
          @click="checkAgain"
        >
          {{ scan.scanning ? t('permissionHelp.checking') : t('permissionHelp.checkAgain') }}
        </UiButton>
        <span v-if="host" class="lbl">{{ t('permissionHelp.checkNote') }}</span>
      </section>
      <section v-if="keys && keys.length > 0" class="rail-card keys" data-testid="perm-keys">
        <h4 class="sect">{{ t('permissionHelp.keysTitle') }}</h4>
        <div class="tags">
          <code v-for="key in keys" :key="key" class="tag">{{ key }}</code>
        </div>
        <span class="lbl">{{ t('permissionHelp.keysNote') }}</span>
      </section>
      <section class="rail-card why" data-testid="perm-why">
        <h4 class="sect">{{ t('permissionHelp.whyTitle') }}</h4>
        <p class="body">{{ t('permissionHelp.whyText') }}</p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.perm-help {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--space-4);
  align-items: start;
}

.perm {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(180deg, var(--card-wash-warn), var(--surface-0) 110px);
  box-shadow: var(--shadow-card);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.tile {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
  color: var(--warn-ink);
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: var(--weight-medium);
  letter-spacing: -0.01em;
}

.text,
.step-text {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.5;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.rail-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-card);
}

.rail-card.why,
.rail-card.keys {
  gap: var(--space-2);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-1);
  color: var(--ink-2);
  font: var(--text-11) var(--font-mono);
}

.sect {
  margin: 0;
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.body {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.5;
}

.again {
  align-self: flex-start;
}

.lbl {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

@media (max-width: 1080px) {
  .perm-help {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
