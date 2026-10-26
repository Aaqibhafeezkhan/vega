package dev.vega.android

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Self-update without an app store. The page finds the newest GitHub release (same source as the desktop updater),
 * asks us to download its APK and then to install it. Installing goes through Android's PackageInstaller, so the
 * system verifies that the APK is signed with the same key as the installed app and asks the user to confirm
 * (the first time Android also asks to allow "install unknown apps" for Vega).
 */
object AppUpdater {
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var busy = false
    @Volatile private var reply: JavaScriptReplyProxy? = null

    private const val RELEASES = "https://github.com/DhruvHarani1/vega/releases/download/"
    const val ACTION_RESULT = "dev.vega.android.INSTALL_RESULT"

    private fun file(ctx: Context) = File(ctx.cacheDir, "update/vega-update.apk")

    fun attach(proxy: JavaScriptReplyProxy) {
        reply = proxy
    }

    fun send(state: String, percent: Int = 0, message: String = "") {
        val o = JSONObject().put("type", "update").put("state", state).put("percent", percent).put("message", message)
        try { reply?.postMessage(o.toString()) } catch (_: Exception) { }
    }

    /** The page asks who we are: the installed version, so Settings and the update check can compare. */
    fun hello() {
        try { reply?.postMessage(JSONObject().put("type", "info").put("version", BuildConfig.VERSION_NAME).toString()) } catch (_: Exception) { }
    }

    /** Only the project's own release assets (debug builds may also use the emulator's host machine for testing). */
    private fun allowed(url: String) = url.startsWith(RELEASES) || (BuildConfig.DEBUG && url.startsWith("http://10.0.2.2:"))

    fun download(ctx: Context, url: String) {
        if (!allowed(url)) return send("error", message = "Unexpected update address")
        if (busy) return
        busy = true
        io.execute {
            try {
                val out = file(ctx).also { it.parentFile?.mkdirs() }
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 15000
                c.readTimeout = 30000
                if (c.responseCode != 200) throw IllegalStateException("download failed (${c.responseCode})")
                val total = c.contentLengthLong
                var done = 0L
                var last = -1
                c.inputStream.use { input ->
                    out.outputStream().use { os ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            os.write(buf, 0, n)
                            done += n
                            val pct = if (total > 0) (done * 100 / total).toInt() else 0
                            if (pct != last) { last = pct; send("downloading", pct) }
                        }
                    }
                }
                send("ready", 100)
            } catch (e: Exception) {
                send("error", message = e.message ?: "download failed")
            } finally {
                busy = false
            }
        }
    }

    fun install(ctx: Context) {
        val apk = file(ctx)
        if (!apk.exists()) return send("error", message = "Nothing downloaded yet")
        io.execute {
            try {
                val installer = ctx.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                val id = installer.createSession(params)
                installer.openSession(id).use { session ->
                    apk.inputStream().use { input -> session.openWrite("vega.apk", 0, apk.length()).use { os -> input.copyTo(os); session.fsync(os) } }
                    val pi = PendingIntent.getBroadcast(
                        ctx, id, Intent(ctx, InstallReceiver::class.java).setAction(ACTION_RESULT).setPackage(ctx.packageName),
                        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                    )
                    send("installing")
                    session.commit(pi.intentSender)
                }
            } catch (e: Exception) {
                send("error", message = e.message ?: "install failed")
            }
        }
    }
}

/** Receives the installer's progress: asks the user to confirm when Android needs that, reports failures to the page. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirm != null) ctx.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> AppUpdater.send("installed")
            else -> AppUpdater.send("error", message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "install failed")
        }
    }
}
