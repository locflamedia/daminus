// A 2D context that records what is drawn instead of drawing it, for the intro's tests.
export interface Recorder {
  ctx: CanvasRenderingContext2D
  log: string[]
}

export function recordingContext(): Recorder {
  const log: string[] = []
  const target: Record<string, unknown> = {}
  const ctx = new Proxy(target, {
    get(_, name: string) {
      if (name in target) return target[name]
      return (...args: unknown[]) => {
        log.push(
          `${name}(${args.map((a) => (typeof a === 'object' ? '[obj]' : String(a))).join(',')})`,
        )
        if (name === 'createRadialGradient') {
          return { addColorStop: (o: number, c: string) => log.push(`stop(${o},${c})`) }
        }
        if (name === 'createPattern') return {}
        return undefined
      }
    },
    set(_, name: string, value: unknown) {
      target[name] = value
      log.push(`${name}=${typeof value === 'object' ? '[obj]' : String(value)}`)
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, log }
}
