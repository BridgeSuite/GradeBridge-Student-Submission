// =====================================================
// The last screen checks the file (Phase 1.6)
// =====================================================
// PLAN_SUBMISSION_APP_FIXES_AND_REVAMP_2026-11-08, item 1.6, as narrowed by
// Andre Knoesen on 11 November 2026: the answers PDF is present with exactly
// `fixed_layout.pages` Letter pages (R8), `fixed_layout` is present (R7), and
// the `files` map is present and matches. The app shows "complete, N pages"
// or what is missing. It informs and never blocks.
//
// A good suitcase is built by the shipped builder and read back; then each
// failure is forced on its bytes and must be named.
//
//   node tests/self-check-tests.mjs
// =====================================================

import { webcrypto, createHash } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { loadModule } from './captureSet.mjs';
import { buildGeneric, genericAssignment, genericPagesAndCrops } from './genericPackageFixtures.mjs';
import { electronicAssets, electronicSources } from './packageFixtures.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
const results = [];
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

console.log('\nself-check — the app reads back the file it built\n');

const P = await loadModule('tests/genericPipeline.ts', 'sc_pipeline.mjs');
const C = await loadModule('services/selfCheck.ts', 'sc_check.mjs');
const W = C.SELF_CHECK_WORDING;

// A good generic suitcase: three pages, one per part.
let { pages, crops, blobs } = genericPagesAndCrops(P, ['pg1', 'pg2', 'pg3']);
for (const [id, part] of [['pg1', '1(a)'], ['pg2', '1(b)'], ['pg3', '2']]) {
  crops = P.labelGenericCrop(crops, P.genericCropKey('gen', id), part);
}
const good = await buildGeneric(P, genericAssignment(), pages, crops, blobs);
const goodBytes = await good.built.zip.generateAsync({ type: 'uint8array' });
const answers = good.payload.fixed_layout.file;
const payloadName = good.entries.find(e => e.endsWith('.json'));

/** The good archive with `edit` applied to a copy of it. */
const variant = async (edit) => {
  const z = await JSZip.loadAsync(goodBytes);
  const payload = JSON.parse(await z.file(payloadName).async('string'));
  await edit(z, payload);
  z.file(payloadName, JSON.stringify(payload, null, 2));
  return z.generateAsync({ type: 'uint8array' });
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const named = (r, text) => assert(!r.ok && r.problems.includes(text), `not named: ${text}\n          got ${JSON.stringify(r.problems)}`);

results.push('  1. complete');
await checkAsync('a good generic suitcase reads as complete, with the answers PDF\'s page count', async () => {
  const r = await C.checkBuiltSuitcase(goodBytes, true);
  assert(r.ok && r.problems.length === 0, JSON.stringify(r.problems));
  assert(r.pages === good.payload.fixed_layout.pages && r.pages === 7, `pages ${r.pages}`);
});
await checkAsync('an electronic suitcase reads as complete, with no page count', async () => {
  const s = electronicSources();
  const built = await P.buildSubmissionPackage({ ...s, personalInfoConfirmation: P.confirmPersonalInfo(s) }, electronicAssets());
  const r = await C.checkBuiltSuitcase(await built.zip.generateAsync({ type: 'uint8array' }), false);
  assert(r.ok && r.pages === null, JSON.stringify(r));
});

results.push('  2. each failure forced, and named');
await checkAsync('R8: the answers PDF is missing', async () => {
  named(await C.checkBuiltSuitcase(await variant((z) => { z.remove(answers); }), true), W.noAnswersPdf);
});
await checkAsync('R8: the answers PDF has the wrong number of pages', async () => {
  const one = new Uint8Array(new jsPDF({ unit: 'pt', format: 'letter', compress: false }).output('arraybuffer'));
  const r = await C.checkBuiltSuitcase(await variant((z, p) => { z.file(answers, one); p.files[answers] = sha(one); }), true);
  named(r, W.wrongPageCount(1, 7));
  assert(r.pages === 1, `pages ${r.pages}`);
});
await checkAsync('R8: a page of the answers PDF is not Letter', async () => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: false });
  for (let i = 1; i < 7; i++) doc.addPage();
  const a4 = new Uint8Array(doc.output('arraybuffer'));
  const r = await C.checkBuiltSuitcase(await variant((z, p) => { z.file(answers, a4); p.files[answers] = sha(a4); }), true);
  named(r, W.notLetter);
  assert(!r.problems.some(x => /pages; it should/.test(x)), 'page count wrongly flagged');
});
await checkAsync('R7: fixed_layout is missing', async () => {
  named(await C.checkBuiltSuitcase(await variant((z, p) => { delete p.fixed_layout; }), true), W.noFixedLayout);
});
await checkAsync('files: the map is missing', async () => {
  named(await C.checkBuiltSuitcase(await variant((z, p) => { delete p.files; }), true), W.noFilesMap);
});
await checkAsync('files: an entry whose bytes do not match its fingerprint', async () => {
  const r = await C.checkBuiltSuitcase(await variant((z) => { z.file('page_1.jpg', new Uint8Array([1, 2, 3])); }), true);
  named(r, W.fileChanged('page_1.jpg'));
});
await checkAsync('files: an entry in the archive and not in the map', async () => {
  named(await C.checkBuiltSuitcase(await variant((z) => { z.file('extra.txt', 'x'); }), true), W.fileUnlisted('extra.txt'));
});
await checkAsync('files: an entry in the map and not in the archive', async () => {
  named(await C.checkBuiltSuitcase(await variant((z) => { z.remove('page_2.jpg'); }), true), W.fileMissing('page_2.jpg'));
});
await checkAsync('not a zip at all', async () => {
  named(await C.checkBuiltSuitcase(new Uint8Array([1, 2, 3, 4]), true), W.unreadable);
});
await checkAsync('a printed-sheet or electronic suitcase is not asked for an answers PDF', async () => {
  const r = await C.checkBuiltSuitcase(await variant((z, p) => { z.remove(answers); delete p.files[answers]; delete p.fixed_layout; }), false);
  assert(r.ok, JSON.stringify(r.problems));
});

results.push('  3. what the student sees');
const outDir = mkdtempSync(join(tmpdir(), 'gb-selfcheck-test-'));
try {
  const harness = join(outDir, 'h.mjs');
  await build({
    stdin: {
      contents: `
        import * as React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import SelfCheckPanel from './components/SelfCheckPanel';
        export const render = (result) => renderToStaticMarkup(React.createElement(SelfCheckPanel, { result, onClose: () => {} }));
      `,
      resolveDir: REPO, loader: 'tsx', sourcefile: 'h.tsx',
    },
    outfile: harness, format: 'esm', platform: 'node', bundle: true, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const { render } = await import(pathToFileURL(harness).href);
  const text = (h) => h.replace(/<[^>]+>/g, ' ');
  await checkAsync('complete: "complete: 7 pages", in the page', async () => {
    const h = render({ ok: true, pages: 7, problems: [] });
    assert(text(h).includes(W.completeWithPages(7)) && /data-self-check="complete"/.test(h), h.slice(0, 300));
  });
  await checkAsync('incomplete: every problem listed, and what to do', async () => {
    const h = render({ ok: false, pages: 1, problems: [W.noAnswersPdf, W.noFilesMap] });
    const t = text(h);
    assert(t.includes(W.incomplete) && t.includes(W.incompleteAdvice), t);
    assert(W.incompleteAdvice === 'The file just saved is not quite complete. Your work is saved. If you see this again, reload this page and download once more.', W.incompleteAdvice);
    // Minimum wording (11 Nov 15:05): which part is missing is not shown to the student.
    assert(!t.includes(W.noAnswersPdf) && !t.includes(W.noFilesMap), t);
  });
} finally { rmSync(outDir, { recursive: true, force: true }); }

const APP = readFileSync(join(REPO, 'App.tsx'), 'utf8');
await checkAsync('App: the archive about to be saved is checked, and the result shown; a failed check never withholds it', async () => {
  const gen = APP.indexOf("const zipBlob = await built.zip.generateAsync(");
  const chk = APP.indexOf('const checked = await checkBuiltSuitcase(zipBlob, isGeneric).catch(() => null);');
  const save = APP.indexOf('downloadBlob(zipBlob');
  assert(gen > 0 && chk > gen && save > chk, 'not checked between building and saving');
  assert(/downloadBlob\(zipBlob, `\$\{baseName\}\.zip`\);\s*if \(checked\) setSelfCheck\(checked\);/.test(APP), 'result not shown after saving');
  assert(/<SelfCheckPanel result=\{selfCheck\}/.test(APP), 'panel not rendered');
});

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
