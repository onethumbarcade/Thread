package com.onethumbarcade.thread;

import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ThreadMenuMusic")
public class MenuMusicPlugin extends Plugin {
    private MediaPlayer player;
    private boolean active = true;
    private boolean requested = false;
    private int preparations = 0;
    private int pauses = 0;

    @PluginMethod
    public void setPlaying(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            requested = call.getBoolean("playing", false);
            try {
                if (requested && active) {
                    if (player == null) {
                        player = new MediaPlayer();
                        player.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_GAME)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                        try (AssetFileDescriptor asset = getContext().getAssets().openFd("public/assets/thread-menu.flac")) {
                            player.setDataSource(asset.getFileDescriptor(), asset.getStartOffset(), asset.getLength());
                        }
                        player.setLooping(true);
                        player.prepare();
                        preparations++;
                    }
                    float volume = (float) Math.max(0, Math.min(1, call.getDouble("volume", .42)));
                    player.setVolume(volume, volume);
                    if (!player.isPlaying()) player.start();
                } else if (player != null && player.isPlaying()) { player.pause(); pauses++; }
                call.resolve();
            } catch (Exception error) {
                release();
                call.reject("Could not play card music", error);
            }
        });
    }

    // Read-only playback state also lets the installed-app regression check
    // verify position and player identity across a real document navigation.
    @PluginMethod
    public void getState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject state = new JSObject();
            state.put("playing", player != null && player.isPlaying());
            state.put("position", player == null ? 0 : player.getCurrentPosition());
            state.put("preparations", preparations);
            state.put("pauses", pauses);
            call.resolve(state);
        });
    }

    @Override protected void handleOnPause() {
        active = false;
        if (player != null && player.isPlaying()) { player.pause(); pauses++; }
    }
    @Override protected void handleOnResume() {
        active = true;
        if (requested && player != null && !player.isPlaying()) player.start();
    }
    private void release() {
        if (player != null) { player.release(); player = null; }
    }
    @Override protected void handleOnDestroy() { release(); }
}
