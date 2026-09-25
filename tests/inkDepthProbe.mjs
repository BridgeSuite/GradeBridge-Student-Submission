// =====================================================
// Where printed rules and real strokes fall relative to the local paper
// =====================================================
// The measurement behind the thresholds in `services/inkBox.ts`
// (`WORKORDER_SS_PAGE_LABELLING_2026-09-24`, ink measure, option (a)).
//
//   node tests/inkDepthProbe.mjs
//
// Runs over every real phone photograph present locally under
// `tests/captures/` (real/, stale/, android/, students/**). Only real/ and
// stale/ are tracked; the others are other people's work and stay local and
// uncommitted. **The numbers this prints are what the constants rest on, and
// they are copied into the comment in `inkBox.ts` and into the completion
// report**, so the constants can be read without the photographs.
//
// Each photograph is ingested as the app ingests it (EXIF-uprighted, long edge
// 2200 px, JPEG), registered by the app's own pipeline, and every answer region
// on its page is cut at the photograph's own resolution. Within each crop,
// `depth` is `depthBelowPaper` — exactly the quantity the ink measure
// thresholds — and pixels are split into two populations:
//
//   RULE   the core of a printed writing rule, located by the SHEET'S OWN
//          GEOMETRY (3 + 9i mm below each region's stored top). Geometry is
//          used here to label ground truth, never by the detector. Only
//          columns with no ink 0.8 to 2.5 mm above and below are kept, so a
//          stroke crossing the rule is not counted as rule.
//   STROKE connected dark patches (depth > 25, at least 0.25 mm²) lying more
//          than 1.2 mm from any rule and 1.5 mm from the crop's edge: the
//          student's writing and nothing printed.
//
// **What transfers and what does not.** These are photographs of the
// app-printed sheet, whose rules are 0.5 pt at 75% grey, DASHED 1.2 on 1.2 mm.
// The generic page's rules are the same 0.5 pt at the same 75% grey but SOLID.
// So the grey levels transfer to the generic page and the run-length and gap
// structure does not.
// =====================================================

import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadModule, CAPTURE_DIR } from './captureSet.mjs';
import { ingestLikeApp } from './realCaptures.mjs';

const P = await loadModule('tests/genericPipeline.ts', 'inkprobe_p.mjs');
await P.initQrReader();

// Maps: the two tracked ones, plus any `layout_*.csv` in INK_PROBE_MAPS (a
// local folder; used for photographs of sheets whose maps are not tracked). A
// map is used only for a photograph whose QR names its recomputed layout_id.
const extraMaps = process.env.INK_PROBE_MAPS
  ? readdirSync(process.env.INK_PROBE_MAPS).filter(n => /^layout_.*\.csv$/.test(n)).map(n => join(process.env.INK_PROBE_MAPS, n))
  : [];
const maps = {};
for (const f of [join(CAPTURE_DIR, '..', 'fixtures', 'layout_ENG17HOM496F.csv'), join(CAPTURE_DIR, 'layout_fixture.csv'), ...extraMaps]) {
  if (!existsSync(f)) continue;
  const m = await P.parseLayoutCsv(readFileSync(f, 'utf8'), f);
  maps[m.computedLayoutId] = m;
}

const walk = (dir) => existsSync(dir) ? readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(jpe?g|png)$/i.test(n) ? [p] : [];
}) : [];
const photos = ['real', 'stale', 'android', 'students'].flatMap(d => walk(join(CAPTURE_DIR, d)));

const PAGE_H_MM = 279.4, PAGE_W_MM = 215.9;
const ruleVals = [], strokeMax = [], strokeMedian = [], strokePix = [];
// Per threshold: rule runs that stay above it for >= 0.8 mm (long enough to
// survive the 0.25 mm² speck filter at a rule's ~0.3 mm photographed width).
const DEEP = [80, 90, 100, 110, 120, 130, 140, 150];
const surviving = Object.fromEntries(DEEP.map(t => [t, { mm: 0, longest: 0 }]));
let ruleMmMeasured = 0;
// Continuity: inside each printed dash (the solid part of the rule), how often
// the core dips to or below a candidate LINE_STEP, and the longest such dip.
// A dash is a run of >= 0.8 mm of clean columns whose core is > 8.
const LINE_CANDIDATES = [10, 12, 15, 18, 20, 25, 30];
const insideDash = Object.fromEntries(LINE_CANDIDATES.map(t => [t, { cols: 0, below: 0, longestGapMm: 0, gaps: [] }]));
// Per rule line: median core depth over its dash columns.
const lineMedians = [];
// Bare paper: pixels > 1.2 mm from any rule and > 1.5 mm from any stroke
// candidate (depth > 25). Its depth distribution, and how many patches of at
// least 0.25 mm² it forms above each candidate step, per 1000 mm² of paper.
const paperPix = [];
const PAPER_STEPS = [10, 12, 15, 18, 20, 25];
const paperPatches = Object.fromEntries(PAPER_STEPS.map(t => [t, 0]));
const paperPatchMm2 = Object.fromEntries(PAPER_STEPS.map(t => [t, []]));
let paperMm2 = 0;
const perSet = {};
let registered = 0, skipped = [];

for (const path of photos) {
  const set = relative(CAPTURE_DIR, path).split(/[\\/]/)[0];
  perSet[set] ??= { photos: 0, registered: 0, crops: 0, rule: 0, strokes: 0 };
  perSet[set].photos++;
  let image;
  try { image = ingestLikeApp(path); } catch (e) { skipped.push(`${relative(CAPTURE_DIR, path)}: ${e.message}`); continue; }
  const reg = P.registerPage(image);
  const map = reg.usable && reg.qr ? maps[reg.qr.fields.layoutId] : null;
  if (!map) { skipped.push(`${relative(CAPTURE_DIR, path)}: ${reg.usable ? `layout ${reg.qr?.fields.layoutId} not on hand` : reg.status}`); continue; }
  registered++; perSet[set].registered++;

  for (const row of map.rows.filter(r => r.pageK === reg.qr.fields.k && !r.isDrawing)) {
    const cut = P.cropRegion(image, reg.transform, row);
    const { width: w, height: h } = cut.image;
    const ppm = cut.pxPerMm;
    const depth = P.depthBelowPaper(cut.image, ppm);
    perSet[set].crops++;

    const hMm = (row.y1 - row.y0) * PAGE_H_MM;
    const rulesPx = [];
    for (let i = 1; 3 + 9 * i < hMm - 3; i++) rulesPx.push((3 + 9 * i) * ppm);
    const nearRule = (y) => rulesPx.some(r => Math.abs(y - r) <= 1.2 * ppm);

    // RULE cores, column by column, where nothing written is near.
    const core = Math.max(1, Math.round(0.35 * ppm));
    const clearA = Math.round(0.8 * ppm), clearB = Math.round(2.5 * ppm);
    const margin = Math.round(1.5 * ppm);
    const colMax = [];
    for (const r of rulesPx) {
      const ry = Math.round(r);
      if (ry - clearB < 0 || ry + clearB >= h) continue;
      for (let x = margin; x < w - margin; x++) {
        let clean = true;
        for (let d = clearA; d <= clearB && clean; d++) {
          if (depth[(ry - d) * w + x] > 15 || depth[(ry + d) * w + x] > 15) clean = false;
        }
        if (!clean) continue;
        let m = -999;
        for (let d = -core; d <= core; d++) m = Math.max(m, depth[(ry + d) * w + x]);
        ruleVals.push(m); perSet[set].rule++;
        colMax[x] = m;
      }
      // Runs along this rule above each deep threshold, over clean columns only.
      let clean = 0;
      for (let x = margin; x < w - margin; x++) if (colMax[x] !== undefined) clean++;
      ruleMmMeasured += clean / ppm;
      for (const t of DEEP) {
        let run = 0;
        for (let x = margin; x <= w - margin; x++) {
          const v = colMax[x];
          if (v !== undefined && v > t) run++;
          else {
            if (run / ppm >= 0.8) { surviving[t].mm += run / ppm; surviving[t].longest = Math.max(surviving[t].longest, run / ppm); }
            run = 0;
          }
        }
      }
      // Dashes along this rule, and the core inside each.
      {
        const dashes = [];
        let start = -1;
        for (let x = margin; x <= w - margin; x++) {
          const v = colMax[x];
          if (v !== undefined && v > 8) { if (start < 0) start = x; }
          else { if (start >= 0 && (x - start) / ppm >= 0.8) dashes.push([start, x]); start = -1; }
        }
        const lineVals = [];
        for (const [a, b] of dashes) {
          for (let x = a; x < b; x++) lineVals.push(colMax[x]);
          for (const t of LINE_CANDIDATES) {
            let gap = 0;
            for (let x = a; x < b; x++) {
              insideDash[t].cols++;
              if (colMax[x] <= t) { insideDash[t].below++; gap++; }
              else { if (gap) insideDash[t].gaps.push(gap / ppm); insideDash[t].longestGapMm = Math.max(insideDash[t].longestGapMm, gap / ppm); gap = 0; }
            }
            if (gap) { insideDash[t].gaps.push(gap / ppm); insideDash[t].longestGapMm = Math.max(insideDash[t].longestGapMm, gap / ppm); }
          }
        }
        if (lineVals.length >= 20) { lineVals.sort((p, q) => p - q); lineMedians.push(lineVals[lineVals.length >> 1]); }
      }
      colMax.length = 0;
    }

    // BARE PAPER, as defined above.
    {
      const near = new Uint8Array(w * h);
      const r15 = Math.round(1.5 * ppm);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (depth[y * w + x] <= 25) continue;
        for (let dy = -r15; dy <= r15; dy += 2) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
          const lo = Math.max(0, x - r15), hi = Math.min(w - 1, x + r15); near.fill(1, yy * w + lo, yy * w + hi + 1); }
      }
      const isPaper = new Uint8Array(w * h);
      let count = 0;
      for (let y = margin; y < h - margin; y++) {
        if (nearRule(y)) continue;
        for (let x = margin; x < w - margin; x++) {
          const p = y * w + x;
          if (near[p]) continue;
          isPaper[p] = 1; count++;
          if ((x + y) % 7 === 0) paperPix.push(depth[p]);
        }
      }
      paperMm2 += count / (ppm * ppm);
      const speckPx = Math.round(0.25 * ppm * ppm);
      for (const t of PAPER_STEPS) {
        const seenP = new Uint8Array(w * h);
        for (let p = 0; p < w * h; p++) {
          if (!isPaper[p] || depth[p] <= t || seenP[p]) continue;
          let size = 0; const st = [p]; seenP[p] = 1;
          while (st.length) { const q = st.pop(); size++; const qx = q % w, qy = (q - qx) / w;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = qx + dx, ny = qy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const r = ny * w + nx;
              if (isPaper[r] && depth[r] > t && !seenP[r]) { seenP[r] = 1; st.push(r); } } }
          if (size >= speckPx) { paperPatches[t]++; paperPatchMm2[t].push(size / (ppm * ppm)); }
        }
      }
    }

    // STROKES: patches away from every rule and edge.
    const cand = new Uint8Array(w * h);
    for (let y = margin; y < h - margin; y++) {
      if (nearRule(y)) continue;
      for (let x = margin; x < w - margin; x++) if (depth[y * w + x] > 25) cand[y * w + x] = 1;
    }
    const seen = new Uint8Array(w * h), speck = Math.round(0.25 * ppm * ppm);
    for (let p = 0; p < w * h; p++) {
      if (!cand[p] || seen[p]) continue;
      const vals = [], stack = [p]; seen[p] = 1;
      while (stack.length) {
        const q = stack.pop(); vals.push(depth[q]);
        const qx = q % w, qy = (q - qx) / w;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const r = ny * w + nx;
          if (cand[r] && !seen[r]) { seen[r] = 1; stack.push(r); }
        }
      }
      if (vals.length < speck) continue;
      vals.sort((a, b) => a - b);
      strokeMax.push(vals[vals.length - 1]);
      strokeMedian.push(vals[vals.length >> 1]);
      for (const v of vals) strokePix.push(v);
      perSet[set].strokes++;
    }
  }
}

const pct = (arr, q) => { if (!arr.length) return NaN; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const row = (name, arr, qs) => `  ${name.padEnd(28)} n=${String(arr.length).padStart(8)}  ` + qs.map(q => `p${q * 100}=${pct(arr, q)}`).join('  ');
const dashCores = ruleVals.filter(v => v > 8);

console.log('\nink depth below local paper, real phone photographs of the printed sheet\n');
console.log(`photographs found ${photos.length}, registered on a map on hand ${registered}`);
for (const [k, v] of Object.entries(perSet)) console.log(`  ${k.padEnd(10)} ${JSON.stringify(v)}`);
console.log('\nRULE core, every clean column (dash and gap)');
console.log(row('rule, all columns', ruleVals, [0.5, 0.9, 0.99, 0.999, 1]));
console.log(row('rule, dash cores (>8)', dashCores, [0.5, 0.9, 0.99, 0.999, 1]));
console.log('\nSTROKE, per patch and per pixel');
console.log(row('stroke patch, darkest pixel', strokeMax, [0, 0.001, 0.01, 0.05, 0.1, 0.5]));
console.log(row('stroke patch, median pixel', strokeMedian, [0.01, 0.05, 0.1, 0.5]));
console.log(row('stroke pixels', strokePix, [0.05, 0.1, 0.25, 0.5]));
for (const t of [40, 50, 60, 70, 80, 90, 100]) {
  const ruleOver = dashCores.filter(v => v > t).length;
  const strokeUnder = strokeMax.filter(v => v <= t).length;
  console.log(`  step ${String(t).padStart(3)}: rule dash cores above ${ruleOver} (${(100 * ruleOver / Math.max(1, dashCores.length)).toFixed(3)}%),` +
    ` stroke patches with no pixel above ${strokeUnder} (${(100 * strokeUnder / Math.max(1, strokeMax.length)).toFixed(2)}%)`);
}
console.log('\nCONTINUITY: inside printed dashes (the solid part of the rule), core at or below a LINE_STEP candidate');
for (const t of LINE_CANDIDATES) {
  const d = insideDash[t];
  const g = d.gaps.sort((p, q) => p - q);
  const q = (f) => g.length ? g[Math.min(g.length - 1, Math.floor(f * g.length))].toFixed(2) : '-';
  console.log(`  step ${String(t).padStart(2)}: ${(100 * d.below / Math.max(1, d.cols)).toFixed(1)}% of dash columns below; gaps n=${g.length} p50=${q(0.5)} p99=${q(0.99)} longest=${d.longestGapMm.toFixed(2)} mm`);
}
console.log(row('rule line median (dash cores)', lineMedians, [0, 0.5, 0.9, 0.99, 1]));
console.log(`
BARE PAPER: ${paperMm2.toFixed(0)} mm² measured`);
console.log(row('paper pixels (1 in 7)', paperPix, [0.5, 0.9, 0.99, 0.999, 0.9999, 1]));
for (const t of PAPER_STEPS) {
  const a = paperPatchMm2[t].sort((p, q) => p - q), tot = a.reduce((x, y) => x + y, 0);
  const qa = (f) => a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(2) : '-';
  console.log(`  step ${String(t).padStart(2)}: paper patches >= 0.25 mm² above it: ${paperPatches[t]} (${(1000 * paperPatches[t] / paperMm2).toFixed(3)} per 1000 mm²)` +
    `; patch area p50=${qa(0.5)} p99=${qa(0.99)} max=${qa(1)} mm²; expected per 38,100 mm² box ${(38100 * tot / paperMm2).toFixed(2)} mm²`);
}
const GENERIC_RULE_MM = 24 * (203.9 - 12.0 - 6);
console.log(`
DEEP TIER: what would count as ink with no shape test (rule runs >= 0.8 mm above the step)`);
console.log(`  clean rule measured: ${ruleMmMeasured.toFixed(0)} mm. Generic page: ${GENERIC_RULE_MM.toFixed(0)} mm of rule.`);
for (const t of DEEP) {
  const perM = surviving[t].mm / ruleMmMeasured;
  const rescued = strokeMax.filter(v => v > t).length;
  console.log(`  step ${t}: rule above it for >=0.8 mm: ${surviving[t].mm.toFixed(1)} mm (${(1000 * perM).toFixed(2)} mm per metre, longest ${surviving[t].longest.toFixed(1)} mm);` +
    ` projected on a blank generic page ${(perM * GENERIC_RULE_MM).toFixed(1)} mm of rule ≈ ${(perM * GENERIC_RULE_MM * 0.3).toFixed(2)} mm²;` +
    ` stroke patches reaching it ${rescued} of ${strokeMax.length} (${(100 * rescued / strokeMax.length).toFixed(1)}%)`);
}
if (skipped.length) { console.log(`\nnot measured (${skipped.length}):`); for (const s of skipped) console.log('  ' + s); }
