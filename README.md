# Vega

Standalone personal music app: search, library, playlists, listening analytics and recommendations.
Built to replace Spotify as the music source for [Lyra](https://github.com/DhruvHarani1/lyra); Lyra's player UI
and synced lyrics get merged in later. Vega is the brightest star in the constellation Lyra.

Stack: Electron + React + TypeScript + Zustand (same as Lyra).

## Status: milestone 1 (UI + engine on a demo catalog)

Runs against a built-in **demo provider** (fictional catalog, synthesized audio). Real sources plug in behind the
`SourceProvider` interface later: local files, Audius, Jamendo, Internet Archive, yt-dlp. See
[docs/design.md](docs/design.md) for architecture, provider research and roadmap.

Works today: search, play/queue/shuffle/repeat, likes, playlists (create, rename, reorder, delete), listening
insights (top artists/genres/tracks, clock, streak), recommendations (Made for you, Discover), persisted in localStorage.

## Run

```bash
npm install
npm run dev        # Electron app
npm run dev:web    # renderer only, in a browser at http://localhost:5174
npm test
npm run typecheck
```

If Electron's binary did not download during install: `node node_modules/electron/install.js`.

Shortcuts: Space play/pause, Ctrl+Left/Right previous/next.

## Layout

```
src/shared/      Track/Provider contracts, SourceRegistry (fan-out, dedupe, circuit breaker), recs, stats
src/providers/   mock (M1); local/audius/... later
src/renderer/    React UI, stores, audio engine (store/player.ts)
src/main, src/preload   Electron shell
```

## License

MIT
