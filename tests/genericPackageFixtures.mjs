// =====================================================
// A generic-page submission, built identically before and after a change
// =====================================================
// The inputs behind `tests/fixtures/generic_package_golden_0b82d9b.json`
// (`WORKORDER_SS_MULTIPART_PAGES_2026-10-07`, S3). Five photographed pages of
// the generic answer page, labelled the only way the app at `0b82d9b` could
// label them, one part per page:
//
//   page_1.jpg  1(a)        a part of a multi-part problem, ink present
//   page_2.jpg  2           a one-part problem, ink none, flagged by the student
//   page_3.jpg  (nothing)   an unlabelled page, ink uncertain
//   page_4.jpg  1(a)        the same part again: one part over two pages
//   page_5.jpg  1(b)        the other part of problem 1
//
// Every input is pinned (the clock, the ids, the bytes), so the same code
// builds the same archive on every machine. **How the pages are labelled is
// passed in**, so the golden was written through `labelGenericCrop` at
// `0b82d9b` and the new code is held to it through its own controls.
//
// The fixture is invented: no question text, no answer, no person's name.
// =====================================================

import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesFor } from './packageFixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const GENERIC_GOLDEN_PATH = join(HERE, 'fixtures', 'generic_package_golden_0b82d9b.json');
export const GENERIC_NOW = '2026-10-07T10:00:00.000Z';
const LAYOUT_ID = '5F0B10BC';

export const genericParts = () => [
  { part_id: '1(a)', problem_number: 1, subsection_letter: 'a', label: 'Problem 1, part (a)', max_points: 30 },
  { part_id: '1(b)', problem_number: 1, subsection_letter: 'b', label: 'Problem 1, part (b)', max_points: 20 },
  { part_id: '2', problem_number: 2, subsection_letter: 'a', label: 'Problem 2', max_points: 50 },
];

export const genericAssignment = (parts = genericParts()) => ({
  id: 'golden-generic', courseCode: 'ENG17', title: 'Generic Golden', preamble: '',
  createdAt: 0, updatedAt: 0, inputMode: 'handwritten', sheet: 'generic', parts,
  problems: [
    { id: 'p1', name: 'One', description: '', subsections: [
      { id: 's1', name: 'Node voltage', description: '', points: 30, submissionType: 'Handwritten' },
      { id: 's2', name: 'Power', description: '', points: 20, submissionType: 'Handwritten' },
    ] },
    { id: 'p2', name: 'Two', description: '', subsections: [
      { id: 's1', name: 'Thevenin equivalent', description: '', points: 50, submissionType: 'Handwritten' },
    ] },
  ],
});

/**
 * The S1 and S2 assignment (`WORKORDER_SS_MULTIPART_PAGES_2026-10-07`): one
 * one-part problem, `1`, and one four-part problem, `2(a)` to `2(d)`.
 */
export const multipartParts = () => [
  { part_id: '1', problem_number: 1, subsection_letter: 'a', label: 'Problem 1', max_points: 20 },
  ...['a', 'b', 'c', 'd'].map(l => ({
    part_id: `2(${l})`, problem_number: 2, subsection_letter: l, label: `Problem 2, part (${l})`, max_points: 20,
  })),
];

export const multipartAssignment = () => ({
  ...genericAssignment(multipartParts()),
  id: 'multipart-pages', title: 'Multipart Pages',
  problems: [
    { id: 'p1', name: 'Resistor choice', description: '', subsections: [
      { id: 's1', name: 'Select R', description: '', points: 20, submissionType: 'Handwritten' },
    ] },
    { id: 'p2', name: 'Source superposition', description: '', subsections: ['Open-circuit voltage',
      'Short-circuit current', 'Thevenin resistance', 'Load power'].map((name, i) => (
      { id: `s${i + 1}`, name, description: '', points: 20, submissionType: 'Handwritten' })) },
  ],
});

/** Page ids in capture order, and the one-part label each gets in the old flow ('' = unlabelled). */
export const OLD_FLOW_LABELS = [
  ['pg1', '1(a)'], ['pg2', '2'], ['pg3', ''], ['pg4', '1(a)'], ['pg5', '1(b)'],
];

const INK = [
  { inkVerdict: 'ink', inkBox: { x0: 34, y0: 108, x1: 906, y1: 525 }, qualityFlags: [], review: 'signed_off' },
  { inkVerdict: 'blank', inkBox: null, qualityFlags: ['looks-empty'], review: 'flagged' },
  { inkVerdict: 'uncertain', inkBox: null, qualityFlags: [], review: 'not_reviewed' },
  { inkVerdict: 'ink', inkBox: { x0: 40, y0: 60, x1: 1200, y1: 1300 }, qualityFlags: [], review: 'signed_off' },
  { inkVerdict: 'ink', inkBox: { x0: 12, y0: 20, x1: 700, y1: 400 }, qualityFlags: [], review: 'not_reviewed' },
];

/**
 * The pages, the unlabelled crop records exactly as `genericCropRecord` makes
 * them, and the bytes behind each. `pageIds` defaults to the five above.
 */
export const genericPagesAndCrops = (P, pageIds = OLD_FLOW_LABELS.map(([id]) => id)) => {
  const blobs = {};
  const pages = [];
  let crops = {};
  pageIds.forEach((id, i) => {
    const pageBytes = bytesFor(200 + i, 3000 + i * 7);
    const cropBytes = bytesFor(300 + i, 1800 + i * 5);
    blobs[id] = pageBytes;
    pages.push({ id, file: `page_${i + 1}.jpg`, width: 1650, height: 2200, bytes: pageBytes.length,
      registration: { status: 'ok', k: 1, n: 1, layoutId: LAYOUT_ID, marksFound: 4,
        marksDetected: ['NW', 'NE', 'SW', 'SE'], marksDeclined: [], residualMm: 0.2, heldOutMm: 0 },
      captureId: `cap-${id}` });
    const ink = INK[i % INK.length];
    const record = P.genericCropRecord({
      row: { regionId: 'gen', pageK: 1, isDrawing: false, maxPoints: 0 },
      width: 1325 + i, height: 1381 + i, bytes: cropBytes.length,
      flags: ink.qualityFlags, inkBox: ink.inkBox, inkVerdict: ink.inkVerdict,
    }, id, [], `c-${id}`);
    blobs[P.cropBlobKey(record.regionId)] = cropBytes;
    crops = P.mergeRecutCrops(crops, { [record.regionId]: { ...record, review: ink.review } });
  });
  return { pages, crops, blobs };
};

/**
 * Builds the package and reduces it to what a comparison needs: entry names in
 * archive order, the payload text exactly as written, and every entry's bytes
 * by SHA-256.
 */
export const buildGeneric = async (P, assignment, pages, crops, blobs) => {
  const s = { assignment, submissionData: {}, isHandwritten: true, layoutId: LAYOUT_ID,
    pages, crops, now: GENERIC_NOW };
  const sources = { ...s, personalInfoConfirmation: P.confirmPersonalInfo(s) };
  const built = await P.buildSubmissionPackage(sources, {
    readBlob: async (k) => blobs[k] ?? null, downsampleImage: async (u) => u,
  });
  const files = {};
  for (const name of built.entries) {
    const bytes = await built.zip.file(name).async('uint8array');
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  const payloadName = built.entries.find(e => e.endsWith('.json'));
  const serialised = await built.zip.file(payloadName).async('string');
  return { entries: built.entries, serialised, files, payload: JSON.parse(serialised), built };
};
