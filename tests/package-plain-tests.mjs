// =====================================================
// The submission package is plain, de-identified, and says only what it must
// =====================================================
// `WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` §3, §4, §5 and §7.
//
//   node tests/package-plain-tests.mjs
//
// This file was `package-encryption-tests.mjs`, which proved that a course with
// a public key sealed every entry. The key, the seal and the gb1 encoding of
// the payload are all gone, so the coverage is rewritten rather than deleted:
// the same fixture now proves the opposite claims.
//
//   1. The archive is plain: the same entries, in the same order, under the same
//      names, with the stored bytes untouched, and a payload that `JSON.parse`
//      reads directly (§3.2, §4).
//   2. A spec from before 2026-09-21 that still carries a course public key
//      changes nothing (§3).
//   3. The identity guard refuses rather than strips, and is live (§5).
//   4. The payload's keys are exactly the known list, on both paths, so a new
//      key — identity-shaped or not — cannot arrive quietly (§5, §7).
//
// The personal-information confirmation (§6) has its own suite,
// `personal-info-tests.mjs`. Every build here is confirmed, as the UI requires.
//
// What it does NOT cover: geometry, registration, the capture gate, `layout_id`.
// This work order touches none of them, and `registration-tests.mjs` and
// `gate-tests.mjs` hold them.
// =====================================================

import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { loadModule } from './captureSet.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
const results = [];
const check = (name, fn) => {
  try { fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertEqual = (actual, expected, msg) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n          expected: ${e}\n          actual:   ${a}`);
};

const pkg = await loadModule('services/submissionPackage.ts', 'pp_pkg.mjs');
const pi = await loadModule('services/personalInfo.ts', 'pp_pi.mjs');
const idg = await loadModule('services/identityGuard.ts', 'pp_id.mjs');

console.log('\nthe submission package — plain, de-identified, and nothing more\n');

// =====================================================
// The fixture: a handwritten submission with pages and crops, and an
// electronic one with image answers. Distinct bytes everywhere, so an entry
// written from the wrong blob is visible rather than merely equal in length.
// =====================================================
const jpegish = (seed, length) => {
  const out = new Uint8Array(length);
  out.set([0xff, 0xd8, 0xff, 0xe0], 0);
  for (let i = 4; i < length; i++) out[i] = (seed * 37 + i * 11) & 0xff;
  return out;
};

const PAGE_BYTES = { pg0: jpegish(1, 5000), pg1: jpegish(2, 4096) };
const CROP_BYTES = { p1a: jpegish(3, 900), p1b: jpegish(4, 1200) };

/** Confirmed as the UI confirms it: over exactly these sources. */
const confirmed = (sources) => ({ ...sources, personalInfoConfirmation: pi.confirmPersonalInfo(sources) });

const handwrittenSources = (extraAssignment = {}, crops = null) => confirmed({
  assignment: {
    id: 'a1', courseCode: 'ENG17', title: 'Homework 1', inputMode: 'handwritten',
    ...extraAssignment,
    problems: [{
      id: 'p0', title: 'P', description: '', subsections: [
        { id: 's0', title: 'a', description: '', points: 10, submissionType: 'Text' },
      ],
    }],
  },
  submissionData: {},
  isHandwritten: true,
  layoutId: '95438EDF',
  now: '2026-09-03T12:34:56.000Z',
  pages: [
    { id: 'pg0', file: 'page_1.jpg', width: 1650, height: 2200,
      registration: { status: 'ok', k: 2, n: 16, marksFound: 4, marksDetected: ['NW', 'NE', 'SW', 'SE'], marksDeclined: [], residualMm: 0.5, heldOutMm: 0 } },
    { id: 'pg1', file: 'page_2.jpg', width: 1650, height: 2200,
      registration: { status: 'ok', k: 3, n: 16, marksFound: 4, marksDetected: ['NW', 'NE', 'SW', 'SE'], marksDeclined: [], residualMm: 0.4, heldOutMm: 0 } },
  ],
  crops: crops ?? {
    p1a: { regionId: 'p1a', partId: '1(a)', pageK: 2, isDrawing: false, maxPoints: 5,
      cropSource: 'registration', review: 'signed_off', qualityFlags: [],
      file: 'crops/p1a.jpg', width: 842, height: 542, bytes: 900 },
    p1b: { regionId: 'p1b', partId: '1(b)', pageK: 3, isDrawing: false, maxPoints: 5,
      cropSource: 'registration', review: 'signed_off', qualityFlags: [],
      file: 'crops/p1b.jpg', width: 1033, height: 324, bytes: 1200 },
  },
});

const ELECTRONIC_IMAGE = jpegish(9, 2048);
const ELECTRONIC_DATA_URI = `data:image/jpeg;base64,${Buffer.from(ELECTRONIC_IMAGE).toString('base64')}`;

const electronicSources = (extraAssignment = {}) => confirmed({
  assignment: {
    id: 'a2', courseCode: 'EEC1', title: 'Lab 1',
    ...extraAssignment,
    problems: [{
      id: 'p0', title: 'P', description: '', subsections: [
        { id: 's0', title: 'a', description: '', points: 50, submissionType: 'Text' },
        { id: 's1', title: 'b', description: '', points: 50, submissionType: 'Image' },
      ],
    }],
  },
  submissionData: { p0_s0: { textAnswer: 'the answer' }, p0_s1: { imageAnswers: [ELECTRONIC_DATA_URI] } },
  isHandwritten: false,
  layoutId: null,
  now: '2026-09-03T12:34:56.000Z',
  pages: [],
  crops: {},
});

const PDF_BYTES = (() => {
  const out = jpegish(11, 32768);
  out.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], 0);   // %PDF-1.4
  return out;
})();

const assets = {
  pdfBytes: PDF_BYTES,
  readBlob: async (key) => PAGE_BYTES[key] ?? CROP_BYTES[key.replace(/^crop_/, '')] ?? null,
  downsampleImage: async (uri) => uri,
};

const manifestOf = async (built) => {
  const zip = await JSZip.loadAsync(await built.zip.generateAsync({
    type: 'nodebuffer', ...pkg.SUBMISSION_ZIP_OPTIONS }));
  const out = new Map();
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    out.set(name, await zip.files[name].async('uint8array'));
  }
  return out;
};

const handwritten = await pkg.buildSubmissionPackage(handwrittenSources(), assets);
const electronic = await pkg.buildSubmissionPackage(electronicSources(), assets);
const hwManifest = await manifestOf(handwritten);
const elManifest = await manifestOf(electronic);
const payloadText = (manifest, built) =>
  Buffer.from(manifest.get(`${built.baseName}.json`)).toString('utf8');

// =====================================================
// 1. The archive is plain
// =====================================================
console.log('  1. the archive is plain');

check('no entry name carries a seal suffix, on either path', () => {
  for (const name of [...hwManifest.keys(), ...elManifest.keys()]) {
    assert(!/\.gb\d$/i.test(name), `${name} is named as sealed`);
  }
});

check('the handwritten archive order: JSON, pages, crops', () =>
  assertEqual(handwritten.entries, [
    `${handwritten.baseName}.json`, 'page_1.jpg', 'page_2.jpg', 'crops/p1a.jpg', 'crops/p1b.jpg',
  ], 'the handwritten archive order changed'));

check('the electronic archive order: JSON, PDF, image answers', () =>
  assertEqual(electronic.entries, [
    `${electronic.baseName}.json`, `${electronic.baseName}.pdf`, 'p0s1_image_0.jpg',
  ], 'the electronic archive order changed'));

check('the page and crop entries are the stored bytes, untouched', () => {
  for (const [name, expected] of [
    ['page_1.jpg', PAGE_BYTES.pg0], ['page_2.jpg', PAGE_BYTES.pg1],
    ['crops/p1a.jpg', CROP_BYTES.p1a], ['crops/p1b.jpg', CROP_BYTES.p1b],
  ]) {
    assert(hwManifest.has(name), `${name} is missing`);
    assertEqual([...hwManifest.get(name)], [...expected], `${name} is not the stored bytes`);
  }
});

check('the electronic image answer and PDF are the stored bytes, untouched', () => {
  assertEqual([...elManifest.get('p0s1_image_0.jpg')], [...ELECTRONIC_IMAGE], 'the image answer changed');
  assertEqual([...elManifest.get(`${electronic.baseName}.pdf`)], [...PDF_BYTES], 'the PDF changed');
  assertEqual(electronic.submissionJson.pdf_filename, `${electronic.baseName}.pdf`,
    'pdf_filename does not name the entry that is there');
});

check('a handwritten submission still carries no PDF', () => {
  assert(![...hwManifest.keys()].some(n => /\.pdf$/i.test(n)), 'a handwritten archive has a PDF');
  assert(!('pdf_filename' in handwritten.submissionJson), 'a handwritten payload names a PDF');
});

for (const [label, text] of [['handwritten', payloadText(hwManifest, handwritten)],
  ['electronic', payloadText(elManifest, electronic)]]) {
  check(`${label}: the payload entry is JSON that JSON.parse reads directly`, () => {
    assert(!text.includes('gb1:'), `the payload carries a gb1: prefix: ${text.slice(0, 8)}`);
    assert(text.trimStart().startsWith('{'), `the payload does not begin as a JSON object: ${text.slice(0, 8)}`);
    JSON.parse(text);
  });
}

check('the payload in the archive is exactly the payload the build reports', () =>
  assertEqual(JSON.parse(payloadText(hwManifest, handwritten)), handwritten.submissionJson,
    'the serialised payload and the reported one differ'));

check('the payload declares no sealed entries and no encryption', () => {
  for (const key of ['image_encryption', 'encrypted_entries']) {
    assert(!(key in handwritten.submissionJson), `${key} is in the handwritten payload`);
    assert(!(key in electronic.submissionJson), `${key} is in the electronic payload`);
  }
});

check('the build reports no envelope and no seal', () => {
  for (const key of ['format', 'imageEncryption', 'sealMs', 'sealedPlainBytes']) {
    assert(!(key in handwritten), `the build still reports ${key}`);
  }
});

check('the archive name carries no student name', () => {
  assert(/^ENG17_Homework_1_submission_\d{8}-\d{4}$/.test(handwritten.baseName), handwritten.baseName);
  assert(/^EEC1_Lab_1_submission_\d{8}-\d{4}$/.test(electronic.baseName), electronic.baseName);
});

check('the compression is still DEFLATE level 6', () =>
  assertEqual(pkg.SUBMISSION_ZIP_OPTIONS, { compression: 'DEFLATE', compressionOptions: { level: 6 } },
    'SUBMISSION_ZIP_OPTIONS changed'));

// =====================================================
// 2. A spec that still carries a course public key
// =====================================================
console.log('  2. an old spec with a course key changes nothing');

const OLD_KEY = '-----BEGIN PUBLIC KEY-----\nbm90YWtleQ==\n-----END PUBLIC KEY-----\n';

await checkAsync('handwritten: the same entries and the same payload keys', async () => {
  const b = await pkg.buildSubmissionPackage(handwrittenSources({ coursePublicKey: OLD_KEY }), assets);
  assertEqual(b.entries.slice(1), handwritten.entries.slice(1), 'entries differ');
  assertEqual(Object.keys(b.submissionJson), Object.keys(handwritten.submissionJson), 'payload keys differ');
});

await checkAsync('electronic: the same entries and the same payload keys', async () => {
  const b = await pkg.buildSubmissionPackage(electronicSources({ coursePublicKey: OLD_KEY }), assets);
  assertEqual(b.entries.slice(1), electronic.entries.slice(1), 'entries differ');
  assertEqual(Object.keys(b.submissionJson), Object.keys(electronic.submissionJson), 'payload keys differ');
});

// =====================================================
// 3. The identity guard refuses, and is live
// =====================================================
console.log('  3. identity-shaped keys are refused');

check('the four fields the old strip named are identity keys', () => {
  for (const k of ['student_name', 'email', 'sid', 'student_id']) assert(idg.isIdentityKey(k), k);
});
check('common variants are identity keys', () => {
  for (const k of ['name', 'studentId', 'StudentID', 'email_address', 'emailAddress', 'netid',
    'NetID', 'first_name', 'lastName', 'full-name', 'student_number', 'user_id', 'username']) {
    assert(idg.isIdentityKey(k), `${k} is not recognised as identity-shaped`);
  }
});
check('none of the payload\'s own keys trips it', () => {
  for (const k of ['course_code', 'assignment_id', 'pdf_filename', 'region_id', 'part_id',
    'page_k', 'layout_id', 'file', 'last_saved', 'student_review', 'crop_source', 'max_points']) {
    assert(!idg.isIdentityKey(k), `${k} was taken for an identity key`);
  }
});
check('it finds a key at any depth and names its path', () =>
  assertEqual(idg.identityKeysIn({ a: { crops: { p1a: { email: 'x' } } }, b: [{ netid: 1 }] }),
    ['a.crops.p1a.email', 'b[0].netid'], 'the paths are wrong'));
check('assertNoIdentityKeys refuses, naming the key — it does not strip', () => {
  const payload = { course_code: 'X', student_name: 'Jane Smith' };
  let threw = null;
  try { idg.assertNoIdentityKeys(payload); } catch (e) { threw = e; }
  assert(threw && threw.name === idg.IDENTITY_IN_PAYLOAD, 'it did not refuse');
  assert(/student_name/.test(threw.message), `it did not name the key: ${threw.message}`);
  assert(payload.student_name === 'Jane Smith', 'it mutated the payload');
});

// The live test. A region id comes from the instructor's layout map, so it is
// the one route by which an identity-shaped key can reach a real payload
// without a code change — and the route this uses to prove the builder calls
// the guard. MUTATION-TESTED: with the `assertNoIdentityKeys` call removed from
// `buildSubmissionPackage`, this check fails.
await checkAsync('the builder refuses a payload carrying an identity-shaped key', async () => {
  const crop = { regionId: 'student_name', partId: '1(a)', pageK: 2, isDrawing: false, maxPoints: 5,
    cropSource: 'registration', review: 'signed_off', qualityFlags: [],
    file: 'crops/student_name.jpg', width: 10, height: 10, bytes: 900 };
  let threw = null;
  try {
    await pkg.buildSubmissionPackage(handwrittenSources({}, { student_name: crop }), assets);
  } catch (e) { threw = e; }
  assert(threw !== null, 'a package was built with an identity-shaped key in its payload');
  assert(threw.name === idg.IDENTITY_IN_PAYLOAD, `refused for the wrong reason: ${threw.name}`);
});

// Both paths go through the one call. The electronic path has no input that can
// carry a key of the author's choosing — its keys are all generated — so what
// is held here is the shape that makes the handwritten proof cover it: one call,
// on the assembled payload, before the path splits. MUTATION-TESTED: moving the
// call inside the handwritten branch fails this check.
check('the guard is called once, on the assembled payload, before the paths split', () => {
  const src = readFileSync(join(REPO, 'services/submissionPackage.ts'), 'utf8');
  const body = src.slice(src.indexOf('export const buildSubmissionPackage'));
  const calls = body.match(/assertNoIdentityKeys\(/g) ?? [];
  assert(calls.length === 1, `${calls.length} calls in buildSubmissionPackage`);
  assert(/\n  const submissionJson = buildSubmissionJson\(pinned\);\n  assertNoIdentityKeys\(submissionJson\);\n/.test(body),
    'the guard is not called at the top level, directly on the assembled payload');
  assert(body.indexOf('assertNoIdentityKeys(') < body.indexOf('if (!sources.isHandwritten)'),
    'the guard is called after the handwritten/electronic split');
});

// =====================================================
// 4. The payload's keys are exactly these
// =====================================================
// §7. **Anything this app puts in the package is something a student could have
// edited**, so the list is closed: a new key fails this suite until someone
// adds it here on purpose, and a reviewer reading the diff sees it arrive.
console.log('  4. the payload keys, closed');

const TOP_ELECTRONIC = ['course_code', 'assignment_id', 'pdf_filename', 'ai_feedback', 'submission_data',
  'last_saved', 'personal_info_confirmed', 'personal_info_wording'];
const TOP_HANDWRITTEN = ['course_code', 'assignment_id', 'ai_feedback', 'submission_data', 'last_saved',
  'personal_info_confirmed', 'personal_info_wording', 'input_mode', 'layout_id', 'pages', 'crops'];
const ANSWER_KEYS = ['answer', 'images_submitted'];
const PAGE_KEYS = ['file', 'width', 'height', 'k', 'n', 'registration', 'marks_found', 'marks_detected',
  'marks_declined', 'residual_mm', 'held_out_mm'];
// `part_source` added 2026-09-24 (`WORKORDER_SS_PAGE_LABELLING`): `"layout"` on
// this, the printed sheet, so it can be told apart from the generic sheet's
// `"student"` without inference. The generic sheet's own crop keys are closed
// in `tests/generic-sheet-tests.mjs`.
const CROP_KEYS = ['region_id', 'part_id', 'part_source', 'page_k', 'is_drawing', 'max_points', 'crop_source',
  'student_review', 'quality_flags', 'file', 'width', 'height'];

check('electronic top-level keys are exactly the list', () =>
  assertEqual(Object.keys(electronic.submissionJson), TOP_ELECTRONIC, 'electronic payload keys changed'));
check('handwritten top-level keys are exactly the list', () =>
  assertEqual(Object.keys(handwritten.submissionJson), TOP_HANDWRITTEN, 'handwritten payload keys changed'));
check('every answer carries exactly answer and images_submitted', () => {
  for (const b of [electronic, handwritten]) {
    for (const [k, v] of Object.entries(b.submissionJson.submission_data)) {
      assert(/^p\d+s\d+$/.test(k), `submission_data key ${k} is not a part identifier`);
      assertEqual(Object.keys(v), ANSWER_KEYS, `${k} carries other keys`);
    }
  }
});
check('every page carries exactly the page keys', () => {
  for (const p of handwritten.submissionJson.pages) assertEqual(Object.keys(p), PAGE_KEYS, 'page keys changed');
});
check('every crop carries exactly the crop keys, keyed by its own region_id', () => {
  for (const [k, c] of Object.entries(handwritten.submissionJson.crops)) {
    assertEqual(Object.keys(c), CROP_KEYS, `crop ${k} keys changed`);
    assert(c.region_id === k, `crop keyed ${k} says region_id ${c.region_id}`);
  }
});
check('no identity-shaped key in either payload', () => {
  assertEqual(idg.identityKeysIn(handwritten.submissionJson), [], 'handwritten');
  assertEqual(idg.identityKeysIn(electronic.submissionJson), [], 'electronic');
});

// ---------- report ----------
console.log(results.join('\n'));
console.log(`\n  handwritten entries: ${handwritten.entries.join(', ')}`);
console.log(`  electronic entries:  ${electronic.entries.join(', ')}`);
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
