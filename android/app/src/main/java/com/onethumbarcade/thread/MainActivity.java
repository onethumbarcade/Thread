package com.onethumbarcade.thread;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MenuMusicPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
