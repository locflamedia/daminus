<!--
  Monogram tile, from the boards "Micro UI" and "Project card": the mark of a project, a
  square with a two-stop tint at 135 degrees and a white glyph or first letter. Three sizes
  with their radii: 18 (radius 6), 24 (8) and 36 (10). `icon` draws a 16 px glyph (18 px on
  the 36 tile), otherwise the first letter of `name` in 10, 12 or 15 px semibold. The tint is a
  named tone because the project's colour is the user's choice; the tones are the pairs the
  boards draw.
-->
<script setup lang="ts">
import { computed } from 'vue'
import UiIcon from './UiIcon.vue'
import type { IconName } from './icon-paths'

export type MonogramTint = 'amber' | 'blue' | 'lilac' | 'rose' | 'grey'

const props = withDefaults(
  defineProps<{ name?: string; icon?: IconName; tint?: MonogramTint; size?: 18 | 24 | 36 }>(),
  { name: '', icon: undefined, tint: 'blue', size: 24 },
)

const letter = computed(() => Array.from(props.name.trim())[0]?.toUpperCase() ?? '')
</script>

<template>
  <span class="tile" :class="[`size-${size}`, `tint-${tint}`]" aria-hidden="true">
    <UiIcon v-if="icon" :name="icon" :size="size === 36 ? 18 : 14" />
    <template v-else>{{ letter }}</template>
  </span>
</template>

<style scoped>
.tile {
  display: grid;
  place-items: center;
  flex: none;
  color: var(--on-solid);
  font-weight: var(--weight-semibold);
  line-height: 1;
}

.size-18 {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  font-size: 10px;
}

.size-24 {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  font-size: 12px;
}

.size-36 {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  font-size: 15px;
}

.tint-amber {
  background: linear-gradient(135deg, var(--tint-amber-1), var(--tint-amber-2));
}

.tint-blue {
  background: linear-gradient(135deg, var(--tint-blue-1), var(--tint-blue-2));
}

.tint-lilac {
  background: linear-gradient(135deg, var(--tint-lilac-1), var(--tint-lilac-2));
}

.tint-rose {
  background: linear-gradient(135deg, var(--tint-rose-1), var(--tint-rose-2));
}

.tint-grey {
  background: linear-gradient(135deg, var(--tint-grey-1), var(--tint-grey-2));
}
</style>
