// =====================================================
// Emit real submission archives for the Python interop check
// =====================================================
// Builds a handwritten and an electronic submission with the ACTUAL app
// `services/submissionPackage.ts`, writes both archives to a folder, and prints
// a manifest of what they must contain. `interop-check.py` then opens them with
// Python's standard library alone.
//
//   node tests/interop-emit.mjs <out-dir> > emitted.json
//   python tests/interop-check.py emitted.json
//
// **What this proves since 2026-09-21.** It used to prove that the autograder's
// Python decryptor opened what this app sealed. Nothing is sealed or encoded
// now (`WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` §3, §4), so the claim
// worth holding across the language boundary is the new one: a Python consumer
// with no key, no fixture and no third-party package reads the whole archive —
// `zipfile` and `json` and nothing else. Unlike its predecessor this needs no
// private key, so it can run anywhere. See tests/README.md.
// =====================================================

import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadModule } from './captureSet.mjs';

const OUT = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'gb-interop-')));
mkdirSync(OUT, { recursive: true });

const pkg = await loadModule('services/submissionPackage.ts', 'ie_pkg.mjs');
const pi = await loadModule('services/personalInfo.ts', 'ie_pi.mjs');

const jpeg = (seed, n) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < n; i++) b[i] = (seed * 31 + i * 7) & 0xff;
  return b;
};
const blobs = { pg0: jpeg(1, 3000), crop_p1a: jpeg(2, 800), crop_p1b: jpeg(3, 900) };
const image = jpeg(4, 1500);
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

const confirmed = (s) => ({ ...s, personalInfoConfirmation: pi.confirmPersonalInfo(s) });

const handwritten = confirmed({
  assignment: { id: 'a1', courseCode: 'TEST', title: 'Handwritten 1', inputMode: 'handwritten',
    problems: [{ id: 'p0', title: 'P', description: '', subsections: [
      { id: 's0', title: 'a', description: '', points: 5, submissionType: 'Handwritten' },
      { id: 's1', title: 'b', description: '', points: 5, submissionType: 'Handwritten' }] }] },
  submissionData: {},
  isHandwritten: true,
  layoutId: '95438EDF',
  now: '2026-09-21T10:00:00.000Z',
  pages: [{ id: 'pg0', file: 'page_1.jpg', width: 1650, height: 2200,
    registration: { status: 'ok', k: 2, n: 16, marksFound: 4, marksDetected: ['NW', 'NE', 'SW', 'SE'],
      marksDeclined: [], residualMm: 0.4, heldOutMm: 0 } }],
  crops: {
    p1a: { regionId: 'p1a', partId: '1(a)', pageK: 2, isDrawing: false, maxPoints: 5,
      cropSource: 'registration', review: 'signed_off', qualityFlags: [], file: 'crops/p1a.jpg',
      width: 800, height: 300, bytes: 800, fromPage: 'pg0' },
    p1b: { regionId: 'p1b', partId: '1(b)', pageK: 2, isDrawing: true, maxPoints: 5,
      cropSource: 'direct_capture', review: 'flagged', qualityFlags: ['blur'], file: 'crops/p1b.jpg',
      width: 900, height: 400, bytes: 900 },
  },
});

const electronic = confirmed({
  assignment: { id: 'a2', courseCode: 'TEST', title: 'Electronic 1',
    problems: [{ id: 'p0', title: 'P', description: '', subsections: [
      { id: 's0', title: 'a', description: '', points: 50, submissionType: 'Text' },
      { id: 's1', title: 'b', description: '', points: 50, submissionType: 'Text and Image' }] }] },
  submissionData: {
    p0_s0: { textAnswer: 'The quick brown fox — with $V_s = 1.2$ V and ünïcode' },
    p0_s1: { textAnswer: 'See the photograph.', imageAnswers: [`data:image/jpeg;base64,${Buffer.from(image).toString('base64')}`] },
  },
  isHandwritten: false,
  layoutId: null,
  now: '2026-09-21T10:00:00.000Z',
  pages: [],
  crops: {},
});

const assets = {
  pdfBytes: pdf,
  readBlob: async (key) => blobs[key] ?? null,
  downsampleImage: async (uri) => uri,
};

const out = { outDir: OUT, archives: [] };
for (const [label, sources] of [['handwritten', handwritten], ['electronic', electronic]]) {
  const built = await pkg.buildSubmissionPackage(sources, assets);
  const bytes = await built.zip.generateAsync({ type: 'nodebuffer', ...pkg.SUBMISSION_ZIP_OPTIONS });
  const path = join(OUT, `${built.baseName}.zip`);
  writeFileSync(path, bytes);
  out.archives.push({ label, path, entries: built.entries, payload: built.submissionJson });
}
process.stdout.write(JSON.stringify(out, null, 2));
