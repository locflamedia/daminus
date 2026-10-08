<!--
  Switch, from the board "Inputs": 36 x 20, knob 16, on = ink fill, off = surface-3. A label
  sits on the left and the whole row toggles. The knob slides 220 ms with the one overshoot in
  the app, the track recolours in 150 ms; switching from the keyboard jumps with no slide.
  Without a label, pass an aria-label.
-->
<script setup lang="ts">
import { ref, useId } from 'vue'

defineOptions({ inheritAttrs: false })

withDefaults(
  defineProps<{
    modelValue: boolean
    label?: string
    disabled?: boolean
    /** `compact` is the 32 x 20 switch of a page header (the knob travels 12 px). */
    size?: 'default' | 'compact'
  }>(),
  { label: undefined, disabled: false, size: 'default' },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const slots = defineSlots<{ default?: () => unknown }>()

const id = useId()
const byKeyboard = ref(false)

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label
    class="switch"
    :class="{ off: disabled, jump: byKeyboard, compact: size === 'compact' }"
    :for="id"
    @pointerdown="byKeyboard = false"
  >
    <input
      :id="id"
      v-bind="$attrs"
      class="native"
      type="checkbox"
      role="switch"
      :checked="modelValue"
      :aria-checked="modelValue"
      :disabled="disabled"
      @change="onChange"
      @keydown="byKeyboard = true"
    />
    <span class="track" aria-hidden="true"><span class="knob" /></span>
    <span v-if="label || slots.default" class="text"
      ><slot>{{ label }}</slot></span
    >
  </label>
</template>

<style scoped>
.switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  position: relative;
  font-size: var(--text-13);
}

.native {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
}

.text {
  order: -1;
  min-width: 0;
}

.track {
  display: flex;
  align-items: center;
  flex: none;
  width: 36px;
  height: 20px;
  padding: 2px;
  border-radius: var(--radius-full);
  background: var(--surface-3);
  transition: background-color var(--dur-track) var(--ease-state);
}

.knob {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface-0);
  box-shadow: var(--shadow-knob);
  transition: transform var(--dur-knob) var(--ease-settle);
}

.native:checked + .track {
  background: var(--btn);
}

.native:checked + .track .knob {
  background: var(--btn-ink);
  box-shadow: var(--shadow-knob-on);
  transform: translateX(16px);
}

.compact .track {
  width: 32px;
}

.compact .native:checked + .track .knob {
  transform: translateX(12px);
}

.jump .knob {
  transition: none;
}

.native:is(:focus-visible, [data-force='focus']) + .track {
  box-shadow:
    0 0 0 2px var(--ring-gap),
    0 0 0 4px var(--accent);
}

/* Disabled: the label dims, an on switch greys out, and nothing responds. */
.off {
  color: var(--ink-4);
}

.off .native:checked + .track {
  background: var(--switch-disabled-track);
}

.off .native:checked + .track .knob {
  background: var(--switch-disabled-knob);
}
</style>
