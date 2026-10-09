
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
    }
  ];

  // Freeze category records and nested suggestions to prevent
  // accidental mutation by other application modules.
  function freezeCategory(category) {
    const suggestions = category.suggestions.map((suggestion) =>
      Object.freeze({ ...suggestion })
    );

    return Object.freeze({
      ...category,
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
    getById,
    getDefaultQuery,
    buildSearchQuery,
    getSuggestions,
    exists
  });
})();
