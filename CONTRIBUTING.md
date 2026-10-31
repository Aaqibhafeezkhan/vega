# Contributing to Vega

Thanks for helping. Pick an issue (start with `good first issue` / `help wanted`), comment that you are taking it, and open a pull request against `main`.

## Setup

```bash
npm ci
npm run dev        # desktop (Electron)
npm run dev:web    # web build with the /api functions served locally
npm run typecheck
npm test
```

Android: see `docs/android.md` (JDK 17 + Android SDK). Architecture notes: `docs/design.md`.

## Pull requests

- One issue per PR; link it (`Closes #N`).
- `npm run typecheck` and `npm test` must pass. Add tests for logic you add or change.
- UI changes: include screenshots at desktop and phone width.
- Match the surrounding code style. No new dependencies without a reason in the PR description.
- Do not commit secrets, `.env` files or API keys.

## What we will not accept

- Anything that circumvents YouTube bot checks or spoofs clients to extract streams.
- Storing or redistributing copyrighted audio from our own servers.
- Tracking that identifies users.

## Releases

Maintainers tag releases (`vX.Y.Z`); CI builds the Windows installer and the Android APK.
