/**
 * Scrapes NTU's public course systems into data/courses-<term>.json.
 *
 *   npm run scrape -- --programmes CSC,CE          # matching programme codes
 *   npm run scrape -- --all                        # every programme-year (slow)
 *   npm run scrape -- --term 2026_1 --force        # ignore the on-disk cache
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NtuClient } from '../src/lib/ntu/client.js';
import { fetchCatalogue, parseCatalogue, CATALOGUE_SEARCH_PAGE } from '../src/lib/ntu/catalogue.js';
import { fetchSchedule, parseSchedule } from '../src/lib/ntu/schedule.js';
import { acadSemId, parseAcadSems, parseProgrammes } from '../src/lib/ntu/programmes.js';
import type { AcadSem, Programme } from '../src/lib/ntu/types.js';
import { DatasetBuilder } from '../src/lib/dataset.js';

const DATA_DIR = join(process.cwd(), 'data');
const CACHE_DIR = join(DATA_DIR, 'raw');

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const client = new NtuClient({
    cacheDir: CACHE_DIR,
    minIntervalMs: args.intervalMs,
    force: args.force,
    onRequest: ({ key, cached }) => {
      if (!cached) console.log(`  fetched ${key}`);
    },
  });

  const landing = await client.get(CATALOGUE_SEARCH_PAGE, 'catalogue-landing');
  const allProgrammes = parseProgrammes(landing);
  const terms = parseAcadSems(landing);
  const term = args.term ?? latestTerm(terms);
  if (!term) throw new Error('Could not determine an academic term from NTU.');

  const programmes = selectProgrammes(allProgrammes, args.programmes, args.all);
  if (programmes.length === 0) {
    console.error('No programmes matched. Available codes include:');
    console.error(sampleCodes(allProgrammes));
    process.exitCode = 1;
    return;
  }

  console.log(`ModIntel scrape - AY${term.year} semester ${term.semester}`);
  console.log(`${programmes.length} programme-year(s), ${args.intervalMs}ms between requests\n`);

  const builder = new DatasetBuilder();
  const failures: string[] = [];

  for (const [position, programme] of programmes.entries()) {
    const progress = `[${position + 1}/${programmes.length}]`;
    console.log(`${progress} ${programme.label} (${programme.value})`);
    try {
      const catalogueHtml = await fetchCatalogue(client, term, programme.value);
      const scheduleHtml = await fetchSchedule(client, term, programme.value);
      const courses = parseCatalogue(catalogueHtml);
      const schedules = parseSchedule(scheduleHtml);
      builder.addProgramme(programme, courses, schedules);
      console.log(`         ${courses.length} courses, ${schedules.length} with schedules`);
    } catch (error) {
      failures.push(programme.value);
      console.error(`         failed: ${(error as Error).message}`);
    }
  }

  const dataset = builder.build(term);
  await mkdir(DATA_DIR, { recursive: true });
  const outputPath = join(DATA_DIR, `courses-${acadSemId(term)}.json`);
  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  const withSlots = dataset.courses.filter((course) => course.slots.length > 0).length;
  console.log(`\n${dataset.courses.length} distinct courses (${withSlots} with class slots)`);
  if (failures.length > 0) console.log(`${failures.length} programme(s) failed: ${failures.join(', ')}`);
  console.log(`wrote ${outputPath}`);
}

interface Args {
  term: AcadSem | null;
  programmes: string[];
  all: boolean;
  force: boolean;
  intervalMs: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { term: null, programmes: [], all: false, force: false, intervalMs: 1000 };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--all':
        args.all = true;
        break;
      case '--force':
        args.force = true;
        break;
      case '--term': {
        const match = /^(\d{4})[_;-]?(1|2|S)$/.exec(value ?? '');
        if (!match) throw new Error(`--term expects something like 2026_1, got ${value}`);
        args.term = { year: Number(match[1]), semester: match[2] as AcadSem['semester'] };
        i++;
        break;
      }
      case '--programmes':
        args.programmes = (value ?? '').split(',').map((part) => part.trim().toUpperCase()).filter(Boolean);
        i++;
        break;
      case '--interval':
        args.intervalMs = Number(value);
        i++;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function selectProgrammes(all: Programme[], codes: string[], wantAll: boolean): Programme[] {
  if (wantAll) return all;
  if (codes.length === 0) return all.filter((programme) => programme.code === 'CSC');
  return all.filter((programme) => codes.includes(programme.code.toUpperCase()));
}

function latestTerm(terms: AcadSem[]): AcadSem | undefined {
  // The dropdown is chronological, so the last regular semester is the current one.
  return [...terms].reverse().find((term) => term.semester !== 'S') ?? terms.at(-1);
}

function sampleCodes(programmes: Programme[]): string {
  return [...new Set(programmes.map((programme) => programme.code))].slice(0, 40).join(', ');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
