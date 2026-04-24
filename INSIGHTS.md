# Three insights from the tool

Each finding below was produced entirely within the analyser, using only
the sidebar filters and the time slider. For every insight the same
structure is followed: the observation, the supporting evidence, the
level-design actions it suggests and the metrics those actions would move,
and a brief note on why it matters for level design.

---

## 1. The three maps already support distinctly different combat ranges

**Observation.** Median engagement distance differs materially between
maps, and the long tails differ more still. Lockdown functions as a
close-quarters map, Grand Rift as a mid-range map, and Ambrose Valley as
an open-sightline map.

**Evidence.** From the killer-to-victim pairings produced by the
pipeline, aggregated across the full five-day window:

| Map | Kills (pairs) | p10 | Median | p90 | Max |
|---|---:|---:|---:|---:|---:|
| Lockdown | 37 | 3.6 m | **11.8 m** | 94.3 m | 198.2 m |
| Grand Rift | 8 | 13.5 m | **28.0 m** | 157.5 m | 195.7 m |
| Ambrose Valley | 93 | 6.2 m | **39.6 m** | 223.9 m | 531.4 m |

Median kill distance on Ambrose is approximately 3.4× the Lockdown
median; the 90th-percentile distance is approximately 2.4× larger.

**Recommended actions and expected metric impact.**

- Audit weapon and loot spawns per map against each map's range profile.
  Lockdown should privilege SMG and shotgun availability near its hot
  zones; Ambrose should privilege scopes and DMRs on its ridgelines.
  Reusing a single loot table across maps will erode this
  differentiation.
- On Ambrose, consider a modest reduction in the first storm circle's
  radius. This compresses the long-range tail and provides additional
  cover without changing the map's identity.
- Expected metric movement: average time-to-first-engagement, weapon-slot
  pick rate by map, and the shape of the engagement-distance histogram.

**Why it matters.** Range profile is the most legible expression of a
map's identity to players. These three maps are already differentiated;
the greatest design risk is homogenising them through uniform balance
passes.

---

## 2. Over half of all deaths occur in the final tenth of match time

**Observation.** The majority of human deaths on Ambrose and Lockdown,
and every storm death on all three maps, occur inside the last 10% of
match time. The geometry of the final circles therefore carries
disproportionate weight in determining the perceived pacing and
intensity of a round.

**Evidence.** Dividing each match into ten equal time windows:

| Map | Deaths in windows 1–9 | Deaths in final window | Share | Storm kills in final window |
|---|---:|---:|---:|---:|
| Ambrose Valley | 186 | **317** | **63%** | 17 of 17 (100%) |
| Lockdown | 87 | **98** | **53%** | 17 of 17 (100%) |
| Grand Rift | 24 | 11 | 31% | 5 of 5 (100%) |

Human-to-bot deaths increase by approximately 4× between the penultimate
and final windows on Ambrose, and approximately 8× on Lockdown. Storm
kills occur exclusively in the final window on every map.

**Recommended actions and expected metric impact.**

- Prioritise polish iterations on the geometry inside each map's typical
  final circles. This is the highest-leverage level-design surface
  per map.
- To determine whether the final-window spike reflects a choke point or
  intended escalation, view the "Kill zones" heatmap restricted to the
  final window. A tight cluster suggests a choke point and justifies
  additional cover or alternate exits; a broad distribution indicates
  final-circle intensity functioning as designed.
- If storm pressure is intended to shape behaviour throughout the match,
  begin the shrink curve or damage ramp earlier. If it is intended only
  as a final-act mechanism, it is already operating as expected.
- Expected metric movement: per-match survival curve, storm-kill share
  of total deaths, and distribution of deaths across the match timeline.

**Why it matters.** The final minutes of a match are the most emotionally
loaded portion of the session. The geometry inside the last circles
warrants more iteration time than any other region of a map.

---

## 3. Combat concentrates in a small number of cells, and those cells are not where looting occurs

**Observation.** On every map, a small fraction of locations accounts for
a large share of all kills. The locations of combat and the locations of
looting are largely disjoint, which implies that the transit paths
between them are the primary level-design surface.

**Evidence.** Each map was gridded into 16-pixel cells (approximately
10–16 m) and ranked by kill count:

| Map | Kills | Occupied cells | Share of kills in top 10% of cells |
|---|---:|---:|---:|
| Ambrose Valley | 1,799 | 491 | **37%** |
| Grand Rift | 193 | 114 | **29%** |
| Lockdown | 426 | 241 | **28%** |

On Lockdown specifically, three adjacent cells roughly centre-right of
the map account for **12% of all kills on that map**, within a patch
approximately 50 m on a side.

Comparing the top 20 loot cells with the top 20 kill cells on each map:
**only 2 cells overlap** on Ambrose, and only 2 on Lockdown.

**Recommended actions and expected metric impact.**

- The Lockdown three-cell cluster is the single largest balance lever on
  that map. The Kill Feed side panel, restricted to the cluster, will
  indicate whether the concentration reflects a small number of
  angle-holders (a line-of-sight problem warranting additional cover) or
  a rotation of attackers and defenders (a contested objective
  functioning as designed).
- Treat the corridors between top loot cells and top kill cells as the
  primary design surface. Enable the Traffic view to surface these
  routes; cover, ramps, and readable silhouettes placed along them will
  have disproportionate impact.
- Cold regions of the map (60–70% of surface area on each map) are
  either intended flavour space or under-utilised real estate.
  Playtest observation combined with the Traffic heatmap will
  distinguish between the two.
- Expected metric movement: kill-distribution concentration (top-10% cell
  share), loot-to-engagement rotation time, and time spent in
  low-activity regions.

**Why it matters.** If 28–37% of combat occurs in 10% of the map's area,
the remainder is either deliberate flavour or unrealised design space.
The tool makes that distinction visible in minutes rather than requiring
designers to infer it from playtest notes.

---

## Reproducing these figures

Every figure in this document was produced by the analyser itself using
only the sidebar filters and the time slider. Whenever a future build
moves these numbers, the same three views will show where and when.
