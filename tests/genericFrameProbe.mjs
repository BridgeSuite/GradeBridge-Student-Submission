// =====================================================
// Real photographs of the generic answer page, measured by the app's own method
// =====================================================
//   node tests/genericFrameProbe.mjs
//
// Reads tests/captures/generic_page/*.jpg (gitignored: real handwriting stays
// local; the numbers this prints are what gets kept). Each frame goes through
// what the app does: ingest (EXIF-upright, long edge 2200 px, JPEG), registration
// from the page's own QR and corner marks, the declared-box crop, and the ink
// measure. Then, per file, with `depthBelowPaper` (the app's LOCAL paper level,
// the 90th percentile of each 4 mm block):
//
//   - the verdict and each piece of evidence behind it;
//   - RULE cores: the printed rules, located by the page's geometry (y = 57 + 8k
//     mm) FOR LABELLING THIS MEASUREMENT ONLY. The detector never uses it.
//     Only columns with no writing 0.8 to 2.5 mm above and below are kept;
//   - rule CONTINUITY at candidate LINE_STEPs: how often and for how long a
//     solid rule dips to or below the step, over clean stretches;
//   - rule SPAN at candidate gaps: bridging gaps up to g, the longest run each
//     rule makes at the step, as a fraction of the box width;
//   - STROKES: dark patches (depth > 25, >= 0.25 mm²) away from every rule;
//   - handwriting STRAIGHT RUNS: at the step and gap, the longest horizontal or
//     vertical run of marks that is not on a rule: how long a straight line real
//     writing makes, which RULE_RUN_MM must exceed;
//   - BARE PAPER: away from rules and 1.5 mm from any mark.
//
// One phone, one printer, one room, one hand. These numbers settle that setup.
// =====================================================

import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { loadModule, CAPTURE_DIR } from './captureSet.mjs';
import { ingestLikeApp } from './realCaptures.mjs';

const DIR = join(CAPTURE_DIR, 'generic_page');
if (!existsSync(DIR)) { console.log('SKIP: tests/captures/generic_page/ is not here (it is gitignored).'); process.exit(0); }
const OUT = join(DIR, '_crops');
mkdirSync(OUT, { recursive: true });

const P = await loadModule('tests/genericPipeline.ts', 'frameprobe_p.mjs');
await P.initQrReader();
const CSV = 'assignment_id,layout_id,region_id,part_id,page_k,x0,y0,x1,y1,is_drawing,max_points\n' +
  'GBGEN1,5F0B10BC,gen,generic,1,0.0572,0.2053,0.9428,0.9186,0,0\n';
const row = (await P.parseLayoutCsv(CSV, 'layout_GBGEN1.csv')).rows[0];
const PAGE_H_MM = 279.4;
const topMm = row.y0 * PAGE_H_MM, hMm = (row.y1 - row.y0) * PAGE_H_MM;

const STEPS = [15, 18, 20, 22, 25];
const GAPS = [0.5, 1.0, 1.5, 2.0, 3.0];
const pct = (arr, qs) => {
  if (!arr.length) return qs.map(() => '-').join(' ');
  const s = Float64Array.from(arr).sort();
  return qs.map(q => `p${+(q * 100).toFixed(2)}=${s[Math.min(s.length - 1, Math.floor(q * s.length))]}`).join(' ');
};

const files = readdirSync(DIR).filter(n => /\.jpe?g$/i.test(n)).sort();
for (const file of files) {
  console.log(`\n=== ${file}`);
  const image = ingestLikeApp(join(DIR, file));
  const reg = P.registerPage(image);
  if (!reg.usable) { console.log(`  NOT REGISTERED: ${reg.status} ${reg.message ?? ''}`); continue; }
  const f = reg.qr.fields;
  console.log(`  registered: ${reg.status}, QR ${f.assignmentId}-${f.token}-${f.k}-${f.n}-${f.layoutId}, marks ${reg.marksFound}, residual ${reg.residualMm?.toFixed(2)} mm, ingest ${image.width}x${image.height}`);
  const sharp = P.registeredQrSharpness(image, reg);
  console.log(`  QR sharpness ${sharp?.toFixed(3)}`);
  const cut = P.cropGenericBox(image, reg.transform, row, P.GENERIC_CROP_LONG_EDGE_PX, sharp);
  const m = P.measureInk(cut.image, cut.pxPerMm);
  const { width: w, height: h } = cut.image, ppm = cut.pxPerMm;
  console.log(`  crop ${w}x${h} at ${ppm.toFixed(2)} px/mm`);
  console.log(`  VERDICT ${cut.inkVerdict} (measure alone: ${m.verdict}); ink ${m.inkMm2.toFixed(2)} mm²; box ${JSON.stringify(m.box)}; evidence: specks ${m.speckMm2.toFixed(2)}, faint ${m.faintMm2.toFixed(2)}, deep-line ${m.deepLineMm2.toFixed(2)}, unexplained-line ${m.unexplainedMm2.toFixed(2)} mm²`);
  writeFileSync(join(OUT, file.replace(/\.jpe?g$/i, '_box.jpg')),
    jpeg.encode({ data: Buffer.from(cut.image.data.buffer), width: w, height: h }, 90).data);

  const depth = P.depthBelowPaper(cut.image, ppm);
  const margin = Math.round(1.5 * ppm);
  const rules = [];
  for (let k = 1; k <= 24; k++) {
    const y = ((57 + 8 * k - topMm) / hMm) * h - 0.5;
    if (y > 2 * ppm && y < h - 2 * ppm) rules.push(y);
  }
  const nearRule = (y) => rules.some(r => Math.abs(y - r) <= 1.2 * ppm);

  // Rule cores, clean columns only.
  const core = Math.max(1, Math.round(0.35 * ppm)), cA = Math.round(0.8 * ppm), cB = Math.round(2.5 * ppm);
  const ruleVals = [], lineMedians = [];
  const cont = Object.fromEntries(STEPS.map(t => [t, { cols: 0, below: 0, gaps: [] }]));
  const span = Object.fromEntries(STEPS.flatMap(t => GAPS.map(g => [`${t}/${g}`, []])));
  for (const r of rules) {
    const ry = Math.round(r);
    const colMax = new Int16Array(w).fill(-999), clean = new Uint8Array(w);
    for (let x = margin; x < w - margin; x++) {
      let ok = true;
      for (let d = cA; d <= cB && ok; d++) if (depth[(ry - d) * w + x] > 15 || depth[(ry + d) * w + x] > 15) ok = false;
      let mx = -999;
      for (let d = -core; d <= core; d++) mx = Math.max(mx, depth[(ry + d) * w + x]);
      colMax[x] = mx; clean[x] = ok ? 1 : 0;
      if (ok) ruleVals.push(mx);
    }
    {
      const v = []; for (let x = margin; x < w - margin; x++) if (clean[x]) v.push(colMax[x]);
      if (v.length > 50) { v.sort((p, q) => p - q); lineMedians.push(v[v.length >> 1]); }
    }
    for (const t of STEPS) {
      let gap = 0;
      for (let x = margin; x < w - margin; x++) {
        if (!clean[x]) { gap = 0; continue; }
        cont[t].cols++;
        if (colMax[x] <= t) { cont[t].below++; gap++; }
        else if (gap) { cont[t].gaps.push(gap / ppm); gap = 0; }
      }
      // Span: bridging gaps up to g, the longest run at t (writing across the rule counts as on).
      for (const g of GAPS) {
        const gp = Math.round(g * ppm);
        let best = 0, start = -1, last = -1;
        for (let x = 0; x <= w; x++) {
          const on = x < w && colMax[x] > t;
          if (on) { if (start < 0) start = x; last = x; }
          else if (start >= 0 && (x === w || x - last > gp)) { best = Math.max(best, last + 1 - start); start = -1; }
        }
        span[`${t}/${g}`].push(best / w);
      }
    }
  }
  console.log(`  RULE cores (clean columns, n=${ruleVals.length}): ${pct(ruleVals, [0.01, 0.1, 0.5, 0.9, 0.99, 0.999, 1])}`);
  console.log(`  RULE per-line median core depth (n=${lineMedians.length} lines): ${pct(lineMedians, [0, 0.5, 1])}`);
  for (const t of STEPS) {
    const c = cont[t];
    console.log(`    step ${t}: ${(100 * c.below / Math.max(1, c.cols)).toFixed(1)}% of clean rule columns at or below; dips n=${c.gaps.length} ${pct(c.gaps, [0.5, 0.99, 1])} mm`);
  }
  for (const t of [18, 20, 22]) {
    console.log(`    step ${t}, longest bridged run per rule as a fraction of the box width: ` +
      GAPS.map(g => { const a = span[`${t}/${g}`]; return `gap ${g}: min ${Math.min(...a).toFixed(2)} (${a.filter(v => v >= 0.8).length}/${a.length} >= 0.8)`; }).join('; '));
  }

  // Strokes away from rules, and bare paper.
  const cand = new Uint8Array(w * h);
  for (let y = margin; y < h - margin; y++) {
    if (nearRule(y)) continue;
    for (let x = margin; x < w - margin; x++) if (depth[y * w + x] > 25) cand[y * w + x] = 1;
  }
  const seen = new Uint8Array(w * h), strokeMax = [], strokeMed = [];
  for (let p = 0; p < w * h; p++) {
    if (!cand[p] || seen[p]) continue;
    const vals = [], st = [p]; seen[p] = 1;
    while (st.length) {
      const q = st.pop(); vals.push(depth[q]);
      const qx = q % w, qy = (q - qx) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const r = ny * w + nx;
        if (cand[r] && !seen[r]) { seen[r] = 1; st.push(r); }
      }
    }
    if (vals.length < 0.25 * ppm * ppm) continue;
    vals.sort((a, b) => a - b);
    strokeMax.push(vals[vals.length - 1]); strokeMed.push(vals[vals.length >> 1]);
  }
  console.log(`  STROKE patches away from rules (n=${strokeMax.length}): darkest ${pct(strokeMax, [0.01, 0.05, 0.1, 0.5])}; median ${pct(strokeMed, [0.05, 0.5])}`);
  const near = new Uint8Array(w * h), r15 = Math.round(1.5 * ppm);
  for (let p = 0; p < w * h; p++) if (depth[p] > 25) {
    const x = p % w, y = (p - x) / w;
    for (let dy = -r15; dy <= r15; dy += 2) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
      near.fill(1, yy * w + Math.max(0, x - r15), yy * w + Math.min(w, x + r15 + 1)); }
  }
  const paper = [];
  for (let y = margin; y < h - margin; y++) {
    if (nearRule(y)) continue;
    for (let x = margin; x < w - margin; x++) if (!near[y * w + x]) paper.push(depth[y * w + x]);
  }
  const boxMm2 = (w - 2 * margin) * (h - 2 * margin) / (ppm * ppm);
  console.log(`  BARE PAPER (n=${paper.length}): ${pct(paper, [0.5, 0.99, 0.999, 0.9999, 1])}; deeper than 30: ${(paper.filter(v => v > 30).length / (ppm * ppm)).toFixed(2)} mm² of ${boxMm2.toFixed(0)} mm²`);

  // Handwriting straight runs, off the rules, at each step and gap.
  for (const t of [15, 20]) {
    const parts = [];
    for (const g of [0.5, 1.0, 1.5]) {
      const gp = Math.round(g * ppm);
      let best = 0;
      const scan = (len, at) => {
        let start = -1, last = -1;
        for (let i = 0; i <= len; i++) {
          const on = i < len && depth[at(i)] > t;
          if (on) { if (start < 0) start = i; last = i; }
          else if (start >= 0 && (i === len || i - last > gp)) { best = Math.max(best, last + 1 - start); start = -1; }
        }
      };
      for (let y = margin; y < h - margin; y++) if (!nearRule(y)) scan(w, (i) => y * w + i);
      for (let x = margin; x < w - margin; x++) scan(h, (i) => i * w + x);
      parts.push(`gap ${g}: ${(best / ppm).toFixed(1)} mm`);
    }
    console.log(`  longest straight run OFF the rules at step ${t}: ${parts.join('; ')}`);
  }
}
console.log(`\ncrops written to ${OUT} (gitignored with the frames)`);
