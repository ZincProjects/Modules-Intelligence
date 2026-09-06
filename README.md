# ModIntel

Course intelligence for NTU students. Pulls NTU module data (course catalogue /
public timetable / bidding-exercise sources) into a structured dataset, then puts
a Claude layer on top so you can ask real questions instead of reading PDFs:

- "Which Year 2 CS electives are lightest on workload and fit around a Friday-heavy timetable?"
- "Summarise this module's past exam patterns from the syllabus."
- "What pairs well with the modules I've already picked?"

Shipped as a small web app for coursemates to actually use.

## Status

Pre-alpha — nothing built yet.

## Planned build order

1. **Ingest** — scrape/collect NTU course data, handle auth where needed.
2. **Model** — normalise into a queryable schema (modules, prereqs, timetable slots, exam formats).
3. **Intelligence** — Claude API layer over the dataset for Q&A and recommendations.
4. **Frontend** — minimal web app, deployed and shared with the cohort.

## Notes

- Respect NTU's terms of use and robots.txt on anything scraped; cache aggressively
  rather than hammering source systems.
- No credentials committed. Anything auth-related goes through env vars.
