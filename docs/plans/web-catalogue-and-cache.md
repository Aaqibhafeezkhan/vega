# Vega web: full catalogue + popularity-driven cache

Status: APPROVED. W1 built (api/ytm, ytm web provider, embedded player). W2-W4 pending.

## 1. Goals

1. Web has the same songs as desktop (Hindi, Punjabi, Tamil, Telugu, global).
2. Playback starts fast and costs us little bandwidth/compute.
3. Popular tracks get cheaper to serve over time (user's idea: cache what many users play).

Non-goals: bot-check circumvention, redistributing copyrighted audio from our own storage.

## 2. Why web is different

| | Desktop | Web |
|---|---|---|
| Search | Main process calls YouTube Music InnerTube | Browser blocked by CORS |
| Stream URL | Bundled yt-dlp on the user's own machine and IP | No binary; Vercel is a datacenter IP, YouTube bot-checks datacenter IPs |
| Audio output | HTMLAudio + EQ | Same, but cross-origin audio can't feed Web Audio (no EQ/visualiser) |

So the desktop trick (extract a stream with yt-dlp) does not port. Running yt-dlp on a server works for a day and then gets bot-checked; the only fix is circumventing that check, which we won't do. This is the constraint the design is built around.

## 3. Catalogue on web: the legitimate route that gives all songs

**Playback: official YouTube IFrame Player API.**
- Plays any public YouTube/YT Music video id in the browser, no backend, no extraction, no bot check, full catalogue.
- Provider `ytm-web`: `resolve(id)` returns `{ kind: 'embed', videoId }`. Player store drives it through the IFrame API (play/pause/seek/volume/ended events) so queue, next/prev, media keys, progress bar and the dock all keep working.
- Rules to respect: the player iframe must stay in the DOM and visible (we show it as the video in Now playing / a small dock thumbnail, not hidden at 0x0), no overlay on controls we don't own, ads may play.
- Costs: no EQ, no waveform/visualiser tied to audio (cross-origin), background-tab throttling on mobile browsers, occasional ads.

**Search/browse: a thin serverless proxy.**
- `api/ytm/search.ts` (Vercel function) reuses `src/main/ytmusic.ts` request/parse code (same InnerTube WEB_REMIX search, region IN). Metadata only: titles, artists, thumbnails, ids.
- Edge cache (`s-maxage=600, stale-while-revalidate=86400`) on query string, so one upstream call serves many users. Home shelves cache for 1 hour.
- Fallback if InnerTube misbehaves: official YouTube Data API v3 (free key, 10k units/day, search = 100 units, so ~100 uncached searches/day; fine behind the cache).
- Per-IP rate limit on the function; no auth needed.

**Result:** search, shelves, Top 10 by language and playback all work on web with the same provider shape as desktop. Desktop keeps yt-dlp (better: real audio, EQ, video backgrounds).

## 4. Popularity-driven cache: what we can and can't do

**Can't: store YouTube audio in our own DB/bucket and serve it.** That is copying and redistributing copyrighted recordings: YouTube ToS violation plus copyright exposure (repo is public, Supabase/Vercel can take it down, DMCA to the owner's accounts). Popularity makes it worse, not better. I recommend against it, even with the "many users play it" threshold.

**Can: cache everything around the audio, and audio where it is licensed.**

| Layer | What | Where | Saves |
|---|---|---|---|
| L1 per-device | Search results, shelves, artwork | IndexedDB (already exists) | Repeat network on that device |
| L2 shared metadata | Search responses, shelves, resolved track info | Vercel edge cache + Supabase `track_cache` | Upstream calls, latency for everyone |
| L3 popularity | Anonymous play counts per track id | Supabase `track_stats` | Drives what L2 pre-warms and what shelves show |
| L4 licensed audio | Audius, Jamendo (CC), Internet Archive audio | Already served from their CDNs; optionally mirror CC-licensed to Supabase Storage when licence allows | Bandwidth for those sources |
| L5 user's own copy | Offline/"downloaded" tracks the signed-in user chose, on their device (Cache API / IndexedDB) | Browser | Repeat plays, offline |

L3 is the answer to the idea: popularity decides what to pre-warm (search/shelf entries, thumbnails, licensed mirrors), and gives a real "trending on Vega" shelf for free.

### Data model (Supabase)

```
track_stats(
  source text, id text,           -- primary key (source, id)
  title text, artists text[], thumb text, duration_ms int,
  plays_24h int, plays_7d int, plays_total bigint,
  updated_at timestamptz
)
play_ping(                         -- append-only, no user id, no IP stored
  source text, id text, day date, count int   -- upsert-aggregated
)
```
- Client sends one ping when a track passes the "counted" threshold (already defined in the player: `counted`). Via RPC `bump_play(source, id)`; RLS: insert-only through the RPC, no table read of raw rows.
- Nightly job (Supabase cron) rolls `play_ping` into `track_stats` and prunes.
- Privacy: no user id in pings, so "many users" is a count, not a profile. Add an opt-out in Settings.

### Serving flow (web)

```
search box --> /api/ytm/search?q=  --(edge cache hit?)--> response
                                     \-- miss --> InnerTube --> cache
play track --> source = ytm  --> IFrame player (YouTube serves audio/video)
           --> source = audius/jamendo/archive --> <audio src=their CDN>
           --> after counted --> bump_play()
Home       --> /api/trending?lang=hindi  (track_stats top N, edge cached 15 min)
                 blended with ytm shelves
```

## 5. Alternatives considered

| Option | Verdict |
|---|---|
| yt-dlp on Vercel/Cloud Run, proxy audio to web | Datacenter IPs bot-checked; works briefly then fails; needs circumvention. Rejected. |
| User-supplied cookies / residential proxy | Circumvention and account risk. Rejected. |
| Piped/Invidious public instances | Unreliable, same upstream blocks, shifts risk to third parties. Maybe as last-resort fallback for search only. |
| Cache popular YouTube audio in our storage | Copyright/ToS. Rejected (see section 4). |
| Web app wraps desktop (user runs local helper) | Heavy for users; desktop app already exists. Maybe later as "get the desktop app" nudge. |
| IFrame player + metadata proxy (chosen) | Legit, full catalogue, small build, no server audio cost. |

## 6. Trade-offs

- IFrame gives the full catalogue at the price of EQ/visualiser and some control (ads, background tabs). Desktop remains the premium experience.
- Edge cache makes search cheap but a little stale (10 min). Acceptable for music.
- Aggregated pings are anonymous and cheap but can be spoofed; cap per client per minute, and weight trending by distinct devices if abuse appears.
- If YouTube changes InnerTube, web search breaks; Data API v3 is the fallback.

## 7. Phases

**W1: web catalogue (the big win).** `api/ytm/search`, `api/ytm/shelves`, `ytm-web` provider, IFrame engine behind the existing player store, UI for embedded player (dock thumb + Now playing), CSP update in `vercel.json` (`frame-src https://www.youtube.com`, `img-src` ytimg). Tests: provider unit tests with fixtures, engine adapter tests with a fake IFrame API.
**W2: stats + trending.** Supabase tables/RPC/cron, ping on counted play, `/api/trending`, "Trending on Vega" shelf, Settings opt-out.
**W3: licensed audio cache.** Mirror CC/Jamendo/Archive tracks above a play threshold into Supabase Storage with attribution; resolve prefers the mirror. Per-device offline cache (L5).
**W4: hardening.** Rate limits, Data API fallback, monitoring (function error rate, cache hit rate, IFrame error codes 101/150 = embedding disabled, then skip to next).

## 8. Risks and what I'd revisit

- Some videos disallow embedding (error 101/150): auto-skip, and prefer the "Topic"/audio uploads which almost always embed.
- InnerTube is unofficial: keep it behind the Data API fallback.
- Mobile Safari/Chrome pause embeds in background: document it; Android app (M8) is the real answer there.
- Revisit L4 mirroring only with a per-source licence check; never for YouTube.

## 9. Decisions needed

1. Approve IFrame-based web playback (loses EQ/visualiser on web)?
2. Create a YouTube Data API key for the fallback (free, your Google account)?
3. Anonymous play counting on by default with opt-out, or opt-in?
4. Go ahead with W1 first, ship, then W2/W3?
