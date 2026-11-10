// =====================================================
// The part a student chooses shows the question's own title
// =====================================================
// `workorders/WORKORDER_SS_PART_TITLE_WHEN_LABELLING_2026-09-25.md`.
//
//   node tests/part-title-tests.mjs
//
// Two labels swapped is invisible to every count-based check, because the
// counts are correct; the student matching pages is the only one who can see
// it. So each part is shown as "Problem 1, part (b): Wavelength" (the colon
// form, approved 2026-09-25, the shape of the Assignment Maker's rubric
// `display_name`) in the parts list beside the matching grid, the line naming
// the part being matched, the image description, the coverage list, and the
// download check's list. The "has N pages" sentence keeps the formal label
// alone, as approved.
//
// The download check is held to tests/fixtures/part_title_golden_cbb0569.json,
// as deployed before the title work. The review is held to the golden named in
// tests/partTitleFixtures.mjs (REVIEW_GOLDEN_PATH); see section 3.
// =====================================================

import { readFileSync } from 'node:fs';
import { loadModule } from './captureSet.mjs';
import {
  PART_TITLE_GOLDEN_PATH, REVIEW_GOLDEN_PATH, buildReviewHarness, todaysOutputs, parts, problems, crops, cropUrls, pages,
} from './partTitleFixtures.mjs';

let passed = 0, failed = 0;
const results = [];
const check = (name, fn) => {
  try { fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, e, msg) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`${msg}\n          expected: ${JSON.stringify(e)}\n          actual:   ${JSON.stringify(a)}`); };

console.log('\npart titles — the question\'s own title beside every part a student chooses or sees\n');

const gen = await loadModule('services/genericSheet.ts', 'ptt_generic.mjs');
const { renderReview, cleanup } = await buildReviewHarness();
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const withNames = (fn) => problems.map(p => ({ ...p, subsections: p.subsections.map(s => ({ ...s, name: fn(s) })) }));

// The approved form, on the real sample.
const EXPECTED = ['Problem 1, part (a): Phase velocity', 'Problem 1, part (b): Wavelength', 'Problem 2: Skin depth of copper'];

// =====================================================
// 1. The mapping
// =====================================================
results.push('  1. the mapping, on the real sample');
check('every part resolves to its subsection\'s title, in the approved colon form', () =>
  eq(parts.map(p => gen.partDisplayLabel(p, problems)), EXPECTED, 'display labels'));
check('a single-part problem ("Problem 2", letter a) takes its one subsection\'s title', () =>
  eq(gen.partSubsectionTitle(parts[2], problems), 'Skin depth of copper', 'title'));
check('the formal label is never replaced, only extended: "part (b)" is still findable', () => {
  for (const p of parts) assert(gen.partDisplayLabel(p, problems).startsWith(p.label), `${p.label} was replaced`);
  assert(gen.partDisplayLabel(parts[1], problems).includes('part (b)'), '"part (b)" gone');
});
check('the mapping is by problem number and letter, not by list position', () => {
  const reversed = [...parts].reverse();
  eq(reversed.map(p => gen.partDisplayLabel(p, problems)), [...EXPECTED].reverse(), 'display labels of reversed parts');
});

// =====================================================
// 2. The fallback
// =====================================================
results.push('  2. anything that does not resolve shows the formal label alone');
const p1b = parts[1];
for (const [what, part, probs] of [
  ['no problems at all', p1b, undefined],
  ['an empty name', p1b, withNames(() => '')],
  ['a blank name', p1b, withNames(() => '   \n ')],
  ['no name field', p1b, problems.map(p => ({ ...p, subsections: p.subsections.map(({ name, ...s }) => s) }))],
  ['a name that is not a string', p1b, withNames(() => 42)],
  ['problem number out of range', { ...p1b, problem_number: 9 }, problems],
  ['problem number 0', { ...p1b, problem_number: 0 }, problems],
  ['problem number not an integer', { ...p1b, problem_number: 1.5 }, problems],
  ['a letter past the last subsection', { ...p1b, subsection_letter: 'c' }, problems],
  ['an upper-case letter', { ...p1b, subsection_letter: 'B' }, problems],
  ['two letters', { ...p1b, subsection_letter: 'ab' }, problems],
  ['no letter', { ...p1b, subsection_letter: undefined }, problems],
  ['a problem with no subsections', p1b, [{ name: 'x' }]],
]) {
  check(`${what}: "${p1b.label}" exactly`, () => eq(gen.partDisplayLabel(part, probs), part.label, 'display label'));
}
check('whitespace inside a title is tidied, not left to break the line oddly', () =>
  eq(gen.partDisplayLabel(p1b, withNames(() => '  Symbols\n  and   units ')), 'Problem 1, part (b): Symbols and units', 'display label'));

// =====================================================
// 3. Without titles: the review as approved, the download check as at cbb0569
// =====================================================
// Two goldens, and three checks that protect different things:
//
// - the DOWNLOAD CHECK is held byte for byte to `part_title_golden_cbb0569.json`,
//   as deployed before any title work. It has never moved and must not.
// - the REVIEW is held byte for byte to `review_golden_cdd11ee.json`, written at
//   the commit that replaced the dropdown and tick boxes with the part-first
//   matching grid. That moved the markup for every assignment, as the change to
//   labelling by problem did before it (f8ab9d8); the older goldens are no
//   longer compared. Its new strings are proposed, not yet approved.
// - the PROPERTY check: without titles every problem and part shows its formal
//   label alone. A golden says nothing changed; this says what is right, and
//   still holds if a later, approved change writes a new golden.
results.push('  3. an assignment without titles: the review as approved, the download check as at cbb0569');
const golden = JSON.parse(readFileSync(PART_TITLE_GOLDEN_PATH, 'utf8'));
const reviewGolden = JSON.parse(readFileSync(REVIEW_GOLDEN_PATH, 'utf8'));
check('the download-check golden is the one frozen at cbb0569', () => eq(golden.builtAt, 'cbb0569', 'builtAt'));
check('the review golden is the one written for the part-first matching grid', () => {
  assert(REVIEW_GOLDEN_PATH.endsWith(`review_golden_${reviewGolden.builtAt}.json`), 'the golden is not named for its commit');
  for (const k of ['noTitles', 'withTitles']) {
    assert(reviewGolden[k].includes('data-part-id='), `${k} has no parts list`);
  }
});
// The parts list: one button per part, its label in the first span.
const railButtons = (h) => [...h.matchAll(/<button[^>]*data-part-id="[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
const railLabels = (h) => railButtons(h).map(m => textOf((m[1].match(/<span[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? ''));
const problemHeadings = (h) => [...h.matchAll(/<p class="hidden lg:block text-xs font-semibold[^"]*">([^<]*)<\/p>/g)].map(m => textOf(m[1]));
const sameAs = (now, want, what) => {
  if (now === want) return;
  let i = 0; while (now[i] === want[i]) i++;
  throw new Error(`${what} differs at ${i}: ${JSON.stringify(now.slice(Math.max(0, i - 40), i + 60))}`);
};
for (const [what, props, noticeArgs] of [
  ['no problems passed', {}, []],
  ['problems whose subsections have no names', { problems: withNames(() => '').map(p => ({ ...p, name: '' })) }, [withNames(() => '')]],
  ['problems whose names are blank', { problems: withNames(() => '  ').map(p => ({ ...p, name: '  ' })) }, [withNames(() => '  ')]],
]) {
  await checkAsync(`${what}: the download check is byte-identical to the cbb0569 golden`, async () => {
    const now = await todaysOutputs(renderReview, props, noticeArgs);
    eq(now.notice, golden.notice, 'download check');
  });
  await checkAsync(`${what}: the review is byte-identical to the review golden`, async () => {
    const now = await todaysOutputs(renderReview, props, noticeArgs);
    sameAs(now.review, reviewGolden.noTitles, 'review');
  });
  await checkAsync(`${what}: every problem and part is shown by its formal label alone`, async () => {
    const { review } = await todaysOutputs(renderReview, props, noticeArgs);
    eq(railLabels(review), ['Problem 1, part (a)', 'Problem 1, part (b)', 'Problem 2'], 'parts list');
    eq(problemHeadings(review), ['Problem 1'], 'problem heading');
    assert(!/alt="[^"]*:/.test(review), 'a colon in an image description');
  });
}

// =====================================================
// 4. With titles, in every approved place
// =====================================================
// Since 2026-11-04 a page is labelled part first: the parts are a list beside
// the grid of pages. The approved colon form is where a part is named: on its
// button in the list, in the line naming the part being matched, and in each
// page's image description. A multi-part problem heads its parts by its name.
results.push('  4. with titles: the parts list, the part being matched, image description, coverage list, download check');
const html = renderReview({ parts, problems, crops, cropUrls, pages });
check('with titles, the review is byte-identical to the review golden', () => sameAs(html, reviewGolden.withTitles, 'review'));
check('the parts list names every part with its title', () => eq(railLabels(html), EXPECTED, 'parts list'));
check('a multi-part problem is headed by its own name', () =>
  eq(problemHeadings(html), ['Problem 1: Plane wave in a lossless medium'], 'problem heading'));
check('the part being matched is named in full, with its title', () => {
  const line = (html.match(/<p[^>]*data-active-part[^>]*>([\s\S]*?)<\/p>/) ?? [])[1];
  // The list starts on the first part with no page: 1(b).
  eq(textOf(line ?? ''), `Pages for ${EXPECTED[1]}`, 'active part line');
});
check('the image description carries the title', () => {
  const alts = [...html.matchAll(/<img[^>]*alt="([^"]*)"/g)].map(m => m[1]);
  eq(alts, [`Photo 1, ${EXPECTED[0]}`, `Photo 2, ${EXPECTED[2]}`, `Photo 3, ${EXPECTED[2]}`, 'Photo 4'], 'alt text');
});
check('the coverage list names the missing part with its title', () =>
  assert(/No page yet for:\s*Problem 1, part \(b\): Wavelength/.test(textOf(html)), textOf(html).slice(0, 400)));
check('the "has N pages" sentence keeps the formal label alone (approved)', () =>
  assert(textOf(html).includes('Problem 2 has 2 pages while another part has none. If one of them belongs to another part, change it.'),
    'the repeated-part sentence changed'));
check('the download check lists the missing part with its title', () => {
  const coverage = gen.genericCoverage(parts, crops, pages);
  eq(gen.genericCompletenessNotice(coverage, parts.length, problems)?.groups, [{ names: [EXPECTED[1]] }], 'notice groups');
});

// =====================================================
// 5. A long title wraps; it is never cut
// =====================================================
results.push('  5. a long title wraps (measured at 390 px by tests/part-title-browser.mjs)');
const LONG = 'Symbols and units for the complex permittivity of a lossy dielectric at microwave frequencies';
const longHtml = renderReview({ parts, problems: withNames(s => s.name === 'Phase velocity' ? LONG : s.name), crops, cropUrls, pages });
const longOneHtml = renderReview({ parts, problems: withNames(s => s.name === 'Skin depth of copper' ? LONG : s.name), crops, cropUrls, pages });
const CUTS = /\b(truncate|text-ellipsis|whitespace-nowrap|line-clamp-\d+|overflow-hidden|overflow-x-hidden)\b/;
check('the whole long title is in the parts list and the description: nothing is cut', () => {
  const full = `Problem 1, part (a): ${LONG}`;
  assert(railLabels(longHtml).includes(full), 'the parts list does not carry the whole title');
  assert(longHtml.includes(`alt="Photo 1, ${full}"`), 'the description does not carry the whole title');
});
check('a one-part problem\'s long title is whole in the parts list', () =>
  assert(railLabels(longOneHtml).includes(`Problem 2: ${LONG}`), 'the parts list does not carry the whole title'));
check('a part\'s button is allowed to wrap, and is at least 44 px tall', () => {
  const buttons = railButtons(longHtml);
  assert(buttons.length === parts.length, `${buttons.length} buttons`);
  for (const m of buttons) {
    const cls = (m[0].match(/class="([^"]*)"/) ?? [])[1] ?? '';
    const label = (m[1].match(/<span class="([^"]*)"/) ?? [])[1] ?? '';
    assert(/\bmin-h-\[44px\]/.test(cls), `button: ${cls}`);
    assert(/\bbreak-words\b/.test(label), `label does not wrap long words: ${label}`);
    assert(!CUTS.test(cls) && !CUTS.test(label), `the button can cut: ${cls} / ${label}`);
  }
});

cleanup();
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
