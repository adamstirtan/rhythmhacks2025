# Workshop Presentation: Content-Based Music Recommendations

## Slide Deck Outline for 20-Minute Talk

---

### Slide 1: Title

**Content-Based Music Recommendations**  
*Building Smart Recommendations from Scratch*

RhythmHacks 2025 Workshop  
Adam Stirtan

---

### Slide 2: The Problem

**How does Spotify know what song to play next?**

- You've liked 50 songs
- There are 100 million songs on Spotify
- Which one should we play next?

**Key Insight**: Recommend songs *similar* to what you already like!

---

### Slide 3: The N-Dimensional Space Idea

**Every song is a point in space**

Visual: Simple 2D scatter plot with ~10 songs plotted by Energy (x-axis) vs Danceability (y-axis)

- High energy + high danceability = EDM, Pop
- Low energy + low danceability = Ambient, Classical

**In our app**: 4 dimensions (Tempo, Energy, Danceability, Valence)

*"Closeness" in this space = similarity*

---

### Slide 4: The Four Features

**What makes a song?**

| Feature | Range | Description |
|---------|-------|-------------|
| **Tempo** | 60-180 BPM | Speed of the song |
| **Energy** | 0-1 | Intensity & activity |
| **Danceability** | 0-1 | How suitable for dancing |
| **Valence** | 0-1 | Musical positivity/happiness |

Example songs from our dataset:
- 🎉 "Pulse" (EDM): Tempo=128, Energy=0.95, Dance=0.95, Valence=0.85
- 🌙 "Floating" (Ambient): Tempo=65, Energy=0.20, Dance=0.15, Valence=0.40

---

### Slide 5: Normalization - Making Fair Comparisons

**Problem**: Tempo is 60-180, but Energy is 0-1. How do we compare them?

**Solution**: Normalize tempo to 0-1 scale

```
tempoNormalized = tempo / 200
```

Examples:
- 60 BPM → 0.30
- 120 BPM → 0.60
- 180 BPM → 0.90

Now all features are 0-1, so differences are comparable! ⚖️

---

### Slide 6: Learning Your Preferences

**Step 1: What do you like?**

Algorithm:
1. Look at songs you rated **4 or 5 stars** (high ratings)
2. Average their features

Example:
```
You rated 5 songs highly:
- Average Tempo: 0.65 (130 BPM)
- Average Energy: 0.85
- Average Danceability: 0.88
- Average Valence: 0.80

→ Your Preference Vector: [0.65, 0.85, 0.88, 0.80]
```

**Cold Start**: If you've rated <3 songs, we use dataset averages

---

### Slide 7: Weights - Not All Features Are Equal

**Weights control importance** (always sum to 1)

Default weights:
- Tempo: **0.2** (20%)
- Energy: **0.3** (30%)
- Danceability: **0.3** (30%)
- Valence: **0.2** (20%)

**Why?** Maybe danceability matters more for party playlists, but tempo matters more for workout playlists!

You can adjust these in the app! 🎚️

---

### Slide 8: Scoring a Song - Abs-Diff Method

**Step 2: How similar is this song to my preferences?**

**Absolute Difference Similarity**:
```
For each feature:
  contribution = weight × (1 - |preference - song|)

Total Score = Σ contributions
```

**Example**: Scoring "Neon Nights" (EDM)

Song: [0.65, 0.92, 0.92, 0.88]  
Your Prefs: [0.65, 0.85, 0.88, 0.80]

```
Tempo:        0.2 × (1 - |0.65 - 0.65|) = 0.2 × 1.00 = 0.200
Energy:       0.3 × (1 - |0.85 - 0.92|) = 0.3 × 0.93 = 0.279
Danceability: 0.3 × (1 - |0.88 - 0.92|) = 0.3 × 0.96 = 0.288
Valence:      0.2 × (1 - |0.80 - 0.88|) = 0.2 × 0.92 = 0.184

Total Score: 0.951 / 1.0 = 95.1% Match! 🎯
```

---

### Slide 9: Genre Bonus - The Cherry on Top

**Extra points for matching genre!**

1. Find your **most-preferred genre** (mode of 4-5 star ratings)
2. If a song matches that genre, add a **genre bonus**

Default bonus: **+0.2**

Example:
- You've rated 8 songs 4-5 stars
- 5 are Pop, 2 are EDM, 1 is Rock
- Most-preferred genre: **Pop**
- Any Pop song gets +0.2 to its score!

This helps surface genre-consistent recommendations 🎸

---

### Slide 10: Alternative Similarity - Cosine

**Cosine Similarity**: Measures angle between vectors

```
similarity = dot(yourPrefs, song) / (||yourPrefs|| × ||song||)
```

**When to use each?**
- **Abs-Diff**: Punishes any difference equally
- **Cosine**: Cares about *direction*, not magnitude

Try both in the app! Toggle with the `S` key.

Visual: Simple vector diagram showing two vectors and the angle between them

---

### Slide 11: The Complete Algorithm (3 Steps)

**Step 1: Learn Preferences**
```
prefs = average(high_rated_songs)
topGenre = mode(high_rated_genres)
```

**Step 2: Score All Unrated Songs**
```
for each unrated song:
  score = similarity(prefs, song, weights)
  if song.genre == topGenre:
    score += genreBonus
```

**Step 3: Recommend Best Match**
```
nextSong = highest_scoring_song
```

That's it! 🎉

---

### Slide 12: Cold Start Problem

**Challenge**: What if I haven't rated anything yet?

**Our Solution**:
- If <3 high ratings → use **dataset averages**
- Ensures you always get recommendations
- System learns your taste as you rate more songs

**Alternative approaches**:
- Ask onboarding questions
- Start with popular songs
- Use collaborative filtering (recommend based on similar users)

---

### Slide 13: Live Demo Time! 🎮

**Let's see it in action!**

1. Open `index.html`
2. Rate a few songs (keys `1`-`5`)
3. Watch recommendations change
4. Try the demo profiles:
   - Alex: Upbeat Pop/EDM
   - Jordan: Chill Ambient/Indie
5. Adjust weight sliders
6. Toggle similarity function
7. Enable debug mode (`D` key)

**60-Second Interactive Moment**:
*"Let's all adjust the tempo weight to 1.0 and see what happens!"*

---

### Slide 14: Under the Hood - Determinism

**Why does everyone get the same first song?**

Uses a **seeded random number generator** (Mulberry32)

Default seed: **42** (of course! 🌌)

Benefits:
- Reproducible results
- Great for classroom discussion
- Students can compare notes

Try different seeds: `?seed=123` in the URL

---

### Slide 15: Extending the System

**What features could we add?**

More dimensions:
- Acousticness (0-1): acoustic vs electronic
- Instrumentalness (0-1): vocals vs instrumental
- Speechiness (0-1): spoken word content
- Release year: recommend modern vs classic

More intelligence:
- Time-of-day preferences (upbeat morning, chill evening)
- Mood-based playlists
- Sequence awareness (don't play two slow songs in a row)

---

### Slide 16: Real-World Applications

**Content-based filtering is everywhere!**

- 🎵 **Spotify/Apple Music**: Song recommendations
- 🎬 **Netflix**: Movie/show suggestions
- 📰 **News apps**: Article recommendations
- 🛍️ **Amazon**: Product suggestions
- 📱 **TikTok**: Video feed curation

**Difference from Collaborative Filtering**:
- Content-based: "You liked X, here's something similar to X"
- Collaborative: "Users like you also liked Y"

---

### Slide 17: Measuring Success

**How do we know if our recommendations are good?**

Metrics:
- **Precision@K**: Of top K recommendations, how many were actually liked?
- **Recall**: What % of liked items were recommended?
- **Diversity**: Are we recommending varied songs or just similar ones?
- **Serendipity**: Are we helping discover new artists/genres?

**Trade-off**: Accuracy vs Discovery
- Too accurate → echo chamber
- Too random → irrelevant

---

### Slide 18: Discussion Questions

**Let's think critically!**

1. **What if all weights are equal?** What happens to recommendations?

2. **Abs-diff vs Cosine**: Which do you prefer and why?

3. **What if we removed the genre bonus?** Would recommendations be better or worse?

4. **Cold start**: How else could we handle new users with no ratings?

5. **Privacy**: What data would a real music app collect? How can we protect user privacy?

---

### Slide 19: Code Challenge (Optional)

**For the coders in the room!**

**Challenge 1**: Add a 5th feature
- Pick one: acousticness, era, popularity
- Add to data.js
- Update scoring functions
- Add to UI

**Challenge 2**: "Surprise Me" mode
- Recommend songs *least* similar to preferences
- Help users discover new genres

**Challenge 3**: Visualize the space
- Plot songs in 2D (e.g., Energy vs Danceability)
- Show your preferences as a red dot
- Show recommendations as green dots

---

### Slide 20: Recap & Q&A

**What We Learned**:
✅ Content-based filtering basics  
✅ N-dimensional feature spaces  
✅ Normalization and why it matters  
✅ Weighted similarity scoring  
✅ Cold start strategies  
✅ Genre bonus enhancement  

**Key Takeaway**: 
*Recommendation systems blend math, domain knowledge, and user experience design!*

**Now**: Hands-on time! Open the app and experiment 🚀

**Questions?** 🙋

---

### Appendix: Math Reference

**Abs-Diff Similarity**
```
score = Σ wᵢ × (1 - |prefᵢ - songᵢ|) + genreBonus
where: Σwᵢ = 1
```

**Cosine Similarity**
```
v_pref = [√w₁·p₁, √w₂·p₂, √w₃·p₃, √w₄·p₄]
v_song = [√w₁·s₁, √w₂·s₂, √w₃·s₃, √w₄·s₄]

cos(θ) = (v_pref · v_song) / (||v_pref|| × ||v_song||)

score = cos(θ) + genreBonus
```

**Match Percentage**
```
matchPct = round(100 × score / scoreMax)
where: scoreMax = Σwᵢ + (genreMatch ? genreBonus : 0)
```

---

## Teaching Tips

**Timing**:
- Slides 1-6: **6 minutes** (intro, concepts)
- Slides 7-11: **8 minutes** (algorithm deep dive)
- Slides 12-13: **4 minutes** (demo)
- Slides 14-20: **2 minutes** (discussion, wrap-up)

**Interactive Moments**:
1. After Slide 4: "What genre do you think has highest danceability?"
2. After Slide 8: Live calculation with volunteer's preference vector
3. Slide 13: Hands-on exploration (all students rate 5 songs)

**Common Questions**:
- *"Why not use machine learning?"* → Great for learning fundamentals first!
- *"How does Spotify really work?"* → Combination of content-based, collaborative, and deep learning
- *"What about copyright?"* → Our songs are fictional; real apps need licensing

**Extension Activities**:
- Compare recommendations with a partner
- Create a third demo profile together
- Discuss ethical implications (filter bubbles, bias)
