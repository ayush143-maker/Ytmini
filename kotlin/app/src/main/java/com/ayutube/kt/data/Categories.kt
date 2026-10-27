package com.ayutube.kt.data

data class Suggestion(val id: String, val label: String, val query: String)

data class Category(
    val id: String,
    val label: String,
    val shortLabel: String,
    val group: String,
    val defaultQuery: String,
    val searchSuffix: String,
    val suggestions: List<Suggestion>
    )

/** The topics from the web app (categories.js), unchanged. */
object Categories {
    val all: List<Category> = listOf(
        Category(
            id = "oggy",
            label = "Oggy",
            shortLabel = "Cartoons",
            group = "fun",
            defaultQuery = "Oggy and the Cockroaches funny cartoon comedy episodes",
            searchSuffix = "funny cartoon comedy",
            suggestions = listOf(
            Suggestion("oggy-classics", "Oggy Classics", "Oggy and the Cockroaches classic funny episodes"),
            Suggestion("cartoon-comedy", "Cartoon Comedy", "funny slapstick comedy cartoons"),
            Suggestion("hindi-cartoons", "Hindi Cartoons", "funny comedy cartoons Hindi")
            )
        ),
        Category(
            id = "isi-prep",
            label = "ISI Prep",
            shortLabel = "Mathematics",
            group = "exam",
            defaultQuery = "ISI Admission Test mathematics previous year questions solutions B.Stat B.Math",
            searchSuffix = "ISI admission test mathematics problem solving",
            suggestions = listOf(
            Suggestion("isi-papers", "Previous Papers", "ISI Admission Test previous year question paper solutions"),
            Suggestion("isi-algebra", "Algebra", "ISI entrance mathematics algebra problem solving"),
            Suggestion("isi-number-theory", "Number Theory", "ISI admission test number theory combinatorics problems"),
            Suggestion("isi-probability", "Probability", "ISI entrance probability mathematics solved problems")
            )
        ),
        Category(
            id = "coding",
            label = "Coding",
            shortLabel = "Development",
            group = "skill",
            defaultQuery = "React Three.js Supabase full project tutorial build along",
            searchSuffix = "coding tutorial project build along",
            suggestions = listOf(
            Suggestion("react", "React Projects", "React complete project tutorial build along"),
            Suggestion("threejs", "Three.js", "Three.js creative web development project tutorial"),
            Suggestion("supabase", "Supabase", "Supabase authentication database project tutorial"),
            Suggestion("web-apps", "Build an App", "full stack web app build from scratch tutorial")
            )
        ),
        Category(
            id = "quant",
            label = "Quant",
            shortLabel = "Problem Solving",
            group = "skill",
            defaultQuery = "probability puzzles brain teasers quantitative aptitude interview questions",
            searchSuffix = "probability puzzles quantitative aptitude problem solving",
            suggestions = listOf(
            Suggestion("probability", "Probability", "probability problems explained with solutions"),
            Suggestion("brain-teasers", "Brain Teasers", "challenging brain teasers logical reasoning solutions"),
            Suggestion("quant-interviews", "Interview Questions", "quantitative interview puzzles with solutions"),
            Suggestion("math-puzzles", "Math Puzzles", "interesting mathematical puzzles explained")
            )
        ),
        Category(
            id = "facts",
            label = "Facts",
            shortLabel = "Explore",
            group = "fun",
            defaultQuery = "interesting facts science history geography general knowledge explained",
            searchSuffix = "facts explained science history geography",
            suggestions = listOf(
            Suggestion("science-facts", "Science", "interesting science facts explained"),
            Suggestion("history", "History", "fascinating historical events explained"),
            Suggestion("geography", "Geography", "interesting geography facts and explainers"),
            Suggestion("general-awareness", "General Awareness", "general awareness educational videos"),
            Suggestion("did-you-know", "Did You Know?", "did you know surprising facts explained")
            )
        ),
        Category(
            id = "jee",
            label = "JEE",
            shortLabel = "JEE",
            group = "exam",
            defaultQuery = "JEE Main Advanced physics chemistry maths lecture",
            searchSuffix = "JEE",
            suggestions = listOf(
            Suggestion("jee-maths", "JEE Maths", "JEE maths previous year questions solutions"),
            Suggestion("jee-physics", "JEE Physics", "JEE physics concepts and problem solving"),
            Suggestion("jee-chemistry", "JEE Chemistry", "JEE chemistry organic physical inorganic"),
            Suggestion("jee-strategy", "JEE Strategy", "how to prepare for JEE strategy")
            )
        ),
        Category(
            id = "neet",
            label = "NEET",
            shortLabel = "NEET",
            group = "exam",
            defaultQuery = "NEET preparation biology physics chemistry lecture",
            searchSuffix = "NEET",
            suggestions = listOf(
            Suggestion("neet-biology", "NEET Biology", "NEET biology NCERT line by line"),
            Suggestion("neet-physics", "NEET Physics", "NEET physics numericals practice"),
            Suggestion("neet-chemistry", "NEET Chemistry", "NEET chemistry revision"),
            Suggestion("neet-strategy", "NEET Strategy", "how to prepare for NEET strategy")
            )
        ),
        Category(
            id = "class-10",
            label = "Class 10",
            shortLabel = "Class 10",
            group = "exam",
            defaultQuery = "Class 10 CBSE board exam maths science lecture",
            searchSuffix = "Class 10",
            suggestions = listOf(
            Suggestion("c10-maths", "Class 10 Maths", "Class 10 maths chapter wise"),
            Suggestion("c10-science", "Class 10 Science", "Class 10 science chapter wise"),
            Suggestion("c10-tips", "Board Exam Tips", "Class 10 board exam preparation tips"),
            Suggestion("c10-sst", "Social Science", "Class 10 social science revision")
            )
        ),
        Category(
            id = "class-12",
            label = "Class 12",
            shortLabel = "Class 12",
            group = "exam",
            defaultQuery = "Class 12 board exam physics chemistry maths lecture",
            searchSuffix = "Class 12",
            suggestions = listOf(
            Suggestion("c12-physics", "Class 12 Physics", "Class 12 physics chapter wise"),
            Suggestion("c12-chemistry", "Class 12 Chemistry", "Class 12 chemistry chapter wise"),
            Suggestion("c12-maths", "Class 12 Maths", "Class 12 maths chapter wise"),
            Suggestion("c12-tips", "Board Exam Tips", "Class 12 board exam preparation tips")
            )
        ),
        Category(
            id = "olympiad",
            label = "Olympiad",
            shortLabel = "Olympiad",
            group = "exam",
            defaultQuery = "mathematics olympiad problems and solutions",
            searchSuffix = "olympiad",
            suggestions = listOf(
            Suggestion("olympiad-rmo", "RMO and INMO", "RMO INMO preparation"),
            Suggestion("olympiad-imo", "IMO Problems", "IMO problems explained"),
            Suggestion("olympiad-science", "Science Olympiad", "science olympiad preparation"),
            Suggestion("olympiad-nt", "Number Theory", "olympiad number theory")
            )
        ),
        Category(
            id = "physics",
            label = "Physics",
            shortLabel = "Physics",
            group = "subject",
            defaultQuery = "physics concepts explained simply",
            searchSuffix = "physics",
            suggestions = listOf(
            Suggestion("physics-mech", "Mechanics", "mechanics explained"),
            Suggestion("physics-em", "Electricity", "electricity and magnetism explained"),
            Suggestion("physics-modern", "Modern Physics", "modern physics explained"),
            Suggestion("physics-num", "Numericals", "physics numericals practice")
            )
        ),
        Category(
            id = "chemistry",
            label = "Chemistry",
            shortLabel = "Chemistry",
            group = "subject",
            defaultQuery = "chemistry concepts explained simply",
            searchSuffix = "chemistry",
            suggestions = listOf(
            Suggestion("chem-organic", "Organic Basics", "organic chemistry basics"),
            Suggestion("chem-periodic", "Periodic Table", "periodic table explained"),
            Suggestion("chem-bonding", "Bonding", "chemical bonding explained"),
            Suggestion("chem-num", "Numericals", "chemistry numericals practice")
            )
        ),
        Category(
            id = "maths",
            label = "Maths",
            shortLabel = "Maths",
            group = "subject",
            defaultQuery = "mathematics concepts explained simply",
            searchSuffix = "maths",
            suggestions = listOf(
            Suggestion("maths-algebra", "Algebra", "algebra explained"),
            Suggestion("maths-trig", "Trigonometry", "trigonometry explained"),
            Suggestion("maths-calculus", "Calculus", "calculus for beginners"),
            Suggestion("maths-geometry", "Geometry", "geometry problems explained")
            )
        ),
        Category(
            id = "biology",
            label = "Biology",
            shortLabel = "Biology",
            group = "subject",
            defaultQuery = "biology concepts explained simply",
            searchSuffix = "biology",
            suggestions = listOf(
            Suggestion("bio-physiology", "Human Body", "human physiology explained"),
            Suggestion("bio-genetics", "Genetics", "genetics explained"),
            Suggestion("bio-cell", "Cell Biology", "cell biology explained"),
            Suggestion("bio-plants", "Plants", "plant biology explained")
            )
        ),
        Category(
            id = "english",
            label = "English",
            shortLabel = "English",
            group = "subject",
            defaultQuery = "spoken English practice for students",
            searchSuffix = "English",
            suggestions = listOf(
            Suggestion("eng-grammar", "Grammar", "English grammar explained"),
            Suggestion("eng-vocab", "Vocabulary", "improve English vocabulary"),
            Suggestion("eng-speaking", "Speaking", "English speaking practice"),
            Suggestion("eng-writing", "Writing", "essay and letter writing")
            )
        ),
        Category(
            id = "chess",
            label = "Chess",
            shortLabel = "Chess",
            group = "skill",
            defaultQuery = "chess lessons for beginners",
            searchSuffix = "chess",
            suggestions = listOf(
            Suggestion("chess-openings", "Openings", "chess openings explained"),
            Suggestion("chess-tactics", "Tactics", "chess tactics puzzles"),
            Suggestion("chess-endgames", "Endgames", "chess endgames explained"),
            Suggestion("chess-games", "Famous Games", "famous chess games")
            )
        ),
        Category(
            id = "space",
            label = "Space",
            shortLabel = "Space",
            group = "fun",
            defaultQuery = "space and astronomy explained",
            searchSuffix = "space",
            suggestions = listOf(
            Suggestion("space-blackholes", "Black Holes", "black holes explained"),
            Suggestion("space-solar", "Solar System", "solar system explained"),
            Suggestion("space-isro", "ISRO Missions", "ISRO missions explained"),
            Suggestion("space-telescopes", "Telescopes", "how telescopes work")
            )
        ),
        Category(
            id = "experiments",
            label = "Experiments",
            shortLabel = "Experiments",
            group = "fun",
            defaultQuery = "easy science experiments for students",
            searchSuffix = "science experiments",
            suggestions = listOf(
            Suggestion("exp-physics", "Physics at Home", "physics experiments at home"),
            Suggestion("exp-chem", "Chemistry", "chemistry experiments for students"),
            Suggestion("exp-projects", "Project Ideas", "science projects ideas"),
            Suggestion("exp-how", "How It Works", "how things work explained")
            )
        ),
        Category(
            id = "music",
            label = "Music",
            shortLabel = "Music",
            group = "fun",
            defaultQuery = "popular songs music videos",
            searchSuffix = "music",
            suggestions = listOf(
            Suggestion("music-lofi", "Lofi Beats", "lofi beats to relax"),
            Suggestion("music-bollywood", "Bollywood Hits", "latest Bollywood songs"),
            Suggestion("music-guitar", "Guitar Lessons", "guitar lessons for beginners"),
            Suggestion("music-piano", "Piano Tutorials", "easy piano tutorials")
            )
        ),
        Category(
            id = "games",
            label = "Games",
            shortLabel = "Games",
            group = "fun",
            defaultQuery = "popular video games gameplay",
            searchSuffix = "games",
            suggestions = listOf(
            Suggestion("games-mobile", "Mobile Games", "best mobile games"),
            Suggestion("games-minecraft", "Minecraft", "Minecraft gameplay"),
            Suggestion("games-reviews", "Game Reviews", "video game reviews"),
            Suggestion("games-tips", "Tips and Tricks", "gaming tips and tricks")
            )
        ),
        Category(
            id = "fun",
            label = "Fun",
            shortLabel = "Fun",
            group = "fun",
            defaultQuery = "funny clips and comedy sketches",
            searchSuffix = "fun",
            suggestions = listOf(
            Suggestion("fun-animals", "Funny Animals", "funny animals compilation"),
            Suggestion("fun-magic", "Magic Tricks", "magic tricks explained"),
            Suggestion("fun-illusions", "Optical Illusions", "optical illusions explained"),
            Suggestion("fun-sketches", "Comedy Sketches", "clean comedy sketches")
            )
        )
    )

    val defaultIds: List<String> = listOf("music", "games", "fun")

    fun byId(id: String): Category? = all.firstOrNull { it.id == id }
}
