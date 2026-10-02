<!--
  Provider row, from the board "AI": 56 px, a 32 px monogram tile (a letter, not a vendor
  logo, so the list stays neutral), the provider's name (13/500) over one line of detail (12),
  and at the right a state chip ("Connected") or the action button in the slot. A refused
  key reads in rose in the detail line. One active provider at a time; keys never leave the
  Keychain for the webview, so this row only ever shows where the key is kept, never the key.
  Zebra: `shaded` makes the row grey and its tile white.
-->
<script setup lang="ts">
import UiRow from './UiRow.vue'

withDefaults(
  defineProps<{
    name: string
    /** The tile's letter: "A" for Anthropic, "+" for a custom endpoint. */
    mark: string
    detail?: string
    /** The detail is an error ("Key rejected: 401 unauthorized"). */
    error?: boolean
    shaded?: boolean
  }>(),
  { detail: undefined, error: false, shaded: false },
)
defineSlots<{ trailing?: () => unknown }>()
</script>

<template>
  <UiRow
    size="status"
    as="div"
    :style="shaded ? { background: 'var(--surface-1)' } : undefined"
    :data-flat="shaded || undefined"
  >
    <template #leading>
      <span class="tile" :class="{ shaded }" aria-hidden="true">{{ mark }}</span>
    </template>
    <span class="name">{{ name }}</span>
    <span v-if="detail" class="detail" :class="{ error }">{{ detail }}</span>
    <template v-if="$slots.trailing" #trailing><slot name="trailing" /></template>
  </UiRow>
</template>

<style scoped>
.tile {
  display: grid;
  place-items: center;
  flex: none;
  width: var(--h-control);
  height: var(--h-control);
  border-radius: 8px;
  background: var(--surface-1);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.tile.shaded {
  background: var(--surface-0);
}

.name {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.detail {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-12);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail.error {
  color: var(--crit-ink);
}
</style>
