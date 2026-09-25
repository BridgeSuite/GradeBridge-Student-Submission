// =====================================================
// A file is refused in the right words, where the student can see it,
// and no student-facing sentence assumes a grader
// =====================================================
// `workorders/WORKORDER_SS_NO_GRADER_STRINGS_AND_LOAD_ORDER_2026-09-25.md`
// and its Supplement 1.
//
//   node tests/load-refusal-tests.mjs
//
// 1. Real files go through the real load chain, the same calls in the same
//    order as `handleLoadAssignment`: `loadAssignmentBundle`, decode,
//    `chooseLayoutSource`, `parseLayoutCsv`, then `assignmentLoadRefusal`. A
//    generic-page file with no map gets the generic refusal. It used to get the
//    printed sheet's, because that check ran first.
// 2. Behaviour does not change except where the order says (Supplement 1): a
//    table of every combination, old decision against new.
// 3. The refusal reaches the page, not only a dialog a browser can suppress.
// 4. No rendered review sentence, on either sheet, names a grader.
// =====================================================

import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadModule } from './captureSet.mjs';
import { encodeGb1 } from './gb1Encode.mjs';

globalThis.crypto ??= webcrypto;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

let passed = 0, failed = 0;
const results = [];
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const check = (name, fn) => {
  try { fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\nload refusals — the right words, in the page, and no grader anywhere\n');

const bundle = await loadModule('services/assignmentBundle.ts', 'lr_bundle.mjs');
const lay = await loadModule('services/layoutMap.ts', 'lr_layout.mjs');
const cryptoSvc = await loadModule('cryptoService.ts', 'lr_crypto.mjs');
const refusalMod = await loadModule('services/loadRefusal.ts', 'lr_refusal.mjs');
const gen = await loadModule('services/genericSheet.ts', 'lr_generic.mjs');
const wording = await loadModule('services/genericWording.ts', 'lr_wording.mjs');
const BAD_GENERIC = wording.GENERIC_WORDING.badGenericFile;

// The approved printed-sheet refusal, spelled out rather than imported, so a
// change to it fails here until the approval is recorded again.
const PRINTED_REFUSAL =
  'This assignment file is incomplete: it is missing the map that tells the application ' +
  'where your answers are on the page.\n\nThis file has not been loaded.\n\n' +
  'Load the assignment zip your instructor gave you, the one you printed the question PDF from, ' +
  'rather than the assignment_spec.json on its own. If the zip does the same thing, tell your instructor.';

const asFile = (text) => {
  const bytes = new TextEncoder().encode(text);
  return { name: 'assignment.json', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};

/** `handleLoadAssignment`, minus the acting: what it decides for this file. */
const loadLikeApp = async (fileText) => {
  const loaded = await bundle.loadAssignmentBundle(asFile(fileText));
  const raw = loaded.specText;
  const json = cryptoSvc.isEncoded(raw) ? await cryptoSvc.decryptJson(raw) : JSON.parse(raw);
  if (!json.problems || !json.title || !json.courseCode) throw new Error('Invalid assignment file format');
  const source = bundle.chooseLayoutSource(loaded.layout, json);
  const layout = source ? await lay.parseLayoutCsv(source.text, source.name) : null;
  return { json, layout, refusal: refusalMod.assignmentLoadRefusal(json, layout) };
};

// The real files. The generic one is the Assignment Maker's own export,
// gb1-encoded, with the generic map inside it.
const GENERIC_FILE = readFileSync(join(HERE, 'fixtures', 'generic_sheet_sample.json'), 'utf8').trim();
const genericSpec = await cryptoSvc.decryptJson(GENERIC_FILE);
const PRINTED_CSV_NAME = 'layout_ENG17HOM496F.csv';
const PRINTED_CSV = readFileSync(join(HERE, 'fixtures', PRINTED_CSV_NAME), 'utf8');
const printedSpec = (extra = {}) => ({
  id: 'ENG17HOM496F', courseCode: 'ENG17', title: 'Homework 1', inputMode: 'handwritten',
  preamble: '', problems: [{ id: 'p1', name: 'P1', description: '', subsections: [] }],
  createdAt: 0, updatedAt: 0, ...extra,
});
const withoutMap = ({ layoutCsv, layoutCsvName, ...rest }) => rest;

// =====================================================
// 1. Real files, the real load chain
// =====================================================
results.push('  1. real files through the load chain');

await checkAsync('the generic sample, as exported, still loads (a stop condition if not)', async () => {
  const r = await loadLikeApp(GENERIC_FILE);
  assert(r.layout && r.layout.computedLayoutId === '5F0B10BC', `map is ${r.layout?.computedLayoutId}`);
  assert(r.refusal === null, `refused: ${r.refusal?.detail ?? r.refusal?.message}`);
});

await checkAsync('a generic-page file with no map gets the GENERIC refusal, not the printed sheet\'s', async () => {
  assert('layoutCsv' in genericSpec, 'the fixture carries no embedded map to remove');
  const r = await loadLikeApp(await encodeGb1(withoutMap(genericSpec)));
  assert(r.layout === null, 'a map arrived from somewhere');
  assert(r.refusal?.kind === 'generic-sheet', `refused as ${r.refusal?.kind}`);
  assert(r.refusal.message === BAD_GENERIC, `message: ${r.refusal.message.slice(0, 80)}`);
  assert(r.refusal.detail === 'no layout map', `detail: ${r.refusal.detail}`);
});

await checkAsync('the same file as plain JSON is refused the same way', async () => {
  const r = await loadLikeApp(JSON.stringify(withoutMap(genericSpec)));
  assert(r.refusal?.message === BAD_GENERIC, `message: ${r.refusal?.message.slice(0, 80)}`);
});

await checkAsync('a printed-sheet file with no map gets the new printed-sheet refusal, word for word', async () => {
  const r = await loadLikeApp(await encodeGb1(printedSpec()));
  assert(r.refusal?.kind === 'no-layout-map', `refused as ${r.refusal?.kind}`);
  assert(r.refusal.message === PRINTED_REFUSAL, `message:\n          ${JSON.stringify(r.refusal.message)}`);
});

await checkAsync('a printed-sheet file carrying its map loads', async () => {
  const r = await loadLikeApp(await encodeGb1(printedSpec({ layoutCsvName: PRINTED_CSV_NAME, layoutCsv: PRINTED_CSV })));
  assert(r.layout?.computedLayoutId === '95438EDF', `map is ${r.layout?.computedLayoutId}`);
  assert(r.refusal === null, `refused: ${r.refusal?.message.slice(0, 80)}`);
});

await checkAsync('an electronic file, which never has a map, loads', async () => {
  const r = await loadLikeApp(await encodeGb1(printedSpec({ inputMode: 'electronic' })));
  assert(r.refusal === null, `refused: ${r.refusal?.message.slice(0, 80)}`);
});

await checkAsync('a generic-page file carrying a printed-sheet map is still refused as generic (unchanged)', async () => {
  const r = await loadLikeApp(await encodeGb1({ ...withoutMap(genericSpec), layoutCsvName: PRINTED_CSV_NAME, layoutCsv: PRINTED_CSV }));
  assert(r.refusal?.message === BAD_GENERIC, `message: ${r.refusal?.message.slice(0, 80)}`);
});

check('neither refusal names a grader or says anything was loaded', () => {
  for (const m of [PRINTED_REFUSAL, BAD_GENERIC]) {
    assert(!/grader/i.test(m), `names a grader: ${m.slice(0, 60)}`);
    assert(!/You can still/i.test(m), 'says the student can carry on');
    // Supplement 5: untrue whenever an assignment was already open.
    assert(!/Nothing has been loaded/i.test(m), 'says nothing was loaded, which is untrue if an assignment is open');
  }
});

// =====================================================
// 2. Behaviour does not change, except where the order says
// =====================================================
results.push('  2. every combination, the previous decision against the new one');

// The decision exactly as `handleLoadAssignment` made it at 456c59e, with the
// messages reduced to which check fired. Kept here so the comparison is
// against what shipped, not against the new code's idea of it.
const previousDecision = (json, layout) => {
  if (json.inputMode === 'handwritten' && !layout) return 'no-layout-map';
  if (gen.genericSheetProblem(json, layout)) return 'generic-sheet';
  return null;
};
const genericMap = (await loadLikeApp(GENERIC_FILE)).layout;
const printedMap = await lay.parseLayoutCsv(PRINTED_CSV, PRINTED_CSV_NAME);
const goodParts = genericSpec.parts;
const table = [];
for (const inputMode of [undefined, 'electronic', 'handwritten']) {
  for (const sheet of [undefined, 'generic', 'some-future-sheet']) {
    for (const [mapName, layout] of [['no map', null], ['generic map', genericMap], ['printed map', printedMap]]) {
      for (const [partsName, parts] of [['parts', goodParts], ['no parts', undefined]]) {
        const json = { inputMode, ...(sheet ? { sheet } : {}), ...(parts ? { parts } : {}) };
        const before = previousDecision(json, layout);
        const after = refusalMod.assignmentLoadRefusal(json, layout)?.kind ?? null;
        table.push({ label: `${inputMode ?? 'absent'} / ${sheet ?? 'no sheet'} / ${mapName} / ${partsName}`, before, after, json, layout });
      }
    }
  }
}
check(`every file that loaded before still loads, and every file refused before is still refused (${table.length} combinations)`, () => {
  const moved = table.filter(t => (t.before === null) !== (t.after === null));
  assert(moved.length === 0, moved.map(t => `${t.label}: ${t.before} -> ${t.after}`).join('; '));
});
check('the only message that changes is a non-printed sheet with no map, which now gets the generic refusal', () => {
  const changed = table.filter(t => t.before !== t.after);
  const expected = changed.every(t =>
    t.json.inputMode === 'handwritten' && t.json.sheet !== undefined && t.layout === null &&
    t.before === 'no-layout-map' && t.after === 'generic-sheet');
  assert(changed.length > 0, 'nothing changed, so the defect is not fixed');
  assert(expected, changed.map(t => `${t.label}: ${t.before} -> ${t.after}`).join('; '));
});

// =====================================================
// 3. The refusal is in the page, not only in a dialog
// =====================================================
results.push('  3. the refusal reaches the page');

const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const APP = codeOnly(readFileSync(join(REPO, 'App.tsx'), 'utf8'));
// Supplements 3 and 4: the refusal is a panel at the top of the page, scrolled
// into view when it appears. The status line was tried first and could not be
// read, so it no longer carries the refusal: one place in the page, one text.
check('App: the refusal goes into the page BEFORE the dialog, then the load returns', () =>
  assert(/const refusal = assignmentLoadRefusal\(json, layout\);\s*if \(refusal\) \{[\s\S]{0,200}?setLoadRefusal\(refusal\);\s*alert\(refusal\.message\);\s*return;\s*\}/.test(APP),
    'the refusal branch does not set the panel, then alert, then return'));
check('App: the status line no longer carries the refusal, so the two cannot disagree', () =>
  assert(!/setStatusMessage\(refusal\.message\)/.test(APP), 'the refusal is written to the status line as well'));
check('App: every load attempt clears the panel first (assignment, demo, restored work)', () => {
  assert(/const handleLoadAssignment = async \(file: File\) => \{\s*setLoadRefusal\(null\);\s*try \{/.test(APP), 'an assignment load does not start clean');
  assert(/const handleLoadDemo = \(\) => \{\s*setLoadRefusal\(null\);/.test(APP), 'loading the demo does not clear it');
  assert(/const handleLoadWork = \(file: File\) => \{\s*setLoadRefusal\(null\);/.test(APP), 'restoring work does not clear it');
});
check('App: the panel is scrolled into view when it appears', () =>
  assert(/useEffect\(\(\) => \{\s*if \(loadRefusal\) loadRefusalRef\.current\?\.scrollIntoView\(\{ block: 'start'[^}]*\}\);\s*\}, \[loadRefusal\]\);/.test(APP),
    'no effect scrolls the panel into view'));
check('App: the panel is rendered at the top of the page, above the sidebar and the content', () => {
  const panelAt = APP.search(/\{loadRefusal && <LoadRefusalPanel ref=\{loadRefusalRef\} message=\{loadRefusal\.message\} \/>\}/);
  const innerAt = APP.indexOf('<div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row lg:overflow-hidden">');
  const sidebarAt = APP.indexOf('<Sidebar');
  assert(panelAt > 0, 'the panel is not rendered from loadRefusal');
  assert(innerAt > panelAt && sidebarAt > innerAt, 'the panel is not above the shell that holds the sidebar and the content');
  assert(/<div className="flex min-h-screen flex-col bg-gray-50 font-sans lg:h-screen lg:overflow-hidden">/.test(APP),
    'the outer shell is not a column at every width, so the panel cannot sit above both columns');
});
check('App: nothing else decides a load refusal (no second genericSheetProblem call)', () =>
  assert(!/genericSheetProblem\(/.test(APP), 'App calls genericSheetProblem itself again'));

const outDir = mkdtempSync(join(tmpdir(), 'gb-refusal-test-'));
const harnessFile = join(outDir, 'refusal-harness.mjs');
await build({
  stdin: {
    contents: `
      import * as React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import LoadRefusalPanel from './components/LoadRefusalPanel';
      import CropReview from './components/CropReview';
      import GenericPageReview from './components/GenericPageReview';
      import ProblemRenderer from './components/ProblemRenderer';
      export const renderProblem = (genericSheet) => renderToStaticMarkup(React.createElement(ProblemRenderer, {
        problem: { id: 'p1', name: 'Plane wave', description: '', subsections: [
          { id: 's1', name: 'Phase velocity', description: '', points: 60, submissionType: 'Handwritten' },
          { id: 's2', name: 'Wavelength', description: '', points: 40, submissionType: 'Handwritten' },
        ] },
        problemIndex: 0, submissionData: {}, onSubmissionChange: () => {},
        ...(genericSheet === undefined ? {} : { genericSheet }) }));
      const noop = () => {}, anoop = async () => {};
      export const renderPanel = (message) => renderToStaticMarkup(React.createElement(LoadRefusalPanel, { message }));
      export const renderCropReview = (props) => renderToStaticMarkup(React.createElement(CropReview,
        { onReview: noop, onDirectCapture: anoop, onRephotographPage: anoop, busy: null, ...props }));
      export const renderGenericReview = (props) => renderToStaticMarkup(React.createElement(GenericPageReview,
        { onLabel: noop, onReview: noop, onRetakePage: anoop, busy: null, cropUrls: {}, ...props }));
    `,
    resolveDir: REPO, loader: 'tsx', sourcefile: 'refusal-harness.tsx',
  },
  outfile: harnessFile, format: 'esm', platform: 'node', target: 'es2022', bundle: true, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  loader: { '.css': 'empty' },
  plugins: [{ name: 'stub-heic2any', setup(b) {
    b.onResolve({ filter: /^heic2any$/ }, () => ({ path: 'heic2any', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default () => null;', loader: 'js' }));
  } }],
  logLevel: 'silent',
});
const H = await import(pathToFileURL(harnessFile).href);
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const flat = (s) => s.replace(/\s+/g, ' ').trim();

// The panel's text is asserted against the constants the app uses, not retyped
// (Supplement 3). PRINTED_REFUSAL above is the retyped copy that guards the
// approval; here it must equal the module's own constant as well.
check('the printed-sheet constant is the approved text', () =>
  assert(refusalMod.PRINTED_NO_MAP_REFUSAL === PRINTED_REFUSAL, 'loadRefusal.ts no longer holds the approved text'));
for (const [name, message] of [['generic-page', BAD_GENERIC], ['printed-sheet', refusalMod.PRINTED_NO_MAP_REFUSAL]]) {
  const html = H.renderPanel(message);
  check(`a ${name} refusal renders in the panel as the approved constant, one paragraph per block, and nothing else`, () => {
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m => textOf(m[1]));
    const expected = message.split(/\n\s*\n/).map(flat);
    assert(JSON.stringify(paragraphs) === JSON.stringify(expected),
      `\n          rendered: ${JSON.stringify(paragraphs)}\n          expected: ${JSON.stringify(expected)}`);
    assert(textOf(html) === flat(message), `extra text in the panel: ${textOf(html)}`);
  });
  check(`a ${name} refusal panel is announced (role="alert"), is the one the page scrolls to, and has no button`, () => {
    assert(/role="alert"/.test(html) && /id="load-refusal"/.test(html), 'not an alert region with its id');
    assert(!/<button/.test(html), 'the panel has a button, which would need new wording and could fail');
  });
}

// =====================================================
// 4. No rendered review sentence names a grader, on either sheet
// =====================================================
results.push('  4. no grader, rendered, on either sheet');

// Every CropReview sentence on screen at once: a crop with a picture, taken
// directly (the "photographed this answer yourself" note), and flagged.
const firstRow = printedMap.rows[0];
const printedHtml = H.renderCropReview({
  layout: printedMap, pages: [],
  crops: { [firstRow.regionId]: { review: 'flagged', cropSource: 'direct_capture', qualityFlags: [] } },
  cropUrls: { [firstRow.regionId]: 'blob:crop' },
});
const genericHtml = H.renderGenericReview({ parts: goodParts, crops: {}, pages: [] });
for (const [sheet, html] of [['printed sheet', printedHtml], ['generic page', genericHtml]]) {
  check(`${sheet}: no rendered sentence or image description names a grader`, () => {
    const alts = [...html.matchAll(/alt="([^"]*)"/g)].map(m => m[1]);
    const told = [...textOf(html).split(/(?<=[.!?])\s+/), ...alts].filter(s => /\bgraders?\b/i.test(s));
    assert(told.length === 0, told.join(' | '));
  });
}
check('printed sheet: the four approved sentences are what is rendered', () => {
  const t = textOf(printedHtml);
  for (const s of [
    'This is exactly what is collected, one picture per part, cut from your pages. If a picture is wrong, cut off or missing, fix it here.',
    'That is fine, it is submitted exactly as it is here.',
    'The flag goes with your submission, beside the picture.',
  ]) assert(t.includes(s), `missing: ${s}`);
  assert(printedHtml.includes(`alt="Your answer to ${firstRow.partId}, as it will be collected"`), 'image description not approved text');
  assert(t.includes('You photographed this answer yourself, so it was not cut from the printed sheet.'), 'the sentence before item 3 was lost');
  assert(t.includes('Flagging a part does not stop you submitting.'), 'the sentence before item 4 was lost');
});

// =====================================================
// 5. "Answer on paper", by sheet (Supplement 5)
// =====================================================
results.push('  5. the answer-on-paper note, by sheet');

// The approved text, spelled out: the generic sentence, and the printed-sheet
// one, which is the same with its final clause removed and nothing added.
const ON_PAPER_GENERIC = 'Answer on paper. Write this part in your handwritten work and upload the page in Your Pages above, then say which part it is.';
const ON_PAPER_PRINTED = 'Answer on paper. Write this part in your handwritten work and upload the page in Your Pages above.';
const notes = (html) => [...html.matchAll(/<div class="rounded-lg border border-dashed[^"]*">([\s\S]*?)<\/div>/g)].map(m => textOf(m[1]));

check('generic page: every handwritten part says to say which part it is, in the approved words', () => {
  const n = notes(H.renderProblem(true));
  assert(n.length === 2, `${n.length} notes for 2 parts`);
  for (const t of n) assert(t === ON_PAPER_GENERIC, `note: ${JSON.stringify(t)}`);
  assert(n.every(t => /say which part/.test(t)), 'the generic note does not say to say which part');
});
check('printed sheet: no handwritten part ever says "say which part" (the QR places the page)', () => {
  for (const variant of [false, undefined]) {
    const n = notes(H.renderProblem(variant));
    assert(n.length === 2, `${n.length} notes for 2 parts`);
    for (const t of n) {
      assert(!/say which part/.test(t), `printed-sheet note asks the student to say which part: ${t}`);
      assert(t === ON_PAPER_PRINTED, `note: ${JSON.stringify(t)}`);
    }
  }
});
check('neither sheet promises a feature that is coming', () => {
  for (const v of [true, false]) assert(!/next update|arrives|coming soon/i.test(textOf(H.renderProblem(v))), 'a promise is back');
});
check('App: the sheet comes from isGenericSheet, the one predicate, and nowhere else', () => {
  assert(/const isGeneric = isGenericSheet\(state\.assignment\);/.test(APP), 'isGeneric is not isGenericSheet(state.assignment)');
  assert(/<ProblemRenderer[\s\S]{0,300}?genericSheet=\{isGeneric\}/.test(APP), 'ProblemRenderer is not told the sheet from isGeneric');
  const PR = codeOnly(readFileSync(join(REPO, 'components', 'ProblemRenderer.tsx'), 'utf8'));
  assert(!/\.sheet\b|isGenericSheet|'generic'/.test(PR), 'ProblemRenderer works out the sheet for itself');
});

rmSync(outDir, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
