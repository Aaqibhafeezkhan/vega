package dev.vega.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.media.app.NotificationCompat.MediaStyle
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** What the web app is playing right now (pushed from androidBridge.ts). */
data class NowPlaying(
    val has: Boolean = false,
    val playing: Boolean = false,
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val art: String = "",
    val durationMs: Long = 0,
    val positionMs: Long = 0
)

/**
 * The reason audio survives a locked screen. The audio itself plays in the WebView (YouTube's embedded player); this
 * foreground service of type mediaPlayback keeps the app process at foreground priority, holds CPU/Wi-Fi locks while
 * a song plays, and publishes a MediaSession so the notification, lock screen, headset buttons and Bluetooth/Auto
 * controls work. Controls travel back to the page through [commandSink].
 */
class PlaybackService : Service() {
    private lateinit var session: MediaSessionCompat
    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null
    private var art: Bitmap? = null
    private var artUrl = ""
    private var inForeground = false
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Now playing", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        session = MediaSessionCompat(this, "Vega").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                // these arrive from the system UI / headset, which lets us (re)enter the foreground from the background
                override fun onPlay() { goForeground(); send("play") }
                override fun onPause() = send("pause")
                override fun onSkipToNext() = send("next")
                override fun onSkipToPrevious() = send("prev")
                override fun onSeekTo(pos: Long) = send("seek", pos)
                override fun onStop() = send("pause")
            })
            setSessionActivity(openApp())
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_COMMAND -> {
                val cmd = intent.getStringExtra("cmd") ?: "pause"
                if (cmd == "play") goForeground()
                send(cmd)
            }
            ACTION_STOP -> stopAll()
            else -> refresh()
        }
        return START_NOT_STICKY
    }

    private fun send(cmd: String, arg: Long = 0) {
        commandSink?.invoke(cmd, arg)
    }

    private fun refresh() {
        val n = now
        if (!n.has) return stopAll()
        if (n.art != artUrl) {
            artUrl = n.art
            art = null
            loadArt(n.art)
        }
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, n.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, n.artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, n.album)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, n.durationMs)
                .apply { art?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
                .build()
        )
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO
                )
                .setState(if (n.playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED, n.positionMs, if (n.playing) 1f else 0f, SystemClock.elapsedRealtime())
                .build()
        )
        setLocks(n.playing)
        val notification = buildNotification(n)
        if (n.playing) {
            goForeground(notification)
        } else {
            // paused: stay alive but let the user swipe the notification away
            if (inForeground) ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
            inForeground = false
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID, notification)
        }
    }

    private fun goForeground(notification: Notification = buildNotification(now)) {
        try {
            ServiceCompat.startForeground(this, ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            inForeground = true
        } catch (e: Exception) {
            // not allowed right now (app in the background without an exemption): the notification still updates
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(ID, notification)
        }
    }

    private fun buildNotification(n: NowPlaying): Notification {
        fun action(icon: Int, label: String, cmd: String): NotificationCompat.Action {
            val i = Intent(this, PlaybackService::class.java).setAction(ACTION_COMMAND).putExtra("cmd", cmd)
            return NotificationCompat.Action(icon, label, PendingIntent.getService(this, cmd.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        }
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_vega)
            .setContentTitle(n.title.ifEmpty { "Vega" })
            .setContentText(n.artist)
            .setSubText(n.album.ifEmpty { null })
            .setLargeIcon(art)
            .setContentIntent(openApp())
            .setDeleteIntent(PendingIntent.getService(this, 99, Intent(this, PlaybackService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(n.playing)
            .addAction(action(android.R.drawable.ic_media_previous, "Previous", "prev"))
            .addAction(if (n.playing) action(android.R.drawable.ic_media_pause, "Pause", "pause") else action(android.R.drawable.ic_media_play, "Play", "play"))
            .addAction(action(android.R.drawable.ic_media_next, "Next", "next"))
            .setStyle(MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()
    }

    private fun openApp(): PendingIntent =
        PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)

    /** Downloads the cover for the notification only; nothing is written to disk. */
    private fun loadArt(url: String) {
        if (!url.startsWith("https://")) return
        io.execute {
            val bmp = try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 8000
                c.readTimeout = 8000
                c.inputStream.use { BitmapFactory.decodeStream(it) }
            } catch (_: Exception) {
                null
            }
            if (bmp != null) main.post {
                if (url == artUrl) {
                    art = bmp
                    refresh()
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun setLocks(on: Boolean) {
        if (on) {
            if (wake == null) wake = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "vega:playback")
            if (wifi == null) wifi = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "vega:playback")
            if (wake?.isHeld == false) wake?.acquire(12 * 60 * 60 * 1000L)
            if (wifi?.isHeld == false) wifi?.acquire()
        } else {
            if (wake?.isHeld == true) wake?.release()
            if (wifi?.isHeld == true) wifi?.release()
        }
    }

    private fun stopAll() {
        setLocks(false)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        inForeground = false
        stopSelf()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // the page (and the audio) lives in the activity: when the user swipes the app away there is nothing left to control
        stopAll()
    }

    override fun onDestroy() {
        setLocks(false)
        session.isActive = false
        session.release()
        io.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "now-playing"
        private const val ID = 1
        private const val ACTION_COMMAND = "dev.vega.android.COMMAND"
        private const val ACTION_STOP = "dev.vega.android.STOP"

        @Volatile var now = NowPlaying()
        @Volatile var commandSink: ((String, Long) -> Unit)? = null

        /** Called with every state push from the page. Starts the service on the first track; afterwards just refreshes it. */
        fun update(ctx: Context, n: NowPlaying) {
            now = n
            val i = Intent(ctx, PlaybackService::class.java)
            try {
                when {
                    n.has && n.playing -> ctx.startForegroundService(i)
                    n.has -> ctx.startService(i)
                    else -> ctx.stopService(i)
                }
            } catch (_: Exception) {
                // the app is in the background and may not start a service right now; a running one is refreshed on its next start
            }
        }

        fun stop(ctx: Context) {
            now = NowPlaying()
            ctx.stopService(Intent(ctx, PlaybackService::class.java))
        }
    }
}
