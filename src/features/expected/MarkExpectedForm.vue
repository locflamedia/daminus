<!--
  The "Mark as expected" popover (board "Mark as expected"): why it is fine, how far the rule
  reaches, when to look again, whether to alert again when the evidence changes, and a note
  for the future. The rules the board states (Never is off for a critical result and for an
  accepted risk; a critical result is always tied to its evidence) come from `expected-form`;
  Rust checks them again. ⌘⏎ marks, esc cancels.
-->
<script setup lang="ts">
import { computed, reactive, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Item } from '@/api'
import {
  MAX_NOTE,
  REASONS,
  coversLocked,
  needsDate,
  settle,
  startForm,
  type ExpectedForm,
  type MarkLevel,
  type Review,
} from '@/lib/expected-form'
import UiButton from '@/ui/UiButton.vue'
import UiCheckbox from '@/ui/UiCheckbox.vue'
import UiField from '@/ui/UiField.vue'
import UiKbd from '@/ui/UiKbd.vue'
import UiSeg from '@/ui/UiSeg.vue'

const props = defineProps<{
  item: Item
  level: MarkLevel
  busy: boolean
  /** The error code Rust refused with, when it did. */
  refused: string | null
}>()
const emit = defineEmits<{ submit: [form: ExpectedForm]; cancel: [] }>()

const { t, te } = useI18n()
const form = reactive<ExpectedForm>(startForm())
const groupId = useId()

function change(patch: Partial<ExpectedForm>) {
  Object.assign(form, settle({ ...form, ...patch }, props.level))
}

const dated = computed(() => needsDate(props.level, form.reason))
const locked = computed(() => coversLocked(props.level))

const coversOptions = computed(() => [
  { value: 'as_it_is', label: t('expected.pop.coversAsItIs') },
  { value: 'any_evidence', label: t('expected.pop.coversAny') },
])
const reviewOptions = computed(() => [
  { value: '30', label: t('expected.pop.review30') },
  { value: '90', label: t('expected.pop.review90') },
  { value: 'never', label: t('expected.pop.reviewNever') },
])

const error = computed(() => {
  if (!props.refused) return ''
  return te(`expected.pop.error.${props.refused}`)
    ? t(`expected.pop.error.${props.refused}`)
    : t('expected.pop.error.other')
})

function submit() {
  if (!props.busy) emit('submit', settle({ ...form }, props.level))
}

function onKeydown(e: KeyboardEvent) {
  if (e.metaKey && e.key === 'Enter') {
    e.preventDefault()
    submit()
  }
}
</script>

<template>
  <form class="form" @submit.prevent="submit" @keydown="onKeydown">
    <header class="head">
      <b class="title">{{ t('expected.pop.title') }}</b>
      <code class="check">{{ item.key.check }}</code>
      <UiKbd>esc</UiKbd>
    </header>

    <fieldset class="group" :aria-labelledby="`${groupId}-why`">
      <legend :id="`${groupId}-why`" class="label">{{ t('expected.pop.why') }}</legend>
      <label
        v-for="reason in REASONS"
        :key="reason"
        class="option"
        :class="{ on: form.reason === reason }"
      >
        <input
          class="native"
          type="radio"
          :name="`${groupId}-reason`"
          :value="reason"
          :checked="form.reason === reason"
          @change="change({ reason })"
        />
        <span class="radio" aria-hidden="true" />
        <span class="words">
          <b>{{ t(`expected.pop.reason.${reason}.title`) }}</b>
          <span>{{ t(`expected.pop.reason.${reason}.text`) }}</span>
        </span>
      </label>
    </fieldset>

    <div class="pair">
      <div class="cell">
        <span class="label">{{ t('expected.pop.covers') }}</span>
        <UiSeg
          :model-value="form.covers"
          :options="coversOptions"
          :label="t('expected.pop.covers')"
          semantics="radio"
          @update:model-value="
            !locked && change({ covers: $event === 'any_evidence' ? 'any_evidence' : 'as_it_is' })
          "
        />
      </div>
      <div class="cell">
        <span class="label">{{ t('expected.pop.review') }}</span>
        <UiSeg
          :model-value="form.review"
          :options="reviewOptions"
          :label="t('expected.pop.review')"
          semantics="radio"
          @update:model-value="(v) => (v !== 'never' || !dated) && change({ review: v as Review })"
        />
      </div>
    </div>

    <UiCheckbox
      :model-value="form.covers === 'as_it_is'"
      :disabled="locked"
      :meta="locked ? t('expected.pop.alertLocked') : undefined"
      @update:model-value="change({ covers: $event ? 'as_it_is' : 'any_evidence' })"
    >
      {{ t('expected.pop.alert') }}
    </UiCheckbox>

    <UiField
      :model-value="form.note"
      :label="t('expected.pop.note')"
      :error="error || undefined"
      @update:model-value="change({ note: $event.slice(0, MAX_NOTE) })"
    />

    <footer class="foot">
      <span class="saved">{{ t('expected.pop.saved') }}</span>
      <UiButton @click="emit('cancel')">{{ t('expected.pop.cancel') }}</UiButton>
      <UiButton variant="primary" type="submit" :busy="busy" shortcut="⌘⏎">
        {{ busy ? t('expected.pop.saving') : t('expected.pop.submit') }}
      </UiButton>
    </footer>
  </form>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.title {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.check {
  flex: 1;
  color: var(--ink-3);
  font: var(--text-11) var(--font-mono);
}

.group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
}

.label {
  padding: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.option {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  cursor: pointer;
}

.option.on {
  background: var(--accent-soft);
}

.native {
  position: absolute;
  opacity: 0;
  inset: 0;
  cursor: pointer;
}

.native:focus-visible + .radio {
  box-shadow: var(--focus-ring);
}

.radio {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px var(--ink-4);
}

.on .radio {
  background: radial-gradient(var(--surface-0) 0 28%, var(--accent) 32%);
  box-shadow: none;
}

.words {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-12);
  line-height: 1.4;
}

.words b {
  font-weight: var(--weight-medium);
}

.words span {
  color: var(--ink-3);
}

.pair {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.saved {
  flex: 1;
  color: var(--ink-3);
  font-size: var(--text-11);
}
</style>
