<!--
  The vendor logo of an AI provider profile at `size` px (a bundled SVG, see
  THIRD_PARTY_NOTICES.md). A compatible endpoint has no vendor, so it draws the code brackets of
  the board. Decoration next to the provider's name, hidden from assistive technology.
-->
<script setup lang="ts">
import type { AiProviderEntry } from '@/api/bindings/AiProviderEntry'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiIcon from '@/ui/UiIcon.vue'
import { brandOfProvider } from '@/ui/brand-marks'

const props = defineProps<{
  entry: AiProviderEntry
  size: number
  /** Beside a model name: Anthropic's models wear the Claude mark, as on the board. */
  model?: boolean
}>()

function brand() {
  const id = props.entry.profile.id
  return props.model && id === 'anthropic' ? 'claude' : brandOfProvider(id)
}
</script>

<template>
  <UiBrandMark :name="brand()" :size="size">
    <UiIcon name="code" :size="size" />
  </UiBrandMark>
</template>
