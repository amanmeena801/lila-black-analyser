# Data Anomalies

Things the pipeline has observed in the raw dataset that don't match the README's stated invariants. None are build-breaking; surfacing them here so the level-design team sees them explicitly.

## 1. Numeric user IDs emitting `Position` events

**README says:** numeric `user_id` = bot; bots emit `BotPosition`, not `Position`.

**What we see:** a small number of numeric-id users emit `Position`. On the Feb 10–14 dataset:

| Map | Offending rows | User IDs involved |
|---|---|---|
| AmbroseValley | 587 | `1429` |

Interpretation options (we don't yet know which):

- Test or staff accounts that use numeric IDs but were treated as humans by the game server.
- A bug in the server's event tagging for a particular bot cohort.
- A dataset labelling slip during export.

**How the tool handles it:** the `is_bot` flag is derived purely from the `user_id` format (numeric vs UUID). The tool therefore trusts the ID, not the event name. Level designers who want "humans only" will filter `is_bot = false` and will not see these rows — which is consistent with what the README implies about ID semantics.

**Action required:** none in code. Flag to the telemetry team so they can confirm the root cause.

## 2. Match durations are not fixed per map

Discovered during the design phase. Covered in `SYSTEM_DESIGN.md` §3. Drove the decision to use a dynamic per-match time slider instead of a fixed-duration phase enum.
