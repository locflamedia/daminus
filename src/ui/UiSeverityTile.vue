<!--
  Severity tile, from the board "Micro UI": 32 px, radius 8, a 16 px glyph in the band's ink
  on its soft tint. The shape follows the severity (octagon critical, triangle warning,
  circle with a tick fine) and `locked` is the padlock of a check that needs permission,
  drawn grey. On a row that is itself tinted the tile is plain white (`raised`), so it does
  not disappear into the tint.
-->
<script setup lang="ts">
import { computed } from 'vue'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icon-paths'

export type SeverityKind = 'crit' | 'warn' | 'ok' | 'locked'

const props = withDefaults(defineProps<{ kind: SeverityKind; raised?: boolean }>(), {
  raised: false,
})

const ICONS: Record<SeverityKind, IconName> = {
  crit: 'critical',
  warn: 'warn',
  ok: 'check-circle',
  locked: 'lock',
}
const icon = computed(() => ICONS[props.kind])
</script>

<template>
  <span class="tile" :class="[`kind-${kind}`, { raised }]" aria-hidden="true">
    <UiIcon :name="icon" :size="16" />
  </span>
</template>

<style scoped>
.tile {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--h-control);
  height: var(--h-control);
  border-radius: 8px;
}

.kind-crit {
  background: var(--crit-soft);
  color: var(--crit-ink);
}

.kind-warn {
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.kind-ok {
  background: var(--ok-soft);
  color: var(--ok-ink);
}

.kind-locked {
  background: var(--surface-0);
  color: var(--ink-3);
}

.raised {
  background: var(--surface-0);
}
</style>
