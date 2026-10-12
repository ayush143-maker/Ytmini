
(() => {
  "use strict";

  const MAX_QUERY_LENGTH = 120;

  /**
   * All content categories are defined in one place.
   * Keep this module independent of the DOM, Supabase and API requests.
   */
  const DEFINITIONS = [
    {
      id: "oggy",
      label: "Oggy",
      shortLabel: "Cartoons",
      icon: "clapperboard",
      description:
        "Oggy and the Cockroaches, slapstick comedy and similar cartoons.",
      defaultQuery:
        "Oggy and the Cockroaches funny cartoon comedy episodes",
      searchSuffix: "funny cartoon comedy",
      suggestions: [
        {
          id: "oggy-classics",
          label: "Oggy Classics",
          query: "Oggy and the Cockroaches classic funny episodes"
        },
        {
          id: "cartoon-comedy",
          label: "Cartoon Comedy",
          query: "funny slapstick comedy cartoons"
        },
        {
          id: "hindi-cartoons",
          label: "Hindi Cartoons",
          query: "funny comedy cartoons Hindi"
        }
      ]
    },

    {
      id: "isi-prep",
      label: "ISI Prep",
      shortLabel: "Mathematics",
      icon: "graduation-cap",
      description:
        "Mathematics, challenging problem solving and ISI entrance preparation.",
      defaultQuery:
        "ISI Admission Test mathematics previous year questions solutions B.Stat B.Math",
      searchSuffix:
        "ISI admission test mathematics problem solving",
      suggestions: [
        {
          id: "isi-papers",
          label: "Previous Papers",
          query: "ISI Admission Test previous year question paper solutions"
        },
        {
          id: "isi-algebra",
          label: "Algebra",
          query: "ISI entrance mathematics algebra problem solving"
        },
        {
          id: "isi-number-theory",
          label: "Number Theory",
          query: "ISI admission test number theory combinatorics problems"
        },
        {
          id: "isi-probability",
          label: "Probability",
          query: "ISI entrance probability mathematics solved problems"
        }
      ]
    },

    {
      id: "coding",
      label: "Coding",
      shortLabel: "Development",
      icon: "code-2",
      description:
        "React, Three.js, Supabase and practical build-along projects.",
      defaultQuery:
        "React Three.js Supabase full project tutorial build along",
      searchSuffix: "coding tutorial project build along",
      suggestions: [
        {
          id: "react",
          label: "React Projects",
          query: "React complete project tutorial build along"
        },
        {
          id: "threejs",
          label: "Three.js",
          query: "Three.js creative web development project tutorial"
        },
        {
          id: "supabase",
          label: "Supabase",
          query: "Supabase authentication database project tutorial"
        },
        {
          id: "web-apps",
          label: "Build an App",
          query: "full stack web app build from scratch tutorial"
        }
      ]
    },

    {
      id: "quant",
      label: "Quant",
      shortLabel: "Problem Solving",
      icon: "brain",
      description:
        "Probability, puzzles, brain teasers and quantitative interview questions.",
      defaultQuery:
        "probability puzzles brain teasers quantitative aptitude interview questions",
      searchSuffix:
        "probability puzzles quantitative aptitude problem solving",
      suggestions: [
        {
          id: "probability",
          label: "Probability",
          query: "probability problems explained with solutions"
        },
        {
          id: "brain-teasers",
          label: "Brain Teasers",
          query: "challenging brain teasers logical reasoning solutions"
        },
        {
          id: "quant-interviews",
          label: "Interview Questions",
          query: "quantitative interview puzzles with solutions"
        },
        {
          id: "math-puzzles",
          label: "Math Puzzles",
          query: "interesting mathematical puzzles explained"
        }
      ]
    },

    {
      id: "facts",
      label: "Facts",
      shortLabel: "Explore",
      icon: "globe",
      description:
        "General awareness, history, science, geography and fascinating explainers.",
      defaultQuery:
        "interesting facts science history geography general knowledge explained",
      searchSuffix:
        "facts explained science history geography",
      suggestions: [
        {
          id: "science-facts",
          label: "Science",
          query: "interesting science facts explained"
        },
        {
          id: "history",
          label: "History",
          query: "fascinating historical events explained"
        },
        {
          id: "geography",
          label: "Geography",
          query: "interesting geography facts and explainers"
        },
        {
          id: "general-awareness",
          label: "General Awareness",
          query: "general awareness educational videos"
        },
        {
          id: "did-you-know",
          label: "Did You Know?",
          query: "did you know surprising facts explained"
        }
      ]
    },
    {
      id: "jee",
      label: "JEE",
      shortLabel: "JEE",
      icon: "jee",
      group: "exam",
      description: "JEE Main and Advanced lectures, problems and strategy.",
      defaultQuery: "JEE Main Advanced physics chemistry maths lecture",
      searchSuffix: "JEE",
      suggestions: [
        {
          id: "jee-maths",
          label: "JEE Maths",
          query: "JEE maths previous year questions solutions"
        },
        {
          id: "jee-physics",
          label: "JEE Physics",
          query: "JEE physics concepts and problem solving"
        },
        {
          id: "jee-chemistry",
          label: "JEE Chemistry",
          query: "JEE chemistry organic physical inorganic"
        },
        {
          id: "jee-strategy",
          label: "JEE Strategy",
          query: "how to prepare for JEE strategy"
        }
      ]
    },
    {
      id: "neet",
      label: "NEET",
      shortLabel: "NEET",
      icon: "neet",
      group: "exam",
      description: "NEET biology, physics and chemistry lectures and strategy.",
      defaultQuery: "NEET preparation biology physics chemistry lecture",
      searchSuffix: "NEET",
      suggestions: [
        {
          id: "neet-biology",
          label: "NEET Biology",
          query: "NEET biology NCERT line by line"
        },
        {
          id: "neet-physics",
          label: "NEET Physics",
          query: "NEET physics numericals practice"
        },
        {
          id: "neet-chemistry",
          label: "NEET Chemistry",
          query: "NEET chemistry revision"
        },
        {
          id: "neet-strategy",
          label: "NEET Strategy",
          query: "how to prepare for NEET strategy"
        }
      ]
    },
    {
      id: "class-10",
      label: "Class 10",
      shortLabel: "Class 10",
      icon: "class-10",
      group: "exam",
      description: "Class 10 board exam lessons and revision.",
      defaultQuery: "Class 10 CBSE board exam maths science lecture",
      searchSuffix: "Class 10",
      suggestions: [
        {
          id: "c10-maths",
          label: "Class 10 Maths",
          query: "Class 10 maths chapter wise"
        },
        {
          id: "c10-science",
          label: "Class 10 Science",
          query: "Class 10 science chapter wise"
        },
        {
          id: "c10-tips",
          label: "Board Exam Tips",
          query: "Class 10 board exam preparation tips"
        },
        {
          id: "c10-sst",
          label: "Social Science",
          query: "Class 10 social science revision"
        }
      ]
    },
    {
      id: "class-12",
      label: "Class 12",
      shortLabel: "Class 12",
      icon: "class-12",
      group: "exam",
      description: "Class 12 board exam lessons and revision.",
      defaultQuery: "Class 12 board exam physics chemistry maths lecture",
      searchSuffix: "Class 12",
      suggestions: [
        {
          id: "c12-physics",
          label: "Class 12 Physics",
          query: "Class 12 physics chapter wise"
        },
        {
          id: "c12-chemistry",
          label: "Class 12 Chemistry",
          query: "Class 12 chemistry chapter wise"
        },
        {
          id: "c12-maths",
          label: "Class 12 Maths",
          query: "Class 12 maths chapter wise"
        },
        {
          id: "c12-tips",
          label: "Board Exam Tips",
          query: "Class 12 board exam preparation tips"
        }
      ]
    },
    {
      id: "olympiad",
      label: "Olympiad",
      shortLabel: "Olympiad",
      icon: "olympiad",
      group: "exam",
      description: "Maths and science olympiad problems and preparation.",
      defaultQuery: "mathematics olympiad problems and solutions",
      searchSuffix: "olympiad",
      suggestions: [
        {
          id: "olympiad-rmo",
          label: "RMO and INMO",
          query: "RMO INMO preparation"
        },
        {
          id: "olympiad-imo",
          label: "IMO Problems",
          query: "IMO problems explained"
        },
        {
          id: "olympiad-science",
          label: "Science Olympiad",
          query: "science olympiad preparation"
        },
        {
          id: "olympiad-nt",
          label: "Number Theory",
          query: "olympiad number theory"
        }
      ]
    },
    {
      id: "physics",
      label: "Physics",
      shortLabel: "Physics",
      icon: "physics",
      group: "subject",
      description: "Physics concepts explained simply.",
      defaultQuery: "physics concepts explained simply",
      searchSuffix: "physics",
      suggestions: [
        {
          id: "physics-mech",
          label: "Mechanics",
          query: "mechanics explained"
        },
        {
          id: "physics-em",
          label: "Electricity",
          query: "electricity and magnetism explained"
        },
        {
          id: "physics-modern",
          label: "Modern Physics",
          query: "modern physics explained"
        },
        {
          id: "physics-num",
          label: "Numericals",
          query: "physics numericals practice"
        }
      ]
    },
    {
      id: "chemistry",
      label: "Chemistry",
      shortLabel: "Chemistry",
      icon: "chemistry",
      group: "subject",
      description: "Chemistry concepts explained simply.",
      defaultQuery: "chemistry concepts explained simply",
      searchSuffix: "chemistry",
      suggestions: [
        {
          id: "chem-organic",
          label: "Organic Basics",
          query: "organic chemistry basics"
        },
        {
          id: "chem-periodic",
          label: "Periodic Table",
          query: "periodic table explained"
        },
        {
          id: "chem-bonding",
          label: "Bonding",
          query: "chemical bonding explained"
        },
        {
          id: "chem-num",
          label: "Numericals",
          query: "chemistry numericals practice"
        }
      ]
    },
    {
      id: "maths",
      label: "Maths",
      shortLabel: "Maths",
      icon: "maths",
      group: "subject",
      description: "Mathematics concepts explained simply.",
      defaultQuery: "mathematics concepts explained simply",
      searchSuffix: "maths",
      suggestions: [
        {
          id: "maths-algebra",
          label: "Algebra",
          query: "algebra explained"
        },
        {
          id: "maths-trig",
          label: "Trigonometry",
          query: "trigonometry explained"
        },
        {
          id: "maths-calculus",
          label: "Calculus",
          query: "calculus for beginners"
        },
        {
          id: "maths-geometry",
          label: "Geometry",
          query: "geometry problems explained"
        }
      ]
    },
    {
      id: "biology",
      label: "Biology",
      shortLabel: "Biology",
      icon: "biology",
      group: "subject",
      description: "Biology concepts explained simply.",
      defaultQuery: "biology concepts explained simply",
      searchSuffix: "biology",
      suggestions: [
        {
          id: "bio-physiology",
          label: "Human Body",
          query: "human physiology explained"
        },
        {
          id: "bio-genetics",
          label: "Genetics",
          query: "genetics explained"
        },
        {
          id: "bio-cell",
          label: "Cell Biology",
          query: "cell biology explained"
        },
        {
          id: "bio-plants",
          label: "Plants",
          query: "plant biology explained"
        }
      ]
    },
    {
      id: "english",
      label: "English",
      shortLabel: "English",
      icon: "english",
      group: "subject",
      description: "Spoken English, grammar and writing.",
      defaultQuery: "spoken English practice for students",
      searchSuffix: "English",
      suggestions: [
        {
          id: "eng-grammar",
          label: "Grammar",
          query: "English grammar explained"
        },
        {
          id: "eng-vocab",
          label: "Vocabulary",
          query: "improve English vocabulary"
        },
        {
          id: "eng-speaking",
          label: "Speaking",
          query: "English speaking practice"
        },
        {
          id: "eng-writing",
          label: "Writing",
          query: "essay and letter writing"
        }
      ]
    },
    {
      id: "chess",
      label: "Chess",
      shortLabel: "Chess",
      icon: "chess",
      group: "skill",
      description: "Chess lessons, tactics and famous games.",
      defaultQuery: "chess lessons for beginners",
      searchSuffix: "chess",
      suggestions: [
        {
          id: "chess-openings",
          label: "Openings",
          query: "chess openings explained"
        },
        {
          id: "chess-tactics",
          label: "Tactics",
          query: "chess tactics puzzles"
        },
        {
          id: "chess-endgames",
          label: "Endgames",
          query: "chess endgames explained"
        },
        {
          id: "chess-games",
          label: "Famous Games",
          query: "famous chess games"
        }
      ]
    },
    {
      id: "space",
      label: "Space",
      shortLabel: "Space",
      icon: "space",
      group: "fun",
      description: "Astronomy, space missions and the universe.",
      defaultQuery: "space and astronomy explained",
      searchSuffix: "space",
      suggestions: [
        {
          id: "space-blackholes",
          label: "Black Holes",
          query: "black holes explained"
        },
        {
          id: "space-solar",
          label: "Solar System",
          query: "solar system explained"
        },
        {
          id: "space-isro",
          label: "ISRO Missions",
          query: "ISRO missions explained"
        },
        {
          id: "space-telescopes",
          label: "Telescopes",
          query: "how telescopes work"
        }
      ]
    },
    {
      id: "experiments",
      label: "Experiments",
      shortLabel: "Experiments",
      icon: "experiments",
      group: "fun",
      description: "Safe, simple science experiments and projects.",
      defaultQuery: "easy science experiments for students",
      searchSuffix: "science experiments",
      suggestions: [
        {
          id: "exp-physics",
          label: "Physics at Home",
          query: "physics experiments at home"
        },
        {
          id: "exp-chem",
          label: "Chemistry",
          query: "chemistry experiments for students"
        },
        {
          id: "exp-projects",
          label: "Project Ideas",
          query: "science projects ideas"
        },
        {
          id: "exp-how",
          label: "How It Works",
          query: "how things work explained"
        }
      ]
    }
  ];

  // Freeze category records and nested suggestions to prevent
  // accidental mutation by other application modules.
  // The original five are what a visitor without interests sees.
  const DEFAULT_IDS = Object.freeze(["oggy", "isi-prep", "coding", "quant", "facts"]);

  const LEGACY_GROUPS = Object.freeze({
    oggy: "fun",
    "isi-prep": "exam",
    coding: "skill",
    quant: "skill",
    facts: "fun"
  });

  const GROUPS = Object.freeze([
    { id: "exam", label: "Exams" },
    { id: "subject", label: "Subjects" },
    { id: "skill", label: "Skills" },
    { id: "fun", label: "For fun" }
  ]);

  function freezeCategory(category) {
    const suggestions = category.suggestions.map((suggestion) =>
      Object.freeze({ ...suggestion })
    );

    return Object.freeze({
      ...category,
      group: category.group || LEGACY_GROUPS[category.id] || "fun",
      suggestions: Object.freeze(suggestions)
    });
  }

  const CATEGORIES = Object.freeze(
    DEFINITIONS.map(freezeCategory)
  );

  const CATEGORY_BY_ID = Object.freeze(
    Object.fromEntries(
      CATEGORIES.map((category) => [category.id, category])
    )
  );

  function normalizeCategoryId(value) {
    return typeof value === "string"
      ? value.trim().toLowerCase()
      : "";
  }

  function normalizeTopic(value) {
    if (typeof value !== "string") {
      throw new TypeError("Search topic must be text.");
    }

    const topic = value.trim();

    if (!topic) {
      return "";
    }

    if (topic.length > MAX_QUERY_LENGTH) {
      throw new Error(
        `Search topics must be ${MAX_QUERY_LENGTH} characters or fewer.`
      );
    }

    return topic.replace(/\s+/g, " ");
  }

  /**
   * Return a fresh array while preserving immutable category records.
   */
  function getAll() {
    return [...CATEGORIES];
  }

  /**
   * Find a category by its stable ID.
   * Returns null when the category does not exist.
   */
  /** The categories a visitor without chosen interests sees. */
  function getDefaults() {
    return DEFAULT_IDS.map((id) => CATEGORY_BY_ID[id]).filter(Boolean);
  }

  /** Section headings for the interests picker, in display order. */
  function getGroups() {
    return GROUPS.map((group) => ({ ...group }));
  }

  function getById(id) {
    return CATEGORY_BY_ID[normalizeCategoryId(id)] || null;
  }

  /**
   * Return the default video search for a category.
   */
  function getDefaultQuery(id) {
    const category = getById(id);
    return category ? category.defaultQuery : null;
  }

  /**
   * Build a search query for a selected category.
   * A custom topic inherits relevant category context.
   */
  function buildSearchQuery(id, topic = "") {
    const category = getById(id);

    if (!category) {
      throw new Error("Please select a valid category.");
    }

    const normalizedTopic = normalizeTopic(topic);

    if (!normalizedTopic) {
      return category.defaultQuery;
    }

    // Preserve useful context without duplicating the topic itself.
    return `${normalizedTopic} ${category.searchSuffix}`.trim();
  }

  /**
   * Suggested searches for category landing sections.
   */
  function getSuggestions(id) {
    const category = getById(id);

    return category ? [...category.suggestions] : [];
  }

  /**
   * Resolve a category ID for navigation or selected-state handling.
   */
  function exists(id) {
    return Boolean(getById(id));
  }

  /**
   * Expose a small, read-only public API.
   */
  window.AyuTubeCategories = Object.freeze({
    getAll,
    getDefaults,
    getGroups,
    getById,
    getDefaultQuery,
    buildSearchQuery,
    getSuggestions,
    exists
  });
})();
