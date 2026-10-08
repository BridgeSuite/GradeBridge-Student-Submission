// =====================================================
// The part a student chooses shows the question's own title
// =====================================================
// `workorders/WORKORDER_SS_PART_TITLE_WHEN_LABELLING_2026-09-25.md`.
//
//   node tests/part-title-tests.mjs
//
// Two labels swapped is invisible to every count-based check, because the
// counts are correct; the student at the dropdown is the only one who can see
// it. So each part is shown as "Problem 1, part (b): Wavelength" (the colon
// form, approved 2026-09-25, the shape of the Assignment Maker's rubric
// `display_name`) in the dropdown, a line under it once chosen, the image
// description, the coverage list, and the download check's list. The "has N
// pages" sentence keeps the formal label alone, as approved.
//
// An assignment with no titles must render exactly as at cbb0569: held against
// tests/fixtures/part_title_golden_cbb0569.json.
// =====================================================

import { readFileSync } from 'node:fs';
import { loadModule } from './captureSet.mjs';
import {
  PART_TITLE_GOLDEN_PATH, buildReviewHarness, todaysOutputs, parts, problems, crops, cropUrls, pages,
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
// 3. Without titles, exactly as deployed at cbb0569
// =====================================================
// The REVIEW is no longer held to the cbb0569 golden, deliberately:
// `WORKORDER_SS_MULTIPART_PAGES_2026-10-07` S1 replaced the part dropdown with a
// problem choice and tick boxes for every assignment, so the review's markup
// moved by design, with or without titles. The golden is NOT regenerated. What
// the golden held still holds and is checked here: the download check is
// byte-identical, and without titles every part is shown by its formal label
// alone, with no colon, no title line and no title in a description.
results.push('  3. an assignment without titles: formal labels alone, download check as before');
const golden = JSON.parse(readFileSync(PART_TITLE_GOLDEN_PATH, 'utf8'));
check('the golden is the one frozen at cbb0569', () => eq(golden.builtAt, 'cbb0569', 'builtAt'));
for (const [what, props, noticeArgs] of [
  ['no problems passed', {}, []],
  ['problems whose subsections have no names', { problems: withNames(() => '').map(p => ({ ...p, name: '' })) }, [withNames(() => '')]],
  ['problems whose names are blank', { problems: withNames(() => '  ').map(p => ({ ...p, name: '  ' })) }, [withNames(() => '  ')]],
]) {
  await checkAsync(`${what}: the download check is byte-identical to the golden`, async () => {
    const now = await todaysOutputs(renderReview, props, noticeArgs);
    eq(now.notice, golden.notice, 'download check');
  });
  await checkAsync(`${what}: every problem and part is shown by its formal label alone`, async () => {
    const { review } = await todaysOutputs(renderReview, props, noticeArgs);
    const options = [...review.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].slice(0, 3).map(m => textOf(m[2]));
    eq(options, ['Choose a problem', 'Problem 1', 'Problem 2'], 'problem options');
    const ticks = [...review.matchAll(/<input[^>]*type="checkbox"[^>]*>\s*<span[^>]*>([^<]*)<\/span>/g)].map(m => textOf(m[1]));
    eq(ticks.slice(0, 2), ['Problem 1, part (a)', 'Problem 1, part (b)'], 'tick labels');
    assert(!/data-part-title/.test(review), 'a title line with no title');
    assert(!/alt="[^"]*:/.test(review), 'a colon in an image description');
  });
}

// =====================================================
// 4. With titles, in every approved place
// =====================================================
// Since `WORKORDER_SS_MULTIPART_PAGES_2026-10-07` the dropdown chooses the
// PROBLEM and a multi-part problem's parts are tick boxes. The approved colon
// form is where a part is named: in each tick box, and for a one-part problem
// in the dropdown itself and the line under it, exactly as before.
results.push('  4. with titles: dropdown, tick boxes, line under it, image description, coverage list, download check');
const html = renderReview({ parts, problems, crops, cropUrls, pages });
const tickLabels = (h) => [...h.matchAll(/<input[^>]*type="checkbox"[^>]*>\s*<span[^>]*>([^<]*)<\/span>/g)].map(m => textOf(m[1]));
check('the dropdown offers every problem: a one-part problem with its part\'s title, a multi-part one with its own name', () => {
  const selects = html.match(/<select[\s\S]*?<\/select>/g) ?? [];
  eq(selects.length, 4, 'one dropdown per photo');
  for (const s of selects) {
    const opts = [...s.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m => [m[1], textOf(m[2])]);
    eq(opts, [['', 'Choose a problem'], ['1', 'Problem 1: Plane wave in a lossless medium'], ['2', EXPECTED[2]]], 'options');
  }
});
check('a multi-part problem\'s tick boxes name every part with its title', () =>
  eq(tickLabels(html), [EXPECTED[0], EXPECTED[1]], 'tick labels (photo 1 is Problem 1; photos 2 and 3 are one-part)'));
check('once a one-part problem is chosen, a line under the dropdown shows the part and title, and nothing else', () => {
  const lines = [...html.matchAll(/<p[^>]*data-part-title[^>]*>([\s\S]*?)<\/p>/g)].map(m => textOf(m[1]));
  eq(lines, [EXPECTED[2], EXPECTED[2]], 'the chosen-part lines (photos 2 and 3; photo 1 has tick boxes, photo 4 no part)');
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
check('the whole long title is in the tick box and the description: nothing is cut', () => {
  const full = `Problem 1, part (a): ${LONG}`;
  assert(tickLabels(longHtml).includes(full), 'the tick box does not carry the whole title');
  assert(longHtml.includes(`alt="Photo 1, ${full}"`), 'the description does not carry the whole title');
});
check('a one-part problem\'s long title is whole in the line and the dropdown', () => {
  const full = `Problem 2: ${LONG}`;
  const line = (longOneHtml.match(/<p[^>]*data-part-title[^>]*>([\s\S]*?)<\/p>/) ?? [])[1];
  assert(line !== undefined && textOf(line) === full, `the line does not carry the whole title: ${line}`);
  assert(longOneHtml.includes(`>${full}</option>`), 'the option does not carry the whole title');
});
check('the line is allowed to wrap: no truncate, ellipsis, nowrap, clamp or hidden overflow', () => {
  const cls = (longOneHtml.match(/<p class="([^"]*)" data-part-title/) ?? [])[1];
  assert(cls !== undefined, 'no chosen-part line');
  assert(/\bbreak-words\b/.test(cls), `the line does not wrap long words: ${cls}`);
  assert(!CUTS.test(cls), `the line can cut: ${cls}`);
});
check('a tick box is allowed to wrap, and is at least 44 px tall', () => {
  const classes = [...longHtml.matchAll(/<label[^>]*for="tick-[^"]*"[^>]*class="([^"]*)"|<label[^>]*class="([^"]*)"[^>]*for="tick-/g)]
    .map(m => m[1] ?? m[2]);
  assert(classes.length > 0, 'no tick boxes');
  for (const cls of classes) {
    assert(/\bbreak-words\b/.test(cls) && /\bmin-h-\[44px\]/.test(cls), `tick box: ${cls}`);
    assert(!CUTS.test(cls), `the tick box can cut: ${cls}`);
  }
});

cleanup();
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
