<!--
  One fingerprint of the host key screen: what it is (recorded, offered), the algorithm, the
  digest in groups of four, and for the changed key an identicon, so two keys can be told apart
  before anyone reads 43 characters. The offered key is drawn in the critical tint when it
  differs from the recorded one.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { fingerprintParts, identicon } from '@/lib/host-key'

const props = defineProps<{
  label: string
  fingerprint: string
  tone: 'plain' | 'accent' | 'crit'
  /** Draw the identicon (the changed face does). */
  pattern?: boolean
}>()

const parts = computed(() => fingerprintParts(props.fingerprint))
const cells = computed(() => identicon(props.fingerprint))
</script>

<template>
  <div class="fp" :class="tone">
    <div class="top">
      <span class="label">{{ label }}</span>
      <span v-if="parts.algorithm" class="alg">{{ parts.algorithm }}</span>
    </div>
    <div class="body">
      <div v-if="pattern" class="idn" aria-hidden="true">
        <i v-for="(on, i) in cells" :key="i" :class="{ on }" />
      </div>
      <span class="digest mono">
        <span v-for="(group, i) in parts.groups" :key="i" class="group">{{ group }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.fp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.fp.crit {
  background: var(--crit-soft);
}

.top {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.label {
  flex: 1;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.alg {
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--surface-0);
  color: var(--ink-2);
  font: var(--text-11) var(--font-mono);
}

.body {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.idn {
  display: grid;
  flex: none;
  grid-template-columns: repeat(5, 5px);
  gap: 1px;
}

.idn i {
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: var(--surface-2);
}

.accent .idn i.on {
  background: var(--accent);
}

.crit .idn i.on {
  background: var(--crit-ink);
}

.digest {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  min-width: 0;
  color: var(--ink);
  font: var(--text-11) var(--font-mono);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.crit .digest {
  color: var(--crit-ink);
}
</style>
