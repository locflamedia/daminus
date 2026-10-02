<!--
  Topology strip of a project card (board "Project card"): 40 px tall on a grey well, the URL
  first, then each component in request order, joined by dashed links. Up to four components
  show; the rest fold into "+N", the healthiest first, so a failing part is never hidden. A
  server name appears on a node only where the server changes, so a project split across two
  servers reads at a glance. Names come from the caller and are rendered as text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { layoutTopology, type NodeState, type TopologyInput } from '@/lib/topology'
import UiTopologyNode from './UiTopologyNode.vue'

const props = defineProps<{
  components: readonly TopologyInput[]
  /** The word on the first node, "URL". */
  urlLabel: string
  /** The words for each state, read out by screen readers. */
  states: Record<NodeState, string>
  /** "and N more", read out for the "+N" node. */
  moreLabel: (hidden: number) => string
  label: string
}>()

const view = computed(() => layoutTopology(props.components))
</script>

<template>
  <div class="topology" role="group" :aria-label="label">
    <UiTopologyNode :label="urlLabel" url />
    <template v-for="node in view.nodes" :key="node.id">
      <span class="link" aria-hidden="true" />
      <UiTopologyNode
        :label="node.label"
        :caption="node.showHost ? (node.host ?? undefined) : undefined"
        :state="node.state"
        :state-label="states[node.state]"
      />
    </template>
    <template v-if="view.hidden > 0">
      <span class="link" aria-hidden="true" />
      <UiTopologyNode :label="`+${view.hidden}`" :state-label="moreLabel(view.hidden)" />
    </template>
  </div>
</template>

<style scoped>
.topology {
  display: flex;
  align-items: center;
  height: var(--h-row);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

/* A dashed link: 4 px dashes, 1 px thick. */
.link {
  flex: 1;
  min-width: 10px;
  height: 1px;
  margin: 0 var(--space-1);
  background-image: linear-gradient(90deg, var(--ink-4) 50%, transparent 0);
  background-size: 4px 1px;
}
</style>
