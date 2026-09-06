package com.onethumbarcade.thread;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.os.SystemClock;
import android.os.ParcelFileDescriptor;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONArray;
import org.json.JSONObject;

@RunWith(AndroidJUnit4.class)
public class LaunchTest {
    private String asset(String name) throws Exception {
        try (java.io.InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name)) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private void screenshot(String name) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .executeShellCommand("screencap -p /sdcard/Download/" + name);
             FileInputStream stream = new FileInputStream(descriptor.getFileDescriptor())) {
            stream.readAllBytes();
        }
    }

    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("WebView did not respond", done.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private void awaitReady(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 30000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if ("true".equals(evaluate(scenario, script))) return;
            SystemClock.sleep(200);
        }
        assertEquals("App did not reach the expected screen: " + evaluate(scenario, "location.href"),
            "true", evaluate(scenario, script));
    }

    private JSONObject musicState(ActivityScenario<MainActivity> scenario) throws Exception {
        evaluate(scenario, "window.musicSnapshot=null;ThreadNative.menuMusic.getState().then(s=>window.musicSnapshot=s).catch(e=>window.musicSnapshot={error:String(e)})");
        awaitReady(scenario, "!!window.musicSnapshot");
        String encoded = evaluate(scenario, "JSON.stringify(window.musicSnapshot)");
        JSONObject snapshot = new JSONObject(new JSONArray("[" + encoded + "]").getString(0));
        assertTrue("Native music state failed: " + snapshot, !snapshot.has("error"));
        return snapshot;
    }

    @Test
    public void cardMusicSurvivesSummaryHomeAndLeaderboardNavigation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitReady(scenario, "!!window.ThreadNative?.ready");
            evaluate(scenario, "ThreadStorage.setItem('thread-settings',JSON.stringify({music:true,sfx:false,haptics:false}));ThreadNative.ready=false;ThreadNative.navigate('update-2-preview.html')");
            awaitReady(scenario, "!!(window.ThreadNative?.ready && document.querySelector('#home.active') && settings.music)");
            assertTrue(musicState(scenario).getBoolean("playing"));
            SystemClock.sleep(1400);
            JSONObject home = musicState(scenario);
            evaluate(scenario, "show('options');show('scoring');show('home')");
            JSONObject cards = musicState(scenario);
            assertEquals(home.getInt("pauses"), cards.getInt("pauses"));
            assertEquals(home.getInt("preparations"), cards.getInt("preparations"));
            evaluate(scenario, "ThreadNative.navigate('index.html?mode=generated&seed=CHILL2026')");
            awaitReady(scenario, "!!(window.ThreadNative?.ready && window.frame && game?.running)");
            assertEquals(false, musicState(scenario).getBoolean("playing"));
            evaluate(scenario, "game.energy=0;game.ringOffset=width*2");
            awaitReady(scenario, "!!(window.ThreadNative?.ready && !game.running && !document.querySelector('#result').classList.contains('hidden'))");
            JSONObject summary = musicState(scenario);
            assertTrue(summary.getBoolean("playing"));
            assertTrue(summary.getInt("position") >= home.getInt("position"));
            evaluate(scenario, "document.querySelector('#home-button').click()");
            awaitReady(scenario, "!!(window.ThreadNative?.ready && document.querySelector('#home.active'))");
            JSONObject returned = musicState(scenario);
            assertTrue(returned.getBoolean("playing"));
            assertEquals("Home must not pause card music", summary.getInt("pauses"), returned.getInt("pauses"));
            assertEquals("Home must retain the player", summary.getInt("preparations"), returned.getInt("preparations"));
            assertTrue("Home must not rewind the song", returned.getInt("position") >= summary.getInt("position"));
            evaluate(scenario, "show('leaderboard');show('archive');show('home')");
            JSONObject browsed = musicState(scenario);
            assertEquals(returned.getInt("pauses"), browsed.getInt("pauses"));
            evaluate(scenario, "document.querySelector('[data-setting=music]').click()");
            JSONObject muted = musicState(scenario);
            assertEquals(false, muted.getBoolean("playing"));
            SystemClock.sleep(400);
            assertEquals(muted.getInt("position"), musicState(scenario).getInt("position"));
            evaluate(scenario, "document.querySelector('[data-setting=music]').click()");
            assertTrue(musicState(scenario).getBoolean("playing"));
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
            SystemClock.sleep(300);
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);
            awaitReady(scenario, "!!window.ThreadNative?.ready");
            JSONObject resumed = musicState(scenario);
            assertTrue(resumed.getBoolean("playing"));
            assertEquals(home.getInt("preparations"), resumed.getInt("preparations"));
            assertTrue(resumed.getInt("position") >= muted.getInt("position"));
        }
    }

    @Test
    public void gameplayRenderingAndTouchWorkOffline() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            awaitReady(scenario, "!!window.ThreadNative?.ready");
            scenario.onActivity(activity -> assertTrue("Game WebView must use hardware acceleration",
                activity.getBridge().getWebView().isHardwareAccelerated()));
            evaluate(scenario, "ThreadStorage.setItem('thread-settings',JSON.stringify({music:false,sfx:false,haptics:false}));" +
                "ThreadNative.navigate('index.html?mode=generated&seed=PERF2026&powers=222222&bonuses=222')");
            awaitReady(scenario, "!!(window.ThreadNative?.ready && window.frame && game?.running)");
            String legacy = asset("legacy-frame.js").replaceFirst("function frame", "function");
            evaluate(scenario, "window.threadLegacyFrame = (" + legacy + ");");
            evaluate(scenario, asset("render-benchmark.js"));
            System.out.println("THREAD_PROFILE: cached renderer starting");
            evaluate(scenario, "threadSampleRenderer('cached-renderer', threadOptimizedFrame)");
            awaitReady(scenario, "threadPerfResults.length === 1");
            screenshot("thread-cached-renderer.png");
            System.out.println("THREAD_PROFILE: cached renderer completed: " + evaluate(scenario, "JSON.stringify(threadPerfResults)"));
            evaluate(scenario, "threadSampleRenderer('previous-renderer', threadLegacyFrame)");
            awaitReady(scenario, "threadPerfResults.length === 2");
            screenshot("thread-previous-renderer.png");
            String encoded = evaluate(scenario, "JSON.stringify(threadPerfResults)");
            String json = new JSONArray("[" + encoded + "]").getString(0);
            JSONArray samples = new JSONArray(json);
            for (int i = 0; i < samples.length(); i++) {
                JSONObject sample = samples.getJSONObject(i);
                assertTrue("Gameplay must keep rendering", sample.getInt("frames") > 30);
            }
            System.out.println("THREAD_RENDER_BENCHMARK=" + json);
            assertEquals("true", evaluate(scenario, "(() => {" +
                "game.ringOffset=0;const target=document.querySelector('#canvas');" +
                "target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:100}));" +
                "target.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:160}));" +
                "target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:160}));" +
                "return game.ringOffset===60;})()"));
        }
    }

    @Test
    public void bundledTitleMenuOpensAndRespondsOffline() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                awaitReady(scenario, "!!(window.ThreadNative?.ready && window.ThreadStorage && " +
                    "window.ThreadAppBack && document.querySelector('#home.active'))");
                assertEquals("\"https://localhost/update-2-preview.html\"", evaluate(scenario, "location.href"));
                assertEquals("false", evaluate(scenario, "!!document.querySelector('.native-start-error')"));
                evaluate(scenario, "ThreadLeaderboard.board=async()=>({entries:[" +
                    "{rank:1,tag:'A1B2C3D4E5F6',score:52910,isYou:true}," +
                    "{rank:2,tag:'C826221469A5',score:47683,isYou:false}]," +
                    "yours:{rank:1,tag:'A1B2C3D4E5F6',score:52910,isYou:true}});show('leaderboard')");
                awaitReady(scenario, "document.querySelectorAll('#board-entries .rank').length===2");
                assertEquals("true", evaluate(scenario, "(() => {" +
                    "const headers=[...document.querySelectorAll('.board-columns [role=columnheader]')];" +
                    "const row=document.querySelectorAll('#board-entries .rank')[1];" +
                    "return headers.map(x=>x.textContent).join('|')==='Rank|Threader ID|Score' && " +
                    "row.children[1].textContent==='C826221469A5' && " +
                    "headers.every((h,i)=>Math.abs(h.getBoundingClientRect().left-row.children[i].getBoundingClientRect().left)<2);})()"));
                evaluate(scenario, "document.querySelector('#board-track-select').value='1';" +
                    "document.querySelector('#board-track-select').onchange()");
                assertEquals("true", evaluate(scenario, "document.querySelector('#board-play').getAttribute('href')==='index.html?mode=daily&track=1'"));
                screenshot("thread-leaderboard.png");
                evaluate(scenario, "show('home')");
                evaluate(scenario, "document.querySelector('#home [data-go=generate]').click()");
                awaitReady(scenario, "!!document.querySelector('#generate.active')");
                evaluate(scenario, "window.ThreadAppBack()");
                awaitReady(scenario, "!!document.querySelector('#home.active')");
            } finally {
                Bitmap screenshot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
                File directory = InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
                if (screenshot != null && directory != null) {
                    try (FileOutputStream stream = new FileOutputStream(new File(directory, "launch.png"))) {
                        screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream);
                    }
                    screenshot.recycle();
                }
            }
        }
    }
}
