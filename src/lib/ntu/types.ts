/** Domain types for data scraped from NTU's public course systems. */

/** An academic term, e.g. AY2026 semester 1. `S` is the Special Term. */
export interface AcadSem {
  year: number;
  semester: '1' | '2' | 'S';
}

/**
 * One entry of NTU's programme dropdown. The site encodes these as
 * `CSC;;2;F` — programme, specialisation, study year, full/part time.
 */
export interface Programme {
  /** Raw dropdown value, used verbatim when posting back to NTU. */
  value: string;
  /** Human label, e.g. "Computer Science Year 2". */
  label: string;
  code: string;
  specialisation: string | null;
  studyYear: number | null;
  /** `F` full-time, `P` part-time. */
  mode: string | null;
}

/** A course as described in the course-content catalogue. */
export interface Course {
  code: string;
  title: string;
  /** Academic Units. */
  au: number;
  description: string;
  prerequisite: string | null;
  gradeType: string | null;
  mutuallyExclusiveWith: string[];
  /** Restriction labels the catalogue attaches, keyed by their original wording. */
  restrictions: Record<string, string>;
}

/** One scheduled meeting of a class index. */
export interface ClassSlot {
  /** Index number students bid for, e.g. "84001". */
  index: string;
  /** LEC/STUDIO, TUT, LAB, SEM... */
  type: string;
  /** Group label, e.g. "LE", "T001". */
  group: string;
  /** MON..SUN, or null when NTU leaves it blank. */
  day: string | null;
  /** Local start time in minutes past midnight. */
  startMinutes: number | null;
  /** Local end time in minutes past midnight. */
  endMinutes: number | null;
  /** Original NTU time string, e.g. "0930-1120". */
  time: string;
  venue: string;
  /** e.g. "Teaching Wk12", "Wk1-13". */
  remark: string;
}

/** Every class index offered for one course in one term. */
export interface CourseSchedule {
  code: string;
  title: string;
  au: number;
  slots: ClassSlot[];
}

/** Result of scraping one programme-year for one term. */
export interface ProgrammeSnapshot {
  acadSem: AcadSem;
  programme: Programme;
  courses: Course[];
  schedules: CourseSchedule[];
  scrapedAt: string;
}
