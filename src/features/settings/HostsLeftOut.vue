<!--
  Settings › Hosts, "Left out": the entries of the ssh config that are not hosts to scan, each
  with the reason and the file and line they come from. Folded by default with its count.
  "Read again" reads the config again.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { includedFiles, leftOutKey, leftOutName, placeOf } from '@/lib/hosts-settings'
import { useSetupStore } from '@/stores/setup'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'

const { t } = useI18n()
const setup = useSetupStore()
const open = ref(false)

const extra = computed(() => includedFiles(setup.entries, setup.skipped))
</script>

<template>
  <section class="card" aria-labelledby="hosts-left-title">
    <div class="head">
      <button
        type="button"
        class="toggle"
        :aria-expanded="open"
        :aria-label="t('settingsHosts.leftOut.toggle')"
        @click="open = !open"
      >
        <UiIcon name="chevron-down" class="chev" :class="{ shut: !open }" />
      </button>
      <h3 id="hosts-left-title" class="ct">
        {{ t('settingsHosts.leftOut.title', { n: setup.skipped.length }) }}
      </h3>
      <span class="m">{{ t('settingsHosts.leftOut.read', { n: extra }, extra) }}</span>
      <UiButton
        size="small"
        icon="refresh"
        :busy="setup.loading"
        class="again"
        @click="setup.reload()"
      >
        {{ t('settingsHosts.leftOut.again') }}
      </UiButton>
    </div>
    <ul v-if="open" class="list">
      <li v-for="entry in setup.skipped" :key="`${entry.file}:${entry.line}`" class="item">
        <span class="mono name">{{ leftOutName(entry) }}</span>
        <span class="why">{{
          t(`settingsHosts.leftOut.reasons.${leftOutKey(entry.reason)}`)
        }}</span>
        <span class="mono place">{{ placeOf(entry.file, entry.line) }}</span>
        <UiButton
          v-if="entry.reason === 'no_host_name'"
          size="small"
          variant="link"
          disabled
          :disabled-reason="t('settingsHosts.leftOut.addAnywayOff')"
        >
          {{ t('settingsHosts.leftOut.addAnyway') }}
        </UiButton>
        <span v-else />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-4);
  border-radius: 16px;
  background: var(--surface-0);
  box-shadow: var(--shadow-hairline);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-bottom: var(--space-1);
}

.toggle {
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: var(--radius-xs);
  color: var(--ink-4);
}

.toggle:focus-visible {
  box-shadow: var(--focus-ring);
}

.chev {
  transition: transform var(--dur-state) var(--ease-out);
}

.chev.shut {
  transform: rotate(-90deg);
}

.ct {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.m {
  margin-left: var(--space-2);
  color: var(--ink-3);
  font-size: var(--text-11);
}

.again {
  margin-left: auto;
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr) 112px 72px;
  gap: var(--space-3);
  align-items: center;
  min-height: 28px;
  font-size: var(--text-12);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.why {
  color: var(--ink-3);
}

.place {
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}
</style>
