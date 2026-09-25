// =====================================================
// The app never tells a student which platform to submit to
// =====================================================
// `workorders/INSTRUCTION_SS_PLATFORM_NEUTRAL_WORDING_2026-09-21.md`.
//
//   node tests/platform-neutral-tests.mjs
//
// A tester's iPhone test found the app telling students to "upload the ZIP to
// Gradescope" under a button reading "Download for Gradescope". ENG17 and
// EEC130A students upload to Canvas, which hands the file on; other courses
// will submit somewhere else again. Andre, 2026-09-21: **student-facing text
// must not name any submission platform.** The instructor says where; the app
// says "as your instructor has told you to".
//
// **No list of approved strings is kept here**, because a list only checks the
// strings someone remembered. Three sweeps instead, each over everything:
//
//   1. every string literal, template piece and JSX text node in the app's
//      source, found by the TypeScript parser (comments and identifiers such as
//      `handleDownloadForGradescope` are not text and are not flagged);
//   2. the text the real React server renderer produces for the components a
//      student sees before loading anything;
//   3. the built bundle, when `dist/` exists: any "Gradescope" that is not part
//      of an identifier.
//
// The one hand-kept thing is the approved `pi-1` wording, which must not move.
// =====================================================

import { build } from 'esbuild';
import ts from 'typescript';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0, skipped = 0;
const results = [];
const check = (name, fn) => {
  try { fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const skip = (name, why) => { skipped++; results.push(`  SKIP  ${name} (${why})`); };
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/**
 * A submission platform named in text. Capitalised on purpose for the ones that
 * are also ordinary words: `canvas` is an HTML element this app creates by the
 * dozen, and "Canvas" in a sentence is the LMS.
 */
const PLATFORM = /gradescope|\bCanvas\b|\bBlackboard\b|\bMoodle\b|\bBrightspace\b|\bD2L\b|\bSakai\b|\bSchoology\b/i;
const PLATFORM_CASED = (s) => /gradescope/i.test(s) ||
  /\b(Canvas|Blackboard|Moodle|Brightspace|D2L|Sakai|Schoology)\b/.test(s);

console.log('\nplatform-neutral wording — no student text names a submission platform\n');

// =====================================================
// 1. Every literal in the app's source
// =====================================================
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests', 'vendor', 'scripts', '.git', 'docs', 'public']);
const sources = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue; }
    if (/\.(tsx?|mts)$/.test(name) && !name.endsWith('.d.ts')) sources.push(p);
  }
};
walk(REPO);

const textOf = (file) => {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    else if (node.kind === ts.SyntaxKind.JsxText) text = node.getText(sf);
    if (text !== null && PLATFORM_CASED(text)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      found.push(`${relative(REPO, file)}:${line + 1}  ${JSON.stringify(text.trim().slice(0, 90))}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
};

const literalHits = sources.flatMap(textOf);
check(`no string, template or JSX text in ${sources.length} source files names a platform`, () =>
  assert(literalHits.length === 0, `\n          ${literalHits.join('\n          ')}`));

check('the sweep can see a platform name when one is there (the regex is not dead)', () => {
  const probe = ts.createSourceFile('p.tsx', 'const a = <b>Upload it to Gradescope</b>; const c = `to Canvas ${x}`;',
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits = [];
  const v = (n) => {
    if (n.kind === ts.SyntaxKind.JsxText && PLATFORM_CASED(n.getText(probe))) hits.push('jsx');
    if (ts.isTemplateHead(n) && PLATFORM_CASED(n.text)) hits.push('template');
    ts.forEachChild(n, v);
  };
  v(probe);
  assert(hits.length === 2, `the probe found ${hits.join(',') || 'nothing'}`);
});

// -----------------------------------------------------
// 1b. No student text assumes a grader exists
// -----------------------------------------------------
// Andre, 2026-09-25: EEC130A students submit reader work and conventional
// homework through this same app, and the app cannot tell the two apart, so no
// student-facing sentence may assume a grader. Same sweep as above, over every
// literal in the app, not one file: genericWording.ts was already clean and the
// ones that slipped were in the components.
const GRADER = /\bgraders?\b/i;
const norm = (s) => s.trim().replace(/\s+/g, ' ');
const graderHits = sources.flatMap((file) => {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    else if (node.kind === ts.SyntaxKind.JsxText) text = node.getText(sf);
    if (text !== null && GRADER.test(text)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      found.push({ file: relative(REPO, file).replace(/\\/g, '/'), line: line + 1, text: norm(text) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
});

/**
 * Printed-sheet sentences that still say "grader", sent to Andre on 2026-09-25
 * with proposed replacements. Nothing uses that path this quarter. **This list
 * may only shrink:** each entry must still be in the source, so replacing a
 * sentence fails here until its entry is deleted, and nothing new may join.
 */
const AWAITING_APPROVAL = [
  ['App.tsx', 'for you, and your grader will get whole pages instead of answers.'],
  ['components/CropReview.tsx', 'This is exactly what your grader will see — one picture per part, cut from your pages. If a picture is wrong, cut off or missing, fix it here.'],
  ['components/CropReview.tsx', ', as your grader will see it'],
  ['components/CropReview.tsx', 'You photographed this answer yourself, so it was not cut from the printed sheet. That is fine — it goes to your grader exactly as it is here.'],
  ['components/CropReview.tsx', 'stop you submitting. The flag goes to your grader with the picture, so they know you were not happy with it.'],
];
const awaiting = (h) => AWAITING_APPROVAL.some(([f, t]) => f === h.file && t === h.text);
const newGraderHits = graderHits.filter(h => !awaiting(h));
check(`no string, template or JSX text in ${sources.length} source files assumes a grader`, () =>
  assert(newGraderHits.length === 0,
    `\n          ${newGraderHits.map(h => `${h.file}:${h.line}  ${JSON.stringify(h.text.slice(0, 90))}`).join('\n          ')}`));
check(`every sentence awaiting approval is still there (${AWAITING_APPROVAL.length}; the list only shrinks)`, () => {
  const gone = AWAITING_APPROVAL.filter(([f, t]) => !graderHits.some(h => h.file === f && h.text === t));
  assert(gone.length === 0, `replaced, so delete from AWAITING_APPROVAL: ${gone.map(([f, t]) => `${f} ${JSON.stringify(t.slice(0, 50))}`).join('; ')}`);
});
check('the generic path is not waiting on anything: no pending sentence is in a generic-sheet file', () =>
  assert(!AWAITING_APPROVAL.some(([f]) => /generic/i.test(f)), 'a generic-sheet file is on the pending list'));

check('identifiers are not text: handleDownloadForGradescope is still allowed to exist', () =>
  assert(/handleDownloadForGradescope/.test(readFileSync(join(REPO, 'App.tsx'), 'utf8')),
    'the identifier is gone; this check is meant to prove the sweep ignores identifiers'));

// =====================================================
// 2. What the real renderer puts on screen
// =====================================================
const outDir = mkdtempSync(join(tmpdir(), 'gb-neutral-test-'));
const harness = join(outDir, 'render.mjs');
await build({
  stdin: {
    contents: `
      import * as React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { PrivacyNotice } from './components/PrivacyNotice';
      import SubmissionWidget from './components/SubmissionWidget';
      import Sidebar from './components/Sidebar';
      import { SUBMISSION_TYPES } from './constants';
      const noop = () => {};
      export const render = () => {
        const out = { PrivacyNotice: renderToStaticMarkup(React.createElement(PrivacyNotice, { onAccept: noop })) };
        for (const t of Object.values(SUBMISSION_TYPES)) {
          out['SubmissionWidget:' + t] = renderToStaticMarkup(React.createElement(SubmissionWidget,
            { type: t, id: 'p0_s0', maxImages: 2, data: {}, onChange: noop }));
        }
        out.Sidebar = renderToStaticMarkup(React.createElement(Sidebar, {
          state: { assignment: null, submissionData: {}, viewMode: 'edit', pages: [], crops: {}, layout: null },
          onLoadAssignment: noop, onLoadDemo: noop, onLoadWork: noop, onExportWork: noop,
          onClearWork: noop, onToggleView: noop, onDownloadForGradescope: noop, statusMessage: '' }));
        return out;
      };
    `,
    resolveDir: REPO, loader: 'tsx', sourcefile: 'render.tsx',
  },
  outfile: harness, format: 'esm', platform: 'node', target: 'es2022', bundle: true,
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  // heic2any touches `window` as it loads; only image upload uses it, never rendering.
  plugins: [{ name: 'stub-heic2any', setup(b) {
    b.onResolve({ filter: /^heic2any$/ }, () => ({ path: 'heic2any', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default () => null;', loader: 'js' }));
  } }],
  logLevel: 'silent',
});
let rendered = null;
try { rendered = (await import(pathToFileURL(harness).href)).render(); }
catch (err) { failed++; results.push(`  FAIL  the components render in Node\n          ${err.message}`); }

if (rendered) {
  const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  for (const [name, html] of Object.entries(rendered)) {
    check(`rendered ${name} names no platform`, () => {
      const text = visible(html);
      assert(!PLATFORM_CASED(text), (text.match(new RegExp(`.{0,60}${PLATFORM.source}.{0,60}`, 'i')) ?? [text.slice(0, 120)])[0]);
    });
  }
  check('the privacy notice says to submit as instructed', () =>
    assert(/submit it as your instructor has told you to/.test(visible(rendered.PrivacyNotice)),
      'the replacement wording is not on the notice'));
}

// =====================================================
// 3. The built bundle, when there is one
// =====================================================
const assets = join(REPO, 'dist', 'assets');
if (existsSync(assets)) {
  const bundles = readdirSync(assets).filter(n => /\.js$/.test(n));
  for (const name of bundles) {
    const js = readFileSync(join(assets, name), 'utf8');
    // A match preceded by an identifier character is part of an identifier
    // (`onDownloadForGradescope`), which minification keeps for property names
    // and which no student ever reads.
    const hits = [...js.matchAll(/gradescope/gi)].filter(m => !/[A-Za-z0-9_$]/.test(js[m.index - 1] ?? ''));
    check(`dist/assets/${name}: "Gradescope" appears only inside identifiers`, () =>
      assert(hits.length === 0, hits.slice(0, 3).map(m => JSON.stringify(js.slice(m.index - 50, m.index + 40))).join('\n          ')));
  }
} else {
  skip('the built bundle names no platform', 'dist/ is not built — run `npm run build`');
}

// =====================================================
// 4. The approved pi-1 wording has not moved
// =====================================================
check('the pi-1 statement, guidance and version are byte-identical to the approved text', () => {
  const src = readFileSync(join(REPO, 'services', 'personalInfo.ts'), 'utf8');
  for (const s of [
    "export const PERSONAL_INFO_WORDING_VERSION = 'pi-1';",
    "'I have looked at every answer above. None of them shows my name, my student ID, ' +\n  'my email address, or anyone else’s.';",
    "'If one does, retake that answer before submitting. Your instructor knows who you are ' +\n  'from your login; your answers never need to say it.';",
  ]) assert(src.includes(s), `changed: ${s.slice(0, 70)}`);
});
check('the untick message and the "One check before you download" panel are unchanged', () => {
  const box = readFileSync(join(REPO, 'components', 'PersonalInfoConfirmation.tsx'), 'utf8');
  const panel = readFileSync(join(REPO, 'components', 'PersonalInfoRequired.tsx'), 'utf8');
  assert(box.includes('An answer changed after you ticked this box, so it is unticked again. Look at your\n        answers once more, then tick it.'), 'the untick message moved');
  assert(panel.includes('One check before you download'), 'the panel heading moved');
  assert(panel.includes('Nothing was downloaded yet. Below your answers there is a box confirming that none of\n            them shows your name, student ID or email address. Tick it, then press Download again.'), 'the panel text moved');
});

console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
rmSync(outDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
