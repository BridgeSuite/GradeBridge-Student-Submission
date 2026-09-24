// =====================================================
// Writes tests/fixtures/package_golden_c72450e.json — run ONCE, at c72450e
// =====================================================
// The golden is the deployed builder's output over `tests/packageFixtures.mjs`.
// It was written by running this script on a checkout of `c72450e` (v4.0.0,
// gh-pages `b978d72`), before the generic-sheet work touched anything.
//
// **Do not regenerate it to make a test pass.** Regenerating from the current
// tree turns "the same as what was deployed" into "the same as itself", which
// is always true. If a change is meant to move the electronic or printed-sheet
// package, that change says so in its own commit, and the golden moves there,
// with the reason.
//
//   node tests/make-package-golden.mjs
// =====================================================

import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { writeFileSync } from 'node:fs';
import { loadModule } from './captureSet.mjs';
import { GOLDEN_PATH, buildBoth } from './packageFixtures.mjs';

const pkg = await loadModule('services/submissionPackage.ts', 'golden_pkg.mjs');
const pi = await loadModule('services/personalInfo.ts', 'golden_pi.mjs');

const both = await buildBoth(pkg, pi);
writeFileSync(GOLDEN_PATH, JSON.stringify({ builtAt: 'c72450e', ...both }, null, 1) + '\n');
console.log(`wrote ${GOLDEN_PATH}`);
for (const [k, v] of Object.entries(both)) console.log(`  ${k}: ${v.entries.length} entries`);
