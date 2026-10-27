package com.ayutube.kt.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject

data class Settings(
    val pauseHistory: Boolean = false,
    val autoplayNext: Boolean = true,
    val cleanControls: Boolean = false,
    val studyMode: Boolean = false
)

/** What the person told the app about themselves (kept on the phone). */
data class Profile(
    val interests: List<String> = emptyList(),
    val examName: String? = null,
    val examDate: String? = null,
    val subjects: List<String> = emptyList(),
    val onboardedAt: String? = null
)

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("ayutube", Context.MODE_PRIVATE)

    private val _settings = MutableStateFlow(
        Settings(
            pauseHistory = prefs.getBoolean("pauseHistory", false),
            autoplayNext = prefs.getBoolean("autoplayNext", true),
            cleanControls = prefs.getBoolean("cleanControls", false),
            studyMode = prefs.getBoolean("studyMode", false)
        )
    )
    val settings: StateFlow<Settings> = _settings

    private val _profile = MutableStateFlow(readProfile())
    val profile: StateFlow<Profile> = _profile

    fun update(change: (Settings) -> Settings) {
        val next = change(_settings.value)

        prefs.edit()
            .putBoolean("pauseHistory", next.pauseHistory)
            .putBoolean("autoplayNext", next.autoplayNext)
            .putBoolean("cleanControls", next.cleanControls)
            .putBoolean("studyMode", next.studyMode)
            .apply()
        _settings.value = next
    }

    fun updateProfile(change: (Profile) -> Profile) {
        val next = change(_profile.value)

        prefs.edit().putString("profile", profileToJson(next).toString()).apply()
        _profile.value = next
    }

    private fun readProfile(): Profile {
        val raw = prefs.getString("profile", null) ?: return Profile()

        return try {
            profileFromJson(JSONObject(raw))
        } catch (_: Exception) {
            Profile()
        }
    }

    companion object {
        fun profileToJson(profile: Profile): JSONObject = JSONObject()
            .put("interests", JSONArray(profile.interests))
            .put("exam_name", profile.examName ?: JSONObject.NULL)
            .put("exam_date", profile.examDate ?: JSONObject.NULL)
            .put("subjects", JSONArray(profile.subjects))
            .put("onboarded_at", profile.onboardedAt ?: JSONObject.NULL)

        fun profileFromJson(json: JSONObject): Profile {
            fun strings(key: String): List<String> {
                val array = json.optJSONArray(key) ?: return emptyList()

                return (0 until array.length()).mapNotNull { array.optString(it).takeIf { s -> s.isNotBlank() } }
            }

            fun text(key: String): String? =
                if (json.isNull(key)) null else json.optString(key).takeIf { it.isNotBlank() }

            return Profile(
                interests = strings("interests"),
                examName = text("exam_name"),
                examDate = text("exam_date"),
                subjects = strings("subjects"),
                onboardedAt = text("onboarded_at")
            )
        }
    }
}
