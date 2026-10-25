package com.ayutube.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(final Bundle savedInstanceState) {
        registerPlugin(AyuExtractorPlugin.class);
        registerPlugin(AyuPlayerPlugin.class);
        registerPlugin(AyuNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
