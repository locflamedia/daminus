<!--
  The atoms of the board "Micro UI", in the grid the board uses (name, a grey stage, the
  spec), and the motion rows of the boards "Motion" and "Motion in the app" that the atoms and
  composed components own: value roll, chip morph, card lift, row actions, AI thinking,
  per-host progress and the critical halo.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { wordDelay } from '@/lib/motion'
import { deltaPill } from '@/lib/micro'
import UiButton from '@/ui/UiButton.vue'
import UiCard from '@/ui/UiCard.vue'
import UiChipMorph from '@/ui/UiChipMorph.vue'
import UiCountBadge from '@/ui/UiCountBadge.vue'
import UiDeltaPill from '@/ui/UiDeltaPill.vue'
import UiDomainLink from '@/ui/UiDomainLink.vue'
import UiEmptyValue from '@/ui/UiEmptyValue.vue'
import UiHostChip from '@/ui/UiHostChip.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiInlineCode from '@/ui/UiInlineCode.vue'
import UiKbd from '@/ui/UiKbd.vue'
import UiMonogram from '@/ui/UiMonogram.vue'
import UiPathChip from '@/ui/UiPathChip.vue'
import UiProgressBar from '@/ui/UiProgressBar.vue'
import UiProgressRing from '@/ui/UiProgressRing.vue'
import UiRoll from '@/ui/UiRoll.vue'
import UiRow from '@/ui/UiRow.vue'
import UiSectionHeader from '@/ui/UiSectionHeader.vue'
import UiSeverityTile from '@/ui/UiSeverityTile.vue'
import UiStatusDot from '@/ui/UiStatusDot.vue'
import UiTag from '@/ui/UiTag.vue'
import UiTimestamp from '@/ui/UiTimestamp.vue'
import GalleryAtom from './GalleryAtom.vue'
import GalleryFrame from './GalleryFrame.vue'

const { t } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) => t(`gallery.micro.${key}`, params)

const HOUR = 3_600_000
const recent = Date.now() - 2 * HOUR
const old = Date.now() - 3 * 24 * HOUR

// --- motion samples ---------------------------------------------------------------------------

const rolled = ref(false)
const rollValue = computed(() => (rolled.value ? '8.43' : '7.36'))

const morphed = ref(false)

const thinking = ref<'idle' | 'wait' | 'answer'>('idle')
const words = computed(() => k('motion.thinking.answer').split(' '))
let thinkTimer: number | undefined
function playThinking() {
  window.clearTimeout(thinkTimer)
  thinking.value = 'wait'
  thinkTimer = window.setTimeout(() => (thinking.value = 'answer'), 1400)
}

const progress = ref(0.25)
const progressSteps = [0.25, 0.58, 0.86, 1]
function nextStep() {
  const next = progressSteps.find((s) => s > progress.value)
  progress.value = next ?? 1
}

const haloKey = ref(0)
</script>

<template>
  <div class="micro">
    <GalleryFrame :title="k('title')" :text="k('lede')">
      <div class="grid">
        <GalleryAtom :name="k('hostChip.name')" :spec="k('hostChip.spec')">
          <UiHostChip host="vps-sg-1" />
          <UiHostChip host="vps-hn-3" :reachable="false" :unreachable-label="k('hostChip.down')" />
        </GalleryAtom>

        <GalleryAtom :name="k('pathChip.name')" :spec="k('pathChip.spec')">
          <UiPathChip path="/var/www/kho-hang/storage/logs" />
        </GalleryAtom>

        <GalleryAtom :name="k('domainLink.name')" :spec="k('domainLink.spec')">
          <UiDomainLink domain="kho-hang.vn" :ssl-days="41" />
          <UiDomainLink domain="tiemtra.vn" :ssl-days="9" />
          <UiDomainLink domain="noibo.vn" :ssl-days="2" />
        </GalleryAtom>

        <GalleryAtom :name="k('deltaPill.name')" :spec="k('deltaPill.spec')">
          <UiDeltaPill v-bind="deltaPill(1.1)">1.1 GB</UiDeltaPill>
          <UiDeltaPill v-bind="deltaPill(-0.6)">0.6 s</UiDeltaPill>
          <UiDeltaPill v-bind="deltaPill(0)">0</UiDeltaPill>
        </GalleryAtom>

        <GalleryAtom :name="k('timestamp.name')" :spec="k('timestamp.spec')">
          <UiTimestamp :at="recent" :seq="42" />
          <UiTimestamp :at="old" :seq="38" />
        </GalleryAtom>

        <GalleryAtom :name="k('statusDot.name')" :spec="k('statusDot.spec')">
          <UiStatusDot state="crit" halo :label="k('statusDot.crit')" />
          <UiStatusDot state="warn" halo :label="k('statusDot.warn')" />
          <UiStatusDot state="ok" :label="k('statusDot.ok')" />
          <UiStatusDot state="unknown" :label="k('statusDot.unknown')" />
          <UiStatusDot state="reading" :label="k('statusDot.reading')" />
        </GalleryAtom>

        <GalleryAtom :name="k('countBadge.name')" :spec="k('countBadge.spec')">
          <UiCountBadge :count="1" tone="crit" :label="k('countBadge.label', { n: 1 })" />
          <UiCountBadge :count="2" tone="warn" />
          <UiCountBadge :count="42" />
          <UiCountBadge :count="150" />
          <UiCountBadge :count="0" />
        </GalleryAtom>

        <GalleryAtom :name="k('keyboardHint.name')" :spec="k('keyboardHint.spec')">
          <span class="keys"><UiKbd>⌘</UiKbd><UiKbd>K</UiKbd></span>
          <span class="keys"><UiKbd>⇧</UiKbd><UiKbd>⏎</UiKbd></span>
          <UiKbd>Esc</UiKbd>
        </GalleryAtom>

        <GalleryAtom :name="k('monogram.name')" :spec="k('monogram.spec')">
          <UiMonogram name="kho-hang" tint="amber" :size="18" />
          <UiMonogram name="api-booking" tint="blue" :size="24" />
          <UiMonogram icon="file" tint="lilac" :size="36" />
          <UiMonogram icon="cart" tint="rose" :size="36" />
          <UiMonogram name="noibo-crm" tint="grey" :size="24" />
        </GalleryAtom>

        <GalleryAtom :name="k('techTag.name')" :spec="k('techTag.spec')">
          <UiTag swatch="#f05340" plain>Laravel 11</UiTag>
          <UiTag swatch="#336791" plain>Postgres 16</UiTag>
          <UiTag plain>{{ k('techTag.more') }}</UiTag>
        </GalleryAtom>

        <GalleryAtom :name="k('severityTile.name')" :spec="k('severityTile.spec')">
          <UiSeverityTile kind="crit" />
          <UiSeverityTile kind="warn" />
          <UiSeverityTile kind="ok" />
          <UiSeverityTile kind="locked" />
        </GalleryAtom>

        <GalleryAtom :name="k('progressRing.name')" :spec="k('progressRing.spec')">
          <UiProgressRing :value="0.62" :label="k('progressRing.host')" />
          <span class="strong">62%</span>
          <span class="muted">{{ k('progressRing.host') }}</span>
        </GalleryAtom>

        <GalleryAtom :name="k('inlineCode.name')" :spec="k('inlineCode.spec')">
          <span class="sentence"
            >{{ k('inlineCode.before') }}
            <UiInlineCode text="ssh-add ~/.ssh/id_ed25519" />
            {{ k('inlineCode.after') }}</span
          >
        </GalleryAtom>

        <GalleryAtom :name="k('emptyValue.name')" :spec="k('emptyValue.spec')">
          <UiEmptyValue reason="permission" :hint="k('emptyValue.permission')" />
          <UiEmptyValue reason="not-set-up" :hint="k('emptyValue.notSetUp')" />
        </GalleryAtom>

        <GalleryAtom :name="k('sectionHeader.name')" :spec="k('sectionHeader.spec')">
          <div class="wide">
            <UiSectionHeader
              icon="database"
              :title="k('sectionHeader.title')"
              sub="kho_prod"
              overflow
            />
          </div>
        </GalleryAtom>
      </div>
    </GalleryFrame>

    <GalleryFrame :title="k('motion.title')" :text="k('motion.lede')">
      <div class="grid">
        <GalleryAtom :name="k('motion.roll.name')" :spec="k('motion.roll.spec')">
          <span class="roll"><UiRoll :text="rollValue" /><span class="muted"> GB</span></span>
          <UiDeltaPill v-bind="deltaPill(rolled ? 1.07 : 0)">{{
            rolled ? '1.07' : '0'
          }}</UiDeltaPill>
          <UiButton size="small" @click="rolled = !rolled">{{ k('motion.roll.change') }}</UiButton>
        </GalleryAtom>

        <GalleryAtom :name="k('motion.morph.name')" :spec="k('motion.morph.spec')">
          <UiChipMorph
            :tone="morphed ? 'warn' : 'info'"
            :busy="!morphed"
            :icon="morphed ? 'warn' : undefined"
            :label="morphed ? k('motion.morph.needsLook') : k('motion.morph.scanning')"
          />
          <UiButton size="small" @click="morphed = !morphed">{{
            k('motion.morph.change')
          }}</UiButton>
        </GalleryAtom>

        <GalleryAtom :name="k('motion.lift.name')" :spec="k('motion.lift.spec')">
          <UiCard lift class="lift-card">
            <span class="lift-row">
              <UiMonogram name="kho-hang" tint="amber" :size="24" />
              <span class="lift-text"
                ><b>kho-hang</b><span class="muted">{{ k('motion.lift.issues') }}</span></span
              >
              <UiIcon name="chevron-right" :size="14" class="m-nudge nudge" />
            </span>
          </UiCard>
        </GalleryAtom>

        <GalleryAtom :name="k('motion.actions.name')" :spec="k('motion.actions.spec')">
          <div class="wide">
            <UiRow size="compact" raised>
              <template #leading><UiIcon name="folder" :size="14" /></template>
              <span class="mono">storage/logs</span>
              <template #actions>
                <UiButton
                  variant="ghost"
                  size="small"
                  icon="copy"
                  :aria-label="k('motion.actions.copy')"
                />
                <UiButton
                  variant="ghost"
                  size="small"
                  icon="external"
                  :aria-label="k('motion.actions.open')"
                />
              </template>
            </UiRow>
          </div>
        </GalleryAtom>

        <GalleryAtom :name="k('motion.thinking.name')" :spec="k('motion.thinking.spec')">
          <div class="think">
            <span v-if="thinking === 'wait'" class="m-think bar" role="status" aria-busy="true" />
            <span v-else-if="thinking === 'answer'" class="answer">
              <template v-for="(word, i) in words" :key="i">
                <span class="m-word" :style="{ '--d': wordDelay(i) }">{{ word }}</span
                >{{ ' ' }}
              </template>
            </span>
            <UiButton size="small" @click="playThinking">{{ k('motion.thinking.play') }}</UiButton>
          </div>
        </GalleryAtom>

        <GalleryAtom :name="k('motion.progress.name')" :spec="k('motion.progress.spec')">
          <div class="progress">
            <span class="progress-row">
              <UiProgressRing :value="progress" :label="k('progressRing.host')" />
              <span class="mono">vps-sg-1</span>
            </span>
            <UiProgressBar :value="progress" size="md" :label="k('progressRing.host')" />
            <span class="progress-actions">
              <UiButton size="small" @click="nextStep">{{ k('motion.progress.step') }}</UiButton>
              <UiButton size="small" variant="ghost" @click="progress = 0.25">{{
                k('motion.progress.reset')
              }}</UiButton>
            </span>
          </div>
        </GalleryAtom>

        <GalleryAtom :name="k('motion.halo.name')" :spec="k('motion.halo.spec')">
          <UiStatusDot :key="haloKey" state="crit" halo pulse :label="k('statusDot.crit')" />
          <UiButton size="small" @click="haloKey += 1">{{ k('motion.halo.replay') }}</UiButton>
        </GalleryAtom>
      </div>
    </GalleryFrame>
  </div>
</template>

<style scoped>
.micro {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-3);
}

.keys {
  display: inline-flex;
  gap: 3px;
}

.strong {
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.muted {
  color: var(--ink-3);
  font-size: var(--text-12);
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-12);
}

.sentence {
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.8;
}

.wide {
  flex: 1 1 100%;
}

.roll {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 26px;
  letter-spacing: -0.02em;
  line-height: 30px;
}

.lift-card {
  --card-pad: 12px;

  width: 210px;
}

.lift-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lift-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.lift-text b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.nudge {
  margin-left: auto;
  color: var(--ink-4);
}

.think {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
  width: 100%;
  min-height: 72px;
}

.bar {
  width: 190px;
  max-width: 100%;
}

.answer {
  font-size: var(--text-12);
  line-height: 1.5;
}

.progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.progress-row,
.progress-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
