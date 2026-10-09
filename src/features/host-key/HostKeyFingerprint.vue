<!--
  One fingerprint of the host key screen: what it is (known, presented now), the algorithm, the
  digest in groups of four, and for the changed key an identicon, so two keys can be told apart
  before anyone reads 43 characters. The presented key is drawn in the critical tint when it
  differs from the known one; its identicon cells pop in turn and its groups flash once.
  Without a pattern (the first connection) it is a label over a soft grey box with the digest.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { fingerprintParts, fingerprintText, identicon } from '@/lib/host-key'

const props = defineProps<{
  label: string
  fingerprint: string
  tone: 'plain' | 'accent' | 'crit'
  /** Draw the identicon (the changed face does). */
  pattern?: boolean
}>()
defineSlots<{ note?: () => unknown }>()

const parts = computed(() => fingerprintParts(props.fingerprint))
const cells = computed(() => identicon(props.fingerprint))
const digest = computed(() => fingerprintText(props.fingerprint))
</script>

<template>
  <div v-if="pattern" class="fp" :class="tone">
    <div class="top">
      <span class="label">{{ label }}</span>
      <span v-if="parts.algorithm" class="alg">{{ parts.algorithm }}</span>
    </div>
    <div class="body">
      <div class="idn" aria-hidden="true">
        <i
          v-for="(on, i) in cells"
          :key="i"
          :class="{ on }"
          :style="{ '--d': `${400 + i * 30}ms` }"
        />
      </div>
      <span class="digest mono">
        <span
          v-for="(group, i) in parts.groups"
          :key="i"
          class="chunk"
          :style="{ '--d': `${i * 120}ms` }"
          >{{ group }}</span
        >
      </span>
    </div>
    <span v-if="$slots.note" class="note"><slot name="note" /></span>
  </div>
  <div v-else class="plain">
    <span class="label">{{ label }}</span>
    <span class="box mono">{{ digest }}</span>
  </div>
</template>

<style scoped>
.fp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.fp.crit {
  background: color-mix(in srgb, var(--crit-soft) 40%, var(--surface-0));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--crit-solid) 18%, transparent);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.label {
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.crit .label {
  color: var(--crit-ink);
}

.alg {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--surface-0);
  color: var(--ink-2);
  font: var(--weight-medium) var(--text-11) var(--font-mono);
}

.body {
  display: flex;
  align-items: center;
  gap: 14px;
}

.idn {
  display: grid;
  flex: none;
  grid-template-columns: repeat(5, 12px);
  gap: 2px;
}

.idn i {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--surface-2);
  animation: cell-pop 500ms cubic-bezier(0.34, 1.56, 0.64, 1) var(--d) both;
}

.accent .idn i.on {
  background: var(--accent);
}

.crit .idn i.on {
  background: var(--crit-solid);
}

.digest {
  display: flex;
  flex-wrap: wrap;
  gap: 0 2px;
  min-width: 0;
  color: var(--ink-2);
  font: var(--text-11) var(--font-mono);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.crit .digest {
  color: var(--ink);
}

.chunk {
  padding: 0 2px;
  border-radius: 3px;
}

.crit .chunk {
  animation: chunk-flash 900ms ease var(--d) both;
}

.note {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.crit .note {
  color: var(--crit-ink);
}

.plain {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.box {
  padding: 10px var(--space-3);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--ink);
  font-size: var(--text-12);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

@keyframes cell-pop {
  from {
    opacity: 0;
    transform: scale(0);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes chunk-flash {
  0% {
    background: transparent;
  }

  30% {
    background: color-mix(in srgb, var(--crit-solid) 28%, transparent);
  }

  100% {
    background: color-mix(in srgb, var(--crit-solid) 10%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .idn i {
    animation: none;
  }

  .crit .chunk {
    animation: none;
    background: color-mix(in srgb, var(--crit-solid) 10%, transparent);
  }
}
</style>
