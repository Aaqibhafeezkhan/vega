package dev.vega.android

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebMessageCompat
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Hosts the hosted Vega web app (https://vega-psi-lac.vercel.app) in a WebView: the same build the browser gets, so
 * relative /api calls, the CSP and YouTube's embedded player work unchanged. Native code only adds what a WebView
 * cannot do alone: background audio (see [PlaybackService]), the back button, system bars and external links.
 */
class MainActivity : ComponentActivity() {
    private var web: WebView? = null
    private val home: Uri = Uri.parse(BuildConfig.VEGA_URL)
    private val origin: String = "${home.scheme}://${home.authority}"

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false // light icons on the dark theme
            isAppearanceLightNavigationBars = false
        }
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        val root = FrameLayout(this).apply { setBackgroundColor(BG) }
        val view = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setBackgroundColor(BG)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // localStorage / IndexedDB: library, offline saves, session
            settings.mediaPlaybackRequiresUserGesture = false // the next track must start without a tap (also with the screen off)
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.setSupportZoom(false)
            // keep the renderer (and with it the YouTube player) at foreground priority while the app is in the background
            setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, true) // YouTube's embed keeps its consent state in its own cookies
        root.addView(view)
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            insets
        }

        view.webViewClient = object : WebViewClient() {
            // Only Vega itself may be the top-level page; any other link opens in the user's browser.
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return false
                val u = request.url
                if (u.scheme == "https" && "${u.scheme}://${u.authority}" == origin) return false
                if (u.scheme == "https" || u.scheme == "http" || u.scheme == "mailto") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) { }
                }
                return true
            }

            override fun onReceivedError(v: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showOffline(v)
            }
        }

        // The bridge object exists only on Vega's own origin (never inside the YouTube iframe).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(view, "vegaAndroid", setOf(origin)) { _, message: WebMessageCompat, _, _, _ ->
                message.data?.let(::onPageMessage)
            }
        }

        // lock screen / notification / headset controls -> the page
        PlaybackService.commandSink = { cmd, arg ->
            runOnUiThread { web?.evaluateJavascript("window.__vegaAndroid&&window.__vegaAndroid.command('$cmd',$arg)", null) }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // The page closes the topmost overlay or goes back a page; with nothing left, Vega goes to the background and keeps playing.
                view.evaluateJavascript("window.__vegaAndroid?window.__vegaAndroid.back():false") { r ->
                    if (r != "true") moveTaskToBack(true)
                }
            }
        })

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        web = view
        if (savedInstanceState == null) view.loadUrl(home.toString()) else view.restoreState(savedInstanceState)
    }

    private fun onPageMessage(json: String) {
        try {
            val o = JSONObject(json)
            if (o.optString("type") != "state") return
            PlaybackService.update(
                this,
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
            <a href="${home}" style="background:#8ea0ff;color:#08090e;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:600">Retry</a>
            </body></html>"""
        v.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web?.saveState(outState)
    }

    override fun onDestroy() {
        PlaybackService.commandSink = null
        if (isFinishing) PlaybackService.stop(this)
        web?.destroy()
        web = null
        super.onDestroy()
    }

    // Deliberately no WebView.onPause()/onResume(): pausing the WebView would pause the embedded player with it.

    companion object {
        private val BG = Color.parseColor("#08090E")
    }
}
