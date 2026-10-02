<!--
  Display primitives, laid out like the boards "Components", "Feedback", "Data display",
  "States" and "AI": chips and tags, cards with their severity wash, rows and status rows,
  the skeleton, the code block and the command line with copy.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { vEnter } from '@/lib/motion'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChip from '@/ui/UiChip.vue'
import UiCodeBlock from '@/ui/UiCodeBlock.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import UiRow, { type RowTone } from '@/ui/UiRow.vue'
import UiRowList from '@/ui/UiRowList.vue'
import UiSkeleton from '@/ui/UiSkeleton.vue'
import UiTag from '@/ui/UiTag.vue'
import type { IconName } from '@/ui/icon-paths'
import GalleryFrame from './GalleryFrame.vue'

const { t } = useI18n()

const landed = ref(false)
const copied = ref(0)

const NGINX = [
  '# /etc/nginx/sites-enabled/tiemtra',
  'root /var/www/tiemtra/public;',
  'location ~ /\\.(?!well-known) { deny all; }',
].join('\n')
const SQL = [
  'DELETE FROM events',
  'WHERE created_at < NOW() - INTERVAL 30 DAY',
  'LIMIT 50000;',
].join('\n')
const SHELL = ['$ curl -fsSL https://get.example.dev/install | sh', '$ rm -rf /var/www/old'].join(
  '\n',
)
const PAYLOAD = [
  '{',
  '  "project": "kho-hang",',
  '  "scan": 42,',
  '  "db": { "engine": "mysql" }',
  '}',
].join('\n')

// Built from character codes, so this file carries no hidden characters of its own.
const ESC = String.fromCharCode(0x1b)
const RLO = String.fromCharCode(0x202e)
const ZWSP = String.fromCharCode(0x200b)
const HIDDEN = `ls ${ESC}[2J${ZWSP}-la ${RLO}gnp.txt`
const LONG = `sudo rsync -aHAX --info=progress2 --exclude=node_modules --exclude=.git --exclude=storage/logs /srv/kho-hang/ deploy@vps-sg-2:/srv/kho-hang-backup/ && echo done`

type StateKind = 'chip' | 'plain-chip' | 'progress' | 'fix' | 'scan' | 'retry' | 'how' | 'path'
interface StateRow {
  tone: RowTone
  tile: IconName
  tileTone?: RowTone
  title: string
  meta: string
  mono?: boolean
  busy?: boolean
  kind: StateKind
  chip?: string
}

const states = computed<StateRow[]>(() => [
  {
    tone: 'neutral',
    tile: 'check-circle',
    tileTone: 'ok',
    title: t('gallery.display.rowPassed'),
    meta: t('gallery.display.rowPassedMeta'),
    kind: 'chip',
    chip: t('gallery.display.chipNeutral'),
  },
  {
    tone: 'warn',
    tile: 'warn',
    title: t('gallery.display.rowGrew'),
    meta: t('gallery.display.rowGrewMeta'),
    kind: 'plain-chip',
    chip: '+1.1 GB',
  },
  {
    tone: 'crit',
    tile: 'critical',
    title: t('gallery.display.rowEnv'),
    meta: t('gallery.display.rowEnvMeta'),
    kind: 'fix',
  },
  {
    tone: 'neutral',
    tile: 'refresh',
    busy: true,
    title: t('gallery.display.rowScanning'),
    meta: 'du -sk /var/www/kho-hang',
    mono: true,
    kind: 'progress',
    chip: '62%',
  },
  {
    tone: 'neutral',
    tile: 'clock',
    title: t('gallery.display.rowStale'),
    meta: t('gallery.display.rowStaleMeta'),
    kind: 'scan',
  },
  {
    tone: 'neutral',
    tile: 'unreachable',
    title: t('gallery.display.rowUnreachable'),
    meta: t('gallery.display.rowUnreachableMeta'),
    kind: 'retry',
  },
  {
    tone: 'neutral',
    tile: 'lock',
    title: t('gallery.display.rowSkipped'),
    meta: t('gallery.display.rowSkippedMeta'),
    kind: 'how',
  },
  {
    tone: 'neutral',
    tile: 'info',
    title: t('gallery.display.rowNotSet'),
    meta: t('gallery.display.rowNotSetMeta'),
    kind: 'path',
  },
])
</script>

<template>
  <div class="display">
    <div class="pair">
      <GalleryFrame
        :title="t('gallery.display.chips')"
        :text="t('gallery.display.chipsLede')"
        spec="chip 22 · pill · 11/500 · tag 22 · r6"
      >
        <div class="wrap">
          <UiChip tone="ok">{{ t('gallery.display.chipOk') }}</UiChip>
          <UiChip tone="warn">{{ t('gallery.display.chipWarn') }}</UiChip>
          <UiChip tone="crit">{{ t('gallery.display.chipCrit') }}</UiChip>
          <UiChip tone="info">{{ t('gallery.display.chipInfo') }}</UiChip>
          <UiChip tone="neutral">{{ t('gallery.display.chipNeutral') }}</UiChip>
        </div>
        <div class="wrap">
          <UiChip tone="warn" icon="refresh">{{ t('gallery.display.chipOom') }}</UiChip>
          <UiChip tone="info" busy>{{ t('gallery.display.chipBusy') }}</UiChip>
          <span class="well">
            <UiChip tone="plain">{{ t('gallery.display.chipPlain') }}</UiChip>
          </span>
        </div>
        <div class="wrap">
          <UiTag swatch="#f05340">{{ t('gallery.display.tagLaravel') }}</UiTag>
          <UiTag swatch="#336791">{{ t('gallery.display.tagPostgres') }}</UiTag>
          <UiTag>pm2</UiTag>
          <UiTag mono>{{ t('gallery.display.tagKey') }}</UiTag>
          <span class="well"><UiTag plain>pm2</UiTag></span>
        </div>
      </GalleryFrame>

      <GalleryFrame
        :title="t('gallery.display.skeleton')"
        :text="t('gallery.display.skeletonLede')"
        spec="bars 11 · 15 · 24 · still 400 ms · sheen 1.6 s"
      >
        <div class="skeleton-stage">
          <div class="skeleton-card" :aria-busy="!landed">
            <template v-if="!landed">
              <UiSkeleton width="40%" height="11px" />
              <UiSkeleton width="60%" height="15px" />
              <UiSkeleton height="24px" tone="soft" />
              <span class="cap">{{ t('gallery.display.skeletonWait') }}</span>
            </template>
            <template v-else>
              <span v-enter="{ kind: 'reveal' }" class="landed">
                <span class="landed-label">{{ t('gallery.display.skeletonLabel') }}</span>
                <span class="landed-value"
                  >{{ t('gallery.display.skeletonValue')
                  }}<span class="landed-unit"> {{ t('gallery.display.skeletonUnit') }}</span></span
                >
              </span>
            </template>
          </div>
          <UiButton variant="soft" size="small" @click="landed = !landed">{{
            landed ? t('gallery.display.skeletonAgain') : t('gallery.display.skeletonLand')
          }}</UiButton>
        </div>
      </GalleryFrame>
    </div>

    <GalleryFrame
      :title="t('gallery.display.cards')"
      :text="t('gallery.display.cardsLede')"
      spec="card r14 · pad 16 · wash 88 px · tray r20 = 14 + 6 · no border"
    >
      <div class="cards">
        <UiCard tray>
          <b class="ct">{{ t('gallery.display.cardNeutral') }}</b>
          <span class="muted">{{ t('gallery.display.cardNeutralText') }}</span>
        </UiCard>
        <UiCard tray tone="ok">
          <UiChip tone="ok">{{ t('gallery.display.cardOk') }}</UiChip>
          <b class="ct">{{ t('gallery.display.cardOkTitle') }}</b>
          <span class="muted">{{ t('gallery.display.cardOkText') }}</span>
        </UiCard>
        <UiCard tray tone="info">
          <UiChip tone="info">{{ t('gallery.display.cardInfo') }}</UiChip>
          <span class="muted">{{ t('gallery.display.cardInfoText') }}</span>
        </UiCard>
        <UiCard tray tone="warn">
          <UiChip tone="warn">{{ t('gallery.display.cardWarn') }}</UiChip>
          <b class="ct">{{ t('gallery.display.cardWarnTitle') }}</b>
          <span class="muted">{{ t('gallery.display.cardWarnText') }}</span>
        </UiCard>
        <UiCard tray tone="crit">
          <UiChip tone="crit">{{ t('gallery.display.cardCrit') }}</UiChip>
          <b class="ct">{{ t('gallery.display.cardCritTitle') }}</b>
          <span class="muted">{{ t('gallery.display.cardCritText') }}</span>
        </UiCard>
      </div>
    </GalleryFrame>

    <GalleryFrame
      :title="t('gallery.display.rows')"
      :text="t('gallery.display.rowsLede')"
      spec="40 · 48 · 56 · r10 · tile 28 / 32 · white tile on tint"
    >
      <div class="states">
        <UiRow
          v-for="row in states"
          :key="row.title"
          size="status"
          raised
          :tone="row.tone"
          :tile="row.tile"
          :tile-tone="row.tileTone"
          :busy="row.busy"
          :title="row.title"
          :meta="row.meta"
          :mono="row.mono"
        >
          <template #trailing>
            <UiChip v-if="row.kind === 'chip'">{{ row.chip }}</UiChip>
            <UiChip v-else-if="row.kind === 'plain-chip'" tone="plain">{{ row.chip }}</UiChip>
            <UiChip v-else-if="row.kind === 'progress'" tone="info">{{ row.chip }}</UiChip>
            <UiButton v-else-if="row.kind === 'fix'" size="small" variant="primary">{{
              t('gallery.display.fix')
            }}</UiButton>
            <UiButton v-else-if="row.kind === 'scan'" size="small" variant="soft">{{
              t('gallery.display.scan')
            }}</UiButton>
            <UiButton v-else-if="row.kind === 'retry'" size="small" variant="soft">{{
              t('gallery.display.retry')
            }}</UiButton>
            <UiButton v-else-if="row.kind === 'how'" size="small" variant="soft">{{
              t('gallery.display.howToFix')
            }}</UiButton>
            <UiButton v-else size="small" variant="soft">{{
              t('gallery.display.addPath')
            }}</UiButton>
          </template>
        </UiRow>
      </div>
    </GalleryFrame>

    <div class="pair">
      <GalleryFrame
        :title="t('gallery.display.recipes')"
        :text="t('gallery.display.recipesLede')"
        spec="header 28 · rows 40 / 48 · zebra surface-1"
      >
        <UiRowList :label="t('gallery.display.recipes')">
          <UiRow as="li" header columns="minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr) 96px">
            <span>{{ t('gallery.display.colHost') }}</span>
            <span>{{ t('gallery.display.colDisk') }}</span>
            <span>{{ t('gallery.display.colMemory') }}</span>
            <span class="end">{{ t('gallery.display.colSecurity') }}</span>
          </UiRow>
          <UiRow
            as="li"
            size="default"
            tile="server"
            title="vps-sg-1"
            meta="Ubuntu 24.04 · up 41 d"
            mono
          >
            <template #trailing
              ><UiChip tone="ok">{{ t('gallery.display.sec') }}</UiChip></template
            >
          </UiRow>
          <UiRow
            as="li"
            size="default"
            tile="server"
            title="vps-hn-2"
            meta="Debian 12 · up 12 d"
            mono
          >
            <template #trailing
              ><UiChip tone="crit">{{ t('gallery.display.secFinding') }}</UiChip></template
            >
          </UiRow>
          <UiRow
            as="li"
            size="default"
            tile="container"
            :title="t('gallery.display.recipeApi')"
            :meta="t('gallery.display.recipeApiMeta')"
            mono
          >
            <template #trailing
              ><UiChip tone="warn" icon="refresh">{{
                t('gallery.display.chipOom')
              }}</UiChip></template
            >
          </UiRow>
          <UiRow
            as="li"
            size="default"
            tile="folder"
            :title="t('gallery.display.recipeLogs')"
            :meta="t('gallery.display.recipeLogsMeta')"
            mono
          >
            <template #trailing><b class="value">640 MB</b></template>
          </UiRow>
          <UiRow
            as="li"
            size="default"
            tile="shield"
            tile-tone="ok"
            :title="t('gallery.display.recipeMiner')"
            :meta="t('gallery.display.recipeMinerMeta')"
          >
            <template #trailing>{{ t('gallery.display.recipeTime') }}</template>
          </UiRow>
        </UiRowList>
      </GalleryFrame>

      <GalleryFrame
        :title="t('gallery.display.banner')"
        :text="t('gallery.display.bannerLede')"
        spec="56 · r10 · warn-soft · tile 32 white"
      >
        <UiRow
          size="status"
          tone="warn"
          tile="clock"
          :title="t('gallery.display.bannerTitle')"
          :meta="t('gallery.display.bannerMeta')"
        />
        <UiRowList as="div" :zebra="false">
          <UiRow size="compact" tile="server" title="vps-sg-1" mono as="button">
            <template #trailing>92%</template>
          </UiRow>
          <UiRow size="compact" tile="server" title="vps-hn-3" mono as="button">
            <template #trailing>{{ t('gallery.display.recipeTime') }}</template>
          </UiRow>
        </UiRowList>
      </GalleryFrame>
    </div>

    <GalleryFrame
      :title="t('gallery.display.code')"
      :text="t('gallery.display.codeLede')"
      spec="r10 · Geist Mono 11 / 1.6 · pad 12 · copy 28 r8"
    >
      <div class="pair inner">
        <div class="stack">
          <span class="cap">{{ t('gallery.display.codeNginx') }}</span>
          <UiCodeBlock :code="NGINX" language="nginx" :label="t('gallery.display.codeLabel')" />
          <span class="cap">{{ t('gallery.display.codeSql') }}</span>
          <UiCodeBlock :code="SQL" language="sql" :label="t('gallery.display.codeLabel')" />
        </div>
        <div class="stack">
          <span class="cap">{{ t('gallery.display.codeShell') }}</span>
          <UiCodeBlock :code="SHELL" language="shell" :label="t('gallery.display.codeLabel')" />
          <span class="cap">{{ t('gallery.display.codeLight') }}</span>
          <UiCodeBlock :code="PAYLOAD" tone="light" wrap :label="t('gallery.display.codeLabel')" />
        </div>
      </div>
    </GalleryFrame>

    <GalleryFrame
      :title="t('gallery.display.command')"
      :text="t('gallery.display.commandLede')"
      spec="32 · r9 · mono 12 · copy 24 r6 · warns on | sh, base64 -d, rm"
    >
      <div class="pair inner">
        <div class="stack">
          <span class="cap">{{ t('gallery.display.commandA') }}</span>
          <UiCommandCopy command="sudo usermod -aG www-data ops" @copied="copied++" />
          <span class="cap">{{ t('gallery.display.commandB') }}</span>
          <UiCommandCopy command="ops ALL=(www-data) NOPASSWD: /usr/bin/cat /srv/booking/.env" />
          <span class="cap">{{ t('gallery.display.commandLong') }}</span>
          <UiCommandCopy :command="LONG" />
          <span class="mono cap">{{ t('gallery.display.commandCopied', { n: copied }) }}</span>
        </div>
        <div class="stack">
          <span class="cap">{{ t('gallery.display.commandPipe') }}</span>
          <UiCommandCopy command="curl -fsSL https://get.example.dev/install | sh" />
          <span class="cap">{{ t('gallery.display.commandDecode') }}</span>
          <UiCommandCopy command="echo aGVsbG8= | base64 -d" />
          <span class="cap">{{ t('gallery.display.commandRemove') }}</span>
          <UiCommandCopy command="rm -rf /var/www/old" />
          <span class="cap">{{ t('gallery.display.commandHidden') }}</span>
          <UiCommandCopy :command="HIDDEN" />
        </div>
      </div>
    </GalleryFrame>
  </div>
</template>

<style scoped>
.display {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.inner {
  gap: var(--space-6);
}

.wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.well {
  display: inline-flex;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.ct {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.muted {
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.states {
  display: grid;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--page-sheet);
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-3);
}

.cap {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.end {
  text-align: right;
}

.value {
  color: var(--ink);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.skeleton-stage {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-height: 88px;
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.landed {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.landed-label {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.landed-value {
  font-size: var(--text-20);
  letter-spacing: var(--track-20);
}

.landed-unit {
  color: var(--ink-3);
  font-size: var(--text-12);
}
</style>
