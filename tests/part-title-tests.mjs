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
results.push('  3. an assignment without titles renders exactly as before');
const golden = JSON.parse(readFileSync(PART_TITLE_GOLDEN_PATH, 'utf8'));
check('the golden is the one frozen at cbb0569', () => eq(golden.builtAt, 'cbb0569', 'builtAt'));
for (const [what, props, noticeArgs] of [
  ['no problems passed', {}, []],
  ['problems whose subsections have no names', { problems: withNames(() => '') }, [withNames(() => '')]],
  ['problems whose names are blank', { problems: withNames(() => '  ') }, [withNames(() => '  ')]],
]) {
  await checkAsync(`${what}: the review and the download check are byte-identical to the golden`, async () => {
    const now = await todaysOutputs(renderReview, props, noticeArgs);
    if (now.review !== golden.review) {
      let i = 0; while (now.review[i] === golden.review[i]) i++;
      throw new Error(`review differs at ${i}: ${JSON.stringify(now.review.slice(i - 40, i + 60))}`);
    }
    eq(now.notice, golden.notice, 'download check');
  });
}

// =====================================================
// 4. With titles, in every approved place
// =====================================================
results.push('  4. with titles: dropdown, line under it, image description, coverage list, download check');
const html = renderReview({ parts, problems, crops, cropUrls, pages });
check('the dropdown offers every part with its title', () => {
  const selects = html.match(/<select[\s\S]*?<\/select>/g) ?? [];
  eq(selects.length, 4, 'one dropdown per photo');
  for (const s of selects) {
    const opts = [...s.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m => [m[1], textOf(m[2])]);
    eq(opts, [['', 'Choose a part'], ['1(a)', EXPECTED[0]], ['1(b)', EXPECTED[1]], ['2', EXPECTED[2]]], 'options');
  }
});
check('once chosen, a line under the dropdown shows the part and title, and nothing else', () => {
  const lines = [...html.matchAll(/<p[^>]*data-part-title[^>]*>([\s\S]*?)<\/p>/g)].map(m => textOf(m[1]));
  eq(lines, [EXPECTED[0], EXPECTED[2], EXPECTED[2]], 'the chosen-part lines (photos 1 to 3; photo 4 has no part)');
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
check('the whole long title is in the line, the dropdown and the description: nothing is cut', () => {
  const full = `Problem 1, part (a): ${LONG}`;
  assert(longHtml.includes(`data-part-title="">${full}</p>`) || textOf(longHtml).includes(full), 'the line does not carry the whole title');
  assert(longHtml.includes(`>${full}</option>`), 'the option does not carry the whole title');
  assert(longHtml.includes(`alt="Photo 1, ${full}"`), 'the description does not carry the whole title');
});
check('the line is allowed to wrap: no truncate, ellipsis, nowrap, clamp or hidden overflow', () => {
  const cls = (longHtml.match(/<p class="([^"]*)" data-part-title/) ?? [])[1];
  assert(cls !== undefined, 'no chosen-part line');
  assert(/\bbreak-words\b/.test(cls), `the line does not wrap long words: ${cls}`);
  assert(!/\b(truncate|text-ellipsis|whitespace-nowrap|line-clamp-\d+|overflow-hidden|overflow-x-hidden)\b/.test(cls), `the line can cut: ${cls}`);
});

cleanup();
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
