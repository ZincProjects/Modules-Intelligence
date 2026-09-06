import type { AcadSem, ClassSlot, Course, CourseSchedule, Programme } from './ntu/types.js';

/** A course merged across every programme-year that lists it. */
export interface CourseRecord extends Course {
  /** Programme dropdown values that list this course. */
  offeredTo: string[];
  /** Distinct class indexes students can bid for. */
  indexes: string[];
  slots: ClassSlot[];
}

export interface Dataset {
  term: AcadSem;
  scrapedAt: string;
  programmes: Programme[];
  courses: CourseRecord[];
}

/**
 * Merges per-programme scrapes into one course index. NTU lists the same
 * course under many programme-years, so the same code arrives repeatedly;
 * we keep the richest copy and union the programmes and class slots.
 */
export class DatasetBuilder {
  private readonly courses = new Map<string, CourseRecord>();
  private readonly programmes = new Map<string, Programme>();

  addProgramme(
    programme: Programme,
    courses: Course[],
    schedules: CourseSchedule[],
  ): void {
    this.programmes.set(programme.value, programme);

    for (const course of courses) {
      const record = this.ensure(course);
      addUnique(record.offeredTo, programme.value);
      // Later scrapes sometimes carry a description an earlier one lacked.
      if (!record.description && course.description) record.description = course.description;
      if (!record.prerequisite && course.prerequisite) record.prerequisite = course.prerequisite;
    }

    for (const schedule of schedules) {
      const record = this.ensure({
        code: schedule.code,
        title: schedule.title,
        au: schedule.au,
        description: '',
        prerequisite: null,
        gradeType: null,
        mutuallyExclusiveWith: [],
        restrictions: {},
      });
      addUnique(record.offeredTo, programme.value);

      const seen = new Set(record.slots.map(slotKey));
      for (const slot of schedule.slots) {
        if (seen.has(slotKey(slot))) continue;
        seen.add(slotKey(slot));
        record.slots.push(slot);
        addUnique(record.indexes, slot.index);
      }
    }
  }

  build(term: AcadSem): Dataset {
    const courses = [...this.courses.values()].sort((a, b) => a.code.localeCompare(b.code));
    for (const course of courses) {
      course.offeredTo.sort();
      course.indexes.sort();
      course.slots.sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
    }
    return {
      term,
      scrapedAt: new Date().toISOString(),
      programmes: [...this.programmes.values()],
      courses,
    };
  }

  private ensure(course: Course): CourseRecord {
    const existing = this.courses.get(course.code);
    if (existing) {
      if (!existing.title && course.title) existing.title = course.title;
      if (!existing.au && course.au) existing.au = course.au;
      for (const code of course.mutuallyExclusiveWith) {
        addUnique(existing.mutuallyExclusiveWith, code);
      }
      Object.assign(existing.restrictions, course.restrictions);
      return existing;
    }
    const record: CourseRecord = { ...course, offeredTo: [], indexes: [], slots: [] };
    this.courses.set(course.code, record);
    return record;
  }
}

function slotKey(slot: ClassSlot): string {
  return [slot.index, slot.type, slot.group, slot.day, slot.time, slot.venue, slot.remark].join('|');
}

function addUnique(list: string[], value: string): void {
  if (value && !list.includes(value)) list.push(value);
}
