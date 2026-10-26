/**
 * Web only. The YouTube embed is an iframe, so the browser does not treat the page as "playing audio": on phones it
 * suspends the tab and the lock-screen controls vanish. A silent looping <audio> element held while a track plays
 * makes the page a real media session (notification controls, no suspension when the screen turns off).
 * It cannot outlive the browser: closing the tab or the browser ends playback, which only the Android app can fix.
 */

/** 1 s of 8 kHz mono silence as a WAV data URL. */
function silentWav(): string {
  const n = 8000
  const buf = new Uint8Array(44 + n).fill(128)
  const dv = new DataView(buf.buffer)
  const tag = (o: number, s: string): void => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)))
  tag(0, 'RIFF')
  dv.setUint32(4, 36 + n, true)
  tag(8, 'WAVEfmt ')
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true)
  dv.setUint16(22, 1, true)
  dv.setUint32(24, 8000, true)
  dv.setUint32(28, 8000, true)
  dv.setUint16(32, 1, true)
  dv.setUint16(34, 8, true)
  tag(36, 'data')
  dv.setUint32(40, n, true)
  let bin = ''
  buf.forEach((b) => (bin += String.fromCharCode(b)))
  return `data:audio/wav;base64,${btoa(bin)}`
}

let el: HTMLAudioElement | null = null

export function startKeepAlive(): void {
  if (!el) {
    el = new Audio(silentWav())
    el.loop = true
    el.volume = 0.01
  }
  void el.play().catch(() => undefined)
}

export function stopKeepAlive(): void {
  el?.pause()
}
