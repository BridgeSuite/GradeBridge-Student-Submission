// =====================================================
// Phase 1.10, end to end, in a real browser against the BUILT app
// =====================================================
// A newer version is served to an open page: Download builds nothing and
// shows the reload panel; Reload keeps the work, and after it the download is
// built. A page opened while a newer build is live shows the banner.
// `tests/freshness-tests.mjs` holds the logic.
//
// "A newer version" is served by rewriting the served `dist/version.json`
// while the page is open, which is what a deploy does to the file the tab
// asks for. The reload then loads the same bundle, so for the reload the file
// is set back to the bundle's own stamp: the state after a real reload, when
// the tab runs the build the host names. Synthetic pages only.
//
//   npm run build && npx vite preview --port 4317 --strictPort
//   node tests/freshness-browser.mjs [--url http://localhost:4317/GradeBridge-Student-Submission/]
//
// Not in `npm test`: it needs Chrome and a server.
// =====================================================

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { GENERIC_PNG } from './captureSet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const args = process.argv.slice(2);
const APP_URL = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:4317/GradeBridge-Student-Submission/';
const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? join(process.env.ProgramFiles ?? process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  : 'google-chrome');
const VERSION_FILE = join(REPO, 'dist', 'version.json');
const built = JSON.parse(readFileSync(VERSION_FILE, 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'gb-fresh-browser-'));
const dl = join(work, 'dl');
const GENERIC = join(work, 'generic.json');
writeFileSync(GENERIC, readFileSync(join(HERE, 'fixtures', 'generic_sheet_sample.json'), 'utf8').trim());

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const openBrowser = async (port) => {
  const profile = mkdtempSync(join(tmpdir(), 'gb-pdf-profile-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 75 && !targets.some(t => t.type === 'page'); i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {}
    await sleep(200);
  }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const requests = []; const choosers = []; const dialogs = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    if (m.method === 'Page.fileChooserOpened') choosers.push(m.params);
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.type); send('Page.handleJavaScriptDialog', { accept: true }); }
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
  /** Sets files on the input whose `accept` matches. */
  const setFiles = async (acceptTest, files) => {
    const { root } = await send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' });
    const idx = await evaluate(`[...document.querySelectorAll('input[type=file]')].findIndex(i => (${acceptTest})(i))`);
    if (idx < 0) throw new Error('no such input');
    await send('DOM.setFileInputFiles', { nodeId: nodeIds[idx], files });
  };
  const close = async () => { ws.close(); proc.kill(); await sleep(800); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  return { send, evaluate, waitFor, setFiles, close, requests, choosers, dialogs };
};


let passed = 0, failed = 0; const results = [];
const check = (name, ok, detail = '') => { ok ? passed++ : failed++; results.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n          ${detail}`}`); };
const STATE = `JSON.parse(localStorage.getItem('gradebridge_submission') || '{}')`;
const serve = (v) => writeFileSync(VERSION_FILE, JSON.stringify({ app_version: v }) + '\n');
const tickPersonalInfo = `(() => { const c = document.querySelector('#personal-info-confirmation input[type=checkbox]'); if (c && !c.checked) c.click(); })()`;
const clickDownload = `[...document.querySelectorAll('button')].find(x => /Download submission/.test(x.innerText)).click()`;

const b = await openBrowser(9463);
try {
  check(`the build wrote version.json with a commit stamp (${built.app_version})`, /^[0-9a-f]{7}(-dirty)?$/.test(built.app_version ?? ''));
  await b.send('Page.enable'); await b.send('Runtime.enable'); await b.send('DOM.enable');
  await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.alert = () => {};' });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  serve(built.app_version);
  await b.send('Page.navigate', { url: APP_URL });
  await b.waitFor(`document.querySelectorAll('input[type=file]').length > 0`, 'the app');
  await sleep(1500);
  check('the live build is this one: no banner', !(await b.evaluate(`!!document.querySelector('[data-stale-banner]')`)));
  await b.evaluate(`[...document.querySelectorAll('button')].find(x => /I Understand/.test(x.innerText))?.click()`);
  await sleep(400);
  await b.setFiles(`(i) => /json/.test(i.accept) && /zip/.test(i.accept)`, [GENERIC]);
  await b.waitFor(`/Your Pages/.test(document.body.innerText)`, 'the assignment');
  await b.setFiles(`(i) => i.multiple && /pdf/.test(i.accept)`, [GENERIC_PNG]);
  await b.waitFor(`document.querySelectorAll('select[id^=problem-for-]').length >= 1`, 'the page', 120000);
  await b.evaluate(`(() => { const s = document.querySelector('select[id^=problem-for-]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, [...s.options].find(o => o.value).value); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(800);
  await b.evaluate(`[...document.querySelectorAll('[data-part-ticks] input[type=checkbox]')].forEach(c => { if (!c.checked) c.click(); })`);
  await sleep(800);
  await b.evaluate(tickPersonalInfo);
  await sleep(1600);
  const before = await b.evaluate(STATE);

  // A deploy happens while the page is open.
  serve('0000000');
  await b.evaluate(clickDownload);
  await b.waitFor(`!!document.querySelector('[data-stale-version]')`, 'the reload panel', 20000).catch(() => {});
  check('Download on old code shows the reload panel', await b.evaluate(`!!document.querySelector('[data-stale-version]')`));
  await sleep(1500);
  check('and builds nothing: no file was downloaded', !existsSync(dl) || readdirSync(dl).length === 0,
    existsSync(dl) ? readdirSync(dl).join(', ') : '');

  // Reload: the tab now runs the build the host names.
  serve(built.app_version);
  await b.evaluate(`[...document.querySelectorAll('[data-stale-version] button')].find(x => /Reload/.test(x.innerText)).click()`);
  await sleep(1500);
  await b.waitFor(`document.querySelectorAll('select[id^=problem-for-]').length >= 1`, 'the page after reload', 120000);
  await sleep(1500);
  const after = await b.evaluate(STATE);
  const labels = (s) => JSON.stringify(Object.values(s.crops ?? {}).map(c => c.partIds ?? c.partId));
  check('after reload the work is still there: the same pages and labels',
    before.pages?.length === 1 &&
    JSON.stringify(after.pages?.map(p => p.id)) === JSON.stringify(before.pages?.map(p => p.id)) && labels(after) === labels(before),
    JSON.stringify({ before: [before.pages?.length, labels(before)], after: [after.pages?.length, labels(after)] }));
  check('after reload, no banner', !(await b.evaluate(`!!document.querySelector('[data-stale-banner]')`)));

  // The personal-information tick is deliberately not kept across a reload; tick it again.
  await b.evaluate(tickPersonalInfo);
  await sleep(600);
  await b.evaluate(clickDownload);
  for (let i = 0; i < 240 && !(existsSync(dl) && readdirSync(dl).some(f => f.endsWith('.zip'))); i++) {
    await b.evaluate(`[...document.querySelectorAll('button')].find(x => /Download anyway/.test(x.innerText))?.click()`);
    await sleep(500);
  }
  const zips = existsSync(dl) ? readdirSync(dl).filter(f => f.endsWith('.zip')) : [];
  check('the download is built after the reload', zips.length === 1, zips.join(', '));
  if (zips.length) {
    await sleep(800);
    const z = await JSZip.loadAsync(readFileSync(join(dl, zips[0])));
    const payload = JSON.parse(await z.file(Object.keys(z.files).find(n => n.endsWith('.json') && !n.includes('/'))).async('string'));
    check(`it records app_version ${built.app_version}`, payload.app_version === built.app_version, payload.app_version);
    check('the self-check says complete', await b.evaluate(`document.querySelector('[data-self-check]')?.getAttribute('data-self-check') === 'complete'`));
  }

  // A tab opened while a newer build is live shows the banner on load.
  serve('0000000');
  await b.send('Page.reload', {});
  await b.waitFor(`!!document.querySelector('[data-stale-banner]')`, 'the banner', 20000).catch(() => {});
  check('a page loaded while a newer build is live shows the banner', await b.evaluate(`!!document.querySelector('[data-stale-banner]')`));
} finally {
  serve(built.app_version);
  await b.close();
  rmSync(work, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
