import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCatalogue, isCourseCode } from '../src/lib/ntu/catalogue.js';
import { parseSchedule, parseTimeRange } from '../src/lib/ntu/schedule.js';
import { parseAcadSems, parseProgrammes, parseProgrammeValue } from '../src/lib/ntu/programmes.js';
import { DatasetBuilder } from '../src/lib/dataset.js';

const fixture = (name: string): string =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

describe('catalogue', () => {
  const courses = parseCatalogue(fixture('catalogue-csc-y2.html'));

  it('extracts every course table', () => {
    expect(courses).toHaveLength(12);
    expect(courses.every((course) => isCourseCode(course.code))).toBe(true);
  });

  it('reads code, title and AU from the header row', () => {
    const course = courses[0]!;
    expect(course.code).toBe('CC0002');
    expect(course.title).toBe('NAVIGATING THE DIGITAL WORLD');
    expect(course.au).toBe(2);
  });

  it('captures descriptions', () => {
    expect(courses[0]!.description).toContain('computational thinking');
  });

  it('splits mutually exclusive course lists', () => {
    expect(courses[0]!.mutuallyExclusiveWith).toEqual(['AB1401']);
  });

  it('keeps restriction labels as given by NTU', () => {
    const ml0003 = courses.find((course) => course.code === 'ML0003')!;
    expect(ml0003.restrictions['Not available to all Programme with']).toContain('Yr1');
  });

  it('leaves restrictions out when NTU renders the label with no value', () => {
    // CC0002 carries an empty "Not available to all Programme with:" row.
    expect(courses[0]!.restrictions).toEqual({});
  });

  it('joins prerequisite expressions that span multiple rows', () => {
    const hw0288 = courses.find((course) => course.code === 'HW0288')!;
    expect(hw0288.prerequisite).toBe(
      'Year 3 standing HW0188 (Not Applicable to IEM) OR HW0111 (Not Applicable to IEM) OR CC0001 (Not Applicable to IEM)',
    );
  });

  it('separates structured fields from restrictions', () => {
    const mh2802 = courses.find((course) => course.code === 'MH2802')!;
    expect(mh2802.mutuallyExclusiveWith).toContain('MH1200');
    expect(Object.keys(mh2802.restrictions)).toEqual([
      'Not available to Programme',
      'Not available as BDE/UE to Programme',
      'Not available as Core to Programme',
    ]);
  });
});

describe('schedule', () => {
  const schedules = parseSchedule(fixture('schedule-csc-y2.html'));

  it('groups slots under their course', () => {
    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules[0]!.code).toBe('CC0006');
    expect(schedules[0]!.slots.length).toBeGreaterThan(0);
  });

  it('carries a blank index down from the row above', () => {
    const slots = schedules[0]!.slots;
    expect(slots[0]!.index).toBe('84001');
    expect(slots.every((slot) => slot.index !== '')).toBe(true);
  });

  it('converts NTU times to minutes past midnight', () => {
    expect(parseTimeRange('0930-1120')).toEqual({ start: 570, end: 680 });
    expect(parseTimeRange('1830-2120')).toEqual({ start: 1110, end: 1280 });
  });

  it('returns nulls for times it cannot read', () => {
    expect(parseTimeRange('')).toEqual({ start: null, end: null });
    expect(parseTimeRange('TBA')).toEqual({ start: null, end: null });
  });
});

describe('programmes', () => {
  const html = fixture('catalogue-landing.html');

  it('reads the programme dropdown', () => {
    const programmes = parseProgrammes(html);
    expect(programmes.length).toBeGreaterThan(500);
    const csYear2 = programmes.find((programme) => programme.value === 'CSC;;2;F');
    expect(csYear2?.label).toBe('Computer Science Year 2');
    expect(csYear2?.studyYear).toBe(2);
  });

  it('skips the placeholder option', () => {
    expect(parseProgrammes(html).some((programme) => programme.value === '')).toBe(false);
  });

  it('splits the dropdown encoding', () => {
    expect(parseProgrammeValue('CSC;;2;F')).toEqual({
      code: 'CSC',
      specialisation: null,
      studyYear: 2,
      mode: 'F',
    });
    expect(parseProgrammeValue('ACC;GA;3;F').specialisation).toBe('GA');
  });

  it('reads academic terms', () => {
    const terms = parseAcadSems(html);
    expect(terms).toContainEqual({ year: 2026, semester: '1' });
    expect(terms.some((term) => term.semester === 'S')).toBe(true);
  });
});

describe('dataset', () => {
  it('merges the same course seen under several programmes', () => {
    const courses = parseCatalogue(fixture('catalogue-csc-y2.html'));
    const schedules = parseSchedule(fixture('schedule-csc-y2.html'));
    const builder = new DatasetBuilder();

    builder.addProgramme(programme('CSC;;2;F'), courses, schedules);
    builder.addProgramme(programme('CE;;2;F'), courses, schedules);
    const dataset = builder.build({ year: 2026, semester: '1' });

    const cc0006 = dataset.courses.find((course) => course.code === 'CC0006')!;
    expect(cc0006.offeredTo).toEqual(['CE;;2;F', 'CSC;;2;F']);
    // Slots must not be duplicated by the second programme.
    const scheduled = schedules.find((schedule) => schedule.code === 'CC0006')!;
    expect(cc0006.slots).toHaveLength(new Set(scheduled.slots.map((s) => JSON.stringify(s))).size);
  });
});

function programme(value: string) {
  return { value, label: value, ...parseProgrammeValue(value) };
}
