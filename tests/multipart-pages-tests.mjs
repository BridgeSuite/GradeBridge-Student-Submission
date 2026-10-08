// =====================================================
// One answer page may carry several parts of one problem
// =====================================================
// `workorders/WORKORDER_SS_MULTIPART_PAGES_2026-10-07.md`.
//
//   1. The old flow is unchanged (S3): one part ticked per page, labelled
//      through the NEW controls, builds exactly the package `0b82d9b` built,
//      held against tests/fixtures/generic_package_golden_0b82d9b.json.
//   2. Labelling (S1, design point 1): problem, then ticks; all ticked by
//      default; a new problem starts all ticked and old ticks do not carry
//      over; a part of another problem cannot be ticked; every part unticked
//      is unlabelled; a retake keeps the ticks; work saved before this loads.
//   3. Packaging a shared page (S2, design point 2): the three cases of the
//      work order, each asserting the crop keys, `part_id`, `page_file`,
//      `part_page`, `part_pages` and the seventeen keys of section 11.4.
//   4. Coverage stays advisory and counts pages, not copies (design point 4).
//
// Pages are invented bytes; the builder copies them and nothing decodes them.
// No student work, no model call.
// =====================================================

import { webcrypto, createHash } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { readFileSync } from 'node:fs';
import { loadModule } from './captureSet.mjs';
import {
  GENERIC_GOLDEN_PATH, OLD_FLOW_LABELS, buildGeneric, genericAssignment, genericPagesAndCrops,
  genericParts, multipartAssignment, multipartParts,
} from './genericPackageFixtures.mjs';

let passed = 0, failed = 0;
const results = [];
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (actual, expected, msg) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n          expected: ${e}\n          actual:   ${a}`);
};

console.log('\nmulti-part pages — one answer page may carry several parts of one problem\n');

const P = await loadModule('tests/genericPipeline.ts', 'mp_pipeline.mjs');
const key = (pageId) => P.genericCropKey('gen', pageId);

/** Labels one page through the new controls: choose the problem, then leave exactly `want` ticked. */
const tick = (crops, pageId, problemNumber, want, parts) => {
  let c = P.chooseGenericProblem(crops, key(pageId), problemNumber, parts);
  for (const p of parts.filter(p => p.problem_number === problemNumber)) {
    const on = P.chosenPartIds(c[key(pageId)], parts).includes(p.part_id);
    if (on !== want.includes(p.part_id)) c = P.toggleGenericPart(c, key(pageId), p.part_id, parts);
  }
  return c;
};

const GENERIC_CROP_KEYS = ['region_id', 'part_id', 'part_source', 'page_k', 'is_drawing', 'max_points',
  'crop_source', 'student_review', 'quality_flags', 'file', 'width', 'height', 'page_file', 'part_page',
  'part_pages', 'ink', 'ink_bbox'];

// =====================================================
// 1. The old flow, against the package 0b82d9b built
// =====================================================
results.push('  1. one part per page packages exactly as at 0b82d9b (S3)');
const golden = JSON.parse(readFileSync(GENERIC_GOLDEN_PATH, 'utf8'));
await checkAsync('the golden is the one written at 0b82d9b, and covers what S3 asks for', async () => {
  eq(golden.builtAt, '0b82d9b', 'builtAt');
  const c = JSON.parse(golden.serialised).crops;
  assert(c['2_1']?.part_id === '2', 'no one-part problem (part "2")');
  assert(c['1b_1']?.part_id === '1(b)', 'no part of a multi-part problem');
  assert(c.unlabelled_1?.part_id === null, 'no unlabelled page');
  assert(c['1a_2']?.part_pages === 2, 'no part over two pages');
});
for (const [how, label] of [
  ['labelled through the new controls, one part ticked per page', (crops) => {
    const parts = genericParts();
    for (const [pageId, partId] of OLD_FLOW_LABELS) {
      if (!partId) continue;
      const part = parts.find(p => p.part_id === partId);
      crops = tick(crops, pageId, part.problem_number, [partId], parts);
    }
    return crops;
  }],
  ['labelled through labelGenericCrop, as at 0b82d9b', (crops) => {
    for (const [pageId, partId] of OLD_FLOW_LABELS) if (partId) crops = P.labelGenericCrop(crops, key(pageId), partId);
    return crops;
  }],
]) {
  await checkAsync(`${how}: entry names, payload text and file bytes are the golden's`, async () => {
    const { pages, crops, blobs } = genericPagesAndCrops(P);
    const now = await buildGeneric(P, genericAssignment(), pages, label(crops), blobs);
    eq(now.entries, golden.entries, 'entry names');
    if (now.serialised !== golden.serialised) {
      let i = 0; while (now.serialised[i] === golden.serialised[i]) i++;
      throw new Error(`payload differs at ${i}: ${JSON.stringify(now.serialised.slice(Math.max(0, i - 60), i + 60))}`);
    }
    eq(now.files, golden.files, 'file bytes (SHA-256)');
  });
}

// =====================================================
// 2. Labelling: problem, then ticks
// =====================================================
results.push('  2. labelling by problem, then parts (S1)');
const MP = multipartParts();
const fresh = (ids) => genericPagesAndCrops(P, ids);
{
  const { crops: c0 } = fresh(['pgA']);
  const k = key('pgA');
  await checkAsync('a new page has no problem and no parts', async () => {
    eq([P.chosenProblemNumber(c0[k], MP), P.chosenPartIds(c0[k], MP)], [null, []], 'fresh page');
  });
  const c1 = P.chooseGenericProblem(c0, k, 2, MP);
  await checkAsync('choosing Problem 2 ticks all four of its parts', async () => {
    eq(P.chosenPartIds(c1[k], MP), ['2(a)', '2(b)', '2(c)', '2(d)'], 'ticks');
    eq([c1[k].problemNumber, c1[k].partId], [2, '2(a)'], 'problem, and partId kept as the first part');
  });
  const c2 = P.toggleGenericPart(c1, k, '2(b)', MP);
  await checkAsync('unticking (b) leaves (a), (c) and (d)', async () =>
    eq(P.chosenPartIds(c2[k], MP), ['2(a)', '2(c)', '2(d)'], 'ticks'));
  await checkAsync('ticking (b) again puts it back in the file\'s order, not at the end', async () =>
    eq(P.chosenPartIds(P.toggleGenericPart(c2, k, '2(b)', MP)[k], MP), ['2(a)', '2(b)', '2(c)', '2(d)'], 'ticks'));
  await checkAsync('choosing the problem it already is keeps its ticks', async () =>
    eq(P.chooseGenericProblem(c2, k, 2, MP), c2, 'crops changed'));
  const c3 = P.chooseGenericProblem(c2, k, 1, MP);
  await checkAsync('changing to the one-part Problem 1 gives part 1 alone: nothing to tick', async () =>
    eq([c3[k].problemNumber, P.chosenPartIds(c3[k], MP)], [1, ['1']], 'problem 1'));
  await checkAsync('changing back to Problem 2 starts all ticked: the earlier untick does not carry over', async () =>
    eq(P.chosenPartIds(P.chooseGenericProblem(c3, k, 2, MP)[k], MP), ['2(a)', '2(b)', '2(c)', '2(d)'], 'ticks'));
  await checkAsync('a part of another problem cannot be ticked', async () =>
    eq(P.toggleGenericPart(c2, k, '1', MP), c2, 'crops changed'));
  await checkAsync('a part cannot be ticked before a problem is chosen', async () =>
    eq(P.toggleGenericPart(c0, k, '2(a)', MP), c0, 'crops changed'));
  let none = c1;
  for (const id of ['2(a)', '2(b)', '2(c)', '2(d)']) none = P.toggleGenericPart(none, k, id, MP);
  await checkAsync('every part unticked: the problem stays chosen, and the page has no part', async () =>
    eq([none[k].problemNumber, P.chosenPartIds(none[k], MP), none[k].partId], [2, [], ''], 'state'));
  await checkAsync('choosing no problem clears everything', async () => {
    const cleared = P.chooseGenericProblem(c2, k, 0, MP)[k];
    eq([P.chosenProblemNumber(cleared, MP), P.chosenPartIds(cleared, MP), cleared.partId], [null, [], ''], 'cleared');
  });
  await checkAsync('labelling moves the label only: picture, sign-off and capture id stay', async () => {
    for (const f of ['captureId', 'review', 'width', 'height', 'bytes', 'fromPage', 'inkVerdict']) {
      eq(c2[k][f], c0[k][f], f);
    }
  });
  await checkAsync('a retaken page keeps its problem and its ticks', async () => {
    const recut = { [k]: { ...c0[k], captureId: 'retake', partId: '', review: 'not_reviewed' } };
    const merged = P.mergeRecutCrops(c2, recut)[k];
    eq([merged.problemNumber, P.chosenPartIds(merged, MP), merged.captureId], [2, ['2(a)', '2(c)', '2(d)'], 'retake'], 'merged');
  });
  await checkAsync('work saved before this change (partId only) reads as that one part, under its problem', async () => {
    const old = { ...c0[k], partId: '2(c)' };
    delete old.partIds; delete old.problemNumber;
    eq([P.chosenProblemNumber(old, MP), P.chosenPartIds(old, MP)], [2, ['2(c)']], 'old crop');
    eq(P.chosenPartIds(P.toggleGenericPart({ [k]: old }, k, '2(a)', MP)[k], MP), ['2(a)', '2(c)'], 'ticking onto it');
  });
  await checkAsync('after a rollback, a page with several parts reads as its first part only (ruling 3)', async () => {
    // What the app at 0b82d9b reads: `partId`, and nothing else.
    eq(c2[k].partId, '2(a)', 'partId');
  });
}

// =====================================================
// 3. Packaging a shared page: the work order's three cases
// =====================================================
results.push('  3. packaging a shared page (S2)');
const ALL4 = ['2(a)', '2(b)', '2(c)', '2(d)'];
const shape = (payload) => Object.fromEntries(Object.entries(payload.crops).map(([k, v]) =>
  [k, [v.part_id, v.page_file, v.part_page, v.part_pages]]));

const runCase = async (labels) => {
  const ids = labels.map(([id]) => id);
  const { pages, crops, blobs } = fresh(ids);
  let c = crops;
  for (const [id, want] of labels) c = tick(c, id, 2, want, MP);
  const built = await buildGeneric(P, multipartAssignment(), pages, c, blobs);
  return { ...built, crops: c, pages, blobs };
};
const commonChecks = async (name, r, pagesOf) => {
  await checkAsync(`${name}: every crop has exactly the seventeen keys of section 11.4, in order`, async () => {
    for (const [k, v] of Object.entries(r.payload.crops)) eq(Object.keys(v), GENERIC_CROP_KEYS, `crop ${k}`);
  });
  await checkAsync(`${name}: each copy is the whole page's crop, byte for byte, and the archive holds each one`, async () => {
    for (const v of Object.values(r.payload.crops)) {
      const pageId = pagesOf[v.page_file];
      const cropBlob = r.blobs[P.cropBlobKey(key(pageId))];
      eq(r.files[v.file], createHash('sha256').update(cropBlob).digest('hex'), v.file);
      assert(r.entries.includes(v.file), `${v.file} not in the archive`);
    }
  });
  await checkAsync(`${name}: each copy carries its own part's points, and the page's own review, size and ink`, async () => {
    for (const v of Object.values(r.payload.crops)) {
      const crop = r.crops[key(pagesOf[v.page_file])];
      eq([v.max_points, v.student_review, v.width, v.height, v.ink, v.part_source, v.region_id],
        [20, crop.review, crop.width, crop.height, crop.inkVerdict === 'ink' ? 'present' : crop.inkVerdict === 'blank' ? 'none' : 'uncertain', 'student', 'gen'],
        v.file);
    }
  });
};

{
  const r = await runCase([['pgA', ALL4]]);
  await checkAsync('(i) one page carrying all four parts: 2a_1 to 2d_1, one page_file, each page 1 of 1', async () =>
    eq(shape(r.payload), {
      '2a_1': ['2(a)', 'page_1.jpg', 1, 1], '2b_1': ['2(b)', 'page_1.jpg', 1, 1],
      '2c_1': ['2(c)', 'page_1.jpg', 1, 1], '2d_1': ['2(d)', 'page_1.jpg', 1, 1],
    }, 'crops'));
  await checkAsync('(i) the archive: the page once, the crop four times', async () =>
    eq(r.entries.slice(1), ['page_1.jpg', 'crops/2a_1.jpg', 'crops/2b_1.jpg', 'crops/2c_1.jpg', 'crops/2d_1.jpg'], 'entries'));
  await commonChecks('(i)', r, { 'page_1.jpg': 'pgA' });
}
{
  const r = await runCase([['pgA', ['2(a)', '2(b)']], ['pgB', ['2(c)', '2(d)']]]);
  await checkAsync('(ii) two pages, (a)(b) then (c)(d): each part one page, on the page that carries it', async () =>
    eq(shape(r.payload), {
      '2a_1': ['2(a)', 'page_1.jpg', 1, 1], '2b_1': ['2(b)', 'page_1.jpg', 1, 1],
      '2c_1': ['2(c)', 'page_2.jpg', 1, 1], '2d_1': ['2(d)', 'page_2.jpg', 1, 1],
    }, 'crops'));
  await commonChecks('(ii)', r, { 'page_1.jpg': 'pgA', 'page_2.jpg': 'pgB' });
}
{
  const r = await runCase([['pgA', ALL4], ['pgB', ALL4]]);
  await checkAsync('(iii) one problem on two pages, all ticked on both: each part two crops, in part_page order', async () =>
    eq(shape(r.payload), {
      '2a_1': ['2(a)', 'page_1.jpg', 1, 2], '2b_1': ['2(b)', 'page_1.jpg', 1, 2],
      '2c_1': ['2(c)', 'page_1.jpg', 1, 2], '2d_1': ['2(d)', 'page_1.jpg', 1, 2],
      '2a_2': ['2(a)', 'page_2.jpg', 2, 2], '2b_2': ['2(b)', 'page_2.jpg', 2, 2],
      '2c_2': ['2(c)', 'page_2.jpg', 2, 2], '2d_2': ['2(d)', 'page_2.jpg', 2, 2],
    }, 'crops'));
  await checkAsync('(iii) moving the second page first renumbers by capture order, and nothing else', async () => {
    const swapped = [r.pages[1], r.pages[0]].map((p, i) => ({ ...p, file: `page_${i + 1}.jpg` }));
    const s = await buildGeneric(P, multipartAssignment(), swapped, r.crops, r.blobs);
    eq([s.payload.crops['2a_1'].width, s.payload.crops['2a_2'].width],
      [r.crops[key('pgB')].width, r.crops[key('pgA')].width], 'the page now first is part_page 1');
  });
  await commonChecks('(iii)', r, { 'page_1.jpg': 'pgA', 'page_2.jpg': 'pgB' });
}
{
  // Ruling 2, in a package: a problem chosen with every part unticked.
  const ids = ['pgA'];
  const { pages, crops, blobs } = fresh(ids);
  let c = P.chooseGenericProblem(crops, key('pgA'), 2, MP);
  for (const id of ALL4) c = P.toggleGenericPart(c, key('pgA'), id, MP);
  const r = await buildGeneric(P, multipartAssignment(), pages, c, blobs);
  await checkAsync('a problem chosen with every part unticked is packaged as unlabelled, never dropped', async () => {
    eq(Object.keys(r.payload.crops), ['unlabelled_1'], 'crop keys');
    const u = r.payload.crops.unlabelled_1;
    eq([u.part_id, u.page_file, u.part_page, u.part_pages, u.max_points], [null, 'page_1.jpg', null, null, null], 'fields');
    assert(u.quality_flags.includes('unlabelled'), 'not flagged unlabelled');
  });
}

// =====================================================
// 4. Coverage: advisory, and counted by page
// =====================================================
results.push('  4. coverage stays advisory, and counts pages');
{
  // Five pages, the fixture's ink cycle: page 2 is the blank one.
  const { pages, crops, blobs } = fresh(['pgA', 'pgB', 'pgC']);
  let c = tick(crops, 'pgA', 2, ['2(a)', '2(b)'], MP);
  c = tick(c, 'pgB', 2, ALL4, MP);     // blank, carrying four parts
  await checkAsync('a blank page carrying four parts is one blank page, not four', async () =>
    eq(P.genericCoverage(MP, c, pages).blank, 1, 'blank'));
  await checkAsync('a part with no page is still listed; a shared page covers every part it carries', async () => {
    const cov = P.genericCoverage(MP, c, pages);
    eq([cov.missing.map(p => p.part_id), cov.covered, cov.unlabelled], [['1'], 4, 1], 'coverage');
  });
  await checkAsync('nothing new blocks the download: the package builds with a part missing', async () => {
    const r = await buildGeneric(P, multipartAssignment(), pages, c, blobs);
    assert(r.entries.length > 0 && !('1_1' in r.payload.crops), 'unexpected');
  });
  await checkAsync('the coverage over a built archive counts the copies it holds', async () => {
    const r = await buildGeneric(P, multipartAssignment(), pages, c, blobs);
    eq(P.genericCoverage(MP, c, pages, r.entries).covered, 4, 'covered against entries');
  });
}

// =====================================================
// 5. One reader of a page's parts (ruling 3)
// =====================================================
// Andre's condition on keeping `partId` beside `partIds`: every place that reads
// a generic crop's part goes through `chosenPartIds`. Held over the source, so a
// later `crop.partId` on this path fails here rather than reading one part of a
// shared page. Only `chosenPartIds` reads the fields and only `withParts` writes
// them; comments are ignored.
results.push('  5. every reader of a generic crop\'s part goes through chosenPartIds');
{
  const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const REPO = new URL('..', import.meta.url);
  const body = (src, name) => {
    const at = src.indexOf(`const ${name} = (`);
    const end = src.indexOf('\n};', at);
    return at < 0 ? '' : src.slice(at, end);
  };
  const raw = /\.partIds?\b/g;
  const sheet = codeOnly(readFileSync(new URL('services/genericSheet.ts', REPO), 'utf8'));
  await checkAsync('services/genericSheet.ts: only chosenPartIds reads .partId/.partIds, only withParts writes them', async () => {
    const rest = sheet.replace(body(sheet, 'chosenPartIds'), '').replace(body(sheet, 'withParts'), '');
    eq(rest.match(raw) ?? [], [], 'raw reads elsewhere');
    assert(body(sheet, 'chosenPartIds').length > 0 && body(sheet, 'withParts').length > 0, 'functions not found');
  });
  await checkAsync('components/GenericPageReview.tsx reads no .partId or .partIds', async () =>
    eq(codeOnly(readFileSync(new URL('components/GenericPageReview.tsx', REPO), 'utf8')).match(raw) ?? [], [], 'raw reads'));
  await checkAsync('services/submissionPackage.ts: the generic branch reads parts only from resolveGenericCrops', async () => {
    const pkg = codeOnly(readFileSync(new URL('services/submissionPackage.ts', REPO), 'utf8'));
    const generic = pkg.slice(pkg.indexOf('if (isGenericSheetSubmission(s)) {'), pkg.indexOf('for (const crop of cropList(s.crops))'));
    assert(generic.length > 0 && /resolveGenericCrops\(/.test(generic), 'generic branch not found');
    eq(generic.match(raw) ?? [], [], 'raw reads in the generic branch');
  });
}

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
