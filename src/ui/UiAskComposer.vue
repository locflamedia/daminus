<!--
  Ask composer, from the board "Inputs": 44 px tall, radius 14, filled grey, with a 13 px
  field and a 32 px send button at the right. Empty: the send button is off (grey, ink-4) and
  says so. Focused: white with the 2 px accent ring. Typing grows the field to four lines,
  then it scrolls; Enter sends, Shift+Enter starts a new line. A key pressed while an input
  method is composing (Vietnamese Telex, for one) is never taken for Enter. The `panel` look is the board "AI · Ask": 44 px, radius 14, white with a 1 px ring and a soft shadow, a
  dark 32 px send button that always shows its white arrow (a press with nothing to send does nothing); it grows with the text;
  the ring turns accent when the field has keyboard focus. Under it the note
  slot says what is attached ("Attaches the latest kho-hang snapshot, about 3.2 KB, secrets
  redacted"). The text is only ever the user's own; nothing here runs anything.
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton from './UiButton.vue'
import UiIcon from './UiIcon.vue'

const LINE = 20
const MAX_LINES = 4

const props = withDefaults(
  defineProps<{
    label: string
    placeholder?: string
    busy?: boolean
    disabled?: boolean
    /** `panel` is the Ask board's field: white with a ring and a dark send button. */
    look?: 'field' | 'panel'
  }>(),
  { placeholder: undefined, busy: false, disabled: false, look: 'field' },
)
const emit = defineEmits<{ send: [text: string] }>()
defineSlots<{ note?: () => unknown }>()

const text = defineModel<string>({ default: '' })
const { t } = useI18n()
const id = useId()
const area = ref<HTMLTextAreaElement>()

const empty = computed(() => text.value.trim() === '')
const canSend = computed(() => !empty.value && !props.busy && !props.disabled)

function fit() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  const max = LINE * MAX_LINES
  el.style.height = `${Math.min(Math.max(el.scrollHeight, LINE), max)}px`
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}

onMounted(fit)
watch(text, () => void nextTick(fit))

function send() {
  if (!canSend.value) return
  emit('send', text.value.trim())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  send()
}
</script>

<template>
  <div class="composer-wrap">
    <div class="composer" :class="[{ empty }, `look-${look}`]">
      <label :for="id" class="sr-only">{{ label }}</label>
      <textarea
        :id="id"
        ref="area"
        v-model="text"
        class="area"
        rows="1"
        :placeholder="placeholder"
        :disabled="disabled"
        @keydown="onKeydown"
      />
      <button
        v-if="look === 'panel'"
        type="button"
        class="send send-panel"
        :aria-label="t('ui.send')"
        :aria-disabled="!canSend"
        :aria-busy="busy"
        @click="send"
      >
        <UiIcon name="send" :size="16" :stroke="1.6" />
      </button>
      <UiButton
        v-else
        class="send"
        variant="primary"
        :icon="'send'"
        :aria-label="t('ui.send')"
        :disabled="!canSend && !busy"
        :busy="busy"
        @click="send"
      />
    </div>
    <p v-if="$slots.note" class="note"><UiIcon name="eye" :size="12" /><slot name="note" /></p>
  </div>
</template>

<style scoped>
.composer-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  box-sizing: border-box;
  min-height: var(--h-composer);
  padding: 6px 6px 6px var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  transition: background-color var(--dur-color) var(--ease-state);
}

.composer:focus-within,
.composer-wrap[data-force='focus'] .composer {
  background: var(--field-focus-bg);
  box-shadow: var(--field-focus-ring);
}

.look-panel {
  align-items: center;
  min-height: 44px;
  padding: 0 6px 0 14px;
  border-radius: 14px;
  background: var(--surface-0);
  box-shadow:
    var(--shadow-ring),
    0 8px 20px -12px color-mix(in srgb, var(--ink-2) 30%, transparent);
}

.look-panel:focus-within,
.composer-wrap[data-force='focus'] .look-panel {
  background: var(--surface-0);
  box-shadow:
    var(--shadow-ring),
    0 8px 20px -12px color-mix(in srgb, var(--ink-2) 30%, transparent);
}

.look-panel:has(.area:focus-visible) {
  box-shadow:
    0 0 0 2px var(--accent),
    0 8px 20px -12px color-mix(in srgb, var(--ink-2) 30%, transparent);
}

.look-panel .area {
  align-self: center;
}

.send-panel {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--btn);
  color: var(--btn-ink);
  align-self: center;
}

.send-panel:focus-visible {
  box-shadow: var(--focus-ring);
}

.area {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 0;
  border: 0;
  background: transparent;
  overflow-y: hidden;
  color: var(--ink);
  font-size: var(--text-13);
  line-height: 20px;
  outline: none;
  resize: none;
}

.area:focus-visible {
  box-shadow: none;
}

.area::placeholder {
  color: var(--ink-3);
}

.send {
  flex: none;
  align-self: flex-end;
}

.note {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
