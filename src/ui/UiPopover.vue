<!--
  Popover, from the board "Micro UI" (tooltip and popover): a white radius-12 panel with
  padding 12 that holds a title with its icon, a sentence and one action ("Needs permission",
  why, the command). It opens from a trigger you give in the `trigger` slot, which receives
  the attributes that make it a disclosure button (`aria-haspopup`, `aria-expanded`,
  `aria-controls`) and `toggle`. It is a small dialog: focus moves in, Tab stays inside,
  Escape or a press outside closes it and focus returns to the trigger. `v-model:open`
  controls it from outside too.
-->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { Placement } from '@/lib/anchor'
import UiFloating from './UiFloating.vue'

const props = withDefaults(
  defineProps<{ label: string; placement?: Placement; width?: string; inline?: boolean }>(),
  { placement: 'bottom-start', width: '320px', inline: false },
)

const open = defineModel<boolean>('open', { default: false })
defineSlots<{
  trigger?: (props: {
    attrs: Record<string, string | boolean | undefined>
    toggle: () => void
    open: boolean
  }) => unknown
  default?: () => unknown
}>()

const id = useId()
const anchor = ref<HTMLElement>()

const attrs = computed(() => ({
  'aria-haspopup': 'dialog',
  'aria-expanded': open.value,
  'aria-controls': open.value ? id : undefined,
}))

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <span ref="anchor" class="anchor">
    <slot name="trigger" :attrs="attrs" :toggle="toggle" :open="open" />
  </span>
  <UiFloating
    :open="open"
    :anchor="anchor"
    :placement="props.placement"
    :inline="inline"
    role="dialog"
    :label="label"
    @close="open = false"
  >
    <div :id="id" class="popover" :style="{ width }">
      <slot />
    </div>
  </UiFloating>
</template>

<style scoped>
.anchor {
  display: inline-flex;
}

.popover {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  color: var(--ink);
  font-size: var(--text-12);
  line-height: 1.45;
}
</style>
