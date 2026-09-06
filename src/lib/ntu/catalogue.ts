import * as cheerio from 'cheerio';
import type { AcadSem, Course } from './types.js';
import type { NtuClient } from './client.js';
import { formatAcadSem } from './programmes.js';

export const CATALOGUE_ENDPOINT = 'AUS_SUBJ_CONT.main_display1';
export const CATALOGUE_SEARCH_PAGE = 'aus_subj_cont.main';

/** Labels the catalogue uses for structured fields, rather than restrictions. */
const PREREQUISITE_LABEL = 'Prerequisite:';
const MUTUALLY_EXCLUSIVE_LABEL = 'Mutually exclusive with:';
const GRADE_TYPE_LABEL = 'Grade Type:';

/** Fetches the course-content listing for one programme-year in one term. */
export async function fetchCatalogue(
  client: NtuClient,
  term: AcadSem,
  programmeValue: string,
): Promise<string> {
  return client.postForm(
    CATALOGUE_ENDPOINT,
    {
      acadsem: formatAcadSem(term, '_'),
      r_course_yr: programmeValue,
      r_subj_code: '',
      boption: 'CLoad',
      acad: String(term.year),
      semester: term.semester,
    },
    `catalogue-${term.year}${term.semester}-${programmeValue}`,
  );
}

/**
 * Parses a course-content listing. NTU renders one `<table>` per course:
 * a header row of code/title/AU, then label rows, then a full-width
 * description row. Label rows with a blank label continue the row above —
 * that is how multi-line prerequisite expressions are laid out.
 */
export function parseCatalogue(html: string): Course[] {
  const $ = cheerio.load(html);
  const courses: Course[] = [];

  $('table').each((_, table) => {
    const rows = $(table).find('tr').toArray();
    const header = rows[0];
    if (!header) return;

    const headerCells = $(header).find('td').toArray().map((cell) => collapse($(cell).text()));
    const [code, title, auText] = headerCells;
    // Course tables always lead with a code/title/AU triple; anything else is layout.
    if (headerCells.length !== 3 || !code || !isCourseCode(code) || !title) return;

    const fields = new Map<string, string[]>();
    let lastLabel: string | null = null;
    let description = '';

    for (const row of rows.slice(1)) {
      const cells = $(row).find('td').toArray();

      if (cells.length === 1) {
        description = normaliseText($(cells[0]!).text());
        continue;
      }
      if (cells.length !== 2) continue;

      const label = collapse($(cells[0]!).text());
      const value = collapse($(cells[1]!).text());
      if (!value) continue;

      // A blank label continues the previous field onto another line.
      const key: string | null = label || lastLabel;
      if (!key) continue;
      const existing = fields.get(key);
      if (existing) existing.push(value);
      else fields.set(key, [value]);
      lastLabel = key;
    }

    const restrictions: Record<string, string> = {};
    for (const [label, values] of fields) {
      if (label === PREREQUISITE_LABEL || label === MUTUALLY_EXCLUSIVE_LABEL) continue;
      if (label === GRADE_TYPE_LABEL) continue;
      restrictions[label.replace(/:$/, '')] = values.join(' ');
    }

    courses.push({
      code,
      title,
      au: parseAu(auText),
      description,
      prerequisite: fields.get(PREREQUISITE_LABEL)?.join(' ') ?? null,
      gradeType: fields.get(GRADE_TYPE_LABEL)?.join(' ') ?? null,
      mutuallyExclusiveWith: splitCodes(fields.get(MUTUALLY_EXCLUSIVE_LABEL)?.join(', ')),
      restrictions,
    });
  });

  return courses;
}

/** NTU course codes are 2-4 letters followed by digits, e.g. SC2002, HW0188. */
export function isCourseCode(value: string): boolean {
  return /^[A-Z]{2,4}\d{3,4}[A-Z]?$/.test(value);
}

function parseAu(text: string | undefined): number {
  const match = /(\d+(?:\.\d+)?)\s*AU/i.exec(text ?? '');
  return match ? Number.parseFloat(match[1]!) : 0;
}

function splitCodes(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Keeps paragraph breaks in descriptions but drops NTU's ragged wrapping. */
function normaliseText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
