// =====================================================
// PDF intake, end to end, in a real browser against the BUILT app
// =====================================================
// `tests/pdf-intake-tests.mjs` runs the shipped code in Node. This runs the
// shipped BUNDLE in headless Chrome, which is the only place three things can
// be seen at all:
//
//   - ruling 4: pdf.js and its worker are fetched only once a PDF is picked,
//     and from this origin, never a CDN;
//   - the real <input>s, the drop zone, Replace and the uploader's lists, as a
//     student meets them;
//   - the browser's own pdf.js with no font data shipped, on the three real
//     tablet exports.
//
// Run against a build, not the dev server — the dev server does not split
// chunks the way the deployed app does, so ruling 4 would be untested:
//
//   npm run build && npx vite preview --port 4317 --strictPort
//   node tests/pdf-intake-browser.mjs [--url http://localhost:4317/GradeBridge-Student-Submission/]
//
// Not in `npm test`: it needs Chrome and a server. CHROME_PATH overrides the
// browser, exactly as in `tests/refusal-panel-browser.mjs`.
// =====================================================

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF } from 'jspdf';
import { loadModule, GENERIC_PNG } from './captureSet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APP_URL = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:4317/GradeBridge-Student-Submission/';
const ORIGIN = new URL(APP_URL).origin;
const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? join(process.env.ProgramFiles ?? process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  : 'google-chrome');

const I = await loadModule('services/pdfIntake.ts', 'pib_intake.mjs');

// ---------- inputs ----------

const work = mkdtempSync(join(tmpdir(), 'gb-pdf-browser-'));
const FIX = join(HERE, 'fixtures', 'pdf_intake');
const GOODNOTES = join(FIX, 'goodnotes_2026-10-08.pdf');
const NOTABILITY = join(FIX, 'notability_2026-10-08.pdf');
const SAMSUNG = join(FIX, 'samsungnotes_2026-10-08.pdf');
const GENERIC = join(work, 'generic.json');
writeFileSync(GENERIC, readFileSync(join(HERE, 'fixtures', 'generic_sheet_sample.json'), 'utf8').trim());
const ELECTRONIC = join(work, 'electronic.json');
writeFileSync(ELECTRONIC, JSON.stringify({
  id: 'PDFTEST1', courseCode: 'TEST', title: 'Image answer', preamble: '', createdAt: 0, updatedAt: 0,
  problems: [{ id: 'p1', name: 'P1', description: 'Draw it.', subsections: [
    { id: 's1', name: 'Sketch', description: 'Upload a picture.', points: 10, submissionType: 'Image', maxImages: 2 },
  ] }],
}));

const writePdf = (name, doc) => { const p = join(work, name); writeFileSync(p, Buffer.from(doc.output('arraybuffer'))); return p; };
const ENCRYPTED = writePdf('locked.pdf', (() => {
  const d = new jsPDF({ unit: 'pt', format: 'letter', encryption: { userPassword: 'student', ownerPassword: 'o', userPermissions: ['print'] } });
  d.text('answers', 72, 72); return d;
})());
/** The real generic page, written on, as a one-page PDF: what Replace should take. */
const ONE_PAGE = writePdf('replacement.pdf', (() => {
  const d = new jsPDF({ unit: 'mm', format: 'letter' });
  d.addImage(new Uint8Array(readFileSync(GENERIC_PNG)), 'PNG', 0, 0, 215.9, 279.4);
  d.setLineWidth(0.6); for (let y = 80; y < 200; y += 12) d.line(30, y, 170, y + 4);
  return d;
})());
const DAMAGED = join(work, 'damaged.pdf');
writeFileSync(DAMAGED, Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(4000, 0x5a)]));
const EMPTY = join(work, 'empty.pdf');
writeFileSync(EMPTY, Buffer.alloc(0));

// ---------- the browser ----------

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

let passed = 0, failed = 0; const results = []; const report = {};
const check = (name, ok, detail = '') => { ok ? passed++ : failed++; results.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n          ${detail}`}`); };
const flat = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

const CHOOSER = `(i) => i.multiple && /pdf/.test(i.accept)`;
const LOADER = `(i) => /json/.test(i.accept) && /zip/.test(i.accept)`;
const STATE = `JSON.parse(localStorage.getItem('gradebridge_submission') || '{}')`;
const IDLE = `!/Processing page/.test(document.body.innerText)`;
const pagesHeld = (b) => b.evaluate(`(${STATE}).pages?.length ?? 0`);
const LISTS = `(() => {
  const heads = [...document.querySelectorAll('p.font-semibold')];
  const list = (re) => { const h = heads.find(p => re.test(p.innerText)); return h ? [...h.parentElement.querySelectorAll('li')].map(li => li.innerText) : []; };
  return { notAdded: list(/not added/), notUsed: list(/${I.PDF_WORDING.notUsedHeading}/) };
})()`;

const b = await openBrowser(9460);
try {
  await b.send('Page.enable'); await b.send('Runtime.enable'); await b.send('DOM.enable'); await b.send('Network.enable');
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.alert = () => {};' });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await b.send('Page.navigate', { url: APP_URL });
  await b.waitFor(`document.querySelectorAll('input[type=file]').length > 0`, 'the app');
  await b.evaluate(`[...document.querySelectorAll('button')].find(x => /I Understand/.test(x.innerText))?.click()`);
  await sleep(400);

  await b.setFiles(LOADER, [GENERIC]);
  await b.waitFor(`/Your Pages/.test(document.body.innerText)`, 'the generic assignment to load');
  await sleep(500);

  // ---- ruling 4: nothing PDF-shaped is fetched before a PDF is picked ----
  const pdfAsset = (u) => /\/assets\/pdf(\.worker)?[^/]*\.m?js$/.test(u) && !/pdf\.worker\.min-[^/]*\.js$/.test(u);
  const before = [...b.requests];
  check('ruling 4: before a PDF is picked, neither pdf.js nor its worker has been fetched',
    !before.some(pdfAsset), before.filter(pdfAsset).join(', '));
  check('the uploader tells the student a PDF is welcome', await b.evaluate(
    `document.body.innerText.includes(${JSON.stringify(I.PDF_WORDING.accepted)})`));

  // ---- the three real exports, through "Choose files" ----
  const expected = [
    ['GoodNotes', GOODNOTES, 2, []],
    ['Notability', NOTABILITY, 2, [I.PDF_WORDING.pagesNotUsed([3], 3)]],
    ['Samsung Notes', SAMSUNG, 2, []],
  ];
  let held = 0;
  for (const [app, file, adds, notUsed] of expected) {
    const t0 = Date.now();
    await b.setFiles(CHOOSER, [file]);
    await b.waitFor(`(${STATE}).pages?.length >= ${held + adds} && ${IDLE}`, `${app} pages`, 90000);
    await sleep(1600);   // the autosave runs a second after the last change
    const ms = Date.now() - t0;
    const now = await pagesHeld(b);
    const lists = await b.evaluate(LISTS);
    report[app] = { ms, pagesAdded: now - held, lists };
    check(`${app}: ${adds} pages added, in the PDF's order`, now - held === adds, `${now - held} added`);
    check(`${app}: ${notUsed.length ? 'the blank page is named as not used' : 'nothing reported as not used'}`,
      JSON.stringify(lists.notUsed.map(flat)) === JSON.stringify(notUsed.map(m => flat(`${file.split(/[\\/]/).pop()} — ${m}`))),
      JSON.stringify(lists.notUsed));
    check(`${app}: nothing refused`, lists.notAdded.length === 0, JSON.stringify(lists.notAdded));
    held = now;
  }

  const state = await b.evaluate(STATE);
  const pages = state.pages ?? [];
  report.pages = pages.map(p => ({ w: p.width, h: p.height, status: p.registration?.status, marks: p.registration?.marksFound,
    k: p.registration?.k, warnings: p.warnings, sourceName: p.sourceName }));
  check('every page is stored at 1,700 × 2,200: ingest did not resample it', pages.every(p => p.width === 1700 && p.height === 2200),
    JSON.stringify(pages.map(p => [p.width, p.height])));
  check('every page registered on all four corner marks, exactly as a photograph does',
    pages.length === 6 && pages.every(p => p.registration?.status === 'ok' && p.registration?.marksFound === 4),
    JSON.stringify(report.pages.map(p => [p.status, p.marks])));
  check('no camera warning rides on a rendered page', pages.every(p => (p.warnings ?? []).length === 0),
    JSON.stringify(pages.map(p => p.warnings)));
  const crops = Object.values(state.crops ?? {});
  check('one generic crop per page, each cut by registration', crops.length === 6 &&
    crops.every(c => c.cropSource === 'registration'), `${crops.length} crops`);
  check('the pages are in upload order: GoodNotes 1, 2, Notability 1, 2, Samsung 1, 2', JSON.stringify(pages.map(p => p.sourceName)) ===
    JSON.stringify(['goodnotes_2026-10-08, page 1.png', 'goodnotes_2026-10-08, page 2.png',
      'notability_2026-10-08, page 1.png', 'notability_2026-10-08, page 2.png',
      'samsungnotes_2026-10-08, page 1.png', 'samsungnotes_2026-10-08, page 2.png']), JSON.stringify(pages.map(p => p.sourceName)));

  // ---- ruling 4, after: fetched, and from this origin only ----
  const fetched = b.requests.filter(pdfAsset);
  report.pdfAssets = fetched.map(u => u.replace(ORIGIN, ''));
  check('ruling 4: once a PDF was picked, pdf.js and its worker were fetched — from this origin',
    fetched.some(u => /\/pdf-[^/]*\.js$/.test(u)) && fetched.some(u => /pdf\.worker\.min-[^/]*\.mjs$/.test(u)) &&
    fetched.every(u => u.startsWith(ORIGIN)), JSON.stringify(fetched));
  const offOrigin = b.requests.filter(u => !u.startsWith(ORIGIN) && !/^(data|blob):/.test(u));
  check('no request left this origin at any point', offOrigin.length === 0, JSON.stringify(offOrigin));

  // ---- refusals, by name, through the same chooser ----
  for (const [label, file, message] of [
    ['encrypted', ENCRYPTED, I.PDF_WORDING.encrypted],
    ['damaged', DAMAGED, I.PDF_WORDING.damaged],
    ['empty', EMPTY, I.PDF_WORDING.empty],
  ]) {
    await b.setFiles(CHOOSER, [file]);
    await b.waitFor(`${IDLE} && /not added/.test(document.body.innerText)`, `the ${label} refusal`, 30000);
    await sleep(300);
    const lists = await b.evaluate(LISTS);
    const name = file.split(/[\\/]/).pop();
    report[`refusal ${label}`] = lists.notAdded;
    check(`the ${label} PDF is refused by name, in the student's words`,
      lists.notAdded.length === 1 && flat(lists.notAdded[0]) === flat(`${name} — ${message}`), JSON.stringify(lists.notAdded));
    check(`the ${label} PDF added no page`, await pagesHeld(b) === 6, `${await pagesHeld(b)} pages`);
  }

  // ---- Replace takes a one-page PDF only ----
  await b.send('Page.setInterceptFileChooserDialog', { enabled: true });
  // A real mouse click: a scripted .click() carries no user activation, and
  // Chrome will not open a file chooser without one.
  const at = await b.evaluate(`(() => { const e = document.querySelector('[aria-label="Replace page 1"]');
    e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await sleep(300);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await b.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  }
  for (let i = 0; i < 25 && !b.choosers.length; i++) await sleep(200);
  const chooser = b.choosers.pop();
  check('Replace opens a single-file chooser', chooser && chooser.mode === 'selectSingle', JSON.stringify(chooser));
  if (chooser) {
    await b.send('DOM.setFileInputFiles', { backendNodeId: chooser.backendNodeId, files: [GOODNOTES] });
    await b.waitFor(`${IDLE} && /not added/.test(document.body.innerText)`, 'the replace refusal', 30000);
    await sleep(300);
    const lists = await b.evaluate(LISTS);
    report['replace with 2 pages'] = lists.notAdded;
    check('Replace with a two-page PDF is refused, pointing at "Choose files"', lists.notAdded.length === 1 &&
      flat(lists.notAdded[0]) === flat(`goodnotes_2026-10-08.pdf — ${I.PDF_WORDING.replaceNeedsOnePage(2)}`), JSON.stringify(lists.notAdded));
    check('and page 1 is unchanged', (await b.evaluate(STATE)).pages[0].sourceName === 'goodnotes_2026-10-08, page 1.png');
  }

  for (const type of ['mousePressed', 'mouseReleased']) {
    await b.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  }
  for (let i = 0; i < 25 && !b.choosers.length; i++) await sleep(200);
  const chooser2 = b.choosers.pop();
  if (chooser2) {
    await b.send('DOM.setFileInputFiles', { backendNodeId: chooser2.backendNodeId, files: [ONE_PAGE] });
    await b.waitFor(`(${STATE}).pages?.[0]?.sourceName === 'replacement, page 1.png' && (${STATE}).pages[0].registration?.status === 'ok'`,
      'the one-page replacement', 60000);
  }
  const after = (await b.evaluate(STATE)).pages ?? [];
  check('Replace with a one-page PDF replaces that page, in place, registered', !!chooser2 && after.length === 6 &&
    after[0].sourceName === 'replacement, page 1.png' && after[0].registration?.status === 'ok' &&
    after[1].sourceName === 'goodnotes_2026-10-08, page 2.png', JSON.stringify(after.map(p => p.sourceName)));
  await b.send('Page.setInterceptFileChooserDialog', { enabled: false });

  // Before the electronic file is loaded: loading a second assignment may
  // rightly ask before replacing work, and that is not the PDF path's dialog.
  check('no browser dialog was used anywhere on the PDF path', b.dialogs.length === 0, b.dialogs.join(','));

  // ---- ruling 2: the electronic drop zone refuses a PDF ----
  await b.setFiles(LOADER, [ELECTRONIC]);
  await b.waitFor(`/Upload images/.test(document.body.innerText)`, 'the electronic assignment');
  await sleep(500);
  const dropped = await b.evaluate(`(async () => {
    const zone = [...document.querySelectorAll('div')].find(d => /border-dashed/.test(d.className) && /Upload images/.test(d.innerText));
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([37,80,68,70,45,49,46,55])], 'answer.pdf', { type: 'application/pdf' }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 600));
    const alert = [...document.querySelectorAll('[role=alert]')].map(e => e.innerText).find(t => /answer\\.pdf/.test(t));
    return { alert, images: zone.parentElement.querySelectorAll('img').length };
  })()`);
  report['electronic drop'] = dropped;
  check('ruling 2: a PDF dropped on an electronic image answer is refused in the page, by name',
    flat(dropped.alert) === flat(I.PDF_WORDING.electronicNotImage('answer.pdf')), JSON.stringify(dropped));
  check('ruling 2: and no broken picture was added', dropped.images === 0, `${dropped.images} images`);
} catch (err) {
  check(`the run reached its end`, false, `${err.message}
          page: ${flat(await b.evaluate('document.body.innerText').catch(() => '')).slice(0, 600)}`);
} finally {
  await b.close();
  rmSync(work, { recursive: true, force: true });
}

console.log('\nPDF intake, in a real browser, against the built app\n');
console.log(results.join('\n'));
console.log('\n' + JSON.stringify(report, null, 1));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
