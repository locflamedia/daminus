<!--
  The "needs permission" state of a project tab (board "Permission help"): an amber-washed card
  that says what Daminus could not do and that the server is fine, then one or more steps, each
  with a command to copy. Daminus never runs them. Every command goes through `UiCommandCopy`.
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
  /** A line under the steps (when the change applies). */
  note?: string
  /** The host to read again: shows Check again, which scans only that host. */
  host?: string
}>()

const { t } = useI18n()
const scan = useScanStore()

function checkAgain() {
  if (props.host && !scan.scanning) void scan.start({ projects: [], hosts: [props.host] })
}
</script>

<template>
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
    <p v-if="note" class="note">{{ note }}</p>
    <div v-if="host" class="again">
      <UiButton
        variant="primary"
        icon="refresh"
        :busy="scan.scanning"
        :disabled="scan.scanning"
        @click="checkAgain"
      >
        {{ scan.scanning ? t('permissionHelp.checking') : t('permissionHelp.checkAgain') }}
      </UiButton>
      <span class="note">{{ t('permissionHelp.checkNote') }}</span>
    </div>
    <div class="why">
      <b class="step-title">{{ t('permissionHelp.whyTitle') }}</b>
      <p class="note">{{ t('permissionHelp.whyText') }}</p>
    </div>
  </section>
</template>

<style scoped>
.perm {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
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
.step-text,
.note {
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

.note {
  color: var(--ink-3);
}

.again {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.why {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: var(--space-3);
  border-top: 1px solid var(--surface-2);
}
</style>
