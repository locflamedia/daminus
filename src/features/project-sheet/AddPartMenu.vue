<!--
  "Add part ⌘⇧N": a menu anchored to the button with the five kinds of part. Each shows how
  many finds discover has for the project's server; a kind with none is typed by hand.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ADD_KINDS, type AddKind, discoveredOn, foundCount } from '@/lib/sheet-parts'
import { useSetupStore } from '@/stores/setup'
import UiButton from '@/ui/UiButton.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'
import type { IconName } from '@/ui/icon-paths'
import { useSheet } from './sheet-context'

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const sheet = useSheet()
const setup = useSetupStore()

const ICONS: Record<AddKind, IconName> = {
  folder: 'folder',
  compose: 'container',
  pm2: 'terminal',
  database: 'database',
  nginx: 'globe',
}

const items = computed<MenuItem[]>(() => {
  const found = sheet.searchHosts().map((h) => discoveredOn(setup.recordsOf(h)))
  return ADD_KINDS.map((kind) => {
    const counts = found.map((f) => foundCount(kind, f))
    const n = counts.some((c) => c !== null)
      ? counts.reduce<number>((sum, c) => sum + (c ?? 0), 0)
      : null
    return {
      id: kind,
      label: t(`projectSheet.parts.kindMenu.${kind}.label`),
      icon: ICONS[kind],
      hint: t(`projectSheet.parts.kindMenu.${kind}.hint`, { n: n ?? 0 }),
    }
  })
})
</script>

<template>
  <UiMenu
    v-model:open="open"
    :items="items"
    :label="t('projectSheet.parts.menuLabel')"
    placement="top-start"
    @select="sheet.addPart($event as AddKind)"
  >
    <template #trigger="{ attrs, toggle }">
      <UiButton v-bind="attrs" icon="plus" shortcut="⌘⇧N" @click="toggle">
        {{ t('projectSheet.parts.add') }}
      </UiButton>
    </template>
  </UiMenu>
</template>
