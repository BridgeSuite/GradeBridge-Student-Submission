/**
 * fixedLayoutPdf.ts — draws the plan, with the student's pages or without them.
 *
 * **One function draws both documents.** With images it is the PDF in the
 * student's suitcase; without them it is the blank template a person uploads to
 * Gradescope once and draws the question regions on. They cannot drift, because
 * there is nothing to keep in step: same plan, same constants, same code.
 *
 * **The page images go in directly.** Nothing here rasterises the screen. An
 * older phone cannot hold a canvas of sixteen photographs, and the suitcase has
 * the JPEGs already; `html2canvas` is for the electronic path and stays there.
 *
 * Geometry: `GBHW-1`, section 3 of the homework contract. See `fixedLayout.ts`.
 */

import { jsPDF } from 'jspdf';
import {
  Box, FixedLayoutPlan, GBHW_1, PAGE, PlacedCrop, PlannedPage,
} from './fixedLayout';

const width = (b: Box) => b.x1 - b.x0;
const height = (b: Box) => b.y1 - b.y0;

/** The bytes of one crop, and what they are, or null when it is not available. */
export interface CropImage {
  bytes: Uint8Array;
  /** JPEG on every path the app produces today; declared rather than sniffed. */
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
}

export interface DrawOptions {
  /** Printed in the footer of every page, with "page n of N". */
  assignmentId: string;
  /**
   * The image for a crop key, or null to leave its space empty. **Absent on the
   * blank template**, which is the only difference between the two documents.
   */
  imageFor?: (key: string) => CropImage | null;
  /**
   * The moment stamped into the PDF's own metadata.
   *
   * **Passed in rather than read from the clock, so the document is
   * reproducible.** jsPDF writes a `/CreationDate` from `new Date()` if nobody
   * says otherwise, which made the same submission produce different bytes
   * second to second: two test runs over one fixture disagreed, and worse, the
   * archive's own `files` fingerprint for this entry would change for a student
   * who downloaded the same work twice. The packager already pins `last_saved`
   * for exactly this reason and hands it here, so every byte of the archive is a
   * function of the student's work and nothing else.
   */
  createdAt?: Date | string;
}

/**
 * The moment as a PDF date, in UTC.
 *
 * **Not `doc.setCreationDate(aDate)`**, for two reasons. jsPDF's own conversion
 * uses the machine's time-zone offset, so the same submission built in Davis and
 * in a CI runner would differ in its bytes; and its string path accepts only
 * `D:YYYYMMDDHHmmSS+hh'mm'`, so handing it the ISO timestamp the packager pins
 * throws "Invalid argument passed to jsPDF.setCreationDate". This writes UTC,
 * which is what `last_saved` already is.
 */
const pdfDate = (when: Date | string): string => {
  const d = when instanceof Date ? when : new Date(when);
  const at = Number.isNaN(d.getTime()) ? FIXED_EPOCH : d;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `D:${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}+00'00'`;
};

/** What was drawn, and where, so a test can hold the output to the contract. */
export interface DrawnImage {
  page: number;
  key: string;
  x: number; y: number; w: number; h: number;
}

export interface DrawnPdf {
  bytes: Uint8Array;
  pages: number;
  images: DrawnImage[];
}

const SANS = 'helvetica';

/**
 * The creation date used when the caller names none: the blank template, and any
 * test that does not care. A constant rather than the clock, so two drawings of
 * the same plan are byte-identical and the template can be compared across runs.
 */
const FIXED_EPOCH = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

/** The one gutter between stacked pages in a slot that overran its allotment. */
const STACK_GUTTER = 6;

const drawBox = (doc: jsPDF, b: Box): void => {
  doc.rect(b.x0, b.y0, width(b), height(b));
};

const labelledBox = (doc: jsPDF, b: Box, label: string): void => {
  doc.setFontSize(9);
  doc.text(label, b.x0, b.y0 - 4, { baseline: 'bottom' });
  drawBox(doc, b);
};

/**
 * The largest rectangle of the image's own shape that fits the slot, centred.
 * Aspect is kept, because a stretched answer is a changed answer: a square root
 * sign pulled wide reads as something else, and a grader cannot tell whether
 * the student or the app did it.
 */
const fitted = (img: { width: number; height: number }, slot: Box) => {
  const scale = Math.min(width(slot) / img.width, height(slot) / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  return { x: slot.x0 + (width(slot) - w) / 2, y: slot.y0 + (height(slot) - h) / 2, w, h };
};

/** The answer area split into one row per crop on this page. */
const rowsFor = (count: number): Box[] => {
  const area = GBHW_1.answerArea;
  if (count <= 1) return [area];
  const each = (height(area) - STACK_GUTTER * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x0: area.x0,
    y0: area.y0 + i * (each + STACK_GUTTER),
    x1: area.x1,
    y1: area.y0 + i * (each + STACK_GUTTER) + each,
  }));
};

const footer = (doc: jsPDF, assignmentId: string, n: number, total: number): void => {
  doc.setFontSize(8);
  doc.text(assignmentId, GBHW_1.footer.x0, GBHW_1.footer.y1, { baseline: 'bottom' });
  doc.text(`page ${n} of ${total}`, GBHW_1.footer.x1, GBHW_1.footer.y1,
    { baseline: 'bottom', align: 'right' });
};

const drawNamePage = (doc: jsPDF): void => {
  // The header band is left empty on purpose: the relay stamps the display code
  // there, and anything this app draws would have to be drawn over.
  labelledBox(doc, GBHW_1.nameBox, 'Name');
  labelledBox(doc, GBHW_1.idBox, 'Student ID');
};

const drawAnswerPage = (
  doc: jsPDF, page: Extract<PlannedPage, { kind: 'answer' }>,
  pageNumber: number, imageFor: DrawOptions['imageFor'], drawn: DrawnImage[],
): void => {
  doc.setFontSize(10);
  doc.text(`${page.label}, page ${page.slot} of ${page.allotment}`,
    GBHW_1.partLabel.x0, GBHW_1.partLabel.y1, { baseline: 'bottom' });

  if (page.crops.length === 0) {
    // An allotted page the student submitted nothing for. Said in words rather
    // than left blank, so a grader meeting it knows it is not a lost page.
    drawBox(doc, GBHW_1.answerArea);
    if (imageFor) {
      doc.setFontSize(10);
      doc.text('No page submitted for this part',
        (GBHW_1.answerArea.x0 + GBHW_1.answerArea.x1) / 2,
        (GBHW_1.answerArea.y0 + GBHW_1.answerArea.y1) / 2,
        { align: 'center', baseline: 'middle' });
    }
    return;
  }

  const rows = rowsFor(page.crops.length);
  page.crops.forEach((crop: PlacedCrop, i: number) => {
    const image = imageFor ? imageFor(crop.key) : null;
    if (!image) {
      // The template, or a crop whose bytes are missing. The outline is what
      // Gradescope's region is drawn over, so it is always present.
      drawBox(doc, rows[i]);
      return;
    }
    const at = fitted(image, rows[i]);
    doc.addImage(image.bytes, image.format, at.x, at.y, at.w, at.h, undefined, 'NONE');
    drawn.push({ page: pageNumber, key: crop.key, x: at.x, y: at.y, w: at.w, h: at.h });
  });
};

/**
 * The PDF's `/ID`, derived from the document's own content.
 *
 * **jsPDF seeds this with `Math.random()`**, which is the second thing that made
 * two drawings of one plan differ in their bytes. The PDF specification wants a
 * permanent identifier for the file, so a constant would be wrong across
 * documents and the clock would be wrong across runs: this is a function of the
 * assignment, the pinned moment and the plan, so the same work gives the same
 * identifier and different work does not.
 *
 * A four-word FNV-1a, not a cryptographic hash: `/ID` is a document identifier
 * and nothing in the pipeline trusts it. Integrity is the archive's `files`
 * fingerprints, which are SHA-256 over the bytes.
 */
const fnv1a = (text: string, seed: number): number => {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= text.charCodeAt(i) >>> 8;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

const documentId = (plan: FixedLayoutPlan, assignmentId: string, created: string): string => {
  const seedText = [
    assignmentId, created, String(plan.pages.length),
    ...plan.parts.map(p => `${p.part_id}:${p.allotment}:${p.first_page}:${p.placed.join(',')}`),
  ].join('|');
  return [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map(seed => fnv1a(seedText, seed).toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
};

/**
 * Draw the plan. With `imageFor` this is the student's document; without it,
 * the blank template for Gradescope, which is the same pages with the answer
 * areas outlined and nothing in them.
 */
export const drawFixedLayout = (plan: FixedLayoutPlan, options: DrawOptions): DrawnPdf => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: false });
  // Before anything is drawn, so no path can write the clock's date, or a
  // random identifier, first. Both are jsPDF defaults and both would make the
  // same submission produce different bytes on every build.
  const created = pdfDate(options.createdAt ?? FIXED_EPOCH);
  doc.setCreationDate(created);
  doc.setFileId(documentId(plan, options.assignmentId, created));
  doc.setFont(SANS, 'normal');
  const total = plan.pages.length;
  const drawn: DrawnImage[] = [];

  plan.pages.forEach((page, index) => {
    if (index > 0) doc.addPage('letter', 'portrait');
    if (page.kind === 'name') drawNamePage(doc);
    else drawAnswerPage(doc, page, index + 1, options.imageFor, drawn);
    footer(doc, options.assignmentId, index + 1, total);
  });

  return {
    bytes: new Uint8Array(doc.output('arraybuffer') as ArrayBuffer),
    pages: total,
    images: drawn,
  };
};

/** The blank template: the same pages, with nothing placed in them. */
export const drawBlankTemplate = (plan: FixedLayoutPlan, assignmentId: string): DrawnPdf =>
  drawFixedLayout(plan, { assignmentId });

export { PAGE };
