// =====================================================
// The preview never tells a handwritten student their work is missing
// =====================================================
// `workorders/WORKORDER_SS_HANDWRITTEN_PREVIEW_2026-09-25.md`.
//
//   node tests/preview-tests.mjs
//
// `components/PrintView.tsx` is never given the photographs, so on a
// handwritten assignment it printed "No answer submitted." under every part,
// on the printed sheet and on the generic answer page alike. It now shows one
// approved note saying where the answers are (`services/previewWording.ts`).
//
// The electronic preview is held against a golden frozen at c89fe36, because
// on that path the preview is also the PDF: `html2canvas` rasterises it.
// =====================================================

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PREVIEW_GOLDEN_PATH, buildPreviewHarness, electronicRenders,
  electronicAssignment, electronicAnswers, printedAssignment, genericAssignment,
} from './previewFixtures.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
const results = [];
const check = (name, fn) => {
  try { fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\npreview — a handwritten student is told where their answers are, not that they are missing\n');

const { renderPreview, cleanup } = await buildPreviewHarness();
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// The approved text, spelled out here rather than imported, so a change to the
// wording file fails this check until the approval is recorded again.
const APPROVED = {
  0: 'You have not photographed any pages yet. This preview only shows typed answers, so your pages will not appear here.',
  1: 'Your answers are on the page you photographed. This preview only shows typed answers, so it cannot show yours.',
  3: 'Your answers are on the 3 pages you photographed. This preview only shows typed answers, so it cannot show yours.',
};

// =====================================================
// 1. Electronic: unchanged, byte for byte
// =====================================================
results.push('  1. the electronic preview, against the c89fe36 golden');
const golden = JSON.parse(readFileSync(PREVIEW_GOLDEN_PATH, 'utf8'));
check('the golden is the one frozen at c89fe36', () => assert(golden.builtAt === 'c89fe36', golden.builtAt));
const now = electronicRenders(renderPreview);
for (const name of Object.keys(golden.renders)) {
  check(`electronic "${name}" renders byte-identical to the golden`, () => {
    const a = now[name], e = golden.renders[name];
    if (a === e) return;
    let i = 0; while (a[i] === e[i]) i++;
    throw new Error(`differs at character ${i}\n          golden: ${JSON.stringify(e.slice(i - 30, i + 50))}\n          now:    ${JSON.stringify(a.slice(i - 30, i + 50))}`);
  });
}
check('an electronic part left blank still says "No answer submitted." (there it is true)', () =>
  assert((now.answered.match(/No answer submitted\./g) ?? []).length === 1, 'the unanswered electronic part lost its line'));
check('an electronic assignment is never shown the handwritten note', () =>
  assert(!/photographed/.test(textOf(now.answered)) && !/photographed/.test(textOf(now.unanswered)), 'handwritten note on electronic'));

// =====================================================
// 2. Handwritten: never "No answer submitted.", on either sheet
// =====================================================
results.push('  2. the handwritten preview, printed sheet and generic page');
for (const [sheet, assignment] of [['printed sheet', printedAssignment], ['generic page', genericAssignment]]) {
  for (const n of [0, 1, 3]) {
    // A handwritten assignment can still carry typed-answer state (a file
    // loaded over an old session), so the render is given some: it must not
    // matter.
    for (const [label, data] of [['no answer state', {}], ['stale typed state', electronicAnswers]]) {
      const t = textOf(renderPreview({ assignment, submissionData: data, handwrittenPageCount: n }));
      check(`${sheet}, ${n} page(s), ${label}: no "No answer submitted." and the approved note`, () => {
        assert(!/No answer submitted/.test(t), 'says "No answer submitted."');
        assert(!/No image submitted/.test(t), 'says "No image submitted"');
        assert(t.includes(APPROVED[n]), `note missing or changed:\n          ${t}`);
        assert(t.includes(assignment.courseCode) && t.includes(assignment.title), 'course or title missing');
      });
    }
  }
}

// =====================================================
// 3. The wording: approved, short, and claims nothing it cannot know
// =====================================================
results.push('  3. the wording');
const note = (n) => textOf(renderPreview({ assignment: printedAssignment, submissionData: {}, handwrittenPageCount: n }));
check('any count above one uses the plural with the number', () =>
  assert(note(7).includes('Your answers are on the 7 pages you photographed.'), note(7)));
check('the singular drops the numeral: "the page", never "the 1 page"', () =>
  assert(!/\b1 page\b/.test(note(1)) && note(1).includes('on the page you photographed'), note(1)));
check('no version claims the submission is complete or correct (the completeness gate says that)', () => {
  for (const n of [0, 1, 3]) {
    const s = APPROVED[n];
    assert(!/complete|correct|nothing (is )?missing|in your submission|all your|everything/i.test(s), `claims too much: ${s}`);
  }
});
check('every version is two sentences', () => {
  for (const n of [0, 1, 3]) assert((APPROVED[n].match(/\.(\s|$)/g) ?? []).length === 2, APPROVED[n]);
});

// =====================================================
// 4. App gives every handwritten preview its page count, and only those
// =====================================================
results.push('  4. App wiring');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const APP = codeOnly(readFileSync(join(REPO, 'App.tsx'), 'utf8'));
check('App: the preview is told the page count on a handwritten assignment and nothing on an electronic one', () =>
  assert(/<PrintView[\s\S]{0,300}?handwrittenPageCount=\{isHandwritten \? state\.pages\.length : undefined\}/.test(APP),
    'PrintView is not given handwrittenPageCount from isHandwritten'));
check('App: "handwritten" covers the printed sheet and the generic page alike (inputMode, not sheet)', () =>
  assert(/const isHandwritten = state\.assignment\?\.inputMode === 'handwritten';/.test(APP), 'isHandwritten is not the inputMode test'));
check('App: there is exactly one PrintView, so no second preview escapes the branch', () =>
  assert((APP.match(/<PrintView\b/g) ?? []).length === 1, 'more than one PrintView'));
check('App: a handwritten submission still builds no PDF, so the preview is display only', () =>
  assert(/if \(!isHandwritten\) \{\s*const rendered = await buildPdfBytes/.test(APP), 'the PDF guard moved'));

cleanup();
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
