<!--
  The "One Host block" form: five fields (alias, address, user, port, key file) and the block
  they make, typed live into a dark panel the person copies and pastes into `~/.ssh/config`
  themselves. Daminus never writes that file. The block only copies once every field passed its
  check (see lib/host-block), so a typed value can never add a line to it. `sheet` is the same
  form without its title and the Termius hint, for the "Add a host by hand" sheet.
-->
<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  EXAMPLES,
  buildHostBlock,
  type HostBlockField,
  type HostBlockFields,
} from '@/lib/host-block'
import { useCopy } from '@/lib/use-copy'
import UiCard from '@/ui/UiCard.vue'
import UiField from '@/ui/UiField.vue'

const props = withDefaults(defineProps<{ variant?: 'page' | 'sheet'; termius?: boolean }>(), {
  variant: 'page',
  termius: false,
})

const fields = defineModel<HostBlockFields>({ required: true })

const { t } = useI18n()
const { state, copy } = useCopy()

const block = computed(() => buildHostBlock(fields.value))

/** A field that was left (or typed into) says what is wrong; an untouched empty one stays quiet. */
const touched = reactive<Partial<Record<HostBlockField, boolean>>>({})

function update(field: HostBlockField, value: string) {
  touched[field] = true
  fields.value = { ...fields.value, [field]: value }
}

function error(field: HostBlockField): string | undefined {
  const key = block.value.errors[field]
  if (key === undefined) return undefined
  return touched[field] || fields.value[field] !== ''
    ? t(`empty.hostBlock.errors.${key}`)
    : undefined
}

const copyLabel = computed(() =>
  state.value === 'copied'
    ? t('empty.hostBlock.copied')
    : state.value === 'failed'
      ? t('empty.hostBlock.copyFailed')
      : t('empty.hostBlock.copy'),
)

async function onCopy() {
  if (block.value.valid) await copy(block.value.text)
}

const ORDER: { field: HostBlockField; wide?: boolean }[] = [
  { field: 'alias' },
  { field: 'hostName' },
  { field: 'user' },
  { field: 'port' },
  { field: 'identityFile', wide: true },
]
</script>

<template>
  <div class="form" :data-variant="props.variant">
    <UiCard class="fields" as="section" :aria-label="t('empty.hostBlock.title')">
      <div v-if="variant === 'page'" class="head">
        <h3>{{ t('empty.hostBlock.title') }}</h3>
        <span v-if="termius">{{ t('empty.hostBlock.hintTermius') }}</span>
      </div>
      <div class="grid">
        <div
          v-for="f in ORDER"
          :key="f.field"
          class="cell"
          :class="{ wide: f.wide }"
          @focusout="touched[f.field] = true"
        >
          <UiField
            mono
            :label="t(`empty.hostBlock.${f.field}`)"
            :model-value="fields[f.field]"
            :placeholder="EXAMPLES[f.field]"
            :error="error(f.field)"
            @update:model-value="update(f.field, $event)"
          />
        </div>
      </div>
    </UiCard>

    <section class="snippet" :aria-label="t('empty.hostBlock.snippetTitle')">
      <header>
        <span class="mono file">~/.ssh/config</span>
        <span class="append">{{ t('empty.hostBlock.append') }}</span>
        <button type="button" class="copy" :disabled="!block.valid" @click="onCopy">
          {{ copyLabel }}
        </button>
      </header>
      <div class="code" role="region" tabindex="0" :aria-label="t('empty.hostBlock.snippetTitle')">
        <div v-for="l in block.lines" :key="l.key" class="ln" :class="{ nested: l.nested }">
          <span class="k">{{ l.key }}</span>
          <span class="v" :class="{ example: l.example }">{{ l.value }}</span>
        </div>
      </div>
      <footer>
        <span>{{ t('empty.hostBlock.neverWrites') }}</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: var(--space-3);
  min-width: 0;
  min-height: 0;
}

.fields {
  --card-gap: 10px;
  flex: none;
}

.head {
  display: flex;
  align-items: center;
  font-size: var(--text-13);
}

.head h3 {
  font-size: inherit;
  font-weight: var(--weight-medium);
}

.head span {
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cell {
  min-width: 0;
}

.cell.wide {
  grid-column: 1 / span 2;
}

.snippet {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--code);
  box-shadow: var(--shadow-card);
}

.snippet header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
  height: 40px;
  padding: 0 var(--space-2) 0 14px;
  background: color-mix(in srgb, var(--code-ink) 6%, transparent);
}

.file {
  color: var(--code-btn-ink);
  font-size: var(--text-12);
}

.append {
  color: var(--code-dim);
  font-size: var(--text-11);
}

.copy {
  margin-left: auto;
  height: 28px;
  padding: 0 var(--space-3);
  border-radius: 8px;
  background: var(--code-btn);
  color: var(--code-btn-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.copy:disabled {
  opacity: 0.4;
}

.copy:focus-visible {
  box-shadow: var(--focus-ring);
}

.code {
  flex: 1 1 auto;
  min-height: 120px;
  padding: var(--space-3) var(--space-4);
  overflow: auto;
  color: var(--code-ink);
  font: var(--weight-regular) var(--text-12) / 1.8 var(--font-mono);
  white-space: pre;
}

.ln.nested {
  padding-left: 2ch;
}

.k {
  margin-right: 1ch;
  color: var(--code-key);
}

.v {
  color: var(--code-str);
}

.v.example {
  opacity: 0.5;
}

footer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  background: color-mix(in srgb, var(--code-ink) 6%, transparent);
  color: var(--code-dim);
  font-size: var(--text-11);
  line-height: 1.5;
}

[data-variant='sheet'] .snippet {
  flex: none;
}
</style>
