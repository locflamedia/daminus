<!--
  One suggested project: its colour dot, name, URLs and servers, the parts as rows, the line that
  pairs front end and back end, and what is still to fill in. A project that is done folds to its
  header and one summary line; a project missing something carries its colour as a glow. A
  leftover dropped on the card is added to it.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { vEnter } from '@/lib/motion'
import { foldedParts, pairingLine, projectHosts, roleSet, showNewTag } from '@/lib/group-view'
import { type DraftProject, isIncomplete } from '@/lib/setup-model'
import { useSetupStore } from '@/stores/setup'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'
import RoleTag from '../components/RoleTag.vue'
import GroupDbEditor from './GroupDbEditor.vue'
import GroupPartRow from './GroupPartRow.vue'
import GroupReplaced from './GroupReplaced.vue'
import { useLooseDrag } from './use-loose-drag'

const props = defineProps<{
  draft: DraftProject
  /** Missing something: the glow, and the card stays open. */
  attention: boolean
  /** `projects.json` has this id already. */
  replaces: boolean
  keepId: string
  index: number
}>()
const emit = defineEmits<{
  edit: []
  remove: []
  keepBoth: []
  chooseEnv: [partKey: string, path: string]
  patchDb: [partKey: string, patch: { envFile?: string; database?: string }]
  drop: [itemKey: string]
}>()

const { t } = useI18n()
const setup = useSetupStore()
const drag = useLooseDrag()

const recordsOf = (host: string) => setup.recordsOf(host)

/** A card that is done folds; the user can open it, and it stays as they left it. */
const toggled = ref<boolean | null>(null)
const everNeeded = ref(props.attention || props.replaces)
watch(
  () => props.attention || props.replaces,
  (needs) => {
    if (needs) everNeeded.value = true
  },
)
const open = computed(() => toggled.value ?? everNeeded.value)
const foldable = computed(() => !props.attention && !props.replaces)

// A database part keeps its editor once it was incomplete, so typing the first letter of the
// name does not make the field disappear.
const edited = ref(new Set(props.draft.parts.filter(isIncomplete).map((p) => p.key)))
watch(
  () => props.draft.parts,
  (parts) => {
    for (const p of parts) if (isIncomplete(p)) edited.value = new Set([...edited.value, p.key])
  },
  { deep: true },
)

const hosts = computed(() => projectHosts(props.draft))
const pairing = computed(() => pairingLine(props.draft, recordsOf))
const roles = computed(() => roleSet(props.draft))
const folded = computed(() => foldedParts(props.draft))
const color = computed(() => props.draft.color ?? 'var(--accent)')

const menuOpen = ref(false)
const menu = computed<MenuItem[]>(() => [
  { id: 'edit', label: t('setupGroup.card.edit'), icon: 'edit' },
  { id: 'remove', label: t('setupGroup.card.remove'), icon: 'trash', danger: true },
])
function onMenu(id: string) {
  if (id === 'edit') emit('edit')
  else emit('remove')
}

const over = ref(false)
const accepts = computed(() => drag.dragging.value !== null)
function onOver(event: DragEvent) {
  if (!accepts.value) return
  event.preventDefault()
  over.value = true
}
function onDrop() {
  over.value = false
  const key = drag.dragging.value
  drag.end()
  if (key) emit('drop', key)
}
</script>

<template>
  <article
    v-enter="{ index: index + 1 }"
    class="card"
    :class="{ glow: attention, over: over && accepts }"
    :style="{ '--pc': color }"
    :data-testid="`card-${draft.id || draft.key}`"
    :aria-label="draft.name || draft.id"
    @dragover="onOver"
    @dragleave="over = false"
    @drop.prevent="onDrop"
  >
    <header class="head">
      <span class="dot" aria-hidden="true" />
      <b class="name">{{ draft.name || draft.id }}</b>
      <span v-if="showNewTag(draft, replaces)" class="new">{{ t('setupGroup.card.new') }}</span>
      <span v-if="replaces" class="saved"
        ><UiIcon name="info" :size="12" />{{ t('setupGroup.replaces.chip') }}</span
      >
      <span v-for="url in draft.urls" :key="url" class="url mono" :title="url">
        <UiIcon name="globe" :size="12" /><span class="u">{{ url }}</span>
      </span>
      <template v-if="!open">
        <span class="roles">
          <RoleTag v-for="role in roles" :key="role" :role="role" />
        </span>
      </template>
      <span class="grow" />
      <span
        v-if="replaces"
        class="id mono"
        :title="t('setupGroup.replaces.id', { id: draft.id })"
        >{{ t('setupGroup.replaces.id', { id: draft.id }) }}</span
      >
      <span class="hosts">
        <template v-for="(host, i) in hosts" :key="host">
          <UiIcon v-if="i > 0 && hosts.length === 2" name="arrow-right" :size="12" />
          <span v-else-if="i > 0" class="plus">+</span>
          <span class="mono">{{ host }}</span>
        </template>
        <template v-if="hosts.length === 1"
          >· {{ t('setupGroup.card.servers', { n: 1 }, 1) }}</template
        >
      </span>
      <span v-if="hosts.length > 1" class="servers">{{
        t('setupGroup.card.servers', { n: hosts.length }, hosts.length)
      }}</span>
      <UiButton
        v-if="foldable"
        variant="ghost"
        size="small"
        :icon="open ? 'chevron-down' : 'chevron-right'"
        :aria-label="
          t(open ? 'setupGroup.card.collapse' : 'setupGroup.card.expand', {
            name: draft.name || draft.id,
          })
        "
        :aria-expanded="open"
        data-testid="toggle"
        @click="toggled = !open"
      />
      <UiMenu
        v-model:open="menuOpen"
        :items="menu"
        :label="t('setupGroup.card.actions', { name: draft.name || draft.id })"
        placement="bottom-end"
        @select="onMenu"
      >
        <template #trigger="{ attrs, toggle }">
          <UiButton
            v-bind="attrs"
            variant="ghost"
            size="small"
            icon="more"
            :aria-label="t('setupGroup.card.actions', { name: draft.name || draft.id })"
            data-testid="card-menu"
            @click="toggle"
          />
        </template>
      </UiMenu>
    </header>

    <template v-if="open">
      <div class="parts">
        <template v-for="part in draft.parts" :key="part.key">
          <GroupPartRow
            :part="part"
            :records="recordsOf(part.host)"
            :has-env-files="draft.envFiles.length > 0"
            @choose-env="(path) => emit('chooseEnv', part.key, path)"
          />
          <GroupDbEditor
            v-if="
              part.kind === 'db' &&
              edited.has(part.key) &&
              (part.envFile !== '' || draft.envFiles.length > 0)
            "
            :part="part"
            :env-files="draft.envFiles"
            :project-name="draft.name || draft.id"
            @patch="(patch) => emit('patchDb', part.key, patch)"
          />
        </template>
      </div>
      <GroupReplaced
        v-if="replaces"
        :draft="draft"
        :keep-id="keepId"
        @keep-both="emit('keepBoth')"
      />
      <p v-if="pairing.length > 0" class="pair" data-testid="pairing">
        <svg width="120" height="12" viewBox="0 0 120 12" aria-hidden="true">
          <path d="M4 6h112" class="wire" />
          <circle cx="4" cy="6" r="3" class="d-be" />
          <circle cx="60" cy="6" r="3" class="d-fe" />
          <circle cx="116" cy="6" r="3" class="d-db" />
        </svg>
        <span>{{ pairing.map((w) => t(w.key, w.params)).join(', ') }}</span>
      </p>
    </template>
    <div v-else class="fold" data-testid="folded">
      <span v-for="(part, i) in folded" :key="i" class="bit">
        <span class="k">{{ t(`setupGroup.source.${part.kind}`) }}</span>
        <span class="mono">{{ part.name }}</span>
      </span>
      <span class="all">
        <UiIcon name="check" :size="12" :stroke="1.8" />{{
          t('setupGroup.card.allOk', { n: draft.parts.length }, draft.parts.length)
        }}
      </span>
    </div>
    <p v-if="over && accepts" class="drop">
      {{ t('setupGroup.card.dropHere', { name: draft.name || draft.id }) }}
    </p>
  </article>
</template>

<style scoped>
.card {
  --pc: var(--accent);

  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  box-shadow: var(--shadow-node);
  transition:
    box-shadow var(--dur-state) var(--ease-state),
    transform var(--dur-state) var(--ease-out);
}

/* The card that needs a look wears its own colour as a glow. */
.card.glow {
  box-shadow:
    var(--shadow-node),
    0 16px 32px -20px color-mix(in srgb, var(--pc) 55%, transparent);
}

.card.over {
  box-shadow: 0 0 0 2px var(--accent-mid);
}

/* One row, as drawn: the URL chips shrink and ellipsize so the menu stays at the right end. */
.head {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: var(--space-1) var(--space-3);
  min-height: var(--h-row);
  min-width: 0;
  padding: 0 var(--space-1) var(--space-1);
}

.dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pc);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pc) 16%, transparent);
}

.name {
  flex: none;
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
}

.new {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  background: var(--accent);
  color: var(--on-solid);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.saved {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.url {
  display: inline-flex;
  flex: 0 1 auto;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: 7px;
  background: var(--surface-1);
  color: var(--ink-2);
  font-size: var(--text-12);
  white-space: nowrap;
}

.url :deep(.icon) {
  flex: none;
  color: var(--ink-4);
}

.u {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.roles {
  display: inline-flex;
  flex: none;
  gap: var(--space-1);
}

.grow {
  flex-grow: 1;
}

.hosts {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.id {
  flex: none;

  /* When the header wraps, this line is the meta line and sits at the right. */
  margin-left: auto;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
}

.hosts :deep(.icon) {
  color: var(--ink-4);
}

.servers {
  display: inline-flex;
  flex: none;
  white-space: nowrap;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-xs);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.parts {
  display: flex;
  flex-direction: column;
}

.pair {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--h-control);
  margin: 0;
  padding: var(--space-1) var(--space-2) 0;
  color: var(--ink-3);
  font-size: var(--text-11);
}

.wire {
  fill: none;
  stroke: var(--pc);
  stroke-width: 1.5;
  stroke-dasharray: 3 4;
  stroke-linecap: round;
}

.d-be {
  fill: var(--role-be);
}

.d-fe {
  fill: var(--role-fe);
}

.d-db {
  fill: var(--role-db);
}

.fold {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-1) var(--space-1) 22px;
  color: var(--ink-3);
  font-size: var(--text-11);
  white-space: nowrap;
  overflow: hidden;
}

.bit {
  display: inline-flex;
  gap: 6px;
  min-width: 0;
}

.bit .mono {
  overflow: hidden;
  color: var(--ink-2);
  text-overflow: ellipsis;
}

.all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--ok-ink);
}

.drop {
  margin: 0;
  padding: 0 var(--space-2) var(--space-1);
  color: var(--accent-ink);
  font-size: var(--text-12);
}
</style>
