// =====================================================
// Scratch diagnostic: the iOS sheet set — NOT part of `npm test`
// =====================================================
//   node tests/iosSheetProbe.mjs
//
// Seventeen phone photographs of one printed Homework 1 set, staged by hand
// into `tests/captures/students/ios_2026-09-07/`. That folder is gitignored and
// stays that way: the photographs are another person's coursework and this
// repository is public. Nothing here writes a render of them, and no name of a
// person appears in this file, in the folder, or in the report it feeds.
//
// **This probe measures the app's detector and adds no detector of its own.**
// Every number it prints comes out of `RegistrationResult`; nothing is inferred
// from the pixels here. Two earlier attempts at this question were made outside
// the repository with a hand-written mark finder and produced unusable numbers,
// because locating the sheet in the frame by brightness threshold fails on
// these photographs. `services/registration.ts` is the only instrument that
// means anything, so it is the only one used.
//
// The photographs go in through `ingestLikeApp`, so the detector sees the
// upright, PAGE_MAX_EDGE-limited, re-encoded frame the app hands it — not the
// 12-megapixel original, which the app never processes.
//
// `registerPage` is called with no options, which is the crop path
// (`services/pageCrops.ts`). `captureGate` passes a decode budget; the crop
// path does not, and the crop path is what decides whether a region is cut.
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule, CAPTURE_DIR } from './captureSet.mjs';
import { ingestLikeApp } from './realCaptures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SET_DIR = join(CAPTURE_DIR, 'students', 'ios_2026-09-07');

if (!existsSync(SET_DIR)) {
  console.error(
    `No such directory: tests/captures/students/ios_2026-09-07\n` +
    `Stage the photographs there first. They are gitignored and are never committed.`);
  process.exit(1);
}

const files = readdirSync(SET_DIR).filter(n => /\.(jpe?g|png)$/i.test(n)).sort();
if (files.length === 0) {
  console.error('tests/captures/students/ios_2026-09-07 holds no photographs.');
  process.exit(1);
}

// ---------- the thresholds the rows are judged against ----------
// Read from the source rather than typed here, so this cannot print a number
// the detector stopped using. `RESIDUAL_MAX_MM` is exported; the other two are
// module-private, so they are parsed out of the file that declares them and the
// parse fails loudly rather than printing a default.
const fmt = await loadModule('services/pageFormat.ts', 'pageFormat_iosprobe.mjs');
const regSrc = readFileSync(join(REPO, 'services', 'registration.ts'), 'utf8');
const constFromSource = (name) => {
  const m = regSrc.match(new RegExp(`const ${name}\\s*=\\s*([0-9.]+);`));
  if (!m) throw new Error(`services/registration.ts: no const named ${name}`);
  return Number(m[1]);
};
const THRESHOLDS = {
  RESIDUAL_MAX_MM: fmt.RESIDUAL_MAX_MM,
  DEGRADED_RESIDUAL_MAX_MM: constFromSource('DEGRADED_RESIDUAL_MAX_MM'),
  HELDOUT_MAX_MM: constFromSource('HELDOUT_MAX_MM'),
};

const reg = await loadModule('services/registration.ts', 'registration_iosprobe.mjs');
await reg.initQrReader();

// `—` is "the result carries nothing here", never "not measured". A number that
// is genuinely null on a refusal stays null.
const cell = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length === 0 ? '(none)' : v.join('+');
  return String(v);
};
const mm = (v) => (v === null || v === undefined ? '—' : v.toFixed(3));

const HEAD = ['file', 'status', 'usable', 'marksFound', 'marksDetected', 'marksDeclined',
              'residualMm', 'heldOutMm', 'foundBy', 'failureReason'];

const rows = [];
let totalMs = 0;
for (const file of files) {
  const img = ingestLikeApp(join(SET_DIR, file));
  const t0 = Date.now();
  const r = reg.registerPage(img);
  const ms = Date.now() - t0;
  totalMs += ms;
  rows.push([
    file.replace(/\.[^.]+$/, ''),
    r.status,
    String(r.usable),
    String(r.marksFound),
    cell(r.marksDetected),
    cell(r.marksDeclined),
    mm(r.residualMm),
    mm(r.heldOutMm),
    cell(r.foundBy),
    cell(r.failureReason),
  ]);
  process.stderr.write(`  ${file}  ${r.status}  ${(ms / 1000).toFixed(1)}s\n`);
}

// ---------- output ----------
// A markdown table, so the report carries this verbatim rather than a retyping
// of it. Retyped numbers are how a measurement becomes a claim.
console.log('');
console.log(`Thresholds: RESIDUAL_MAX_MM ${THRESHOLDS.RESIDUAL_MAX_MM.toFixed(1)}` +
            ` | DEGRADED_RESIDUAL_MAX_MM ${THRESHOLDS.DEGRADED_RESIDUAL_MAX_MM.toFixed(1)}` +
            ` | HELDOUT_MAX_MM ${THRESHOLDS.HELDOUT_MAX_MM.toFixed(1)}`);
console.log('');
console.log(`| ${HEAD.join(' | ')} |`);
console.log(`|${HEAD.map(() => '---').join('|')}|`);
for (const row of rows) console.log(`| ${row.join(' | ')} |`);

const count = (pred) => rows.filter(pred).length;
console.log('');
console.log(`status:  ok ${count(r => r[1] === 'ok')}` +
            `, degraded ${count(r => r[1] === 'degraded')}` +
            `, residual ${count(r => r[1] === 'residual')}` +
            `, too_few_marks ${count(r => r[1] === 'too_few_marks')}` +
            `, no_qr ${count(r => r[1] === 'no_qr')}`);
console.log(`marksFound: 4 on ${count(r => r[3] === '4')}` +
            `, 3 on ${count(r => r[3] === '3')}` +
            `, 0 on ${count(r => r[3] === '0')}`);
console.log(`marksDeclined non-empty on ${count(r => r[5] !== '(none)')} of ${rows.length}`);
console.log(`IOS SHEET SET: usable ${count(r => r[2] === 'true')}/${rows.length}` +
            `, QR read ${count(r => r[8] !== '—')}/${rows.length}` +
            `, ${(totalMs / 1000).toFixed(1)}s total\n`);
