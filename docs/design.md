# Vega — System Design

Status: draft v1 · Owner: Dhruv · Scope: personal use, single machine, open-sourced later.

Vega is a standalone music app (search, library, playlists, analytics, recommendations) that
replaces Spotify as the music source for Lyra. Later, Lyra's player UI and synced-lyrics engine
are folded in so Vega + Lyra become one app. Vega = brightest star in the constellation Lyra.

## 1. Requirements

Functional
- Search tracks / artists / albums across all configured sources.
- Play audio gaplessly with queue, shuffle, repeat, seek, volume, media keys.
- Library: saved tracks, albums, artists; local folder import; history.
- Playlists: create/edit/reorder, smart playlists (rules), import/export (M3U/JSON).
- Analytics: play counts, listening time, top tracks/artists/genres, streaks, heatmaps.
- Recommendations: "similar to", daily mix, discover; works offline from own data, better with Last.fm.
- Synced lyrics (Lyra's engine, LRCLIB) — phase 5.

Non-functional
- Single user, single machine. No server, no accounts. Startup < 2 s, local search < 150 ms, remote < 1.5 s.
- Works with **zero configuration and zero API keys** (owner constraint: most users won't have a YouTube/Spotify key).
- Everything is a plugin boundary: sources are addable/removable without touching UI or DB code.
- Offline-first: library, playlists, analytics never need the network.

Constraints
- Reuse Lyra's stack: Electron + React + TypeScript + Zustand + electron-vite + Vitest, so the player UI and
  `src/core/lyrics`, `src/shared` (lrc, wordTiming) move over with minimal changes.
- Solo developer; prefer boring tech.
- Legal/ToS exposure of some providers is accepted by the owner and deferred; the design only needs clean
  provider isolation so any provider can be dropped from a build.

## 2. Build order (decided with owner)

UI and app skeleton first, against a **mock provider and in-memory/JSON data**. The real song library, real
providers and the DB come after the UI is solid. The seams below make each swap a one-file change per layer.

## 3. High-level architecture

```
┌──────────────────────────── Electron main process ─────────────────────────────┐
│  Source layer            Library service        Analytics        Recs engine    │
│  ┌───────────────┐       ┌──────────────┐      ┌───────────┐    ┌────────────┐  │
│  │ SourceRegistry│◄─────►│ Library repo │◄────►│ Event log │───►│ Candidates │  │
│  │  providers[]  │       │ (SQLite)     │      │ + rollups │    │ + ranking  │  │
│  └──────┬────────┘       └──────┬───────┘      └───────────┘    └────────────┘  │
│         │ resolve(track)→Stream │ scan/watch folders                              │
│  ┌──────▼────────┐       ┌──────▼───────┐   Metadata enrichers (MusicBrainz,     │
│  │ Stream proxy  │       │ File scanner │   Last.fm, Cover Art, LRCLIB) w/ cache  │
│  │ (local http)  │       └──────────────┘                                         │
│  └──────┬────────┘                      typed IPC (contextBridge, zod-validated)  │
└─────────┼───────────────────────────────────────────────┬────────────────────────┘
          │ http://127.0.0.1:<port>/stream/<id>           │
┌─────────▼───────────────────────────────────────────────▼────────────────────────┐
│ Renderer (React + Zustand)                                                        │
│  Playback engine (HTMLAudioElement x2 for gapless/crossfade, MediaSession)        │
│  Stores: player, queue, library, playlists, search, stats    Views: Home, Search, │
│  Library, Playlist, Artist/Album, Stats, Now Playing (+Lyra lyrics later)         │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Audio plays in the renderer: Chromium's `<audio>` already decodes mp3/aac/ogg/opus/flac/wav, does range
requests and seeking, and exposes MediaSession. The main process only hands it a URL.
Local stream proxy: providers return expiring/header-gated URLs; the proxy (127.0.0.1, random port,
per-session token) adds headers, follows redirects, handles Range, optionally tees to an on-disk cache,
and hides provider differences from the renderer.

## 4. Source / provider abstraction

A provider does **two** things — *find* and *resolve*. Everything else (library, playlists, history)
stores provider-agnostic `TrackRef`s.

```ts
type TrackRef = { source: string; id: string };   // stable key, e.g. "local:ab12", "audius:D7KyD"

interface Track {
  ref: TrackRef;
  title: string; artists: string[]; album?: string;
  durationMs?: number; artworkUrl?: string;
  isrc?: string; mbid?: string;                    // cross-source identity / enrichment
}

interface SourceProvider {
  id: string;                                      // "local" | "audius" | "jamendo" | ...
  name: string;
  capabilities: { search: boolean; browse: boolean; download: boolean; needsKey: boolean };
  init(cfg: ProviderConfig): Promise<void>;
  health(): Promise<'ok' | 'degraded' | 'down'>;
  search(q: string, opts: { kind: 'track'|'artist'|'album'; limit: number }): Promise<SearchResult>;
  getTrack(id: string): Promise<Track>;
  resolve(id: string, quality?: Quality): Promise<StreamSource>;  // just-in-time, never persisted
  browse?(): Promise<Shelf[]>;                     // trending / charts for Home
}

type StreamSource =
  | { kind: 'url'; url: string; headers?: Record<string,string>; expiresAt?: number; mime?: string }
  | { kind: 'file'; path: string };
```

`SourceRegistry` fans out `search()` in parallel with per-provider timeouts, merges, and **dedupes** by
ISRC/MBID or normalized `artist+title+duration±2s`. `resolve()` has a fallback chain: if a track exists on
several sources, try them by priority and health (local file first, then network). Provider failures never
fail the UI: circuit-breaker (3 fails → 60 s cooldown), error surfaced as a chip.

Providers live in `src/providers/<id>/` with a tiny manifest, so a build can omit any of them.

### 4.1 Candidate sources (researched)

| Source | Catalog | Key needed? | Stream | Notes |
|---|---|---|---|---|
| **Local files** | Owner's own mp3/flac/m4a/ogg/opus | none | `file` | Most reliable; tags via `music-metadata`. |
| **Audius** | Independent / electronic / hip-hop, large | none for reads; free key raises limits (10 rps, 500k/mo) | `GET /v1/tracks/{id}/stream` (320 kbps) | Public REST + SDK; search, trending, playlists. Best zero-key online source. Mainstream catalog thin. Verify paths against api.audius.co/v1 swagger. |
| **Jamendo** | ~500k Creative-Commons tracks | free client_id | direct mp3/ogg | Good for discovery; key takes minutes. |
| **Internet Archive** | Netlabels, live recordings, old records | none | direct mp3/ogg/flac | `advancedsearch.php`; metadata uneven. |
| **Free Music Archive / ccMixter** | CC music | varies | downloads | Low priority. |
| **iTunes Search API** | Mainstream metadata + 30 s previews | none (~20 req/min) | preview only | Use for metadata/artwork, not playback. |
| **YouTube via local yt-dlp** | Effectively everything | none, but bundles a binary; bot-checks happen | audio-only URL | Broadest catalog; fragile; needs binary updates. Opt-in provider. |
| **Piped / Invidious** | Same as YouTube | none | `/streams/{id}` audioStreams | Public instances churn (Piped ~15 alive, Invidious ~3 in 2026); rotate list, fallback only. |
| **SoundCloud** | Large indie + remixes | scraped client_id or approved API | HLS/progressive | Later; auth fragile. |
| **Internet radio (radio-browser.info)** | 30k+ stations | none | stream URL | Cheap "Radio" shelf. |

Recommended order: Local → Audius (zero-key online; proves the abstraction) → Jamendo + Internet Archive →
yt-dlp (opt-in "power" provider) → Piped fallback. Metadata-only services (iTunes, MusicBrainz, Last.fm)
use a separate `MetadataProvider` interface so they are never confused with playable sources.

Trade-off: no free source has Spotify's mainstream catalog. Broad catalog means YouTube-derived providers
(fragile, ToS-gray, risk accepted by owner). Reliable means local + Audius + CC sources. The abstraction lets
the app use both without the rest of the code knowing.

## 5. Local library & metadata

- Scanner: chokidar watch + initial walk; `music-metadata` for tags, duration, embedded art, ReplayGain.
- Track identity: `local:<sha1(path|size|mtime)>`, upgraded to a content hash so moved files keep history.
- Enrichment (async queue, cached, rate-limited, never blocks UI): MusicBrainz (MBID, tags, year; 1 req/s,
  UA string) → Cover Art Archive → Last.fm (tags, similar; free key, optional) → LRCLIB (lyrics, phase 5).
- Online tracks enter the library only when liked/saved/played; the row stores a metadata snapshot + `ref`,
  never a URL.

## 6. Playback engine (renderer)

- Two `<audio>` elements (A/B) for gapless + optional crossfade; preload next track's `resolve()` ~15 s before end.
- State machine: `idle → loading → playing ⇄ paused → ended`, with `buffering` / `error`; resolve/stream errors
  trigger one fallback via another source, then skip.
- Queue: ordered `QueueItem[]` with `origin`, play-next vs add-to-queue, shuffle = stable permutation (so
  "previous" works), repeat off/all/one.
- Media keys via `navigator.mediaSession` (+ globalShortcut fallback).
- Normalisation: ReplayGain tag when present.
- Emits `start / progress / skip / complete` to analytics; counted play = 30 s or 50 % (Last.fm rule).
- Later: EQ via WebAudio, visualizer from AnalyserNode, same node feeds Lyra's visuals.

## 7. Search

- Instant local index: SQLite FTS5 (prefix + trigram for typos).
- Remote: debounced (200 ms) fan-out through `SourceRegistry`, streamed to the UI as results arrive
  (local first), cancelable with AbortController.
- Ranking: exact/prefix > library membership > play-count > provider priority.
- Groups: Top result, Tracks, Artists, Albums, Playlists; source chips to filter.

## 8. Playlists

- Manual: `playlist_items(position)` with gapped positions so reorder is O(1) writes.
- Smart: JSON rule tree (genre, year, play count, added date, source, "not played in N days") compiled to SQL.
- Import/export M3U8 + JSON (source refs preserved). Dead refs: re-search by artist+title and offer relink.

## 9. Analytics

- Append-only `play_events(track_ref, started_at, listened_ms, completed, source, context)`; incremental daily
  rollups per track/artist/genre.
- Views: yearly recap, top N by range, listening clock (hour × weekday), streaks, discovery ratio, skip rate,
  source split. Local only, exportable, no telemetry.

## 10. Recommendations

1. **Cold start / offline**: content-based from own data — tag overlap, artist affinity, recency-decayed play
   weight, time-of-day affinity. SQL + scoring function.
2. **Co-listening**: item-item co-occurrence from sessions (tracks within 30 min) — cosine on sparse vectors.
3. **External similarity (optional)**: Last.fm `artist.getSimilar` / `track.getSimilar`; candidates resolved
   through the SourceRegistry so recommendations are playable.
4. **Ranker**: weighted blend + diversity (MMR) + "not heard in 30 days" + skip penalty. Outputs: Daily Mix,
   Discover, Radio-from-track, "More like this".
5. Later experiment: local audio embeddings (ONNX) for untagged files.

## 11. Storage

- **SQLite via better-sqlite3** in main (file in `userData`), WAL, numbered `.sql` migrations, FTS5.
- Tables: `tracks, artists, albums, track_artists, library_items, playlists, playlist_items, play_events,
  rollups_*, enrichment_cache, settings`.
- Artwork + stream cache on disk (LRU, capped, default 2 GB), keyed by hash.
- M1: a `Repository` interface backed by in-memory seed + localStorage. DB swap = one file.

## 12. Desktop shell

Electron + electron-vite + React 18 + TS + Zustand + Vitest — identical to Lyra so code moves 1:1.
Security: `contextIsolation`, no node in renderer, typed IPC validated with zod, CSP, stream proxy bound to
127.0.0.1 with a random token. Android later: same renderer in a WebView shell like Lyra; keep the IPC contract
in `src/shared`.

Lyra merge: `src/core/lyrics`, `src/shared/{lrc,wordTiming}` and Lyra's player/lyrics components move into Vega.
Lyra's "now playing" input changes from the Windows media session/Spotify poller to Vega's player store — one adapter.

## 12.1 Web version (decided: same codebase, from now)

The renderer has no Node dependency, so Vega also ships as a static web app (`npm run build:web` -> `dist-web/`),
hostable on any static host (GitHub Pages once the repo is public). Platform differences sit behind one interface,
`LibraryBackend` (`src/shared/library.ts`):

| | Desktop | Web |
|---|---|---|
| Library metadata | SQLite (`node:sqlite`, FTS5) in main | IndexedDB, in-memory index for search |
| Folder access | native dialog + fs scan | File System Access API (Chromium); handle kept in IndexedDB, re-grant after restart |
| Audio URL | `vega-media://file/<id>` (Range-capable protocol) | `blob:` URL of the picked file |
| App state (likes, playlists, history) | SQLite `kv` | IndexedDB `kv` |
| Online providers (M3) | via main-process proxy (no CORS limits) | direct from browser; only CORS-friendly sources (Audius, Jamendo, Internet Archive) |

Consequence: web users with no local files get the online sources; yt-dlp/Piped-style providers are desktop-only.
Firefox/Safari lack directory access, so Sources shows a notice and only online sources work there.

## 12.2 Accounts and cloud (planned M4)

Goal: the web app behaves like a real service: sign up, log in, library/playlists/history follow the user across devices.
Local-first stays: the app works signed-out (data in SQLite/IndexedDB); signing in adds sync.

Choice: **Supabase** over Firebase. Postgres fits the relational model (playlists, play_events, rollups for analytics and
recs), Row Level Security gives per-user isolation without a custom server, auth (email, Google/GitHub OAuth) is built in,
free tier is enough for personal/small use, and the schema can move to any Postgres later (no lock-in). Firebase would force
a document model and weak aggregation for analytics.

- Tables mirror the local ones: `profiles`, `liked_tracks`, `playlists`, `playlist_items`, `play_events`, `settings`; every row has `user_id` + RLS `user_id = auth.uid()`.
- Sync: append-only `play_events` (idempotent by client uuid); likes/playlists last-write-wins with `updated_at` + tombstones.
- Tracks are stored as `TrackRef` + metadata snapshot, never stream URLs. Local-file refs sync metadata only (the file stays on the device).
- Hosting: static web build on Cloudflare Pages / Netlify / GitHub Pages (free); Supabase free project for auth + DB.
- Needs from the owner: a Supabase project (URL + anon key; the anon key is public by design, secured by RLS).

Honest limit of "like Spotify": the web app can offer the player, library, playlists, accounts and recommendations, but its catalog
is whatever sources allow browser access (Audius, Jamendo, user's own files). A Spotify-sized catalog needs YouTube-class
sources that browsers cannot call (CORS) and that carry ToS risk when run as a public hosted service; those stay desktop/self-hosted.

## 12.3 Lyra integration

Lyra (P:\Song Player, same author) is vendored under `lyra/` (renderer, core, shared) and built by `vite.lyra.config.ts` into
`src/renderer/public/lyra`, so every Vega build serves it at `/lyra/`. Vega shows it full screen in an iframe.
`lyra/host/api.ts` implements Lyra's `window.lyra` API (like Lyra's Android bridge): playback state and commands come from Vega
through `window.__vegaHost` (`src/renderer/src/lib/lyraHost.ts`), lyrics/backgrounds use Lyra's own core. An iframe keeps Lyra's
global CSS and behaviour untouched. The packaged desktop UI is served from a `vega-app://` origin so parent and iframe can talk.
To update Lyra, re-copy its `src/renderer`, `src/core`, `src/shared` into `lyra/` (host/ is Vega's own).

## 12.4 UI design system ("Starlight")

Tokens in `styles/tokens.css`; the whole app is coloured from the playing track's artwork (palette extraction ported from Lyra,
`lib/artTheme.ts`) through animated CSS custom properties (`--accent`, `--tint1`, `--tint2`), so the ambient background, dock,
buttons and glow all follow the music. Layout: glass rail / stage / queue drawer with a floating dock. Inter Variable, tight
display type, 1.75px stroke icon set authored for the app, spring-like easing, reduced-motion respected. Command palette
(Ctrl+K), history navigation, `/` to search, toasts for actions, skeleton loading and illustrated empty states.

## 13. Repo layout

```
src/
  main/        electron main: windows, ipc, services (library, sources, analytics, recs), db
  preload/     contextBridge API
  renderer/    React app (views, components, stores, audio engine)
  shared/      types (Track, provider contracts), ipc contract, utils
  providers/   mock, local, audius, jamendo, archive, ytdlp (each isolated)
docs/          design, ADRs, provider notes
```

## 14. Roadmap

| Phase | Deliverable | Done when |
|---|---|---|
| **M1 (done)** | Electron+React shell, design system, Home/Search/Library/Playlists/Stats views, player bar + queue, playback engine, **mock provider**, persisted JSON/localStorage repo, play-event log & stats | `npm run dev` opens app; search fake catalog, play (synth audio), queue, build playlists, stats update |
| **M2 (done)** | SQLite (desktop) / IndexedDB (web), incremental folder scanner + tags + cover art, local provider, `vega-media://` protocol, web build | Point at music folder; library persists and plays on both platforms |
| **M3 (done)** | Audius (no key), Jamendo (free client id) and Internet Archive providers; desktop stream cache (disk LRU, offline replay, https-public-only proxy); source chips; stream-error skip | Search/browse returns online results; plays with no key; replays work offline on desktop |
| **M4 (done)** | Accounts + cloud sync (Supabase): email auth, Postgres with RLS, sync of likes/playlists/history (see docs/supabase-setup.md) | Sign in on web or desktop, library follows you across devices |
| **M5 (done)** | Metadata + recommendations v2: MusicBrainz artist genres (cached, 1 req/s), Last.fm similar artists (optional key), session co-listening, radio from any track, smart playlists (synced), search ranking. Cover Art Archive enrichment deferred | Daily Mix and Discover use real tags; smart playlists update live |
| **M6 (done)** | Lyra's real player UI inside Vega (vendored in `lyra/`): backdrop and video backgrounds, synced and word-by-word lyrics, karaoke, themes/settings, wrong-lyrics picker, per-song offset. Runs in a same-origin iframe against a Vega-backed `window.lyra` bridge (same pattern as Lyra's Android build) | Lyra's player follows Vega's playback and controls it. Not ported: Spotify, window modes/widgets, studio video export, jam/nearby |
| **M7 (done)** | Live radio (radio-browser), 10-band equalizer (desktop), opt-in YouTube sources (yt-dlp with verified install, Piped with failover; desktop), Windows installer (electron-builder, NSIS) + release workflow, premium UI redesign (Starlight design system, adaptive colour, command palette) | `npm run dist` builds `release/Vega-Setup-<version>.exe`; pushing a `v*` tag publishes it via GitHub Actions |
| **M8 (done)** | Android shell: WebView around the hosted web app, foreground service + media session for background audio (see `docs/android.md`) | Debug APK builds locally; real-device audio check pending |

## 15. Risks & revisit list

- Provider fragility (YouTube-derived): isolate, health-check, never required for core flows.
- Mainstream catalog gap without YouTube-class sources: revisit after M3 real-world use.
- Cross-source dedupe is heuristic; may need MBID/ISRC-first matching.
- better-sqlite3 native rebuild vs Electron versions: pin, use electron-rebuild.
- Recs need real history; weak first weeks (hence Last.fm bootstrap).
- Later: shared workspace package for Lyra+Vega code; DB in a worker thread if scans block.
