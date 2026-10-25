/*
 * AyuTube - HTTP bridge for NewPipeExtractor.
 *
 * Copyright (C) AyuTube contributors
 * Licensed under the GNU General Public License v3.0 (see LICENSE).
 * Modelled on the Downloader implementations used by NewPipe and LibreTube.
 */
package com.ayutube.app;

import androidx.annotation.NonNull;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.RequestBody;
import okhttp3.ResponseBody;

import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;

public final class ExtractorDownloader extends Downloader {
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

    private static ExtractorDownloader instance;

    private final OkHttpClient client;

    private ExtractorDownloader() {
        this.client = new OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build();
    }

    public static synchronized ExtractorDownloader get() {
        if (instance == null) {
            instance = new ExtractorDownloader();
        }
        return instance;
    }

    @Override
    public Response execute(@NonNull final Request request) throws IOException, ReCaptchaException {
        final String httpMethod = request.httpMethod();
        final String url = request.url();
        final Map<String, List<String>> headers = request.headers();
        final byte[] dataToSend = request.dataToSend();

        RequestBody requestBody = null;
        if (dataToSend != null) {
            requestBody = RequestBody.create(dataToSend, (MediaType) null);
        }

        final okhttp3.Request.Builder builder = new okhttp3.Request.Builder()
                .method(httpMethod, requestBody)
                .url(url)
                .addHeader("User-Agent", USER_AGENT);

        for (final Map.Entry<String, List<String>> entry : headers.entrySet()) {
            final String name = entry.getKey();
            final List<String> values = entry.getValue();

            builder.removeHeader(name);

            if (values != null) {
                for (final String value : values) {
                    builder.addHeader(name, value);
                }
            }
        }

        try (okhttp3.Response response = client.newCall(builder.build()).execute()) {
            if (response.code() == 429) {
                throw new ReCaptchaException("reCaptcha Challenge requested", url);
            }

            final ResponseBody body = response.body();
            final String text = body != null ? body.string() : null;

            return new Response(
                    response.code(),
                    response.message(),
                    response.headers().toMultimap(),
                    text,
                    response.request().url().toString());
        }
    }
}
