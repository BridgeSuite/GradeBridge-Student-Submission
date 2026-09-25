// =====================================================
// The load refusal panel, measured in a real browser — run before deploy
// =====================================================
// `WORKORDER_SS_NO_GRADER_STRINGS_AND_LOAD_ORDER_2026-09-25`, Supplements 3 and 4.
//
//   npx vite --port 3001            (in another terminal)
//   node tests/refusal-panel-browser.mjs [--layout-only] [--url http://localhost:3001/GradeBridge-Student-Submission/]
//
// **Not part of `npm test`, deliberately.** Whether a panel is on screen, and
// whether it was scrolled there, is a fact about layout, and only a browser can
// measure it. Supplement 1 kept headless Chrome out of CI as slow and fragile,
// so CI holds the wiring (`tests/load-refusal-tests.mjs`) and this measures
// the result, locally, before a deploy.
//
// Real files, the real app, headless Chrome with phone emulation, `alert`
// suppressed as a browser that has begun ignoring dialogs would. For each
// refusal, at 390 px and at desktop width: scroll DOWN first, load the refused
// file, then require the panel to be wholly on screen, carry the approved
// text, and clear when a good file is loaded.
//
// `--layout-only` loads a good file and records the shell's geometry, the
// before-and-after comparison for the root-layout change.
// =====================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { loadModule } from './captureSet.mjs';

globalThis.crypto ??= webcrypto;
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const LAYOUT_ONLY = args.includes('--layout-only');
const APP_URL = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:3001/GradeBridge-Student-Submission/';
/** `--screenshots <dir>`: also save what the student sees as each refusal appears. */
const SHOTS = args.includes('--screenshots') ? args[args.indexOf('--screenshots') + 1] : null;
// From the environment, never a literal drive path (tests/no-personal-names.mjs
// refuses those in tracked files). CHROME_PATH overrides.
const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? join(process.env.ProgramFiles ?? process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  : 'google-chrome');

const cryptoSvc = await loadModule('cryptoService.ts', 'rpb_crypto.mjs');
const refusalMod = LAYOUT_ONLY ? null : await loadModule('services/loadRefusal.ts', 'rpb_refusal.mjs');
const wording = await loadModule('services/genericWording.ts', 'rpb_wording.mjs');

// ---- the files ----
const work = mkdtempSync(join(tmpdir(), 'gb-refusal-browser-'));
const GENERIC_OK = join(work, 'generic_ok.json');
const GENERIC_NO_MAP = join(work, 'generic_no_map.json');
const PRINTED_NO_MAP = join(work, 'printed_no_map.json');
const fixture = readFileSync(join(HERE, 'fixtures', 'generic_sheet_sample.json'), 'utf8').trim();
writeFileSync(GENERIC_OK, fixture);
const { layoutCsv, layoutCsvName, ...genericNoMap } = await cryptoSvc.decryptJson(fixture);
writeFileSync(GENERIC_NO_MAP, JSON.stringify(genericNoMap));
writeFileSync(PRINTED_NO_MAP, JSON.stringify({
  id: 'ENG17HOM496F', courseCode: 'ENG17', title: 'Homework 1', inputMode: 'handwritten', preamble: '',
  problems: [{ id: 'p1', name: 'P1', description: '', subsections: [] }], createdAt: 0, updatedAt: 0,
}));

// ---- a small CDP client ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const openBrowser = async (port) => {
  const profile = mkdtempSync(join(tmpdir(), 'gb-refusal-profile-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 75 && !targets.some(t => t.type === 'page'); i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {}
    await sleep(200);
  }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const dialogs = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.type); send('Page.handleJavaScriptDialog', { accept: true }); }
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expr, what, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await evaluate(expr)) return; await sleep(200); }
    throw new Error(`timed out waiting for ${what}`);
  };
  const setFile = async (path) => {
    const { root } = await send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' });
    const idx = await evaluate(`[...document.querySelectorAll('input[type=file]')].findIndex(i => /json/.test(i.accept) && /zip/.test(i.accept))`);
    await send('DOM.setFileInputFiles', { nodeId: nodeIds[idx], files: [path] });
  };
  const close = async () => { ws.close(); proc.kill(); await sleep(800); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  return { send, evaluate, waitFor, setFile, close, dialogs };
};

const VIEWPORTS = [
  { name: 'phone 390x844', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  { name: 'desktop 1440x900', width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
];
const PANEL = `document.getElementById('load-refusal')`;
const SCROLL_ALL_DOWN = `(() => { const els = [document.scrollingElement, document.getElementById('main-scroll'), ...document.querySelectorAll('*')]
  .filter(e => e && e.scrollHeight > e.clientHeight + 4 && (e === document.scrollingElement || /auto|scroll/.test(getComputedStyle(e).overflowY)));
  // #main-scroll is scroll-smooth, where setting scrollTop starts an animation
  // and reads back 0; scroll instantly so the starting position is real.
  els.forEach(e => e.scrollTo({ top: e.scrollHeight, behavior: 'instant' })); return els.map(e => Math.round(e.scrollTop)).reduce((a, b) => a + b, 0); })()`;
const LAYOUT = `(() => { const sb = document.querySelector('#main-scroll')?.previousElementSibling; const m = document.getElementById('main-scroll');
  const r = (e) => e ? (({ top, height, width }) => ({ top: Math.round(top), height: Math.round(height), width: Math.round(width) }))(e.getBoundingClientRect()) : null;
  return { innerH: innerHeight, docScrollH: document.scrollingElement.scrollHeight, sidebar: r(sb), main: r(m),
    mainScrolls: m ? m.scrollHeight > m.clientHeight + 4 : null }; })()`;

let passed = 0, failed = 0; const results = []; const report = {};
const check = (name, ok, detail = '') => { ok ? passed++ : failed++; results.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n          ${detail}`}`); };
const flat = (s) => s.replace(/\s+/g, ' ').trim();

let port = 9400;
try {
  for (const vp of VIEWPORTS) {
    const b = await openBrowser(port++);
    try {
      await b.send('Page.enable'); await b.send('Runtime.enable'); await b.send('DOM.enable');
      // A browser that has begun ignoring dialogs: alert shows nothing and returns.
      await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.alert = () => {};' });
      await b.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile });
      if (vp.mobile) await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await b.send('Page.navigate', { url: APP_URL });
      await b.waitFor(`document.querySelectorAll('input[type=file]').length > 0`, 'the app', 60000);
      await b.evaluate(`[...document.querySelectorAll('button')].find(x => /I Understand/.test(x.innerText))?.click()`);
      await sleep(400);

      if (LAYOUT_ONLY) {
        await b.setFile(GENERIC_OK);
        await b.waitFor(`/Your Pages/.test(document.body.innerText)`, 'the generic file to load');
        report[vp.name] = await b.evaluate(LAYOUT);
        continue;
      }

      for (const [label, file, message] of [
        ['generic-page file, no map', GENERIC_NO_MAP, wording.GENERIC_WORDING.badGenericFile],
        ['printed-sheet file, no map', PRINTED_NO_MAP, refusalMod.PRINTED_NO_MAP_REFUSAL],
      ]) {
        const where = `${vp.name}, ${label}`;
        // A student part way down a loaded assignment: load a good file, so the
        // page is long enough to have been scrolled, then scroll to the bottom.
        await b.setFile(GENERIC_OK);
        await b.waitFor(`/Your Pages/.test(document.body.innerText)`, 'the good file to load');
        await sleep(300);
        const scrolled = await b.evaluate(SCROLL_ALL_DOWN);
        await b.setFile(file);
        let appeared = true;
        try { await b.waitFor(`!!${PANEL}`, 'the refusal panel', 15000); } catch { appeared = false; }
        await sleep(400);
        const m = appeared ? await b.evaluate(`(() => { const r = ${PANEL}.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
            innerW: innerWidth, innerH: innerHeight, text: ${PANEL}.innerText, docScrollW: document.scrollingElement.scrollWidth }; })()`) : null;
        report[where] = { scrolledBefore: scrolled, ...m, text: undefined };
        if (SHOTS && appeared) {
          const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
          const name = `${vp.width}px_${label.replace(/[^a-z]+/gi, '_').replace(/_+$/, '')}.png`;
          writeFileSync(join(SHOTS, name), Buffer.from(data, 'base64'));
          report[where].screenshot = name;
        }
        check(`${where}: started scrolled down (${scrolled} px), so the scroll-into-view is what is tested`, scrolled > 0);
        check(`${where}: the panel appears with the dialog suppressed`, appeared);
        if (m) {
          check(`${where}: the panel is wholly on screen without the student scrolling`,
            m.top >= 0 && m.bottom <= m.innerH && m.left >= 0 && m.right <= m.innerW, JSON.stringify({ top: m.top, bottom: m.bottom, innerH: m.innerH }));
          check(`${where}: no sideways scrolling`, m.docScrollW <= m.innerW, `scrollWidth ${m.docScrollW} > ${m.innerW}`);
          check(`${where}: the text is the approved constant, character for character`, flat(m.text) === flat(message),
            `panel: ${JSON.stringify(flat(m.text).slice(0, 120))}`);
        }
        // A good file clears it.
        await b.setFile(GENERIC_OK);
        await b.waitFor(`/Your Pages/.test(document.body.innerText)`, 'the good file to load');
        await sleep(300);
        check(`${where}: the panel clears when a good file is loaded`, await b.evaluate(`!${PANEL}`));
      }
      check(`${vp.name}: no dialog reached the page (alert was suppressed)`, b.dialogs.length === 0, b.dialogs.join(','));
    } finally { await b.close(); }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (LAYOUT_ONLY) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }
console.log('\nrefusal panel, in a real browser\n');
console.log(results.join('\n'));
console.log('\n' + JSON.stringify(report, null, 1));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
