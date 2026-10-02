<!--
  Button, from the boards "Actions" and "Components". One primary per view; blue is never an
  action fill. Five variants plus the inline link, two sizes, and an icon-only form (no
  slot content) that needs an aria-label and shows the same words as its tooltip.

  States: hover and pressed (scale .97, 140 ms) come from the pointer; `data-force` pins one
  of hover, pressed or focus for the gallery. Busy keeps the colours, swaps the leading glyph
  for a spinner and ignores clicks. Disabled is the native attribute, except when a
  `disabledReason` is given: then the button stays focusable, says why in its tooltip and
  ignores clicks.
-->
<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import UiIcon from './UiIcon.vue'
import UiKbd from './UiKbd.vue'
import UiSpinner from './UiSpinner.vue'
import type { IconName } from './icon-paths'

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'link'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    /** Default is 32 px (toolbars, sheet footers); small is 28 px (inside rows). Links are 24 px. */
    size?: 'default' | 'small'
    /** A 14 px glyph before the label; the only glyph of an icon-only button. */
    icon?: IconName
    /** A 14 px glyph after the label (the chevron of an inline link). */
    trailingIcon?: IconName
    busy?: boolean
    disabled?: boolean
    /** Why the button is off; keeps it focusable and puts the reason in its tooltip. */
    disabledReason?: string
    /** Shortcut hint, shown on the primary button only. */
    shortcut?: string
    /** The lifted shadow some screens give the primary action. */
    lifted?: boolean
    /** Renders a router link instead of a button. */
    to?: RouteLocationRaw
    type?: 'button' | 'submit'
  }>(),
  {
    variant: 'secondary',
    size: 'default',
    icon: undefined,
    trailingIcon: undefined,
    busy: false,
    disabled: false,
    disabledReason: undefined,
    shortcut: undefined,
    lifted: false,
    to: undefined,
    type: 'button',
  },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()
const slots = defineSlots<{ default?: () => unknown }>()
const attrs = useAttrs()

// Slots are not reactive, so this is read on every render rather than cached.
function isIconOnly(): boolean {
  return !slots.default && props.icon !== undefined
}
const nativeDisabled = computed(() => props.disabled && !props.disabledReason)
const softDisabled = computed(() => props.disabled && !!props.disabledReason)
const blocked = computed(() => props.disabled || props.busy)

const tag = computed(() => (props.to === undefined ? 'button' : RouterLink))
const ariaLabel = computed(() => {
  const value = attrs['aria-label']
  return typeof value === 'string' ? value : undefined
})
// The tooltip: the reason when off, the label when only an icon is drawn.
function tooltip(): string | undefined {
  if (softDisabled.value) return props.disabledReason
  if (isIconOnly()) return ariaLabel.value
  return typeof attrs.title === 'string' ? attrs.title : undefined
}

function onClick(event: MouseEvent) {
  if (blocked.value) {
    event.preventDefault()
    return
  }
  emit('click', event)
}
</script>

<template>
  <component
    :is="tag"
    v-bind="$attrs"
    :to="to"
    :type="to === undefined ? type : undefined"
    class="btn"
    :class="[
      `btn-${variant}`,
      size === 'small' && variant !== 'link' ? 'btn-small' : '',
      {
        'btn-icon': isIconOnly(),
        'btn-busy': busy,
        'btn-lifted': lifted && variant === 'primary',
        'btn-off': softDisabled,
      },
    ]"
    :disabled="nativeDisabled || undefined"
    :aria-disabled="softDisabled || undefined"
    :aria-busy="busy || undefined"
    :title="tooltip()"
    @click="onClick"
  >
    <Transition name="glyph" mode="out-in">
      <UiSpinner v-if="busy" key="spinner" />
      <UiIcon v-else-if="icon" :key="icon" :name="icon" :size="14" />
    </Transition>
    <span v-if="!isIconOnly()" class="label"><slot /></span>
    <UiIcon v-if="trailingIcon" :name="trailingIcon" :size="14" />
    <UiKbd v-if="shortcut" :tone="variant === 'primary' ? 'on-button' : 'default'">
      {{ shortcut }}
    </UiKbd>
  </component>
</template>

<style scoped>
.btn {
  /* Per variant: fill, text, hover fill, pressed fill, resting shadow, disabled fill and text. */
  --bg: var(--surface-0);
  --fg: var(--ink);
  --bg-hover: var(--bg);
  --bg-press: var(--bg);
  --shadow: 0 0 0 0 transparent;
  --bg-off: var(--surface-1);
  --fg-off: var(--ink-4);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex: none;
  height: var(--h-control);
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color var(--dur-color) var(--ease-state),
    color var(--dur-color) var(--ease-state),
    transform var(--dur-press) var(--ease-out);
}

.btn-small {
  height: var(--h-control-sm);
  border-radius: 8px;
  font-size: var(--text-12);
}

.btn-icon {
  width: var(--h-control);
  padding: 0;
}

.btn-icon.btn-small {
  width: var(--h-control-sm);
}

.label {
  min-width: 0;
}

.btn-primary {
  --bg: var(--btn);
  --fg: var(--btn-ink);
  /* A tenth of the opposite tone: lighter on the dark button, darker on the light one. */
  --bg-hover: color-mix(in srgb, var(--btn) 90%, var(--btn-ink));
  --bg-press: var(--btn);
  --bg-off: var(--surface-3);
}

.btn-primary.btn-lifted {
  --shadow: var(--shadow-primary);
}

.btn-secondary {
  --bg: var(--surface-0);
  --bg-hover: color-mix(in srgb, var(--surface-0) 50%, var(--surface-1));
  --bg-press: var(--surface-1);
  --shadow: var(--shadow-control);
}

.btn-soft {
  --bg: var(--surface-1);
  --bg-hover: var(--surface-2);
  --bg-press: var(--surface-3);
  --fg-off: var(--ink-5);
}

.btn-ghost {
  --bg: transparent;
  --fg: var(--ink-3);
  --bg-hover: var(--surface-1);
  --bg-press: var(--surface-2);
  --fg-off: var(--ink-5);
}

.btn-ghost:is(:hover, [data-force='hover'], :active, [data-force='pressed']):not(
    :disabled,
    [aria-disabled='true'],
    .btn-busy
  ) {
  color: var(--ink);
}

.btn-danger {
  --bg: var(--crit-soft);
  --fg: var(--crit-ink);
  --bg-hover: color-mix(in srgb, var(--crit-soft), var(--crit-ink) 7%);
  --bg-press: color-mix(in srgb, var(--crit-soft), var(--crit-ink) 14%);
  --fg-off: var(--ink-5);
}

/* Inline link: 24 px, radius 6, it navigates; white fill on hover inside a grey footer. */
.btn-link {
  --bg: transparent;
  --bg-hover: var(--surface-0);
  --bg-press: var(--surface-0);
  --fg-off: var(--ink-5);

  gap: 2px;
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-xs);
  font-size: var(--text-12);
}

.btn-icon.btn-link {
  width: 24px;
  padding: 0;
}

/* Icon-only buttons draw a quiet glyph; the primary keeps its own ink. */
.btn-icon:not(.btn-primary, .btn-danger) {
  color: var(--ink-3);
}

.btn-icon.btn-secondary {
  --shadow: 0 0 0 0 transparent;
}

.btn:is(:hover, [data-force='hover']):not(:disabled, [aria-disabled='true'], .btn-busy) {
  background: var(--bg-hover);
}

.btn:is(:active, [data-force='pressed']):not(:disabled, [aria-disabled='true'], .btn-busy) {
  background: var(--bg-press);
  transform: scale(0.97);
}

.btn:is(:focus-visible, [data-force='focus']) {
  box-shadow:
    var(--shadow),
    0 0 0 2px var(--surface-0),
    0 0 0 4px var(--accent);
}

.btn:disabled,
.btn[aria-disabled='true'] {
  background: var(--bg-off);
  color: var(--fg-off);
  box-shadow: none;
}

.btn-link:disabled,
.btn-link[aria-disabled='true'] {
  background: transparent;
}

.btn-busy {
  cursor: progress;
}

/* The leading glyph cross-fades with a 2 px blur; each half takes half of 200 ms. */
.glyph-enter-active,
.glyph-leave-active {
  transition:
    opacity calc(var(--dur-state) / 2) var(--ease-state),
    filter calc(var(--dur-state) / 2) var(--ease-state);
}

.glyph-enter-from,
.glyph-leave-to {
  opacity: 0;
  filter: blur(2px);
}

@media (prefers-reduced-motion: reduce) {
  .btn:is(:active, [data-force='pressed']) {
    transform: none;
  }

  .glyph-enter-from,
  .glyph-leave-to {
    filter: none;
  }
}
</style>
