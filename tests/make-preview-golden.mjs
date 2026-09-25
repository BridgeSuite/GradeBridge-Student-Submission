// =====================================================
// Writes tests/fixtures/preview_golden_c89fe36.json — run ONCE, at c89fe36
// =====================================================
// The golden is the deployed preview's markup for an ELECTRONIC assignment,
// over `tests/previewFixtures.mjs`. It was written by running this script on
// `c89fe36` (gh-pages `c3c1e7e`, bundle `index-BOTni7El.js`), before the
// handwritten preview work touched `components/PrintView.tsx`.
//
// It exists because on the electronic path the preview is also the PDF:
// `html2canvas` rasterises this markup, so a change here changes what an
// electronic student submits.
//
// **Do not regenerate it to make a test pass.** Regenerating from the current
// tree turns "the same as what was deployed" into "the same as itself", which
// is always true. If a change is meant to move the electronic preview, that
// change says so in its own commit, and the golden moves there, with the reason.
//
//   node tests/make-preview-golden.mjs
// =====================================================

import { writeFileSync } from 'node:fs';
import { PREVIEW_GOLDEN_PATH, buildPreviewHarness, electronicRenders } from './previewFixtures.mjs';

const { renderPreview, cleanup } = await buildPreviewHarness();
const renders = electronicRenders(renderPreview);
cleanup();
writeFileSync(PREVIEW_GOLDEN_PATH, JSON.stringify({ builtAt: 'c89fe36', renders }, null, 1) + '\n');
console.log(`wrote ${PREVIEW_GOLDEN_PATH}`);
for (const [k, v] of Object.entries(renders)) console.log(`  ${k}: ${v.length} characters`);
