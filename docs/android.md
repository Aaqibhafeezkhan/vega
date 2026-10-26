# Vega for Android

`android/` is a plain Android WebView shell (Kotlin, no Capacitor) around the **hosted web app** (`https://vega-musicv1.vercel.app`, the `dist-web` build deployed by Vercel). Same pattern as Lyra's Android build, minus bundled assets.

## Why it loads the hosted site

- Relative `/api/ytm/*`, `/api/img`, `/api/lrclib` calls just work, and the Vercel CSP (YouTube iframe allowed) applies as in a browser.
- YouTube's embedded player needs a real https origin; a bundled `file://`/asset origin gets embed errors.
- The app updates with every deploy, no APK release needed for UI changes. The APK only changes for native code.
- Trade-off: needs a network connection to start. A failed load shows a Retry page.

## Background audio

The audio plays in the WebView (YouTube IFrame player), so the process must stay alive and unthrottled with the screen off. A WebView alone does not guarantee that, so the shell adds:

1. **Foreground service** `PlaybackService` (type `mediaPlayback`) keeps the app at foreground priority and holds a partial CPU wake lock and a Wi-Fi lock while a song plays.
2. **MediaSession + notification** (title, artist, album, cover, progress, prev / play-pause / next, lock screen, headset and Bluetooth buttons).
3. The activity never calls `WebView.onPause()`, and the renderer priority is `IMPORTANT` even when hidden. Hidden pages that play audio are not timer-throttled by Chromium.
4. On the web side `src/renderer/src/lib/keepAlive.ts` holds a silent audio element so the page counts as a media page.

Bridge (only on Vega's origin, never inside the YouTube iframe; implemented with `WebMessageListener`):

- page -> native: `window.vegaAndroid.postMessage(json)` with `{type:'state', has, playing, title, artist, album, art, durationMs, positionMs}` (`src/renderer/src/lib/androidBridge.ts`, driven by `usePlayer`)
- native -> page: `window.__vegaAndroid.command('play'|'pause'|'next'|'prev'|'seek', ms)` and `window.__vegaAndroid.back()` (closes the topmost overlay or goes back a page; returns `false` when nothing is left, then the app moves to the background and keeps playing)

**Closing the app:** the WebView is a process-wide singleton (`VegaWeb.kt`) created with a `MutableContextWrapper`; the activity only attaches/detaches it. Swiping Vega away from Recents destroys the activity, but while a track plays the foreground service (`stopWithTask="false"`) keeps the process and the detached WebView, so the music continues and the notification controls still work. Reopening the app re-attaches the same page with playback intact. Everything is released when playback is paused and the app is closed (swipe while paused), when the paused notification is dismissed, or after 15 minutes paused.

Limits: the system or an aggressive battery saver (some OEMs kill the process on swipe regardless of foreground services) can still end playback; exempt Vega in the phone's battery settings. Android's "Force stop" always stops it.

**Background after leaving the app:** `KeepVisibleWebView` ignores Android's "window not visible" signal, so when you switch to another app or turn the screen off the page stays `visible` and YouTube's player does not pause itself (verified: `document.visibilityState` stays `visible` after Home and screen-off). Another app that takes audio focus (a video, a call) still pauses Vega, like any music app.

## Updating

The Android app updates itself from GitHub releases, like the Windows app (Settings -> Updates):

1. At start and every 6 hours the page reads the newest release (`lib/androidUpdate.ts`) and compares its version with the installed one.
2. If newer, the APK is downloaded in the background (switch "Download updates automatically" off to ask first); only `https://github.com/DhruvHarani1/vega/releases/download/...` is accepted.
3. "Install update" hands the APK to Android's PackageInstaller (`AppUpdater.kt`). Android shows its install dialog (the first time it also asks to allow "install unknown apps" for Vega). A silent install is not possible without a store or device-owner rights.

Android only installs an update signed with the **same key** as the installed app, so every release APK must use the release keystore:

- Local: `~/.vega/keystore.properties` (storeFile, storePassword, keyAlias, keyPassword; kept outside the repo, back it up! losing it means users must uninstall and reinstall). `npm run android:release` picks it up automatically.
- CI: add the repo secrets `VEGA_KEYSTORE_B64` (`base64 -w0 ~/.vega/vega-release.jks`), `VEGA_KEYSTORE_PASSWORD`, `VEGA_KEY_ALIAS` (`vega`), `VEGA_KEY_PASSWORD`. Without them CI signs with a throwaway debug key and updates would fail to install.
- An APK signed with a different key (the debug key, an older build) must be uninstalled once before the stable-key APK can be installed.

## Build

Needs JDK 17 and the Android SDK (platform 36, build-tools). `scripts/android.mjs` finds them (`JAVA_HOME`, `ANDROID_HOME`, or the default Windows locations) and writes `android/local.properties`.

```bash
npm run android:debug     # android/app/build/outputs/apk/debug/app-debug.apk
npm run android:install   # debug build + adb install to the connected device / emulator
npm run android:release   # release APK (signed with ~/.vega/keystore.properties when present, else the debug key)
```

Version comes from `package.json` (`0.4.5` -> versionCode `405`). The debug build has the id `dev.vega.android.debug`, so it installs next to a release build.

### Working on the web app from the phone / emulator

```bash
npm run build:web
HOST=0.0.0.0 node scripts/serve-dist.mjs 5174     # or: npm run dev:web -- --host
npm run android:dev                                # debug APK that loads http://10.0.2.2:5174, then installs it
```

Debug builds allow cleartext only to `10.0.2.2` / `localhost`. Point at another deployment with `-PvegaUrl=https://...` (`node scripts/android.mjs debug -- -PvegaUrl=https://x.vercel.app`).

## Release signing (CI)

`.github/workflows/release.yml` has an `android` job (runs after the Windows job on a `v*` tag) that attaches `Vega-<tag>.apk` to the GitHub release. Add the secrets `VEGA_KEYSTORE_B64` (base64 of the keystore), `VEGA_KEYSTORE_PASSWORD`, `VEGA_KEY_ALIAS`, `VEGA_KEY_PASSWORD` to sign with a stable key; without them the APK is signed with the debug key (installable, but updates need the same key, so set the secrets before sharing the APK widely). Never commit a keystore.

## Layout

- `VegaWeb.kt` the retained WebView: settings, bridge, external links to the browser, offline page
- `MainActivity.kt` edge-to-edge insets (dark bars), back button, notification permission, attaches `VegaWeb`
- `AppUpdater.kt` APK download + PackageInstaller install, `InstallReceiver`
- `PlaybackService.kt` foreground service, MediaSession, notification, wake/Wi-Fi locks
- icons: `scripts/make-android-icons.py` (from `build/icon.png`); the splash is the Android 12 system splash with the star on the app colour

## Verified

On an Android 17 x86_64 emulator: page loads edge-to-edge with the phone layout, status bar matches the theme, the bridge appears on Vega's origin, a state push starts a `mediaPlayback` foreground service with a media notification (cover, progress, 3 controls), it stays alive with Home pressed and the screen off (wake lock held), notification buttons arrive in the page as commands, and Back goes to the home screen without stopping the app. Swiping the task away (`am stack remove`) while playing keeps the process, service and page alive and reopening re-attaches the same page; swiping while paused stops the service and releases the WebView. Not verified on the emulator: actual YouTube audio output while locked (the emulator's network and CPU were too slow to play a video reliably). Check on a real phone before announcing it.
