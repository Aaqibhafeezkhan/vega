import type { IncomingMessage } from 'node:http'

/** Best-effort per-instance sliding window (serverless instances are short-lived, so this blunts bursts, not determined abuse). */
const hits = new Map<string, number[]>()

export function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for']
  return (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
}

export function limited(req: IncomingMessage, bucket: string, max: number, windowMs = 60_000, now = Date.now()): boolean {
  const key = `${bucket}|${clientIp(req)}`
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const k of hits.keys()) if (!hits.get(k)!.some((t) => now - t < windowMs)) hits.delete(k)
  return recent.length > max
}
