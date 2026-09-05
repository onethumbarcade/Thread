package com.onethumbarcade.thread;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class LaunchTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("WebView did not respond", done.await(5, TimeUnit.SECONDS));
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

    @Test
    public void bundledTitleMenuOpensAndRespondsOffline() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                awaitReady(scenario, "!!(window.ThreadNative?.isNative && window.ThreadStorage && " +
                    "window.ThreadAppBack && document.querySelector('#home.active'))");
                assertEquals("\"https://localhost/update-2-preview.html\"", evaluate(scenario, "location.href"));
                assertEquals("false", evaluate(scenario, "!!document.querySelector('.native-start-error')"));
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
