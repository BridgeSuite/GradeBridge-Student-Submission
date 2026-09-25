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
 * ## THE GOVERNING RULE: when the measure is unsure, it does not say "blank"
 *
 * Every threshold below is imperfect and always will be, so the failure has to
 * be safe by construction, not by tuning. **A page with ink reported as blank is
 * the serious failure**: a student may rewrite work that was fine. So the
 * verdict has three values, and `blank` is a positive claim:
 *
 *   - `ink`: at least `INK_MIN_MM2` of confirmed ink. The ink box is reported.
 *   - `blank`: NO confirmed ink at all, AND no evidence of any kind beyond what
 *     bare paper and pale, box-spanning printed lines produce, AND a photograph
 *     at least as sharp as the real frames on which blank was verified
 *     (`BLANK_SHARPNESS_MIN`, applied by `cropGenericBox`). Only this verdict
 *     tells the student "this looks blank".
 *   - `uncertain`: everything else. No warning, and the package says
 *     `uncertain`, which is not a claim of empty.
 *
 * Evidence against `blank`, each a thing the ink count sets aside: ink below
 * the floor; ink-deep specks (thin broken pencil falls apart into specks);
 * faint marks between `FAINT_STEP` and `INK_STEP` that are not a line;
 * straight lines deeper than printed rules go; and straight lines that do not
 * qualify as printed (they do not span the box, or they are darker along their
 * length than any printed rule measured). In development each of these, when
 * missing, let a page with ink be reported blank, and each is now held by a
 * mutation-tested SAFETY check in `tests/generic-sheet-tests.mjs`.
 *
 * ## What counts as ink
 *
 * Every threshold is a step below the LOCAL paper (`depthBelowPaper`): the
 * 90th percentile of the pixel's own 4 mm block. **This is not a refinement.**
 * On the real generic-page frames a global paper level did not separate ink
 * from shadow at all: an earlier characterisation with one paper level per
 * frame ranked the blank page above two written ones. The local step is what
 * makes a depth threshold mean anything.
 *
 * Two tiers. **Deeper than `DEEP_STEP` is ink whatever its shape.** Between
 * `INK_STEP` and `DEEP_STEP` is ink unless it is part of a long straight line
 * (`RULE_RUN_MM`, found at `LINE_STEP`, gaps up to `RULE_GAP_MM` bridged).
 * Nothing here knows where the rules are, how many there are or whether any
 * exist: orientation comes from the QR and the box from the declared
 * geometry. The box's black border is removed as a long straight line within
 * `BORDER_ZONE_MM` of the crop's edge. A line is judged to span the box by the
 * COVERAGE of its pieces across a `LINE_BAND_MM` band, because a solid printed
 * rule reaches the line test in pieces (below) and tilts a pixel or two.
 *
 * ## Which images set which constant
 *
 * **Seven real frames of the generic page as built (solid rules)**, printed on
 * a real printer and photographed handheld: one phone, one printer, one room,
 * one hand (`tests/captures/generic_page/`, local and uncommitted; the
 * instruments are the photographer's own, written in each page's margin).
 * `tests/genericFrameProbe.mjs`, 2026-09-24, with this module's own method:
 *
 *   - Rule cores (clean columns): p50 23 to 40 by frame, p99 34 to 65; per-line
 *     median at most 52 over 168 rules.
 *   - Strokes' darkest pixel, by written frame: p5 28 to 61, p50 73 to 138.
 *   - Bare paper: p99.9 5 to 20, p99.99 6 to 24, max 36 (04, under shadow).
 *   - QR sharpness: 0.184 to 0.207.
 *
 * **40 real photographs of the app-printed sheet** (dashed rules, same 0.5 pt
 * and 75% grey; `tests/inkDepthProbe.mjs`), for grey levels only: rule cores
 * p99 84, p99.9 160; strokes' darkest p5 40, p50 81; bare paper p99.99 28;
 * QR sharpness 0.125 to 0.214. Their run and gap structure does not transfer.
 *
 *   - `DEEP_STEP` 130, from the printed-sheet set: rules stay above it for
 *     0.8 mm or more on 0.52 mm per metre, never over 2.5 mm; 25% of strokes
 *     reach it.
 *   - `INK_STEP` 30: above bare paper's p99.99 on every frame (6 to 24) and on
 *     the printed-sheet set (28). On the frames 25, 30 and 35 gave identical
 *     verdicts.
 *   - `LINE_STEP` 15: the highest step at which both empty boxes (01, 07) read
 *     blank for every gap and run tried; at 18, 07 reads uncertain. Bare paper
 *     at 15 is isolated noise and never forms a 20 mm line.
 *   - `FAINT_STEP` 20: at or above bare paper's p99.9 on every frame.
 *   - `RULE_GAP_MM` 1.0: the smallest gap tried; every gap from 1 to 3 mm gave
 *     the same verdicts at step 15, and larger gaps chain more real writing
 *     into "lines" (05's counted ink falls from 1,123 to 632 mm² at 3 mm).
 *   - `RULE_RUN_MM` 20: above the longest straight chain pencil prose makes on
 *     the frames (13.1 mm at a 1 mm gap). **Real straight ink is not separable
 *     by length**: 06's pen axes run 86 mm. The deep tier and the evidence rule
 *     protect straight ink, not this constant.
 *   - `LINE_BAND_MM` 0.6: without a band, no rule on the frames counted as
 *     spanning the box.
 *   - `PRINTED_LINE_MEDIAN_MAX` 60: above every real solid rule (52) and the
 *     printed-sheet set's p99 (60).
 *   - `BLANK_SHARPNESS_MIN` 0.18: just under the least sharp frame on which
 *     blank was verified (0.184).
 *   - `SPECK_MM2`, `FAINT_MAX_MM2`, `SPECK_EVIDENCE_MAX_MM2`,
 *     `DEEP_LINE_MAX_MM2`, `RULE_DEPTH_P99`: from the printed-sheet set's bare
 *     paper and rules, as recorded beside each; on the frames every one of
 *     them measured 0 on both empty boxes.
 *   - Safety floors, not tuned: `UNEXPLAINED_LINE_MAX_MM2` 1, `FULL_SPAN` 0.8,
 *     `INK_MIN_MM2` 2. Geometry: `BORDER_ZONE_MM` 3.5.
 *
 * **No synthetic ink set any threshold.** `tests/generic-sheet-tests.mjs`
 * photographs the real exported PDF with synthetic writing; those runs are
 * regression tripwires and the SAFETY assertion, not evidence of accuracy.
 *
 * ## Does a solid rule stay continuous at LINE_STEP 15? Nearly, not wholly.
 *
 * On the two empty frames, 1.3% and 2.9% of clean rule columns dip to 15 or
 * below; the dips are at most 1.4 mm on 01 and 5.4 mm on 07. So a solid rule
 * reaches the line test in a few pieces, and coverage across the band joins
 * them: all 24 rules on both frames span the box. On written frames the dips
 * are larger where the page is shadowed (04: 23.7% of columns, gaps to 65 mm).
 * A blank page under that shadow would read `uncertain`, not blank.
 *
 * ## What breaks it
 *
 * - **Scope.** One phone, one printer, one room. Other phones, printers and
 *   lighting are not covered; the printed-sheet set is the only evidence from
 *   other phones, and it has dashed rules.
 * - **Rules printed darker or heavier** push them past `PRINTED_LINE_MEDIAN_MAX`
 *   and `DEEP_STEP`: blank pages turn `uncertain` or `ink`. Safe direction.
 * - **Shorter, broken or shadowed rules** stop spanning the box: blank pages
 *   turn `uncertain`. Safe direction.
 * - **A blurrier phone** falls under `BLANK_SHARPNESS_MIN`: no blank claims.
 *   Safe direction.
 * - **The page's own instruction.** The page tells the student to write with a
 *   soft pencil (2B or B) or a pen, and that hard pencils photograph badly. 04,
 *   the lightest hard pencil, still read as ink; fainter writing would read
 *   `uncertain` before it read blank, but would lose its ink box. **Weaken that
 *   printed instruction and more answers land on `uncertain`.**
 * - Changing any constant without re-running both probes on real photographs.
 */

import { InkBox } from '../types';
import { Rgba } from './raster';

/** REAL. Deeper than this below the local paper is a candidate mark. (The printed sheet's `cropRegions` keeps its own 40.) */
export const INK_STEP = 30;
/** REAL. Deeper than this below the local paper, a pixel is ink whatever its shape. */
export const DEEP_STEP = 130;
/** Side of the block the local paper level is estimated over. */
export const PAPER_BLOCK_MM = 4;
/** REAL (frames). A straight run at least this long is set aside as a line: above pencil prose's 13.1 mm. */
export const RULE_RUN_MM = 20;
/**
 * REAL (frames). Gaps a printed line may have and still be one line. A feint rule photographed
 * at an angle, resampled and JPEG-compressed breaks into dashes a few pixels
 * apart; unbridged, each dash is too short to be a line and survives as "ink".
 */
export const RULE_GAP_MM = 1.0;
/** REAL (frames). A printed line is found on this softer step, so a pale solid rule stays nearly whole. */
export const LINE_STEP = 15;
/** JUDGEMENT, not measured. Removed on either side of a found line, across it: its anti-aliased fringe. */
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
/** REAL. A connected patch smaller than this is a speck: not counted as ink, kept as evidence. */
export const SPECK_MM2 = 0.5;
/**
 * Rule cores' 99th percentile below local paper, measured. A straight line
 * deeper than this, away from the border, is evidence against "blank".
 */
export const RULE_DEPTH_P99 = 84;
/** More straight-line area than this deeper than RULE_DEPTH_P99, and the page is not blank. */
export const DEEP_LINE_MAX_MM2 = 3;
/**
 * More ink-deep area than this in specks, and the page is not blank. Real bare
 * paper gives about 3.0 mm² deeper than INK_STEP per 38,100 mm² box, as a mean;
 * this is twice that. Its per-box spread is not yet measured.
 */
export const SPECK_EVIDENCE_MAX_MM2 = 6;
/**
 * Pieces of a straight line within this distance across it are taken as one
 * line when judging whether it spans the box: the tilt a registered printed
 * line keeps across 190 mm.
 */
export const LINE_BAND_MM = 0.6;
/**
 * REAL. A line spanning the box is a printed line only if its median depth
 * along its length is at most this. Per-line median core depth of printed
 * rules: at most 52 over 168 solid rules in the seven real generic-page frames;
 * p99 60 over the dashed-rule photographs.
 */
export const PRINTED_LINE_MEDIAN_MAX = 60;
/**
 * REAL. "Blank" is claimed only on a photograph whose QR-block sharpness (the
 * capture gate's metric) is at least this. The seven real generic-page frames,
 * on which blank was verified, measure 0.184 to 0.207; this sits just under the
 * least sharp. Real photographs of the printed sheet measure 0.125 to 0.214
 * (p10 0.160, p50 0.202), so some real photographs will read "uncertain"
 * instead of blank: the safe direction.
 */
export const BLANK_SHARPNESS_MIN = 0.18;
/** A straight line spanning at least this fraction of the box is a printed line, consistent with blank. */
export const FULL_SPAN = 0.8;
/**
 * More area than this on straight lines that do NOT span the box, and the page
 * is not blank. A safety floor, not a tuned value: such a line is a sketch or
 * chained handwriting until a printed-page photograph shows otherwise.
 */
export const UNEXPLAINED_LINE_MAX_MM2 = 1;
/**
 * Faint marks are counted from this step up to INK_STEP. Separate from
 * LINE_STEP: finding a printed line wants a low step, so a pale rule stays
 * whole; counting faint marks wants one above bare paper.
 */
export const FAINT_STEP = 20;
/** More faint (FAINT_STEP to INK_STEP, not a line) area than this, and the page is not blank. */
export const FAINT_MAX_MM2 = 5;
/** Less confirmed ink than this and the page is not reported as having ink. */
export const INK_MIN_MM2 = 2;
/** The reported box is padded by this much, clamped to the crop. */
export const INK_BOX_PAD_MM = 1.5;

/**
 * What the measure concluded. **`blank` is a positive claim** and is made only
 * when there is evidence the box holds nothing but paper and pale printed
 * lines. Anything short of confirmed ink that is not that is `uncertain`,
 * never `blank`: a page with writing reported as blank may send a student to
 * rewrite work that was fine, so the measure must fail toward "not sure".
 */
export type InkVerdict = 'ink' | 'blank' | 'uncertain';

export interface InkMeasure {
  verdict: InkVerdict;
  /** Null when there is no ink. */
  box: InkBox | null;
  /** Ink area in square millimetres, after everything above is removed. */
  inkMm2: number;
  /** Marks between LINE_STEP and INK_STEP that are not a straight line. */
  faintMm2: number;
  /** Straight-line pixels, away from the border, deeper than rules usually go. */
  deepLineMm2: number;
  /** Straight-line pixels, away from the border, on a line that does not span the box. */
  unexplainedMm2: number;
  /** Ink-deep pixels dropped as specks. Dropped from the count, kept as evidence. */
  speckMm2: number;
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
/**
 * Parameters a measurement probe may override, to scan candidate values over
 * real photographs with this exact code. The app never passes any.
 */
export interface InkParams {
  inkStep: number; lineStep: number; faintStep: number;
  ruleRunMm: number; ruleGapMm: number; fullSpan: number;
}

export const measureInk = (image: Rgba, pxPerMm: number, override: Partial<InkParams> = {}): InkMeasure => {
  const k: InkParams = {
    inkStep: INK_STEP, lineStep: LINE_STEP, faintStep: FAINT_STEP,
    ruleRunMm: RULE_RUN_MM, ruleGapMm: RULE_GAP_MM, fullSpan: FULL_SPAN, ...override,
  };
  const { data, width: w, height: h } = image;
  const n = w * h;
  if (n === 0) return { verdict: 'uncertain', box: null, inkMm2: 0, faintMm2: 0, deepLineMm2: 0, unexplainedMm2: 0, speckMm2: 0 };

  const depth = depthBelowPaper(image, pxPerMm);
  const dark = new Uint8Array(n);
  const soft = new Uint8Array(n);
  const edge = Math.round(EDGE_MARGIN_MM * pxPerMm);
  // Ink is counted inside the edge margin; printed lines are FOUND over the
  // whole crop. A border whose core sits in the margin must still be seen as
  // a line, or its pale fringe just inside the margin survives as fragments.
  for (let p = 0; p < n; p++) if (depth[p] > k.lineStep) soft[p] = 1;
  for (let y = edge; y < h - edge; y++) {
    for (let x = edge; x < w - edge; x++) {
      const p = y * w + x;
      if (depth[p] > k.inkStep) dark[p] = 1;
    }
  }

  // Printed lines, found on the soft mask, gaps bridged, in either direction.
  // **Nothing here knows where the rules are, or that there are any.** It
  // removes whatever long straight line it finds, wherever registration put it:
  // a rule, the border leaking in at an edge, a ruled line on some other
  // paper. The page is oriented by its QR and cropped by the declared box;
  // no detection anywhere is keyed on the rules.
  const run = Math.round(k.ruleRunMm * pxPerMm);
  const gap = Math.max(1, Math.round(k.ruleGapMm * pxPerMm));
  const fringe = Math.max(1, Math.round(LINE_FRINGE_MM * pxPerMm));
  const line = new Uint8Array(n);
  // Lines spanning most of the box: what a printed rule or the border is. Only
  // these are EXPLAINED, i.e. consistent with a blank page; any other straight
  // line is removed from the ink count but counts against "blank". If the page
  // ever gets shorter or broken rules, blank pages turn "uncertain", never the
  // reverse: the coupling to the rules' length fails safe.
  const explained = new Uint8Array(n);
  /** Marks runs along one line of pixels; `at(i)` is the i-th pixel's index. */
  //
  // "Spans the box" is judged by COVERAGE, not by the longest piece. A solid
  // rule photographed at this grey dips below the line step in places, so it
  // arrives as several long pieces along one row; together they still cover the
  // box. Measured on the seven real frames: see "Which images set which constant".
  type Run = { lineNo: number; start: number; end: number; along: (i: number) => number; across: number };
  const runs: Run[] = [];
  const findRuns = (lineNo: number, length: number, at: (i: number) => number, across: number): void => {
    let start = -1, last = -1;
    for (let i = 0; i <= length; i++) {
      const on = i < length && soft[at(i)] === 1;
      if (on) {
        if (start < 0) start = i;
        last = i;
      } else if (start >= 0 && (i === length || i - last > gap)) {
        if (last + 1 - start >= run) runs.push({ lineNo, start, end: last, along: at, across });
        start = -1;
      }
    }
  };
  for (let y = 0; y < h; y++) findRuns(y, w, (i) => y * w + i, w);
  const firstColumn = h;   // line numbers: rows are 0..h-1, columns are h..h+w-1
  for (let x = 0; x < w; x++) findRuns(firstColumn + x, h, (i) => i * w + x, 1);
  // Coverage of each row (and each column) by long runs, taken as the UNION of
  // the positions covered within +-LINE_BAND_MM of it. A straight printed line
  // is never exactly on one pixel row after registration: it tilts by a pixel
  // or two across the box, so its pieces land on neighbouring rows and no one
  // row holds them all.
  const band = Math.max(fringe, Math.round(LINE_BAND_MM * pxPerMm));
  const rowCov = new Uint8Array(n), colCov = new Uint8Array(n);
  for (const r of runs) {
    for (let j = r.start; j <= r.end; j++) (r.lineNo < firstColumn ? rowCov : colCov)[r.along(j)] = 1;
  }
  const bandCover = new Float64Array(h + w);
  {
    const seenCol = new Int32Array(w).fill(-1);
    for (let y = 0; y < h; y++) {
      let c = 0;
      for (let d = -band; d <= band; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h) continue;
        for (let x = 0; x < w; x++) if (rowCov[yy * w + x] && seenCol[x] !== y) { seenCol[x] = y; c++; }
      }
      bandCover[y] = c;
    }
    const seenRow = new Int32Array(h).fill(-1);
    for (let x = 0; x < w; x++) {
      let c = 0;
      for (let d = -band; d <= band; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= w) continue;
        for (let y = 0; y < h; y++) if (colCov[y * w + xx] && seenRow[y] !== x) { seenRow[y] = x; c++; }
      }
      bandCover[firstColumn + x] = c;
    }
  }
  // Spanning is not enough: a printed line is also PALE along its length. A
  // pencil line ruled across the whole box spans it too, and on a blurred
  // photograph it can be shallower than DEEP_STEP; only its depth tells it from
  // a rule. So a spanning run explains a blank page only if its median depth is
  // within what real printed lines measure (PRINTED_LINE_MEDIAN_MAX).
  const runMedian = (r: Run): number => {
    const v: number[] = [];
    for (let j = r.start; j <= r.end; j++) v.push(depth[r.along(j)]);
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const covers = (r: Run): boolean =>
    bandCover[r.lineNo] >= k.fullSpan * (r.lineNo < firstColumn ? w : h) &&
    runMedian(r) <= PRINTED_LINE_MEDIAN_MAX;
  for (const r of runs) {
    const spans = covers(r);
    for (let j = r.start; j <= r.end; j++) {
      for (let d = -fringe; d <= fringe; d++) {
        const q = r.along(j) + d * r.across;
        if (q >= 0 && q < n) { line[q] = 1; if (spans) explained[q] = 1; }
      }
    }
  }
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

  // Evidence against "blank", gathered from what the two tiers set aside:
  //  - straight-line pixels away from the border that are deeper than printed
  //    rules usually go (a ruler-drawn line too pale for the deep tier);
  //  - faint marks, between LINE_STEP and INK_STEP, that are not a line.
  let deepLinePx = 0, unexplainedPx = 0;
  const faint = new Uint8Array(n);
  for (let y = edge; y < h - edge; y++) {
    for (let x = edge; x < w - edge; x++) {
      const p = y * w + x;
      const interior = y >= zone && y < h - zone && x >= zone && x < w - zone;
      if (line[p]) {
        if (interior && depth[p] > LINE_STEP && !explained[p]) unexplainedPx++;
        if (interior && depth[p] > RULE_DEPTH_P99) deepLinePx++;
        continue;
      }
      if (depth[p] > k.faintStep && depth[p] <= k.inkStep) faint[p] = 1;
    }
  }

  // Connected patches, 8-connected; specks dropped, the rest counted and boxed.
  const speck = Math.max(1, Math.round(SPECK_MM2 * pxPerMm * pxPerMm));
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  let ink = 0, speckPx = 0;
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
    // A speck is dropped from the ink count but NOT from the evidence: thin,
    // broken pencil falls apart into specks, and a page of them is not blank.
    if (count < speck) { speckPx += count; continue; }
    ink += count;
    if (cx0 < bx0) bx0 = cx0; if (cy0 < by0) by0 = cy0;
    if (cx1 > bx1) bx1 = cx1; if (cy1 > by1) by1 = cy1;
  }

  // Faint patches, the same connectivity and speck size.
  let faintPx = 0;
  for (let p = 0; p < n; p++) {
    if (!faint[p] || seen[p]) continue;
    let count = 0;
    seen[p] = 1;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % w, qy = (q - qx) / w;
      count++;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = qy + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx;
          if (nx < 0 || nx >= w) continue;
          const r = ny * w + nx;
          if (faint[r] && !seen[r]) { seen[r] = 1; stack.push(r); }
        }
      }
    }
    if (count >= speck) faintPx += count;
  }

  const mm2 = (px: number): number => px / (pxPerMm * pxPerMm);
  const inkMm2 = mm2(ink), faintMm2 = mm2(faintPx), deepLineMm2 = mm2(deepLinePx);
  const unexplainedMm2 = mm2(unexplainedPx), speckMm2 = mm2(speckPx);
  if (inkMm2 < INK_MIN_MM2 || bx1 < 0) {
    // Blank only on positive evidence: no confirmed ink AT ALL, faint marks no
    // more than bare paper makes, and no straight line deeper than a rule.
    const blank = ink === 0 && faintMm2 < FAINT_MAX_MM2 && deepLineMm2 < DEEP_LINE_MAX_MM2 &&
      unexplainedMm2 < UNEXPLAINED_LINE_MAX_MM2 && speckMm2 < SPECK_EVIDENCE_MAX_MM2;
    return { verdict: blank ? 'blank' : 'uncertain', box: null, inkMm2, faintMm2, deepLineMm2, unexplainedMm2, speckMm2 };
  }

  const pad = Math.round(INK_BOX_PAD_MM * pxPerMm);
  return {
    box: {
      x0: Math.max(0, bx0 - pad),
      y0: Math.max(0, by0 - pad),
      x1: Math.min(w, bx1 + 1 + pad),
      y1: Math.min(h, by1 + 1 + pad),
    },
    verdict: 'ink',
    inkMm2,
    faintMm2,
    deepLineMm2,
    unexplainedMm2,
    speckMm2,
  };
};
