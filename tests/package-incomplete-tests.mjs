// =====================================================
// No incomplete file is ever handed to the student (Phase 1.5)
// =====================================================
// PLAN_SUBMISSION_APP_FIXES_AND_REVAMP_2026-11-08, item 1.5. Four ENG 17 HW4
// files arrived holding the page photographs and the payload but neither the
// answers PDF nor `fixed_layout`, and could not be numbered. If either fails
// to build, the app must say so and offer to try again, and must never save or
// download a suitcase without both.
//
// Each PDF build is forced to fail here: the answers PDF throwing, coming out
// empty, coming out with no pages; and the electronic path's PDF missing or
// empty. Each must reject with `PACKAGE_INCOMPLETE` and hand back no archive.
// The student's side is checked by rendering the panel and reading the App's
// wiring. A successful build is untouched: the package goldens are held by
// `generic-sheet-tests`, `multipart-pages-tests` and `package-plain-tests`.
//
//   node tests/package-incomplete-tests.mjs
// =====================================================

import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadModule } from './captureSet.mjs';
import { genericAssignment, genericPagesAndCrops, GENERIC_NOW } from './genericPackageFixtures.mjs';
import { electronicAssets, electronicSources } from './packageFixtures.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
const results = [];
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

console.log('\npackage incomplete — no suitcase without its answers PDF and fixed_layout\n');

const P = await loadModule('tests/genericPipeline.ts', 'pi_pipeline.mjs');
const S = await loadModule('services/submissionPackage.ts', 'pi_package.mjs');
const F = await loadModule('services/fixedLayoutPdf.ts', 'pi_fixed.mjs');

/** The generic sources, every page labelled, confirmed. */
const genericSources = () => {
  let { pages, crops, blobs } = genericPagesAndCrops(P, ['pg1', 'pg2', 'pg3']);
  for (const [id, part] of [['pg1', '1(a)'], ['pg2', '1(b)'], ['pg3', '2']]) {
    crops = P.labelGenericCrop(crops, P.genericCropKey('gen', id), part);
  }
  const s = { assignment: genericAssignment(), submissionData: {}, isHandwritten: true, layoutId: '5F0B10BC',
    pages, crops, now: GENERIC_NOW };
  return { sources: { ...s, personalInfoConfirmation: P.confirmPersonalInfo(s) }, blobs };
};
const genericAssets = (blobs, extra = {}) =>
  ({ readBlob: async (k) => blobs[k] ?? null, downsampleImage: async (u) => u, ...extra });

/** Builds, and returns the error it rejected with, or fails if it built. */
const refused = async (sources, assets) => {
  let built = null;
  try { built = await S.buildSubmissionPackage(sources, assets); }
  catch (err) { return err; }
  throw new Error(`an archive was handed back, holding ${built.entries.join(', ')}`);
};
const isIncomplete = (err, what) => {
  assert(err.name === S.PACKAGE_INCOMPLETE, `${what}: rejected as ${err.name}: ${err.message}`);
};

// ---------- the successful build ----------
results.push('  1. a successful build carries both');
await checkAsync('a generic build has the answers PDF in the archive and fixed_layout naming it', async () => {
  const { sources, blobs } = genericSources();
  const built = await S.buildSubmissionPackage(sources, genericAssets(blobs));
  const fl = built.submissionJson.fixed_layout;
  assert(fl && built.entries.includes(fl.file) && fl.pages === 7, JSON.stringify(fl));
  assert(S.incompletePackageProblem(true, true, built.entries, built.submissionJson, built.baseName) === null, 'flagged');
});
await checkAsync('the real drawFixedLayout passed in as the hook builds the same bytes as without it', async () => {
  const { sources, blobs } = genericSources();
  const a = await S.buildSubmissionPackage(sources, genericAssets(blobs));
  const b = await S.buildSubmissionPackage(sources, genericAssets(blobs, { drawAnswers: F.drawFixedLayout }));
  for (const name of a.entries) {
    const x = await a.zip.file(name).async('uint8array'), y = await b.zip.file(name).async('uint8array');
    assert(Buffer.from(x).equals(Buffer.from(y)), `${name} differs`);
  }
});

// ---------- each PDF build forced to fail ----------
results.push('  2. each PDF build forced to fail: no archive, and a named refusal');
const { sources: gSources, blobs: gBlobs } = genericSources();
await checkAsync('the answers PDF throws while drawing', async () => {
  const err = await refused(gSources, genericAssets(gBlobs, { drawAnswers: () => { throw new Error('out of memory'); } }));
  isIncomplete(err, 'throwing');
  assert(/answers PDF/.test(err.message) && /out of memory/.test(err.message), err.message);
});
await checkAsync('the answers PDF comes out with no bytes', async () => {
  const err = await refused(gSources, genericAssets(gBlobs, { drawAnswers: () => ({ bytes: new Uint8Array(0), pages: 7 }) }));
  isIncomplete(err, 'empty');
});
await checkAsync('the answers PDF comes out with no pages', async () => {
  const err = await refused(gSources, genericAssets(gBlobs, { drawAnswers: (plan, o) => ({ ...F.drawFixedLayout(plan, o), pages: 0 }) }));
  isIncomplete(err, 'no pages');
});
await checkAsync('the answers PDF comes out as nothing at all', async () => {
  const err = await refused(gSources, genericAssets(gBlobs, { drawAnswers: () => undefined }));
  isIncomplete(err, 'undefined');
});
await checkAsync('the electronic PDF is missing', async () => {
  const s = electronicSources();
  const sources = { ...s, personalInfoConfirmation: P.confirmPersonalInfo(s) };
  const { pdfBytes, ...rest } = electronicAssets();
  isIncomplete(await refused(sources, rest), 'electronic missing');
});
await checkAsync('the electronic PDF is empty', async () => {
  const s = electronicSources();
  const sources = { ...s, personalInfoConfirmation: P.confirmPersonalInfo(s) };
  isIncomplete(await refused(sources, { ...electronicAssets(), pdfBytes: new Uint8Array(0) }), 'electronic empty');
});

// ---------- the final check, on its own ----------
results.push('  3. the last check before an archive is handed back');
await checkAsync('it names fixed_layout missing, the answers PDF missing, and no pages', async () => {
  const entries = ['x.json', 'x_answers.pdf', 'page_1.jpg'];
  assert(/fixed_layout/.test(S.incompletePackageProblem(true, true, entries, {}, 'x')), 'fixed_layout');
  assert(/answers PDF is missing/.test(S.incompletePackageProblem(true, true, ['x.json'],
    { fixed_layout: { file: 'x_answers.pdf', pages: 7 } }, 'x')), 'answers PDF');
  assert(/no pages/.test(S.incompletePackageProblem(true, true, entries,
    { fixed_layout: { file: 'x_answers.pdf', pages: 0 } }, 'x')), 'pages');
  assert(/PDF of your answers/.test(S.incompletePackageProblem(false, false, ['x.json'], {}, 'x')), 'electronic');
});
await checkAsync('the printed sheet, which carries neither, is not refused', async () =>
  assert(S.incompletePackageProblem(true, false, ['x.json'], {}, 'x') === null, 'printed refused'));

// ---------- what the student sees ----------
results.push('  4. the student is told, in the page, and can try again');
const outDir = mkdtempSync(join(tmpdir(), 'gb-incomplete-test-'));
try {
  const harness = join(outDir, 'h.mjs');
  await build({
    stdin: {
      contents: `
        import * as React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import PackageIncomplete, { PACKAGE_INCOMPLETE_WORDING } from './components/PackageIncomplete';
        export const W = PACKAGE_INCOMPLETE_WORDING;
        export const html = renderToStaticMarkup(React.createElement(PackageIncomplete, { onTryAgain: () => {}, onClose: () => {} }));
      `,
      resolveDir: REPO, loader: 'tsx', sourcefile: 'h.tsx',
    },
    outfile: harness, format: 'esm', platform: 'node', bundle: true, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const { html, W } = await import(pathToFileURL(harness).href);
  await checkAsync('the panel says nothing was saved, keeps the work, and offers Try again', async () => {
    const text = html.replace(/<[^>]+>/g, ' ');
    assert(text.includes(W.heading) && text.includes(W.tryAgain) && text.includes(W.close), 'text missing');
    assert(/saved and will still be here/.test(W.body) && /download once more/.test(W.body), W.body);
    assert(!/wrong|error|fail/i.test(W.heading + W.body), 'sounds like an error');
    assert(/role="dialog"/.test(html) && /data-package-incomplete/.test(html), 'not an in-page panel');
  });
} finally { rmSync(outDir, { recursive: true, force: true }); }

const APP = readFileSync(join(REPO, 'App.tsx'), 'utf8');
await checkAsync('App: a PACKAGE_INCOMPLETE refusal opens the panel, not a browser dialog', async () => {
  assert(/error\.name === PACKAGE_INCOMPLETE\)\s*\{[\s\S]{0,400}?setPackageIncomplete\(ack\)/.test(APP), 'catch branch not wired');
});
await checkAsync('App: no electronic PDF opens the panel instead of stopping silently', async () => {
  assert(/if \(!rendered\) \{[\s\S]{0,120}?setPackageIncomplete\(ack\);\s*return;/.test(APP), 'silent return kept');
});
await checkAsync('App: Try again runs the same download again, with the same acknowledgements', async () => {
  assert(/<PackageIncomplete[\s\S]{0,200}?onTryAgain=\{\(\) => \{ const again = packageIncomplete; setPackageIncomplete\(null\); void runSubmissionDownload\(again\); \}\}/.test(APP),
    'Try again not wired');
});
await checkAsync('App: the file is saved only after the build returns an archive', async () => {
  const build = APP.indexOf('const built = await buildSubmissionPackage(');
  const save = APP.indexOf('downloadBlob(zipBlob');
  assert(build > 0 && save > build, 'download is not after the build');
});

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
