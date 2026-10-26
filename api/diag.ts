import type { IncomingMessage, ServerResponse } from 'node:http'

export default async function handler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const m = await import('./ytm/search')
    const out = await m.run(new URL('http://x/?q=tum+hi+ho&limit=1'))
    res.end(JSON.stringify({ status: out.status, body: out.body }).slice(0, 400))
  } catch (e) {
    res.statusCode = 500
    res.end(String((e as Error)?.stack ?? e))
  }
}
