/**
 * Music Recommendation Workshop App
 * Content-based filtering with weighted feature similarity
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const STATE_KEY = "rh2025_ratings";

const DEFAULT_WEIGHTS = {
  tempo: 0.2,
  energy: 0.3,
  danceability: 0.3,
  valence: 0.2,
};

let state = {
  ratings: {}, // songId -> rating (1-5)
  currentSongId: null,
  weights: { ...DEFAULT_WEIGHTS },
  similarityMode: "abs-diff", // 'abs-diff' or 'cosine'
  genreBonus: 0.2,
  debugVisible: false,
  seed: 42,
  rng: null,
};

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

/**
 * Mulberry32 PRNG - simple, fast seeded random number generator
 * @param {number} seed - Integer seed
 * @returns {function} Returns random number generator function [0, 1)
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle array using seeded RNG (Fisher-Yates)
 * @param {Array} array - Array to shuffle
 * @param {function} rng - Random number generator
 * @returns {Array} Shuffled array
 */
function shuffle(array, rng) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================================
// DATA PROCESSING
// ============================================================================

/**
 * Compute dataset-wide averages for cold start
 * @param {Array} songs - Array of song objects
 * @returns {Object} Average features {tempoN, energy, danceability, valence}
 */
function computeDatasetAverages(songs) {
  if (!songs || songs.length === 0) {
    return { tempoN: 0.5, energy: 0.5, danceability: 0.5, valence: 0.5 };
  }

  // Group by genre to avoid skew from uneven counts
  const byGenre = songs.reduce((map, s) => {
    const g = s.genre || "Unknown";
    if (!map[g]) map[g] = [];
    map[g].push(s);
    return map;
  }, {});

  const genres = Object.keys(byGenre);

  // Compute per-genre means
  const perGenreMeans = genres.map((g) => {
    const arr = byGenre[g];
    const n = arr.length;
    const sums = arr.reduce(
      (acc, s) => {
        acc.tempo += s.tempo;
        acc.energy += s.energy;
        acc.danceability += s.danceability;
        acc.valence += s.valence;
        return acc;
      },
      { tempo: 0, energy: 0, danceability: 0, valence: 0 }
    );
    return {
      tempo: sums.tempo / n,
      energy: sums.energy / n,
      danceability: sums.danceability / n,
      valence: sums.valence / n,
    };
  });

  // Average the genre means equally (genre-balanced)
  const m = perGenreMeans.length;
  const totals = perGenreMeans.reduce(
    (acc, g) => {
      acc.tempo += g.tempo;
      acc.energy += g.energy;
      acc.danceability += g.danceability;
      acc.valence += g.valence;
      return acc;
    },
    { tempo: 0, energy: 0, danceability: 0, valence: 0 }
  );

  const avgTempo = totals.tempo / m;
  return {
    tempoN: Math.min(avgTempo / 200, 1),
    energy: totals.energy / m,
    danceability: totals.danceability / m,
    valence: totals.valence / m,
  };
}

/**
 * Get high-rated songs (>= minRating)
 * @param {Object} ratings - songId -> rating map
 * @param {number} minRating - Minimum rating threshold
 * @returns {Array} Array of {songId, rating} objects
 */
function getHighRatings(ratings, minRating = 4) {
  return Object.entries(ratings)
    .filter(([_, rating]) => rating >= minRating)
    .map(([songId, rating]) => ({ songId, rating }));
}

/**
 * Compute user preferences from high ratings
 * @param {Object} ratings - songId -> rating map
 * @param {Array} songs - All songs
 * @param {Object} datasetAverages - Fallback averages
 * @returns {Object} {tempoN, energy, danceability, valence, topGenre}
 */
function computeUserPreferences(ratings, songs, datasetAverages) {
  // Learn from ALL ratings: 3★ is neutral, >3 pulls toward, <3 pushes away
  // Strategy: compute positive and negative centroids in normalized feature space,
  // then move from datasetAverages toward pos and away from neg, proportional to their weights.

  // Helpers
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  // Accumulators
  let Wpos = 0; // sum of (rating - 3) for ratings > 3
  let Wneg = 0; // sum of (3 - rating) for ratings < 3
  let pos = { tempoN: 0, energy: 0, danceability: 0, valence: 0 };
  let neg = { tempoN: 0, energy: 0, danceability: 0, valence: 0 };

  // For topGenre, consider only positive ratings (students liked these)
  const posGenreCounts = {};

  for (const [songId, rating] of Object.entries(ratings)) {
    if (typeof rating !== "number") continue;
    if (rating === 3) continue; // neutral

    const s = songs.find((x) => x.id === songId);
    if (!s) continue;

    const f = {
      tempoN: Math.min(s.tempo / 200, 1),
      energy: s.energy,
      danceability: s.danceability,
      valence: s.valence,
    };

    if (rating > 3) {
      const w = rating - 3; // 1..2
      Wpos += w;
      pos.tempoN += w * f.tempoN;
      pos.energy += w * f.energy;
      pos.danceability += w * f.danceability;
      pos.valence += w * f.valence;

      // genre counting weighted by w to reflect strength of like
      posGenreCounts[s.genre] = (posGenreCounts[s.genre] || 0) + w;
    } else if (rating < 3) {
      const w = 3 - rating; // 1..2
      Wneg += w;
      neg.tempoN += w * f.tempoN;
      neg.energy += w * f.energy;
      neg.danceability += w * f.danceability;
      neg.valence += w * f.valence;
    }
  }

  const total = Wpos + Wneg;
  if (total === 0) {
    // No signal (all unrated or only neutral 3★) → cold start
    return { ...datasetAverages, topGenre: null };
  }

  // Compute weighted means for pos/neg if present; else fall back to datasetAverages
  const posMean = {
    tempoN: Wpos > 0 ? pos.tempoN / Wpos : datasetAverages.tempoN,
    energy: Wpos > 0 ? pos.energy / Wpos : datasetAverages.energy,
    danceability:
      Wpos > 0 ? pos.danceability / Wpos : datasetAverages.danceability,
    valence: Wpos > 0 ? pos.valence / Wpos : datasetAverages.valence,
  };
  const negMean = {
    tempoN: Wneg > 0 ? neg.tempoN / Wneg : datasetAverages.tempoN,
    energy: Wneg > 0 ? neg.energy / Wneg : datasetAverages.energy,
    danceability:
      Wneg > 0 ? neg.danceability / Wneg : datasetAverages.danceability,
    valence: Wneg > 0 ? neg.valence / Wneg : datasetAverages.valence,
  };

  // Blend: baseline + toward(posMean) - away(negMean)
  const alphaPos = Wpos / total;
  const alphaNeg = Wneg / total;

  const prefs = {
    tempoN: clamp01(
      datasetAverages.tempoN +
        alphaPos * (posMean.tempoN - datasetAverages.tempoN) -
        alphaNeg * (negMean.tempoN - datasetAverages.tempoN)
    ),
    energy: clamp01(
      datasetAverages.energy +
        alphaPos * (posMean.energy - datasetAverages.energy) -
        alphaNeg * (negMean.energy - datasetAverages.energy)
    ),
    danceability: clamp01(
      datasetAverages.danceability +
        alphaPos * (posMean.danceability - datasetAverages.danceability) -
        alphaNeg * (negMean.danceability - datasetAverages.danceability)
    ),
    valence: clamp01(
      datasetAverages.valence +
        alphaPos * (posMean.valence - datasetAverages.valence) -
        alphaNeg * (negMean.valence - datasetAverages.valence)
    ),
    topGenre: null,
  };

  // Determine topGenre from positive ratings only
  if (Wpos > 0) {
    let bestG = null;
    let bestC = -Infinity;
    for (const [g, c] of Object.entries(posGenreCounts)) {
      if (c > bestC) {
        bestC = c;
        bestG = g;
      }
    }
    prefs.topGenre = bestG;
  }

  return prefs;
}

// ============================================================================
// SIMILARITY SCORING
// ============================================================================

/**
 * Score a song based on similarity to user preferences
 * @param {Object} song - Song to score
 * @param {Object} prefs - User preferences
 * @param {Object} weights - Feature weights
 * @param {Object} opts - Options {similarityMode, genreBonus}
 * @returns {Object} {score, scoreMax, contributions, matchPct}
 */
function scoreSong(song, prefs, weights, opts) {
  const songFeatures = {
    tempoN: Math.min(song.tempo / 200, 1),
    energy: song.energy,
    danceability: song.danceability,
    valence: song.valence,
  };

  const contributions = {
    tempo: 0,
    energy: 0,
    danceability: 0,
    valence: 0,
    genre: 0,
  };

  let score = 0;

  if (opts.similarityMode === "abs-diff") {
    // Weighted absolute difference similarity
    // score = Σ w_i * (1 - |pref_i - song_i|)
    contributions.tempo =
      weights.tempo * (1 - Math.abs(prefs.tempoN - songFeatures.tempoN));
    contributions.energy =
      weights.energy * (1 - Math.abs(prefs.energy - songFeatures.energy));
    contributions.danceability =
      weights.danceability *
      (1 - Math.abs(prefs.danceability - songFeatures.danceability));
    contributions.valence =
      weights.valence * (1 - Math.abs(prefs.valence - songFeatures.valence));
  } else {
    // Weighted cosine similarity
    // Scale each component by sqrt(weight), then compute cosine
    const prefVec = [
      Math.sqrt(weights.tempo) * prefs.tempoN,
      Math.sqrt(weights.energy) * prefs.energy,
      Math.sqrt(weights.danceability) * prefs.danceability,
      Math.sqrt(weights.valence) * prefs.valence,
    ];

    const songVec = [
      Math.sqrt(weights.tempo) * songFeatures.tempoN,
      Math.sqrt(weights.energy) * songFeatures.energy,
      Math.sqrt(weights.danceability) * songFeatures.danceability,
      Math.sqrt(weights.valence) * songFeatures.valence,
    ];

    // Cosine similarity
    const dotProduct = prefVec.reduce(
      (sum, val, i) => sum + val * songVec[i],
      0
    );
    const prefMag = Math.sqrt(prefVec.reduce((sum, val) => sum + val * val, 0));
    const songMag = Math.sqrt(songVec.reduce((sum, val) => sum + val * val, 0));

    const cosineSim =
      prefMag > 0 && songMag > 0 ? dotProduct / (prefMag * songMag) : 0;

    // Magnitude agreement (penalize if overall strength differs)
    // 1 when magnitudes equal, drops toward 0 as they differ
    const magSim =
      prefMag > 0 && songMag > 0
        ? 1 - Math.abs(prefMag - songMag) / Math.max(prefMag, songMag)
        : 0;

    // Combined similarity demands both same direction and similar magnitude
    const combinedSim = Math.max(0, Math.min(1, cosineSim * magSim));

    // Distribute cosine score proportionally by weights
    const totalWeight =
      weights.tempo + weights.energy + weights.danceability + weights.valence;
    contributions.tempo = combinedSim * (weights.tempo / totalWeight);
    contributions.energy = combinedSim * (weights.energy / totalWeight);
    contributions.danceability =
      combinedSim * (weights.danceability / totalWeight);
    contributions.valence = combinedSim * (weights.valence / totalWeight);
  }

  score =
    contributions.tempo +
    contributions.energy +
    contributions.danceability +
    contributions.valence;

  // Genre bonus
  const genreMatch = prefs.topGenre && song.genre === prefs.topGenre;
  if (genreMatch) {
    contributions.genre = opts.genreBonus;
    score += opts.genreBonus;
  }

  // Calculate match percentage
  const weightsSum =
    weights.tempo + weights.energy + weights.danceability + weights.valence;
  const scoreMax = weightsSum + (genreMatch ? opts.genreBonus : 0);
  const matchPct = Math.floor(
    100 * Math.max(0, Math.min(1, score / scoreMax)) + 1e-9
  );

  return { score, scoreMax, contributions, matchPct };
}

/**
 * Choose next song to recommend
 * @param {string} currentId - Current song ID (can be null)
 * @param {Set} ratedSet - Set of rated song IDs
 * @param {Array} songs - All songs
 * @param {Object} prefs - User preferences
 * @param {Object} weights - Feature weights
 * @param {Object} opts - Options {similarityMode, genreBonus}
 * @param {function} rng - Random number generator
 * @returns {string} Song ID to recommend
 */
function chooseNextSong(currentId, ratedSet, songs, prefs, weights, opts, rng) {
  // Get unrated songs
  const unrated = songs.filter((s) => !ratedSet.has(s.id));

  if (unrated.length === 0) {
    // All songs rated, shuffle and pick first
    const shuffled = shuffle(songs, rng);
    return shuffled[0].id;
  }

  // Score all unrated songs
  const scored = unrated.map((song) => ({
    song,
    ...scoreSong(song, prefs, weights, opts),
  }));

  // Find max score
  const maxScore = Math.max(...scored.map((s) => s.score));

  // Get all songs with max score
  const topScored = scored.filter((s) => Math.abs(s.score - maxScore) < 0.0001);

  // Deterministic tie-break using seeded shuffle
  if (topScored.length > 1) {
    const shuffled = shuffle(topScored, rng);
    return shuffled[0].song.id;
  }

  return topScored[0].song.id;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Load state from localStorage
 */
function loadState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.ratings = parsed.ratings || {};
      state.currentSongId = parsed.currentSongId || null;
      state.weights = parsed.weights || { ...DEFAULT_WEIGHTS };
      state.similarityMode = parsed.similarityMode || "abs-diff";
      state.genreBonus =
        parsed.genreBonus !== undefined ? parsed.genreBonus : 0.2;
      state.debugVisible = parsed.debugVisible || false;
      state.seed = parsed.seed || 42;
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }

  // Get seed from URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("seed")) {
    state.seed = parseInt(urlParams.get("seed"), 10) || 42;
  }

  // Initialize RNG
  state.rng = mulberry32(state.seed);
}

/**
 * Save state to localStorage
 */
function saveState() {
  try {
    const toSave = {
      ratings: state.ratings,
      currentSongId: state.currentSongId,
      weights: state.weights,
      similarityMode: state.similarityMode,
      genreBonus: state.genreBonus,
      debugVisible: state.debugVisible,
      seed: state.seed,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

// ============================================================================
// UI RENDERING
// ============================================================================

/**
 * Render current song in player
 * @param {Object} song - Song to display
 */
function renderSong(song) {
  if (!song) return;

  document.getElementById("song-title").textContent = song.title;
  document.getElementById("song-artist").textContent = song.artist;
  document.getElementById("song-genre").textContent = song.genre;
  document.getElementById(
    "song-genre"
  ).className = `genre-badge genre-${song.genre
    .toLowerCase()
    .replace(/[^a-z]/g, "")}`;

  document.getElementById("feature-tempo").textContent = Math.round(song.tempo);
  document.getElementById("feature-energy").textContent = Math.round(
    song.energy * 100
  );
  document.getElementById("feature-danceability").textContent = Math.round(
    song.danceability * 100
  );
  document.getElementById("feature-valence").textContent = Math.round(
    song.valence * 100
  );

  // Update star rating
  const currentRating = state.ratings[song.id] || 0;
  document.querySelectorAll(".star").forEach((star, idx) => {
    if (idx < currentRating) {
      star.classList.add("active");
    } else {
      star.classList.remove("active");
    }
  });

  // Update YouTube controls
  const btn = document.getElementById("btn-play-youtube");
  const link = document.getElementById("link-youtube");
  const hasLink = !!(song.youtube && song.youtube.trim().length > 0);
  if (btn) {
    btn.disabled = !hasLink;
    btn.title = hasLink
      ? `Play ${song.title} on YouTube`
      : "No YouTube link available";
  }
  if (link) {
    link.href = hasLink ? song.youtube : "#";
    link.setAttribute("aria-hidden", hasLink ? "false" : "true");
  }

  // Update embedded YouTube iframe
  const videoWrapper = document.getElementById("video-wrapper");
  const videoPlaceholder = document.getElementById("video-placeholder");
  const iframe = document.getElementById("youtube-embed");
  if (videoWrapper && videoPlaceholder && iframe) {
    const vid = extractYouTubeId(song.youtube || "");
    if (vid) {
      const params = new URLSearchParams({
        autoplay: "0",
        modestbranding: "1",
        rel: "0",
      });
      iframe.src = `https://www.youtube.com/embed/${vid}?${params.toString()}`;
      videoWrapper.hidden = false;
      videoPlaceholder.style.display = "none";
    } else {
      iframe.src = "";
      videoWrapper.hidden = true;
      videoPlaceholder.style.display = "";
    }
  }
}

/**
 * Render "Why this song?" explanation
 * @param {Object} result - Scoring result
 */
function renderWhyThis(result) {
  const container = document.getElementById("why-breakdown");

  const { contributions, matchPct } = result;

  container.innerHTML = `
    <div class="contribution-item">
      <span>Tempo:</span>
      <span>+${contributions.tempo.toFixed(2)}</span>
    </div>
    <div class="contribution-item">
      <span>Energy:</span>
      <span>+${contributions.energy.toFixed(2)}</span>
    </div>
    <div class="contribution-item">
      <span>Danceability:</span>
      <span>+${contributions.danceability.toFixed(2)}</span>
    </div>
    <div class="contribution-item">
      <span>Valence:</span>
      <span>+${contributions.valence.toFixed(2)}</span>
    </div>
    ${
      contributions.genre > 0
        ? `
    <div class="contribution-item genre-contribution">
      <span>Genre Match:</span>
      <span>+${contributions.genre.toFixed(2)}</span>
    </div>`
        : ""
    }
    <div class="contribution-total">
      <span>Total Score:</span>
      <span>${result.score.toFixed(2)} / ${result.scoreMax.toFixed(2)}</span>
    </div>
  `;

  document.getElementById(
    "match-percentage"
  ).textContent = `${matchPct}% Match`;
}

/**
 * Render feature comparison bars
 * @param {Object} song - Current song
 * @param {Object} prefs - User preferences
 */
function renderBars(song, prefs) {
  const container = document.getElementById("feature-bars");

  const songFeatures = {
    Tempo: Math.min(song.tempo / 200, 1),
    Energy: song.energy,
    Danceability: song.danceability,
    Valence: song.valence,
  };

  const prefFeatures = {
    Tempo: prefs.tempoN,
    Energy: prefs.energy,
    Danceability: prefs.danceability,
    Valence: prefs.valence,
  };

  container.innerHTML = Object.keys(songFeatures)
    .map(
      (feature) => `
    <div class="bar-row">
      <div class="bar-label">${feature}</div>
      <div class="bar-pair">
        <div class="bar-container">
          <div class="bar bar-pref" style="width: ${
            prefFeatures[feature] * 100
          }%"></div>
          <span class="bar-value">${prefFeatures[feature].toFixed(2)}</span>
        </div>
        <div class="bar-container">
          <div class="bar bar-song" style="width: ${
            songFeatures[feature] * 100
          }%"></div>
          <span class="bar-value">${songFeatures[feature].toFixed(2)}</span>
        </div>
      </div>
      <div class="bar-legend">
        <span class="legend-item"><span class="legend-color legend-pref"></span> Your Pref</span>
        <span class="legend-item"><span class="legend-color legend-song"></span> This Song</span>
      </div>
    </div>
  `
    )
    .join("");
}

/**
 * Render ratings history
 */
function renderHistory() {
  const container = document.getElementById("ratings-list");

  const ratedSongs = Object.entries(state.ratings)
    .map(([songId, rating]) => {
      const song = songs.find((s) => s.id === songId);
      return song ? { ...song, rating } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.rating - a.rating);

  if (ratedSongs.length === 0) {
    container.innerHTML =
      '<p class="no-ratings">No ratings yet. Start by rating the current song!</p>';
    return;
  }

  container.innerHTML = ratedSongs
    .map(
      (song) => `
    <div class="rating-card" data-song-id="${song.id}">
      <div class="rating-card-header">
        <div class="rating-stars">${"★".repeat(song.rating)}${"☆".repeat(
        5 - song.rating
      )}</div>
        <span class="genre-badge genre-${song.genre
          .toLowerCase()
          .replace(/[^a-z]/g, "")}">${song.genre}</span>
      </div>
      <div class="rating-card-title">${song.title}</div>
      <div class="rating-card-artist">${song.artist}</div>
      <div class="rating-card-features">
        T:${Math.round(song.tempo)} E:${Math.round(
        song.energy * 100
      )} D:${Math.round(song.danceability * 100)} V:${Math.round(
        song.valence * 100
      )}
      </div>
    </div>
  `
    )
    .join("");

  // View-only: no click handlers added to rating cards to prevent re-rating
}

/**
 * Render controls panel
 */
function renderControls() {
  // Update similarity mode buttons
  document.querySelectorAll(".similarity-btn").forEach((btn) => {
    if (btn.dataset.mode === state.similarityMode) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update weight sliders
  document.getElementById("weight-tempo").value = state.weights.tempo;
  document.getElementById("weight-energy").value = state.weights.energy;
  document.getElementById("weight-danceability").value =
    state.weights.danceability;
  document.getElementById("weight-valence").value = state.weights.valence;

  document.getElementById("weight-tempo-value").textContent =
    state.weights.tempo.toFixed(2);
  document.getElementById("weight-energy-value").textContent =
    state.weights.energy.toFixed(2);
  document.getElementById("weight-danceability-value").textContent =
    state.weights.danceability.toFixed(2);
  document.getElementById("weight-valence-value").textContent =
    state.weights.valence.toFixed(2);

  // Update genre bonus
  document.getElementById("genre-bonus").value = state.genreBonus;
  document.getElementById("genre-bonus-value").textContent =
    state.genreBonus.toFixed(2);

  // Update debug visibility
  const debugPanel = document.getElementById("debug-panel");
  if (state.debugVisible) {
    debugPanel.classList.add("visible");
  } else {
    debugPanel.classList.remove("visible");
  }

  // Update math explainer mode label
  const modeEl = document.getElementById("math-mode-name");
  if (modeEl) {
    modeEl.textContent = state.similarityMode;
  }
}

/**
 * Render debug panel
 */
function renderDebug() {
  const datasetAvgs = computeDatasetAverages(songs);
  const prefs = computeUserPreferences(state.ratings, songs, datasetAvgs);

  const currentSong = songs.find((s) => s.id === state.currentSongId);
  const opts = {
    similarityMode: state.similarityMode,
    genreBonus: state.genreBonus,
  };

  let scoringInfo = { score: 0, scoreMax: 0, matchPct: 0 };
  if (currentSong) {
    scoringInfo = scoreSong(currentSong, prefs, state.weights, opts);
  }

  const debugContent = document.getElementById("debug-content");
  debugContent.innerHTML = `
    <div class="debug-section">
      <h4>User Preferences</h4>
      <div class="debug-row">
        <span>Tempo (normalized):</span>
        <span>${prefs.tempoN.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Energy:</span>
        <span>${prefs.energy.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Danceability:</span>
        <span>${prefs.danceability.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Valence:</span>
        <span>${prefs.valence.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Top Genre:</span>
        <span>${prefs.topGenre || "None"}</span>
      </div>
    </div>
    <div class="debug-section">
      <h4>Current Weights</h4>
      <div class="debug-row">
        <span>Tempo:</span>
        <span>${state.weights.tempo.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Energy:</span>
        <span>${state.weights.energy.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Danceability:</span>
        <span>${state.weights.danceability.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Valence:</span>
        <span>${state.weights.valence.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Sum:</span>
        <span>${(
          state.weights.tempo +
          state.weights.energy +
          state.weights.danceability +
          state.weights.valence
        ).toFixed(2)}</span>
      </div>
    </div>
    <div class="debug-section">
      <h4>Scoring Details</h4>
      <div class="debug-row">
        <span>Similarity Mode:</span>
        <span>${state.similarityMode}</span>
      </div>
      <div class="debug-row">
        <span>Genre Bonus:</span>
        <span>${state.genreBonus.toFixed(2)}</span>
      </div>
      <div class="debug-row">
        <span>Raw Score:</span>
        <span>${scoringInfo.score.toFixed(4)}</span>
      </div>
      <div class="debug-row">
        <span>Max Score:</span>
        <span>${scoringInfo.scoreMax.toFixed(4)}</span>
      </div>
      <div class="debug-row">
        <span>Match %:</span>
        <span>${scoringInfo.matchPct}%</span>
      </div>
    </div>
    <div class="debug-section">
      <h4>System Info</h4>
      <div class="debug-row">
        <span>Seed:</span>
        <span>${state.seed}</span>
      </div>
      <div class="debug-row">
        <span>Total Ratings:</span>
        <span>${Object.keys(state.ratings).length}</span>
      </div>
      <div class="debug-row">
        <span>High Ratings (4-5★):</span>
        <span>${getHighRatings(state.ratings, 4).length}</span>
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Normalize weights so they sum to 1
 */
function normalizeWeights() {
  const sum =
    state.weights.tempo +
    state.weights.energy +
    state.weights.danceability +
    state.weights.valence;
  if (sum > 0) {
    state.weights.tempo /= sum;
    state.weights.energy /= sum;
    state.weights.danceability /= sum;
    state.weights.valence /= sum;
  }
}

/**
 * Handle rating a song
 * @param {number} rating - Rating value 1-5
 */
function rateSong(rating) {
  if (!state.currentSongId) return;
  // Disallow re-rating an already-rated song
  if (
    Object.prototype.hasOwnProperty.call(state.ratings, state.currentSongId)
  ) {
    announceToScreenReader(
      "This song is already rated. You can't rate it again."
    );
    return;
  }

  state.ratings[state.currentSongId] = rating;
  saveState();

  // Announce recommendation
  const song = songs.find((s) => s.id === state.currentSongId);
  announceToScreenReader(`Rated ${song.title} ${rating} stars`);

  // Move to next song
  moveToNextSong();
}

/**
 * Move to next recommended song
 */
function moveToNextSong() {
  const datasetAvgs = computeDatasetAverages(songs);
  const prefs = computeUserPreferences(state.ratings, songs, datasetAvgs);
  const ratedSet = new Set(Object.keys(state.ratings));
  const opts = {
    similarityMode: state.similarityMode,
    genreBonus: state.genreBonus,
  };

  const nextId = chooseNextSong(
    state.currentSongId,
    ratedSet,
    songs,
    prefs,
    state.weights,
    opts,
    state.rng
  );
  state.currentSongId = nextId;
  saveState();
  updateUI();

  const song = songs.find((s) => s.id === nextId);
  const result = scoreSong(song, prefs, state.weights, opts);
  announceToScreenReader(
    `Recommended next: ${song.title} by ${song.artist}, ${result.matchPct}% match`
  );
}

/**
 * Announce message to screen reader
 * @param {string} message - Message to announce
 */
function announceToScreenReader(message) {
  const liveRegion = document.getElementById("sr-live");
  liveRegion.textContent = message;
}

/**
 * Update entire UI
 */
function updateUI() {
  const currentSong = songs.find((s) => s.id === state.currentSongId);
  if (!currentSong) return;

  const datasetAvgs = computeDatasetAverages(songs);
  const prefs = computeUserPreferences(state.ratings, songs, datasetAvgs);
  const opts = {
    similarityMode: state.similarityMode,
    genreBonus: state.genreBonus,
  };
  const result = scoreSong(currentSong, prefs, state.weights, opts);

  renderSong(currentSong);
  renderWhyThis(result);
  renderBars(currentSong, prefs);
  renderHistory();
  renderControls();
  renderDebug();
}

/**
 * Attach all event handlers
 */
function attachEventHandlers() {
  // Star rating
  document.querySelectorAll(".star").forEach((star, idx) => {
    star.addEventListener("click", () => rateSong(idx + 1));
  });

  // Play on YouTube
  const playBtn = document.getElementById("btn-play-youtube");
  if (playBtn) {
    playBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const song = songs.find((s) => s.id === state.currentSongId);
      if (song && song.youtube && song.youtube.trim().length > 0) {
        const w = window.open(song.youtube, "_blank");
        if (w) w.opener = null;
      }
    });
  }

  // Navigation buttons removed: proceeding requires a rating

  // Similarity mode toggle
  document.querySelectorAll(".similarity-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.similarityMode = btn.dataset.mode;
      saveState();
      updateUI();
    });
  });

  // Weight sliders
  const weightSliders = ["tempo", "energy", "danceability", "valence"];
  weightSliders.forEach((feature) => {
    const slider = document.getElementById(`weight-${feature}`);
    slider.addEventListener("input", (e) => {
      state.weights[feature] = parseFloat(e.target.value);
      normalizeWeights();
      saveState();
      updateUI();
    });
  });

  // Genre bonus slider
  document.getElementById("genre-bonus").addEventListener("input", (e) => {
    state.genreBonus = parseFloat(e.target.value);
    saveState();
    updateUI();
  });

  // Control buttons
  document.getElementById("btn-reset-weights").addEventListener("click", () => {
    state.weights = { ...DEFAULT_WEIGHTS };
    saveState();
    updateUI();
  });

  document.getElementById("btn-toggle-debug").addEventListener("click", () => {
    state.debugVisible = !state.debugVisible;
    saveState();
    updateUI();
  });

  document.getElementById("btn-clear-ratings").addEventListener("click", () => {
    if (confirm("Clear all ratings? This cannot be undone.")) {
      state.ratings = {};
      saveState();

      // Pick a fresh first song
      const shuffled = shuffle(songs, state.rng);
      state.currentSongId = shuffled[0].id;
      saveState();
      updateUI();
    }
  });

  document.getElementById("btn-demo-alex");
  if (document.getElementById("btn-demo-alex")) {
    document.getElementById("btn-demo-alex").remove();
  }
  if (document.getElementById("btn-demo-jordan")) {
    document.getElementById("btn-demo-jordan").remove();
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Don't trigger if typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
        rateSong(parseInt(e.key));
        break;
      // Skipping via keyboard disabled; users must rate to proceed
      case "d":
      case "D":
        state.debugVisible = !state.debugVisible;
        saveState();
        updateUI();
        break;
      case "w":
      case "W":
        state.weights = { ...DEFAULT_WEIGHTS };
        saveState();
        updateUI();
        break;
      case "s":
      case "S":
        state.similarityMode =
          state.similarityMode === "abs-diff" ? "cosine" : "abs-diff";
        saveState();
        updateUI();
        break;
      case "g":
      case "G":
        state.genreBonus = state.genreBonus > 0 ? 0 : 0.2;
        saveState();
        updateUI();
        break;
    }
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the app
 */
function init() {
  loadState();

  // Pick first song if none selected
  if (!state.currentSongId) {
    const shuffled = shuffle(songs, state.rng);
    state.currentSongId = shuffled[0].id;
    saveState();
  }

  attachEventHandlers();
  updateUI();
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ============================================================================
// YOUTUBE UTILITIES
// ============================================================================

/**
 * Extract YouTube video ID from a variety of URL formats.
 * Supports watch?v=, youtu.be/, and embed/ links.
 * Returns null if not found.
 * @param {string} url
 * @returns {string|null}
 */
function extractYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Standard watch URL
    const v = u.searchParams.get("v");
    if (v) return v;
    // youtu.be short link
    if (u.hostname.includes("youtu.be")) {
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[0] || null;
    }
    // /embed/VIDEO_ID pattern
    if (u.pathname.includes("/embed/")) {
      const parts = u.pathname.split("/");
      const idx = parts.indexOf("embed");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
    return null;
  } catch {
    return null;
  }
}
