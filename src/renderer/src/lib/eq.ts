import { create } from 'zustand'
import { getAudio } from '@/store/player'
import { load, save } from './persist'

export const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const MAX_GAIN = 12

export const PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble boost': [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  Vocal: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
  Rock: [5, 4, 2, 0, -1, -1, 1, 3, 4, 5],
  Electronic: [5, 4, 1, 0, -2, 2, 1, 2, 4, 5],
  Acoustic: [4, 3, 2, 1, 2, 2, 3, 3, 3, 2],
  Lounge: [-3, -2, 0, 1, 2, 2, 1, 0, 1, 2],
  Loudness: [6, 4, 0, 0, -1, 0, -1, 0, 3, 4]
}

interface EqState {
  enabled: boolean
  gains: number[]
  preset: string
  setEnabled: (on: boolean) => void
  setGain: (i: number, db: number) => void
  setPreset: (name: string) => void
}

let ctx: AudioContext | null = null
let filters: BiquadFilterNode[] = []
let preamp: GainNode | null = null

/** Builds the Web Audio graph once (an element can only be attached one time). */
function ensureGraph(): boolean {
  if (ctx) return true
  try {
    const audio = getAudio()
    ctx = new AudioContext()
    const src = ctx.createMediaElementSource(audio)
    preamp = ctx.createGain()
    filters = BANDS.map((f, i) => {
      const b = ctx!.createBiquadFilter()
      b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking'
      b.frequency.value = f
      b.Q.value = 1.1
      return b
    })
    src.connect(preamp)
    let node: AudioNode = preamp
    for (const f of filters) {
      node.connect(f)
      node = f
    }
    node.connect(ctx.destination)
    return true
  } catch (err) {
    console.warn('equalizer unavailable', err)
    ctx = null
    return false
  }
}

function apply(s: Pick<EqState, 'enabled' | 'gains'>): void {
  if (!ctx || !preamp) return
  const t = ctx.currentTime
  // headroom: lower the whole signal by the largest boost so boosted bands do not clip
  const peak = Math.max(0, ...s.gains)
  preamp.gain.setTargetAtTime(s.enabled ? Math.pow(10, -peak / 20) : 1, t, 0.03)
  filters.forEach((f, i) => f.gain.setTargetAtTime(s.enabled ? (s.gains[i] ?? 0) : 0, t, 0.03))
}

const saved = load<{ enabled: boolean; gains: number[]; preset: string }>('eq', { enabled: false, gains: PRESETS.Flat!, preset: 'Flat' })

export const useEq = create<EqState>((set, get) => {
  const commit = (patch: Partial<EqState>): void => {
    set(patch)
    const { enabled, gains, preset } = get()
    save('eq', { enabled, gains, preset })
    if (enabled && ensureGraph()) {
      void ctx?.resume()
      apply({ enabled, gains })
    } else apply({ enabled: false, gains })
  }
  // restore after a restart: the graph is created on first use (autoplay rules need a user gesture to resume)
  return {
    enabled: saved.enabled,
    gains: saved.gains,
    preset: saved.preset,
    setEnabled: (enabled) => commit({ enabled }),
    setGain: (i, db) => {
      const gains = [...get().gains]
      gains[i] = Math.max(-MAX_GAIN, Math.min(MAX_GAIN, db))
      commit({ gains, preset: 'Custom' })
    },
    setPreset: (name) => PRESETS[name] && commit({ gains: [...PRESETS[name]!], preset: name, enabled: true })
  }
})

/** Called on the first user gesture after startup so a saved "EQ on" setting takes effect. */
export function resumeEq(): void {
  const { enabled, gains } = useEq.getState()
  if (enabled && ensureGraph()) {
    void ctx?.resume()
    apply({ enabled, gains })
  }
}
