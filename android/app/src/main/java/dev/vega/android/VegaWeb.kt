package dev.vega.android

import android.annotation.SuppressLint
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.MutableContextWrapper
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * The one WebView of the app, kept alive independently of the activity. Swiping Vega away from Recents destroys the
 * activity, but while a track plays the foreground service keeps the process, and this WebView (and with it the YouTube
 * player and the page state) keeps running; reopening the app re-attaches the same view with playback intact.
 * It is created with a [MutableContextWrapper] so that, while attached, it uses the activity as its context.
 */
object VegaWeb {
    private val main = Handler(Looper.getMainLooper())
    private var view: WebView? = null

    val home: Uri = Uri.parse(BuildConfig.VEGA_URL)
    private val origin = "${home.scheme}://${home.authority}"
    private val bg = Color.parseColor("#08090E")

    /** Returns the retained WebView (creating and loading it on first use) and attaches it to [parent]. Main thread. */
    fun attach(activity: Context, parent: ViewGroup): WebView {
        val v = view ?: create(activity.applicationContext)
        (v.context as? MutableContextWrapper)?.baseContext = activity
        (v.parent as? ViewGroup)?.removeView(v)
        parent.addView(v, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        return v
    }

    /** Detaches from the dying activity but keeps the view (and the audio) alive. */
    fun detach(app: Context) {
        val v = view ?: return
        (v.parent as? ViewGroup)?.removeView(v)
        (v.context as? MutableContextWrapper)?.baseContext = app
    }

    val isAttached: Boolean get() = view?.parent != null

    /** Frees the WebView once nothing is playing and no screen shows it. */
    fun releaseIfIdle() {
        main.post {
            val v = view ?: return@post
            if (v.parent != null) return@post
            v.destroy()
            view = null
        }
    }

    /** Runs a page command (lock screen / notification / headset buttons arrive here). */
    fun command(cmd: String, arg: Long) {
        main.post { view?.evaluateJavascript("window.__vegaAndroid&&window.__vegaAndroid.command('$cmd',$arg)", null) }
    }

    /** Hardware back: the page closes the topmost overlay or goes back; [done] gets false when nothing is left. */
    fun back(done: (Boolean) -> Unit) {
        val v = view ?: return done(false)
        v.evaluateJavascript("window.__vegaAndroid?window.__vegaAndroid.back():false") { r -> done(r == "true") }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun create(app: Context): WebView {
        val v = WebView(MutableContextWrapper(app))
        v.setBackgroundColor(bg)
        v.settings.javaScriptEnabled = true
        v.settings.domStorageEnabled = true // localStorage / IndexedDB: library, offline saves, session
        v.settings.mediaPlaybackRequiresUserGesture = false // the next track must start without a tap (also with the screen off)
        v.settings.allowFileAccess = false
        v.settings.allowContentAccess = false
        v.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        v.settings.setSupportZoom(false)
        // keep the renderer (and with it the YouTube player) at foreground priority while the app is in the background
        v.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        CookieManager.getInstance().setAcceptThirdPartyCookies(v, true) // YouTube's embed keeps its consent state in its own cookies

        v.webViewClient = object : WebViewClient() {
            // Only Vega itself may be the top-level page; any other link opens in the user's browser.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val u = request.url
                if ("${u.scheme}://${u.authority}" == origin) return false
                if (u.scheme == "https" || u.scheme == "http" || u.scheme == "mailto") {
                    try { app.startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { }
                }
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOffline(view)
            }
        }

        // The bridge object exists only on Vega's own origin (never inside the YouTube iframe).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(v, "vegaAndroid", setOf(origin)) { _, message: WebMessageCompat, _, _, _ ->
                message.data?.let { onPageMessage(app, it) }
            }
        }

        // lock screen / notification / headset controls -> the page; works without any activity
        PlaybackService.commandSink = ::command

        view = v
        v.loadUrl(home.toString())
        return v
    }

    private fun onPageMessage(app: Context, json: String) {
        try {
            val o = JSONObject(json)
            if (o.optString("type") != "state") return
            PlaybackService.update(
                app,
                NowPlaying(
                    has = o.optBoolean("has"),
                    playing = o.optBoolean("playing"),
                    title = o.optString("title"),
                    artist = o.optString("artist"),
                    album = o.optString("album"),
                    art = o.optString("art"),
                    durationMs = o.optLong("durationMs"),
                    positionMs = o.optLong("positionMs")
                )
            )
        } catch (_: Exception) { }
    }

    private fun showOffline(v: WebView) {
        val html = """<html><body style="margin:0;background:#08090e;color:#e8eaf4;font-family:sans-serif;display:flex;
            flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center">
            <h2 style="margin:0 0 8px">Can't reach Vega</h2><p style="margin:0 0 20px;opacity:.65">Check your connection and try again.</p>
            <a href="$home" style="background:#8ea0ff;color:#08090e;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:600">Retry</a>
            </body></html>"""
        v.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }
}
