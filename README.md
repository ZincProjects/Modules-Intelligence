# ModIntel

Course intelligence for NTU students. Pulls NTU module data (course catalogue /
public timetable / bidding-exercise sources) into a structured dataset, then puts
a Claude layer on top so you can ask real questions instead of reading PDFs:

- "Which Year 2 CS electives are lightest on workload and fit around a Friday-heavy timetable?"
- "Summarise this module's past exam patterns from the syllabus."
- "What pairs well with the modules I've already picked?"

Shipped as a small web app for coursemates to actually use.

## Status

**Stage 1 (ingest) works.** `npm run scrape` produces a merged course dataset —
82 distinct Computer Science courses for AY2026 semester 1, 69 of them with full
class schedules. Stages 2-4 are not built yet.

## Usage

```bash
npm install
npm run scrape                              # Computer Science, current term
npm run scrape -- --programmes CSC,CE,COMP  # specific programme codes
npm run scrape -- --all                     # all 674 programme-years (slow)
npm run scrape -- --term 2025_2 --force     # a past term, ignoring the cache
```

Output lands in `data/courses-<year>-<sem>.json`; raw NTU responses are cached
under `data/raw/` so re-runs don't hit NTU again. Both are gitignored.

```bash
npm test        # parser tests against real NTU fixtures
npm run typecheck
```

## Data sources

Both are public and need no login:

| Source | Endpoint | Gives us |
| --- | --- | --- |
| Course content | `wish.wis.ntu.edu.sg/webexe/owa/AUS_SUBJ_CONT.main_display1` | code, title, AU, prerequisites, mutual exclusions, restrictions, description |
| Class schedule | `wish.wis.ntu.edu.sg/webexe/owa/AUS_SCHEDULE.main_display1` | class indexes, LEC/TUT/LAB slots, day, time, venue, teaching weeks |

Both are POST forms keyed on an academic term and a programme-year value
(`CSC;;2;F` = Computer Science Year 2). They serve Windows-1252 HTML, which the
client decodes on the way in.

## Layout

```
src/lib/ntu/     client (rate limit + cache + decode), catalogue and schedule parsers
src/lib/         dataset merge across programme-years
scripts/         scrape CLI, dev helpers
tests/           parser tests over trimmed real responses
```

## Planned build order

1. ~~**Ingest** — scrape/collect NTU course data.~~ Done.
2. **Model** — persist to a queryable store; derive workload and timetable signals.
3. **Intelligence** — Claude API layer over the dataset for Q&A and recommendations.
4. **Frontend** — minimal web app, deployed and shared with the cohort.

## Notes

- Requests to NTU are serialised with a 1s gap by default (`--interval` to change)
  and cached on disk. `wish.wis.ntu.edu.sg` serves no robots.txt.
- No credentials committed. Anything auth-related goes through env vars.
