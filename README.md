# RhythmHacks 2025 Music Recommendation Workshop

A no-setup, browser-based app to learn and tinker with content‑based recommendations. Built with vanilla JavaScript, HTML, and CSS for a 60–90 minute workshop. Perfect for experimenting with the math and UX of recommenders.

## Getting started

[Live Demo](https://adamstirtan.github.io/rhythmhacks2025/)

No build tools or servers required. Everything runs in the browser. Download the source code and open index.html in your browser.

## What you do in the app

1. Rate songs 1–5 stars (keyboard 1–5). You must rate to proceed, no skipping.
2. Read “Why This Song?” for a breakdown of how each feature (and genre bonus) contributed to the score.
3. Compare “Your Pref” vs “This Song” with the feature bars.
4. Tune the four feature weights with sliders (they always sum to 1).
5. Toggle similarity mode (Abs‑Diff vs Cosine) and the Genre Bonus, then observe what changes.
6. Explore your rating history (view‑only) in the right column.

### Controls and shortcuts

- Similarity function: buttons in the right panel or press `S`
- Genre bonus: slider in the right panel or press `G` to toggle 0 ↔︎ 0.2
- Weights: sliders (Tempo, Energy, Danceability, Valence). Press `W` to reset to defaults
- Debug panel: “Toggle Debug” or press `D`
- Rate: click stars or press `1`–`5`

Keyboard hints also appear at the bottom of the page.

## How it works (high level)

We use content‑based filtering on four features per song: tempo (normalized), energy, danceability, and valence. Everything is scaled to [0,1]. Tempo is normalized by dividing BPM by 200.

1. Learn your preferences from all ratings (push/pull):

- 3★ is neutral. >3★ pulls your preference vector toward that song’s features; <3★ pushes it away.
- We compute positive and negative centroids, then blend them with dataset‑level averages to avoid early drift.

2. Score each unrated song with your current weights and similarity function:

- Abs‑Diff: per‑feature similarity $w_i\,(1 - |p_i - s_i|)$
- Cosine: weight‑scaled cosine with a magnitude agreement factor (prefers both similar direction and overall strength)
- Optional Genre Bonus adds when the song’s genre matches your top genre (derived from positively rated songs).

3. Recommend the highest‑scoring unrated song (ties broken deterministically via a seeded RNG).

### The math (concise)

- Normalize tempo: $tempoN = \min(tempo/200,\,1)$
- Dataset averages (cold start): computed genre‑balanced to reduce skew.
- Preference blending:
  - Let $W_+$ sum of $(rating-3)$ for ratings > 3, $W_-$ sum of $(3-rating)$ for ratings < 3.
  - Compute positive/negative means and blend from dataset averages using $\alpha_+ = \tfrac{W_+}{W_+ + W_-}$ and $\alpha_- = \tfrac{W_-}{W_+ + W_-}$.
- Abs‑Diff score: $\text{score} = \sum_i w_i\,(1 - |p_i - s_i|)$
- Cosine score (weight‑scaled): scale each component by $\sqrt{w_i}$, compute cosine similarity, then multiply by a magnitude agreement term; distribute contributions by weight.
- Genre bonus: if genre matches topGenre, add $+\text{genreBonus}$.
- Match %: $\text{match} = \Big\lfloor 100\,\cdot\,\text{clamp}\big(\tfrac{\text{score}}{\text{scoreMax}},0,1\big) \Big\rfloor$, where $\text{scoreMax} = \sum w_i + (\text{genre match?}\;\text{genreBonus}:0)$.

## 🧩 What’s in the box

- `index.html` — App UI and layout
- `style.css` — Modern, readable workshop styling with genre colors
- `data.js` — Curated dataset (~140 songs) across 10 genres; optional `youtube` links per song
- `app.js` — All logic: seeded RNG, preference learning, scoring, UI rendering, keyboard controls, and persistence

State persists in `localStorage` under key `rh2025_ratings` (ratings, current song, weights, similarity mode, genre bonus, debug visibility, seed). Clear it with the “Clear Ratings” button.

Tips:

- Deterministic seed for reproducibility: default 42, override with `?seed=123`

## 🛠️ Hack the code (guided experiments)

Great first tweaks for attendees to try during or after the workshop:

1. Add a new song

- Append a new object to `songs` in `data.js` with id, title, artist, genre, tempo, energy, danceability, valence, and optional `youtube` URL.

2. Add a 5th feature (e.g., acousticness in [0,1])

- `data.js`: add `acousticness` to each song you want to use
- `app.js`:
  - Extend `DEFAULT_WEIGHTS` and the `state.weights`
  - Include the feature in preference learning and `scoreSong`
  - Normalize/scale as needed (keep features in [0,1])
- `index.html`/`style.css`: add a slider in “Feature Weights” and a bar row in “Feature Comparison”

3. Try a different similarity

- Implement Euclidean distance or Manhattan distance instead of (or in addition to) Abs‑Diff/Cosine
- Update the toggle to include your new mode

4. Change tie‑breaking

- Inside `chooseNextSong`, adjust how ties are resolved (e.g., prefer higher danceability on ties)

5. Shareable state in URL (stretch)

- Serialize ratings/weights into a URL param so students can share their “taste profile” links

## 🧪 Debugging and understanding

Open the Debug panel (`D`) to see:

- Your current preference vector and top genre
- Current weights and their sum
- Scoring details and match percentage for the current song
- System info (seed, counts of ratings and high ratings)

## 🙏 Credits and license

Created for the RhythmHacks 2025 workshop by Adam Stirtan. Educational use encouraged—fork, modify, and extend.

License: Educational use license (see repository). If not specified, treat as permissive for classroom projects.
