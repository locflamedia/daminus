<!--
  Step 3 of setup: confirm the projects. The suggestions of discover as cards you can edit, the
  finds that belong to none ("Not in a project"), the file that will be written beside them, and
  one save that writes `projects.json` and starts the first scan. Nothing is written before it.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { ProjectIssue } from '@/api'
import { errorText } from '@/lib/issue-text'
import { freeId, needsAttention, orderForGroup, warningCount } from '@/lib/group-view'
import { prefersReducedMotion } from '@/lib/motion'
import { issueSentence } from '@/lib/project-issues'
import {
  type DraftProject,
  draftToProject,
  emptyDraft,
  nextColor,
  previewLines,
} from '@/lib/setup-model'
import { useProjectSheetStore } from '@/stores/project-sheet'
import { useProjectsStore } from '@/stores/projects'
import { useScanStore } from '@/stores/scan'
import { useSetupStore } from '@/stores/setup'
import { type LooseItem, useSetupDraftsStore } from '@/stores/setup-drafts'
import { useToastStore } from '@/stores/toasts'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import GroupCard from './group/GroupCard.vue'
import GroupChecklist from './group/GroupChecklist.vue'
import GroupLoose from './group/GroupLoose.vue'
import GroupPreview from './group/GroupPreview.vue'
import SetupFrame from './SetupFrame.vue'

const { t } = useI18n()
const router = useRouter()
const setup = useSetupStore()
const store = useSetupDraftsStore()
const sheet = useProjectSheetStore()
const toasts = useToastStore()

// The suggestions become drafts as soon as discover has them; finds that arrive late add
// drafts, they never change one the user edited.
watch(
  () => store.proposal,
  () => {
    store.sync()
    void store.validate()
  },
  { immediate: true },
)

// A card that needed a look stays where it was put at the top, even once it is finished.
const pinned = ref<Set<string>>(new Set())
watch(
  () => store.drafts.filter(needsAttention).map((d) => d.key),
  (keys) => {
    pinned.value = new Set([...pinned.value, ...keys])
  },
  { immediate: true },
)
const ordered = computed(() => orderForGroup(store.drafts, pinned.value))

const lines = computed(() => previewLines(ordered.value))
const waiting = computed(() => store.drafts.length === 0 && !store.proposal && setup.scanning)
const empty = computed(() => store.drafts.length === 0 && !waiting.value)

const takenIds = computed(
  () => new Set([...store.drafts.map((d) => d.id), ...store.issues.map((i) => i.project)]),
)
const keepId = (d: DraftProject) => freeId(d.id, takenIds.value)

function copyOf(draft: DraftProject): DraftProject {
  return structuredClone(toRaw(draft))
}

function openNew() {
  sheet.open({
    draft: emptyDraft(nextColor(store.drafts.map((d) => d.color))),
    mode: 'setup',
    onSave: store.add,
  })
}

function openEdit(draft: DraftProject) {
  sheet.open({
    draft: copyOf(draft),
    mode: 'setup',
    onSave: store.replace,
    onRemove: () => store.remove(draft.key),
  })
}

function update(draftKey: string, change: (d: DraftProject) => DraftProject) {
  const draft = store.drafts.find((d) => d.key === draftKey)
  if (draft) store.replace(change(draft))
}

/** A path typed for a database part joins the project's `.env` files and is chosen. */
function chooseEnv(draftKey: string, partKey: string, path: string) {
  update(draftKey, (d) => ({
    ...d,
    envFiles: d.envFiles.includes(path) ? d.envFiles : [...d.envFiles, path],
    parts: d.parts.map((p) => (p.key === partKey && p.kind === 'db' ? { ...p, envFile: path } : p)),
  }))
}

function patchDb(
  draftKey: string,
  partKey: string,
  patch: { envFile?: string; database?: string },
) {
  update(draftKey, (d) => ({
    ...d,
    parts: d.parts.map((p) => (p.key === partKey && p.kind === 'db' ? { ...p, ...patch } : p)),
  }))
}

function createFrom(item: LooseItem) {
  const draft = store.newProjectFrom(item)
  if (draft) openEdit(draft)
}

function dropOn(draftKey: string, itemKey: string) {
  const item = store.loose.find((l) => l.key === itemKey)
  if (item) store.addToProject(item, draftKey)
}

// --- save -------------------------------------------------------------------------------
const rejected = ref<ProjectIssue[]>([])
const banner = ref<HTMLElement>()

function projectOf(issue: ProjectIssue) {
  const draft = store.drafts.find((d) => d.id === issue.project)
  return draft ? draftToProject(draft).project : undefined
}

const rejectedLines = computed(() =>
  rejected.value.map((issue) => ({
    project: issue.project,
    text: issueSentence(issue, projectOf(issue), (key, params) => t(key, params)),
  })),
)
const errorLine = computed(() => (store.error ? errorText(store.error) : ''))

async function showBanner() {
  await nextTick()
  banner.value?.scrollIntoView({
    block: 'nearest',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  })
}

async function save() {
  if (store.saving || store.drafts.length === 0) return
  rejected.value = []
  const outcome = await store.save(ordered.value.map((d) => d.key))
  if (!outcome) return void showBanner()
  if (outcome.status === 'rejected') {
    rejected.value = outcome.issues.filter((i) => i.level === 'error')
    return void showBanner()
  }
  const saved = t('setupGroup.result.saved', { n: outcome.projects }, outcome.projects)
  const warnings = warningCount(outcome)
  toasts.push({
    tone: 'ok',
    title:
      warnings === 0
        ? saved
        : t('setupGroup.result.savedWith', {
            saved,
            warnings: t('setupGroup.result.warnings', { n: warnings }, warnings),
          }),
    detail:
      warnings === 0
        ? undefined
        : outcome.issues
            .filter((i) => i.level === 'warning')
            .slice(0, 2)
            .map((i) => issueSentence(i, projectOf(i), (key, params) => t(key, params)))
            .join(' · '),
  })
  await router.push('/')
  setup.reset()
  store.reset()
  await useProjectsStore().loadDetails()
  void useScanStore().start()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    void save()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <SetupFrame :step="3" :title="t('setupGroup.title')" :subtitle="t('setupGroup.subtitle')">
    <template #status>
      <UiButton icon="plus" data-testid="new-project" @click="openNew">{{
        t('setupGroup.newProject')
      }}</UiButton>
    </template>

    <Teleport to="#setup-rail" defer>
      <GroupChecklist :drafts="store.drafts" />
    </Teleport>

    <div v-if="empty" class="empty" data-testid="group-empty">
      <UiEmptyState
        icon="folder"
        :title="t('setupGroup.empty.title')"
        :text="t('setupGroup.empty.text')"
      >
        <UiButton to="/setup/discover">{{ t('setupGroup.empty.back') }}</UiButton>
      </UiEmptyState>
    </div>

    <div v-else class="grid">
      <div class="main">
        <div ref="banner" class="banners" aria-live="polite">
          <div v-if="rejected.length > 0" class="rejected" data-testid="rejected">
            <UiBanner
              tone="crit"
              icon="critical"
              alert
              :title="t('setupGroup.result.rejected', { n: rejected.length }, rejected.length)"
              :text="t('setupGroup.result.rejectedHint')"
            />
            <ul>
              <li v-for="(line, i) in rejectedLines" :key="i">
                <b class="mono">{{ line.project || '—' }}</b> {{ line.text }}
              </li>
            </ul>
          </div>
          <UiBanner
            v-if="store.error"
            tone="crit"
            icon="critical"
            alert
            :title="t('setupGroup.result.failed')"
            :text="errorLine"
            data-testid="save-error"
          />
        </div>

        <div v-if="waiting" class="cards" :aria-label="t('setupGroup.waiting')" aria-busy="true">
          <div v-for="n in 3" :key="n" class="skeleton">
            <UiSkeleton width="40%" height="15px" />
            <UiSkeleton height="24px" radius="10px" tone="soft" />
            <UiSkeleton height="24px" radius="10px" tone="soft" />
          </div>
        </div>
        <div v-else class="cards" role="list" :aria-label="t('setupGroup.list')">
          <GroupCard
            v-for="(draft, index) in ordered"
            :key="draft.key"
            role="listitem"
            :draft="draft"
            :index="index"
            :attention="needsAttention(draft)"
            :replaces="store.replaces(draft)"
            :keep-id="keepId(draft)"
            @edit="openEdit(draft)"
            @remove="store.remove(draft.key)"
            @keep-both="store.keepBoth(draft.key)"
            @choose-env="(partKey, path) => chooseEnv(draft.key, partKey, path)"
            @patch-db="(partKey, patch) => patchDb(draft.key, partKey, patch)"
            @drop="(itemKey) => dropOn(draft.key, itemKey)"
          />
        </div>

        <GroupLoose
          v-if="!waiting"
          :items="store.loose"
          :drafts="store.drafts"
          @add="(item, key) => store.addToProject(item, key)"
          @create="createFrom"
        />
      </div>

      <GroupPreview :lines="lines" />
    </div>

    <template #summary>
      <div class="sum">
        <b>{{
          t('setupGroup.foot.projects', { n: store.summary.projects }, store.summary.projects)
        }}</b>
        <span
          >· {{ t('setupGroup.foot.parts', { n: store.summary.parts }, store.summary.parts) }} ·
          {{
            t('setupGroup.foot.servers', { n: store.summary.servers }, store.summary.servers)
          }}</span
        >
      </div>
    </template>
    <template #hint>{{ t('setupGroup.foot.hint') }}</template>
    <template #actions>
      <UiButton variant="ghost" to="/setup/discover">{{ t('setupGroup.foot.back') }}</UiButton>
      <UiButton
        variant="primary"
        size="large"
        icon="check"
        shortcut="⌘⏎"
        lifted
        :busy="store.saving"
        :disabled="store.drafts.length === 0"
        data-testid="save"
        @click="save"
        >{{ t('setupGroup.foot.save') }}</UiButton
      >
    </template>
  </SetupFrame>
</template>

<style scoped>
.grid {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) 328px;
  gap: var(--space-4);
  min-height: 0;
}

.main {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.banners:empty {
  display: none;
}

.banners {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.rejected ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: var(--space-2) 0 0;
  padding: 0 0 0 var(--space-4);
  color: var(--crit-ink);
  font-size: var(--text-12);
  line-height: 1.45;
}

.rejected b {
  font-weight: var(--weight-medium);
}

.skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.sum {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: auto;
  font-size: var(--text-12);
  color: var(--ink-3);
}

.sum b {
  color: var(--ink);
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.empty {
  display: grid;
  place-items: center;
  flex: 1 1 auto;
}
</style>
