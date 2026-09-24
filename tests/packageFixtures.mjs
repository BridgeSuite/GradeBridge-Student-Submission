// =====================================================
// Two submissions, built identically before and after a change
// =====================================================
// The inputs behind `tests/fixtures/package_golden_c72450e.json`: an ELECTRONIC
// submission using every electronic answer type, and a PRINTED-SHEET
// handwritten submission over the real ENG17 HW1 map (`95438EDF`, 17 regions,
// 16 pages). Every input is pinned — the clock, the ids, the bitmap bytes — so
// the same code builds the same archive on every machine.
//
// **Why a golden and not two builds side by side.** "Untouched" means "the same
// as the code that was deployed", and that code is gone from the tree the day
// anything changes. CI checks out one commit, so it cannot fetch the old
// builder. So the old builder was run once, at `c72450e`, by
// `tests/make-package-golden.mjs`, and what it produced is committed. A later
// change that moves a byte of the electronic payload, or a field of the
// printed-sheet payload, fails against it.
//
// The fixture is geometry and invented answers. No question text, no answer
// key, no person's name.
// =====================================================

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const HW1_CSV = readFileSync(join(HERE, 'fixtures', 'layout_ENG17HOM496F.csv'), 'utf8');
export const GOLDEN_PATH = join(HERE, 'fixtures', 'package_golden_c72450e.json');
export const NOW = '2026-09-24T10:00:00.000Z';

/** Deterministic, JPEG-headed bytes. The builder copies them; nothing decodes them. */
export const bytesFor = (seed, length) => {
  const out = new Uint8Array(length);
  out.set([0xff, 0xd8, 0xff, 0xe0], 0);
  for (let i = 4; i < length; i++) out[i] = (seed * 131 + i * 17 + (i >> 7)) & 0xff;
  return out;
};

const dataUri = (bytes) => `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;

// ---------- electronic: every answer type the app writes ----------
export const electronicSources = () => ({
  assignment: {
    id: 'golden-elec', courseCode: 'EEC1', title: 'Golden Lab', preamble: '',
    createdAt: 0, updatedAt: 0, aiFeedback: true,
    problems: [
      { id: 'p0', name: 'One', description: '', subsections: [
        { id: 's0', name: 'a', description: '', points: 10, submissionType: 'Text' },
        { id: 's1', name: 'b', description: '', points: 10, submissionType: 'Image', maxImages: 2 },
        { id: 's2', name: 'c', description: '', points: 10, submissionType: 'Text and Image', maxImages: 1 },
      ] },
      { id: 'p1', name: 'Two', description: '', subsections: [
        { id: 's0', name: 'a', description: '', points: 10, submissionType: 'AI Graded: Binary' },
        { id: 's1', name: 'b', description: '', points: 20, submissionType: 'AI Graded: Short' },
        { id: 's2', name: 'c', description: '', points: 20, submissionType: 'AI Graded: Medium' },
        { id: 's3', name: 'd', description: '', points: 20, submissionType: 'AI Graded: Long' },
      ] },
    ],
  },
  submissionData: {
    p0_s0: { textAnswer: 'The node voltage is $1.2$ V.' },
    p0_s1: { imageAnswers: [dataUri(bytesFor(1, 2048)), dataUri(bytesFor(2, 1024))] },
    p0_s2: { textAnswer: 'Plot attached.', imageAnswers: [dataUri(bytesFor(3, 1536))] },
    p1_s0: { aiAnswer: 'Yes, because the collector current rises.' },
    p1_s1: { aiAnswer: 'g_m is 38 mS, so the gain is about -180.' },
    p1_s2: { aiAnswer: 'The source resistance divides the input.' },
    // p1_s3 deliberately unanswered
  },
  isHandwritten: false,
  layoutId: null,
  pages: [],
  crops: {},
  now: NOW,
});

export const electronicAssets = () => ({
  pdfBytes: bytesFor(99, 4096),
  readBlob: async () => null,
  downsampleImage: async (uri) => uri,
});

// ---------- printed sheet: the real HW1 map, one crop per region ----------
const parseRows = (csv) => {
  const [header, ...lines] = csv.trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    const at = (c) => cells[cols.indexOf(c)];
    return {
      regionId: at('region_id'), partId: at('part_id'), pageK: Number(at('page_k')),
      isDrawing: at('is_drawing') === '1', maxPoints: Number(at('max_points')),
    };
  });
};

export const HW1_ROWS = parseRows(HW1_CSV);

export const printedSources = () => {
  const pages = Array.from({ length: 16 }, (_, i) => ({
    id: `pg${String(i).padStart(2, '0')}`,
    file: `page_${i + 1}.jpg`,
    width: 1650, height: 2200, bytes: 4000 + i,
    registration: i === 5
      ? { status: 'degraded', k: i + 1, n: 16, layoutId: '95438EDF', marksFound: 3,
          marksDetected: ['NW', 'NE', 'SW'], marksDeclined: [], residualMm: 0.4, heldOutMm: 0 }
      : { status: 'ok', k: i + 1, n: 16, layoutId: '95438EDF', marksFound: 4,
          marksDetected: ['NW', 'NE', 'SW', 'SE'], marksDeclined: [], residualMm: 0.2, heldOutMm: 0 },
    captureId: `cap-page-${i}`,
  }));
  const crops = {};
  HW1_ROWS.forEach((r, i) => {
    // One region left uncut, one direct capture, one flagged: every crop state.
    if (i === HW1_ROWS.length - 1) return;
    crops[r.regionId] = {
      regionId: r.regionId, partId: r.partId, pageK: r.pageK,
      isDrawing: r.isDrawing, maxPoints: r.maxPoints,
      cropSource: i === 3 ? 'direct_capture' : 'registration',
      review: i % 3 === 0 ? 'signed_off' : i % 3 === 1 ? 'flagged' : 'not_reviewed',
      qualityFlags: i === 4 ? ['looks-empty'] : [],
      file: `crops/${r.regionId}.jpg`,
      width: 900 + i, height: 400 + i, bytes: 700 + i,
      ...(i === 3 ? {} : { fromPage: `pg${String(r.pageK - 1).padStart(2, '0')}` }),
      captureId: `cap-crop-${i}`,
    };
  });
  return {
    assignment: {
      id: 'golden-hw1', courseCode: 'ENG17', title: 'Homework 1', preamble: '',
      createdAt: 0, updatedAt: 0, inputMode: 'handwritten',
      problems: [{ id: 'p1', name: 'P', description: '', subsections: [
        { id: 's1', name: 'a', description: '', points: 3, submissionType: 'Handwritten' },
      ] }],
      layoutCsvName: 'layout_ENG17HOM496F.csv', layoutCsv: HW1_CSV,
    },
    submissionData: {},
    isHandwritten: true,
    layoutId: '95438EDF',
    pages,
    crops,
    now: NOW,
  };
};

export const printedAssets = () => ({
  readBlob: async (key) => {
    const m = /^pg(\d+)$/.exec(key);
    if (m) return bytesFor(200 + Number(m[1]), 3000);
    const c = /^crop_(.+)$/.exec(key);
    if (c) return bytesFor(400 + c[1].length * 7 + c[1].charCodeAt(1), 1200);
    return null;
  },
  downsampleImage: async (uri) => uri,
});

/** Builds both, confirmed, and reduces each to what a comparison needs. */
export const buildBoth = async (pkg, pi) => {
  const out = {};
  for (const [name, sources, assets] of [
    ['electronic', electronicSources(), electronicAssets()],
    ['printed', printedSources(), printedAssets()],
  ]) {
    const confirmed = { ...sources, personalInfoConfirmation: pi.confirmPersonalInfo(sources) };
    const built = await pkg.buildSubmissionPackage(confirmed, assets);
    const files = {};
    for (const entry of built.entries) {
      const bytes = await built.zip.file(entry).async('uint8array');
      files[entry] = { bytes: bytes.length, sum: bytes.reduce((s, b) => (s * 31 + b) >>> 0, 7) };
    }
    out[name] = {
      baseName: built.baseName,
      entries: built.entries,
      files,
      submissionJson: built.submissionJson,
      serialised: Buffer.from(pkg.serialiseSubmissionJson(built.submissionJson)).toString('utf8'),
    };
  }
  return out;
};
