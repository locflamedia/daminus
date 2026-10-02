<!--
  Inline banner, from the board "Feedback": 56 px tall, radius 10, tinted by its tone, a white
  32 px tile with a glyph in the band's ink, a title (13/500) and one line under it (12,
  ink-3). It sits inside the card it concerns; a decision that cannot wait is a dialog, and a
  background event is a toast. It is a note, or an alert when `alert` is set (an error that
  just happened). The words are always rendered as text.
-->
<script setup lang="ts">
import UiRow, { type RowTone } from './UiRow.vue'
import type { IconName } from './icon-paths'

withDefaults(
  defineProps<{
    tone?: RowTone
    icon?: IconName
    title: string
    text?: string
    alert?: boolean
  }>(),
  { tone: 'warn', icon: 'clock', text: undefined, alert: false },
)
defineSlots<{ trailing?: () => unknown }>()
</script>

<template>
  <UiRow
    size="status"
    :tone="tone"
    :tile="icon"
    :title="title"
    :meta="text"
    :role="alert ? 'alert' : 'note'"
  >
    <template v-if="$slots.trailing" #trailing><slot name="trailing" /></template>
  </UiRow>
</template>
