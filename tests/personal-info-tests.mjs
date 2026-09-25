// =====================================================
// The student confirms no answer shows who they are, and the tick cannot
// outlive the answers it covered
// =====================================================
// `WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` §6.3, all four:
//
//   1. Download is impossible without the confirmation, on both paths.
//   2. The box is unticked when the review screen first appears.
//   3. Retaking a crop, replacing an image or editing a typed answer after
//      ticking clears it.
//   4. A built package carries `personal_info_confirmed: true` and the wording
//      version.
//
//   node tests/personal-info-tests.mjs
//
// `App.tsx` cannot be imported here, so where a property lives in the
// component the wiring is asserted over the shipped source, and every such
// check names the mutation it was watched failing on.
// =====================================================

import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

const pkg = await loadModule('services/submissionPackage.ts', 'pi_pkg.mjs');
const pi = await loadModule('services/personalInfo.ts', 'pi_pi.mjs');

/** Comments stripped, so a check reads the code and not the explanation of it. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const APP = codeOnly(readFileSync(join(REPO, 'App.tsx'), 'utf8'));
const TYPES = readFileSync(join(REPO, 'types.ts'), 'utf8');
const COMPONENT = codeOnly(readFileSync(join(REPO, 'components/PersonalInfoConfirmation.tsx'), 'utf8'));

// ---------- the component, rendered by the real React server renderer ----------
const outDir = mkdtempSync(join(tmpdir(), 'gb-pi-test-'));
const harnessFile = join(outDir, 'pi-harness.mjs');
await build({
  stdin: {
    contents: `
      import * as React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import PersonalInfoConfirmation from './components/PersonalInfoConfirmation';
      export const render = (props) => renderToStaticMarkup(
        React.createElement(PersonalInfoConfirmation, { onChange: () => {}, ...props }));
    `,
    resolveDir: REPO,
    loader: 'tsx',
    sourcefile: 'pi-harness.tsx',
  },
  outfile: harnessFile,
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  bundle: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'silent',
});
const { render } = await import(pathToFileURL(harnessFile).href);

// ---------- fixtures ----------
const jpegish = (seed, length) => {
  const out = new Uint8Array(length);
  out.set([0xff, 0xd8, 0xff, 0xe0], 0);
  for (let i = 4; i < length; i++) out[i] = (seed * 37 + i * 11) & 0xff;
  return out;
};
const dataUri = (bytes) => `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;

const handwritten = () => ({
  assignment: { id: 'a1', courseCode: 'ENG17', title: 'Homework 1', inputMode: 'handwritten',
    problems: [{ id: 'p0', title: 'P', description: '', subsections: [
      { id: 's0', title: 'a', description: '', points: 10, submissionType: 'Handwritten' }] }] },
  submissionData: {},
  isHandwritten: true,
  layoutId: '95438EDF',
  now: '2026-09-21T09:00:00.000Z',
  pages: [{ id: 'pg0', file: 'page_1.jpg', width: 1650, height: 2200, bytes: 5000, captureId: 'cap-page-1',
    registration: { status: 'ok', k: 2, n: 16 } }],
  crops: { p1a: { regionId: 'p1a', partId: '1(a)', pageK: 2, isDrawing: false, maxPoints: 5,
    cropSource: 'registration', review: 'not_reviewed', qualityFlags: [], file: 'crops/p1a.jpg',
    width: 842, height: 542, bytes: 900, fromPage: 'pg0', captureId: 'cap-crop-1' } },
});

const IMAGE_A = jpegish(1, 30000);
const IMAGE_B = jpegish(2, 30000);   // same length, different photograph

const electronic = () => ({
  assignment: { id: 'a2', courseCode: 'EEC1', title: 'Lab 1',
    problems: [{ id: 'p0', title: 'P', description: '', subsections: [
      { id: 's0', title: 'a', description: '', points: 40, submissionType: 'Text' },
      { id: 's1', title: 'b', description: '', points: 30, submissionType: 'Image' },
      { id: 's2', title: 'c', description: '', points: 30, submissionType: 'AI Graded: Short' }] }] },
  submissionData: {
    p0_s0: { textAnswer: 'The node voltage is 1.2 V.' },
    p0_s1: { imageAnswers: [dataUri(IMAGE_A)] },
    p0_s2: { aiAnswer: 'Because the current divides.' },
  },
  isHandwritten: false,
  layoutId: null,
  now: '2026-09-21T09:00:00.000Z',
  pages: [],
  crops: {},
});

const assets = {
  pdfBytes: jpegish(11, 4096),
  readBlob: async (key) => ({ pg0: jpegish(3, 5000), crop_p1a: jpegish(4, 900) })[key] ?? null,
  downsampleImage: async (uri) => uri,
};

const refusalOf = async (sources) => {
  try { await pkg.buildSubmissionPackage(sources, assets); return null; }
  catch (e) { return e; }
};

console.log('\npersonal information — confirmed, and only for what was on screen\n');

// =====================================================
// 1. No confirmation, no package — on both paths
// =====================================================
console.log('  1. download is impossible without the confirmation');

for (const [label, make] of [['handwritten', handwritten], ['electronic', electronic]]) {
  await checkAsync(`${label}: no confirmation at all refuses the build`, async () => {
    const e = await refusalOf(make());
    assert(e && e.name === pi.PERSONAL_INFO_UNCONFIRMED, `built, or refused for ${e?.name}`);
  });
  await checkAsync(`${label}: an explicit null confirmation refuses the build`, async () => {
    const e = await refusalOf({ ...make(), personalInfoConfirmation: null });
    assert(e && e.name === pi.PERSONAL_INFO_UNCONFIRMED, `built, or refused for ${e?.name}`);
  });
  await checkAsync(`${label}: a confirmation made over other answers refuses the build`, async () => {
    const other = make();
    other.assignment = { ...other.assignment, title: 'Something else' };
    const e = await refusalOf({ ...make(), personalInfoConfirmation: pi.confirmPersonalInfo(other) });
    assert(e && e.name === pi.PERSONAL_INFO_UNCONFIRMED, `built, or refused for ${e?.name}`);
  });
  await checkAsync(`${label}: a confirmation of an older wording refuses the build`, async () => {
    const s = make();
    const conf = { ...pi.confirmPersonalInfo(s), wordingVersion: 'pi-0' };
    const e = await refusalOf({ ...s, personalInfoConfirmation: conf });
    assert(e && e.name === pi.PERSONAL_INFO_UNCONFIRMED, `built, or refused for ${e?.name}`);
  });
  await checkAsync(`${label}: a current confirmation builds`, async () => {
    const s = make();
    const e = await refusalOf({ ...s, personalInfoConfirmation: pi.confirmPersonalInfo(s) });
    assert(e === null, `refused: ${e?.message}`);
  });
}

// The app refuses before the builder does, in the page, with the way through.
// MUTATION-TESTED: deleting the `if (!personalInfoCurrent)` block from
// `runSubmissionDownload` fails the first check here; dropping
// `personalInfoConfirmation: personalInfo` from the sources fails the second.
check('App: the download handler refuses first, before the PDF is rendered', () => {
  const body = APP.slice(APP.indexOf('const runSubmissionDownload'));
  const guard = body.search(/if \(!personalInfoCurrent\) \{\s*setPersonalInfoPrompt\(true\);\s*return;\s*\}/);
  assert(guard >= 0, 'runSubmissionDownload does not refuse on a missing confirmation');
  assert(guard < body.indexOf('buildPdfBytes('), 'the refusal comes after the PDF render');
  assert(guard < body.indexOf('buildSubmissionPackage('), 'the refusal comes after the build');
});
check('App: the confirmation is handed to the builder, which refuses too', () =>
  assert(/buildSubmissionPackage\(\s*\{[^}]*personalInfoConfirmation: personalInfo,/.test(APP),
    'the app does not pass its confirmation to buildSubmissionPackage'));
check('App: all three Download buttons go through the one handler', () => {
  const direct = APP.match(/onClick=\{handleDownloadForGradescope\}/g) ?? [];
  assert(direct.length === 2, `${direct.length} buttons bound directly; expected the bottom bar and the print bar`);
  assert(/onDownloadForGradescope=\{handleDownloadForGradescope\}/.test(APP), 'the sidebar is bound to something else');
});
check('App: the refusal is shown in the page, never through a browser dialog', () => {
  assert(/<PersonalInfoRequired/.test(APP), 'the in-page refusal is not rendered');
  const body = APP.slice(APP.indexOf('const runSubmissionDownload'), APP.indexOf('const handleDownloadForGradescope'));
  const branch = body.slice(body.indexOf('PERSONAL_INFO_UNCONFIRMED'), body.indexOf('} else {', body.indexOf('PERSONAL_INFO_UNCONFIRMED')));
  assert(!/alert\(|confirm\(/.test(branch), 'the builder refusal is reported through a dialog');
});

// =====================================================
// 2. Unticked when it first appears
// =====================================================
console.log('  2. the box starts unticked');

check('the initial confirmation is null, and null is not a confirmation', () => {
  assert(pi.INITIAL_PERSONAL_INFO_CONFIRMATION === null, 'the initial state is not null');
  assert(!pi.isConfirmationCurrent(pi.INITIAL_PERSONAL_INFO_CONFIRMATION, handwritten()), 'null counts as confirmed');
});
check('rendered unconfirmed, the box is not checked', () => {
  const html = render({ confirmed: false, stale: false });
  assert(/type="checkbox"/.test(html), 'no checkbox rendered');
  assert(!/checked/.test(html), `the box renders checked: ${html}`);
  assert(html.includes('None of them shows my name'), 'the statement is not on the box');
});
check('rendered confirmed, the box is checked (so the test above can fail)', () =>
  assert(/checked=""/.test(render({ confirmed: true, stale: false })), 'a confirmed box does not render checked'));
check('the component holds no state of its own and cannot default to ticked', () => {
  assert(!/defaultChecked/.test(COMPONENT), 'the box has a defaultChecked');
  assert(!/useState/.test(COMPONENT), 'the component keeps its own state');
  assert(/checked=\{confirmed\}/.test(COMPONENT), 'the box is not controlled by `confirmed`');
});
// MUTATION-TESTED: initialising the app's state from anything but
// INITIAL_PERSONAL_INFO_CONFIRMATION fails this check.
check('App: the confirmation starts from the initial value and is not autosaved', () => {
  assert(/useState<PersonalInfoConfirmationState>\(INITIAL_PERSONAL_INFO_CONFIRMATION\)/.test(APP),
    'the app does not start from INITIAL_PERSONAL_INFO_CONFIRMATION');
  const appState = TYPES.slice(TYPES.indexOf('export interface AppState'));
  assert(!/personalInfo/i.test(appState.slice(0, appState.indexOf('\n}'))),
    'the confirmation is in AppState, so it would be autosaved and restored');
});
check('App: a newly loaded assignment clears any earlier tick', () =>
  assert(/useEffect\(\(\) => \{ setPersonalInfo\(null\); \}, \[state\.assignment\]\);/.test(APP),
    'loading a different assignment keeps the previous tick'));
check('App: the box is shown on both paths', () => {
  const uses = APP.match(/<PersonalInfoConfirmation\s/g) ?? [];
  assert(uses.length === 2, `${uses.length} renders; expected one per path`);
  assert(/\{isHandwritten && \(\s*<PersonalInfoConfirmation/.test(APP), 'no box on the handwritten path');
  assert(/\{!isHandwritten && \(\s*<PersonalInfoConfirmation/.test(APP), 'no box on the electronic path');
});

// =====================================================
// 3. A change to what it covered clears it
// =====================================================
console.log('  3. changing an answer clears the tick');

const afterChange = (make, change) => {
  const before = make();
  const conf = pi.confirmPersonalInfo(before);
  const after = make();
  change(after);
  return { before: pi.isConfirmationCurrent(conf, before), after: pi.isConfirmationCurrent(conf, after) };
};
const expectCleared = (label, make, change) => check(label, () => {
  const r = afterChange(make, change);
  assert(r.before, 'the tick did not count before the change');
  assert(!r.after, 'the tick survived the change');
});
const expectKept = (label, make, change) => check(label, () => {
  const r = afterChange(make, change);
  assert(r.before && r.after, 'the tick was cleared by a change to nothing it covers');
});

expectCleared('retaking a crop, even at the same size and byte count', handwritten, s => {
  s.crops.p1a = { ...s.crops.p1a, captureId: 'cap-crop-2' };
});
expectCleared('photographing just that answer instead (direct capture)', handwritten, s => {
  s.crops.p1a = { ...s.crops.p1a, cropSource: 'direct_capture', fromPage: undefined, captureId: 'cap-crop-3' };
});
expectCleared('retaking the page, even at the same size', handwritten, s => {
  s.pages[0] = { ...s.pages[0], captureId: 'cap-page-2' };
});
expectCleared('rotating the page', handwritten, s => {
  s.pages[0] = { ...s.pages[0], width: 2200, height: 1650, captureId: 'cap-page-3' };
});
expectCleared('adding a page', handwritten, s => {
  s.pages.push({ id: 'pg1', file: 'page_2.jpg', width: 1650, height: 2200, bytes: 4000, captureId: 'x' });
});
expectCleared('replacing an image answer with another of the same length', electronic, s => {
  s.submissionData.p0_s1 = { imageAnswers: [dataUri(IMAGE_B)] };
});
expectCleared('adding a second image answer', electronic, s => {
  s.submissionData.p0_s1 = { imageAnswers: [dataUri(IMAGE_A), dataUri(IMAGE_B)] };
});
expectCleared('editing a typed answer by one character', electronic, s => {
  s.submissionData.p0_s0 = { textAnswer: 'The node voltage is 1.3 V.' };
});
expectCleared('editing an AI-graded answer', electronic, s => {
  s.submissionData.p0_s2 = { aiAnswer: 'Because the current divides, Jane.' };
});
// What it deliberately does NOT cover, held so a later "improvement" that
// clears on every state change is a decision and not an accident.
expectKept('signing off a crop does not clear it (no pixel changed)', handwritten, s => {
  s.crops.p1a = { ...s.crops.p1a, review: 'signed_off' };
});
expectKept('reordering pages does not clear it (only file names change)', handwritten, s => {
  s.pages[0] = { ...s.pages[0], file: 'page_7.jpg' };
});

// The unit checks above rely on every image change stamping a new capture id.
// MUTATION-TESTED: removing any one of the five stamps fails this check.
check('App: every place a page or crop bitmap changes stamps a new capture id', () => {
  const stamps = APP.match(/captureId: newCaptureId\(\)/g) ?? [];
  assert(stamps.length === 5,
    `${stamps.length} stamps; expected add page, replace page, rotate page, re-cut crops, direct capture`);
  // The generic sheet's re-cut (2026-09-24) builds its record in
  // `genericCropRecord`, and is handed a fresh capture id here.
  assert(/genericCropRecord\([\s\S]{0,120}?newCaptureId\(\)\)/.test(APP),
    'the generic re-cut does not stamp a new capture id');
  for (const [fn, label] of [['const runRegistration', 're-cut'], ['const handleAddPage', 'add'],
    ['const handleReplacePage', 'replace'], ['const handleRotatePage', 'rotate'],
    ['const handleDirectCapture', 'direct capture']]) {
    const start = APP.indexOf(fn);
    const next = APP.indexOf('\n  const ', start + fn.length);
    assert(start >= 0 && APP.slice(start, next).includes('captureId: newCaptureId()'), `${label} does not stamp`);
  }
});
check('App: the tick is recomputed from the live answers, pages and crops', () =>
  assert(/isConfirmationCurrent\(personalInfo, \{\s*assignment: state\.assignment,\s*submissionData: state\.submissionData,\s*pages: state\.pages,\s*crops: state\.crops,\s*\}\), \[personalInfo, state\.assignment, state\.submissionData, state\.pages, state\.crops\]\)/.test(APP),
    'personalInfoCurrent is not derived from the current submission'));
check('rendered stale, the box explains why it is unticked', () =>
  assert(/changed after you ticked/.test(render({ confirmed: false, stale: true })), 'no explanation shown'));

// =====================================================
// 4. The package records it
// =====================================================
console.log('  4. the package records the confirmation and its wording');

for (const [label, make] of [['handwritten', handwritten], ['electronic', electronic]]) {
  await checkAsync(`${label}: personal_info_confirmed is true and the wording version is recorded`, async () => {
    const s = make();
    const built = await pkg.buildSubmissionPackage({ ...s, personalInfoConfirmation: pi.confirmPersonalInfo(s) }, assets);
    const text = await built.zip.file(`${built.baseName}.json`).async('string');
    const payload = JSON.parse(text);
    assert(payload.personal_info_confirmed === true, `personal_info_confirmed is ${payload.personal_info_confirmed}`);
    assert(payload.personal_info_wording === pi.PERSONAL_INFO_WORDING_VERSION,
      `personal_info_wording is ${payload.personal_info_wording}`);
  });
}
check('the wording version is short and names a version', () =>
  assert(/^pi-\d+$/.test(pi.PERSONAL_INFO_WORDING_VERSION), pi.PERSONAL_INFO_WORDING_VERSION));

// ---------- report ----------
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
rmSync(outDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
