package com.anonymous.sankataimobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import androidx.core.app.NotificationCompat

class ShakeService : Service(), SensorEventListener {
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null

    // Shake detection constants (same as JS version)
    private val SHAKE_DELTA_G = 0.25f
    private val SHAKE_MAGNITUDE_DIFF_G = 0.35f
    private val WINDOW_MS = 2500L
    private val SPIKE_GAP_MS = 140L

    private val timestamps = mutableListOf<Long>()
    private val magnitudes = mutableListOf<Float>()

    private var overlayView: View? = null
    private var windowManager: WindowManager? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundService()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        accelerometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    private fun startForegroundService() {
        val channelId = "shake_service_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Shake Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Shake SOS Service")
            .setContentText("Listening for shake gestures")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build()
        startForeground(1, notification)
    }

    override fun onDestroy() {
        sensorManager.unregisterListener(this)
        removeOverlay()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // SensorEventListener implementation
    override fun onSensorChanged(event: SensorEvent?) {
        event?.let {
            val x = it.values[0] / SensorManager.GRAVITY_EARTH
            val y = it.values[1] / SensorManager.GRAVITY_EARTH
            val z = it.values[2] / SensorManager.GRAVITY_EARTH
            val magnitude = Math.sqrt((x * x + y * y + z * z).toDouble()).toFloat()
            val now = System.currentTimeMillis()
            timestamps.add(now)
            magnitudes.add(magnitude)
            // prune old entries
            while (timestamps.isNotEmpty() && now - timestamps.first() > WINDOW_MS) {
                timestamps.removeAt(0)
                magnitudes.removeAt(0)
            }
            // count spikes
            var spikes = 0
            for (i in 1 until magnitudes.size) {
                if (magnitudes[i] - magnitudes[i - 1] > SHAKE_MAGNITUDE_DIFF_G) spikes++
            }
            if (spikes >= 3) {
                timestamps.clear()
                magnitudes.clear()
                triggerSOS()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun triggerSOS() {
        // Show overlay UI (simple view with a message)
        if (!Settings.canDrawOverlays(this)) {
            // request permission – user must grant manually
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            return
        }
        showOverlay()
    }

    private fun showOverlay() {
        if (overlayView != null) return
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val inflater = getSystemService(LAYOUT_INFLATER_SERVICE) as LayoutInflater
        overlayView = inflater.inflate(android.R.layout.simple_list_item_1, null)
        overlayView?.setBackgroundColor(0xAAFF0000.toInt()) // semi‑transparent red
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP
        windowManager?.addView(overlayView, params)
        // auto‑remove after a few seconds
        overlayView?.postDelayed({ removeOverlay() }, 5000)
    }

    private fun removeOverlay() {
        overlayView?.let { view ->
            windowManager?.removeView(view)
            overlayView = null
        }
    }
}
