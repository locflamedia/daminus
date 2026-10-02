<!--
  Topology strip of a project card (boards "Project card" and "Overview"): 40 px tall on a
  grey well, joined by dashed links. Two forms, picked with `mode`:

  - `components` (the Project card board): the URL first, then each component in request
    order with its own state dot. Up to four components show; the rest fold into "+N", the
    healthiest first, so a failing part is never hidden. A server name appears on a node only
    where the server changes;
  - `servers` (the Overview and Project card boards): one node per run of components on the
    same server, the roles in their own colours, no URL node. Nodes keep discovery order; more
    than two servers fold into "+N", whose tooltip names them.

  Below 1080 px ("Narrow window": topology diagrams become a list) the strip becomes a column
  of the same nodes, one per line, with no links; `list` forces either form. Names come from
  the caller and are rendered as text.
-->
<script setup lang="ts">
import { computed } from 'vue'
import {
  layoutServers,
  layoutTopology,
  type NodeState,
  type ServerGroup,
  type TopologyInput,
} from '@/lib/topology'
import { useLayoutRange } from '@/lib/viewport'
import UiTopologyNode from './UiTopologyNode.vue'

const props = withDefaults(
  defineProps<{
    components: readonly TopologyInput[]
    /** The word on the first node, "URL". */
    urlLabel: string
    /** The words for each state, read out by screen readers. */
    states: Record<NodeState, string>
    /** "and N more", read out for the "+N" node. */
    moreLabel: (hidden: number) => string
    label: string
    mode?: 'components' | 'servers'
    /** `undefined` follows the window: a list in the narrow range. */
    list?: boolean
  }>(),
  { mode: 'components', list: undefined },
)

const range = useLayoutRange()
const asList = computed(() => props.list ?? range.value === 'narrow')

const view = computed(() => layoutTopology(props.components))
// A list has room for every server, so it folds none.
const servers = computed(() =>
  asList.value ? layoutServers(props.components, Infinity) : layoutServers(props.components),
)
const hostsOf = (groups: readonly ServerGroup[]) =>
  groups.map((g) => g.host ?? g.roles.map((r) => r.label).join(' ')).join(', ')
</script>

<template>
  <div class="topology" :class="{ list: asList }" role="group" :aria-label="label">
    <template v-if="mode === 'servers'">
      <template v-for="(group, i) in servers.groups" :key="i">
        <span v-if="i > 0 && !asList" class="link" aria-hidden="true" />
        <UiTopologyNode
          :roles="group.roles"
          :caption="group.host ?? undefined"
          :state-label="states[group.state]"
        />
      </template>
      <template v-if="servers.hidden > 0">
        <span v-if="!asList" class="link" aria-hidden="true" />
        <UiTopologyNode
          :label="`+${servers.hidden}`"
          :state-label="moreLabel(servers.hidden)"
          :hint="hostsOf(servers.folded)"
        />
      </template>
    </template>
    <template v-else>
      <UiTopologyNode :label="urlLabel" url />
      <template v-for="node in view.nodes" :key="node.id">
        <span v-if="!asList" class="link" aria-hidden="true" />
        <UiTopologyNode
          :label="node.label"
          :caption="node.showHost ? (node.host ?? undefined) : undefined"
          :state="node.state"
          :state-label="states[node.state]"
        />
      </template>
      <template v-if="view.hidden > 0">
        <span v-if="!asList" class="link" aria-hidden="true" />
        <UiTopologyNode :label="`+${view.hidden}`" :state-label="moreLabel(view.hidden)" />
      </template>
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

/* The narrow form: the same nodes, one per line. */
.topology.list {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  height: auto;
  padding: var(--space-2);
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
