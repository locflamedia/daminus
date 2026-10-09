<!--
  One part of the project: grip, role, kind mark, name, server, what discover knows of it, and
  a menu. A database part opens its details inline under the row. Its problems (a part added
  twice, a server that is not in the ssh config) are told under the row.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Project, ProjectIssue, Role } from '@/api'
import { useFormat } from '@/composables/use-format'
import { badPath, discoveredOn, partState, suggestionsFor } from '@/lib/sheet-parts'
import { type DraftPart, partName } from '@/lib/setup-model'
import { useSetupStore } from '@/stores/setup'
import { brandOfEngine, brandOfKind } from '@/ui/brand-marks'
import type { IconName } from '@/ui/icon-paths'
import UiBrandMark from '@/ui/UiBrandMark.vue'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'
import DbPartFields from './DbPartFields.vue'
import PartNameField from './PartNameField.vue'
import SheetMessages from './SheetMessages.vue'
import SheetPicker from './SheetPicker.vue'
import { useSheet } from './sheet-context'
import { applySuggestion } from '@/lib/sheet-parts'

const props = defineProps<{
  part: DraftPart
  index: number
  total: number
  issues: readonly ProjectIssue[]
  project: Project
  dragging: boolean
  grabbed: boolean
}>()

const emit = defineEmits<{
  'handle-down': [event: PointerEvent]
  'handle-key': [event: KeyboardEvent]
}>()

const { t } = useI18n()
const fmt = useFormat()
const sheet = useSheet()
const setup = useSetupStore()

const ROLES: Role[] = ['fe', 'be', 'worker', 'db']
const KIND_ICON: Record<DraftPart['kind'], IconName> = {
  path: 'folder',
  compose: 'container',
  pm2: 'server',
  db: 'database',
}

const name = computed(() => partName(props.part) || t('projectSheet.parts.unnamed'))
const open = computed(() => sheet.expanded.has(props.part.key))
const records = computed(() => setup.recordsOf(props.part.host))
const state = computed(() => partState(props.part, records.value))
/** The mark of what the part names: Docker for a compose project, PM2, the database engine. */
const brand = computed(() =>
  props.part.kind === 'db' ? brandOfEngine(props.part.engine) : brandOfKind(props.part.kind),
)
const unknownHost = computed(() => props.issues.some((i) => i.code.kind === 'unknown_host'))
const nameTone = computed(() =>
  badPath(props.part) && sheet.isShown(`part:${props.part.key}`) ? 'error' : 'none',
)

const roleItems = computed<MenuItem[]>(() =>
  ROLES.map((r) => ({ id: r, label: r.toUpperCase(), checked: r === props.part.role })),
)
const hostItems = computed<MenuItem[]>(() => {
  const hosts =
    sheet.hosts.includes(props.part.host) || props.part.host === ''
      ? sheet.hosts
      : [props.part.host, ...sheet.hosts]
  return hosts.map((h) => ({
    id: h,
    label: h,
    checked: h === props.part.host,
    mark: !sheet.hosts.includes(h) ? ('warn' as const) : undefined,
    markLabel: t('projectSheet.parts.unknownHost'),
  }))
})
const moreItems = computed<MenuItem[]>(() => [
  {
    id: 'up',
    label: t('projectSheet.parts.moveUp'),
    icon: 'arrow-up',
    disabled: props.index === 0,
  },
  {
    id: 'down',
    label: t('projectSheet.parts.moveDown'),
    icon: 'arrow-down',
    disabled: props.index === props.total - 1,
  },
  { id: 'remove', label: t('projectSheet.parts.remove'), icon: 'trash', danger: true },
])

const nameKind = computed<'compose' | 'pm2' | 'path'>(() =>
  props.part.kind === 'db' ? 'path' : props.part.kind,
)
const suggestions = computed(() =>
  props.part.kind === 'db'
    ? []
    : suggestionsFor(
        nameKind.value,
        discoveredOn(records.value),
        sheet.draft.parts,
        props.part.host,
        props.part,
      ),
)
const heading = computed(() =>
  t('projectSheet.parts.suggest.title', {
    kind: t(`projectSheet.parts.suggest.kind.${nameKind.value}`),
    host: props.part.host,
  }),
)

function setName(value: string) {
  const p = props.part
  if (p.kind === 'path') sheet.replacePart({ ...p, path: value })
  else if (p.kind === 'compose') sheet.replacePart({ ...p, project: value })
  else if (p.kind === 'pm2') sheet.replacePart({ ...p, app: value, pm2Home: null })
}

function setHost(host: string) {
  sheet.replacePart({ ...props.part, host })
}

function setRole(role: string) {
  sheet.replacePart({ ...props.part, role: role as Role })
}

function setEngine(engine: string) {
  if (props.part.kind === 'db') {
    sheet.replacePart({ ...props.part, engine: engine as 'mysql' | 'postgres' })
  }
}

function onMore(id: string) {
  if (id === 'up') sheet.movePart(props.part.key, -1)
  else if (id === 'down') sheet.movePart(props.part.key, 1)
  else sheet.removePart(props.part.key)
}

const engineItems = computed<MenuItem[]>(() =>
  (['postgres', 'mysql'] as const).map((e) => ({
    id: e,
    label: t(`projectSheet.db.engine.${e}`),
    checked: props.part.kind === 'db' && props.part.engine === e,
  })),
)
</script>

<template>
  <li
    class="item"
    :class="{ open, dragging, grabbed, flagged: issues.length > 0 }"
    :data-part="part.key"
  >
    <div class="part" :class="{ db: part.kind === 'db' }">
      <button
        type="button"
        class="grip"
        :data-handle="part.key"
        :aria-label="t('projectSheet.parts.handle', { name })"
        :aria-pressed="grabbed"
        :title="t('projectSheet.parts.handleHelp')"
        @pointerdown="emit('handle-down', $event)"
        @keydown="emit('handle-key', $event)"
      >
        <svg viewBox="0 0 10 14" width="10" height="14" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="3" r="1.2" />
          <circle cx="7" cy="3" r="1.2" />
          <circle cx="3" cy="7" r="1.2" />
          <circle cx="7" cy="7" r="1.2" />
          <circle cx="3" cy="11" r="1.2" />
          <circle cx="7" cy="11" r="1.2" />
        </svg>
      </button>
      <SheetPicker
        :items="roleItems"
        :label="t('projectSheet.parts.role', { name })"
        :text="part.role.toUpperCase()"
        :tone="part.role"
        @select="setRole"
      />
      <UiBrandMark :name="brand" :size="16" class="mark">
        <UiIcon :name="KIND_ICON[part.kind]" :size="16" />
      </UiBrandMark>
      <div class="name">
        <SheetPicker
          v-if="part.kind === 'db'"
          :items="engineItems"
          :label="t('projectSheet.db.engineLabel')"
          :text="t(`projectSheet.db.engine.${part.engine}`)"
          title
          @select="setEngine"
        />
        <template v-else>
          <span class="kind">{{ t(`projectSheet.parts.kind.${part.kind}`) }}</span>
          <PartNameField
            :model-value="partName(part)"
            :suggestions="suggestions"
            :heading="heading"
            :placeholder="t(`projectSheet.parts.field.${part.kind}`)"
            :label="
              t('projectSheet.parts.field.name', {
                kind: t(`projectSheet.parts.kind.${part.kind}`),
              })
            "
            :tone="nameTone"
            :field="`part:${part.key}`"
            @update:model-value="setName"
            @pick="(s) => sheet.replacePart(applySuggestion(part, s))"
            @blur="sheet.touch(`part:${part.key}`)"
          />
        </template>
      </div>
      <SheetPicker
        :items="hostItems"
        :label="t('projectSheet.parts.host', { name })"
        :text="part.host || t('projectSheet.parts.hostPlaceholder')"
        :tone="unknownHost ? 'warn' : 'plain'"
        mono
        @select="setHost"
      />
      <span
        v-if="state"
        class="state"
        :class="{ ok: state.code === 'compose' ? state.running === state.total : state.online }"
      >
        <UiIcon
          v-if="state.code === 'compose' ? state.running === state.total : state.online"
          name="check"
          :size="12"
          :stroke="1.8"
        />
        <template v-if="state.code === 'pm2'">
          {{
            t(
              'projectSheet.parts.state.pm2',
              { status: state.status, n: fmt.number(state.instances) },
              state.instances,
            )
          }}
        </template>
        <template v-else>
          {{
            t('projectSheet.parts.state.compose', { running: state.running, total: state.total })
          }}
        </template>
      </span>
      <span v-else class="state" />
      <span class="actions">
        <UiButton
          v-if="part.kind === 'db'"
          variant="ghost"
          size="small"
          :icon="open ? 'chevron-down' : 'chevron-right'"
          :aria-expanded="open"
          :aria-label="open ? t('projectSheet.parts.collapse') : t('projectSheet.parts.expand')"
          @click="sheet.toggleExpanded(part.key)"
        />
        <UiMenu
          :items="moreItems"
          :label="t('projectSheet.parts.more', { name })"
          placement="bottom-end"
          @select="onMore"
        >
          <template #trigger="{ attrs, toggle }">
            <UiButton
              v-bind="attrs"
              variant="ghost"
              size="small"
              icon="more"
              :aria-label="t('projectSheet.parts.more', { name })"
              @click="toggle"
            />
          </template>
        </UiMenu>
      </span>
    </div>
    <DbPartFields v-if="part.kind === 'db' && open" :part="part" />
    <div
      v-if="issues.length > 0 || (badPath(part) && nameTone === 'error' && part.kind !== 'db')"
      class="issues"
    >
      <SheetMessages :issues="issues" :project="project" />
      <p v-if="badPath(part) && nameTone === 'error' && part.kind !== 'db'" class="abs">
        <UiIcon name="close" :size="10" :stroke="2" />{{ t('projectSheet.parts.absPath') }}
      </p>
    </div>
  </li>
</template>

<style scoped>
.item {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-sm);
  transition:
    box-shadow var(--dur-color) var(--ease-state),
    background-color var(--dur-color) var(--ease-state);
}

.item:nth-child(odd) {
  background: var(--surface-well);
}

.item.open {
  gap: var(--space-3);
  margin: 4px 0;
  padding: var(--space-3) var(--space-3) 14px;
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ink) 8%, transparent),
    0 12px 24px -18px color-mix(in srgb, var(--ink) 40%, transparent);
}

.item.flagged:not(.open) {
  box-shadow: inset 0 0 0 1.5px var(--warn-solid);
}

.item.dragging {
  position: relative;
  z-index: 2;
  background: var(--surface-0);
  box-shadow: var(--shadow-overlay);
}

.item.grabbed .grip {
  color: var(--accent-ink);
}

.part {
  display: grid;
  grid-template-columns: 14px 84px 20px minmax(0, 1fr) 112px 144px 52px;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 8px;
}

.open .part {
  height: 28px;
  padding: 0;
}

.grip {
  display: grid;
  place-items: center;
  width: 14px;
  height: 28px;
  color: var(--ink-5);
  cursor: grab;
  touch-action: none;
}

.grip:hover,
.grip:focus-visible {
  color: var(--ink-3);
}

.grip:focus-visible {
  border-radius: 4px;
  box-shadow: var(--focus-ring);
}

.mark {
  color: var(--ink-3);
}

.name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.kind {
  flex: none;
  color: var(--ink-3);
  font-size: var(--text-12);
}

.state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  color: var(--ink-3);
  font-size: var(--text-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state.ok {
  color: var(--ok-ink);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.issues {
  padding: 0 8px 8px 32px;
}

.abs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--crit-ink);
  font-size: var(--text-11);
}
</style>
