export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Deterministic two-stop gradient used as placeholder artwork. */
export function coverGradient(key: string): string {
  const h = hash(key)
  const a = h % 360
  const b = (a + 40 + ((h >> 8) % 80)) % 360
  const angle = (h >> 16) % 360
  return `linear-gradient(${angle}deg, hsl(${a} 70% 52%), hsl(${b} 75% 38%))`
}
