// =====================================================
// The app refuses to build a download on old code (Phase 1.10)
// =====================================================
// PLAN_SUBMISSION_APP_FIXES_AND_REVAMP_2026-11-08, item 1.10. Three ENG 17
// HW4 files were built by pre-20 October code in a tab kept open for weeks.
// On load and before building a download, the app asks its own host which
// build is live; if it is not this one, the student is told to reload, the
// download is not built, and their work survives the reload.
//
// Here: the check's answers against a fake host (current, newer, and every
// kind of doubt, which must fail open); the panel's words; and the App's
// wiring. The end-to-end run in a browser (serve a newer version to an open
// page, reload, download) is `tests/freshness-browser.mjs`.
//
//   node tests/freshness-tests.mjs
// =====================================================

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadModule } from './captureSet.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
const results = [];
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

console.log('\nfreshness — no download built on old code\n');

const F = await loadModule('services/freshness.ts', 'fr_freshness.mjs');
const BASE = 'https://example.test/GradeBridge-Student-Submission/';
/** A fake host answering `version.json`, recording what it was asked. */
const host = (answer) => {
  const asked = [];
  const fetchImpl = async (url, init) => { asked.push({ url, init }); return answer(); };
  return { asked, fetchImpl };
};
const json = (body, ok = true) => () => ({ ok, json: async () => body });

results.push('  1. what the host says');
await checkAsync('the live build is this one: current', async () => {
  const r = await F.checkFreshness('5dd17ea', BASE, host(json({ app_version: '5dd17ea' })).fetchImpl);
  assert(r.state === 'current', JSON.stringify(r));
});
await checkAsync('a different build is live: stale, naming it', async () => {
  const r = await F.checkFreshness('5dd17ea', BASE, host(json({ app_version: '9abc123' })).fetchImpl);
  assert(r.state === 'stale' && r.live === '9abc123', JSON.stringify(r));
});
await checkAsync('it asks the app\'s own address for version.json, uncached, sending no credentials', async () => {
  const h = host(json({ app_version: '5dd17ea' }));
  await F.checkFreshness('5dd17ea', BASE, h.fetchImpl);
  assert(h.asked.length === 1 && h.asked[0].url.startsWith(`${BASE}version.json?t=`), h.asked[0]?.url);
  assert(h.asked[0].init.cache === 'no-store' && h.asked[0].init.credentials === 'omit', JSON.stringify(h.asked[0].init));
});

results.push('  2. every doubt fails open: unknown, which blocks nothing');
for (const [what, answer] of [
  ['no network', () => { throw new TypeError('Failed to fetch'); }],
  ['a rejected request', () => Promise.reject(new Error('offline'))],
  ['not found', json({}, false)],
  ['not JSON', () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })],
  ['no app_version', json({ something: 1 })],
  ['an empty app_version', json({ app_version: '' })],
  ['a host with no stamp', json({ app_version: 'unknown' })],
]) {
  await checkAsync(`${what}: unknown`, async () => {
    const r = await F.checkFreshness('5dd17ea', BASE, host(answer).fetchImpl);
    assert(r.state === 'unknown', JSON.stringify(r));
  });
}
await checkAsync('a host that never answers: unknown, within the timeout', async () => {
  const t0 = Date.now();
  const r = await F.checkFreshness('5dd17ea', BASE, () => new Promise(() => {}), 80);
  assert(r.state === 'unknown' && Date.now() - t0 < 2000, JSON.stringify(r));
});
await checkAsync('an unstamped build (tests, a dev server) never asks, and is never stale', async () => {
  const h = host(json({ app_version: '9abc123' }));
  const r = await F.checkFreshness('unknown', BASE, h.fetchImpl);
  assert(r.state === 'unknown' && h.asked.length === 0, JSON.stringify(r));
});

results.push('  3. what the student sees, and the wiring');
const outDir = mkdtempSync(join(tmpdir(), 'gb-fresh-test-'));
try {
  const harness = join(outDir, 'h.mjs');
  await build({
    stdin: {
      contents: `
        import * as React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import StaleVersion from './components/StaleVersion';
        export const html = renderToStaticMarkup(React.createElement(StaleVersion, { onReload: () => {}, onClose: () => {} }));
      `,
      resolveDir: REPO, loader: 'tsx', sourcefile: 'h.tsx',
    },
    outfile: harness, format: 'esm', platform: 'node', bundle: true, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  const { html } = await import(pathToFileURL(harness).href);
  const W = F.FRESHNESS_WORDING;
  await checkAsync("the panel: André Knoesen's sentence, word for word, and Reload", async () => {
    const t = html.replace(/<[^>]+>/g, ' ');
    assert(W.message === 'A newer version of the app is available. Please reload this page. Your work is saved and will still be here.', W.message);
    assert(t.includes(W.message) && t.includes(W.reload), t);
    assert(!/error|wrong|fail/i.test(W.message), 'sounds like an error');
    assert(/data-stale-version/.test(html), 'not the in-page panel');
  });
} finally { rmSync(outDir, { recursive: true, force: true }); }

const APP = readFileSync(join(REPO, 'App.tsx'), 'utf8');
await checkAsync('App: on load, a stale answer shows the banner, with Reload', async () => {
  assert(/checkFreshness\(APP_VERSION, new URL\('\.\/', window\.location\.href\)\.href, fetch\)\s*\.then\(f => \{ if \(f\.state === 'stale'\) setStaleOnLoad\(true\); \}\)/.test(APP), 'load check');
  assert(/\{staleOnLoad && \([\s\S]{0,400}?onClick=\{reloadKeepingWork\}/.test(APP), 'banner');
});
await checkAsync('App: Download asks again, and on stale builds nothing (before the PDF and the package)', async () => {
  const run = APP.indexOf('const runSubmissionDownload = async');
  const ask = APP.indexOf("const fresh = await checkFreshness(", run);
  const gate = APP.indexOf("if (fresh.state === 'stale') {\n      setStaleGate(true);\n      return;\n    }", ask);
  const pdf = APP.indexOf("setPdfProgress({ active: true, phase: 'pdf'", run);
  const pkg = APP.indexOf('await buildSubmissionPackage(', run);
  const pi = APP.indexOf('if (!personalInfoCurrent)', run);
  assert(run > 0 && pi > run && ask > pi && gate > ask && pdf > gate && pkg > gate, `${run} ${pi} ${ask} ${gate} ${pdf} ${pkg}`);
});
await checkAsync('App: Reload saves the work first, then reloads', async () => {
  assert(/const reloadKeepingWork = useCallback\(\(\): void => \{\s*saveNow\(\);\s*window\.location\.reload\(\);/.test(APP), 'order');
  assert(/<StaleVersion onReload=\{reloadKeepingWork\}/.test(APP), 'panel wired');
  // The saved record has the same shape the restore reads.
  const save = APP.slice(APP.indexOf('const saveNow = useCallback'), APP.indexOf('const reloadKeepingWork'));
  for (const k of ['assignment', 'submissionData', 'pages', 'layout', 'crops', 'lastSaved', 'STORAGE_KEY']) {
    assert(save.includes(k), `saveNow does not write ${k}`);
  }
});
await checkAsync('the README states the one request and its limits (ruling, 11 Nov)', async () => {
  const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
  const at = readme.indexOf('**The one network request: `version.json`.**');
  const note = readme.slice(at, at + 1200);
  assert(at > 0 && /own origin/.test(note) && /no student data/.test(note) && /executes nothing/.test(note), 'README note');
});
await checkAsync('the build writes version.json from the same stamp the bundle carries', async () => {
  const cfg = readFileSync(join(REPO, 'vite.config.ts'), 'utf8');
  assert(/const version = appVersion\(\);/.test(cfg), 'one stamp');
  assert(/versionFile\(version\)/.test(cfg) && /__APP_VERSION__: JSON\.stringify\(version\)/.test(cfg), 'both from it');
  assert(/fileName: 'version\.json'/.test(cfg) && /app_version: version/.test(cfg), 'version.json');
});

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
