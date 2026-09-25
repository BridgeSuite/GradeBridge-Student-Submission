// =====================================================
// Writes tests/fixtures/part_title_golden_cbb0569.json — run ONCE, at cbb0569
// =====================================================
// The generic review's markup and the download check's content as deployed
// (cbb0569, gh-pages 0dea502, bundle index-CUnq2S1w.js), over
// `tests/partTitleFixtures.mjs`, before the part-title work touched either.
//
// An assignment whose parts have no subsection name must render exactly this.
// **Do not regenerate it to make a test pass**: regenerating from the current
// tree turns "the same as what was deployed" into "the same as itself".
//
//   node tests/make-part-title-golden.mjs
// =====================================================

import { writeFileSync } from 'node:fs';
import { PART_TITLE_GOLDEN_PATH, buildReviewHarness, todaysOutputs } from './partTitleFixtures.mjs';

const { renderReview, cleanup } = await buildReviewHarness();
const out = await todaysOutputs(renderReview);
cleanup();
writeFileSync(PART_TITLE_GOLDEN_PATH, JSON.stringify({ builtAt: 'cbb0569', ...out }, null, 1) + '\n');
console.log(`wrote ${PART_TITLE_GOLDEN_PATH}: review ${out.review.length} chars, notice ${JSON.stringify(out.notice).length} chars`);
