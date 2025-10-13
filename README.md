# 🎵 Music Recommendation Workshop - RhythmHacks 2025

An interactive educational app that teaches content-based filtering through a hands-on music recommendation system. Built with vanilla JavaScript for a 60-minute workshop with high school students.

## 🚀 Quick Start

**No installation required!** Simply open `index.html` in any modern web browser.

```bash
# Option 1: Double-click index.html in your file explorer

# Option 2: From terminal
open index.html           # macOS
xdg-open index.html       # Linux
start index.html          # Windows

# Option 3: Drag and drop index.html into your browser
```

The app works entirely in the browser with no server or build step needed.

## 📚 What You'll Learn

This workshop teaches **content-based filtering** - a recommendation technique that suggests items similar to what you've liked before.

### The N-Dimensional Space Concept

Each song is represented as a point in 4-dimensional space using these features:

- **Tempo**: Speed in BPM (normalized to 0-1 by dividing by 200)
- **Energy**: Intensity and activity level (0-1)
- **Danceability**: How suitable for dancing (0-1)
- **Valence**: Musical positivity/happiness (0-1)

### The Algorithm

1. **Learn Preferences**: Averages features from songs you rated 4-5 stars (with cold-start fallback)
2. **Score Candidates**: Calculates similarity using weighted features
3. **Recommend**: Picks the highest-scoring unrated song, with an optional genre bonus

## 🎮 How to Use

### Rating Songs

- Click stars (1-5) or press number keys `1`-`5`
- After rating, the app automatically recommends the next song
- View your rating history in the "Your Ratings" panel

### Navigation

- **Next →**: Move to next recommended song
- **← Previous**: Go back to previously rated songs
- **Click any card** in Your Ratings to revisit that song

### Exploring the Algorithm

**Similarity Functions** (toggle between):

- **Abs-Diff**: `score = Σ weight × (1 - |preference - song|)`
- **Cosine**: Weighted cosine similarity between preference and song vectors

**Feature Weights** (sliders that always sum to 1):

- Adjust to prioritize different features
- Watch how recommendations change in real-time

**Genre Bonus** (0.0-0.4):

- Extra points when song genre matches your favorite genre
- Favorite genre = most common among 4-5 star ratings

**Demo Profiles**:

- **Alex's Taste**: Upbeat Pop/EDM lover (high energy, high danceability)
- **Jordan's Taste**: Chill Ambient/Indie listener (low energy, low tempo)

### Debug Mode

Press `D` or click "Toggle Debug" to see:

- Your current preference vector
- Active weights and their sum
- Raw scoring details for the current song
- Most-preferred genre
- System info (seed, rating counts)

## ⌨️ Keyboard Shortcuts

| Key       | Action                     |
| --------- | -------------------------- |
| `1`-`5`   | Rate current song          |
| `←` / `→` | Navigate previous/next     |
| `Space`   | Next song                  |
| `D`       | Toggle debug panel         |
| `W`       | Reset weights to defaults  |
| `S`       | Toggle similarity function |
| `G`       | Toggle genre bonus on/off  |

## 🎯 Workshop Flow

### 20 Minutes: Slides

1. What is content-based filtering?
2. N-dimensional feature space visualization
3. Normalization and why it matters
4. Weights and genre bonus explained
5. Step-through scoring example

### 40 Minutes: Hands-On Coding

1. **Explore** (5 min): Rate songs, see recommendations
2. **Experiment** (15 min):
   - Adjust weight sliders
   - Toggle similarity functions
   - Try demo profiles
   - Enable debug mode
3. **Extend** (20 min): Code challenges
   - Add a new feature (e.g., acousticness)
   - Implement a different similarity metric
   - Create a third demo profile
   - Visualize the feature space

## 🔧 Technical Details

### Design Decisions

**Deterministic Behavior**: Uses seeded PRNG (Mulberry32) for reproducible recommendations

- Default seed: 42
- Override with URL param: `?seed=123`
- Ensures students get same results for discussion

**Normalization**:

- Tempo scaled by dividing by 200 (since typical BPM range is 60-180)
- Other features already 0-1
- Enables fair comparison across features

**Cold Start**:

- With <3 high ratings (4-5 stars), uses dataset averages
- Ensures recommendations work immediately
- Preference vector improves as you rate more songs

**Weight Normalization**:

- Weights always sum to 1
- When one slider moves, others adjust proportionally
- Makes contribution percentages meaningful

**Genre Bonus**:

- Separate from feature weights
- Applied additively after feature scoring
- Only triggers for your most-preferred genre

### Persistence

State saved to `localStorage` under key `rh2025_ratings`:

- All ratings
- Current song
- Weight settings
- Similarity mode
- Genre bonus value
- Debug panel visibility

### Code Structure

```
data.js          # 40 fictional songs with balanced features
app.js           # All application logic
  - PRNG & shuffle
  - Preference calculation
  - Similarity scoring (abs-diff & cosine)
  - UI rendering
  - Event handlers
  - Demo profiles
style.css        # Clean workshop design with genre colors
index.html       # Semantic HTML with accessibility features
```

## 🎨 Features

✅ **Educational**

- Clear "Why This Song?" breakdown
- Visual feature comparison bars
- Debug panel with algorithm internals

✅ **Accessible**

- ARIA labels and live regions
- Keyboard navigation
- Focus-visible styles
- Screen reader support

✅ **Interactive**

- Real-time weight adjustment
- Toggleable similarity functions
- Demo profiles for instant exploration

✅ **Deterministic**

- Seeded random for reproducible results
- Perfect for classroom discussion

## 🧰 Generate a Larger Dataset (Optional)

If you want more meaningful personalization, you can generate a bigger dataset (e.g., 250–500 songs) from Spotify using a simple Node script.

Requirements:

- Node 18+
- Spotify Developer credentials (Client ID/Secret) using Client Credentials flow

Steps:

1. Create a Spotify App at https://developer.spotify.com/dashboard and copy the Client ID/Secret.
2. Run the generator:

```bash
cd /path/to/RhythmHacks2025-Recommender
SPOTIFY_CLIENT_ID=your_id SPOTIFY_CLIENT_SECRET=your_secret \
node scripts/generate-data.mjs --out data.generated.js --per-genre 25
```

Flags:

- `--out`: output file path (default: `data.generated.js`)
- `--per-genre`: number of tracks per genre (default: 25)
- `--genres`: comma-separated list, optionally `Display=seed` pairs
  - Example: `"Pop,Rock,Hip-Hop,EDM,R&B,Jazz,Classical,Country,Indie,Ambient"`

When done, replace the `<script src="data.js"></script>` tag in `index.html` with your generated file (or rename it to `data.js`).

Note: The script outputs the same shape used by the app (including `tempo`, `energy`, `danceability`, `valence`, and an empty `youtube` field). You can paste YouTube links later.

## 📖 Algorithm Deep Dive

### Preference Calculation

```javascript
// For each feature (tempo, energy, danceability, valence):
preference[feature] = average(highRatedSongs[feature]);

// Where highRatedSongs = songs rated 4 or 5 stars
// If < 3 high ratings, use dataset averages (cold start)
```

### Abs-Diff Scoring

```javascript
score = Σ weight[i] × (1 - |preference[i] - song[i]|)
      + (genreMatch ? genreBonus : 0)
```

### Cosine Scoring

```javascript
// Scale components by sqrt(weight)
prefVec = [√w₁·p₁, √w₂·p₂, √w₃·p₃, √w₄·p₄]
songVec = [√w₁·s₁, √w₂·s₂, √w₃·s₃, √w₄·s₄]

// Compute cosine similarity
similarity = dot(prefVec, songVec) / (||prefVec|| × ||songVec||)

// Distribute back to per-feature contributions
score = similarity + (genreMatch ? genreBonus : 0)
```

### Match Percentage

```javascript
scoreMax = sumOfWeights + (genreMatch ? genreBonus : 0)
matchPct = round(100 × clamp(score / scoreMax, 0, 1))
```

## 🤔 Discussion Questions

**For Students:**

1. Why does changing the tempo weight dramatically affect recommendations?
2. What happens if you set all weights equal? Why?
3. Is abs-diff or cosine better? When would you use each?
4. How could we handle the "cold start" problem differently?
5. What other features could improve recommendations? (acousticness, instrumentalness, era?)

**Extension Ideas:**

1. Add user profiles that can be saved/loaded
2. Implement collaborative filtering (recommend based on similar users)
3. Add a "surprise me" mode that recommends dissimilar songs
4. Create data visualizations (scatter plots of feature space)
5. Support importing real Spotify data

## 📄 Files

- `index.html` - Main app interface
- `style.css` - Styling and responsive design
- `data.js` - 40 fictional songs dataset
- `app.js` - Complete recommendation algorithm
- `README.md` - This file
- `PRESENTATION.md` - Workshop slides outline

## 🙏 Credits

Created for **RhythmHacks 2025** by Adam Stirtan.

Educational workshop demonstrating content-based filtering with vanilla JavaScript.
No frameworks, no build tools, no barriers to learning.

## 📜 License

This project is provided as educational material for the RhythmHacks 2025 workshop.
Feel free to use, modify, and extend for educational purposes.
