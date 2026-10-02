<!--
  The composed components of the boards "Components", "Feedback", "Inputs", "AI", "Data
  display" and "Project card": metric tiles in their five states, the scan step, the empty
  state, search and the command palette, the ask composer, the AI finding (expanded and
  collapsed, in each stage of its life), the ask thread, the payload, provider rows and the
  project card in each of its states. Samples are fixed so the states can be compared.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NodeState, TopologyInput } from '@/lib/topology'
import UiAskComposer from '@/ui/UiAskComposer.vue'
import UiAskThread, { type AskMessage } from '@/ui/UiAskThread.vue'
import UiBanner from '@/ui/UiBanner.vue'
import UiButton from '@/ui/UiButton.vue'
import UiCommandPalette, { type PaletteGroup } from '@/ui/UiCommandPalette.vue'
import UiEmptyState from '@/ui/UiEmptyState.vue'
import UiFindingCard from '@/ui/UiFindingCard.vue'
import UiFindingRow from '@/ui/UiFindingRow.vue'
import UiMetricTile from '@/ui/UiMetricTile.vue'
import UiPayloadViewer from '@/ui/UiPayloadViewer.vue'
import UiProjectCard, { type ProjectCardMetric } from '@/ui/UiProjectCard.vue'
import UiProviderRow from '@/ui/UiProviderRow.vue'
import UiRowList from '@/ui/UiRowList.vue'
import UiScanStep from '@/ui/UiScanStep.vue'
import UiSearchField from '@/ui/UiSearchField.vue'
import GalleryFrame from './GalleryFrame.vue'

const { t } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) =>
  t(`gallery.composed.${key}`, params)

// --- metric tiles -------------------------------------------------------------------------------

const latency = [310, 322, 305, 318, 312, 309, 320, 314, 312]
const dbGrowth = [8.2, 8.21, 8.22, 8.25, 8.27, 8.3, 8.33, 8.35, 8.43]
const files = [1.1, 1.12, 1.15, 1.18, 1.2, 1.24]

// --- scan steps ---------------------------------------------------------------------------------

const stepProgress = ref(0.62)

// --- search and palette -------------------------------------------------------------------------

const paletteOpen = ref(false)
const paletteQuery = ref('kho')
const searchText = ref('')
const picked = ref('')
const groups = computed<PaletteGroup[]>(() => [
  {
    id: 'projects',
    label: k('palette.projects'),
    items: [
      { id: 'kho-hang', label: 'kho-hang', dot: 'warn', keywords: ['kho-hang.vn'] },
      { id: 'tiemtra-web', label: 'tiemtra-web', dot: 'crit' },
      { id: 'api-booking', label: 'api-booking', dot: 'ok' },
    ],
  },
  {
    id: 'servers',
    label: k('palette.servers'),
    items: [
      { id: 'vps-sg-1', label: 'vps-sg-1', icon: 'server' },
      { id: 'vps-hn-3', label: 'vps-hn-3', icon: 'server' },
    ],
  },
  {
    id: 'commands',
    label: k('palette.commands'),
    items: [
      { id: 'scan-kho-hang', label: k('palette.scan', { name: 'kho-hang' }), icon: 'refresh' },
      { id: 'ssh-vps-sg-1', label: k('palette.ssh', { host: 'vps-sg-1' }), icon: 'terminal' },
    ],
  },
])

// --- composer -----------------------------------------------------------------------------------

const ask = ref('')
const sentText = ref('')

// --- thread -------------------------------------------------------------------------------------

const waiting = ref(false)
const messages = computed<AskMessage[]>(() => [
  { id: 'q', role: 'user', text: k('thread.question') },
  {
    id: 'a',
    role: 'ai',
    text: k('thread.answer'),
    code: 'DELETE FROM events\nWHERE created_at < NOW() - INTERVAL 30 DAY\nLIMIT 50000;',
    language: 'sql',
    basedOn: k('thread.basedOn'),
  },
])

// --- payload ------------------------------------------------------------------------------------

const PAYLOAD = [
  '{',
  '  "project": "kho-hang",',
  '  "scan": 42,',
  '  "db": { "engine": "mysql", "size_gb": 8.43,',
  '    "top": [["events", 6.2]] },',
  '  "env": { "DB_PASSWORD": [redacted],',
  '    "APP_KEY": [redacted] },',
  '  "host": [ip redacted]',
  '}',
].join('\n')

// --- project card -------------------------------------------------------------------------------

const nodeStates = computed<Record<NodeState, string>>(() => ({
  ok: t('gallery.charts.topology.healthy'),
  warn: t('gallery.charts.topology.warning'),
  crit: t('gallery.charts.topology.critical'),
  unknown: t('gallery.charts.topology.unknown'),
}))
const moreLabel = (n: number) => t('gallery.charts.topology.more', { n })
const web: TopologyInput[] = [
  { id: 'fe', label: 'FE', host: 'vps-sg-1', state: 'ok' },
  { id: 'be', label: 'BE', host: 'vps-sg-1', state: 'warn' },
  { id: 'db', label: 'DB', host: 'vps-sg-1', state: 'warn' },
]
const split: TopologyInput[] = [
  { id: 'fe', label: 'FE', host: 'vps-sg-1', state: 'ok' },
  { id: 'be', label: 'BE', host: 'vps-sg-2', state: 'ok' },
  { id: 'db', label: 'DB', host: 'vps-sg-2', state: 'ok' },
]

const NOW = Date.now()
const cardMetrics = computed<ProjectCardMetric[]>(() => [
  {
    label: k('card.latency'),
    icon: 'clock',
    delta: 'p50',
    value: '312',
    unit: 'ms',
    series: latency,
  },
  {
    label: k('card.db'),
    icon: 'database',
    delta: '+1.1 GB',
    value: '8.43',
    unit: 'GB',
    series: dbGrowth,
    state: 'warn',
  },
  {
    label: k('card.files'),
    icon: 'folder',
    delta: '+38 MB',
    value: '1.24',
    unit: 'GB',
    series: files,
  },
])
const cardTags = [
  { label: 'Laravel 10', swatch: '#f05340' },
  { label: 'MySQL 8.0', swatch: '#4f8fd6' },
  { label: 'compose', swatch: '#2496ed' },
  { label: 'Redis' },
]

const cardBase = computed(() => ({
  topologyLabel: k('card.topology', { name: 'kho-hang' }),
  urlLabel: 'URL',
  nodeStates: nodeStates.value,
  moreLabel,
  openLabel: k('card.open'),
}))
</script>

<template>
  <div class="composed">
    <GalleryFrame :title="k('title')" :text="k('lede')">
      <div class="two">
        <div class="stack">
          <h3 class="sub">{{ k('metric.name') }}</h3>
          <span class="spec mono">{{ k('metric.spec') }}</span>
          <div class="tiles">
            <div class="tile-note">
              <UiMetricTile
                :label="k('metric.latency')"
                icon="clock"
                delta="p50"
                value="148"
                unit="ms"
                :series="latency"
                :note="k('metric.normal')"
              />
            </div>
            <div class="tile-note">
              <UiMetricTile
                :label="k('metric.database')"
                icon="database"
                delta="+1.1 GB"
                value="8.43"
                unit="GB"
                :series="dbGrowth"
                state="warn"
                :note="k('metric.warning')"
              />
            </div>
            <div class="tile-note">
              <UiMetricTile
                :label="k('metric.files')"
                icon="folder"
                :delta="k('metric.ago')"
                value="1.24"
                unit="GB"
                :series="files"
                state="stale"
                :note="k('metric.stale')"
              />
            </div>
            <div class="tile-note">
              <UiMetricTile
                :label="k('metric.latency')"
                icon="clock"
                value="312"
                unit="ms"
                :series="latency"
                state="scanning"
                :note="k('metric.scanning')"
              />
            </div>
            <div class="tile-note">
              <UiMetricTile
                :label="k('metric.containers')"
                icon="container"
                state="needs-permission"
                :reason="k('metric.permissionReason')"
                :note="k('metric.permission')"
              />
            </div>
          </div>
        </div>

        <div class="stack">
          <h3 class="sub">{{ k('steps.name') }}</h3>
          <span class="spec mono">{{ k('steps.spec') }}</span>
          <div class="steps">
            <UiScanStep
              state="done"
              :title="k('steps.urls')"
              :detail="k('steps.urlsDetail')"
              duration="0.8 s"
              :state-label="k('steps.done')"
            />
            <UiScanStep
              state="running"
              shaded
              title="vps-sg-1"
              detail="du -sk /var/www/kho-hang"
              mono
              :progress="stepProgress"
              duration="1.4 s"
              :state-label="k('steps.running')"
            />
            <UiScanStep
              state="waiting"
              :title="k('steps.waiting')"
              :detail="k('steps.waitingState')"
              :state-label="k('steps.waitingState')"
            />
            <UiScanStep
              state="done"
              shaded
              title="vps-hn-2"
              :detail="k('steps.skips')"
              duration="1.9 s"
              :state-label="k('steps.done')"
            />
            <UiScanStep
              state="failed"
              title="vps-hn-3"
              :detail="k('steps.failed')"
              duration="10 s"
              :state-label="k('steps.failedState')"
            />
          </div>
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame :title="k('empty.name')" :spec="k('empty.spec')">
      <UiEmptyState icon="server" :title="k('empty.title')" :text="k('empty.text')">
        <UiButton variant="primary" icon="start">{{ k('empty.action') }}</UiButton>
      </UiEmptyState>
    </GalleryFrame>

    <div class="two">
      <GalleryFrame :title="k('palette.name')" :spec="k('palette.spec')">
        <div class="stage">
          <UiSearchField
            v-model="searchText"
            :label="k('palette.field')"
            :placeholder="k('palette.fieldPlaceholder')"
            hint="⌘K"
          />
          <UiButton variant="secondary" @click="paletteOpen = true">{{
            k('palette.open')
          }}</UiButton>
          <p v-if="picked" class="note" role="status">{{ k('palette.picked', { id: picked }) }}</p>
          <UiCommandPalette
            v-model:query="paletteQuery"
            :open="paletteOpen"
            :groups="groups"
            :label="k('palette.label')"
            @select="(id: string) => (picked = id)"
            @close="paletteOpen = false"
          />
        </div>
      </GalleryFrame>

      <GalleryFrame :title="k('composer.name')" :spec="k('composer.spec')">
        <div class="composer">
          <UiAskComposer
            v-model="ask"
            :label="k('composer.label')"
            :placeholder="k('composer.placeholder')"
            @send="(text: string) => ((sentText = text), (ask = ''))"
          >
            <template #note>{{ k('composer.note') }}</template>
          </UiAskComposer>
          <p v-if="sentText" class="note" role="status">
            {{ k('composer.sent', { text: sentText }) }}
          </p>
        </div>
      </GalleryFrame>
    </div>

    <div class="two">
      <GalleryFrame :title="k('finding.name')" :text="k('finding.spec')">
        <UiFindingCard
          severity="crit"
          :severity-label="k('finding.critical')"
          project="tiemtra-web"
          :since="k('finding.since')"
          :title="k('finding.title')"
          :cause="k('finding.cause')"
          :evidence="[
            { key: k('finding.request'), value: 'GET https://tiemtra.vn/.env' },
            { key: k('finding.response'), value: '200 OK · 1.2 KB · text/plain', tone: 'crit' },
            { key: k('finding.root'), value: k('finding.rootValue') },
          ]"
          :fix="'# /etc/nginx/sites-enabled/tiemtra\nroot /var/www/tiemtra/public;\nlocation ~ /\\.(?!well-known) { deny all; }'"
          fix-language="nginx"
          :fix-label="k('finding.fixLabel')"
        >
          <template #actions>
            <UiButton variant="primary" size="small" icon="start">{{
              k('finding.copyFix')
            }}</UiButton>
            <UiButton variant="secondary" size="small">{{ k('finding.rotate') }}</UiButton>
            <UiButton variant="ghost" size="small">{{ k('finding.known') }}</UiButton>
          </template>
        </UiFindingCard>
      </GalleryFrame>

      <GalleryFrame :title="k('finding.collapsed')">
        <div class="lifecycle">
          <div class="state">
            <UiFindingRow severity="warn" chip="kho-hang" :title="k('finding.collapsedTitle')" />
            <span class="caption">{{ k('finding.collapsed') }}</span>
          </div>
          <div class="state">
            <UiFindingRow state="explaining" :chip="k('finding.explainingChip')" />
            <span class="caption">{{ k('finding.explaining') }}</span>
          </div>
          <div class="state">
            <UiFindingRow
              state="known"
              :chip="k('finding.knownChip')"
              :title="k('finding.knownTitle')"
            />
            <span class="caption">{{ k('finding.knownNote') }}</span>
          </div>
          <div class="state">
            <UiFindingRow
              state="resolved"
              :chip="k('finding.resolvedChip')"
              :title="k('finding.resolvedTitle')"
            />
            <span class="caption">{{ k('finding.resolved') }}</span>
          </div>
        </div>
      </GalleryFrame>
    </div>

    <div class="three">
      <GalleryFrame :title="k('thread.name')" :text="k('thread.spec')">
        <UiAskThread :messages="messages" :pending="waiting" animate="a" />
        <UiButton size="small" @click="waiting = !waiting">{{ k('thread.pending') }}</UiButton>
      </GalleryFrame>

      <GalleryFrame :title="k('payload.name')" :text="k('payload.spec')">
        <UiPayloadViewer :payload="PAYLOAD" :provider="k('payload.provider')" />
      </GalleryFrame>

      <GalleryFrame :title="k('providers.name')" :text="k('providers.spec')">
        <UiRowList as="div">
          <UiProviderRow shaded name="Anthropic" mark="A" :detail="k('providers.anthropicDetail')">
            <template #trailing>
              <span class="connected">{{ k('providers.connected') }}</span>
            </template>
          </UiProviderRow>
          <UiProviderRow name="Ollama" mark="O" :detail="k('providers.ollamaDetail')">
            <template #trailing
              ><UiButton variant="soft" size="small">{{
                k('providers.connect')
              }}</UiButton></template
            >
          </UiProviderRow>
          <UiProviderRow
            shaded
            name="OpenRouter"
            mark="R"
            :detail="k('providers.openrouterDetail')"
            error
          >
            <template #trailing
              ><UiButton variant="secondary" size="small">{{
                k('providers.updateKey')
              }}</UiButton></template
            >
          </UiProviderRow>
          <UiProviderRow
            :name="k('providers.customName')"
            mark="+"
            :detail="k('providers.customDetail')"
          >
            <template #trailing
              ><UiButton variant="soft" size="small">{{ k('providers.add') }}</UiButton></template
            >
          </UiProviderRow>
        </UiRowList>
      </GalleryFrame>
    </div>

    <GalleryFrame :title="k('card.name')" :spec="k('card.spec')">
      <div class="cards">
        <UiProjectCard
          v-bind="cardBase"
          name="kho-hang"
          domain="kho-hang.vn"
          tint="amber"
          icon="cart"
          state="warn"
          :state-label="k('card.needsLook')"
          :tags="cardTags"
          :topology="web"
          :status="{
            tone: 'warn',
            icon: 'database',
            title: k('card.grew'),
            meta: k('card.alsoRestarted'),
            chip: k('card.issues'),
          }"
          :metrics="cardMetrics"
          :checked-at="NOW - 20 * 60_000"
          :passed-label="k('card.passed', { ok: 12, all: 14 })"
        />
        <UiProjectCard
          v-bind="cardBase"
          name="tiemtra-web"
          domain="tiemtra.vn"
          tint="rose"
          icon="shield"
          state="crit"
          :state-label="k('card.critical')"
          :tags="cardTags.slice(0, 2)"
          :topology="split"
          topology-mode="servers"
          :status="{
            tone: 'crit',
            icon: 'lock',
            title: k('card.envPublic'),
            meta: k('card.envMeta'),
          }"
          :action-label="k('card.fix')"
          :metrics="cardMetrics"
          :checked-at="NOW - 5 * 3_600_000"
          :passed-label="k('card.passed', { ok: 11, all: 14 })"
        />
        <UiProjectCard
          v-bind="cardBase"
          name="api-booking"
          domain="api.datlich.io"
          tint="blue"
          icon="terminal"
          state="ok"
          :state-label="k('card.healthy')"
          :tags="cardTags.slice(0, 2)"
          :topology="split.map((c) => ({ ...c, state: 'ok' as const }))"
          :status="{
            tone: 'neutral',
            icon: 'check-circle',
            tileTone: 'ok' as const,
            title: k('card.allPassed'),
            meta: k('card.nothingChanged'),
            chip: k('card.zeroIssues'),
          }"
          :metrics="cardMetrics.map((m) => ({ ...m, delta: undefined, state: 'normal' as const }))"
          :checked-at="NOW - 3 * 24 * 3_600_000"
          :passed-label="k('card.passed', { ok: 9, all: 9 })"
        />
        <UiProjectCard
          v-bind="cardBase"
          name="ghichu-blog"
          domain="ghichu.dev"
          tint="lilac"
          icon="file"
          state="scanning"
          :state-label="k('card.scanning')"
          :tags="cardTags.slice(0, 1)"
          :topology="web.map((c) => ({ ...c, state: 'ok' as const }))"
          :status="{
            tone: 'neutral',
            icon: 'check-circle',
            tileTone: 'ok' as const,
            title: k('card.allPassed'),
            chip: k('card.zeroIssues'),
          }"
          :metrics="cardMetrics"
          :checked-at="NOW - 20 * 60_000"
          :passed-label="k('card.passed', { ok: 6, all: 6 })"
        />
        <UiProjectCard
          v-bind="cardBase"
          name="noibo-crm"
          domain="crm.noibo.vn"
          tint="grey"
          icon="server"
          state="unreachable"
          :state-label="k('card.unreachable')"
          :tags="cardTags.slice(0, 1)"
          :topology="split.map((c) => ({ ...c, state: 'unknown' as const }))"
          :status="{
            tone: 'neutral',
            icon: 'unreachable',
            title: k('card.reach'),
            meta: k('card.reachMeta'),
          }"
          :action-label="k('card.retry')"
          :metrics="cardMetrics.map((m) => ({ ...m, delta: undefined, state: 'stale' as const }))"
          :checked-at="NOW - 3 * 24 * 3_600_000"
          :passed-label="k('card.passed', { ok: 0, all: 14 })"
        />
      </div>
    </GalleryFrame>

    <GalleryFrame :title="t('gallery.display.banner')" :text="t('gallery.display.bannerLede')">
      <div class="banners">
        <UiBanner
          :title="t('gallery.display.bannerTitle')"
          :text="t('gallery.display.bannerMeta')"
        />
        <UiBanner
          tone="crit"
          icon="critical"
          alert
          :title="k('card.envPublic')"
          :text="k('card.envMeta')"
        />
      </div>
    </GalleryFrame>
  </div>
</template>

<style scoped>
.composed {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.three {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.sub {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.spec {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.mono {
  font-family: var(--font-mono);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-2);
}

.tile-note {
  min-width: 0;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 460px;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--surface-1);
  padding: var(--space-4);
}

.composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.note {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.lifecycle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3) var(--space-2);
}

.state {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.caption {
  color: var(--ink-2);
  font-size: var(--text-11);
}

.connected {
  display: inline-flex;
  align-items: center;
  height: var(--h-chip);
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--ok-soft);
  color: var(--ok-ink);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.banners {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
