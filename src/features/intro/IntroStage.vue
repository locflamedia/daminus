<script setup lang="ts">
// The intro: halftone dust that settles into Starry Night, on a 1344 x 760 stage scaled to
// cover its container. It plays its journey once and then holds the last frame until the
// parent removes it. The scene and journey are read once, when the stage mounts.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { createGrain } from './backdrop'
import { canvasMask, ensureFont, loadLogo } from './dom'
import { createIntroEngine } from './engine'
import type { IntroEngine } from './engine'
import { backStarLabels, duneLabels, firstStarLabels } from './labels'
import { coverPlacement } from './layout'
import { STAGE_H, STAGE_W, clampScene } from './scene'
import type { IntroJourney, IntroScene, StarIssue } from './scene'
import { loadStarry } from './starry'
import { buildLayout } from './stations'
import type { StationName } from './stations'

const props = defineProps<{
  journey: IntroJourney
  scene: IntroScene
  reducedMotion: boolean
  /** Freezes the picture at this second (a dev aid); nothing plays and `done` never fires. */
  freezeAt?: number
}>()
const emit = defineEmits<{
  /** The journey has ended; the last frame stays up. */
  done: []
  /** How far the journey is, 0..1. */
  progress: [fraction: number]
}>()

const { t } = useI18n()

const STILL_HOLD_MS = 1000

const root = ref<HTMLElement | null>(null)
const bgCanvas = ref<HTMLCanvasElement | null>(null)
const fgCanvas = ref<HTMLCanvasElement | null>(null)
const placement = ref(coverPlacement(STAGE_W, STAGE_H))
const shown = ref('')

const scene = computed(() => clampScene(props.scene))
const dunes = computed(() => duneLabels(scene.value))
const backStars = computed(() => backStarLabels(scene.value, issueText))
const firstStars = computed(() => firstStarLabels(scene.value))
const stageStyle = computed(() => ({
  width: `${STAGE_W}px`,
  height: `${STAGE_H}px`,
  transform: `translate(${placement.value.x}px, ${placement.value.y}px) scale(${placement.value.scale})`,
}))

function issueText(issue: StarIssue): string {
  if (issue.kind === 'disk') return t('intro.starDisk', { n: issue.pct })
  const key = issue.kind === 'crit' ? 'intro.starCrit' : 'intro.starWarn'
  return t(key, { n: issue.count }, issue.count)
}

const isOn = (key: StationName): boolean => shown.value.split(',').includes(key)

let engine: IntroEngine | null = null
let grainCanvas: HTMLCanvasElement | null = null
let frameHandle = 0
let stillTimer: ReturnType<typeof setTimeout> | undefined
let observer: ResizeObserver | null = null
let elapsed = 0
let lastNow: number | null = null
let finished = false
let disposed = false

function measure(): void {
  const el = root.value
  const w = el?.clientWidth || window.innerWidth
  const h = el?.clientHeight || window.innerHeight
  if (w > 0 && h > 0) placement.value = coverPlacement(w, h)
}

function show(seconds: number): void {
  if (engine === null) return
  engine.renderAt(seconds)
  shown.value = engine.overlaysAt(seconds).join(',')
}

function finish(): void {
  if (finished) return
  finished = true
  emit('done')
}

function tick(now: number): void {
  if (engine === null) return
  try {
    lastNow ??= now
    elapsed += (now - lastNow) / 1000
    lastNow = now
    const seconds = Math.min(elapsed, engine.duration)
    show(seconds)
    emit('progress', seconds / engine.duration)
    if (elapsed >= engine.duration) {
      finish()
      return
    }
    frameHandle = requestAnimationFrame(tick)
  } catch (e) {
    console.error(e)
    finish()
  }
}

function onVisibility(): void {
  if (engine === null || props.reducedMotion || props.freezeAt !== undefined || finished) return
  if (document.hidden) {
    cancelAnimationFrame(frameHandle)
    lastNow = null
  } else {
    cancelAnimationFrame(frameHandle)
    frameHandle = requestAnimationFrame(tick)
  }
}

async function start(): Promise<void> {
  const bg = bgCanvas.value?.getContext('2d')
  const fg = fgCanvas.value?.getContext('2d')
  if (!bg || !fg) {
    finish()
    return
  }
  let ready: IntroEngine
  try {
    const [data, logo] = await Promise.all([loadStarry(), loadLogo(), ensureFont()] as const)
    if (disposed) return
    ready = createIntroEngine({
      layout: buildLayout(data, scene.value, canvasMask),
      journey: props.journey,
      scene: scene.value,
      bg,
      fg,
      grain: createGrain((grainCanvas = document.createElement('canvas'))),
      logo,
    })
  } catch (e) {
    // Nothing to show is no reason to hold the app back.
    console.error(e)
    finish()
    return
  }
  engine = ready
  if (props.freezeAt !== undefined) {
    show(Math.min(Math.max(0, props.freezeAt), ready.duration))
  } else if (props.reducedMotion) {
    show(ready.duration)
    stillTimer = setTimeout(finish, STILL_HOLD_MS)
  } else {
    frameHandle = requestAnimationFrame(tick)
  }
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    observer = new ResizeObserver(measure)
    observer.observe(root.value)
  } else {
    window.addEventListener('resize', measure)
  }
  document.addEventListener('visibilitychange', onVisibility)
  void start()
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(frameHandle)
  clearTimeout(stillTimer)
  observer?.disconnect()
  window.removeEventListener('resize', measure)
  document.removeEventListener('visibilitychange', onVisibility)
  // Dropping the canvas size frees its pixel buffers at once rather than at the next collection.
  for (const canvas of [bgCanvas.value, fgCanvas.value, grainCanvas]) {
    if (canvas !== null) canvas.width = canvas.height = 0
  }
  grainCanvas = null
  engine = null
})
</script>

<template>
  <div ref="root" class="intro" :class="{ still: reducedMotion }" data-testid="intro-stage">
    <div class="stage" :style="stageStyle">
      <canvas ref="bgCanvas" class="layer" :width="STAGE_W" :height="STAGE_H" />
      <canvas ref="fgCanvas" class="layer" :width="STAGE_W * 2" :height="STAGE_H * 2" />

      <div class="ov mono storm" :class="{ on: isOn('storm') }">{{ t('intro.reading') }}</div>
      <div class="ov mark" :class="{ on: isOn('mark') }">Daminus</div>
      <div class="ov six" :class="{ on: isOn('six') }">
        <span class="six-title">{{ t('intro.sixTitle') }}</span>
        <span class="six-line">
          <b class="crit">{{ t('intro.crit', { n: scene.issues.crit }) }}</b> ·
          <b class="warn">{{ t('intro.warn', { n: scene.issues.warn }, scene.issues.warn) }}</b>
          · {{ t('intro.disk', { n: scene.issues.disk }) }}
        </span>
      </div>
      <div class="ov fill" :class="{ on: isOn('dunes') }">
        <span
          v-for="(d, i) in dunes"
          :key="i"
          class="lbl"
          :style="{ left: `${d.x}px`, top: `${d.y}px` }"
        >
          <i :style="{ background: d.dot }" />{{ d.name }}
          <span :style="{ color: d.valueColor }">{{
            d.pct === null ? t('intro.offline') : `${d.pct}%`
          }}</span>
        </span>
      </div>
      <div class="ov fill" :class="{ on: isOn('paintBack') }">
        <span
          v-for="(s, i) in backStars"
          :key="i"
          class="lbl"
          :style="{ left: `${s.x}px`, top: `${s.y}px` }"
        >
          <i :style="{ background: s.dot }" />{{ s.text }}
        </span>
        <div class="pill-row">
          <span class="pill">{{
            t('intro.pillBack', { n: props.scene.stars.length }, props.scene.stars.length)
          }}</span>
        </div>
      </div>
      <div class="ov fill" :class="{ on: isOn('paintFirst') }">
        <span
          v-for="(s, i) in firstStars"
          :key="i"
          class="lbl"
          :style="{ left: `${s.x}px`, top: `${s.y}px` }"
        >
          <i :style="{ background: s.dot }" />{{ s.text }}
        </span>
        <div class="pill-row">
          <span class="pill">
            <i class="found" />{{
              t('intro.pillFirst', { n: props.scene.hosts.length }, props.scene.hosts.length)
            }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #eef0fb;
  color: #1b1d2a;
  font-family:
    'Geist',
    -apple-system,
    BlinkMacSystemFont,
    system-ui,
    sans-serif;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
.stage {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  overflow: hidden;
  background: #eef0fb;
}
.layer {
  position: absolute;
  inset: 0;
  width: 1344px;
  height: 760px;
}
.mono {
  font-family: 'Geist Mono', ui-monospace, monospace;
}
.ov {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease;
}
.ov.on {
  opacity: 1;
}
.still .ov {
  transition: none;
}
.fill {
  inset: 0;
}
.storm {
  left: 0;
  right: 0;
  bottom: 28px;
  text-align: center;
  font-size: 12px;
  color: #3f4356;
}
.mark {
  left: 0;
  right: 0;
  top: 512px;
  text-align: center;
  font-size: 76px;
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1;
}
.six {
  left: 0;
  right: 0;
  top: 612px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}
.six-title {
  font-size: 17px;
  font-weight: 500;
}
.six-line {
  font-size: 13px;
  color: #3f4356;
}
.six-line b {
  font-weight: 500;
}
.six-line .crit {
  color: #b42f57;
}
.six-line .warn {
  color: #8f5207;
}
.lbl {
  position: absolute;
  font-family: 'Geist Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  color: #1b1d2a;
  background: rgba(255, 255, 255, 0.82);
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  transform: translate(-50%, 0);
}
.lbl i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: block;
}
.pill-row {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 26px;
  text-align: center;
}
.pill {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #1b1d2a;
}
.pill .found {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #1c8f55;
}
</style>
