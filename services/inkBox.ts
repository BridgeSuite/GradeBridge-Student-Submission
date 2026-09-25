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
 * Every threshold is a step below the local paper (`depthBelowPaper`): the
 * 90th percentile of the pixel's own 4 mm block, because a phone photograph
 * is never evenly lit and one threshold for the page reads a shadowed corner
 * as writing.
 *
 * **The printed rules and real writing overlap in depth, so no single grey
 * threshold separates them.** The generic page's rules are 0.5 pt at 75%
 * grey, solid, across the full width of all 25 bands. So the measure has two
 * tiers:
 *
 *   1. **Deeper than `DEEP_STEP` (130) is ink, whatever its shape.** A
 *      ruler-drawn axis or wire in pen or a soft pencil gets there; the rules
 *      essentially never do.
 *   2. **Between `INK_STEP` (40) and `DEEP_STEP` is ink unless it is part of a
 *      long straight line**: a run of at least `RULE_RUN_MM` (15 mm), found on
 *      the softer `LINE_STEP` (20) with gaps up to `RULE_GAP_MM` (1 mm)
 *      bridged, horizontal or vertical. Handwriting has no 15 mm straight
 *      strokes. **This is not keyed on the rules**: it knows nothing of where
 *      they are, how many there are or whether any exist.
 *
 * Also removed: the box's border, as a long straight line within
 * `BORDER_ZONE_MM` of the crop's edge, however dark (the box is the declared
 * geometry, and a degraded fit may be 3 mm out); a 1 mm edge margin; and specks
 * under 0.25 mm². Under `INK_MIN_MM2` (2 mm²) in total, about one short written
 * digit, the page is reported as having no ink and the student is told it looks
 * blank. **Said, never blocked**, and the crop is stored whole either way.
 *
 * ## The numbers the constants rest on
 *
 * Measured 2026-09-24 by `tests/inkDepthProbe.mjs` on 40 real phone
 * photographs that registered on a map (7 of the maintainer's, 11 from an
 * Android phone, 22 of real coursework from two iPhones; 18 more could not be
 * measured and are listed by the probe). The photographs stay local and are
 * not committed; these numbers are what is kept. Depth below local paper:
 *
 *   - **Rule cores** (247,585 dash-core columns with no writing near):
 *     p50 21, p90 50, p99 84, p99.9 160, max 206.
 *   - **Real strokes** (5,809 patches away from any rule): darkest pixel p5 40,
 *     p10 45, p50 81. Half of all real strokes never get deeper than 81, well
 *     inside the rules' range. That is why tier 2 exists.
 *   - **At 130**, a rule stays above the step for 0.8 mm or more on 0.52 mm per
 *     metre of rule, never for more than 2.5 mm. On the generic page's 4,462 mm
 *     of rule that projects to about 0.7 mm² of false ink, under the 2 mm²
 *     floor. 25% of real stroke patches reach 130. Lower steps rescue more
 *     strokes and let in longer runs: at 120 the longest is 8.7 mm, at 110
 *     14.8 mm. (Those longest runs may be strokes written along a rule rather
 *     than the rule itself, which would make 130 conservative.)
 *
 * **What transfers and what does not.** Those photographs are of the
 * app-printed sheet, whose rules are the same 0.5 pt and 75% grey but DASHED
 * (1.2 on 1.2 mm). The grey levels transfer to the generic page. The run
 * length and gap structure do not. **No photograph of the generic page
 * printed on a real printer has been measured yet**; the suite photographs
 * the real exported PDF synthetically (`tests/generic-sheet-tests.mjs`).
 *
 * On those photographs of the real page, 13 capture recipes: blank, and blank
 * with the Problem and Part fields filled in, read as no ink on all 13, and
 * on all 13 again with registration off by up to 3 mm. With tier 2 switched
 * off, a blank page read as ink on 10 of 13. A ruler-drawn sketch is found on
 * 11 of 13 in pen and 10 of 13 in 2B pencil (the misses are the blurred and
 * hurried recipes).
 *
 * ## What breaks it, and the case it does not cover
 *
 * - **A faint hard pencil drawn with a ruler reads as blank** (0 of 13). It
 *   never reaches `DEEP_STEP`, and it is straight, so tier 2 removes it.
 *   Freehand hard-pencil writing is still found, because it is not straight.
 *   **This case is covered by the page itself, not by this code**: the
 *   generic page tells the student to write with a soft pencil (2B or B) or a
 *   pen, and that hard pencils come out faint and photograph badly. **If that
 *   printed instruction is ever removed or softened, this measure gets weaker**,
 *   and that change should come back here.
 * - **Rules printed darker than 75% grey**, or with a heavier line, push rule
 *   pixels past 130 and a blank page toward "has ink". Re-run the probe.
 * - **Rules broken into dashes with gaps over 1 mm**, or a dot grid: tier 2
 *   no longer sees a line. The deep tier still keeps them out if they are
 *   pale. Re-run the probe.
 * - Changing `INK_STEP`, `DEEP_STEP`, `RULE_RUN_MM` or `RULE_GAP_MM` without
 *   re-running `tests/inkDepthProbe.mjs` on real photographs.
 */

import { InkBox } from '../types';
import { Rgba } from './raster';

/** Luminance below the local paper that counts as a mark. The same step `cropRegions` uses. */
export const INK_STEP = 40;
/**
 * Deeper than this below the local paper, a pixel is ink whatever its shape.
 * See "The numbers the constants rest on" above: the printed rules essentially
 * never get here, and a quarter of real strokes do.
 */
export const DEEP_STEP = 130;
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
/**
 * A long straight line this close to the crop's edge is the box's border,
 * however dark. 3.5 mm covers the 3.0 mm registration error a degraded
 * three-mark fit is allowed (`DEGRADED_RESIDUAL_MAX_MM`), plus the border's
 * own 0.35 mm width and the 0.35 mm inset of the declared interior.
 */
export const BORDER_ZONE_MM = 3.5;
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
 * How far below the local paper each pixel is, in luminance levels: the one
 * quantity every threshold in this file is a step on. The paper level is the
 * 90th percentile of its own `PAPER_BLOCK_MM` block, so writing inside a block
 * does not drag it down and an unevenly lit photograph is measured against the
 * paper right beside each stroke. Exported so the measurement that sets the
 * thresholds (`tests/inkDepthProbe.mjs`) measures exactly this.
 */
export const depthBelowPaper = (image: Rgba, pxPerMm: number): Int16Array => {
  const { data, width: w, height: h } = image;
  const n = w * h;
  const lum = new Uint8Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    lum[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
  }
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
  const depth = new Int16Array(n);
  for (let y = 0; y < h; y++) {
    const rowPaper = Math.floor(y / block) * bw;
    for (let x = 0; x < w; x++) depth[y * w + x] = paper[rowPaper + Math.floor(x / block)] - lum[y * w + x];
  }
  return depth;
};

/**
 * @param image    the crop, as stored
 * @param pxPerMm  the crop's own resolution
 */
export const measureInk = (image: Rgba, pxPerMm: number): InkMeasure => {
  const { data, width: w, height: h } = image;
  const n = w * h;
  if (n === 0) return { box: null, inkMm2: 0 };

  const depth = depthBelowPaper(image, pxPerMm);
  const dark = new Uint8Array(n);
  const soft = new Uint8Array(n);
  const edge = Math.round(EDGE_MARGIN_MM * pxPerMm);
  // Ink is counted inside the edge margin; printed lines are FOUND over the
  // whole crop. A border whose core sits in the margin must still be seen as
  // a line, or its pale fringe just inside the margin survives as fragments.
  for (let p = 0; p < n; p++) if (depth[p] > LINE_STEP) soft[p] = 1;
  for (let y = edge; y < h - edge; y++) {
    for (let x = edge; x < w - edge; x++) {
      const p = y * w + x;
      if (depth[p] > INK_STEP) dark[p] = 1;
    }
  }

  // Printed lines, found on the soft mask, gaps bridged, in either direction.
  // **Nothing here knows where the rules are, or that there are any.** It
  // removes whatever long straight line it finds, wherever registration put it:
  // a rule, the border leaking in at an edge, a ruled line on some other
  // paper. The page is oriented by its QR and cropped by the declared box;
  // no detection anywhere is keyed on the rules.
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
  // The two tiers: a pixel deeper than DEEP_STEP is ink whatever its shape, so a
  // ruler-drawn pen or heavy-pencil line survives. Only the shallower band,
  // where rules and light strokes overlap, is subject to the straight-line test.
  //
  // The one exception is the box's own border, which is black and so deeper
  // than any step. It is found by the box's DECLARED geometry: a long straight
  // line within BORDER_ZONE_MM of the crop's edge is the border leaking in by
  // a registration error, removed whatever its depth.
  const zone = Math.round(BORDER_ZONE_MM * pxPerMm);
  for (let y = 0; y < h; y++) {
    const edgeRow = y < zone || y >= h - zone;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (line[p] && (depth[p] <= DEEP_STEP || edgeRow || x < zone || x >= w - zone)) dark[p] = 0;
    }
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
