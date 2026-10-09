// A short soft two-note chime, synthesised with Web Audio: two sine notes, under 200 ms,
// quiet. Does nothing where there is no AudioContext or the context cannot start.
const NOTES: readonly { hz: number; at: number }[] = [
  { hz: 880, at: 0 },
  { hz: 1318.5, at: 0.07 },
]
const NOTE_S = 0.11
const GAIN = 0.08

type AudioCtor = new () => AudioContext

export function playChime(): void {
  try {
    const w = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const t0 = ctx.currentTime
    for (const { hz, at } of NOTES) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = hz
      gain.gain.setValueAtTime(0.0001, t0 + at)
      gain.gain.exponentialRampToValueAtTime(GAIN, t0 + at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + NOTE_S)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0 + at)
      osc.stop(t0 + at + NOTE_S + 0.02)
    }
    window.setTimeout(() => void ctx.close().catch(() => undefined), 400)
  } catch {
    // No sound is not an error.
  }
}
