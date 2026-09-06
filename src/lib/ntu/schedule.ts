import * as cheerio from 'cheerio';
import type { AcadSem, ClassSlot, CourseSchedule } from './types.js';
import type { NtuClient } from './client.js';
import { formatAcadSem } from './programmes.js';
import { isCourseCode } from './catalogue.js';

export const SCHEDULE_ENDPOINT = 'AUS_SCHEDULE.main_display1';
export const SCHEDULE_SEARCH_PAGE = 'aus_schedule.main';

const SLOT_HEADERS = ['INDEX', 'TYPE', 'GROUP', 'DAY', 'TIME', 'VENUE', 'REMARK'];

/** Fetches the class schedule for one programme-year in one term. */
export async function fetchSchedule(
  client: NtuClient,
  term: AcadSem,
  programmeValue: string,
): Promise<string> {
  return client.postForm(
    SCHEDULE_ENDPOINT,
    {
      // The schedule page separates year and semester with a semicolon.
      acadsem: formatAcadSem(term, ';'),
      r_course_yr: programmeValue,
      r_subj_code: '',
      r_search_type: 'F',
      boption: 'CLoad',
      staff_access: 'false',
    },
    `schedule-${term.year}${term.semester}-${programmeValue}`,
  );
}

/**
 * Parses a class-schedule listing. NTU alternates a borderless course-header
 * table with a bordered table of class slots. Within the slot table an empty
 * INDEX cell means "same index as the row above".
 */
export function parseSchedule(html: string): CourseSchedule[] {
  const $ = cheerio.load(html);
  const schedules: CourseSchedule[] = [];
  let current: CourseSchedule | null = null;

  $('table').each((_, table) => {
    const rows = $(table).find('tr').toArray();
    if (rows.length === 0) return;

    const header = rows[0]!;
    const headerLabels = $(header).find('th').toArray().map((cell) => collapse($(cell).text()));

    if (SLOT_HEADERS.every((label, index) => headerLabels[index] === label)) {
      if (!current) return;
      let lastIndex = '';
      for (const row of rows.slice(1)) {
        const cells = $(row).find('td').toArray().map((cell) => collapse($(cell).text()));
        if (cells.length < 7) continue;
        const slot = toSlot(cells, lastIndex);
        lastIndex = slot.index;
        current.slots.push(slot);
      }
      return;
    }

    const headerCells = $(header).find('td').toArray().map((cell) => collapse($(cell).text()));
    const [code, title, auText] = headerCells;
    if (headerCells.length !== 3 || !code || !isCourseCode(code) || !title) return;

    current = { code, title, au: parseAu(auText), slots: [] };
    schedules.push(current);
  });

  return schedules;
}

function toSlot(cells: string[], inheritedIndex: string): ClassSlot {
  const time = cells[4] ?? '';
  const { start, end } = parseTimeRange(time);
  return {
    index: cells[0] || inheritedIndex,
    type: cells[1] ?? '',
    group: cells[2] ?? '',
    day: cells[3] || null,
    startMinutes: start,
    endMinutes: end,
    time,
    venue: cells[5] ?? '',
    remark: cells[6] ?? '',
  };
}

/** Turns "0930-1120" into minutes past midnight. */
export function parseTimeRange(value: string): { start: number | null; end: number | null } {
  const match = /^(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})$/.exec(value.trim());
  if (!match) return { start: null, end: null };
  const [, startHour, startMinute, endHour, endMinute] = match;
  return {
    start: Number(startHour) * 60 + Number(startMinute),
    end: Number(endHour) * 60 + Number(endMinute),
  };
}

function parseAu(text: string | undefined): number {
  const match = /(\d+(?:\.\d+)?)\s*AU/i.exec(text ?? '');
  return match ? Number.parseFloat(match[1]!) : 0;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
