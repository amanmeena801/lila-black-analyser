# Three things the data is telling us about the maps

I spent time inside the analyser looking at the five days of telemetry with
level-design questions in mind. Three things jumped out. Each is framed the
same way: what the map seems to be doing, what the evidence is, what I'd
iterate on next, and what to watch in the metrics when you do.

Every number below can be reproduced in the tool itself — sidebar filters,
view-mode switcher, time slider. Nothing requires SQL or a download.

---

## 1. Each map has its own combat personality — and right now they're actually distinct. Don't let that slip.

**What the map is telling us.** Players fight at very different distances
on each map — not by a little, by a lot. Lockdown is shaping up as a
close-quarters map, Ambrose Valley as an open-sightline map, and Grand
Rift sits in between. That's a real level-design win: the three maps feel
like different games. The risk is accidentally flattening them during a
balance pass.

**The evidence.** In the killfeed pairings view — where the tool draws a
line between each killer and their victim — the typical kill length is:

- **Lockdown ≈ 12 m** (9 out of 10 kills end inside 95 m)
- **Grand Rift ≈ 28 m**
- **Ambrose Valley ≈ 40 m** (1 in 10 kills is over 220 m; one was a
  531 m ridgeline shot)

So the *median* Ambrose fight is over three times longer than the median
Lockdown fight, and the long tails are even more extreme.

**What to iterate on.**

- Protect the identity when you make balance passes. Audit weapon and loot
  spawns against the map's range profile: Lockdown should favour SMGs /
  shotguns near its hot zones; Ambrose should favour scopes / DMRs on its
  ridgelines. If you're copy-pasting a loot table between maps, you're
  probably homogenising what makes each one feel different.
- On Ambrose specifically, if playtesters tell you "the map feels
  punishing from nowhere", one high-leverage lever is an inward nudge on
  the first storm circle. That alone collapses the longest-range tail and
  gives players one more circle of cover.
- Grand Rift has the thinnest data today (only 59 matches in the dump).
  Worth a deliberate playtest to check whether its 28 m median is where
  designers *want* it or just a small-sample accident.

**What'll move in the metrics.** Average time-to-first-engagement per map,
weapon-slot pick rates per map, and the shape of the engagement-distance
histogram. If a map edit is meant to preserve identity the histogram should
keep its shape; if it's meant to shift identity, it should visibly shift.

---

## 2. The final stretch of every match is where most of the dying happens — and the storm is doing none of the work until the very end.

**What the map is telling us.** Load the tool, switch the view to "Death
zones", and drag the time slider from left to right. For the first ~90% of
the match the map stays quiet. In the final stretch it lights up across
all three maps, and the storm suddenly catches everyone who's still edging
the line. End-of-match is doing the heavy lifting for the emotional arc of
a session right now — whatever geometry is inside the last circles matters
disproportionately much to how a match *feels*.

**The evidence.** Slicing each match into ten equal time windows, the
final window (last 10% of match time) contains:

- **63% of all human deaths on Ambrose** — including every single storm
  kill (17 of 17)
- **53% on Lockdown** — every storm kill (17 of 17)
- **31% on Grand Rift** — every storm kill (5 of 5)

Said differently: on Ambrose, deaths jump roughly 4× between the
second-to-last slice and the last one. On Lockdown it's about 8×. And
storm kills happen *exclusively* in the final 10% of match time on every
map.

**What to iterate on.**

- Your final-circle geometry is the highest-leverage surface on each map.
  If players love the last sixty seconds, it's because of what's in those
  circles; if they rage-quit, it's for the same reason. Prioritise polish
  iterations there over the spawn-end of the map.
- Is the final-10% spike a *choke point* or *healthy escalation*? The tool
  answers it in one drag: switch to "Kill zones" with the slider locked to
  the last slice. Tight cluster = choke point; add cover or exits. Broad
  spread = final-circle intensity working as intended.
- The storm is a silent mechanic for 90% of the match. If the design
  intent is for it to shape behaviour throughout the round, the shrink
  curve (or damage ramp) needs to start biting earlier. If the intent is
  final-act pressure, it's already landing.
- Grand Rift's final-10% share (31%) is notably lower than the other two.
  Align only if cross-map consistency is an explicit design goal.

**What'll move in the metrics.** The per-match survival curve (it should
bend earlier if you turn up mid-match pressure), storm-kill share of total
deaths, and a more even distribution of deaths across the match timeline.

---

## 3. The map is hyper-concentrated — a small number of spots are doing most of the dying. And players don't fight where they loot.

**What the map is telling us.** Most of the map surface sees almost no
combat. On every map, a small handful of cells is where things actually
happen. More interesting still: the *loot* hotspots and the *combat*
hotspots are almost completely different places. That means the journey
between them — the roads, corridors, overlooks — is where ambushes happen
and where the real player experience is made. Those transit routes are the
actual level-design surface.

**The evidence.** Gridding each map into roughly 10 × 16 m cells and
ranking them by kill count:

- On **Ambrose**, the top 10% of cells hold **37% of all kills**.
- On **Grand Rift**, the top 10% hold **29%**.
- On **Lockdown**, the top 10% hold **28%** — and three adjacent cells
  roughly centre-right of the map together hold **12% of all kills on
  Lockdown** in a patch the size of a city block.

When I list the top 20 loot cells and the top 20 kill cells on each map,
**only 2 overlap**. Players pick up gear in one part of the map and die
somewhere else.

**What to iterate on.**

- The Lockdown three-cell cluster is the single biggest balance lever on
  that map. Open the Kill Feed panel on that cluster and look at who's
  killing whom:
  - If most kills come from a small number of angle-holders, you have a
    line-of-sight problem — break the sightline or add cover.
  - If attackers and defenders mix evenly, it's a contested objective
    working as designed.
- Treat the "loot → combat" corridors as the real map. Turn on the
  Traffic heatmap; the routes between top loot hubs and top kill cells
  are where players actually spend their session. That's where cover,
  ramps, readable silhouettes and safe-peek angles earn their keep.
- The cold parts of the map are a product question, not a bug. If 60–70%
  of the surface area sees almost no combat, either it's beautiful
  flavour space (fine) or it's undercooked real estate that isn't earning
  its footprint. Playtest notes tell you which; the analyser tells you
  where.

**What'll move in the metrics.** Kill-distribution flatness (you want
*some* hotspots — the goal is dialling the ratio, not flattening the
map), loot-to-engagement rotation time (corridor edits should move this),
and time-spent-in-cold-areas for any region you deliberately open up.

---

## How to reproduce any of this in the tool

Every number above came out of the same analyser, using only the sidebar
controls — map, day, match, view mode, event-type toggles, time slider.
Whenever a future build moves these numbers, the same three screens will
show you where and when.
