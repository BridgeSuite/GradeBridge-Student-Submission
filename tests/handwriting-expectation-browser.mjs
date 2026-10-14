// =====================================================
// The handwriting expectation at 390 pixels, in the real built app
// =====================================================
// `WORKORDER_SS_SUBMISSION_RULE_PER_ASSIGNMENT_2026-10-10` (revised), done-when
// 4: "The suite asserts the notice at 390 pixels wide: it renders, its text is
// not clipped, and the page has no horizontal overflow. This replaces the
// phone-width screenshot."
//
//   node tests/handwriting-expectation-browser.mjs
//
// **Part of `npm test`, on purpose, and that is a departure.** The other
// browser checks (`refusal-panel-browser.mjs` and friends) were kept out of CI
// as slow and fragile. This one is in because the work order asks for phone
// width to be checked on every build, and only a browser can measure layout.
// It is held to one build and one browser to keep it cheap.
//
// What it does: `vite build` of the repository into a temporary directory,
// served by a few lines of `node:http`; headless Chrome over the DevTools
// protocol at 390 x 844 with phone emulation; the generic-sheet sample loaded
// twice, once with `handwritingExpected: true` and once without the field.
// Each is measured before any page is added and again after a real page (the
// GBGEN1 sheet at 300 dpi) has been added.
//
// **A missing Chrome FAILS, by name.** A browser check that skips when it
// cannot find a browser is green over nothing, and would be green in CI the
// day the runner image changed. `CHROME_PATH` overrides the default location.
// =====================================================

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { build as viteBuild } from 'vite';
import { loadModule } from './captureSet.mjs';

globalThis.crypto ??= webcrypto;
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/GradeBridge-Student-Submission/';

// From the environment, never a literal drive path (tests/no-personal-names.mjs
// refuses those in tracked files).
const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? join(process.env.ProgramFiles ?? process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  : process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome');

let passed = 0, failed = 0;
const results = [];
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  results.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n          ${detail}`}`);
};
const finish = (code) => {
  console.log('\nhandwriting expectation — at 390 px, in the built app\n');
  console.log(results.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(code);
};

// The appendix, verbatim. Shared with the unit suite so the two cannot disagree.
const APPENDIX = [
  'Answers must be handwritten, either on paper or written with a stylus on a tablet. Typed or ' +
  'electronically generated text is not accepted, including a photograph or screenshot of typed ' +
  'text, whatever produced it.',
  'Where an assignment asks for a computer-generated plot, a simulation result or a code listing, ' +
  'include it as the assignment directs. This rule is about your worked solution, not about ' +
  'figures: the reasoning and working around them must be in your hand.',
];

const isPathChrome = !/[\\/]/.test(CHROME);
if (!isPathChrome && !existsSync(CHROME)) {
  check('Chrome is available to measure the page', false,
    `no Chrome at ${CHROME}. Install Chrome or set CHROME_PATH; this check does not skip.`);
  finish(1);
}

const work = mkdtempSync(join(tmpdir(), 'gb-hwx-browser-'));
const outDir = join(work, 'dist');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let server = null, proc = null, ws = null, profile = null;

try {
  // ---- the real app, built ----
  await viteBuild({ root: REPO, configFile: join(REPO, 'vite.config.ts'), logLevel: 'silent',
    build: { outDir, emptyOutDir: true } });

  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
  server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (!url.startsWith(BASE)) { res.writeHead(404).end(); return; }
    let file = normalize(join(outDir, url.slice(BASE.length)));
    if (!file.startsWith(outDir + sep) && file !== outDir) { res.writeHead(403).end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(outDir, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const APP_URL = `http://127.0.0.1:${server.address().port}${BASE}`;

  // ---- the two assignment files ----
  const cryptoSvc = await loadModule('cryptoService.ts', 'hwx_browser_crypto.mjs');
  const fixture = readFileSync(join(REPO, 'tests', 'fixtures', 'generic_sheet_sample.json'), 'utf8').trim();
  const { handwritingExpected: _drop, ...spec } = await cryptoSvc.decryptJson(fixture);
  const WITH_FIELD = join(work, 'with_field.json');
  const WITHOUT_FIELD = join(work, 'without_field.json');
  writeFileSync(WITH_FIELD, JSON.stringify({ ...spec, handwritingExpected: true }));
  writeFileSync(WITHOUT_FIELD, JSON.stringify(spec));
  const PAGE = join(REPO, 'tests', 'fixtures', 'GradeBridge_answer_page_GBGEN1_300dpi.png');

  // ---- Chrome over the DevTools protocol ----
  profile = mkdtempSync(join(tmpdir(), 'gb-hwx-profile-'));
  const port = 9500 + Math.floor(Math.random() * 400);
  const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu'];
  // Hosted Linux runners restrict the user namespaces Chrome's sandbox needs.
  if (process.platform === 'linux') flags.push('--no-sandbox');
  proc = spawn(CHROME, [...flags, 'about:blank'], { stdio: 'ignore' });
  let spawnError = null;
  proc.on('error', (e) => { spawnError = e; });
  let targets = [];
  for (let i = 0; i < 100 && !spawnError && !targets.some(t => t.type === 'page'); i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {}
    await sleep(200);
  }
  const page = targets.find(t => t.type === 'page');
  if (!page) {
    check('Chrome is available to measure the page', false,
      `${CHROME} ${spawnError ? `could not start: ${spawnError.message}` : 'never opened a page'}. ` +
      'Install Chrome or set CHROME_PATH; this check does not skip.');
    throw null;
  }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expr, what, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await evaluate(expr)) return; await sleep(200); }
    throw new Error(`timed out waiting for ${what}`);
  };
  const setFileOn = async (selectorExpr, path) => {
    const { root } = await send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' });
    const idx = await evaluate(`[...document.querySelectorAll('input[type=file]')].findIndex(${selectorExpr})`);
    if (idx < 0) throw new Error(`no file input matching ${selectorExpr}`);
    await send('DOM.setFileInputFiles', { nodeId: nodeIds[idx], files: [path] });
  };
  const ASSIGNMENT_INPUT = `i => /json/.test(i.accept) && /zip/.test(i.accept)`;
  const PAGE_INPUT = `i => /application\\/pdf/.test(i.accept) && i.multiple`;

  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  /**
   * Everything measured in the page, in one pass. "Clipped" is asked three
   * ways, because text can be lost three ways: an element whose content is
   * larger than its box (overflow hidden, nowrap, a fixed height); a paragraph
   * outside an ancestor that clips; and a paragraph outside the viewport.
   */
  const MEASURE = `(() => {
    const n = document.querySelectorAll('[data-handwriting-expectation]');
    const body = document.body.innerText;
    const out = { count: n.length, innerW: innerWidth,
      bodyHasWording: ${JSON.stringify(APPENDIX)}.map(p => body.replace(/\\s+/g, ' ').includes(p)),
      pages: (body.match(/(\\d+) pages? ·/) || [])[1] ?? null };
    const scrollers = [document.scrollingElement, document.body, document.getElementById('main-scroll')].filter(Boolean);
    // The photograph step's own words with the notice taken out. Silence means
    // the field-absent step says exactly what the field-set one says minus the
    // notice: nothing softened, nothing in its place.
    const section = document.querySelector('section[aria-labelledby="pages-heading"]');
    if (section) {
      const clone = section.cloneNode(true);
      clone.querySelectorAll('[data-handwriting-expectation]').forEach(e => e.remove());
      out.sectionRest = clone.textContent.replace(/\\s+/g, ' ').trim();
    }
    out.horizontal = scrollers.map(e => ({ el: e.id || e.tagName, over: e.scrollWidth - e.clientWidth }));
    // Named, so an overflow says what caused it rather than only that it happened.
    out.widest = [...document.querySelectorAll('body *')]
      .map(e => ({ e, right: e.getBoundingClientRect().right }))
      .filter(x => x.right > innerWidth + 0.5)
      .slice(0, 6)
      .map(x => x.e.tagName + '.' + String(x.e.className?.baseVal ?? x.e.className).slice(0, 60) + ' right=' + Math.round(x.right) +
        ' "' + (x.e.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 40) + '"');
    if (n.length !== 1) return out;
    const box = n[0];
    box.scrollIntoView({ block: 'start', behavior: 'instant' });
    const ps = [...box.querySelectorAll('p')];
    out.texts = ps.map(p => p.innerText.replace(/\\s+/g, ' ').trim());
    const r = (e) => e.getBoundingClientRect();
    out.overflowing = [box, ...box.querySelectorAll('*')]
      .filter(e => !(e instanceof SVGElement))
      .filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      .map(e => e.tagName + ' ' + (e.scrollWidth - e.clientWidth) + 'x' + (e.scrollHeight - e.clientHeight));
    out.clippedBy = [];
    for (const p of ps) {
      const pr = r(p);
      for (let a = p.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const ar = r(a);
        const scrollsY = /auto|scroll/.test(cs.overflowY);
        if (cs.overflowX !== 'visible' && (pr.left < ar.left - 1 || pr.right > ar.right + 1)) out.clippedBy.push('x:' + (a.id || a.tagName));
        if (cs.overflowY !== 'visible' && !scrollsY && (pr.top < ar.top - 1 || pr.bottom > ar.bottom + 1)) out.clippedBy.push('y:' + (a.id || a.tagName));
      }
    }
    const br = r(box);
    out.box = { left: Math.round(br.left), right: Math.round(br.right), width: Math.round(br.width), height: Math.round(br.height) };
    out.paragraphsInView = ps.every(p => { const pr = r(p); return pr.left >= 0 && pr.right <= innerWidth && pr.width > 0 && pr.height > 0; });
    return out;
  })()`;

  const loadAssignment = async (file) => {
    await send('Page.navigate', { url: APP_URL });
    await waitFor(`document.querySelectorAll('input[type=file]').length > 0`, 'the app');
    await evaluate(`[...document.querySelectorAll('button')].find(x => /I Understand/.test(x.innerText))?.click()`);
    await sleep(300);
    await setFileOn(ASSIGNMENT_INPUT, file);
    await waitFor(`/Your Pages/.test(document.body.innerText)`, 'the assignment to load');
    await sleep(300);
  };
  const addPage = async () => {
    await setFileOn(PAGE_INPUT, PAGE);
    await waitFor(`/\\b1 page ·/.test(document.body.innerText)`, 'the page to be added', 120000);
    // Settled, not merely counted: the "1 page" badge appears while the
    // "Processing page 1 of 1" banner is still up, and measuring then measures
    // the banner. (It overflows 390 px by 7 px on this fixture's long file
    // name; that is the banner's own defect, outside this check, and reported.)
    await waitFor(`!/Processing page \\d/.test(document.body.innerText)`, 'processing to finish', 120000);
    await sleep(300);
  };

  // ---- the field set ----
  const statedRest = {};
  await loadAssignment(WITH_FIELD);
  for (const when of ['before any page', 'after a page is added']) {
    if (when !== 'before any page') await addPage();
    const m = await evaluate(MEASURE);
    const where = `390 px, field set, ${when}`;
    if (when === 'before any page') check(`${where}: no page is in yet`, m.pages === '0', `pages: ${m.pages}`);
    else check(`${where}: the page is in`, m.pages === '1', `pages: ${m.pages}`);
    statedRest[when] = m.sectionRest;
    check(`${where}: the notice renders, once`, m.count === 1, `${m.count} notices`);
    if (m.count !== 1) continue;
    check(`${where}: its text is the appendix, both paragraphs`, JSON.stringify(m.texts) === JSON.stringify(APPENDIX),
      JSON.stringify(m.texts));
    check(`${where}: no element of the notice is larger than its box`, m.overflowing.length === 0, m.overflowing.join(', '));
    check(`${where}: no ancestor clips the text`, m.clippedBy.length === 0, m.clippedBy.join(', '));
    check(`${where}: both paragraphs lie inside the viewport`, m.paragraphsInView, JSON.stringify(m.box));
    check(`${where}: the notice is inside the viewport`, m.box.left >= 0 && m.box.right <= m.innerW, JSON.stringify(m.box));
    check(`${where}: no horizontal overflow on the page`, m.horizontal.every(h => h.over <= 0), JSON.stringify(m.horizontal) + " " + JSON.stringify(m.widest));
  }

  // ---- the field absent ----
  await loadAssignment(WITHOUT_FIELD);
  for (const when of ['before any page', 'after a page is added']) {
    if (when !== 'before any page') await addPage();
    const m = await evaluate(MEASURE);
    const where = `390 px, no field, ${when}`;
    check(`${where}: no notice`, m.count === 0, `${m.count} notices`);
    check(`${where}: neither paragraph appears anywhere on the page`, m.bodyHasWording.every(x => !x),
      JSON.stringify(m.bodyHasWording));
    check(`${where}: the photograph step says exactly what the stated one says, minus the notice`,
      typeof m.sectionRest === 'string' && m.sectionRest === statedRest[when],
      `absent: ${JSON.stringify(m.sectionRest?.slice(0, 160))} | stated without notice: ${JSON.stringify(statedRest[when]?.slice(0, 160))}`);
    check(`${where}: no horizontal overflow on the page`, m.horizontal.every(h => h.over <= 0), JSON.stringify(m.horizontal) + " " + JSON.stringify(m.widest));
  }
} catch (err) {
  if (err !== null) check('the browser run completed', false, err?.stack ?? String(err));
} finally {
  try { ws?.close(); } catch {}
  try { proc?.kill(); } catch {}
  await new Promise(r => server ? server.close(r) : r());
  await sleep(800);
  for (const d of [profile, work]) { try { if (d) rmSync(d, { recursive: true, force: true }); } catch {} }
}
finish(failed > 0 || passed === 0 ? 1 : 0);
