import { describe, expect, it } from 'vitest'
import { mapDataApi } from './_dataApi'

describe('data api fallback mapping', () => {
  it('keeps songs with a duration, decodes entities and strips "- Topic"', () => {
    const songs = mapDataApi(
      { items: [
        { id: { videoId: 'a1' }, snippet: { title: 'Tum &amp; Hum', channelTitle: 'Arijit Singh - Topic', thumbnails: { high: { url: 'h' }, default: { url: 'd' } } } },
        { id: { videoId: 'b2' }, snippet: { title: 'No duration', channelTitle: 'x', thumbnails: {} } },
        { id: { videoId: 'c3' }, snippet: { title: 'Livestream', channelTitle: 'y', thumbnails: {} } }
      ] },
      { items: [{ id: 'a1', contentDetails: { duration: 'PT4M22S' } }, { id: 'c3', contentDetails: { duration: 'PT5H' } }] }
    )
    expect(songs).toEqual([{ videoId: 'a1', title: 'Tum & Hum', artists: ['Arijit Singh'], durationSec: 262, thumbnail: 'h' }])
  })
})
