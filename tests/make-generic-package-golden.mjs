// =====================================================
// Writes tests/fixtures/generic_package_golden_0b82d9b.json — run ONCE, at 0b82d9b
// =====================================================
// `WORKORDER_SS_MULTIPART_PAGES_2026-10-07`, S3. The golden is the builder at
// `0b82d9b`, before a page could carry several parts, packaging the generic-page
// fixture in `tests/genericPackageFixtures.mjs`: a part of a multi-part problem,
// a one-part problem (part `2`), an unlabelled page, and one part over two
// pages, each page labelled with `labelGenericCrop`, the only labelling there was.
//
// **Do not regenerate it to make a test pass.** Regenerating from the current
// tree turns "the same as the code before multi-part pages" into "the same as
// itself", which is always true. If a change is meant to move the one-part
// generic package, that change says so in its own commit, with the reason.
//
//   node tests/make-generic-package-golden.mjs
// =====================================================

import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { writeFileSync } from 'node:fs';
import { loadModule } from './captureSet.mjs';
import {
  GENERIC_GOLDEN_PATH, OLD_FLOW_LABELS, buildGeneric, genericAssignment, genericPagesAndCrops,
} from './genericPackageFixtures.mjs';

const P = await loadModule('tests/genericPipeline.ts', 'golden_generic_pipeline.mjs');

const { pages, crops: unlabelled, blobs } = genericPagesAndCrops(P);
let crops = unlabelled;
for (const [pageId, partId] of OLD_FLOW_LABELS) {
  if (partId) crops = P.labelGenericCrop(crops, P.genericCropKey('gen', pageId), partId);
}
const { entries, serialised, files } = await buildGeneric(P, genericAssignment(), pages, crops, blobs);
writeFileSync(GENERIC_GOLDEN_PATH,
  JSON.stringify({ builtAt: '0b82d9b', entries, serialised, files }, null, 1) + '\n');
console.log(`wrote ${GENERIC_GOLDEN_PATH}`);
console.log(`  ${entries.length} entries: ${entries.join(', ')}`);
