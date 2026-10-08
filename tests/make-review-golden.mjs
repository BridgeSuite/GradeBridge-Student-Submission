// =====================================================
// Writes tests/fixtures/review_golden_f8ab9d8.json — run ONCE, at f8ab9d8
// =====================================================
// The generic review's markup at the commit that carries the approved wording
// for labelling by problem, then parts (`FINDINGS_SS_MULTIPART_PAGES_2026-10-07`
// §4, rulings A and B). It replaces `part_title_golden_cbb0569.json` FOR THE
// REVIEW ONLY: the multi-part work changed the review's markup for every
// assignment, so the cbb0569 review could not survive it. The download check
// is still held to the cbb0569 golden, byte for byte, and does not move.
//
// Two renders over `tests/partTitleFixtures.mjs`: without titles (no problems
// passed) and with the real sample's titles. A page labelled with a part of a
// multi-part problem, two with a one-part problem, and one with nothing.
//
// **Do not regenerate it to make a test pass**: regenerating from the current
// tree turns "the same as what was approved" into "the same as itself". A
// change meant to move the review says so in its own commit, writes a new
// golden named by that commit, and states why.
//
// It refuses to run while any file outside tests/ differs from HEAD, and
// records the commit it was built at, so the name and the contents cannot
// disagree.
//
//   node tests/make-review-golden.mjs
// =====================================================

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { buildReviewHarness, cropUrls, crops, pages, parts, problems, REVIEW_GOLDEN_PATH } from './partTitleFixtures.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
// The markup is the app's code; the harness and this writer live in tests/.
const dirty = git('status', '--porcelain', '--untracked-files=no', '--', '.', ':!tests');
if (dirty) { console.error(`refusing: uncommitted changes\n${dirty}`); process.exit(1); }
const head = git('rev-parse', '--short=7', 'HEAD');
if (!REVIEW_GOLDEN_PATH.endsWith(`review_golden_${head}.json`)) {
  console.error(`refusing: HEAD is ${head}, but the golden is named for ${REVIEW_GOLDEN_PATH}`);
  process.exit(1);
}

const { renderReview, cleanup } = await buildReviewHarness();
const noTitles = renderReview({ parts, crops, cropUrls, pages });
const withTitles = renderReview({ parts, problems, crops, cropUrls, pages });
cleanup();
writeFileSync(REVIEW_GOLDEN_PATH, JSON.stringify({ builtAt: head, noTitles, withTitles }, null, 1) + '\n');
console.log(`wrote ${REVIEW_GOLDEN_PATH} at ${head}: without titles ${noTitles.length} chars, with ${withTitles.length}`);
