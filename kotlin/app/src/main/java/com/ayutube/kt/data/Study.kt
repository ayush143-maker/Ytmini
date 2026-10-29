package com.ayutube.kt.data

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Exams the app knows, with the usual time of year of their next sitting. */
object Study {
    class Exam(val id: String, val label: String, val on: (Int) -> LocalDate)

    private fun nthSunday(year: Int, month: Int, n: Int): LocalDate {
        val first = LocalDate.of(year, month, 1)
        val offset = (7 - first.dayOfWeek.value % 7) % 7

        return first.plusDays((offset + (n - 1) * 7).toLong())
    }

    // Predictions from the usual schedule, not official dates.
    val exams: List<Exam> = listOf(
        Exam("cuet", "CUET") { LocalDate.of(it, 5, 15) },
        Exam("neet", "NEET") { nthSunday(it, 5, 1) },
        Exam("jee-main", "JEE Main") { LocalDate.of(it, 1, 22) },
        Exam("jee-advanced", "JEE Advanced") { nthSunday(it, 5, 3) },
        Exam("boards-12", "Class 12 Boards") { LocalDate.of(it, 2, 15) },
        Exam("boards-10", "Class 10 Boards") { LocalDate.of(it, 2, 15) }
    )

    val subjects: List<String> = listOf(
        "Physics", "Chemistry", "Mathematics", "Biology", "English", "General Test",
        "Reasoning", "Current affairs", "Economics", "Accountancy", "Computer science"
    )

    const val MAX_SUBJECTS = 8

    /** The next date on or after today that matches the exam's usual timing. */
    fun predict(exam: Exam, today: LocalDate = LocalDate.now()): LocalDate {
        for (year in today.year..today.year + 1) {
            val date = exam.on(year)

            if (!date.isBefore(today)) return date
        }

        return exam.on(today.year + 1)
    }

    fun daysUntil(isoDate: String?): Long? = try {
        if (isoDate.isNullOrBlank()) null else ChronoUnit.DAYS.between(LocalDate.now(), LocalDate.parse(isoDate))
    } catch (_: Exception) {
        null
    }
}
