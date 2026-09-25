// =====================================================
// The preview, rendered in Node: fixtures and harness shared by
// tests/preview-tests.mjs and tests/make-preview-golden.mjs
// =====================================================
// `components/PrintView.tsx` is what a student sees on tapping Preview, and on
// the electronic path it is also what `html2canvas` rasterises into the PDF.
// The electronic fixture covers every answer kind it draws: text with LaTeX,
// an image slot with a second page (one filled, one empty), an AI-graded
// answer, and a part left unanswered, which on the electronic path must still
// say "No answer submitted." because there it is true.
// =====================================================

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PREVIEW_GOLDEN_PATH = join(REPO, 'tests', 'fixtures', 'preview_golden_c89fe36.json');

/** A 1×1 PNG, so an image answer renders as an <img> without a file. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const problems = [
  {
    id: 'p1', name: 'Voltage divider', description: 'The circuit is driven by $V_s = 10$ V.',
    subsections: [
      { id: 's1', name: 'Output voltage', description: 'Find $V_{out}$.', points: 20, submissionType: 'Text' },
      { id: 's2', name: 'Photograph', description: 'Photograph your breadboard.', points: 10, submissionType: 'Image', maxImages: 2 },
      { id: 's3', name: 'Explain', description: 'Why does loading change $V_{out}$?', points: 30, submissionType: 'AI Graded: Short' },
    ],
  },
  {
    id: 'p2', name: 'Power', description: '',
    subsections: [
      { id: 's1', name: 'Dissipation', description: 'Find the power in $R_2$.', points: 40, submissionType: 'Text' },
    ],
  },
];

export const electronicAssignment = {
  id: 'EEC1_Preview_Fixture', courseCode: 'EEC1', title: 'Preview Fixture', problems,
};

export const electronicAnswers = {
  p0_s0: { textAnswer: 'By the divider rule, $V_{out} = V_s \\frac{R_2}{R_1 + R_2} = 4$ V.' },
  p0_s1: { imageAnswers: [PIXEL] },
  p0_s2: { aiAnswer: 'The load resistor is in parallel with $R_2$, which lowers the effective resistance.' },
  // p1_s0 deliberately unanswered.
};

/** The same problems, answered on paper: the printed sheet. */
export const printedAssignment = { ...electronicAssignment, inputMode: 'handwritten' };

/** The generic answer page: handwritten, `sheet: "generic"`, parts from the file. */
export const genericAssignment = {
  ...electronicAssignment, inputMode: 'handwritten', sheet: 'generic',
  parts: [
    { part_id: '1(a)', label: 'Problem 1, part (a)', max_points: 20 },
    { part_id: '1(b)', label: 'Problem 1, part (b)', max_points: 10 },
    { part_id: '1(c)', label: 'Problem 1, part (c)', max_points: 30 },
    { part_id: '2', label: 'Problem 2', max_points: 40 },
  ],
};

/**
 * Bundles PrintView for Node and returns `renderPreview(props)`, the static
 * markup of exactly what the student sees. `cleanup()` removes the bundle.
 */
export const buildPreviewHarness = async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'gb-preview-test-'));
  const harnessFile = join(outDir, 'preview-harness.mjs');
  await build({
    stdin: {
      contents: `
        import * as React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import PrintView from './components/PrintView';
        export const renderPreview = (props) => renderToStaticMarkup(React.createElement(PrintView, props));
      `,
      resolveDir: REPO, loader: 'tsx', sourcefile: 'preview-harness.tsx',
    },
    outfile: harnessFile, format: 'esm', platform: 'node', target: 'es2022', bundle: true, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty' },
    logLevel: 'silent',
  });
  const { renderPreview } = await import(pathToFileURL(harnessFile).href);
  return { renderPreview, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
};

/** The electronic renders the golden freezes: answered, and wholly unanswered. */
export const electronicRenders = (renderPreview) => ({
  answered: renderPreview({ assignment: electronicAssignment, submissionData: electronicAnswers }),
  unanswered: renderPreview({ assignment: electronicAssignment, submissionData: {} }),
});
