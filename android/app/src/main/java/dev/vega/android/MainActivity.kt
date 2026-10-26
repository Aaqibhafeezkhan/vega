package dev.vega.android

import android.Manifest
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Hosts the hosted Vega web app (https://vega-musicv1.vercel.app) in a WebView ([VegaWeb]): the same build the browser
 * gets, so relative /api calls, the CSP and YouTube's embedded player work unchanged. Native code only adds what a
 * WebView cannot do alone: background audio (see [PlaybackService]), the back button and system bars.
 */
class MainActivity : ComponentActivity() {
    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false // light icons on the dark theme
            isAppearanceLightNavigationBars = false
        }
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)

        val root = FrameLayout(this).apply { setBackgroundColor(BG) }
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            insets
        }
        // the WebView outlives this activity (see VegaWeb): reopening Vega re-attaches it with playback intact
        VegaWeb.attach(this, root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // The page closes the topmost overlay or goes back a page; with nothing left, Vega goes to the background and keeps playing.
                VegaWeb.back { handled -> if (!handled) moveTaskToBack(true) }
            }
        })

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onDestroy() {
        VegaWeb.detach(applicationContext)
        // nothing playing: no reason to keep the WebView (and the process) around
        if (!PlaybackService.now.playing) {
            PlaybackService.stop(this)
            VegaWeb.releaseIfIdle()
        }
        super.onDestroy()
    }

    // Deliberately no WebView.onPause()/onResume(): pausing the WebView would pause the embedded player with it.

    companion object {
        private val BG = Color.parseColor("#08090E")
    }
}
