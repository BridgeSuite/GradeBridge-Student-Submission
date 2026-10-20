// =====================================================
// The fixed-layout PDF, and the blank template beside it
// =====================================================
// `workorders/WORKORDER_SS_CANVAS_UPLOAD_2026-10-19.md`, tasks 1 to 3, against
// the geometry in `workorders/CONTRACT_HOMEWORK_TO_GRADESCOPE_v1_2026-10-19.md`
// section 3 (`GBHW-1`).
//
//   node tests/fixed-layout-tests.mjs
//
// **Positions are read out of the PDF, not off a screen.** Every assertion
// below parses the page content streams and compares the drawing operators
// with the contract's numbers, because the failure this guards against is a
// few points of drift: one template aligns every submission in the class, and
// a crop placed slightly wrong is a student's answer under someone else's
// question. jsPDF draws rectangles downward from the top-left corner, so a
// height arrives negative and the page's own y is measured from the bottom;
// both are converted back here rather than asserted in jsPDF's frame.
//
// Images are invented bytes. No student work, no model call.
// =====================================================

import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import { loadModule } from './captureSet.mjs';

let passed = 0, failed = 0;
const results = [];
const check = (name, fn) => {
  try { fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertEqual = (actual, expected, msg) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n          expected: ${e}\n          actual:   ${a}`);
};
const near = (actual, expected, msg, tol = 0.01) => {
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
};

console.log('\nthe fixed-layout PDF — one geometry, two documents\n');

const FL = await loadModule('services/fixedLayout.ts', 'fixedLayout.mjs');
const PDF = await loadModule('services/fixedLayoutPdf.ts', 'fixedLayoutPdf.mjs');

// ---------- the fixture ----------
const part = (id, label) => ({
  part_id: id, problem_number: 1, subsection_letter: 'a', label, max_points: 6,
});
const PARTS = [
  part('1(a)', 'Problem 1, part (a)'),
  part('1(b)', 'Problem 1, part (b)'),
  part('2', 'Problem 2'),
];
// One part with two pages, one with one, one with none: the work order's case.
const CROPS = [
  { key: '1a_1', partId: '1(a)', partPage: 1, width: 100, height: 50 },
  { key: '1a_2', partId: '1(a)', partPage: 2, width: 100, height: 50 },
  { key: '1b_1', partId: '1(b)', partPage: 1, width: 50, height: 100 },
];
const image = (w, h) => ({
  bytes: new Uint8Array(jpeg.encode({ data: Buffer.alloc(w * h * 4, 0xcc), width: w, height: h }, 80).data),
  format: 'JPEG', width: w, height: h,
});
const IMAGES = { '1a_1': image(100, 50), '1a_2': image(100, 50), '1b_1': image(50, 100) };
const imageFor = (k) => IMAGES[k] ?? null;

// ---------- reading a PDF back ----------
/** The page content streams, in page order, with the image XObjects left out. */
const contentStreams = (bytes) => Buffer.from(bytes).toString('latin1')
  .split(/\d+ 0 obj/)
  .filter(s => /stream/.test(s) && !/\/Image/.test(s.split('stream')[0]))
  .map(s => s.slice(s.indexOf('stream') + 'stream'.length, s.indexOf('endstream')));

/** Every rectangle, in the contract's frame: x and y from the top left. */
const rects = (stream) => [...stream.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g)]
  .map(m => ({ x: +m[1], y: 792 - +m[2], w: +m[3], h: Math.abs(+m[4]) }));

/** Every placed image, likewise. */
const placements = (stream) => [...stream.matchAll(/(-?[\d.]+) 0 0 (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)]
  .map(m => ({ w: +m[1], h: +m[2], x: +m[3], y: 792 - (+m[4] + +m[2]) }));

const texts = (stream) => [...stream.matchAll(/\((.*?)\) Tj/g)].map(m => m[1].replace(/\\([()])/g, '$1'));

const plan = FL.planFixedLayout(PARTS, CROPS);
const student = PDF.drawFixedLayout(plan, { assignmentId: 'EEC170_Homework_4', imageFor });
const template = PDF.drawBlankTemplate(plan, 'EEC170_Homework_4');
const sheets = contentStreams(student.bytes);
const blanks = contentStreams(template.bytes);

// =====================================================
// 1. The page plan
// =====================================================
results.push('  1. the page plan');

check('one name page, then every part\'s allotted pages, whatever was submitted', () =>
  assertEqual(plan.pages.map(p => p.kind === 'name' ? 'name' : `${p.partId}#${p.slot}:${p.crops.length}`),
    ['name', '1(a)#1:1', '1(a)#2:1', '1(b)#1:1', '1(b)#2:0', '2#1:0', '2#2:0'],
    'the page order is not the contract\'s'));

check('the page count is 1 plus the sum of the allotments, which is what R7 checks', () => {
  assertEqual(plan.pages.length, 7, 'page count');
  assertEqual(FL.templateLength(PARTS), 7, 'templateLength disagrees with the plan');
});

check('the payload block names each part\'s first page and what was placed', () =>
  assertEqual(plan.parts, [
    { part_id: '1(a)', allotment: 2, first_page: 2, placed: ['1a_1', '1a_2'], fitted: false },
    { part_id: '1(b)', allotment: 2, first_page: 4, placed: ['1b_1'], fitted: false },
    { part_id: '2', allotment: 2, first_page: 6, placed: [], fitted: false },
  ], 'the fixed_layout parts block changed'));

check('an absent allotment is two, and every reader applies that default', () => {
  assertEqual(FL.allotmentOf({ part_id: 'x' }), 2, 'absent');
  assertEqual(FL.allotmentOf({ part_id: 'x', allotment: 3 }), 3, 'set');
  assertEqual(FL.allotmentOf({ part_id: 'x', allotment: 0 }), 2, 'zero is not an allotment');
  assertEqual(FL.allotmentOf({ part_id: 'x', allotment: 2.5 }), 2, 'a fraction is not an allotment');
});

// =====================================================
// 2. The geometry, read out of the PDF
// =====================================================
results.push('  2. the geometry, read out of the PDF');

check('seven pages in the document, one content stream each', () => {
  assertEqual(student.pages, 7, 'reported pages');
  assertEqual(sheets.length, 7, 'content streams');
});

check('page 1 carries the name box and the student number box, where section 3 puts them', () => {
  const [name, id] = rects(sheets[0]);
  assertEqual([name.x, name.y, name.w, name.h], [72, 180, 468, 60], 'name box');
  assertEqual([id.x, id.y, id.w, id.h], [72, 300, 468, 60], 'student number box');
});

check('page 1 labels both boxes, and carries no part label', () => {
  const t = texts(sheets[0]);
  assert(t.includes('Name') && t.includes('Student ID'), `page 1 labels: ${t.join(' | ')}`);
  assert(!t.some(s => /page \d+ of \d+$/.test(s) && /part/.test(s)), 'a part label reached the name page');
});

check('an allotted page with nothing on it outlines the whole answer area', () => {
  const [area] = rects(sheets[4]);
  assertEqual([area.x, area.y, area.w, area.h], [36, 90, 540, 666], 'answer area');
});

check('every page carries the assignment and its own number in the footer', () => {
  sheets.forEach((s, i) => {
    const t = texts(s);
    assert(t.includes('EEC170_Homework_4'), `page ${i + 1} has no assignment id`);
    assert(t.includes(`page ${i + 1} of 7`), `page ${i + 1} footer: ${t.join(' | ')}`);
  });
});

check('each answer page says which part it is, and which of its pages', () => {
  assert(texts(sheets[1]).includes('Problem 1, part (a), page 1 of 2'), texts(sheets[1]).join(' | '));
  assert(texts(sheets[2]).includes('Problem 1, part (a), page 2 of 2'), texts(sheets[2]).join(' | '));
  assert(texts(sheets[5]).includes('Problem 2, page 1 of 2'), texts(sheets[5]).join(' | '));
});

check('a page the student submitted nothing for says so, rather than being left blank', () =>
  assert(texts(sheets[4]).includes('No page submitted for this part'), texts(sheets[4]).join(' | ')));

// =====================================================
// 3. Where each crop landed
// =====================================================
results.push('  3. where each crop landed');

check('each crop is on its own part\'s page, in the student\'s order', () =>
  assertEqual(student.images.map(i => [i.page, i.key]),
    [[2, '1a_1'], [3, '1a_2'], [4, '1b_1']], 'placements'));

check('a wide page fills the width and is centred down the answer area', () => {
  const [p] = placements(sheets[1]);
  near(p.w, 540, 'width'); near(p.h, 270, 'height');
  near(p.x, 36, 'x'); near(p.y, 288, 'y');
});

check('a tall page fills the height and is centred across it', () => {
  const [p] = placements(sheets[3]);
  near(p.w, 333, 'width'); near(p.h, 666, 'height');
  near(p.x, 139.5, 'x'); near(p.y, 90, 'y');
});

check('aspect is kept, so nothing a student wrote is stretched', () => {
  student.images.forEach(i => {
    const src = IMAGES[i.key];
    near(i.w / i.h, src.width / src.height, `${i.key} aspect`, 0.001);
  });
});

check('no crop is drawn outside the answer area', () =>
  student.images.forEach(i => {
    assert(i.x >= 36 - 0.01 && i.y >= 90 - 0.01 && i.x + i.w <= 576 + 0.01 && i.y + i.h <= 756 + 0.01,
      `${i.key} at ${JSON.stringify(i)}`);
  }));

// =====================================================
// 4. The blank template is the same document without the pages
// =====================================================
results.push('  4. the blank template');

check('the template has the same pages as the student\'s document', () =>
  assertEqual([template.pages, blanks.length], [7, 7], 'template pages'));

check('the template draws exactly the contract\'s rectangles, page by page', () => {
  assertEqual(rects(blanks[0]).map(r => [r.x, r.y, r.w, r.h]),
    [[72, 180, 468, 60], [72, 300, 468, 60]], 'the template\'s name page');
  for (let i = 1; i < blanks.length; i += 1) {
    assertEqual(rects(blanks[i]).map(r => [r.x, r.y, r.w, r.h]), [[36, 90, 540, 666]],
      `the template\'s page ${i + 1}`);
  }
});

check('where the student\'s document outlines anything, it is the template\'s rectangle', () =>
  sheets.forEach((s, i) => {
    const drawn = rects(s);
    if (!drawn.length) return;   // a page filled by a crop outlines nothing
    assertEqual(drawn, rects(blanks[i]), `page ${i + 1} differs from the template`);
  }));

check('the template places no image at all', () => {
  assertEqual(template.images, [], 'the template reports a placement');
  blanks.forEach((s, i) => assertEqual(placements(s), [], `page ${i + 1} draws an image`));
});

check('the template outlines every answer area, including the ones a student filled', () =>
  [1, 2, 3, 4, 5, 6].forEach(i => {
    const [area] = rects(blanks[i]);
    assertEqual([area.x, area.y, area.w, area.h], [36, 90, 540, 666], `page ${i + 1} answer area`);
  }));

check('the template does not say a page is missing: nobody submitted anything to it', () =>
  blanks.forEach((s, i) =>
    assert(!texts(s).includes('No page submitted for this part'), `page ${i + 1} carries the notice`)));

// =====================================================
// 5. More pages than the allotment
// =====================================================
results.push('  5. more pages than the allotment');

const OVER = [
  { key: 'x1', partId: '1(a)', partPage: 1, width: 100, height: 50 },
  { key: 'x2', partId: '1(a)', partPage: 2, width: 100, height: 50 },
  { key: 'x3', partId: '1(a)', partPage: 3, width: 100, height: 50 },
];
const overPlan = FL.planFixedLayout([PARTS[0]], OVER);
const overPdf = PDF.drawFixedLayout(overPlan, {
  assignmentId: 'X', imageFor: () => image(100, 50),
});

check('the document does not grow: three pages still take the two allotted', () =>
  assertEqual(overPlan.pages.length, 3, 'a part that overran changed the page count'));

check('it is recorded as fitted, with every page named in order', () =>
  assertEqual(overPlan.parts, [
    { part_id: '1(a)', allotment: 2, first_page: 2, placed: ['x1', 'x2', 'x3'], fitted: true },
  ], 'the fitted record'));

check('the overflow stacks on the last allotted page, in the student\'s order', () =>
  assertEqual(overPdf.images.map(i => [i.page, i.key]), [[2, 'x1'], [3, 'x2'], [3, 'x3']], 'stacking'));

check('both stacked pages stay inside the answer area and keep their aspect', () => {
  const stacked = overPdf.images.filter(i => i.page === 3);
  assertEqual(stacked.length, 2, 'stacked count');
  stacked.forEach(i => {
    assert(i.y >= 90 - 0.01 && i.y + i.h <= 756 + 0.01, `outside the answer area: ${JSON.stringify(i)}`);
    near(i.w / i.h, 2, `${i.key} aspect`, 0.001);
  });
  assert(stacked[0].y + stacked[0].h <= stacked[1].y + 0.01, 'the stacked pages overlap');
});

// =====================================================
// 6. What the student is told about it
// =====================================================
// Work item W3 task 2. The sentences were approved by Andre Knoesen on
// 2026-10-20 and are asserted here WORD FOR WORD, because an approved
// student-facing sentence is a fact about what was agreed, not a detail of the
// layout: a later edit to the fitting must not be able to reword it quietly.
results.push('  6. what the student is told');

const FN = await loadModule('services/fitNotice.ts', 'fitNotice.mjs');

check('a part that fits says nothing at all', () =>
  assertEqual(FN.fitNotice(plan.parts), null, 'the three-part plan warned about something'));

check('the approved sentences, for a part with three pages and room for two', () => {
  const n = FN.fitNotice(overPlan.parts);
  assert(n !== null, 'no notice for a part that overran');
  assertEqual(n.lines, ['Part 1(a) has three pages and room for two.'], 'the line');
  assertEqual(
    n.consequence,
    'Your pages will be fitted into the two pages the assignment allows, so they will appear smaller.',
    'the consequence');
  assertEqual(n.choice, 'You can rewrite more compactly, or download anyway.', 'the choice');
});

check('no em-dash reaches the student', () => {
  const n = FN.fitNotice(overPlan.parts);
  [...n.lines, n.consequence, n.choice].forEach(line =>
    assert(!/[\u2014\u2013]/.test(line), `dash in student text: ${line}`));
});

check('two parts over give one line each, in the assignment\'s order', () => {
  const n = FN.fitNotice([
    { part_id: '1(a)', allotment: 2, first_page: 2, placed: ['a', 'b', 'c'], fitted: true },
    { part_id: '1(b)', allotment: 2, first_page: 4, placed: ['d', 'e'], fitted: false },
    { part_id: '2', allotment: 3, first_page: 6, placed: ['f', 'g', 'h', 'i'], fitted: true },
  ]);
  assertEqual(n.lines, [
    'Part 1(a) has three pages and room for two.',
    'Part 2 has four pages and room for three.',
  ], 'the lines');
  // Two different allotments, so there is no single number of pages to name and
  // the sentence does not invent one.
  assertEqual(
    n.consequence,
    'Your pages will be fitted into the pages the assignment allows, so they will appear smaller.',
    'the consequence');
});

check('read out of a payload, which is where the app reads it', () => {
  const payload = { fixed_layout: { file: 'x_answers.pdf', geometry: 'GBHW-1', pages: 3, parts: overPlan.parts } };
  assertEqual(
    FN.fitNoticeFromPayload(payload).lines,
    ['Part 1(a) has three pages and room for two.'],
    'from the payload');
});

check('a payload with no fixed layout, or a damaged one, warns about nothing', () => {
  assertEqual(FN.fitNoticeFromPayload({}), null, 'no block');
  assertEqual(FN.fitNoticeFromPayload({ fixed_layout: null }), null, 'null block');
  assertEqual(FN.fitNoticeFromPayload({ fixed_layout: { parts: 'nope' } }), null, 'parts not a list');
  assertEqual(FN.fitNoticeFromPayload({ fixed_layout: { parts: [{ part_id: '1(a)' }] } }), null, 'part missing its fields');
});

// =====================================================
// 7. The same work gives the same bytes
// =====================================================
// Found on 20 October 2026 by two cases of `tests/multipart-pages-tests.mjs`
// disagreeing on this entry's SHA-256 over one fixture. jsPDF writes a
// `/CreationDate` from the clock and an `/ID` from `Math.random()` unless told
// otherwise, so the archive was not reproducible and a student downloading the
// same work twice got two different fingerprints for it. Both are now functions
// of the pinned inputs; this is the guard on that.
results.push('  7. the same work gives the same bytes');

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const drawTwice = (opts) => [1, 2].map(() => hex(PDF.drawFixedLayout(plan, opts).bytes));

check('two builds of the same plan at the same moment are byte-identical', () => {
  const [a, b] = drawTwice({ assignmentId: 'X', createdAt: '2026-10-07T10:00:00.000Z' });
  assertEqual(a === b, true, 'the same inputs produced two different documents');
});

check('the blank template is reproducible too, with no moment given', () => {
  const a = hex(PDF.drawBlankTemplate(plan, 'X').bytes);
  const b = hex(PDF.drawBlankTemplate(plan, 'X').bytes);
  assertEqual(a === b, true, 'two templates from one plan differ');
});

check('a different moment, assignment or plan gives a different document', () => {
  const base = hex(PDF.drawFixedLayout(plan, { assignmentId: 'X', createdAt: '2026-10-07T10:00:00.000Z' }).bytes);
  const later = hex(PDF.drawFixedLayout(plan, { assignmentId: 'X', createdAt: '2026-10-07T10:00:01.000Z' }).bytes);
  const other = hex(PDF.drawFixedLayout(plan, { assignmentId: 'Y', createdAt: '2026-10-07T10:00:00.000Z' }).bytes);
  assert(base !== later, 'a second later gave the same bytes');
  assert(base !== other, 'another assignment gave the same bytes');
});

check('the moment is written in UTC, so the building machine does not show', () => {
  const text = Buffer.from(PDF.drawFixedLayout(plan, {
    assignmentId: 'X', createdAt: '2026-10-07T10:00:00.000Z',
  }).bytes).toString('latin1');
  assert(text.includes("D:20261007100000+00'00'"), 'the creation date is not the pinned moment in UTC');
});

check('an ISO timestamp is accepted, which is what the packager pins', () => {
  // jsPDF's own string path rejects an ISO timestamp outright, so this would
  // have thrown on every generic-sheet download.
  PDF.drawFixedLayout(plan, { assignmentId: 'X', createdAt: '2026-10-07T10:00:00.000Z' });
  PDF.drawFixedLayout(plan, { assignmentId: 'X', createdAt: new Date('2026-10-07T10:00:00.000Z') });
});

// ---------- report ----------
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
