/**
 * inkBox.ts — where the writing is inside a crop, as METADATA. Nothing is cut.
 *
 * `WORKORDER_SS_PAGE_LABELLING_2026-09-24` §2a. On the generic sheet the crop
 * is the whole writing box, and it is **stored whole**. Trimming to the writing
 * is a heuristic applied to the thing being graded: faint pencil, a sparse
 * sketch or one line low on the page reads as empty to a threshold, and what a
 * trim cuts no one downstream can recover. So this module never changes a
 * pixel. It reports a rectangle beside the crop, and whether there is any ink
 * at all, and the reading side decides what to do with either.
 *
 * ## What counts as ink
 *
 * A pixel a clear step (`INK_STEP`) darker than the paper around it. "Around
 * it" is local — the brightest-but-one tenth of each few-millimetre block —
 * because a phone photograph is never evenly lit and a single threshold for
 * the page reads a shadowed corner as writing.
 *
 * Four things on a blank generic page are dark and are not writing, and each
 * is removed by what it IS rather than by how dark it is:
 *
 *   - **The printed rules.** Their positions are known — they are part of the
 *     page's geometry, as the box is — so a narrow band around each one is
 *     ignored. The band is wider than a registration error, and the box is
 *     padded back out by the same amount, so a stroke that ends inside a band
 *     is still inside the reported box.
 *   - **Any other long straight run**, horizontal or vertical: a rule where
 *     the geometry did not quite land, or the box's own border leaking in at
 *     the edge. Handwriting has no 15 mm straight strokes; a long fraction bar
 *     might, and its numerals keep it in the box regardless.
 *   - **A thin margin at the crop's edge**, for the same border.
 *   - **Specks**: connected dark patches smaller than a pencil dot. Dust, JPEG
 *     noise, a crumb.
 *
 * What remains is ink. Under `INK_MIN_MM2` of it — less than one short
 * written digit — the page is reported as having none, and the student is
 * told it looks blank. **Said, never blocked**: a student who meant to hand in
 * a blank page hands it in.
 */

import { InkBox } from '../types';
import { Rgba } from './raster';

/** Luminance below the local paper that counts as a mark. The same step `cropRegions` uses. */
export const INK_STEP = 40;
/** Side of the block the local paper level is estimated over. */
export const PAPER_BLOCK_MM = 4;
/** A straight dark run at least this long is a printed line, not writing. */
export const RULE_RUN_MM = 15;
/**
 * Gaps a printed line may have and still be one line. A feint rule photographed
 * at an angle, resampled and JPEG-compressed breaks into dashes a few pixels
 * apart; unbridged, each dash is too short to be a line and survives as "ink".
 */
export const RULE_GAP_MM = 1.0;
/** A printed line is found on this softer step, so its pale edges are found with it. */
export const LINE_STEP = 20;
/** Removed on either side of a found line, across it: its anti-aliased fringe. */
export const LINE_FRINGE_MM = 0.3;
/** Half-width of the band ignored around each known printed rule. */
export const RULE_BAND_MM = 1.2;
/** Ignored at the crop's edge, where the box's border can leak in. */
export const EDGE_MARGIN_MM = 1.0;
/** A connected patch smaller than this is a speck. */
export const SPECK_MM2 = 0.25;
/** Less ink than this, in total, and the page is reported as blank. */
export const INK_MIN_MM2 = 2;
/** The reported box is padded by this much, clamped to the crop. */
export const INK_BOX_PAD_MM = 1.5;

export interface InkMeasure {
  /** Null when there is no ink. */
  box: InkBox | null;
  /** Ink area in square millimetres, after everything above is removed. */
  inkMm2: number;
}

/**
 * @param image    the crop, as stored
 * @param pxPerMm  the crop's own resolution
 * @param ruleRows crop-pixel rows the printed rules fall on, if the sheet has any
 */
export const measureInk = (image: Rgba, pxPerMm: number, ruleRows: readonly number[] = []): InkMeasure => {
  const { data, width: w, height: h } = image;
  const n = w * h;
  if (n === 0) return { box: null, inkMm2: 0 };

  const lum = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    lum[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
  }

  // Paper level, per block: the 90th percentile, so writing inside the block
  // does not drag it down.
  const block = Math.max(8, Math.round(PAPER_BLOCK_MM * pxPerMm));
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block);
  const paper = new Uint8Array(bw * bh);
  const hist = new Uint32Array(256);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      hist.fill(0);
      const x0 = bx * block, y0 = by * block;
      const x1 = Math.min(w, x0 + block), y1 = Math.min(h, y0 + block);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[lum[y * w + x]]++;
      const target = Math.floor((x1 - x0) * (y1 - y0) * 0.9);
      let acc = 0, v = 0;
      for (; v < 256; v++) { acc += hist[v]; if (acc > target) break; }
      paper[by * bw + bx] = Math.min(255, v);
    }
  }

  const dark = new Uint8Array(n);
  const soft = new Uint8Array(n);
  const edge = Math.round(EDGE_MARGIN_MM * pxPerMm);
  for (let y = edge; y < h - edge; y++) {
    const rowPaper = Math.floor(y / block) * bw;
    for (let x = edge; x < w - edge; x++) {
      const p = y * w + x;
      const level = paper[rowPaper + Math.floor(x / block)];
      if (lum[p] < level - INK_STEP) dark[p] = 1;
      if (lum[p] < level - LINE_STEP) soft[p] = 1;
    }
  }

  // Printed lines, found on the soft mask, gaps bridged, in either direction:
  // the rules wherever they actually landed, and the border if it leaks in.
  // Found BEFORE anything is removed, so a rule half-covered by a known-rule
  // band below is still seen whole.
  const run = Math.round(RULE_RUN_MM * pxPerMm);
  const gap = Math.max(1, Math.round(RULE_GAP_MM * pxPerMm));
  const fringe = Math.max(1, Math.round(LINE_FRINGE_MM * pxPerMm));
  const line = new Uint8Array(n);
  /** Marks runs along one line of pixels; `at(i)` is the i-th pixel's index. */
  const markRuns = (length: number, at: (i: number) => number, across: number): void => {
    let start = -1, last = -1;
    for (let i = 0; i <= length; i++) {
      const on = i < length && soft[at(i)] === 1;
      if (on) {
        if (start < 0) start = i;
        last = i;
      } else if (start >= 0 && (i === length || i - last > gap)) {
        if (last + 1 - start >= run) {
          for (let j = start; j <= last; j++) {
            for (let d = -fringe; d <= fringe; d++) {
              const q = at(j) + d * across;
              if (q >= 0 && q < n) line[q] = 1;
            }
          }
        }
        start = -1;
      }
    }
  };
  for (let y = 0; y < h; y++) markRuns(w, (i) => y * w + i, w);
  for (let x = 0; x < w; x++) markRuns(h, (i) => i * w + x, 1);
  for (let p = 0; p < n; p++) if (line[p]) dark[p] = 0;

  // The known rules: a band around each, gone, however faint they printed.
  const band = Math.round(RULE_BAND_MM * pxPerMm);
  for (const r of ruleRows) {
    const y0 = Math.max(0, Math.round(r) - band), y1 = Math.min(h - 1, Math.round(r) + band);
    for (let y = y0; y <= y1; y++) dark.fill(0, y * w, y * w + w);
  }

  // Connected patches, 8-connected; specks dropped, the rest counted and boxed.
  const speck = Math.max(1, Math.round(SPECK_MM2 * pxPerMm * pxPerMm));
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  let ink = 0;
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (let p = 0; p < n; p++) {
    if (!dark[p] || seen[p]) continue;
    let count = 0, cx0 = w, cy0 = h, cx1 = -1, cy1 = -1;
    seen[p] = 1;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % w, qy = (q - qx) / w;
      count++;
      if (qx < cx0) cx0 = qx; if (qx > cx1) cx1 = qx;
      if (qy < cy0) cy0 = qy; if (qy > cy1) cy1 = qy;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = qy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx;
          if (nx < 0 || nx >= w) continue;
          const r = ny * w + nx;
          if (dark[r] && !seen[r]) { seen[r] = 1; stack.push(r); }
        }
      }
    }
    if (count < speck) continue;
    ink += count;
    if (cx0 < bx0) bx0 = cx0; if (cy0 < by0) by0 = cy0;
    if (cx1 > bx1) bx1 = cx1; if (cy1 > by1) by1 = cy1;
  }

  const inkMm2 = ink / (pxPerMm * pxPerMm);
  if (inkMm2 < INK_MIN_MM2 || bx1 < 0) return { box: null, inkMm2 };

  const pad = Math.round(INK_BOX_PAD_MM * pxPerMm);
  return {
    box: {
      x0: Math.max(0, bx0 - pad),
      y0: Math.max(0, by0 - pad),
      x1: Math.min(w, bx1 + 1 + pad),
      y1: Math.min(h, by1 + 1 + pad),
    },
    inkMm2,
  };
};
