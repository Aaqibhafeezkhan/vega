/**
 * The first sound an Electron app plays on Windows pays about four seconds for the audio device to start. Playing a
 * fraction of a second of silence at startup moves that cost out of the way, so the first real song starts as fast
 * as every later one. Desktop only; harmless if the browser blocks it.
 */
function silentWav(ms: number): string {
  const rate = 8000
  const n = Math.round((rate * ms) / 1000)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string): void => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  w(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  w(36, 'data')
  v.setUint32(40, n * 2, true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

export function warmAudioOutput(): void {
  if (!window.vega) return
  const url = silentWav(400)
  const a = new Audio(url)
  a.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
  void a.play().catch(() => URL.revokeObjectURL(url))
}
