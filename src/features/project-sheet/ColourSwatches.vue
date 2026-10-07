<!--
  The eight project colours, in the order of the tints: a radio group of round swatches, one
  ring on the chosen one. Arrow keys move the choice, Tab leaves the group.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PROJECT_COLORS, colorName } from '@/lib/setup-model'
import { MONOGRAM_TINTS, type MonogramTint } from '@/ui/monogram-tints'

const props = defineProps<{ modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [hex: string] }>()
const { t } = useI18n()

/** The end stop of each tint pair is the project colour. */
const SWATCH: Record<MonogramTint, string> = {
  blue: 'var(--tint-blue-2)',
  lilac: 'var(--tint-lilac-2)',
  rose: 'var(--tint-rose-2)',
  amber: 'var(--tint-amber-2)',
  green: 'var(--tint-green-2)',
  teal: 'var(--tint-teal-2)',
  coral: 'var(--tint-coral-2)',
  slate: 'var(--tint-slate-2)',
}

const current = computed(() => colorName(props.modelValue))
/** The one swatch Tab reaches: the chosen one, or the first when none is chosen. */
const tabbable = computed<MonogramTint>(() => current.value ?? MONOGRAM_TINTS[0])

function pick(name: MonogramTint) {
  emit('update:modelValue', PROJECT_COLORS[name])
}

function onKey(event: KeyboardEvent, index: number) {
  const step =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0
  if (step === 0) return
  event.preventDefault()
  const next = MONOGRAM_TINTS[(index + step + MONOGRAM_TINTS.length) % MONOGRAM_TINTS.length]
  if (!next) return
  pick(next)
  const group = (event.currentTarget as HTMLElement).parentElement
  group?.querySelector<HTMLElement>(`[data-tint="${next}"]`)?.focus()
}
</script>

<template>
  <div class="swatches" role="radiogroup" :aria-label="t('projectSheet.colour.group')">
    <button
      v-for="(name, index) in MONOGRAM_TINTS"
      :key="name"
      type="button"
      class="swatch"
      role="radio"
      :data-tint="name"
      :aria-checked="current === name"
      :aria-label="t(`projectSheet.colour.names.${name}`)"
      :tabindex="tabbable === name ? 0 : -1"
      :style="{ '--swatch': SWATCH[name] }"
      @click="pick(name)"
      @keydown="onKey($event, index)"
    />
  </div>
</template>

<style scoped>
.swatches {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--h-control);
}

.swatch {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-full);
  background: var(--swatch);
  transition: box-shadow var(--dur-color) var(--ease-state);
}

.swatch[aria-checked='true'] {
  box-shadow:
    0 0 0 2px var(--surface-0),
    0 0 0 4px var(--swatch);
}

.swatch:focus-visible {
  box-shadow:
    0 0 0 2px var(--surface-0),
    0 0 0 4px var(--accent);
}
</style>
