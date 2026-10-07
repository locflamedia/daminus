<!--
  Overlay primitives, laid out like the boards "Feedback" and "Micro UI": tooltip, popover,
  menu, toast, the blocking dialog, the sheet and the drawer. Dialog, sheet and drawer fill a
  framed stage (they fill their nearest positioned ancestor) and start closed, so only one
  trap holds focus at a time; the buttons open them.
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { UNDO_MS, useToastStore } from '@/stores/toasts'
import UiButton from '@/ui/UiButton.vue'
import UiChip from '@/ui/UiChip.vue'
import UiCommandCopy from '@/ui/UiCommandCopy.vue'
import UiDialog from '@/ui/UiDialog.vue'
import UiDrawer from '@/ui/UiDrawer.vue'
import UiIcon from '@/ui/UiIcon.vue'
import UiMenu, { type MenuItem } from '@/ui/UiMenu.vue'
import UiPopover from '@/ui/UiPopover.vue'
import UiRow from '@/ui/UiRow.vue'
import UiRowList from '@/ui/UiRowList.vue'
import UiSheet from '@/ui/UiSheet.vue'
import UiToast from '@/ui/UiToast.vue'
import UiTooltip from '@/ui/UiTooltip.vue'
import GalleryFrame from './GalleryFrame.vue'

const { t } = useI18n()
const toasts = useToastStore()

const popoverOpen = ref(false)
const menuOpen = ref(false)
const picked = ref('')
const dialogOpen = ref(false)
const sheetOpen = ref(false)
const glassOpen = ref(false)
const cardOpen = ref(false)
const undone = ref(0)

const menuItems = computed<MenuItem[]>(() => [
  { id: 'scan', label: t('gallery.overlays.menuScan'), icon: 'refresh', keys: ['⌘', 'R'] },
  { id: 'ssh', label: t('gallery.overlays.menuSsh'), icon: 'terminal', keys: ['⌘', 'T'] },
  { id: 'copy', label: t('gallery.overlays.menuCopy'), icon: 'copy', keys: ['⌘', 'C'] },
  { id: 'ask', label: t('gallery.overlays.menuAsk'), icon: 'spark' },
  { id: 'payload', label: t('gallery.overlays.menuPayload'), icon: 'eye' },
  { id: 'edit', label: t('gallery.overlays.menuEdit'), icon: 'edit', keys: ['⌘', 'E'] },
  { id: 'remove', label: t('gallery.overlays.menuRemove'), icon: 'trash', danger: true },
])

function pushToast() {
  toasts.push({
    tone: 'ok',
    title: t('gallery.overlays.toastDone'),
    detail: t('gallery.overlays.toastDoneDetail'),
    action: { label: t('gallery.overlays.toastShow'), run: () => {} },
  })
}

function pushUndo() {
  toasts.push({
    title: t('gallery.overlays.toastRemoved'),
    detail: t('gallery.overlays.toastRemovedDetail'),
    duration: UNDO_MS,
    action: { label: t('gallery.overlays.toastUndoLabel'), run: () => undone.value++ },
  })
}
</script>

<template>
  <div class="overlays">
    <div class="triple">
      <GalleryFrame
        :title="t('gallery.overlays.tooltip')"
        :text="t('gallery.overlays.tooltipLede')"
        spec="ink · 12 · r8 · 400 ms delay · in 150 ms · arrow 10 x 5"
      >
        <span class="cap">{{ t('gallery.overlays.tipHover') }}</span>
        <div class="wrap">
          <UiTooltip :text="t('gallery.overlays.tipScan')" :keys="['⌘', 'R']">
            <UiButton
              variant="secondary"
              icon="refresh"
              :aria-label="t('gallery.overlays.tipScan')"
            />
          </UiTooltip>
          <UiTooltip :text="t('gallery.overlays.tipScan')" :keys="['⌘', 'R']" side="bottom">
            <UiButton variant="soft" icon="search" :aria-label="t('gallery.overlays.tipScan')" />
          </UiTooltip>
          <UiTooltip :text="t('gallery.overlays.tipDocker')">
            <UiChip tone="neutral" icon="lock">{{ t('gallery.overlays.tipLocked') }}</UiChip>
          </UiTooltip>
        </div>
      </GalleryFrame>

      <GalleryFrame
        :title="t('gallery.overlays.popover')"
        :text="t('gallery.overlays.popoverLede')"
        spec="white · r12 · pad 12 · icon title · one action"
      >
        <div class="wrap">
          <UiPopover v-model:open="popoverOpen" :label="t('gallery.overlays.popoverLabel')">
            <template #trigger="{ attrs, toggle }">
              <UiButton v-bind="attrs" variant="soft" icon="lock" @click="toggle">{{
                t('gallery.overlays.popoverTrigger')
              }}</UiButton>
            </template>
            <span class="pop-title"
              ><UiIcon name="lock" :size="14" />{{ t('gallery.overlays.popoverTitle') }}</span
            >
            <span class="pop-text">{{ t('gallery.overlays.popoverText') }}</span>
            <UiCommandCopy command="sudo usermod -aG docker deploy" />
          </UiPopover>
        </div>
        <UiPopover inline open :label="t('gallery.overlays.popoverLabel')" width="100%">
          <span class="pop-title"
            ><UiIcon name="lock" :size="14" />{{ t('gallery.overlays.popoverTitle') }}</span
          >
          <span class="pop-text">{{ t('gallery.overlays.popoverText') }}</span>
        </UiPopover>
      </GalleryFrame>

      <GalleryFrame
        :title="t('gallery.overlays.menu')"
        :text="t('gallery.overlays.menuLede')"
        spec="r14 · pad 6 · rows 32 · icon 14 · danger last, 6 gap"
      >
        <div class="wrap">
          <UiMenu
            v-model:open="menuOpen"
            :items="menuItems"
            :label="t('gallery.overlays.menuLabel')"
            @select="(id: string) => (picked = id)"
          >
            <template #trigger="{ attrs, toggle }">
              <UiButton
                v-bind="attrs"
                variant="secondary"
                trailing-icon="chevron-down"
                @click="toggle"
                >{{ t('gallery.overlays.menuTrigger') }}</UiButton
              >
            </template>
          </UiMenu>
          <span v-if="picked" class="mono cap">{{
            t('gallery.overlays.menuPicked', { id: picked })
          }}</span>
        </div>
        <UiMenu inline :open="true" :items="menuItems" :label="t('gallery.overlays.menuLabel')" />
      </GalleryFrame>
    </div>

    <GalleryFrame
      :title="t('gallery.overlays.toast')"
      :text="t('gallery.overlays.toastLede')"
      spec="bottom right · 360 · r14 · 5 s · 2 px timer · in 12 px + fade 220 ms"
    >
      <div class="toast-well">
        <UiToast
          tone="ok"
          :title="t('gallery.overlays.toastDone')"
          :detail="t('gallery.overlays.toastDoneDetail')"
          :action="{ label: t('gallery.overlays.toastShow'), run: () => {} }"
          :duration="0"
        />
        <UiToast tone="neutral" :title="t('gallery.overlays.toastCopied')" :duration="0" />
        <UiToast
          tone="crit"
          :title="t('gallery.overlays.toastFailed')"
          :detail="t('gallery.overlays.toastFailedDetail')"
          :action="{ label: t('gallery.overlays.toastRetry'), run: () => {} }"
          :duration="0"
        />
      </div>
      <div class="wrap">
        <UiButton variant="soft" @click="pushToast">{{ t('gallery.overlays.toastPush') }}</UiButton>
        <UiButton variant="soft" @click="pushUndo">{{ t('gallery.overlays.toastUndo') }}</UiButton>
        <span v-if="undone" class="mono cap">undo × {{ undone }}</span>
      </div>
    </GalleryFrame>

    <div class="pair">
      <GalleryFrame
        :title="t('gallery.overlays.dialog')"
        :text="t('gallery.overlays.dialogLede')"
        spec="scrim 24 % · 480 · tray r20 · card r14 · pad 20"
      >
        <UiButton variant="secondary" @click="dialogOpen = true">{{
          t('gallery.overlays.dialogOpen')
        }}</UiButton>
        <div class="stage">
          <span class="cap">{{ dialogOpen ? '' : t('gallery.overlays.stageClosed') }}</span>
          <UiDialog
            :open="dialogOpen"
            alert
            tone="crit"
            icon="shield"
            :title="t('gallery.overlays.dialogTitle')"
            :description="t('gallery.overlays.dialogText')"
            @close="dialogOpen = false"
          >
            <div class="fingerprints">
              <span class="k">{{ t('gallery.overlays.dialogKnown') }}</span>
              <span class="mono">SHA256:9xQ2…vT8a</span>
              <span class="k">{{ t('gallery.overlays.dialogNow') }}</span>
              <span class="mono now">SHA256:Lk7p…c01Z</span>
              <span class="k">{{ t('gallery.overlays.dialogType') }}</span>
              <span class="mono">ED25519</span>
            </div>
            <span class="advice">{{ t('gallery.overlays.dialogAdvice') }}</span>
            <template #footer>
              <UiButton variant="ghost" @click="dialogOpen = false">{{
                t('gallery.overlays.dialogKeep')
              }}</UiButton>
              <UiButton variant="secondary">{{ t('gallery.overlays.dialogCopy') }}</UiButton>
              <UiButton variant="primary" @click="dialogOpen = false">{{
                t('gallery.overlays.dialogTrust')
              }}</UiButton>
            </template>
          </UiDialog>
        </div>
      </GalleryFrame>

      <GalleryFrame
        :title="t('gallery.overlays.sheet')"
        :text="t('gallery.overlays.sheetLede')"
        spec="760 centred · r20 · max 88 % · scrim 22 % + 3 px blur · header 56 · footer 64"
      >
        <UiButton variant="secondary" @click="sheetOpen = true">{{
          t('gallery.overlays.sheetOpen')
        }}</UiButton>
        <div class="stage">
          <span class="cap">{{ sheetOpen ? '' : t('gallery.overlays.stageClosed') }}</span>
          <span class="backdrop" aria-hidden="true"><i v-for="n in 4" :key="n" /></span>
          <UiSheet
            :open="sheetOpen"
            :title="t('gallery.overlays.sheetTitle')"
            :context="t('gallery.overlays.sheetContext')"
            @close="sheetOpen = false"
          >
            <UiRowList class="sheet-rows">
              <UiRow
                v-for="n in 4"
                :key="n"
                as="li"
                size="compact"
                :title="`${t('gallery.overlays.sheetRow')} ${n}`"
              />
            </UiRowList>
            <template #footer-start>
              <UiButton variant="danger">{{ t('gallery.overlays.sheetRemove') }}</UiButton>
            </template>
            <template #footer-end>
              <UiButton variant="ghost" @click="sheetOpen = false">{{
                t('gallery.overlays.sheetCancel')
              }}</UiButton>
              <UiButton variant="primary" @click="sheetOpen = false">{{
                t('gallery.overlays.sheetSave')
              }}</UiButton>
            </template>
          </UiSheet>
        </div>
      </GalleryFrame>
    </div>

    <GalleryFrame
      :title="t('gallery.overlays.drawer')"
      :text="t('gallery.overlays.drawerLede')"
      spec="glass 480 · blur 24 · card 440 · inset 12 · r18 · 24 px / 300 ms"
    >
      <div class="wrap">
        <UiButton variant="secondary" @click="glassOpen = !glassOpen">{{
          t('gallery.overlays.drawerGlass')
        }}</UiButton>
        <UiButton variant="secondary" @click="cardOpen = !cardOpen">{{
          t('gallery.overlays.drawerCard')
        }}</UiButton>
      </div>
      <div class="stage tall">
        <div class="page">
          <b class="pop-title">{{ t('gallery.overlays.page') }}</b>
          <UiRowList>
            <UiRow
              v-for="n in 5"
              :key="n"
              as="li"
              size="compact"
              tile="server"
              :title="`vps-${n}`"
              mono
            />
          </UiRowList>
        </div>
        <UiDrawer
          :open="glassOpen"
          variant="glass"
          :label="t('gallery.overlays.drawerGlassTitle')"
          @close="glassOpen = false"
        >
          <div class="drawer-body">
            <b class="pop-title">{{ t('gallery.overlays.drawerGlassTitle') }}</b>
            <span class="pop-text">{{ t('gallery.overlays.drawerGlassText') }}</span>
            <UiButton variant="soft" size="small" @click="glassOpen = false">{{
              t('gallery.overlays.drawerClose')
            }}</UiButton>
          </div>
        </UiDrawer>
        <UiDrawer
          :open="cardOpen"
          variant="card"
          :label="t('gallery.overlays.drawerCardTitle')"
          @close="cardOpen = false"
        >
          <div class="drawer-body">
            <b class="pop-title">{{ t('gallery.overlays.drawerCardTitle') }}</b>
            <span class="pop-text">{{ t('gallery.overlays.drawerCardText') }}</span>
            <UiButton variant="soft" size="small" @click="cardOpen = false">{{
              t('gallery.overlays.drawerClose')
            }}</UiButton>
          </div>
        </UiDrawer>
      </div>
    </GalleryFrame>
  </div>
</template>

<style scoped>
.overlays {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
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

.wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.cap {
  color: var(--ink-3);
  font-size: var(--text-11);
}

.pop-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-12);
  font-weight: var(--weight-medium);
}

.pop-text {
  color: var(--ink-2);
  font-size: var(--text-12);
  line-height: 1.45;
}

.toast-well {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--page-sheet);
}

.stage {
  position: relative;
  display: grid;
  place-items: center;
  height: 460px;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: var(--page-sheet);
}

.backdrop {
  position: absolute;
  inset: var(--space-4);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.backdrop i {
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.stage.tall {
  place-items: stretch;
}

.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
}

.drawer-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-5);
}

/* Tall enough that the card reaches its 88 % cap, as the board draws it. */
.sheet-rows {
  min-height: 360px;
}

.fingerprints {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 6px var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  font-size: var(--text-11);
  line-height: normal;
}

.advice {
  color: var(--ink-3);
  font-size: var(--text-12);
  line-height: 1.45;
}

.k {
  color: var(--ink-3);
}

.now {
  color: var(--crit-ink);
}
</style>
