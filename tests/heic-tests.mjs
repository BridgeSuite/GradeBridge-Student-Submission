// =====================================================
// HEIC photographs: the browser's decoder first, then libheif (Phase 1)
// =====================================================
// iPhone photographs arrive as HEIC. `convertHeicIfNeeded` (imageIngest.ts)
// asks the browser's own decoder first (Safari reads HEIC); when it cannot,
// it loads libheif through `heic-to`, a separate same-origin chunk, and only
// then. The approach follows an EEC 170 student's pull request #1.
//
// Here: which decoder runs in each case, with fakes for both; that a failure
// reaches the student as the existing refusal; and that the dependency is
// pinned, loaded lazily, and its licence noted. Real photographs are checked
// by hand and never committed.
//
//   node tests/heic-tests.mjs
// =====================================================

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
const results = [];
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };

console.log('\nheic — the browser first, then libheif\n');

// ---------- build imageIngest.ts with libheif replaced by a recording fake ----------
const outDir = mkdtempSync(join(tmpdir(), 'gb-heic-test-'));
const stub = join(outDir, 'heic-to-stub.mjs');
writeFileSync(stub, `
export const heicTo = async (args) => {
  globalThis.__libheif.calls.push(args);
  if (globalThis.__libheif.fail) throw new Error('libheif could not read it');
  return new Blob(['from-libheif'], { type: args.type });
};
`);
const outFile = join(outDir, 'imageIngest.mjs');
await build({
  entryPoints: [join(REPO, 'imageIngest.ts')], outfile: outFile,
  format: 'esm', target: 'es2022', bundle: true,
  alias: { 'heic-to/csp': stub }, logLevel: 'silent',
});
const M = await import(pathToFileURL(outFile).href);

// ---------- fakes for the browser ----------
const browser = ({ decodes, width = 4032, height = 3024, toBlobNull = false, noBitmapApi = false }) => {
  globalThis.__libheif = { calls: [], fail: false };
  const seen = { bitmaps: 0, closed: 0, toBlob: [] };
  globalThis.createImageBitmap = noBitmapApi ? undefined : async () => {
    seen.bitmaps++;
    if (!decodes) throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
    return { width, height, close: () => { seen.closed++; } };
  };
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb, type, q) => { seen.toBlob.push({ type, q }); cb(toBlobNull ? null : new Blob(['from-browser'], { type })); },
    }),
  };
  return seen;
};
const file = (name, type, body = 'ftypheic') => new File([body], name, { type });
const text = async (b) => await b.text();

results.push('  1. which decoder runs');
await checkAsync('a JPEG passes through untouched; neither decoder runs', async () => {
  const seen = browser({ decodes: true });
  const f = file('page.jpg', 'image/jpeg');
  const out = await M.convertHeicIfNeeded(f);
  assert(out === f && seen.bitmaps === 0 && __libheif.calls.length === 0, 'touched');
});
await checkAsync('HEIC that the browser reads (Safari): the browser\'s JPEG, libheif never loaded', async () => {
  const seen = browser({ decodes: true });
  const out = await M.convertHeicIfNeeded(file('IMG_0001.HEIC', 'image/heic'), 0.92);
  assert(await text(out) === 'from-browser' && out.type === 'image/jpeg', await text(out));
  assert(seen.toBlob[0].type === 'image/jpeg' && seen.toBlob[0].q === 0.92, JSON.stringify(seen.toBlob));
  assert(__libheif.calls.length === 0, 'libheif ran');
  assert(seen.closed === 1, 'bitmap not released');
});
await checkAsync('HEIC that the browser cannot read (Chrome): libheif, to JPEG at the asked quality', async () => {
  const seen = browser({ decodes: false });
  const out = await M.convertHeicIfNeeded(file('IMG_0002.heic', ''), 0.92);
  assert(await text(out) === 'from-libheif', await text(out));
  assert(seen.bitmaps === 1 && __libheif.calls.length === 1, `${seen.bitmaps} ${__libheif.calls.length}`);
  assert(__libheif.calls[0].type === 'image/jpeg' && __libheif.calls[0].quality === 0.92, JSON.stringify(__libheif.calls[0]));
});
await checkAsync('a browser with no createImageBitmap: libheif', async () => {
  browser({ decodes: true, noBitmapApi: true });
  const out = await M.convertHeicIfNeeded(file('a.heif', 'image/heif'));
  assert(await text(out) === 'from-libheif' && __libheif.calls[0].quality === 0.85, 'default quality');
});
await checkAsync('the browser decodes but cannot encode the JPEG: libheif, and the bitmap is released', async () => {
  const seen = browser({ decodes: true, toBlobNull: true });
  const out = await M.convertHeicIfNeeded(file('b.heic', 'image/heic'));
  assert(await text(out) === 'from-libheif' && seen.closed === 1, `${await text(out)} ${seen.closed}`);
});
await checkAsync('the browser returns an empty picture: libheif', async () => {
  browser({ decodes: true, width: 0, height: 0 });
  const out = await M.convertHeicIfNeeded(file('c.heic', 'image/heic'));
  assert(await text(out) === 'from-libheif', 'used the empty picture');
});

results.push('  2. when neither can read it');
await checkAsync('libheif fails: the page is refused with the existing HEIC message, nothing thrown', async () => {
  browser({ decodes: false });
  __libheif.fail = true;
  const r = await M.ingestPage(file('d.heic', 'image/heic'));
  assert(r.page === null && r.reason === 'HEIC image could not be converted. Save it as JPEG and try again.', JSON.stringify(r));
});
await checkAsync('HEIC is recognised by type or by name, in either case', async () => {
  const ok = [file('x.HEIC', ''), file('x.heif', ''), file('x', 'image/heic'), file('x', 'image/heif')].every(M.isHeic);
  assert(ok && !M.isHeic(file('x.jpg', 'image/jpeg')), 'detection');
});

results.push('  3. the dependency');
const PKG = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
const LOCK = JSON.parse(readFileSync(join(REPO, 'package-lock.json'), 'utf8'));
const SRC = readFileSync(join(REPO, 'imageIngest.ts'), 'utf8');
await checkAsync('heic-to is pinned to an exact version, and the lock agrees', async () => {
  const v = PKG.dependencies['heic-to'];
  assert(/^\d+\.\d+\.\d+$/.test(v ?? ''), `not pinned: ${v}`);
  const locked = LOCK.packages['node_modules/heic-to'];
  assert(locked?.version === v && LOCK.packages[''].dependencies['heic-to'] === v, JSON.stringify(locked));
  assert(locked.license === 'LGPL-3.0', locked.license);
});
await checkAsync('heic2any is gone', async () => {
  assert(!PKG.dependencies.heic2any && !LOCK.packages['node_modules/heic2any'], 'still installed');
  assert(!/heic2any/.test(SRC), 'still referenced');
});
await checkAsync('libheif is loaded only on demand: a dynamic import, never a static one', async () => {
  assert(/await import\('heic-to\/csp'\)/.test(SRC), 'no dynamic import');
  assert(!/^import [^;]*['"]heic-to/m.test(SRC), 'static import');
});
await checkAsync('the README notes the LGPL-3.0 licence', async () => {
  const readme = readFileSync(join(REPO, 'README.md'), 'utf8');
  assert(/heic-to/.test(readme) && /LGPL-3\.0/.test(readme), 'licence note');
});

rmSync(outDir, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
