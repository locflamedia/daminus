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
import UiTopology from '@/ui/UiTopology.vue'
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
const typed = ref(
  'Why is the events table growing so fast, and is it safe to prune rows older than 30 days?',
)
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
const split: TopologyInput[] = [
  { id: 'fe', label: 'FE', host: 'vps-sg-1', state: 'ok' },
  { id: 'be', label: 'BE', host: 'vps-sg-2', state: 'ok' },
  { id: 'db', label: 'DB', host: 'vps-sg-2', state: 'ok' },
]

const NOW = Date.now()
const uptime = (ms: string): ProjectCardMetric => ({
  label: k('card.uptime'),
  icon: 'globe',
  value: '200',
  unit: `· ${ms} ms`,
  note: k('card.noChange'),
})
const disk = (gb: string, delta: string, tone: 'warn' | 'normal'): ProjectCardMetric => ({
  label: k('card.disk'),
  icon: 'disk',
  value: gb,
  unit: 'GB',
  note: delta,
  noteTone: tone === 'warn' ? 'warn' : 'delta',
})
const db = (gb: string, delta: string, tone: 'warn' | 'normal'): ProjectCardMetric => ({
  label: k('card.db'),
  icon: 'database',
  value: gb,
  unit: 'GB',
  note: delta,
  noteTone: tone === 'warn' ? 'warn' : 'delta',
})
const notSetUp: ProjectCardMetric = {
  label: k('card.db'),
  icon: 'database',
  value: k('card.notSetUp'),
  state: 'not-set-up',
  note: k('card.addEnv'),
}

/** The seven states a tile of the card can be in, each with its caption. */
const tileStates = computed(() => [
  { caption: k('card.stateNormal'), metric: { ...uptime('212'), icon: undefined } },
  { caption: k('card.stateChanged'), metric: { ...disk('3.2', '+0.4', 'warn'), icon: undefined } },
  {
    caption: k('card.stateOver'),
    metric: {
      label: k('card.disk'),
      value: '87',
      unit: '%',
      state: 'warn' as const,
      note: k('card.warnFrom', { n: 80 }),
    },
  },
  { caption: k('card.stateNotSetUp'), metric: { ...notSetUp, icon: undefined } },
  {
    caption: k('card.statePermission'),
    metric: {
      label: k('card.logs'),
      state: 'needs-permission' as const,
      note: k('card.needsPermission'),
    },
  },
  {
    caption: k('card.stateOld'),
    metric: {
      label: k('card.db'),
      value: '1.82',
      unit: 'GB',
      state: 'stale' as const,
      note: k('card.fromDaysAgo', { n: 4 }),
    },
  },
  {
    caption: k('card.stateScanning'),
    metric: { label: k('card.disk'), state: 'scanning' as const },
  },
])

const oneServer: TopologyInput[] = [
  { id: 'fe', label: 'FE', host: 'vps-hn-3', state: 'ok' },
  { id: 'be', label: 'BE', host: 'vps-hn-3', state: 'ok' },
  { id: 'db', label: 'DB', host: 'vps-hn-3', state: 'ok' },
]
const workers: TopologyInput[] = [
  { id: 'app', label: 'APP', host: 'vps-sg-2', state: 'ok' },
  { id: 'worker', label: 'WORKER', host: 'vps-sg-2', state: 'ok' },
  { id: 'db', label: 'DB', host: 'db-main', state: 'ok' },
]
const topologyForms = computed(() => [
  { caption: k('card.topoOne'), components: oneServer },
  { caption: k('card.topoSplit'), components: split },
  {
    caption: k('card.topoMany'),
    components: [...workers, { id: 'cache', label: 'BE', host: 'cache-1', state: 'ok' as const }],
  },
])

const cardBase = computed(() => ({
  topologyLabel: k('card.topology', { name: 'kho-hang' }),
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
          <UiAskComposer
            v-model="typed"
            data-force="focus"
            :label="k('composer.label')"
            :placeholder="k('composer.placeholder')"
          />
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

    <GalleryFrame :title="k('card.name')" :text="k('card.lede')" :spec="k('card.spec')">
      <div class="card-stage">
        <div class="tray-hero">
          <UiProjectCard
            v-bind="cardBase"
            name="kho-hang"
            domain="khohang.vn"
            where="vps-hn-3"
            tint="amber"
            state="crit"
            :state-label="k('card.chipCritical')"
            :tags="[{ label: 'Laravel 11' }, { label: 'Vite' }, { label: 'MySQL 8.0' }]"
            :topology="[...oneServer]"
            :status="{
              tone: 'crit',
              icon: 'critical',
              title: k('card.criticalFindings'),
              meta: k('card.criticalMeta'),
            }"
            :action-label="k('card.toSecurity')"
            :metrics="[uptime('212'), disk('3.2', '+0.4', 'warn'), notSetUp]"
            :checked-at="NOW - 20 * 60_000"
            :passed-label="k('card.passed', { ok: 11, all: 14 })"
          />
        </div>
        <div class="cards">
          <UiProjectCard
            v-bind="cardBase"
            name="tiemtra"
            domain="tiemtra.vn"
            :where="k('card.twoServers')"
            tint="blue"
            state="warn"
            :state-label="k('card.chipWarnings')"
            :max-tags="2"
            :tags="[
              { label: 'Next.js 15' },
              { label: 'compose' },
              { label: 'Redis' },
              { label: 'S3' },
            ]"
            :topology="[...split]"
            :status="{
              tone: 'warn',
              icon: 'warn',
              title: k('card.workerRestarted'),
              meta: k('card.workerMeta'),
            }"
            :action-label="k('card.openMore')"
            :metrics="[uptime('142'), disk('5.4', '+0.9', 'warn'), db('1.82', '+440 MB', 'warn')]"
            :checked-at="NOW - 20 * 60_000"
            :passed-label="k('card.passed', { ok: 12, all: 14 })"
          />
          <UiProjectCard
            v-bind="cardBase"
            name="booking"
            domain="booking.vn"
            :where="k('card.twoServers')"
            tint="lilac"
            state="ok"
            :state-label="k('card.chipClear')"
            :tags="[{ label: 'Laravel 10' }, { label: 'compose' }, { label: 'MySQL 8.0' }]"
            :topology="[...workers]"
            :status="{
              tone: 'ok',
              icon: 'check-circle',
              title: k('card.allFourteen'),
              meta: k('card.allFourteenMeta'),
            }"
            :metrics="[uptime('180'), disk('6.1', '+0.1', 'normal'), db('2.4', '+12 MB', 'normal')]"
            :checked-at="NOW - 20 * 60_000"
            :passed-label="k('card.passed', { ok: 14, all: 14 })"
          />
          <UiProjectCard
            v-bind="cardBase"
            name="kho-hang"
            domain="khohang.vn"
            where="vps-hn-3"
            tint="amber"
            state="scanning"
            :state-label="k('card.chipWaiting')"
            :tags="[{ label: 'Laravel 11' }, { label: 'Vite' }, { label: 'MySQL 8.0' }]"
            :topology="[...oneServer]"
            :status="{
              tone: 'neutral',
              icon: 'search',
              tileTone: 'info',
              title: k('card.reading'),
              meta: k('card.readingMeta'),
            }"
            :metrics="[
              uptime('212'),
              { ...disk('3.2', '', 'normal'), state: 'scanning', note: undefined },
              { ...notSetUp, state: 'scanning', value: undefined },
            ]"
            :passed-label="k('card.thisScan')"
          />
          <UiProjectCard
            v-bind="cardBase"
            name="noibo-crm"
            domain="crm.noibo.vn"
            :where="k('card.twoServers')"
            tint="slate"
            state="unreachable"
            :state-label="k('card.chipUnreachable')"
            :tags="[{ label: 'Laravel 10' }, { label: 'compose' }, { label: 'MySQL 8.0' }]"
            :topology="[...workers.map((c) => ({ ...c, state: 'unknown' as const }))]"
            :status="{
              tone: 'neutral',
              icon: 'unreachable',
              title: k('card.reach'),
              meta: k('card.reachMeta'),
            }"
            :action-label="k('card.retry')"
            :metrics="[uptime('180'), disk('6.1', '+0.1', 'normal'), db('2.4', '+12 MB', 'normal')]"
            :checked-at="NOW - 3 * 24 * 3_600_000"
            :passed-label="k('card.passed', { ok: 14, all: 14 })"
          />
        </div>
        <ol class="blocks">
          <li v-for="n in 6" :key="n">
            <span class="num">{{ n }}</span>
            <span
              ><b>{{ k(`card.block${n}.name`) }}</b> {{ k(`card.block${n}.text`) }}</span
            >
          </li>
        </ol>
      </div>
    </GalleryFrame>

    <div class="two">
      <GalleryFrame :title="k('card.tileName')" :spec="k('card.tileSpec')">
        <div class="tile-states">
          <div v-for="state in tileStates" :key="state.caption" class="tile-state">
            <UiMetricTile form="note" v-bind="state.metric" />
            <span class="caption">{{ state.caption }}</span>
          </div>
        </div>
        <p class="para">{{ k('card.tileText') }}</p>
      </GalleryFrame>
      <GalleryFrame :title="k('card.topologyName')" :spec="k('card.topologySpec')">
        <div class="topos">
          <div v-for="form in topologyForms" :key="form.caption" class="topo-form">
            <UiTopology
              :components="form.components"
              mode="servers"
              url-label=""
              :states="nodeStates"
              :more-label="moreLabel"
              :label="form.caption"
              :list="false"
            />
            <span class="caption">{{ form.caption }}</span>
          </div>
        </div>
        <p class="para">{{ k('card.topologyText') }}</p>
      </GalleryFrame>
    </div>

    <GalleryFrame :title="k('card.rulesName')">
      <div class="rules">
        <span v-for="n in 4" :key="n"
          ><b>{{ k(`card.rule${n}.name`) }}</b> {{ k(`card.rule${n}.text`) }}</span
        >
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

.card-stage {
  display: grid;
  grid-template-columns: 412px minmax(0, 1fr);
  gap: var(--space-8);
  align-items: start;
}

.tray-hero {
  padding: 6px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--surface-0) 55%, transparent);
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.blocks {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2) var(--space-4);
  font-size: var(--text-12);
  line-height: 1.45;
}

.blocks li {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: var(--space-3);
}

.blocks b {
  font-weight: var(--weight-medium);
}

.num {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--crit-ink);
  color: var(--on-solid);
  font-size: 10px;
  font-weight: var(--weight-semibold);
}

.tile-states {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-2);
}

.tile-state,
.topo-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.topos {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.caption {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.para {
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.rules {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
  font-size: var(--text-13);
  line-height: 1.45;
}

.rules b {
  font-weight: var(--weight-medium);
}

.banners {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
