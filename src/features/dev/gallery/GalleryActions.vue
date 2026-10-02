<!-- Buttons, laid out like the board "Actions": anatomy, sizes, and the variant x state matrix. -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import UiButton, { type ButtonVariant } from '@/ui/UiButton.vue'
import GalleryFrame from './GalleryFrame.vue'

const { t } = useI18n()

const VARIANTS: Array<{ id: Exclude<ButtonVariant, 'link'>; label: string }> = [
  { id: 'primary', label: 'scanAll' },
  { id: 'secondary', label: 'openSsh' },
  { id: 'soft', label: 'manageHosts' },
  { id: 'ghost', label: 'markKnown' },
  { id: 'danger', label: 'remove' },
]
const STATES = ['default', 'hover', 'pressed', 'focus', 'disabled', 'busy'] as const

const rows = computed(() =>
  VARIANTS.map((v, index) => ({
    ...v,
    name: t(`gallery.actions.${v.id}.name`),
    use: t(`gallery.actions.${v.id}.use`),
    text: t(`gallery.sample.${v.label}`),
    stripe: index % 2 === 0,
  })),
)

const anatomy = [
  ['1', 'Container', 'height 32 · radius 10 · padding-x 12 · gap 8'],
  ['2', 'Leading glyph, optional', '↳ for actions that start work, or a 14 px icon'],
  ['3', 'Label', 'body-13 · 500 · one line, never wraps'],
  ['4', 'Shortcut, optional', 'kbd 18 · shown on the primary only'],
] as const
</script>

<template>
  <div class="actions">
    <div class="pair">
      <GalleryFrame :title="t('gallery.actions.anatomy')">
        <div class="stage">
          <div class="zoom">
            <UiButton variant="primary" icon="start" shortcut="⌘R">
              {{ t('gallery.sample.scanAll') }}
            </UiButton>
          </div>
        </div>
        <dl class="spec-list">
          <template v-for="[n, name, value] in anatomy" :key="n">
            <dt class="pin">{{ n }}</dt>
            <dd class="name">{{ name }}</dd>
            <dd class="value mono">{{ value }}</dd>
          </template>
        </dl>
      </GalleryFrame>

      <GalleryFrame :title="t('gallery.actions.sizes')">
        <div class="sizes">
          <div class="size">
            <UiButton variant="primary">{{ t('gallery.sample.scanProject') }}</UiButton>
            <span class="mono tag">Default · 32 · r10 · 13 px</span>
            <span class="note">{{ t('gallery.actions.defaultUse') }}</span>
          </div>
          <div class="size">
            <UiButton variant="primary" size="small">{{ t('gallery.sample.fix') }}</UiButton>
            <span class="mono tag">Small · 28 · r8 · 12 px</span>
            <span class="note">{{ t('gallery.actions.smallUse') }}</span>
          </div>
          <div class="size">
            <div class="row">
              <UiButton
                icon="copy"
                size="small"
                variant="secondary"
                :aria-label="t('gallery.sample.copy')"
              />
              <UiButton icon="send" variant="primary" :aria-label="t('gallery.sample.send')" />
            </div>
            <span class="mono tag">Icon · 28 or 32 square</span>
            <span class="note">{{ t('gallery.actions.iconUse') }}</span>
          </div>
          <div class="size">
            <UiButton variant="link" trailing-icon="chevron-right">
              {{ t('gallery.sample.open') }}
            </UiButton>
            <span class="mono tag">Inline link · 24 · r6</span>
            <span class="note">{{ t('gallery.actions.linkUse') }}</span>
          </div>
        </div>
      </GalleryFrame>
    </div>

    <section class="matrix-section">
      <h2 class="title">{{ t('gallery.actions.variants') }}</h2>
      <p class="lede">{{ t('gallery.actions.variantsLede') }}</p>
      <div class="matrix">
        <div class="line head">
          <span>Variant</span>
          <span v-for="state in STATES" :key="state">{{ t(`gallery.columns.${state}`) }}</span>
        </div>
        <div v-for="row in rows" :key="row.id" class="line" :class="{ stripe: row.stripe }">
          <div class="variant">
            <b>{{ row.name }}</b>
            <span>{{ row.use }}</span>
          </div>
          <span>
            <UiButton :variant="row.id">{{ row.text }}</UiButton>
          </span>
          <span>
            <UiButton :variant="row.id" data-force="hover">{{ row.text }}</UiButton>
          </span>
          <span>
            <UiButton :variant="row.id" data-force="pressed">{{ row.text }}</UiButton>
          </span>
          <span>
            <UiButton :variant="row.id" data-force="focus">{{ row.text }}</UiButton>
          </span>
          <span>
            <UiButton :variant="row.id" disabled>{{ row.text }}</UiButton>
          </span>
          <span>
            <UiButton :variant="row.id" busy>{{ row.text }}</UiButton>
          </span>
        </div>
        <div class="line">
          <div class="variant">
            <b>{{ t('gallery.actions.explained') }}</b>
            <span>{{ t('gallery.actions.explainedUse') }}</span>
          </div>
          <span>
            <UiButton
              variant="primary"
              disabled
              :disabled-reason="t('gallery.actions.reason')"
              icon="start"
            >
              {{ t('gallery.sample.scanAll') }}
            </UiButton>
          </span>
          <span>
            <UiButton variant="primary" lifted shortcut="⌘R">
              {{ t('gallery.sample.scanAll') }}
            </UiButton>
          </span>
        </div>
      </div>
    </section>

    <div class="rules">
      <div class="rule">
        <b class="do">{{ t('gallery.actions.do') }}</b>
        <span>{{ t('gallery.actions.doText') }}</span>
      </div>
      <div class="rule">
        <b class="dont">{{ t('gallery.actions.dont') }}</b>
        <span>{{ t('gallery.actions.dontBlue') }}</span>
      </div>
      <div class="rule">
        <b class="dont">{{ t('gallery.actions.dont') }}</b>
        <span>{{ t('gallery.actions.dontInline') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.stage {
  display: flex;
  justify-content: center;
  padding: var(--space-10) 0 var(--space-8);
  border-radius: var(--radius-sm);
  background-color: var(--surface-1);
  background-image: radial-gradient(var(--surface-3) 1px, transparent 1px);
  background-size: 8px 8px;
}

/* The anatomy button is drawn at twice its size, as on the board. */
.zoom {
  transform: scale(2);
  transform-origin: center;
  margin: var(--space-4) 0;
}

.spec-list {
  display: grid;
  grid-template-columns: 18px max-content 1fr;
  gap: var(--space-2) var(--space-3);
  align-items: center;
  margin: 0;
  font-size: var(--text-12);
}

.spec-list dd {
  margin: 0;
}

.pin {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--crit-ink);
  color: var(--surface-0);
  font-size: 10px;
  font-weight: var(--weight-semibold);
}

.value,
.tag {
  color: var(--ink-2);
  font-size: var(--text-11);
}

.sizes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.size {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.row {
  display: flex;
  gap: var(--space-2);
}

.note {
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.matrix-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.title {
  font-size: var(--text-15);
  font-weight: var(--weight-medium);
  letter-spacing: var(--track-15);
}

.lede {
  max-width: 80ch;
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.matrix {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: var(--radius-lg);
  background: var(--surface-0);
  overflow-x: auto;
}

.line {
  display: grid;
  grid-template-columns: 200px repeat(6, minmax(110px, 1fr));
  gap: var(--space-3);
  align-items: center;
  min-height: 72px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}

.line.stripe {
  background: var(--surface-1);
}

.line.head {
  min-height: 32px;
  padding-block: 0;
  color: var(--ink-3);
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.variant {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.variant b {
  font-size: var(--text-13);
  font-weight: var(--weight-medium);
}

.variant span {
  color: var(--ink-3);
  font-size: var(--text-11);
  line-height: 1.4;
}

.rules {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.rule {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-0);
  font-size: var(--text-13);
  line-height: 1.45;
}

.rule b {
  font-size: var(--text-11);
  font-weight: var(--weight-medium);
}

.do {
  color: var(--ok-ink);
}

.dont {
  color: var(--crit-ink);
}
</style>
