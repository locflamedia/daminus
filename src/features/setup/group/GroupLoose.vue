<!--
  "Not in a project": what discover found that no suggestion owns, on a hatched tray, by host
  and kind. Each row has an "Add to project" menu (the way that works from the keyboard: Tab to
  the button, Space opens it) and a handle to drag it onto a project card. Leaving them is fine;
  they are not scanned.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { groupLoose, looseDetail } from '@/lib/group-view'
import { vEnter } from '@/lib/motion'
import type { DraftProject } from '@/lib/setup-model'
import type { LooseItem } from '@/stores/setup-drafts'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'
import { useLooseDrag } from './use-loose-drag'

const props = defineProps<{ items: readonly LooseItem[]; drafts: readonly DraftProject[] }>()
const emit = defineEmits<{ add: [item: LooseItem, draftKey: string]; create: [item: LooseItem] }>()

const { t } = useI18n()
const drag = useLooseDrag()

const groups = computed(() => groupLoose(props.items))
const open = ref<string | null>(null)

const NEW = '\u0000new'
function menuFor(): MenuItem[] {
  return [
    ...props.drafts.map((d) => ({
      id: d.key,
      label: d.name || d.id,
      dot: d.color ?? 'var(--accent)',
    })),
    { id: NEW, label: t('setupGroup.loose.newProject'), accent: true },
  ]
}

function onPick(item: LooseItem, id: string) {
  if (id === NEW) emit('create', item)
  else emit('add', item, id)
}
</script>

<template>
  <section v-enter="{ index: 5 }" class="tray" :aria-label="t('setupGroup.loose.title')">
    <header class="head">
      <b>{{ t('setupGroup.loose.titleCount', { n: items.length }) }}</b>
      <span class="grow" />
      <span class="fine">{{ t('setupGroup.loose.fine') }}</span>
    </header>

    <p v-if="items.length === 0" class="empty" data-testid="loose-empty">
      <UiIcon name="check" :size="14" :stroke="1.8" />{{ t('setupGroup.loose.empty') }}
    </p>

    <div v-for="group in groups" :key="group.host" class="group">
      <span class="host mono">{{ group.host }}</span>
      <div
        v-for="item in group.items"
        :key="item.key"
        class="item"
        draggable="true"
        :data-testid="`loose-${item.key}`"
        @dragstart="drag.start($event, item.key)"
        @dragend="drag.end()"
      >
        <span class="handle" aria-hidden="true"><UiIcon name="drag" :size="14" /></span>
        <span class="kind">{{ t(`setupGroup.loose.kind.${item.kind}`) }}</span>
        <span class="name mono">{{ item.name }}</span>
        <span class="detail">{{
          t(looseDetail(item).key, looseDetail(item).params, looseDetail(item).n ?? 0)
        }}</span>
        <UiMenu
          :open="open === item.key"
          :items="menuFor()"
          :label="t('setupGroup.loose.addTo', { name: item.name })"
          :heading="t('setupGroup.loose.addTo', { name: item.name })"
          placement="bottom-end"
          @update:open="(v) => (open = v ? item.key : null)"
          @select="(id) => onPick(item, id)"
        >
          <template #trigger="{ attrs, toggle }">
            <UiButton
              v-bind="attrs"
              size="small"
              icon="plus"
              trailing-icon="chevron-down"
              :aria-label="`${t('setupGroup.loose.add')}: ${item.name}`"
              data-testid="loose-add"
              @click="toggle"
              >{{ t('setupGroup.loose.add') }}</UiButton
            >
          </template>
        </UiMenu>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tray {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: repeating-linear-gradient(
    135deg,
    var(--hatch-2) 0 8px,
    color-mix(in srgb, var(--hatch-1) 70%, transparent) 8px 16px
  );
}

.head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-12);
}

.head b {
  font-weight: var(--weight-medium);
}

.grow {
  flex-grow: 1;
}

.fine {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.empty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--ink-2);
  font-size: var(--text-12);
}

.empty :deep(.icon) {
  color: var(--ok-ink);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.host {
  padding-top: var(--space-1);
  color: var(--ink-2);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.item {
  display: grid;
  grid-template-columns: 16px 112px minmax(0, auto) minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
  min-height: var(--h-row);
  padding: 0 var(--space-2) 0 var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-node);
}

.handle {
  display: grid;
  place-items: center;
  color: var(--ink-5);
  cursor: grab;
}

.kind {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.name {
  overflow: hidden;
  font-size: var(--text-12);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail {
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
