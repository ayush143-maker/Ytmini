package com.ayutube.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class VideoItemTest {
    @Test fun durationLabelsAreStable() {
        assertEquals("1:30", video(90).durationLabel)
        assertEquals("59:59", video(3599).durationLabel)
        assertEquals("1:00:05", video(3605).durationLabel)
        assertEquals("Duration unavailable", video(0).durationLabel)
    }

    @Test fun viewCountLabelsHandleCommonRanges() {
        assertEquals("999 views", video(1).copy(views = 999).viewsLabel)
        assertEquals("1.0K views", video(1).copy(views = 1_000).viewsLabel)
        assertEquals("2.0M views", video(1).copy(views = 2_000_000).viewsLabel)
        assertEquals("", video(1).copy(views = -1).viewsLabel)
    }

    private fun video(seconds: Long) = VideoItem(
        id = "abcdef12345", title = "test", url = "https://www.youtube.com/watch?v=abcdef12345",
        durationSeconds = seconds
    )
}
