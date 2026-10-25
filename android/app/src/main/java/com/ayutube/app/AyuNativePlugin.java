/*
 * AyuTube - small native helpers (sharing backup files).
 *
 * Copyright (C) AyuTube contributors
 * Licensed under the GNU General Public License v3.0 (see LICENSE).
 */
package com.ayutube.app;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "AyuNative")
public class AyuNativePlugin extends Plugin {
    /** Writes text to a cache file and opens Android's share sheet for it. */
    @PluginMethod
    public void shareFile(final PluginCall call) {
        final String text = call.getString("text", "");
        final String mimeType = call.getString("mimeType", "application/json");
        String filename = call.getString("filename", "ayutube-backup.json");

        // Keep only a plain file name so nothing can escape the cache folder.
        filename = new File(filename).getName();

        if (filename.isEmpty()) {
            filename = "ayutube-backup.json";
        }

        try {
            final File directory = new File(getContext().getCacheDir(), "exports");

            if (!directory.exists() && !directory.mkdirs()) {
                call.reject("Could not prepare the export folder.");
                return;
            }

            final File file = new File(directory, filename);

            try (FileOutputStream stream = new FileOutputStream(file)) {
                stream.write(text.getBytes(StandardCharsets.UTF_8));
            }

            final Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file);

            final Intent send = new Intent(Intent.ACTION_SEND);

            send.setType(mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            final Intent chooser = Intent.createChooser(send, "Save backup");

            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (final Exception error) {
            call.reject(String.valueOf(error.getMessage()));
        }
    }
}
