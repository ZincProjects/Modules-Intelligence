/** Dev helper: prints parsed fields for a catalogue HTML file. */
import { readFileSync } from 'node:fs';
import { parseCatalogue } from '../../src/lib/ntu/catalogue.js';

const path = process.argv[2] ?? 'tests/fixtures/catalogue-csc-y2.html';
for (const course of parseCatalogue(readFileSync(path, 'utf8'))) {
  console.log(
    [
      course.code,
      `${course.au}AU`,
      `prereq=${JSON.stringify(course.prerequisite)}`,
      `mx=${course.mutuallyExclusiveWith.join('/') || '-'}`,
      `restr=${JSON.stringify(course.restrictions)}`,
      `desc=${course.description.length}`,
    ].join(' | '),
  );
}
