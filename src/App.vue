<!--
  TEMPORARY tracer page (phase 3b): proves core → Tauri → webview end to end.
  Not the designed UI; phase 6 deletes it and builds the layout from the canvas.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import type { HostProgress, Item } from '@/api'
import { revealConfigDir } from '@/api'
import { useScanStore } from '@/stores/scan'

const scan = useScanStore()

onMounted(() => void scan.init())
onUnmounted(() => scan.dispose())

const hosts = computed(() =>
  Object.entries(scan.run?.hosts ?? {}).flatMap(([h, p]) => (p ? [[h, p] as const] : [])),
)

function hostLine(p: HostProgress): string {
  const outcome = p.state === 'finished' ? ` ${p.outcome.state}` : ''
  const step = p.step ? ` · ${p.step}` : ''
  return `${p.state}${outcome}${step} · ${p.facts} facts${p.dropped ? ` · ${p.dropped} dropped` : ''}`
}

function severity(i: Item): string {
  return i.severity.level === 'unknown' ? `unknown (${i.severity.reason})` : i.severity.level
}

function value(i: Item): string {
  const v = i.fact?.value
  return v === undefined || v === null ? '' : ` ${v}${i.fact?.unit ?? ''}`
}
</script>

<template>
  <main class="tracer">
    <p>
      <button type="button" :disabled="scan.scanning" @click="scan.start()">Scan</button>
      <button type="button" :disabled="!scan.scanning" @click="scan.stop()">Stop</button>
      <button type="button" @click="revealConfigDir()">Config folder</button>
    </p>
    <p v-if="scan.error">error: {{ JSON.stringify(scan.error) }}</p>
    <p v-if="scan.lastEnd">last scan: {{ scan.lastEnd }}</p>

    <section v-if="scan.run">
      <h2>Scan {{ scan.run.scan_id }}</h2>
      <ul>
        <li v-for="[host, p] in hosts" :key="host">{{ host }}: {{ hostLine(p) }}</li>
      </ul>
    </section>

    <section v-if="scan.report">
      <h2>
        Report
        {{ scan.report.seq === undefined ? '(no scans yet)' : `#${scan.report.seq}` }}
        · {{ scan.report.counts.crit }} crit · {{ scan.report.counts.warn }} warn
      </h2>
      <ul>
        <li v-for="i in scan.report.items" :key="`${i.key.host}|${i.key.check}|${i.key.target}`">
          {{ severity(i) }} · {{ i.key.host }} · {{ i.key.check }} {{ i.key.target
          }}{{ value(i) }} · {{ i.disposition.kind }}
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.tracer {
  padding: 16px;
  font:
    13px/1.5 -apple-system,
    system-ui,
    sans-serif;
}
</style>
