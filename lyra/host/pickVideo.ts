import { cleanTitle, normalize, similarity } from '../core/lyrics/match'

export interface VideoHit {
  videoId: string
  title: string
  channel: string
  durationSec: number
}

export interface WantedSong {
  title: string
  artists: string[]
  durationMs: number
}

/** Things that are not the song's own video: fan edits, lyric/status clips, remixes, live takes, compilations. */
const JUNK = /\b(lyrics?|lyrical|status|whatsapp|insta(?:gram)?|tiktok|reels?|shorts?|amv|mashup|remix|cover|karaoke|reaction|slowed|reverb|sped\s*up|8d|nightcore|instrumental|tutorial|live|concert|unplugged|acoustic|full\s*album|jukebox|playlist|compilation|scenes?|trailer|teaser|making|behind|dance|choreography|edit|fan\s*made|aesthetic|vibes?)\b/i
const GOOD = /\b(official|music video|video song|full video|vevo)\b/i

/**
 * Chooses the video to show behind a song. Works for catalogue titles like `Sitaare (From "Ikkis")` where the channel is
 * just the artist (unlike Lyra's original ranking, which needs words like "official" and rejected nearly everything).
 * Returns null when nothing convincing is found; the caller then keeps its normal background.
 */
export function pickVideo(want: WantedSong, found: VideoHit[]): VideoHit | null {
  const wantTitle = normalize(cleanTitle(want.title).replace(/\s*[([].*$/, ''))
  const wantSec = want.durationMs / 1000
  const artists = want.artists.map((a) => normalize(a)).filter(Boolean)
  const wantJunk = JUNK.test(want.title) // a song genuinely named "... (Live)" may match live videos

  let best: { v: VideoHit; score: number } | null = null
  for (const v of found) {
    if (!wantJunk && JUNK.test(v.title)) continue
    const title = normalize(cleanTitle(v.title).replace(/\s*[([].*$/, '').replace(/\s*\|.*$/, ''))
    const titleSim = similarity(wantTitle, title)
    if (titleSim < 0.6) continue
    const hay = normalize(`${v.title} ${v.channel}`)
    const artistHit = artists.some((a) => hay.includes(a) || a.split(' ').some((w) => w.length > 3 && hay.includes(w)))
    const diff = wantSec > 0 && v.durationSec > 0 ? Math.abs(v.durationSec - wantSec) : 0
    if (diff > 75) continue // a different cut or an extended mix
    // an artist's own channel (or a topic/VEVO channel named after them) is the strongest sign of the real video
    const ownChannel = artists.some((a) => normalize(v.channel).split(' ').join('') .includes(a.split(' ').join('')))
    let score = titleSim * 0.5 + (artistHit ? 0.3 : 0) + (diff <= 20 ? 0.15 : diff <= 60 ? 0.1 : 0.05) + (GOOD.test(v.title) ? 0.1 : 0) + (ownChannel ? 0.1 : 0)
    if (!artistHit) score -= 0.15
    if (!best || score > best.score) best = { v, score }
  }
  return best && best.score >= 0.65 ? best.v : null
}
