package com.ayutube.kt.ui.account

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import com.ayutube.kt.ui.components.AyIcons
import com.ayutube.kt.ui.components.SlitSwitchRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ayutube.kt.AyuApp
import com.ayutube.kt.data.Study
import com.ayutube.kt.ui.components.AyButton
import com.ayutube.kt.ui.components.AyChip
import com.ayutube.kt.ui.components.AyField
import com.ayutube.kt.ui.components.Panel
import com.ayutube.kt.ui.components.PanelTitle
import com.ayutube.kt.ui.components.SwitchRow
import com.ayutube.kt.ui.theme.Ay
import java.time.LocalDate

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StudyPanel() {
    val container = remember { AyuApp.container }
    val settings by container.settings.settings.collectAsStateWithLifecycle()
    val profile by container.settings.profile.collectAsStateWithLifecycle()

    var examId by remember(profile) {
        mutableStateOf(
            Study.exams.firstOrNull { it.label == profile.examName }?.id
                ?: if (profile.examName != null) "other" else ""
        )
    }
    var examName by remember(profile) { mutableStateOf(profile.examName.orEmpty()) }
    var date by remember(profile) { mutableStateOf(profile.examDate.orEmpty()) }
    var subjects by remember(profile) { mutableStateOf(profile.subjects.toSet()) }
    var custom by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }

    @Composable
    fun label(text: String) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 16.dp, bottom = 8.dp))
    }

    Column(Modifier.fillMaxWidth()) {
        SlitSwitchRow(
            AyIcons.Library,
            "Study mode",
            "Exam videos, a countdown on Home and notes while you watch.",
            settings.studyMode
        ) { on ->
            container.settings.update { it.copy(studyMode = on) }
        }

        if (settings.studyMode) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
            label("Your exam")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (exam in Study.exams) {
                    AyChip(exam.label, examId == exam.id) {
                        examId = exam.id
                        examName = exam.label
                        date = Study.predict(exam).toString()
                        message = null
                    }
                }

                AyChip("Other", examId == "other") {
                    examId = "other"
                    examName = ""
                    message = null
                }
            }

            if (examId == "other") {
                Row(Modifier.padding(top = 10.dp)) { AyField(examName, { examName = it }, "Exam name, for example SSC CGL") }
            }

            if (examId.isNotEmpty()) {
                Row(Modifier.padding(top = 10.dp)) { AyField(date, { date = it; message = null }, "Exam date (YYYY-MM-DD)") }

                val days = Study.daysUntil(date)

                Text(
                    if (days != null && days >= 0) "$days days from today. Predicted from the usual schedule, change it if the official date differs."
                    else "Predicted from the usual schedule. Use the format YYYY-MM-DD.",
                    color = Ay.Dim,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }

            label("Subjects you want videos for")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (subject in (Study.subjects + subjects).distinct()) {
                    AyChip(subject, subject in subjects) {
                        subjects = when {
                            subject in subjects -> subjects - subject
                            subjects.size >= Study.MAX_SUBJECTS -> {
                                message = "Choose up to ${Study.MAX_SUBJECTS} subjects."
                                subjects
                            }
                            else -> subjects + subject
                        }
                    }
                }
            }

            Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f).padding(end = 8.dp)) { AyField(custom, { custom = it }, "Add your own subject") }
                AyButton("Add", onClick = {
                    val value = custom.trim().replace(Regex("\\s+"), " ").take(40)

                    if (value.isNotEmpty()) {
                        if (subjects.size >= Study.MAX_SUBJECTS && value !in subjects) {
                            message = "Choose up to ${Study.MAX_SUBJECTS} subjects."
                        } else {
                            subjects = subjects + value
                            custom = ""
                        }
                    }
                })
            }

            Row(Modifier.padding(top = 16.dp)) {
                AyButton("Save study setup", primary = true, onClick = {
                    val valid = examId.isEmpty() || runCatching { LocalDate.parse(date) }.isSuccess

                    if (!valid) {
                        message = "Use the date format YYYY-MM-DD."
                    } else {
                        container.settings.updateProfile {
                            it.copy(
                                examName = if (examId.isEmpty()) null else examName.trim().ifEmpty { null },
                                examDate = if (examId.isEmpty()) null else date,
                                subjects = subjects.toList()
                            )
                        }
                        message = "Saved."
                    }
                })
            }

            message?.let { Text(it, color = Ay.Bone, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp)) }
            }
        }
    }
}
