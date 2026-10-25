/*
 * AyuTube - native video player (AndroidX Media3 / ExoPlayer).
 *
 * The video is drawn on a TextureView that sits *behind* the transparent
 * WebView. The page leaves a transparent "hole" where the video should be and
 * draws its own LibreTube-style controls on top, so the controls are plain
 * HTML/CSS while decoding stays native.
 *
 * Copyright (C) AyuTube contributors
 * Licensed under the GNU General Public License v3.0 (see LICENSE).
 * Player behaviour is modelled on LibreTube (GPL-3.0).
 */
package com.ayutube.app;

import android.content.Context;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.OptIn;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.MergingMediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.OkHttpClient;

@OptIn(markerClass = UnstableApi.class)
@CapacitorPlugin(name = "AyuPlayer")
public class AyuPlayerPlugin extends Plugin {
    private static final long TICK_MS = 250;

    private static final String UA_WEB =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";
    private static final String UA_ANDROID =
            "com.google.android.youtube/19.44.38 (Linux; U; Android 14; en_US) gzip";
    private static final String UA_ANDROID_VR =
            "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";
    private static final String UA_IOS =
            "com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)";

    private static final Pattern CLIENT = Pattern.compile("[?&]c=([A-Z_]+)");

    private final Handler main = new Handler(Looper.getMainLooper());

    private ExoPlayer player;
    private DataSource.Factory dataFactory;
    private FrameLayout container;
    private TextureView texture;

    private int boundsX;
    private int boundsY;
    private int boundsW;
    private int boundsH;
    private int videoW;
    private int videoH;
    private String resizeMode = "fit";
    private boolean backgroundPlay = false;
    private OnBackPressedCallback backCallback;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            emitState();

            if (player != null
                    && player.getPlayWhenReady()
                    && player.getPlaybackState() != Player.STATE_ENDED) {
                main.postDelayed(this, TICK_MS);
            }
        }
    };

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onPlaybackStateChanged(final int state) {
            emitState();

            if (state == Player.STATE_ENDED) {
                notifyListeners("ended", new JSObject());
            }
        }

        @Override
        public void onIsPlayingChanged(final boolean isPlaying) {
            if (texture != null) {
                texture.setKeepScreenOn(isPlaying);
            }

            emitState();
            startTicker();
        }

        @Override
        public void onPlayWhenReadyChanged(final boolean playWhenReady, final int reason) {
            emitState();
            startTicker();
        }

        @Override
        public void onVideoSizeChanged(final VideoSize size) {
            videoW = Math.round(size.width * size.pixelWidthHeightRatio);
            videoH = size.height;
            applyLayout();
            emitState();
        }

        @Override
        public void onPlayerError(final PlaybackException error) {
            final JSObject out = new JSObject();

            out.put("message", String.valueOf(error.getMessage()));
            out.put("code", error.errorCode);
            out.put("codeName", error.getErrorCodeName());
            out.put("cause", String.valueOf(error.getCause()));

            notifyListeners("error", out);
        }
    };

    // ------------------------------------------------------------------ setup

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> {
            final WebView web = getBridge().getWebView();

            web.setBackgroundColor(Color.TRANSPARENT);

            if (web.getParent() instanceof View) {
                ((View) web.getParent()).setBackgroundColor(Color.BLACK);
            }

            // While fullscreen or a menu is open, the Back button is handed to
            // the page (as a "ayutubeBack" window event) instead of leaving.
            if (getActivity() instanceof ComponentActivity) {
                backCallback = new OnBackPressedCallback(false) {
                    @Override
                    public void handleOnBackPressed() {
                        getBridge().triggerWindowJSEvent("ayutubeBack");
                    }
                };
                ((ComponentActivity) getActivity())
                        .getOnBackPressedDispatcher()
                        .addCallback(backCallback);
            }
        });
    }

    @PluginMethod
    public void setBackIntercept(final PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));

        onMain(call, () -> {
            if (backCallback != null) {
                backCallback.setEnabled(enabled);
            }
        });
    }

    private static String userAgentFor(final String url) {
        final Matcher matcher = CLIENT.matcher(url);

        if (matcher.find()) {
            final String client = matcher.group(1);

            if ("IOS".equals(client)) {
                return UA_IOS;
            }

            if ("ANDROID_VR".equals(client)) {
                return UA_ANDROID_VR;
            }

            if ("ANDROID".equals(client)) {
                return UA_ANDROID;
            }
        }

        return UA_WEB;
    }

    private void ensurePlayer() {
        if (player != null) {
            return;
        }

        final Context context = getContext();

        final OkHttpClient client = new OkHttpClient.Builder()
                .addInterceptor(chain -> chain.proceed(
                        chain.request().newBuilder()
                                .header("User-Agent", userAgentFor(chain.request().url().toString()))
                                .build()))
                .build();

        dataFactory = new OkHttpDataSource.Factory(client);

        container = new FrameLayout(context);
        container.setBackgroundColor(Color.BLACK);
        container.setVisibility(View.GONE);

        texture = new TextureView(context);
        container.addView(texture, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER));

        final ViewGroup parent = (ViewGroup) getBridge().getWebView().getParent();

        parent.addView(container, 0, new ViewGroup.MarginLayoutParams(0, 0));

        player = new ExoPlayer.Builder(context).build();
        player.addListener(listener);
        player.setVideoTextureView(texture);
    }

    private void applyLayout() {
        if (container == null || texture == null) {
            return;
        }

        final WebView web = getBridge().getWebView();

        if (boundsW <= 0 || boundsH <= 0) {
            container.setVisibility(View.GONE);
            return;
        }

        final ViewGroup.MarginLayoutParams outer =
                (ViewGroup.MarginLayoutParams) container.getLayoutParams();

        outer.leftMargin = web.getLeft() + boundsX;
        outer.topMargin = web.getTop() + boundsY;
        outer.width = boundsW;
        outer.height = boundsH;
        container.setLayoutParams(outer);
        container.setVisibility(View.VISIBLE);

        int width = boundsW;
        int height = boundsH;

        if (videoW > 0 && videoH > 0) {
            final float videoRatio = (float) videoW / videoH;
            final float boxRatio = (float) boundsW / boundsH;

            switch (resizeMode) {
                case "fill":
                    break;
                case "zoom":
                    if (videoRatio > boxRatio) {
                        width = Math.round(boundsH * videoRatio);
                    } else {
                        height = Math.round(boundsW / videoRatio);
                    }
                    break;
                default:
                    if (videoRatio > boxRatio) {
                        height = Math.round(boundsW / videoRatio);
                    } else {
                        width = Math.round(boundsH * videoRatio);
                    }
                    break;
            }
        }

        final FrameLayout.LayoutParams inner =
                (FrameLayout.LayoutParams) texture.getLayoutParams();

        inner.width = width;
        inner.height = height;
        inner.gravity = Gravity.CENTER;
        texture.setLayoutParams(inner);
    }

    private void startTicker() {
        main.removeCallbacks(ticker);
        main.post(ticker);
    }

    private static String stateName(final int state) {
        switch (state) {
            case Player.STATE_BUFFERING:
                return "buffering";
            case Player.STATE_READY:
                return "ready";
            case Player.STATE_ENDED:
                return "ended";
            default:
                return "idle";
        }
    }

    private JSObject snapshot() {
        final JSObject out = new JSObject();

        if (player == null) {
            out.put("state", "idle");
            return out;
        }

        final long duration = player.getDuration();

        out.put("positionMs", player.getCurrentPosition());
        out.put("durationMs", duration == C.TIME_UNSET ? 0 : duration);
        out.put("bufferedMs", player.getBufferedPosition());
        out.put("playing", player.isPlaying());
        out.put("playWhenReady", player.getPlayWhenReady());
        out.put("state", stateName(player.getPlaybackState()));
        out.put("speed", player.getPlaybackParameters().speed);
        out.put("videoWidth", videoW);
        out.put("videoHeight", videoH);

        return out;
    }

    private void emitState() {
        notifyListeners("state", snapshot());
    }

    private interface Action {
        void run() throws Exception;
    }

    private void onMain(final PluginCall call, final Action action) {
        getActivity().runOnUiThread(() -> {
            try {
                action.run();
                call.resolve();
            } catch (final Throwable error) {
                call.reject(String.valueOf(error.getMessage()));
            }
        });
    }

    private static boolean has(final String value) {
        return value != null && !value.isEmpty();
    }

    // ------------------------------------------------------------------ playback

    @PluginMethod
    public void play(final PluginCall call) {
        onMain(call, () -> {
            if (player != null) {
                if (player.getPlaybackState() == Player.STATE_ENDED) {
                    player.seekTo(0);
                }

                player.play();
            }
        });
    }

    @PluginMethod
    public void open(final PluginCall call) {
        final String videoUrl = call.getString("videoUrl");
        final String audioUrl = call.getString("audioUrl");
        final String hlsUrl = call.getString("hlsUrl");
        final Long startValue = call.getLong("startMs");
        final long startMs = startValue == null ? 0 : startValue;
        final boolean autoplay = Boolean.TRUE.equals(call.getBoolean("autoplay", true));
        final Float speedValue = call.getFloat("speed", 1f);
        final float speed = speedValue == null ? 1f : speedValue;

        onMain(call, () -> {
            if (!has(videoUrl) && !has(audioUrl) && !has(hlsUrl)) {
                throw new IllegalArgumentException("No stream was provided.");
            }

            ensurePlayer();

            final MediaSource source;

            if (has(hlsUrl) && !has(videoUrl) && !has(audioUrl)) {
                source = new HlsMediaSource.Factory(dataFactory)
                        .createMediaSource(MediaItem.fromUri(hlsUrl));
            } else {
                final ProgressiveMediaSource.Factory factory =
                        new ProgressiveMediaSource.Factory(dataFactory);

                if (has(videoUrl) && has(audioUrl)) {
                    source = new MergingMediaSource(
                            factory.createMediaSource(MediaItem.fromUri(videoUrl)),
                            factory.createMediaSource(MediaItem.fromUri(audioUrl)));
                } else {
                    source = factory.createMediaSource(
                            MediaItem.fromUri(has(videoUrl) ? videoUrl : audioUrl));
                }
            }

            videoW = 0;
            videoH = 0;

            player.setMediaSource(source, startMs);
            player.setPlaybackParameters(new PlaybackParameters(speed));
            player.prepare();
            player.setPlayWhenReady(autoplay);

            applyLayout();
            startTicker();
        });
    }

    @PluginMethod
    public void pause(final PluginCall call) {
        onMain(call, () -> {
            if (player != null) {
                player.pause();
            }
        });
    }

    @PluginMethod
    public void seekTo(final PluginCall call) {
        final Long target = call.getLong("ms");

        onMain(call, () -> {
            if (player != null && target != null) {
                player.seekTo(Math.max(0, target));
                emitState();
            }
        });
    }

    @PluginMethod
    public void setSpeed(final PluginCall call) {
        final Float speed = call.getFloat("speed", 1f);

        onMain(call, () -> {
            if (player != null && speed != null) {
                player.setPlaybackParameters(new PlaybackParameters(speed));
                emitState();
            }
        });
    }

    @PluginMethod
    public void getState(final PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(snapshot()));
    }

    @PluginMethod
    public void release(final PluginCall call) {
        onMain(call, this::releasePlayer);
    }

    private void releasePlayer() {
        main.removeCallbacks(ticker);

        if (player != null) {
            player.removeListener(listener);
            player.release();
            player = null;
        }

        if (container != null && container.getParent() instanceof ViewGroup) {
            ((ViewGroup) container.getParent()).removeView(container);
        }

        container = null;
        texture = null;
        videoW = 0;
        videoH = 0;
    }

    // ------------------------------------------------------------------ layout

    /** x, y, width and height in CSS pixels, relative to the web page. */
    @PluginMethod
    public void setBounds(final PluginCall call) {
        final Double x = call.getDouble("x", 0.0);
        final Double y = call.getDouble("y", 0.0);
        final Double width = call.getDouble("width", 0.0);
        final Double height = call.getDouble("height", 0.0);

        onMain(call, () -> {
            final float density = getContext().getResources().getDisplayMetrics().density;

            boundsX = Math.round((float) (x == null ? 0 : x) * density);
            boundsY = Math.round((float) (y == null ? 0 : y) * density);
            boundsW = Math.round((float) (width == null ? 0 : width) * density);
            boundsH = Math.round((float) (height == null ? 0 : height) * density);

            if (player != null) {
                applyLayout();
            }
        });
    }

    @PluginMethod
    public void setResizeMode(final PluginCall call) {
        final String mode = call.getString("mode", "fit");

        onMain(call, () -> {
            resizeMode = mode == null ? "fit" : mode;
            applyLayout();
        });
    }

    @PluginMethod
    public void setFullscreen(final PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));

        onMain(call, () -> {
            final Window window = getActivity().getWindow();
            final WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());

            if (enabled) {
                controller.setSystemBarsBehavior(
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.systemBars());
                getActivity().setRequestedOrientation(
                        ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
                getActivity().setRequestedOrientation(
                        ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            }
        });
    }

    @PluginMethod
    public void setBackgroundPlay(final PluginCall call) {
        backgroundPlay = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    // ------------------------------------------------------------------ device controls

    @PluginMethod
    public void setBrightness(final PluginCall call) {
        final Float value = call.getFloat("value", -1f);

        onMain(call, () -> {
            final Window window = getActivity().getWindow();
            final WindowManager.LayoutParams params = window.getAttributes();

            params.screenBrightness = value == null || value < 0
                    ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
                    : Math.max(0.01f, Math.min(1f, value));
            window.setAttributes(params);
        });
    }

    @PluginMethod
    public void getBrightness(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            float value = getActivity().getWindow().getAttributes().screenBrightness;

            if (value < 0) {
                try {
                    value = Settings.System.getInt(
                            getContext().getContentResolver(),
                            Settings.System.SCREEN_BRIGHTNESS) / 255f;
                } catch (final Throwable ignored) {
                    value = 0.5f;
                }
            }

            final JSObject out = new JSObject();

            out.put("value", value);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void setVolume(final PluginCall call) {
        final Float value = call.getFloat("value", 0.5f);

        onMain(call, () -> {
            final AudioManager audio =
                    (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            final int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            final float safe = value == null ? 0.5f : Math.max(0f, Math.min(1f, value));

            audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(safe * max), 0);
        });
    }

    @PluginMethod
    public void getVolume(final PluginCall call) {
        final AudioManager audio =
                (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        final int max = Math.max(1, audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        final JSObject out = new JSObject();

        out.put("value", audio.getStreamVolume(AudioManager.STREAM_MUSIC) / (float) max);
        call.resolve(out);
    }

    // ------------------------------------------------------------------ lifecycle

    @Override
    protected void handleOnPause() {
        if (player != null && !backgroundPlay) {
            player.pause();
        }

        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        releasePlayer();
        super.handleOnDestroy();
    }
}
