<!--
  The file that will be written, beside the cards: plain JSON with line numbers, coloured as
  text. A line that changed since the last render lands with an accent wash that fades once;
  the lines that were there from the start do not play it. No secret can be in it, a part is
  a name and a path.
-->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { changedLines, jsonSegments } from '@/lib/group-view'
import { vEnter } from '@/lib/motion'
import UiIcon from '@/ui/UiIcon.vue'

const props = defineProps<{ lines: readonly string[] }>()
const { t } = useI18n()

// Keyed by number and text, a line that changes is a new element and plays its wash once.
const fresh = ref<Set<number>>(new Set())
watch(
  () => props.lines,
  (next, before) => {
    fresh.value = changedLines(before, next)
  },
)
</script>

<template>
  <aside v-enter="{ index: 2 }" class="preview" :aria-label="t('setupGroup.preview.label')">
    <header class="bar">
      <UiIcon name="file" :size="16" />
      <span class="mono file">{{ t('setupGroup.preview.file') }}</span>
      <span class="tag"><i aria-hidden="true" />{{ t('setupGroup.preview.tag') }}</span>
    </header>
    <div class="code" data-testid="preview-lines">
      <div
        v-for="(line, i) in lines"
        :key="`${i}:${line}`"
        class="ln"
        :class="{ fresh: fresh.has(i) }"
      >
        <span class="n">{{ i + 1 }}</span>
        <span class="t"
          ><span v-for="(seg, k) in jsonSegments(line)" :key="k" :class="seg.kind">{{
            seg.text
          }}</span></span
        >
      </div>
    </div>
    <footer class="foot">
      <span class="mono path">{{ t('setupGroup.preview.path') }}</span>
      <span>{{ t('setupGroup.preview.note') }}</span>
    </footer>
  </aside>
</template>

<style scoped>
.preview {
  position: sticky;
  top: var(--space-4);
  display: flex;
  flex-direction: column;
  align-self: start;
  min-height: 0;
  max-height: calc(100vh - 220px);
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--code);
  box-shadow: var(--shadow-card);
  color: var(--code-ink);
}

.bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 44px;
  padding: 0 var(--space-3) 0 var(--space-4);
  background: color-mix(in srgb, var(--code-ink) 6%, transparent);
  color: var(--code-key);
}

.file {
  color: var(--code-btn-ink);
  font-size: var(--text-12);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  color: var(--code-ok);
  font-size: var(--text-11);
}

.tag i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--code-ok);
}

.code {
  flex: 1 1 auto;
  padding: 10px 0;

  /* A long line scrolls sideways; it never wraps, so the line numbers stay aligned. */
  overflow: auto;
  font: var(--weight-regular) var(--text-11) / 1.7 var(--font-mono);
}

.ln {
  position: relative;
  display: grid;
  width: max-content;
  min-width: 100%;
  grid-template-columns: 22px max-content;
  gap: 10px;
  padding: 0 var(--space-3);
  border-radius: 4px;
}

.t {
  min-width: 0;
  white-space: pre;
}

.ln::before {
  position: absolute;
  inset: 0;
  border-radius: 4px;
  background: color-mix(in srgb, var(--code-key) 28%, transparent);
  content: '';
  opacity: 0;
  pointer-events: none;
}

.ln.fresh::before {
  animation: wash var(--dur-draw) var(--ease-out) both;
}

@keyframes wash {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

.n {
  color: var(--code-dim);
  text-align: right;
}

.key {
  color: var(--code-key);
}

.str {
  color: var(--code-str);
}

.num {
  color: var(--code-ok);
}

.punct {
  color: var(--code-dim);
}

.foot {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  background: color-mix(in srgb, var(--code-ink) 6%, transparent);
  color: var(--code-dim);
  font-size: var(--text-11);
  line-height: 1.45;
}

.path {
  color: var(--code-ink);
  overflow-wrap: anywhere;
}
</style>
