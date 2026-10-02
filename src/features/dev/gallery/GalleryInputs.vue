<!-- Inputs, laid out like the board "Inputs": fields, select, segmented control, switch, checkbox. -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import UiCheckbox from '@/ui/UiCheckbox.vue'
import UiField from '@/ui/UiField.vue'
import UiHoldButton from '@/ui/UiHoldButton.vue'
import UiKbd from '@/ui/UiKbd.vue'
import UiSelect, { type SelectOption } from '@/ui/UiSelect.vue'
import UiSeg from '@/ui/UiSeg.vue'
import UiSwitch from '@/ui/UiSwitch.vue'
import GalleryFrame from './GalleryFrame.vue'

const { t } = useI18n()

const path = ref('')
const hovered = ref('')
const typing = ref('/srv/kho-')
const verified = ref('/srv/kho-hang/.env')
const wrong = ref('/srv/kho/.env')
const off = ref('')
const search = ref('')

const model = ref('sonnet')
const models = computed<SelectOption[]>(() => [
  { value: 'sonnet', label: 'claude-sonnet-5', meta: t('gallery.inputs.modelDefault') },
  { value: 'opus', label: 'claude-opus-5-5', meta: t('gallery.inputs.modelDeeper') },
  { value: 'haiku', label: 'claude-haiku-4-5', meta: t('gallery.inputs.modelFast') },
])

const filter = ref('all')
const filters = computed(() => [
  { value: 'all', label: t('gallery.inputs.all'), count: 4 },
  { value: 'issues', label: t('gallery.inputs.issues'), count: 3 },
  { value: 'healthy', label: t('gallery.inputs.healthy'), count: 2 },
])

const scanOnOpen = ref(false)
const security = ref(true)

const hosts = ref({ sg: true, hn: true, old: false })
const hostCount = computed(() => Object.values(hosts.value).filter(Boolean).length)

const language = ref('en')
const languages = computed<SelectOption[]>(() => [
  { value: 'en', label: 'English', code: 'en', flag: 'gb' },
  { value: 'vi', label: 'Tiếng Việt', detail: 'Vietnamese', code: 'vi', flag: 'vn' },
  { value: 'ja', label: '日本語', detail: 'Japanese', code: 'ja', flag: 'jp', progress: 12 },
  { value: 'ko', label: '한국어', detail: 'Korean', code: 'ko', flag: 'kr', progress: 0 },
  { value: 'zh', label: '简体中文', detail: 'Chinese', code: 'zh-Hans', flag: 'cn', progress: 0 },
  { value: 'fr', label: 'Français', detail: 'French', code: 'fr', flag: 'fr', progress: 34 },
])

const confirmed = ref(0)

// The three typed states of the language menu: nothing found, only dimmed rows, and the
// arrow keys on the first row.
const LANGUAGE_STATES = [
  { key: 'empty', query: 'klingon', help: true },
  { key: 'pending', query: 'fr', help: false },
  { key: 'keyboard', query: 'e', help: false },
] as const
</script>

<template>
  <div class="inputs">
    <GalleryFrame
      :title="t('gallery.inputs.textField')"
      spec="label 11/500 · gap 6 · field 32 · r10 · padding-x 12 · help 12"
    >
      <div class="fields">
        <div class="cell">
          <UiField
            v-model="path"
            :label="t('gallery.inputs.envPath')"
            :placeholder="t('gallery.inputs.envPlaceholder')"
            :hint="t('gallery.inputs.envHint')"
          />
          <span class="cap">{{ t('gallery.inputs.states.default') }}</span>
        </div>
        <div class="cell">
          <UiField
            v-model="hovered"
            data-force="hover"
            :label="t('gallery.inputs.envPath')"
            :placeholder="t('gallery.inputs.envPlaceholder')"
            :hint="t('gallery.inputs.envHint')"
          />
          <span class="cap">{{ t('gallery.inputs.states.hover') }}</span>
        </div>
        <div class="cell">
          <UiField
            v-model="typing"
            data-force="focus"
            :label="t('gallery.inputs.envPath')"
            :hint="t('gallery.inputs.envHint')"
          />
          <span class="cap">{{ t('gallery.inputs.states.focus') }}</span>
        </div>
        <div class="cell">
          <UiField
            v-model="verified"
            mono
            :label="t('gallery.inputs.envPath')"
            :success="t('gallery.inputs.envFound')"
          />
          <span class="cap">{{ t('gallery.inputs.states.verified') }}</span>
        </div>
        <div class="cell">
          <UiField
            v-model="wrong"
            mono
            :label="t('gallery.inputs.envPath')"
            :error="t('gallery.inputs.envMissing')"
          />
          <span class="cap">{{ t('gallery.inputs.states.error') }}</span>
        </div>
        <div class="cell">
          <UiField
            v-model="off"
            disabled
            :label="t('gallery.inputs.envPath')"
            :placeholder="t('gallery.inputs.envOff')"
            :hint="t('gallery.inputs.envOffHint')"
          />
          <span class="cap">{{ t('gallery.inputs.states.disabled') }}</span>
        </div>
      </div>
      <div class="search-row">
        <UiField v-model="search" type="search" icon="search" :label="t('gallery.inputs.search')">
          <template #trailing><UiKbd tone="on-field">⌘K</UiKbd></template>
        </UiField>
      </div>
    </GalleryFrame>

    <div class="triple">
      <GalleryFrame :title="t('gallery.inputs.select')" :text="t('gallery.inputs.selectLede')">
        <div class="select-stage">
          <UiSelect
            v-model="model"
            :options="models"
            :label="t('gallery.inputs.model')"
            :custom-label="t('gallery.inputs.modelCustom')"
            default-open
          />
        </div>
        <span class="mono spec">menu r14 · padding 6 · rows 32 · overlay shadow</span>
      </GalleryFrame>

      <GalleryFrame :title="t('gallery.inputs.seg')" :text="t('gallery.inputs.segLede')">
        <UiSeg v-model="filter" :options="filters" :label="t('gallery.inputs.segGroup')" />
        <span class="mono spec">track 32 · pad 3 · r10 · segment 26 · r7 · 12/500</span>
        <h3 class="sub">{{ t('gallery.inputs.switch') }}</h3>
        <div class="stack">
          <UiSwitch v-model="scanOnOpen" :label="t('gallery.inputs.scanOnOpen')" />
          <UiSwitch v-model="security" :label="t('gallery.inputs.securityChecks')" />
          <UiSwitch :model-value="true" disabled :label="t('gallery.inputs.folderSizes')" />
        </div>
        <span class="mono spec">36 x 20 · knob 16 · on = ink, off = surface-3</span>
      </GalleryFrame>

      <GalleryFrame :title="t('gallery.inputs.checkbox')" :text="t('gallery.inputs.checkboxLede')">
        <div class="stack tight">
          <UiCheckbox
            :model-value="hostCount === 3"
            filled
            :indeterminate="hostCount > 0 && hostCount < 3"
            :meta="t('gallery.inputs.twoOfFour')"
            @update:model-value="(v: boolean) => (hosts = { sg: v, hn: v, old: v })"
          >
            {{ t('gallery.inputs.selectAll') }}
          </UiCheckbox>
          <UiCheckbox v-model="hosts.sg" mono meta="deploy@103.72.4.18">vps-sg-1</UiCheckbox>
          <UiCheckbox v-model="hosts.hn" mono meta="root@45.124.9.3" data-force="hover">
            vps-hn-2
          </UiCheckbox>
          <UiCheckbox v-model="hosts.old" mono meta="ProxyJump bastion">staging-old</UiCheckbox>
          <UiCheckbox :model-value="false" mono disabled :meta="t('gallery.inputs.wildcard')">
            *.internal
          </UiCheckbox>
        </div>
        <span class="mono spec"
          >box 16 · r5 · unchecked = inset 1.5 ink-4 · checked = ink fill</span
        >
      </GalleryFrame>
    </div>

    <div class="pair">
      <GalleryFrame :title="t('gallery.inputs.language')" :text="t('gallery.inputs.languageLede')">
        <div class="language-stage">
          <UiSelect
            v-model="language"
            variant="language"
            :options="languages"
            :accessible-name="t('gallery.inputs.languageLabel')"
            :search-placeholder="t('gallery.inputs.searchLanguages')"
            :pending-label="t('gallery.inputs.notTranslated')"
            :pending-hint="t('gallery.inputs.notTranslatedHint')"
            :help-label="t('gallery.inputs.helpTranslate')"
            :empty-label="t('gallery.inputs.noLanguage')"
            default-open
          />
        </div>
      </GalleryFrame>

      <div class="column">
        <GalleryFrame :title="t('gallery.inputs.keys')" :text="t('gallery.inputs.keysLede')">
          <div class="keys">
            <UiKbd>⌘K</UiKbd>
            <UiKbd>⌘R</UiKbd>
            <UiKbd>Esc</UiKbd>
            <span class="on on-button"><UiKbd tone="on-button">⌘R</UiKbd></span>
            <span class="on on-glass"><UiKbd tone="on-glass">esc</UiKbd></span>
            <span class="on on-field"><UiKbd tone="on-field">⌘K</UiKbd></span>
          </div>
        </GalleryFrame>
      </div>
    </div>

    <GalleryFrame :title="t('gallery.inputs.hold')" :text="t('gallery.inputs.holdLede')">
      <div class="hold-grid">
        <div class="hold-panel">
          <span class="cap">{{ t('gallery.inputs.holdA') }}</span>
          <div class="hold-row">
            <UiHoldButton
              :label="t('gallery.inputs.holdLabel')"
              :action-label="t('gallery.inputs.holdAction')"
              @confirm="confirmed++"
            />
            <span class="note">{{ t('gallery.inputs.holdSpec') }}</span>
          </div>
          <span class="mono spec">confirm × {{ confirmed }}</span>
        </div>
        <div class="hold-panel">
          <span class="cap">{{ t('gallery.inputs.holdB') }}</span>
          <div class="hold-stage">
            <UiHoldButton
              contained
              :label="t('gallery.inputs.holdLabel')"
              :action-label="t('gallery.inputs.holdAction')"
              :confirm-title="t('gallery.inputs.holdTitle')"
              :confirm-body="t('gallery.inputs.holdBody')"
              :confirm-label="t('gallery.inputs.holdAction')"
              @confirm="confirmed++"
            />
          </div>
        </div>
        <div class="hold-notes">
          <p v-for="n in 4" :key="n">
            <b>{{ t(`gallery.inputs.holdNote${n}.name`) }}</b>
            {{ t(`gallery.inputs.holdNote${n}.text`) }}
          </p>
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame
      :title="t('gallery.inputs.languageStates')"
      :text="t('gallery.inputs.languageStatesLede')"
    >
      <div class="states">
        <div v-for="state in LANGUAGE_STATES" :key="state.key" class="state">
          <span class="cap">{{ t(`gallery.inputs.langState.${state.key}.name`) }}</span>
          <div class="state-stage">
            <UiSelect
              :model-value="language"
              variant="language"
              :options="languages"
              :accessible-name="t('gallery.inputs.languageLabel')"
              :search-placeholder="t('gallery.inputs.searchLanguages')"
              :pending-label="t('gallery.inputs.notTranslated')"
              :pending-hint="t('gallery.inputs.notTranslatedHint')"
              :help-label="state.help ? t('gallery.inputs.helpTranslate') : undefined"
              :empty-label="t('gallery.inputs.noLanguage')"
              :default-query="state.query"
              default-open
            />
          </div>
          <span class="cap">{{ t(`gallery.inputs.langState.${state.key}.text`) }}</span>
        </div>
      </div>
    </GalleryFrame>
  </div>
</template>

<style scoped>
.inputs {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-4);
}

.cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cap {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.search-row {
  max-width: 320px;
}

.triple {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* Room for the open menu, which floats below its field. */
.select-stage {
  min-height: 270px;
}

.language-stage {
  width: 280px;
  min-height: 480px;
  margin-left: auto;
}

.states {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.state {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.state-stage {
  min-height: 340px;
}

.hold-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.hold-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-well);
}

.hold-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.hold-stage {
  position: relative;
  display: grid;
  min-height: 188px;
  padding: var(--space-5);
  border-radius: 12px;
}

.note {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.45;
}

.hold-notes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.hold-notes b {
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.spec {
  color: var(--ink-2);
  font-size: var(--text-11);
}

.sub {
  margin-top: var(--space-2);
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stack.tight {
  gap: 2px;
}

.keys {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.on {
  display: inline-flex;
  padding: var(--space-1);
  border-radius: var(--radius-xs);
}

.on-button {
  background: var(--btn);
  color: var(--btn-ink);
}

.on-glass {
  background: var(--side-2);
}

.on-field {
  background: var(--surface-1);
}
</style>
