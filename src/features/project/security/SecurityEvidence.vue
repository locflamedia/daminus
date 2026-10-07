<!--
  The evidence of a finding, raw and on dark, from the board "Project · Security": only what the
  facts hold (paths, sizes, owners, times, counts and key names; never a value). A list of files
  shows the first three and opens to the rest, in the order the check found them (newest
  first). A served file shows its key names as chips, twelve at most and then "+N more".
-->
<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/use-format'
import type { Evidence, FileEvidence } from '@/lib/security-findings'
import { dayTime, servedUrl } from '@/lib/security-format'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{ evidence: Evidence; check: string }>()

const MAX_KEYS = 12
const SHOWN_FILES = 3

const { t } = useI18n()
const fmt = useFormat()
const settings = useSettingsStore()

const open = ref(false)
const listId = useId()

const files = computed(() => (props.evidence.kind === 'files' ? props.evidence.files : []))
const single = computed(() => files.value.length === 1)
const shownFiles = computed(() => (open.value ? files.value : files.value.slice(0, SHOWN_FILES)))
const hiddenCount = computed(() => Math.max(0, files.value.length - SHOWN_FILES))

function when(seconds: number | null): string {
  return seconds === null ? '' : dayTime(seconds, settings.language)
}

function meta(file: FileEvidence): string {
  const size = file.size === null ? '' : fmt.measure(file.size, 'bytes').text
  const parts = [
    t(file.owner ? 'projectSecurity.evidence.meta' : 'projectSecurity.evidence.metaNoOwner', {
      size,
      owner: file.owner ?? '',
      when: when(file.mtime),
    }),
  ]
  if (props.check === 'sec.upload_php') parts.push(t('projectSecurity.evidence.uploadHint'))
  return parts.join(' · ')
}

function keysShown(keys: readonly string[]): string[] {
  return keys.slice(0, MAX_KEYS)
}

function reason(why: string | null): string {
  const known = ['dns', 'no_route', 'refused', 'timeout', 'tls', 'redirects', 'invalid_url']
  return t(`projectSecurity.evidence.reason.${why && known.includes(why) ? why : 'other'}`)
}

const httpLine = computed(() => {
  const e = props.evidence
  if (e.kind !== 'http') return ''
  return e.status !== null && e.ms !== null
    ? t('projectSecurity.evidence.http', { status: e.status, time: fmt.measure(e.ms, 'ms').text })
    : t('projectSecurity.evidence.httpNone', { why: reason(e.why) })
})
</script>

<template>
  <div class="ev" role="group">
    <template v-if="evidence.kind === 'files'">
      <template v-if="single">
        <div class="hl path">{{ files[0]?.path }}</div>
        <div v-if="files[0]" class="d">{{ meta(files[0]) }}</div>
      </template>
      <template v-else>
        <ul :id="listId" class="files" :aria-label="t('projectSecurity.evidence.listLabel')">
          <li v-for="file in shownFiles" :key="file.path" class="file">
            <span class="hl path">{{ file.path }}</span>
            <span class="d when">{{ when(file.mtime) }}</span>
          </li>
        </ul>
        <button
          v-if="hiddenCount > 0"
          type="button"
          class="more"
          :aria-expanded="open"
          :aria-controls="listId"
          @click="open = !open"
        >
          <span aria-hidden="true">⋮</span>
          {{
            open
              ? t('projectSecurity.evidence.less')
              : t('projectSecurity.evidence.more', { n: files.length })
          }}
        </button>
      </template>
    </template>

    <template v-else-if="evidence.kind === 'exposed'">
      <template v-for="file in evidence.files" :key="file.path">
        <div class="line">
          <span class="d">{{ t('projectSecurity.evidence.get') }}</span>
          {{ servedUrl(evidence.url, file.path) }}
          <span class="hl">→ {{ t('projectSecurity.evidence.served') }}</span>
        </div>
        <div v-if="file.keys.length > 0" class="keys">
          <span class="d">{{ t('projectSecurity.evidence.keysMatched') }}</span>
          <span v-for="key in keysShown(file.keys)" :key="key" class="key">{{ key }}</span>
          <span v-if="file.keys.length > MAX_KEYS" class="key rest">{{
            t('projectSecurity.evidence.moreKeys', { n: file.keys.length - MAX_KEYS })
          }}</span>
          <span class="d">· {{ t('projectSecurity.evidence.namesOnly') }}</span>
        </div>
        <div v-if="file.path.startsWith('/.git')" class="d">
          {{ t('projectSecurity.evidence.gitMeaning') }}
        </div>
      </template>
    </template>

    <template v-else-if="evidence.kind === 'miner'">
      <div class="hl">{{ evidence.name }}</div>
      <div v-if="evidence.exe" class="d">
        {{ t('projectSecurity.evidence.exe', { path: evidence.exe }) }}
      </div>
      <div v-if="evidence.deleted" class="d">{{ t('projectSecurity.evidence.deleted') }}</div>
    </template>

    <template v-else-if="evidence.kind === 'port'">
      <div class="hl">
        {{
          evidence.proc
            ? t('projectSecurity.evidence.port', { target: evidence.target, proc: evidence.proc })
            : evidence.target
        }}
      </div>
    </template>

    <template v-else-if="evidence.kind === 'preload'">
      <div class="d">/etc/ld.so.preload</div>
      <div class="d">
        {{ t('projectSecurity.evidence.libraries', { n: evidence.entries }, evidence.entries) }}
      </div>
      <div v-for="lib in evidence.libs" :key="lib" class="hl path">{{ lib }}</div>
    </template>

    <template v-else-if="evidence.kind === 'recent'">
      <div class="d">{{ t('projectSecurity.evidence.recentNewest') }}</div>
      <template v-if="evidence.files.length > 0">
        <div v-for="file in evidence.files" :key="file.path" class="file">
          <span class="hl path">{{ file.path }}</span>
          <span class="d when">{{ when(file.mtime) }}</span>
        </div>
      </template>
      <div v-else class="d">{{ t('projectSecurity.evidence.noFiles') }}</div>
    </template>

    <template v-else-if="evidence.kind === 'http'">
      <div class="line">
        <span class="d">{{ t('projectSecurity.evidence.get') }}</span> {{ evidence.url }}
        <span class="hl">→ {{ httpLine }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ev {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--code);
  color: var(--code-ink);
  font: var(--weight-regular) var(--text-11) / 1.6 var(--font-mono);
}

.d {
  color: var(--code-dim);
}

.hl {
  color: var(--code-hl);
}

.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.file {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  align-items: center;
}

.when {
  white-space: nowrap;
}

.more {
  align-self: flex-start;
  display: inline-flex;
  gap: 6px;
  padding: 0;
  color: var(--code-dim);
  font: inherit;
}

.more:hover {
  color: var(--code-ink);
}

.more:focus-visible {
  border-radius: var(--radius-xs);
  box-shadow: var(--focus-ring);
}

.line {
  overflow-wrap: anywhere;
}

.keys {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.key {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--code-hl) 14%, transparent);
  color: var(--code-hl);
}

.key.rest {
  background: color-mix(in srgb, var(--code-ink) 12%, transparent);
  color: var(--code-ink);
}
</style>
