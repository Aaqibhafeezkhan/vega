import { describe, expect, it } from 'vitest'
import { pickVideo, type VideoHit } from './pickVideo'

const hit = (videoId: string, title: string, channel: string, durationSec: number): VideoHit => ({ videoId, title, channel, durationSec })
const want = { title: 'Sitaare (From "Ikkis")', artists: ['Arijit Singh', 'Amitabh Bhattacharya'], durationMs: 244_000 }

describe('pickVideo', () => {
  const found = [
    hit('amv', 'Sitaare AMV | Your name | A silent voice | Arijit singh', 'Sync King', 236),
    hit('lyr', 'Sitaare – Arijit Singh | Full Song Lyrics | Ikkis', 'The_Arijit_Aura_', 243),
    hit('status', 'Sitaare Song Status | Arijit Singh | WhatsApp Status', 'Faded Words', 40),
    hit('mash', 'Gehra Hua X Sitaare | Mashup | Arshu Musix', 'ARSHU MUSIX', 448),
    hit('official', 'Sitaare', 'Arijit Singh,Amitabh Bhattacharya,White Noise Collectives', 196),
    hit('fan', 'Sitaare | Ikkis Agastya Nanda, Dharmendra Deol | Arijit Singh', 'MyMusics', 241),
    hit('other', 'Naina', 'Arijit Singh,Pritam', 194)
  ]

  it('skips fan edits, lyric clips and mashups and takes the real video', () => {
    expect(pickVideo(want, found)?.videoId).toBe('official')
  })

  it('prefers a closer duration among good matches', () => {
    const list = [hit('far', 'Sitaare', 'Arijit Singh', 196), hit('near', 'Sitaare (Official Video)', 'Arijit Singh', 243)]
    expect(pickVideo(want, list)?.videoId).toBe('near')
  })

  it('returns null when nothing matches the song or artist', () => {
    expect(pickVideo(want, [hit('x', 'Naina', 'Arijit Singh', 194), hit('y', 'Sitaare', 'Some Random Channel', 245)])).toBeNull()
    expect(pickVideo(want, [])).toBeNull()
  })

  it('allows live videos when the song itself is a live version', () => {
    const live = { title: 'Tum Hi Ho (Live)', artists: ['Arijit Singh'], durationMs: 300_000 }
    expect(pickVideo(live, [hit('l', 'Tum Hi Ho Live', 'Arijit Singh', 305)])?.videoId).toBe('l')
  })
})
