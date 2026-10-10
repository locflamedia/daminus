<!--
  "Add a host by hand": the Host block form in a sheet, without the teaching of the empty
  screen. Daminus never writes `~/.ssh/config`; the person fills the fields, copies the block,
  pastes it there and presses Check again, which reads the config again. When ssh then refuses
  the config (a bad line in the pasted block), the sheet says which file and line, so the answer
  to Check again is never silent. Under the form, one result line answers Check again for the
  alias typed (board 01b panel 10): reading, found (the primary becomes Import <alias>), in the
  file but left out (with the reason), or not there yet (with Copy block); it follows the
  listing, so a new answer replaces the last one. Opened and closed by the
  setup store's `addHostOpen` (bind it with v-model).
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { SkipReason } from '@/api'
import { buildHostBlock, emptyFields, type HostBlockFields } from '@/lib/host-block'
import { errorText, homeTilde } from '@/lib/issue-text'
import { useCopy } from '@/lib/use-copy'
import { useSetupStore } from '@/stores/setup'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiSpinner from '@/ui/UiSpinner.vue'
import UiSheet from '@/ui/UiSheet.vue'
import HostBlockForm from './HostBlockForm.vue'
import SshConfigBanner from './SshConfigBanner.vue'

const open = defineModel<boolean>({ required: true })

const { t } = useI18n()
const setup = useSetupStore()

const router = useRouter()
const route = useRoute()
const { state: copyState, copy } = useCopy()

const fields = ref<HostBlockFields>(emptyFields())
const checking = ref(false)
/** The alias the last Check again asked about; the answer is read from the current listing. */
const asked = ref<string | null>(null)

// A sheet that opens again starts from a clean form.
watch(open, (now) => {
  if (now) {
    fields.value = emptyFields()
    asked.value = null
  }
})

const alias = computed(() => fields.value.alias.trim())
// Another alias makes the last answer about a different host.
watch(alias, (now) => {
  if (now !== asked.value) asked.value = null
})

type Result =
  | { kind: 'reading' }
  | { kind: 'found'; alias: string; file: string; line: number }
  | { kind: 'leftOut'; alias: string; file: string; line: number; reason: SkipReason }
  | { kind: 'missing'; alias: string }

/**
 * The one result line. It follows the listing, so a read from elsewhere (⇧⌘R on the empty
 * screen) updates it; a failed read or a config ssh refuses leaves the line to their banner.
 */
const result = computed<Result | null>(() => {
  const host = asked.value
  if (checking.value) return host ? { kind: 'reading' } : null
  if (!host || setup.error || setup.configProblem) return null
  const entry = setup.entries.find((e) => e.host.alias === host)
  if (entry) {
    return { kind: 'found', alias: host, file: homeTilde(entry.host.file), line: entry.host.line }
  }
  const skipped = setup.skipped.find((s) => s.pattern === host)
  if (skipped) {
    return {
      kind: 'leftOut',
      alias: host,
      file: homeTilde(skipped.file),
      line: skipped.line,
      reason: skipped.reason,
    }
  }
  return { kind: 'missing', alias: host }
})

const found = computed(() => (result.value?.kind === 'found' ? result.value : null))

/**
 * Import is offered where it leads to Pick hosts without losing anything: not on a later setup
 * step (Discover, Group), and not while the agent holds no key (the test would only fail).
 */
const canImport = computed(
  () =>
    found.value !== null &&
    !route.path.startsWith('/setup/') &&
    (setup.agent === null || setup.agent === 'keys'),
)

const block = computed(() => buildHostBlock(fields.value))
const copyLabel = computed(() =>
  copyState.value === 'copied'
    ? t('empty.hostBlock.copied')
    : copyState.value === 'failed'
      ? t('empty.hostBlock.copyFailed')
      : t('empty.hostBlock.copy'),
)

async function checkAgain() {
  // Asked now; editing the alias while the config is read drops it (the watch above).
  asked.value = alias.value || null
  checking.value = true
  try {
    await setup.reload()
  } finally {
    checking.value = false
  }
}

function importHost(host: string) {
  setup.tick(host, true)
  open.value = false
  if (route.path !== '/setup') void router.push('/setup')
}

function copyBlock() {
  if (block.value.valid) void copy(block.value.text)
}
</script>

<template>
  <UiSheet
    :open="open"
    :title="t('empty.addHost.title')"
    :context="t('empty.addHost.context')"
    width="560px"
    pinned
    @close="open = false"
  >
    <div class="body">
      <HostBlockForm v-model="fields" variant="sheet" />
      <SshConfigBanner
        v-if="setup.configProblem"
        :problem="setup.configProblem"
        :busy="checking"
        @recheck="checkAgain"
      />
      <UiBanner
        v-else-if="setup.error"
        tone="crit"
        icon="critical"
        alert
        :title="t('setupPick.error.title')"
        :text="errorText(setup.error)"
      />
      <div v-else-if="result?.kind === 'reading'" class="result reading" role="status">
        <UiSpinner :size="14" />
        {{ t('empty.addHost.reading') }}
      </div>
      <div v-else-if="found" class="result found" role="status">
        <UiIcon name="check-circle" :size="14" />
        {{ t('empty.addHost.found', { alias: found.alias, file: found.file, line: found.line }) }}
      </div>
      <div v-else-if="result?.kind === 'leftOut'" class="result left-out" role="status">
        <span class="line">
          <UiIcon name="warn" :size="14" class="glyph" />
          {{
            t('empty.addHost.leftOut', {
              alias: result.alias,
              file: result.file,
              line: result.line,
              reason: t(`empty.help.leftOut.${result.reason}`),
            })
          }}
        </span>
      </div>
      <div v-else-if="result?.kind === 'missing'" class="result missing" role="status">
        <span class="line">
          <UiIcon name="warn" :size="14" class="glyph" />
          {{ t('empty.addHost.missing', { alias: result.alias, file: '~/.ssh/config' }) }}
        </span>
        <span v-if="block.valid">
          <UiButton variant="secondary" icon="copy" @click="copyBlock">{{ copyLabel }}</UiButton>
        </span>
      </div>
    </div>
    <template #footer-end>
      <UiButton @click="open = false">{{ t('empty.addHost.close') }}</UiButton>
      <UiButton v-if="found && canImport" variant="primary" @click="importHost(found.alias)">
        {{ t('empty.addHost.import', { alias: found.alias }) }}
      </UiButton>
      <UiButton v-else variant="primary" :busy="checking" @click="checkAgain">
        {{ t('empty.addHost.checkAgain') }}
      </UiButton>
    </template>
  </UiSheet>
</template>

<style scoped>
.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

/* One result line under the form, board 01b panel 10. */
.result {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.45;
}

.result.reading {
  min-height: 34px;
  padding-block: 0;
  background: var(--surface-1);
  color: var(--ink-3);
}

.result.found {
  background: var(--ok-soft);
  color: var(--ok-ink);
  font-weight: 500;
}

.result.missing,
.result.left-out {
  flex-direction: column;
  align-items: stretch;
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.result .line {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.result .glyph {
  flex: none;
  margin-top: 2px;
}
</style>
