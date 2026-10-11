// =====================================================
// Handwritten is the default, and an assignment says when it is not
// =====================================================
// `WORKORDER_SS_SUBMISSION_RULE_PER_ASSIGNMENT_2026-10-10`, which supersedes
// `WORKORDER_SS_HANDWRITTEN_RULE_IN_APP_2026-10-10`.
//
//   node tests/submission-rule-tests.mjs
//
//   1. No field (or `false`) shows the handwritten wording before any page is
//      added; `nonHandwrittenAccepted: true` shows the permissive wording
//      instead. Never both, never neither.
//   2. The decision reads the field and nothing else: not the course, the
//      title or the id, and only a literal `true` lifts the rule.
//   3. Neither wording blocks anything.
//   4. The two wordings are rule 10 verbatim. They are copied into this file
//      independently from the work order's appendix, so a reworded string in
//      the app fails here rather than agreeing with itself.
//   5. No string a student sees says "answer page"; it is "answer template".
// =====================================================

import { build } from 'esbuild';
import ts from 'typescript';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadModule } from './captureSet.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
const results = [];
const check = (name, fn) => {
  try { fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\nsubmission rule — handwritten by default, lifted only by the assignment\n');

// The work order's appendix, verbatim, joined where the markdown wrapped.
const RULE_10_DEFAULT = [
  'Answers must be handwritten, either on paper or written with a stylus on a tablet. Typed or ' +
  'electronically generated text is not accepted, including a photograph or screenshot of typed ' +
  'text, whatever produced it.',
  'Where an assignment asks for a computer-generated plot, a simulation result or a code listing, ' +
  'include it as the assignment directs. This rule is about your worked solution, not about ' +
  'figures: the reasoning and working around them must be in your hand.',
];
const RULE_10_PERMISSIVE = [
  'Non-handwritten answers are accepted for this assignment. You may typeset your work or produce ' +
  'it any way you choose.',
];

const R = await loadModule('services/submissionRule.ts', 'submission_rule.mjs');

// =====================================================
// 1. The wordings
// =====================================================
check('the default wording is rule 10 verbatim, two paragraphs', () => {
  assert(JSON.stringify(R.SUBMISSION_RULE_WORDING.handwritten) === JSON.stringify(RULE_10_DEFAULT),
    `got ${JSON.stringify(R.SUBMISSION_RULE_WORDING.handwritten)}`);
});
check('the permissive wording is rule 10 verbatim, one paragraph', () => {
  assert(JSON.stringify(R.SUBMISSION_RULE_WORDING.nonHandwrittenAccepted) === JSON.stringify(RULE_10_PERMISSIVE),
    `got ${JSON.stringify(R.SUBMISSION_RULE_WORDING.nonHandwrittenAccepted)}`);
});

// =====================================================
// 2. The decision
// =====================================================
const base = { id: 'a', courseCode: 'ENG17', title: 'Homework 1', inputMode: 'handwritten', preamble: '', problems: [] };
check('no field is the default: handwritten', () =>
  assert(R.submissionRuleFor(base) === 'handwritten', R.submissionRuleFor(base)));
check('false is the default: handwritten', () =>
  assert(R.submissionRuleFor({ ...base, nonHandwrittenAccepted: false }) === 'handwritten', 'not handwritten'));
check('true lifts the rule', () =>
  assert(R.submissionRuleFor({ ...base, nonHandwrittenAccepted: true }) === 'nonHandwrittenAccepted', 'not lifted'));
check('only a literal true lifts it: "true", 1, "yes" and null all take the default', () => {
  for (const v of ['true', 1, 'yes', null, {}]) {
    assert(R.submissionRuleFor({ ...base, nonHandwrittenAccepted: v }) === 'handwritten', `${JSON.stringify(v)} lifted the rule`);
  }
});
check('no assignment at all takes the default', () => {
  assert(R.submissionRuleFor(null) === 'handwritten' && R.submissionRuleFor(undefined) === 'handwritten', 'not default');
});
check('the course, title and id are never read: an EEC 170 assignment without the field is handwritten', () => {
  for (const a of [
    { ...base, courseCode: 'EEC170' },
    { ...base, courseCode: 'EEC 170', title: 'EEC 170 Homework 1 (typeset welcome)', id: 'EEC170_HW1' },
  ]) assert(R.submissionRuleFor(a) === 'handwritten', `${a.courseCode} inferred the exception`);
  for (const a of [{ ...base, courseCode: 'ENG17', nonHandwrittenAccepted: true }]) {
    assert(R.submissionRuleFor(a) === 'nonHandwrittenAccepted', 'a course without the exception ignored the field');
  }
});

/** Comments stripped, so a check reads the code and not the explanation of it. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const SERVICE = codeOnly(readFileSync(join(REPO, 'services/submissionRule.ts'), 'utf8'));
check('the decision function names no assignment field but the one', () => {
  const fn = SERVICE.slice(SERVICE.indexOf('export const submissionRuleFor'));
  for (const f of ['courseCode', 'title', '.id', 'inputMode', 'sheet']) {
    assert(!fn.includes(f), `submissionRuleFor reads ${f}`);
  }
  assert(fn.includes('nonHandwrittenAccepted === true'), 'does not test the field for a literal true');
});

// =====================================================
// 3. Rendered, before any page, on both sheets
// =====================================================
const outDir = mkdtempSync(join(tmpdir(), 'gb-rule-test-'));
const harnessFile = join(outDir, 'rule-harness.mjs');
await build({
  stdin: {
    contents: `
      import * as React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import PageUploader from './components/PageUploader';
      import { submissionRuleFor } from './services/submissionRule';
      const noop = () => {}, anoop = async () => {};
      export const renderFor = (assignment, props = {}) => renderToStaticMarkup(React.createElement(PageUploader,
        { pages: [], pageUrls: {}, onAddPage: anoop, onReplacePage: anoop, onRemovePage: noop,
          onMovePage: noop, onRotatePage: anoop, submissionRule: submissionRuleFor(assignment), ...props }));
      export const renderBare = (props = {}) => renderToStaticMarkup(React.createElement(PageUploader,
        { pages: [], pageUrls: {}, onAddPage: anoop, onReplacePage: anoop, onRemovePage: noop,
          onMovePage: noop, onRotatePage: anoop, ...props }));
    `,
    resolveDir: REPO, loader: 'tsx', sourcefile: 'rule-harness.tsx',
  },
  outfile: harnessFile, format: 'esm', platform: 'node', target: 'es2022', bundle: true, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  loader: { '.css': 'empty' },
  // heic2any touches `window` as it loads; only image upload uses it, never rendering.
  plugins: [{ name: 'stub-heic2any', setup(b) {
    b.onResolve({ filter: /^heic2any$/ }, () => ({ path: 'heic2any', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default () => null;', loader: 'js' }));
  } }],
  logLevel: 'silent',
});
const { renderFor, renderBare } = await import(pathToFileURL(harnessFile).href);
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const shows = (html, paragraphs) => paragraphs.every(p => textOf(html).includes(p));
const showsAnyOf = (html, paragraphs) => paragraphs.some(p => textOf(html).includes(p));

for (const [sheet, props] of [['printed sheet', {}], ['generic sheet', { genericSheet: true }]]) {
  check(`${sheet}, no field: the handwritten wording, whole, and not the permissive one`, () => {
    const html = renderFor(base, props);
    assert(shows(html, RULE_10_DEFAULT), 'default wording missing or altered');
    assert(!showsAnyOf(html, RULE_10_PERMISSIVE), 'permissive wording shown too');
  });
  check(`${sheet}, field false: the handwritten wording`, () => {
    const html = renderFor({ ...base, nonHandwrittenAccepted: false }, props);
    assert(shows(html, RULE_10_DEFAULT) && !showsAnyOf(html, RULE_10_PERMISSIVE), 'not the default alone');
  });
  check(`${sheet}, field true: the permissive wording, and none of the handwritten one`, () => {
    const html = renderFor({ ...base, nonHandwrittenAccepted: true }, props);
    assert(shows(html, RULE_10_PERMISSIVE), 'permissive wording missing or altered');
    assert(!showsAnyOf(html, RULE_10_DEFAULT), 'handwritten wording shown too');
  });
}
check('a caller that passes no rule still shows the default, never nothing', () => {
  const html = renderBare();
  assert(shows(html, RULE_10_DEFAULT) && !showsAnyOf(html, RULE_10_PERMISSIVE), 'not the default');
});
check('the wording comes before the controls that add a page', () => {
  for (const a of [base, { ...base, nonHandwrittenAccepted: true }]) {
    const html = renderFor(a);
    const at = html.indexOf('data-submission-rule=');
    const firstInput = html.indexOf('<input');
    assert(at >= 0 && firstInput >= 0 && at < firstInput, `notice at ${at}, first file input at ${firstInput}`);
  }
});
// A student who comes back to add a page, or retakes one, is still told.
check('the wording stays once pages are in, before and after any are added', () => {
  const pages = [{ id: 'pg0', file: 'page_1.jpg', width: 1650, height: 2200, bytes: 5000,
    registration: { status: 'ok', k: 2, n: 3 } }];
  const html = renderFor(base, { pages, pageUrls: { pg0: 'blob:x' } });
  assert(shows(html, RULE_10_DEFAULT), 'the rule disappears once a page is added');
});
check('exactly one notice is rendered', () => {
  for (const a of [base, { ...base, nonHandwrittenAccepted: true }]) {
    const n = (renderFor(a).match(/data-submission-rule=/g) ?? []).length;
    assert(n === 1, `${n} notices`);
  }
});

// =====================================================
// 4. Never blocks; wired from the field
// =====================================================
const UPLOADER = codeOnly(readFileSync(join(REPO, 'components/PageUploader.tsx'), 'utf8'));
const NOTICE = codeOnly(readFileSync(join(REPO, 'components/SubmissionRuleNotice.tsx'), 'utf8'));
const APP = codeOnly(readFileSync(join(REPO, 'App.tsx'), 'utf8'));
check('the rule reaches nothing in the uploader but the notice: no upload path reads it', () => {
  const body = UPLOADER.replace(/^import .*$/gm, '');
  const uses = body.match(/\bsubmissionRule\b/g) ?? [];
  // the prop declaration, the destructuring, and the one render.
  assert(uses.length === 3, `${uses.length} uses of submissionRule in PageUploader`);
  assert(/<SubmissionRuleNotice rule=\{submissionRule\} \/>/.test(UPLOADER), 'the notice is not rendered from the prop');
});
check('the notice has no control: nothing to click, disable or refuse', () => {
  assert(!/onClick|disabled|<button|<input|onChange/.test(NOTICE), 'the notice carries a control');
});
check('App passes the rule from the assignment field, with no course branch anywhere near it', () => {
  assert(/submissionRule=\{submissionRuleFor\(state\.assignment\)\}/.test(APP), 'App does not pass submissionRuleFor(state.assignment)');
  assert(!/EEC\s*170/i.test(APP + UPLOADER + NOTICE + SERVICE), 'a course is named in the code');
});

// =====================================================
// 5. "answer template", not "answer page", in anything a student sees
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
check('no string literal or JSX text in the app says "answer page"', () => {
  const hits = [];
  for (const file of sources) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      let text = null;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
      else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
      else if (node.kind === ts.SyntaxKind.JsxText) text = node.getText(sf);
      if (text && /answer\s+pages?\b/i.test(text)) hits.push(`${relative(REPO, file)}: ${text.trim().slice(0, 80)}`);
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  assert(hits.length === 0, hits.join(' | '));
});

// ---------- report ----------
rmSync(outDir, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
