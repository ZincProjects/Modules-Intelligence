import * as cheerio from 'cheerio';
import type { AcadSem, Programme } from './types.js';

/** Parses `CSC;;2;F` into its parts. */
export function parseProgrammeValue(value: string): Omit<Programme, 'value' | 'label'> {
  const [code = '', specialisation = '', studyYear = '', mode = ''] = value.split(';');
  const year = Number.parseInt(studyYear, 10);
  return {
    code,
    specialisation: specialisation || null,
    studyYear: Number.isNaN(year) ? null : year,
    mode: mode || null,
  };
}

/** Reads the programme dropdown off either NTU search page. */
export function parseProgrammes(html: string): Programme[] {
  const $ = cheerio.load(html);
  const programmes: Programme[] = [];

  $('select[name="r_course_yr"] option').each((_, element) => {
    const value = ($(element).attr('value') ?? '').trim();
    // The placeholder option carries no value.
    if (!value) return;
    programmes.push({
      value,
      label: collapse($(element).text()),
      ...parseProgrammeValue(value),
    });
  });

  return programmes;
}

/** Reads the academic-term dropdown. Values differ per page, so normalise them. */
export function parseAcadSems(html: string): AcadSem[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const terms: AcadSem[] = [];

  $('select[name="acadsem"] option').each((_, element) => {
    const value = ($(element).attr('value') ?? '').trim();
    // Course content uses `2026_1`; the schedule page uses `2026;1`.
    const match = /^(\d{4})[_;](1|2|S)$/.exec(value);
    if (!match || seen.has(value)) return;
    seen.add(value);
    terms.push({ year: Number.parseInt(match[1]!, 10), semester: match[2] as AcadSem['semester'] });
  });

  return terms;
}

export function formatAcadSem(term: AcadSem, separator: '_' | ';'): string {
  return `${term.year}${separator}${term.semester}`;
}

export function acadSemId(term: AcadSem): string {
  return `${term.year}-${term.semester}`;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
