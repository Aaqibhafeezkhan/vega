// Builds / installs the Android app (android/). Finds the JDK and the Android SDK so no environment setup is needed.
// Usage: node scripts/android.mjs <debug|release|install|dev> [-- extra gradle args]
//   debug    android/app/build/outputs/apk/debug/app-debug.apk, loads the hosted web app
//   release  assembleRelease (signed when VEGA_KEYSTORE* are set, debug key otherwise)
//   install  debug build + adb install to the connected device / emulator
//   dev      debug build that loads the Vite dev server on this machine (http://10.0.2.2:5174 from an emulator), then installs it
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const androidDir = join(root, 'android')
const win = process.platform === 'win32'

function findJdk() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME
  const bases = win ? ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java', 'C:\\Program Files\\Microsoft'] : ['/usr/lib/jvm']
  for (const b of bases) {
    if (!existsSync(b)) continue
    const hit = readdirSync(b).find((d) => /(jdk|java)-?17/i.test(d))
    if (hit) return join(b, hit)
  }
  return undefined
}

function findSdk() {
  const cands = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, win ? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : join(process.env.HOME ?? '', 'Android', 'Sdk')]
  return cands.find((c) => c && existsSync(c))
}

const jdk = findJdk()
const sdk = findSdk()
if (!jdk) throw new Error('JDK 17 not found. Install Temurin 17 or set JAVA_HOME.')
if (!sdk) throw new Error('Android SDK not found. Install it (Android Studio) or set ANDROID_HOME.')
const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk }

// Release signing key: ~/.vega/keystore.properties (storeFile, storePassword, keyAlias, keyPassword), kept outside the repo.
// Updates only install over an app signed with the same key, so every release APK must use this one.
const ksFile = join(homedir(), '.vega', 'keystore.properties')
if (!env.VEGA_KEYSTORE && existsSync(ksFile)) {
  const p = Object.fromEntries(
    readFileSync(ksFile, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  )
  env.VEGA_KEYSTORE = p.storeFile
  env.VEGA_KEYSTORE_PASSWORD = p.storePassword
  env.VEGA_KEY_ALIAS = p.keyAlias
  env.VEGA_KEY_PASSWORD = p.keyPassword
}
writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`)

function run(cmd, args, cwd = androidDir) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win && cmd.endsWith('.bat') })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const [mode = 'debug', ...rest] = process.argv.slice(2).filter((a) => a !== '--')
const gradle = win ? join(androidDir, 'gradlew.bat') : join(androidDir, 'gradlew')
const adb = join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb')
const apk = (kind) => join(androidDir, 'app', 'build', 'outputs', 'apk', kind, `app-${kind}.apk`)

if (mode === 'release') run(gradle, ['assembleRelease', ...rest])
else if (mode === 'debug') run(gradle, ['assembleDebug', ...rest])
else if (mode === 'install') {
  run(gradle, ['assembleDebug', ...rest])
  run(adb, ['install', '-r', apk('debug')])
} else if (mode === 'dev') {
  run(gradle, ['assembleDebug', '-PvegaUrl=http://10.0.2.2:5174', ...rest])
  run(adb, ['install', '-r', apk('debug')])
  console.log('\nStart the web dev server with: npm run dev:web -- --host')
} else throw new Error(`unknown mode "${mode}"`)
