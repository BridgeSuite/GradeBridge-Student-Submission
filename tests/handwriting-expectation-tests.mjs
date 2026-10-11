// =====================================================
// The assignment carries a handwriting expectation, or it carries nothing
// =====================================================
// `WORKORDER_SS_SUBMISSION_RULE_PER_ASSIGNMENT_2026-10-10`, as revised the
// evening of 10 October (the earlier revision, a default rule with a
// permissive alternative, is withdrawn).
//
//   node tests/handwriting-expectation-tests.mjs
//
//   1. `handwritingExpected: true` shows the appendix wording before any page
//      is added, and still after pages are added.
//   2. Absent, `false` or malformed shows nothing on the subject.
//   3. The decision reads the field and nothing else: not the course, the
//      title or the id.
//   4. The wording never blocks anything.
//   5. The wording is the appendix verbatim. It is copied into this file
//      independently, so a reworded string in the app fails here rather than
//      agreeing with itself.
//   6. No string a student sees says "answer page" or "answer sheet"; it is
//      "answer template".
//
// Phone width is measured in a real browser by
// `tests/handwriting-expectation-browser.mjs`, which is part of `npm test`.
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

console.log('\nhandwriting expectation — stated when the assignment says so, otherwise nothing\n');

// The work order's appendix, verbatim, joined where the markdown wrapped.
export const APPENDIX = [
  'Answers must be handwritten, either on paper or written with a stylus on a tablet. Typed or ' +
  'electronically generated text is not accepted, including a photograph or screenshot of typed ' +
  'text, whatever produced it.',
  'Where an assignment asks for a computer-generated plot, a simulation result or a code listing, ' +
  'include it as the assignment directs. This rule is about your worked solution, not about ' +
  'figures: the reasoning and working around them must be in your hand.',
];

const H = await loadModule('services/handwritingExpectation.ts', 'handwriting_expectation.mjs');

// =====================================================
// 1. The wording
// =====================================================
check('the wording is the appendix verbatim, two paragraphs', () => {
  assert(JSON.stringify(H.HANDWRITING_EXPECTATION_WORDING) === JSON.stringify(APPENDIX),
    `got ${JSON.stringify(H.HANDWRITING_EXPECTATION_WORDING)}`);
});
check('the service exports one wording and no alternative', () => {
  const wordings = Object.entries(H).filter(([, v]) => typeof v === 'string' || Array.isArray(v) ||
    (v && typeof v === 'object'));
  assert(wordings.length === 1, `exports ${wordings.map(([k]) => k).join(', ')}`);
});

// =====================================================
// 2. The decision
// =====================================================
const base = { id: 'a', courseCode: 'ENG17', title: 'Homework 1', inputMode: 'handwritten', preamble: '', problems: [] };
check('true states the expectation', () =>
  assert(H.handwritingExpectedFor({ ...base, handwritingExpected: true }) === true, 'not stated'));
check('no field is silence', () => assert(H.handwritingExpectedFor(base) === false, 'stated'));
check('false is silence', () =>
  assert(H.handwritingExpectedFor({ ...base, handwritingExpected: false }) === false, 'stated'));
check('only a literal true counts: "true", 1, "yes", null and {} are silence', () => {
  for (const v of ['true', 1, 'yes', null, {}]) {
    assert(H.handwritingExpectedFor({ ...base, handwritingExpected: v }) === false, `${JSON.stringify(v)} stated it`);
  }
});
check('no assignment at all is silence', () => {
  assert(H.handwritingExpectedFor(null) === false && H.handwritingExpectedFor(undefined) === false, 'stated');
});
check('the course, title and id are never read', () => {
  for (const a of [
    { ...base, courseCode: 'EEC130A' },
    { ...base, courseCode: 'EEC 130A', title: 'Homework 1 (handwritten only)', id: 'EEC130A_HW1' },
  ]) assert(H.handwritingExpectedFor(a) === false, `${a.courseCode} inferred an expectation`);
  assert(H.handwritingExpectedFor({ ...base, courseCode: 'EEC170', handwritingExpected: true }) === true,
    'a course overrode the field');
});

// =====================================================
// 3. Rendered, on both sheets, before and after pages
// =====================================================
const outDir = mkdtempSync(join(tmpdir(), 'gb-hwx-test-'));
const harnessFile = join(outDir, 'hwx-harness.mjs');
await build({
  stdin: {
    contents: `
      import * as React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import PageUploader from './components/PageUploader';
      import { handwritingExpectedFor } from './services/handwritingExpectation';
      const noop = () => {}, anoop = async () => {};
      const shared = { pages: [], pageUrls: {}, onAddPage: anoop, onReplacePage: anoop, onRemovePage: noop,
        onMovePage: noop, onRotatePage: anoop };
      export const renderFor = (assignment, props = {}) => renderToStaticMarkup(React.createElement(PageUploader,
        { ...shared, handwritingExpected: handwritingExpectedFor(assignment), ...props }));
      export const renderBare = (props = {}) => renderToStaticMarkup(React.createElement(PageUploader,
        { ...shared, ...props }));
    `,
    resolveDir: REPO, loader: 'tsx', sourcefile: 'hwx-harness.tsx',
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
const showsAll = (html) => APPENDIX.every(p => textOf(html).includes(p));
/** Any trace of the subject: the marker, either paragraph, or the word itself. */
const showsAny = (html) => /data-handwriting-expectation/.test(html) ||
  APPENDIX.some(p => textOf(html).includes(p)) || /handwrit/i.test(textOf(html));

const PAGES = [{ id: 'pg0', file: 'page_1.jpg', width: 1650, height: 2200, bytes: 5000,
  registration: { status: 'ok', k: 2, n: 3 } }];
for (const [sheet, props] of [['printed sheet', {}], ['generic sheet', { genericSheet: true }]]) {
  for (const [when, extra] of [['before any page', {}], ['with a page added', { pages: PAGES, pageUrls: { pg0: 'blob:x' } }]]) {
    check(`${sheet}, ${when}, field true: the wording, whole`, () => {
      const html = renderFor({ ...base, handwritingExpected: true }, { ...props, ...extra });
      assert(showsAll(html), 'wording missing or altered');
    });
    check(`${sheet}, ${when}, no field: nothing on the subject`, () => {
      assert(!showsAny(renderFor(base, { ...props, ...extra })), 'something was shown');
    });
    check(`${sheet}, ${when}, field false: nothing on the subject`, () => {
      assert(!showsAny(renderFor({ ...base, handwritingExpected: false }, { ...props, ...extra })), 'something was shown');
    });
  }
}
// The breakage pass found a softened line ("Check your assignment...") slipping
// past every behavioural check above, because it never says "handwrit". So
// compare the whole render: silence means the field-absent page is exactly the
// field-set page with the notice taken out, and nothing else differs.
const withoutNotice = (html) => html.replace(/<div[^>]*data-handwriting-expectation[^>]*>[\s\S]*?<\/p><\/div><\/div>/, '');
for (const [sheet, props] of [['printed sheet', {}], ['generic sheet', { genericSheet: true }]]) {
  check(`${sheet}: with the field absent or false, the page differs from the stated one by the notice and nothing else`, () => {
    const stated = renderFor({ ...base, handwritingExpected: true }, props);
    const removed = withoutNotice(stated);
    assert(removed !== stated, 'the notice could not be found to remove');
    for (const a of [base, { ...base, handwritingExpected: false }, { ...base, handwritingExpected: 'true' }]) {
      const silent = renderFor(a, props);
      assert(silent === removed, `field ${JSON.stringify(a.handwritingExpected)}: the page has something else in it ` +
        `(${silent.length} chars against ${removed.length})`);
    }
  });
}
check('a caller that passes nothing shows nothing', () => assert(!showsAny(renderBare()), 'something was shown'));
check('the wording comes before the controls that add a page', () => {
  const html = renderFor({ ...base, handwritingExpected: true });
  const at = html.indexOf('data-handwriting-expectation');
  const firstInput = html.indexOf('<input');
  assert(at >= 0 && firstInput >= 0 && at < firstInput, `notice at ${at}, first file input at ${firstInput}`);
});
check('exactly one notice is rendered', () => {
  const n = (renderFor({ ...base, handwritingExpected: true }).match(/data-handwriting-expectation/g) ?? []).length;
  assert(n === 1, `${n} notices`);
});

// =====================================================
// 4. Never blocks; wired from the field
// =====================================================
/** Comments stripped, so a check reads the code and not the explanation of it. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const SERVICE = codeOnly(readFileSync(join(REPO, 'services/handwritingExpectation.ts'), 'utf8'));
const UPLOADER = codeOnly(readFileSync(join(REPO, 'components/PageUploader.tsx'), 'utf8'));
const NOTICE = codeOnly(readFileSync(join(REPO, 'components/HandwritingExpectationNotice.tsx'), 'utf8'));
const APP = codeOnly(readFileSync(join(REPO, 'App.tsx'), 'utf8'));
check('the decision function reads no assignment field but the one', () => {
  const fn = SERVICE.slice(SERVICE.indexOf('export const handwritingExpectedFor'));
  for (const f of ['courseCode', 'title', '.id', 'inputMode', 'sheet']) assert(!fn.includes(f), `reads ${f}`);
  assert(fn.includes('handwritingExpected === true'), 'does not test the field for a literal true');
});
check('the expectation reaches nothing in the uploader but the notice: no upload path reads it', () => {
  const body = UPLOADER.replace(/^import .*$/gm, '');
  const uses = body.match(/\bhandwritingExpected\b/g) ?? [];
  // the prop declaration, the destructuring default, and the one render condition.
  assert(uses.length === 3, `${uses.length} uses of handwritingExpected in PageUploader`);
  assert(/\{handwritingExpected === true && <HandwritingExpectationNotice \/>\}/.test(UPLOADER),
    'the notice is not rendered from the prop alone');
});
check('the notice has no control: nothing to click, disable or refuse', () => {
  assert(!/onClick|disabled|<button|<input|onChange/.test(NOTICE), 'the notice carries a control');
});
check('App passes the expectation from the assignment field, and names no course', () => {
  assert(/handwritingExpected=\{handwritingExpectedFor\(state\.assignment\)\}/.test(APP),
    'App does not pass handwritingExpectedFor(state.assignment)');
  assert(!/EEC\s*1[37]0|ENG\s*17/i.test(SERVICE + NOTICE + UPLOADER), 'a course is named in the code');
});

// =====================================================
// 5. "answer template", not "answer page" or "answer sheet"
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
check('no string literal or JSX text in the app says "answer page" or "answer sheet"', () => {
  const hits = [];
  for (const file of sources) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      let text = null;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
      else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
      else if (node.kind === ts.SyntaxKind.JsxText) text = node.getText(sf);
      if (text && /answer[\s-]+(page|sheet)s?\b/i.test(text)) hits.push(`${relative(REPO, file)}: ${text.trim().slice(0, 80)}`);
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
