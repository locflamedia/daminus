<!--
  The ⋯ of a finding (board "Mark as expected"): Copy path and Mark as expected… (E). Marking
  opens the popover under the same button. Nothing is offered for a result that cannot be
  marked (an exposed file, one that is fine or already expected), so the button is not drawn.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Item } from '@/api'
import { useCopy } from '@/lib/use-copy'
import { markLevel, type ExpectedForm } from '@/lib/expected-form'
import { useExpectedStore } from '@/stores/expected'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'
import UiPopover from '@/ui/UiPopover.vue'
import MarkExpectedForm from './MarkExpectedForm.vue'

const props = defineProps<{
  item: Item
  /** A labelled "Mark as expected" button (the Findings page) instead of the ⋯ menu. */
  button?: boolean
}>()

const { t } = useI18n()
const store = useExpectedStore()
const { copy } = useCopy()
const open = ref(false)

const level = computed(() => markLevel(props.item))
const path = computed(() => (props.item.key.target.startsWith('/') ? props.item.key.target : ''))

const items = computed<MenuItem[]>(() => [
  ...(path.value
    ? [{ id: 'path', label: t('expected.menu.copyPath'), icon: 'copy' as const }]
    : []),
  ...(level.value
    ? [{ id: 'mark', label: t('expected.menu.mark'), icon: 'check' as const, keys: ['E'] }]
    : []),
])

const refused = computed(() => store.error?.params?.detail ?? (store.error ? 'other' : null))

function pick(id: string) {
  if (id === 'path') void copy(path.value)
  else if (id === 'mark') {
    store.error = null
    open.value = true
  }
}

async function submit(form: ExpectedForm) {
  if (!level.value) return
  const rule = await store.mark(props.item.key, form, level.value)
  if (rule) open.value = false
}
</script>

<template>
  <UiPopover
    v-if="button ? level !== null : items.length > 0"
    v-model:open="open"
    :label="t('expected.pop.label')"
    placement="bottom-end"
    width="452px"
    roomy
  >
    <template v-if="button" #trigger="{ attrs, toggle }">
      <UiButton variant="secondary" size="small" v-bind="attrs" @click="toggle">{{
        t('expected.menu.markShort')
      }}</UiButton>
    </template>
    <template v-else #trigger>
      <UiMenu
        :items="items"
        :label="t('expected.menu.label', { check: item.key.check })"
        placement="bottom-end"
        shortcuts
        @select="pick"
      >
        <template #trigger="{ attrs, toggle }">
          <button
            type="button"
            class="more"
            v-bind="attrs"
            :aria-label="t('expected.menu.open')"
            @click="toggle"
          >
            <UiIcon name="more" :size="16" />
          </button>
        </template>
      </UiMenu>
    </template>
    <MarkExpectedForm
      v-if="level"
      :item="item"
      :level="level"
      :busy="store.saving"
      :refused="refused"
      @submit="submit"
      @cancel="open = false"
    />
  </UiPopover>
</template>

<style scoped>
.more {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--ink-3);
}

.more:hover,
.more[aria-expanded='true'] {
  background: var(--surface-1);
  color: var(--ink);
}

.more:focus-visible {
  box-shadow: var(--focus-ring);
}
</style>
