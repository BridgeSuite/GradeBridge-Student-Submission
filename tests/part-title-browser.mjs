// =====================================================
// A long part title wraps at 390 px — measured in a real browser, before deploy
// =====================================================
// `WORKORDER_SS_PART_TITLE_WHEN_LABELLING_2026-09-25`, done-when: "A long title
// wraps rather than truncating, at 390 pixels wide."
//
//   node tests/part-title-browser.mjs
//
// **Not part of `npm test`**, for the reason `tests/refusal-panel-browser.mjs`
// gives: whether text wraps is a fact about layout, which only a browser can
// measure, and headless Chrome is kept out of CI. The component is rendered by
// React's own server renderer and styled with the app's real compiled CSS (a
// fresh `vite build`), then measured at 390 px with phone emulation.
//
// The closed dropdown is drawn by the phone and clips; that is why the line
// under it exists, and the line is what this measures.
// =====================================================

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReviewHarness, parts, problems, crops, cropUrls, pages } from './partTitleFixtures.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH ?? (process.platform === 'win32'
  ? join(process.env.ProgramFiles ?? process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  : 'google-chrome');
const LONG = 'Symbols and units for the complex permittivity of a lossy dielectric at microwave frequencies';
const FULL = `Problem 1, part (a): ${LONG}`;

// ---- the app's real CSS ----
const outDir = mkdtempSync(join(tmpdir(), 'gb-part-title-css-'));
const vite = spawnSync(process.execPath, [join(REPO, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
  { cwd: REPO, encoding: 'utf8' });
if (vite.status !== 0) { console.error(vite.stderr || vite.stdout); process.exit(2); }
const cssFile = readdirSync(join(outDir, 'assets')).find(n => n.endsWith('.css'));
const css = readFileSync(join(outDir, 'assets', cssFile), 'utf8');
rmSync(outDir, { recursive: true, force: true });

// ---- the component, with one long title ----
const { renderReview, cleanup } = await buildReviewHarness();
const html = renderReview({
  parts, crops, cropUrls, pages,
  problems: problems.map(p => ({ ...p, subsections: p.subsections.map(s => ({ ...s, name: s.name === 'Phase velocity' ? LONG : s.name })) })),
});
cleanup();
const doc = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>
<body class="bg-gray-50"><div class="max-w-4xl mx-auto p-6">${html}</div></body></html>`;

// ---- measure ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'gb-part-title-profile-'));
const port = 9500;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let passed = 0, failed = 0; const results = [];
const check = (name, ok, detail = '') => { ok ? passed++ : failed++; results.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n          ${detail}`}`); };
try {
  let targets = [];
  for (let i = 0; i < 75 && !targets.some(t => t.type === 'page'); i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {} await sleep(200); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  const { frameTree } = await send('Page.getFrameTree');
  await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: doc });
  await sleep(500);
  const m = await evaluate(`(() => {
    const el = document.querySelector('[data-part-title]');
    if (!el) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
    return { text: el.innerText, left: r.left, right: r.right, height: r.height, lines: Math.round(r.height / lineH),
      scrollW: el.scrollWidth, clientW: el.clientWidth, overflow: cs.overflow + '/' + cs.textOverflow + '/' + cs.whiteSpace,
      innerW: innerWidth, docScrollW: document.scrollingElement.scrollWidth };
  })()`);
  check('the chosen-part line is rendered for the long title', m !== null);
  if (m) {
    check('the whole title is there, not cut', m.text.replace(/\s+/g, ' ').trim() === FULL, JSON.stringify(m.text));
    check(`it wraps onto more than one line (${m.lines} lines)`, m.lines >= 2, JSON.stringify(m));
    check('nothing overflows the line: no hidden text', m.scrollW <= m.clientW + 1, `scrollWidth ${m.scrollW} > clientWidth ${m.clientW}`);
    check('the line is inside the 390 px screen', m.left >= 0 && m.right <= m.innerW + 0.5, `${m.left}..${m.right} of ${m.innerW}`);
    check('the page does not scroll sideways', m.docScrollW <= m.innerW, `scrollWidth ${m.docScrollW}`);
    check('no ellipsis and no forced single line', !/ellipsis/.test(m.overflow) && !/nowrap/.test(m.overflow), m.overflow);
  }
  ws.close();
} finally {
  chrome.kill(); await sleep(800); try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log('\npart title at 390 px, in a real browser\n');
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
