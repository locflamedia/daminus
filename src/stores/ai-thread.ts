// The Ask thread, kept in memory for the session and nowhere else: one thread per scope (the
// whole report, a project, a server). A turn is a question and what came back: the summary text
// as it streamed, the findings in arrival order, and how it ended. The send itself lives in
// `use-ai-send`; this keeps what it produced, so a new send does not lose the earlier answers.
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { AiFinding, AppError, CheckKey } from '@/api'
import { type AskScope, scopeKey } from '@/features/ai/ask/ask-scope'

export type TurnStatus = 'waiting' | 'streaming' | 'done' | 'error' | 'cancelled'

/** A finding of the reply with the result Rust tied it to (from the payload that was sent). */
export interface AskedFinding extends AiFinding {
  /** `null` when the id names no result of that payload. */
  key: CheckKey | null
}

export interface AiTurn {
  id: string
  question: string
  scope: AskScope
  /** The scan the answer is about, when the report had one. */
  seq: number | null
  summary: string
  findings: AskedFinding[]
  status: TurnStatus
  error: AppError | null
  startedAt: number
  /** How long the answer took, set when it ends. */
  elapsedMs: number | null
}

let counter = 0

export const useAiThreadStore = defineStore('ai-thread', () => {
  const threads = reactive(new Map<string, AiTurn[]>())
  /** The turn the stream is writing into, until it ends. */
  const activeId = ref<string | null>(null)
  /** The Ask drawer: open or not, and what it is about. */
  const drawerOpen = ref(false)
  const drawerScope = ref<AskScope>({ kind: 'whole' })

  function turnsOf(scope: AskScope): AiTurn[] {
    return threads.get(scopeKey(scope)) ?? []
  }

  function latest(scope: AskScope): AiTurn | null {
    return turnsOf(scope).at(-1) ?? null
  }

  /** The newest answer that finished, of any scope: what the Findings page shows. */
  const lastAnswered = computed<AiTurn | null>(() => {
    let best: AiTurn | null = null
    for (const turns of threads.values()) {
      for (const turn of turns) {
        if (turn.status === 'done' && (!best || turn.startedAt >= best.startedAt)) best = turn
      }
    }
    return best
  })

  /** The newest turn of any scope, whatever state it is in. */
  const newest = computed<AiTurn | null>(() => {
    let best: AiTurn | null = null
    for (const turns of threads.values()) {
      for (const turn of turns) if (!best || turn.startedAt >= best.startedAt) best = turn
    }
    return best
  })

  function openDrawer(scope: AskScope) {
    drawerScope.value = scope
    drawerOpen.value = true
  }

  function closeDrawer() {
    drawerOpen.value = false
  }

  /** ⌘J: closes the drawer, or opens it on `scope`. */
  function toggleDrawer(scope: AskScope) {
    if (drawerOpen.value) closeDrawer()
    else openDrawer(scope)
  }

  function begin(scope: AskScope, question: string, seq: number | null, now = Date.now()): string {
    const key = scopeKey(scope)
    const turn: AiTurn = {
      id: `turn-${++counter}`,
      question,
      scope,
      seq,
      summary: '',
      findings: [],
      status: 'waiting',
      error: null,
      startedAt: now,
      elapsedMs: null,
    }
    threads.set(key, [...(threads.get(key) ?? []), turn])
    activeId.value = turn.id
    return turn.id
  }

  function find(id: string): AiTurn | undefined {
    for (const turns of threads.values()) {
      const turn = turns.find((t) => t.id === id)
      if (turn) return turn
    }
    return undefined
  }

  /** Writes what the stream holds into the turn; a turn that ended is not touched again. */
  function write(
    id: string,
    patch: Partial<Pick<AiTurn, 'summary' | 'findings' | 'status' | 'error'>>,
    now = Date.now(),
  ) {
    const turn = find(id)
    if (!turn || ['done', 'error', 'cancelled'].includes(turn.status)) return
    Object.assign(turn, patch)
    if (['done', 'error', 'cancelled'].includes(turn.status)) {
      turn.elapsedMs = Math.max(0, now - turn.startedAt)
      if (activeId.value === id) activeId.value = null
    }
  }

  /** Forgets one thread (the drawer's own clear); other scopes keep theirs. */
  function clear(scope: AskScope) {
    threads.delete(scopeKey(scope))
    if (activeId.value && !find(activeId.value)) activeId.value = null
  }

  return {
    activeId,
    drawerOpen,
    drawerScope,
    turnsOf,
    latest,
    lastAnswered,
    newest,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    begin,
    write,
    clear,
  }
})
