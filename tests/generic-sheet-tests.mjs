// =====================================================
// The generic answer page: the student says which part each page is
// =====================================================
// `WORKORDER_SS_PAGE_LABELLING_2026-09-24` §4, every item:
//
//   1. The Assignment Maker's own sample loads, and a malformed generic file
//      is refused rather than guessed at.
//   2. Two photographed pages go through the real registration and the real
//      crop, are labelled, one is relabelled, and the package carries exactly
//      that: one crop per page, `part_id`, `part_source: "student"`.
//   3. The whole box is stored, the long edge is capped, the ink box is
//      recorded, and a blank page is warned about.
//   4. Coverage: a missing part and a part labelled twice are reported, and
//      neither stops the package being built.
//   5. Electronic is byte-identical to the deployed builder, and the printed
//      sheet differs from it only by `part_source: "layout"`.
//   6. The `pi-1` texts are byte-identical, and no new string names a platform.
//   7. The component renders the choice, and App wires it.
//
// "The real components": everything from the photograph to the archive runs
// the shipped modules, bundled from `services/` — registration, crop, ink
// measure, labelling, packaging. The one step not run is the browser's JPEG
// encoder, replaced by `jpeg-js` at the same quality. The React component is
// rendered by the real React server renderer. `App.tsx` cannot be imported in
// Node, so its wiring is asserted over the shipped source.
//
//   node tests/generic-sheet-tests.mjs
// =====================================================

import { webcrypto, createHash } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import jpeg from 'jpeg-js';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import {
  loadModule, makeCapture, renderGenericSheet, RECIPES, GENERIC_PAYLOAD, GENERIC_PDF, GENERIC_PNG, INK,
} from './captureSet.mjs';
import { GOLDEN_PATH, buildBoth } from './packageFixtures.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0, skipped = 0;
const results = [];
const check = (name, fn) => {
  try { fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const skip = (name, why) => { skipped++; results.push(`  SKIP  ${name} (${why})`); };
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertEqual = (actual, expected, msg) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n          expected: ${e}\n          actual:   ${a}`);
};

console.log('\ngeneric answer page — the student says which part each page is\n');

const P = await loadModule('tests/genericPipeline.ts', 'gs_pipeline.mjs');
await P.initQrReader();

// =====================================================
// 0. The page every photograph here is of
// =====================================================
results.push('  0. the real generic page');

const PDF_SHA256 = 'a49041f869f707d10fe2b826f24f415c65ed9288b9a4f947b62f6d3e4b82a98d';
check('the page fixture is the PDF exported from the live Assignment Maker (index-B1cnuwf-.js)', () =>
  assert(createHash('sha256').update(readFileSync(GENERIC_PDF)).digest('hex') === PDF_SHA256,
    `${GENERIC_PDF} is not the exported page`));
{
  // The 300 dpi rendering is only a convenience for Node, which has no PDF
  // renderer. Where MuPDF is installed it is re-rendered and compared, so the
  // PNG cannot drift from the PDF it claims to be.
  let rendered = null;
  try {
    rendered = execFileSync('python', ['-c',
      'import sys, fitz; p = fitz.open(sys.argv[1])[0].get_pixmap(dpi=300, colorspace=fitz.csGRAY); ' +
      'sys.stdout.buffer.write(p.samples)', GENERIC_PDF], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { /* no python or no MuPDF */ }
  if (rendered) {
    check('the 300 dpi PNG is exactly the PDF, rendered', () => {
      const png = PNG.sync.read(readFileSync(GENERIC_PNG));
      assert(rendered.length === png.width * png.height, `render is ${rendered.length} bytes`);
      for (let i = 0; i < rendered.length; i++) {
        if (rendered[i] !== png.data[i * 4]) throw new Error(`pixel ${i} differs`);
      }
    });
  } else {
    skip('the 300 dpi PNG is exactly the PDF, rendered', 'MuPDF (python fitz) not available');
  }
}

// =====================================================
// 1. Loading
// =====================================================
results.push('  1. loading the file');

const SAMPLE = join(REPO, 'tests', 'fixtures', 'generic_sheet_sample.json');
const RECORD_SAMPLE = resolve(REPO, '..', 'app_records', 'assignment_maker', 'samples', 'generic_sheet_sample.json');
const raw = readFileSync(SAMPLE, 'utf8');
const assignment = await P.decryptJson(raw);
const source = P.chooseLayoutSource(null, assignment);
const map = await P.parseLayoutCsv(source.text, source.name);
const parts = assignment.parts;

check('the sample is gb1-encoded and decodes with the app\'s own decoder', () =>
  assert(P.isEncoded(raw) && assignment.sheet === 'generic', 'not an encoded generic spec'));
if (existsSync(RECORD_SAMPLE)) {
  check('the fixture is byte-identical to the Assignment Maker lane\'s sample', () =>
    assert(readFileSync(RECORD_SAMPLE, 'utf8') === raw, `${RECORD_SAMPLE} has moved on; copy it again`));
} else {
  skip('the fixture is byte-identical to the Assignment Maker lane\'s sample', 'the record repo is not beside this one');
}
check(`its embedded map is the generic map, ${P.GENERIC_LAYOUT_ID}, one region`, () => {
  assert(map.computedLayoutId === P.GENERIC_LAYOUT_ID, `computed ${map.computedLayoutId}`);
  assert(source.name === 'layout_GBGEN1.csv' && map.rows.length === 1 && map.rows[0].regionId === 'gen',
    `${source.name}, ${map.rows.length} rows`);
});
check('it is a generic sheet, and nothing about it is refused', () => {
  assert(P.isGenericSheet(assignment), 'isGenericSheet is false');
  assert(P.genericSheetProblem(assignment, map) === null, P.genericSheetProblem(assignment, map));
  assert(parts.length === 3 && parts[0].label === 'Problem 1, part (a)', 'parts list not as written');
});

const HW1_CSV = readFileSync(join(REPO, 'tests', 'fixtures', 'layout_ENG17HOM496F.csv'), 'utf8');
const hw1Map = await P.parseLayoutCsv(HW1_CSV, 'layout_ENG17HOM496F.csv');
for (const [name, json, m, expectRefused] of [
  ['a sheet value this app does not know is refused, not read as absent', { ...assignment, sheet: 'printed' }, map, true],
  ['a generic file carrying a per-assignment map is refused', assignment, hw1Map, true],
  ['a generic file with no parts list is refused', { ...assignment, parts: undefined }, map, true],
  ['a generic file with a part listed twice is refused', { ...assignment, parts: [...parts, parts[0]] }, map, true],
  ['a generic file with no map is refused', assignment, null, true],
  ['a printed-sheet file (no sheet field) is not checked at all', { ...assignment, sheet: undefined, parts: undefined }, hw1Map, false],
  ['an electronic file carrying sheet: "generic" is ignored', { ...assignment, inputMode: 'electronic' }, null, false],
]) {
  check(name, () => {
    const problem = P.genericSheetProblem(json, m);
    assert(expectRefused ? problem !== null : problem === null, `got ${JSON.stringify(problem)}`);
  });
}
check('an electronic file carrying sheet: "generic" is not a generic sheet', () =>
  assert(!P.isGenericSheet({ ...assignment, inputMode: 'electronic' }), 'electronic reads as generic'));

// =====================================================
// 2. Two pages, labelled, one relabelled, packaged
// =====================================================
results.push('  2. capture, label, relabel, package');

const row = map.rows[0];
const toJpeg = (image) => new Uint8Array(jpeg.encode(
  { data: Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), width: image.width, height: image.height },
  90).data);

/**
 * The fitted transform with a registration error added: page millimetres are
 * sampled `dx`, `dy` mm away from where the fit put them.
 */
const shifted = (m, dx, dy) => {
  const t = [...m];
  t[2] += m[0] * dx + m[1] * dy; t[5] += m[3] * dx + m[4] * dy; t[8] += m[6] * dx + m[7] * dy;
  return t;
};

/**
 * One photograph of THE REAL exported page through the shipped pipeline, as
 * `registerAndCropPage` runs it. Only the student's writing is synthetic.
 */
const photograph = (sheet, recipe, error = [0, 0]) => {
  const cap = makeCapture(sheet, recipe);
  const reg = P.registerPage(cap.image);
  if (!reg.usable) throw new Error(`${recipe.name} did not register: ${reg.status}`);
  const cut = P.cropGenericBox(cap.image, shifted(reg.transform, error[0], error[1]), row,
    P.GENERIC_CROP_LONG_EDGE_PX, P.registeredQrSharpness(cap.image, reg));
  return { cap, reg, cut, pageBytes: toJpeg(cap.image), cropBytes: toJpeg(cut.image) };
};

const RECIPE = Object.fromEntries(RECIPES.map(r => [r.name, r]));
const shotA = photograph(renderGenericSheet({ writing: [[15, 70, 200, 140]], seed: 1 }), RECIPE['02-rotate-2deg']);
const shotB = photograph(renderGenericSheet({ writing: [[15, 150, 150, 200]], seed: 2 }), RECIPE['05-perspective-mild']);

check(`both photographs register from the real page's own QR, ${GENERIC_PAYLOAD}`, () => {
  for (const s of [shotA, shotB]) {
    assertEqual(s.reg.qr.fields,
      { assignmentId: 'GBGEN1', token: 'HWMSTR', k: 1, n: 1, layoutId: P.GENERIC_LAYOUT_ID }, 'QR fields');
  }
});

const blobs = {};
const pageRef = (id, file, shot) => {
  blobs[id] = shot.pageBytes;
  return { id, file, width: shot.cap.width, height: shot.cap.height, bytes: shot.pageBytes.length,
    registration: { status: 'ok', k: 1, n: 1, layoutId: P.GENERIC_LAYOUT_ID, marksFound: 4 },
    captureId: `cap-${id}` };
};
/** The crop record exactly as `runRegistration` builds it, and merged the same way. */
const recut = (crops, pageId, shot, captureId) => {
  const record = P.genericCropRecord({
    row, width: shot.cut.image.width, height: shot.cut.image.height, bytes: shot.cropBytes.length,
    flags: shot.cut.flags, inkBox: shot.cut.inkBox, inkVerdict: shot.cut.inkVerdict,
  }, pageId, [], captureId);
  blobs[P.cropBlobKey(record.regionId)] = shot.cropBytes;
  return P.mergeRecutCrops(crops, { [record.regionId]: record });
};

let pages = [pageRef('pgA', 'page_1.jpg', shotA), pageRef('pgB', 'page_2.jpg', shotB)];
let crops = recut(recut({}, 'pgA', shotA, 'c1'), 'pgB', shotB, 'c2');
const keyA = P.genericCropKey('gen', 'pgA'), keyB = P.genericCropKey('gen', 'pgB');

check('a new page starts with no part: nothing is guessed', () =>
  assert(crops[keyA].partId === '' && crops[keyB].partId === '' && crops[keyA].partSource === 'student',
    JSON.stringify([crops[keyA].partId, crops[keyB].partId])));

crops = P.labelGenericCrop(crops, keyA, '1(a)');
crops = P.labelGenericCrop(crops, keyB, '1(a)');
check('both labelled 1(a): reported as repeated, because other parts have no page', () => {
  const c = P.genericCoverage(parts, crops, pages);
  assertEqual(c.repeated.map(r => [r.part.part_id, r.pages]), [['1(a)', 2]], 'repeated');
  assertEqual(c.missing.map(p => p.part_id), ['1(b)', '2'], 'missing');
});

const confirmedBeforeRelabel = P.confirmPersonalInfo({ assignment, submissionData: {}, pages, crops });
crops = P.labelGenericCrop(crops, keyB, '1(b)');
check('relabelling changes the label and nothing else', () => {
  assert(crops[keyB].partId === '1(b)', 'label did not move');
  assert(crops[keyB].captureId === 'c2' && crops[keyB].review === 'not_reviewed', 'picture state moved');
});

const readBlob = async (key) => blobs[key] ?? null;
const NOW = '2026-09-24T12:00:00.000Z';
const sourcesFor = (c, p, confirmation) => {
  const s = { assignment, submissionData: {}, isHandwritten: true, layoutId: map.computedLayoutId,
    pages: p, crops: c, now: NOW };
  return { ...s, personalInfoConfirmation: confirmation ?? P.confirmPersonalInfo(s) };
};
const openPackage = async (sources) => {
  const built = await P.buildSubmissionPackage(sources, { readBlob, downsampleImage: async (u) => u });
  const zip = await JSZip.loadAsync(await built.zip.generateAsync({ type: 'uint8array' }));
  const payloadName = built.entries.find(e => e.endsWith('.json'));
  const payload = JSON.parse(await zip.file(payloadName).async('string'));
  return { built, zip, payload };
};

const GENERIC_CROP_KEYS = ['region_id', 'part_id', 'part_source', 'page_k', 'is_drawing', 'max_points',
  'crop_source', 'student_review', 'quality_flags', 'file', 'width', 'height', 'page_file', 'part_page',
  'part_pages', 'ink', 'ink_bbox'];

await checkAsync('the relabel does not clear the personal-information tick (no picture changed)', async () => {
  await P.buildSubmissionPackage(sourcesFor(crops, pages, confirmedBeforeRelabel),
    { readBlob, downsampleImage: async (u) => u });
});

const two = await openPackage(sourcesFor(crops, pages));
await checkAsync('the package: one crop per page, under the parts the student chose last', async () => {
  const c = two.payload.crops;
  assertEqual(Object.keys(c), ['1a_1', '1b_1'], 'crop keys');
  assertEqual([c['1a_1'].part_id, c['1b_1'].part_id], ['1(a)', '1(b)'], 'part ids');
  assertEqual([c['1a_1'].page_file, c['1b_1'].page_file], ['page_1.jpg', 'page_2.jpg'], 'page files');
  for (const v of Object.values(c)) {
    assert(v.part_source === 'student', `part_source ${v.part_source}`);
    assert(v.region_id === 'gen' && v.page_k === 1, `region ${v.region_id} page ${v.page_k}`);
  }
  assertEqual([c['1a_1'].max_points, c['1b_1'].max_points], [60, 40], 'points from the parts list');
});
await checkAsync('every generic crop carries exactly the generic crop keys', async () => {
  for (const [k, v] of Object.entries(two.payload.crops)) assertEqual(Object.keys(v), GENERIC_CROP_KEYS, `crop ${k}`);
});
await checkAsync('the payload is otherwise the handwritten payload: same top-level keys, the generic layout id', async () => {
  assertEqual(Object.keys(two.payload), ['course_code', 'assignment_id', 'ai_feedback', 'submission_data',
    'last_saved', 'personal_info_confirmed', 'personal_info_wording', 'input_mode', 'layout_id', 'pages', 'crops'],
    'top-level keys');
  assert(two.payload.layout_id === P.GENERIC_LAYOUT_ID, two.payload.layout_id);
});
await checkAsync('every crop the payload names is in the archive, as a JPEG of the stated size', async () => {
  for (const v of Object.values(two.payload.crops)) {
    const f = two.zip.file(v.file);
    assert(f, `${v.file} missing`);
    const img = jpeg.decode(await f.async('uint8array'), { useTArray: true });
    assert(img.width === v.width && img.height === v.height, `${v.file} is ${img.width}x${img.height}`);
  }
  assertEqual(two.built.entries.filter(e => e.startsWith('crops/')), ['crops/1a_1.jpg', 'crops/1b_1.jpg'], 'crop entries');
});

// A retake keeps the label; a third page for 1(a) is page 2 of 1(a); an unlabelled page is carried.
const shotA2 = photograph(renderGenericSheet({ writing: [[15, 70, 200, 140]], seed: 1 }), RECIPE['01-clean']);
const shotC = photograph(renderGenericSheet({ writing: [[15, 200, 200, 250]], seed: 3 }), RECIPE['07-lighting-gradient']);
const shotD = photograph(renderGenericSheet({ writing: [[15, 70, 120, 90]], seed: 4 }), RECIPE['01-clean']);
crops = P.labelGenericCrop({ ...crops, [keyA]: { ...crops[keyA], review: 'signed_off' } }, keyA, '1(a)');
crops = recut(crops, 'pgA', shotA2, 'c1-retake');
check('a retaken page keeps its label, and its sign-off is reset', () => {
  assert(crops[keyA].partId === '1(a)', `label ${crops[keyA].partId}`);
  assert(crops[keyA].review === 'not_reviewed' && crops[keyA].captureId === 'c1-retake', 'not re-cut');
});
pages = [...pages, pageRef('pgC', 'page_3.jpg', shotC), pageRef('pgD', 'page_4.jpg', shotD)];
crops = recut(recut(crops, 'pgC', shotC, 'c3'), 'pgD', shotD, 'c4');
crops = P.labelGenericCrop(crops, P.genericCropKey('gen', 'pgC'), '1(a)');

const four = await openPackage(sourcesFor(crops, pages));
await checkAsync('two pages for one part keep their capture order, and are named 1 and 2', async () => {
  const c = four.payload.crops;
  assertEqual(Object.keys(c), ['1a_1', '1b_1', '1a_2', 'unlabelled_1'], 'keys, in page order');
  assertEqual([c['1a_1'].page_file, c['1a_2'].page_file], ['page_1.jpg', 'page_3.jpg'], 'capture order');
  assertEqual([c['1a_1'].part_page, c['1a_2'].part_page, c['1a_2'].part_pages], [1, 2, 2], 'part_page');
});
await checkAsync('moving a page earlier renumbers within its part, and nothing else', async () => {
  const swapped = [pages[2], pages[1], pages[0], pages[3]].map((p, i) => ({ ...p, file: `page_${i + 1}.jpg` }));
  const { payload } = await openPackage(sourcesFor(crops, swapped));
  assert(payload.crops['1a_1'].page_file === 'page_1.jpg' && payload.crops['1a_2'].page_file === 'page_3.jpg',
    JSON.stringify(Object.values(payload.crops).map(v => [v.file, v.page_file])));
  assert(payload.crops['1a_1'].width === shotC.cut.image.width, '1a_1 is not the page now first');
});
await checkAsync('an unlabelled page is carried, marked, and not dropped', async () => {
  const u = four.payload.crops.unlabelled_1;
  assert(u && u.part_id === null && u.part_source === 'student' && u.max_points === null, JSON.stringify(u));
  assert(u.quality_flags.includes(P.CROP_FLAG_UNLABELLED), `flags ${u.quality_flags}`);
  assert(four.zip.file('crops/unlabelled_1.jpg'), 'its image is not in the archive');
});

// =====================================================
// 3. The crop: whole box, capped, ink box, blank warned
// =====================================================
results.push('  3. the crop is the whole box');

const rowWmm = (row.x1 - row.x0) * 215.9, rowHmm = (row.y1 - row.y0) * 279.4;
check('the crop is the whole box: its shape is the region\'s, not the writing\'s', () => {
  for (const s of [shotA, shotB, shotC, shotD]) {
    const ratio = (s.cut.image.width / s.cut.image.height) / (rowWmm / rowHmm);
    assert(Math.abs(ratio - 1) < 0.01, `aspect off by ${((ratio - 1) * 100).toFixed(2)}%`);
  }
  assert(shotD.cut.image.height === shotA2.cut.image.height, 'a page with little writing gave a smaller crop');
});
check('at phone resolution the crop is under the cap, at the photograph\'s own resolution', () => {
  for (const s of [shotA, shotB]) {
    const long = Math.max(s.cut.image.width, s.cut.image.height);
    assert(long <= P.GENERIC_CROP_LONG_EDGE_PX && long > 900, `long edge ${long}`);
  }
});
const hiRes = photograph(renderGenericSheet({ writing: [[15, 70, 200, 140]] }),
  { ...RECIPE['01-clean'], frameW: 3000, frameH: 3900 });
check(`from a large photograph the long edge is exactly ${P.GENERIC_CROP_LONG_EDGE_PX} px`, () => {
  assertEqual([hiRes.cut.image.width, hiRes.cut.image.height], [1535, 1600], 'crop pixels');
});
check('the ink box is recorded, inside the crop, around the writing', () => {
  const b = shotA.cut.inkBox, { width: w, height: h } = shotA.cut.image;
  assert(b && b.x0 >= 0 && b.y0 >= 0 && b.x1 <= w && b.y1 <= h && b.x1 > b.x0 && b.y1 > b.y0, JSON.stringify(b));
  // Writing drawn from page-y ~70 to ~140 of a box 57 to 257: the top third.
  assert(b.y0 < h * 0.12 && b.y1 < h * 0.45 && b.y1 > h * 0.3, `box rows ${b.y0}-${b.y1} of ${h}`);
});
await checkAsync('the ink box reaches the package as ink_bbox', async () => {
  const v = two.payload.crops['1a_1'];
  assertEqual(v.ink_bbox, shotA.cut.inkBox, 'ink_bbox');
});
const ALL = [...RECIPES, { ...RECIPE['01-clean'], name: '13-hires-3000x3900', frameW: 3000, frameH: 3900 }];
/** Photographs the sheet on every recipe and names the ones where `bad(cut)` holds. */
const failingRecipes = (sheet, bad, error) =>
  ALL.filter(recipe => bad(photograph(sheet, recipe, error).cut)).map(r => r.name);
const blankSheet = renderGenericSheet({});

// THE SAFETY PROPERTY, and the only hard assertion here about the ink measure.
// A page with ink must never be reported blank: a student told their written
// page looks blank may rewrite work that was fine. `uncertain` is allowed;
// `blank` is not. Every ink case, every recipe, including the faint hard pencil
// and the ruler-drawn faint line the page's own instruction warns against.
const SKETCH = [[40, 200, 40, 120], [40, 200, 170, 200], [60, 150, 150, 150]];
const INKED = {
  'pen writing': { writing: [[15, 62, 200, 140]] },
  '2B pencil writing': { writing: [[15, 62, 200, 140]], ink: INK.pencil },
  'faint hard-pencil writing': { writing: [[15, 62, 200, 140]], ink: INK.faintPencil },
  'one short pencil line low on the page': { writing: [[20, 240, 60, 250]], ink: INK.pencil },
  'ruler-drawn sketch, pen': { ruled: SKETCH, ink: INK.pen },
  'ruler-drawn sketch, 2B pencil': { ruled: SKETCH, ink: INK.pencil },
  'ruler-drawn sketch, faint hard pencil': { ruled: SKETCH, ink: INK.faintPencil },
  'pen writing with the fields filled in': { writing: [[15, 62, 200, 140]], fields: true },
  // Straight ink that DOES span the box, so the "does not span" evidence cannot
  // see it: only the deep-line evidence stops it reading blank.
  'a 2B pencil line ruled across the whole box': { ruled: [[16, 181, 200, 181]], ink: INK.pencil },
};
const verdicts = {};
for (const [name, opts] of Object.entries(INKED)) {
  const sheet = renderGenericSheet(opts);
  verdicts[name] = ALL.map(recipe => [recipe.name, photograph(sheet, recipe).cut]);
}
for (const [name, cuts] of Object.entries(verdicts)) {
  check(`SAFETY: ${name} is never reported blank, on any of 13 recipes`, () => {
    const bad = cuts.filter(([, c]) => c.inkVerdict === 'blank' || c.flags.includes('looks-empty')).map(([n]) => n);
    assert(bad.length === 0, `reported blank: ${bad.join(', ')}`);
  });
}

// Tripwires, not accuracy figures: synthetic ink on the real page. The counts
// are the ones measured when the thresholds were set from real photographs;
// a drop means the measure changed, and says nothing about real accuracy.
const count = (name, v) => verdicts[name].filter(([, c]) => c.inkVerdict === v).length;
for (const [name, atLeast] of [['pen writing', 13], ['2B pencil writing', 13],
  ['ruler-drawn sketch, pen', 11], ['ruler-drawn sketch, 2B pencil', 10]]) {
  check(`tripwire: ${name} reads as ink on at least ${atLeast} of 13`, () =>
    assert(count(name, 'ink') >= atLeast, `ink on ${count(name, 'ink')}`));
}
check('an inked page reads as ink or uncertain, and only an ink verdict carries an ink box', () => {
  for (const cuts of Object.values(verdicts)) {
    for (const [n, c] of cuts) assert((c.inkVerdict === 'ink') === (c.inkBox !== null), `${n}: ${c.inkVerdict} with box ${JSON.stringify(c.inkBox)}`);
  }
});
for (const [label, sheet] of [['a blank real page', blankSheet],
  ['the real page with only Problem and Part filled in, box empty', renderGenericSheet({ fields: true })]]) {
  // 9, not 13: the defocus and hurry recipes fall below BLANK_SHARPNESS_MIN and
  // read "uncertain" by design; the lighting gradient reads uncertain and the
  // shadow across a corner reads ink. None of those four is a blank claim.
  check(`tripwire: ${label} reads as blank, with the warning, on at least 9 of 13`, () => {
    const cuts = ALL.map(r => photograph(sheet, r).cut);
    const blank = cuts.filter(c => c.inkVerdict === 'blank' && c.flags.includes('looks-empty')).length;
    assert(blank >= 9, `blank on ${blank}`);
  });
}
check('registration off by up to 3 mm never turns a blank real page that read no-ink into ink', () => {
  // 3.0 mm is what a degraded three-mark fit is allowed. At these errors the
  // box's black border enters the crop; it is found by the box's declared
  // geometry, never by the rules. (A recipe that reads the blank page as ink
  // without any error, the shadow across a corner, is not this check's case.)
  const clean = ALL.filter(r => photograph(blankSheet, r).cut.inkVerdict !== 'ink');
  const bad = [];
  for (const error of [[0, -1], [0, -2], [0, -3], [0, 3], [-3, 0], [3, 0], [-2, -2]]) {
    for (const recipe of clean) {
      if (photograph(blankSheet, recipe, error).cut.inkVerdict === 'ink') bad.push(`${recipe.name}@${error}`);
    }
  }
  assert(clean.length >= 12, `only ${clean.length} recipes read the blank page as no-ink`);
  assert(bad.length === 0, `read as ink: ${bad.join(', ')}`);
});
const loneLow = photograph(renderGenericSheet({ writing: [[20, 238, 60, 248]], ink: INK.pencil }), RECIPE['10-jpeg-low']);
check('one short pencil line low on the page is found, and not called blank', () => {
  const b = loneLow.cut.inkBox;
  assert(b && b.y0 > loneLow.cut.image.height * 0.85, JSON.stringify(b));
  assert(!loneLow.cut.flags.includes('looks-empty'), 'called blank');
});
await checkAsync('an uncertain crop is packaged as ink "uncertain", never as "none"', async () => {
  const shot = photograph(renderGenericSheet({}), RECIPE['01-clean']);
  const c = P.labelGenericCrop(recut({}, 'pgU', shot, 'cu'), P.genericCropKey('gen', 'pgU'), '2');
  const key = P.genericCropKey('gen', 'pgU');
  const uncertain = { ...c, [key]: { ...c[key], inkVerdict: 'uncertain', inkBox: null, qualityFlags: [] } };
  const { payload } = await openPackage(sourcesFor(uncertain, [pageRef('pgU', 'page_1.jpg', shot)]));
  assert(payload.crops['2_1'].ink === 'uncertain' && payload.crops['2_1'].ink_bbox === null,
    JSON.stringify(payload.crops['2_1']));
  // A crop restored from before the verdict existed has none: also uncertain.
  const legacy = { ...c, [key]: { ...c[key], inkVerdict: undefined } };
  const again = await openPackage(sourcesFor(legacy, [pageRef('pgU', 'page_1.jpg', shot)]));
  assert(again.payload.crops['2_1'].ink === 'uncertain', again.payload.crops['2_1'].ink);
});
await checkAsync('a blank page is still packaged, with ink_bbox null', async () => {
  const blank = photograph(renderGenericSheet({}), RECIPE['01-clean']);
  const c = P.labelGenericCrop(recut({}, 'pgZ', blank, 'cz'), P.genericCropKey('gen', 'pgZ'), '2');
  const { payload } = await openPackage(sourcesFor(c, [pageRef('pgZ', 'page_1.jpg', blank)]));
  assert(payload.crops['2_1'].ink === 'none' && payload.crops['2_1'].ink_bbox === null &&
    payload.crops['2_1'].quality_flags.includes('looks-empty'),
    JSON.stringify(payload.crops['2_1']));
  assert(P.genericCoverage(parts, c, [pageRef('pgZ', 'page_1.jpg', blank)]).blank === 1, 'not counted blank');
});

// =====================================================
// 3b. The real photographs of the printed generic page
// =====================================================
// tests/captures/generic_page/: seven frames of the page as built (solid
// rules), printed on a real printer and photographed handheld. One phone, one
// printer, one room, one hand. Gitignored, so this SKIPs where they are absent
// (CI). Each instrument is the photographer's own, written in the page margin.
results.push('  3b. the real frames');
{
  const FRAMES = join(REPO, 'tests', 'captures', 'generic_page');
  const expected = [
    ['01_blank.jpg', 'blank'],
    ['02_pencil_fields_and_outside_box.jpg', 'ink'],
    ['03_light_pencil.jpg', 'ink'],
    ['04_lightest_hard_pencil.jpg', 'ink'],
    ['05_pen.jpg', 'ink'],
    ['06_pen_sketch.jpg', 'ink'],
    ['07_fields_only.jpg', 'blank'],
  ];
  if (!existsSync(FRAMES)) {
    skip('the seven real frames give their required verdicts', 'tests/captures/generic_page/ is not here');
  } else {
    const { ingestLikeApp } = await import('./realCaptures.mjs');
    const got = {};
    for (const [file] of expected) {
      const image = ingestLikeApp(join(FRAMES, file));
      const reg = P.registerPage(image);
      got[file] = reg.usable
        ? { reg, cut: P.cropGenericBox(image, reg.transform, row, P.GENERIC_CROP_LONG_EDGE_PX,
          P.registeredQrSharpness(image, reg)) }
        : { reg, cut: null };
    }
    check('all seven register from the page\'s own QR', () => {
      for (const [file] of expected) {
        assert(got[file].cut, `${file}: ${got[file].reg.status}`);
        assertEqual(got[file].reg.qr.fields,
          { assignmentId: 'GBGEN1', token: 'HWMSTR', k: 1, n: 1, layoutId: P.GENERIC_LAYOUT_ID }, file);
      }
    });
    check('SAFETY: none of the five written frames reports its box as blank (04 hard pencil, 06 straight pen)', () => {
      for (const [file, want] of expected) {
        if (want !== 'ink') continue;
        const c = got[file].cut;
        assert(c.inkVerdict !== 'blank' && !c.flags.includes('looks-empty'), `${file}: ${c.inkVerdict}`);
      }
    });
    check('each written frame reads as ink, with an ink box inside the crop', () => {
      for (const [file, want] of expected) {
        if (want !== 'ink') continue;
        const c = got[file].cut, b = c.inkBox;
        assert(c.inkVerdict === 'ink' && b && b.x0 >= 0 && b.y0 >= 0 && b.x1 <= c.image.width && b.y1 <= c.image.height,
          `${file}: ${c.inkVerdict} ${JSON.stringify(b)}`);
      }
    });
    check('01 (blank) and 07 (fields filled in, box empty) report no ink in the box, with the warning', () => {
      for (const file of ['01_blank.jpg', '07_fields_only.jpg']) {
        const c = got[file].cut;
        assert(c.inkVerdict === 'blank' && c.flags.includes('looks-empty') && c.inkBox === null,
          `${file}: ${c.inkVerdict}`);
      }
    });
    check('06: the ink box takes in the vertical axis, not only the curve', () => {
      // Checked by eye on the crop: the vertical axis stands at about 0.345 of
      // the crop's width and the curve starts right of it.
      const c = got['06_pen_sketch.jpg'].cut;
      assert(c.inkBox.x0 < 0.345 * c.image.width, `ink box starts at ${c.inkBox.x0} of ${c.image.width}`);
    });
  }
}

// =====================================================
// 4. Coverage says, never blocks
// =====================================================
results.push('  4. coverage');

await checkAsync('a missing part is named at the download, and the package still builds', async () => {
  // Pages 1 and 2 only: 1(a) and 1(b) covered, 2 not.
  const firstTwo = Object.fromEntries(Object.entries(crops).filter(([k]) => k === keyA || k === keyB));
  const { built } = await openPackage(sourcesFor(firstTwo, pages.slice(0, 2)));
  const notice = P.genericCompletenessNotice(
    P.genericCoverage(parts, firstTwo, pages.slice(0, 2), built.entries), parts.length);
  assert(notice && notice.itemised, 'no notice');
  assertEqual(notice.groups, [{ names: ['Problem 2'] }], 'groups');
  assert(notice.headline === 'This assignment has 3 answers. Your submission has 2.', notice.headline);
  assertEqual(built.entries.filter(e => e.startsWith('crops/')), ['crops/1a_1.jpg', 'crops/1b_1.jpg'], 'built');
});
await checkAsync('a part labelled twice while another is missing is named, and the package still builds', async () => {
  let c = P.labelGenericCrop(crops, keyB, '1(a)');
  const cov = P.genericCoverage(parts, c, pages);
  assertEqual(cov.repeated.map(r => [r.part.part_id, r.pages]), [['1(a)', 3]], 'repeated');
  const { payload } = await openPackage(sourcesFor(c, pages));
  assertEqual(Object.keys(payload.crops), ['1a_1', '1a_2', '1a_3', 'unlabelled_1'], 'built anyway');
});
check('several pages for a part are NOT reported when every part has one: that is a long answer', () => {
  let c = P.labelGenericCrop(crops, P.genericCropKey('gen', 'pgD'), '2');
  const cov = P.genericCoverage(parts, c, pages);
  assert(cov.missing.length === 0 && cov.repeated.length === 0, JSON.stringify(cov));
  assert(P.genericCompletenessNotice(cov, parts.length) === null, 'a complete submission gets a gate');
});
check('a crop whose file the archive does not hold does not count as covering its part', () => {
  const cov = P.genericCoverage(parts, crops, pages, ['crops/1b_1.jpg']);
  assertEqual(cov.missing.map(p => p.part_id), ['1(a)', '2'], 'missing');
});
check('nothing labelled at all: one sentence, not a list', () => {
  const n = P.genericCompletenessNotice(P.genericCoverage(parts, {}, []), parts.length);
  assert(n && !n.itemised && /none of them/.test(n.headline), JSON.stringify(n));
});

// =====================================================
// 5. Electronic and printed sheet, against the deployed builder
// =====================================================
results.push('  5. the other two paths, against c72450e');

const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
const now = await buildBoth(P, P);
check('electronic: every entry, every byte, and the serialised payload are what c72450e wrote', () => {
  assertEqual(now.electronic.entries, golden.electronic.entries, 'entries');
  assertEqual(now.electronic.files, golden.electronic.files, 'file bytes');
  assert(now.electronic.serialised === golden.electronic.serialised, 'payload text differs');
});
const stripPartSource = (json) => ({ ...json, crops: Object.fromEntries(Object.entries(json.crops)
  .map(([k, v]) => { const { part_source, ...rest } = v; return [k, rest]; })) });
check('printed sheet: the same entries, and every image byte-identical', () => {
  assertEqual(now.printed.entries, golden.printed.entries, 'entries');
  for (const e of now.printed.entries.filter(e => !e.endsWith('.json'))) {
    assertEqual(now.printed.files[e], golden.printed.files[e], e);
  }
});
check('printed sheet: every crop now says part_source "layout", and that is the only change', () => {
  const crops = Object.values(now.printed.submissionJson.crops);
  assert(crops.length === 16 && crops.every(c => c.part_source === 'layout'), 'part_source missing or wrong');
  assert(JSON.stringify(stripPartSource(now.printed.submissionJson), null, 2) === golden.printed.serialised,
    'the payload differs by more than part_source');
});

// =====================================================
// 6. Approved text unchanged; no platform named
// =====================================================
results.push('  6. wording');

const sha = (p) => createHash('sha256').update(readFileSync(join(REPO, p), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
for (const [file, hash] of [
  ['components/PersonalInfoConfirmation.tsx', '35641dbdc7a0aae4e27aa08278b24dbee2da71081e9fcfcce8a9c444ed9a251e'],
  ['components/PersonalInfoRequired.tsx', '05c3b603206fc050e65de6af7c23265a64530d1ae1587023fe0e65058c0e093e'],
  ['services/personalInfo.ts', '02648f496d8b138840150bc7a10bd56bdc57a41c96be8a104334ea5440da5d3f'],
]) {
  check(`${file} is byte-identical to c72450e (pi-1 approved text and behaviour)`, () =>
    assert(sha(file) === hash, `${file} changed`));
}
const PLATFORM = /gradescope|\b(Canvas|Blackboard|Moodle|Brightspace|D2L|Sakai|Schoology)\b/;
const wordingText = Object.values(P.GENERIC_WORDING)
  .map(v => typeof v === 'function' ? v(2, 3) + v('Problem 1, part (a)', 2) : v).join('\n');
check('no new generic-sheet string names a platform', () =>
  assert(!PLATFORM.test(wordingText), wordingText.match(PLATFORM)?.[0]));
check('the identity reminder is one line and names name, student ID and email', () => {
  const r = P.GENERIC_WORDING.noIdentityReminder;
  assert(!r.includes('\n') && /name/.test(r) && /student ID/.test(r) && /email/.test(r), r);
});

// =====================================================
// 7. The component, rendered; App, wired
// =====================================================
results.push('  7. the component and its wiring');

const outDir = mkdtempSync(join(tmpdir(), 'gb-generic-test-'));
const harnessFile = join(outDir, 'generic-harness.mjs');
await build({
  stdin: {
    contents: `
      import * as React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import GenericPageReview from './components/GenericPageReview';
      import PageUploader from './components/PageUploader';
      const noop = () => {}, anoop = async () => {};
      export const renderReview = (props) => renderToStaticMarkup(React.createElement(GenericPageReview,
        { onLabel: noop, onReview: noop, onRetakePage: anoop, busy: null, cropUrls: {}, ...props }));
      export const renderUploader = (props) => renderToStaticMarkup(React.createElement(PageUploader,
        { pages: [], pageUrls: {}, onAddPage: anoop, onReplacePage: anoop, onRemovePage: noop,
          onMovePage: noop, onRotatePage: anoop, ...props }));
    `,
    resolveDir: REPO, loader: 'tsx', sourcefile: 'generic-harness.tsx',
  },
  outfile: harnessFile, format: 'esm', platform: 'node', target: 'es2022', bundle: true, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  loader: { '.css': 'empty' },
  // heic2any touches `window` as it loads; only image upload uses it, never rendering.
  plugins: [{ name: 'stub-heic2any', setup(b) {
    b.onResolve({ filter: /^heic2any$/ }, () => ({ path: 'heic2any', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default () => null;', loader: 'js' }));
  } }],
  logLevel: 'silent',
});
const { renderReview, renderUploader } = await import(pathToFileURL(harnessFile).href);
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const html = renderReview({ parts, crops, pages });
check('every page gets a part choice offering every part, by its label', () => {
  const selects = html.match(/<select[\s\S]*?<\/select>/g) ?? [];
  assert(selects.length === 4, `${selects.length} selects for 4 pages`);
  for (const p of parts) assert(selects[0].includes(`>${p.label}<`), `${p.label} not offered`);
});
check('the choice shows what the student chose, beside the crop', () => {
  const selects = html.match(/<select[\s\S]*?<\/select>/g);
  assert(/value="1\(a\)" selected=""/.test(selects[0]), 'photo 1 does not show 1(a)');
  assert(/value="1\(b\)" selected=""/.test(selects[1]), 'photo 2 does not show 1(b)');
  assert(/value="" selected=""/.test(selects[3]), 'photo 4 does not show as unchosen');
});
check('the review names what is missing and never says it blocks', () => {
  const t = textOf(html);
  assert(t.includes(P.GENERIC_WORDING.coverageMissing) && t.includes('Problem 2'), 'missing part not named');
  assert(t.includes(P.GENERIC_WORDING.coverageNeverBlocks), 'does not say it never blocks');
  assert(t.includes(P.GENERIC_WORDING.unlabelledNote), 'unlabelled page not marked');
  assert(!PLATFORM.test(t), 'names a platform');
});
check('the uploader shows the identity reminder on the generic sheet, and only there', () => {
  assert(textOf(renderUploader({ genericSheet: true })).includes(P.GENERIC_WORDING.noIdentityReminder), 'absent on generic');
  assert(!textOf(renderUploader({})).includes(P.GENERIC_WORDING.noIdentityReminder), 'present on the printed sheet');
});
check('the uploader does not count generic pages by their QR (all are page 1 of 1)', () => {
  const t = textOf(renderUploader({ genericSheet: true, pages }));
  assert(!/more than once/.test(t) && !/This assignment has 1 pages/.test(t), 'page-count warnings on the generic sheet');
});
rmSync(outDir, { recursive: true, force: true });

const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const APP = codeOnly(readFileSync(join(REPO, 'App.tsx'), 'utf8'));
check('App: the review\'s choice is wired to labelGenericCrop', () => {
  assert(/onLabel=\{handleLabelCrop\}/.test(APP), 'GenericPageReview is not given the label handler');
  assert(/const handleLabelCrop = [\s\S]{0,200}?labelGenericCrop\(prev\.crops, key, partId\)/.test(APP),
    'the handler does not label');
});
check('App: generic pages are cut as the generic sheet, and re-cuts keep their labels', () => {
  assert(/registerAndCropPage\(blob, layout, \{ generic \}\)/.test(APP), 'registration not told');
  assert(/crops: mergeRecutCrops\(prev\.crops, cut\)/.test(APP), 're-cut does not merge');
  assert((APP.match(/, isGeneric\);/g) ?? []).length === 3, 'not every re-registration passes isGeneric');
});
check('App: a generic file is checked on load, and the printed review is not shown for it', () => {
  assert(/genericSheetProblem\(json, layout\)/.test(APP), 'no load check');
  assert(/isHandwritten && !isGeneric && state\.layout && \(\s*<CropReview/.test(APP), 'CropReview shown on generic');
  assert(/genericSheet=\{isGeneric\}/.test(APP), 'uploader not told');
});

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
