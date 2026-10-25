package com.ayutube.app;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(final Bundle savedInstanceState) {
        registerPlugin(AyuExtractorPlugin.class);
        registerPlugin(AyuPlayerPlugin.class);
        registerPlugin(AyuNativePlugin.class);

        // Registered before the player plugin's own handler, so that one still
        // wins while fullscreen or a menu is open. Otherwise Back walks through
        // the page history and, at the very start, sends the app to the
        // background instead of closing it (like YouTube).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null
                        && getBridge().getWebView() != null
                        && getBridge().getWebView().canGoBack()) {
                    getBridge().getWebView().goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });

        super.onCreate(savedInstanceState);
    }
}
