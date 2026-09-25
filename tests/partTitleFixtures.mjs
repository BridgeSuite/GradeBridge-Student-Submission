// =====================================================
// Fixtures and harness for the part-title work: tests/part-title-tests.mjs and
// tests/make-part-title-golden.mjs
// =====================================================
// `WORKORDER_SS_PART_TITLE_WHEN_LABELLING_2026-09-25`. The parts and the
// subsections are the real generic sample's (`tests/fixtures/generic_sheet_sample.json`),
// decoded. Four photographed pages exercise every place a part is shown: one
// labelled 1(a) and checked, two labelled Problem 2 (so 1(b) is missing and
// Problem 2 is repeated), and one blank with no part chosen.
// =====================================================

import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadModule } from './captureSet.mjs';

globalThis.crypto ??= webcrypto;
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

export const PART_TITLE_GOLDEN_PATH = join(HERE, 'fixtures', 'part_title_golden_cbb0569.json');

const cryptoSvc = await loadModule('cryptoService.ts', 'pt_crypto.mjs');
export const sample = await cryptoSvc.decryptJson(readFileSync(join(HERE, 'fixtures', 'generic_sheet_sample.json'), 'utf8').trim());
export const parts = sample.parts;
export const problems = sample.problems;

export const pages = ['pgA', 'pgB', 'pgC', 'pgD'].map((id, i) => ({ id, fileName: `page_${i + 1}.jpg` }));
const crop = (page, partId, extra = {}) => ({
  regionId: `gen@${page}`, partId, pageK: 1, isDrawing: false, maxPoints: 0, cropSource: 'registration',
  review: 'not_reviewed', qualityFlags: [], file: `${page}.jpg`, width: 1325, height: 1381, bytes: 1000,
  fromPage: page, partSource: 'student', mapRegionId: 'gen', inkBox: null, inkVerdict: 'ink', ...extra,
});
export const crops = {
  'gen@pgA': crop('pgA', '1(a)', { review: 'signed_off' }),
  'gen@pgB': crop('pgB', '2'),
  'gen@pgC': crop('pgC', '2', { review: 'flagged' }),
  'gen@pgD': crop('pgD', '', { inkVerdict: 'blank' }),
};
export const cropUrls = Object.fromEntries(Object.keys(crops).map(k => [k, `blob:${k}`]));

/** Bundles the review for Node; `renderReview(props)` is its static markup. */
export const buildReviewHarness = async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'gb-part-title-'));
  const file = join(outDir, 'harness.mjs');
  await build({
    stdin: {
      contents: `
        import * as React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import GenericPageReview from './components/GenericPageReview';
        const noop = () => {}, anoop = async () => {};
        export const renderReview = (props) => renderToStaticMarkup(React.createElement(GenericPageReview,
          { onLabel: noop, onReview: noop, onRetakePage: anoop, busy: null, ...props }));
      `,
      resolveDir: REPO, loader: 'tsx', sourcefile: 'harness.tsx',
    },
    outfile: file, format: 'esm', platform: 'node', target: 'es2022', bundle: true, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    loader: { '.css': 'empty' }, logLevel: 'silent',
  });
  const { renderReview } = await import(pathToFileURL(file).href);
  return { renderReview, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
};

/** Today's outputs, which a titleless assignment must reproduce byte for byte. */
export const todaysOutputs = async (renderReview, extraReviewProps = {}, noticeArgs = []) => {
  const gen = await loadModule('services/genericSheet.ts', `pt_generic_${Date.now()}.mjs`);
  const coverage = gen.genericCoverage(parts, crops, pages);
  return {
    review: renderReview({ parts, crops, cropUrls, pages, ...extraReviewProps }),
    notice: gen.genericCompletenessNotice(coverage, parts.length, ...noticeArgs),
  };
};
