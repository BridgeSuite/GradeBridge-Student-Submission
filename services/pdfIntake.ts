/**
 * pdfIntake.ts — a PDF from a tablet becomes pages, and nothing else.
 *
 * `WORKORDER_SS_PDF_INTAKE_2026-10-08`. GoodNotes, Notability and Samsung
 * Notes export PDF by default, and a page exported from a tablet has no
 * perspective, no shadow and no camera shake. So a PDF is split here into one
 * bitmap per page, and each bitmap then joins the photograph path unchanged:
 * `ingestPage`, then `registerAndCropPage`. **There is no PDF pipeline beyond
 * this file.** What leaves it is pixels, a page number and a size.
 *
 * That last sentence is also the metadata rule. A tablet export can carry its
 * author's name in the document info dictionary or an XMP stream. Nothing here
 * reads either, and nothing returned can carry them: a rendered page is a
 * canvas encoded as PNG, and `ingestPage` re-encodes it as a JPEG from a canvas,
 * which writes no metadata. The name is stripped by never being picked up.
 *
 * This file does not import pdf.js. The engine is passed in, so the browser
 * loads it lazily (`pdfLoader.ts`, only when a student picks a PDF) and the
 * test suite runs this same code in Node against the same version.
 */

import { PAGE_MAX_EDGE } from '../constants';

/**
 * The long edge each page is rendered to: 2,200 px, which is 200 DPI on a US
 * Letter page (792 pt → 2200 px is a scale of 2.778).
 *
 * Not a round number picked here. It is the size the photograph path STORES
 * (`PAGE_MAX_EDGE`), so a rendered page reaches `ingestPage` already at its
 * target and is not resampled a second time: `targetScale` comes out at
 * exactly 1. It is also where the generic box lands at 1,504 × 1,569 px, just
 * under `GENERIC_CROP_LONG_EDGE_PX` (1,600), so the crop keeps what was
 * rendered. On the three real exports of 8 October every answer page rendered
 * to 1,700 × 2,200 with all four corner marks found and the QR decoded.
 *
 * Tied to the constant rather than copied, so the two cannot drift apart.
 */
export const PDF_RENDER_LONG_EDGE_PX = PAGE_MAX_EDGE;

/**
 * The most pages one PDF may add. A handwritten assignment is tens of pages;
 * a PDF of a whole notebook is a mistake, and rendering it would hold a phone
 * for minutes. Refused by name, with what to do instead.
 */
export const PDF_MAX_PAGES = 40;

/** Opening the file: past this the student is told, rather than left waiting. */
export const PDF_OPEN_TIMEOUT_MS = 20_000;
/** One page. A vector page renders in tens of milliseconds; this is for the pathological one. */
export const PDF_PAGE_TIMEOUT_MS = 15_000;

/** How a PDF can be refused. Each has its own words in `PDF_WORDING`. */
export type PdfRefusal = 'empty' | 'encrypted' | 'damaged' | 'too_many_pages' | 'too_slow' | 'unavailable';

/**
 * Every new student-facing sentence the PDF path says, in one place.
 * Each tells the student what to do next, because a refusal they cannot act on
 * is a refusal with no recourse.
 */
export const PDF_WORDING = {
  empty:
    'This PDF is empty — it has no pages in it. Export your pages again from your notes app and add the new file.',
  encrypted:
    'This PDF is password-protected, so its pages cannot be read. Export it again from your notes app ' +
    'without a password, then add it.',
  damaged:
    'This PDF could not be read — it may be damaged or only partly downloaded. Export it again from your ' +
    'notes app and add the new file.',
  tooManyPages: (n: number): string =>
    `This PDF has ${n} pages, and at most ${PDF_MAX_PAGES} can be added from one file. ` +
    'Export only the pages with your answers on them.',
  tooSlow:
    'This PDF took too long to open on this device. Export it again from your notes app, ' +
    'or save the pages as images and add those.',
  /** The reader itself never arrived: the chunk could not be fetched. Not the file's fault. */
  unavailable: 'The PDF reader could not be loaded. Check your connection and add the file again.',
  /** Replace swaps one page; a multi-page PDF there has no meaning. */
  replaceNeedsOnePage: (n: number): string =>
    `This PDF has ${n} pages, and Replace swaps one page. Use "Choose files" to add a PDF ` +
    'with several pages, or export just this page.',
  /** Ruling 7: pages that cannot register are skipped, and the student is told which. */
  pagesNotUsed: (pages: number[], total: number): string => {
    const list = pages.length === 1
      ? `Page ${pages[0]}`
      : `Pages ${pages.slice(0, -1).join(', ')} and ${pages[pages.length - 1]}`;
    const it = pages.length === 1 ? 'it' : 'them';
    const was = pages.length === 1 ? 'was' : 'were';
    return `${list} of ${total} ${was} not used: no answer sheet was found on ${it}. ` +
      `If ${pages.length === 1 ? 'that page is' : 'those pages are'} blank, nothing is lost. If you wrote ` +
      `an answer there, write it on the answer page and export again.`;
  },
  /**
   * Ruling 2: the electronic image answers take images and nothing else. A
   * dropped PDF used to become a broken picture with no word said.
   */
  electronicNotImage: (name: string): string =>
    `${name} was not added: this answer takes images (JPG, PNG or HEIC), not a PDF or other file. ` +
    'Save the page as an image and add that.',
  /** The one line under the upload controls saying a PDF is welcome. */
  // Not "in order": the uploader's footers say order does not matter, and the
  // approved wording of 2026-09-25 forbids telling a student otherwise.
  accepted: 'A PDF from a tablet notes app works too — each of its pages is added for you.',
  notUsedHeading: 'Some pages were not used:',
} as const;

export const refusalMessage = (refusal: PdfRefusal, pageCount = 0): string => {
  switch (refusal) {
    case 'empty': return PDF_WORDING.empty;
    case 'encrypted': return PDF_WORDING.encrypted;
    case 'damaged': return PDF_WORDING.damaged;
    case 'too_many_pages': return PDF_WORDING.tooManyPages(pageCount);
    case 'too_slow': return PDF_WORDING.tooSlow;
    case 'unavailable': return PDF_WORDING.unavailable;
  }
};

// ---------- recognising a PDF ----------

/** By what the browser says, or by name. Bytes are checked once the file is read. */
export const isPdfFile = (file: { type?: string; name?: string }): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');

/** `%PDF-` within the first kilobyte, which is where the specification lets it sit. */
export const hasPdfHeader = (bytes: Uint8Array): boolean => {
  const end = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i < end; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 &&
        bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true;
  }
  return false;
};

/** The size a page is rendered at: long edge `PDF_RENDER_LONG_EDGE_PX`, aspect kept. */
export const renderScale = (widthPt: number, heightPt: number): number =>
  PDF_RENDER_LONG_EDGE_PX / Math.max(widthPt, heightPt);

// ---------- the engine, as little of pdf.js as this file uses ----------

export interface PdfViewport { width: number; height: number }
export interface PdfPageLike {
  getViewport(params: { scale: number }): PdfViewport;
  render(params: { canvas: unknown; canvasContext: unknown; viewport: PdfViewport; background?: string }):
    { promise: Promise<unknown>; cancel(): void };
  cleanup(): unknown;
}
export interface PdfDocumentLike {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
}
export interface PdfEngine {
  /**
   * pdf.js `getDocument`, already configured. The returned task is what
   * releases the document and its worker port: pdf.js 6 has no `destroy` on the
   * document itself, so the task is the one handle that frees it.
   */
  open(data: Uint8Array): { promise: Promise<PdfDocumentLike>; destroy(): Promise<unknown> | unknown };
}
/** A drawing surface and how to get a PNG out of it. Browser: a canvas. Node: the test's canvas. */
export interface PdfSurfaces<Out> {
  create(width: number, height: number): { canvas: unknown; context: CanvasRenderingContext2D };
  encode(canvas: unknown): Promise<Out>;
  release(canvas: unknown): void;
}

export interface RenderedPdfPage<Out> {
  /** 1-based, the PDF's own order. */
  pageNumber: number;
  image: Out;
  width: number;
  height: number;
}

export type PdfSplit<Out> =
  | { ok: true; pageCount: number; pages: RenderedPdfPage<Out>[] }
  | { ok: false; refusal: PdfRefusal; pageCount: number; message: string };

const TIMED_OUT = Symbol('timed out');

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });

/** pdf.js names its errors; anything it cannot name is a file it could not read. */
export const classifyOpenError = (err: unknown): PdfRefusal => {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === 'PasswordException') return 'encrypted';
  return 'damaged';
};

/**
 * Splits a PDF into rendered pages, all or nothing.
 *
 * **All or nothing on purpose.** A file that fails on page 4 after pages 1–3
 * were added would leave a half-loaded submission the student may never
 * notice. So every page is rendered first and handed back only if every page
 * rendered. Whether each page then REGISTERS is a different question, asked
 * after this by the caller, and ruling 7 answers it the other way: a page that
 * renders but carries no answer sheet is skipped and named, and the rest go
 * through.
 *
 * Never throws and never waits forever: every outcome is a value.
 */
export const splitPdf = async <Out>(
  data: Uint8Array, engine: PdfEngine, surfaces: PdfSurfaces<Out>,
  options: { openTimeoutMs?: number; pageTimeoutMs?: number; maxPages?: number } = {},
): Promise<PdfSplit<Out>> => {
  const openTimeout = options.openTimeoutMs ?? PDF_OPEN_TIMEOUT_MS;
  const pageTimeout = options.pageTimeoutMs ?? PDF_PAGE_TIMEOUT_MS;
  const maxPages = options.maxPages ?? PDF_MAX_PAGES;
  const refuse = (refusal: PdfRefusal, pageCount = 0): PdfSplit<Out> =>
    ({ ok: false, refusal, pageCount, message: refusalMessage(refusal, pageCount) });

  if (data.length === 0) return refuse('empty');
  if (!hasPdfHeader(data)) return refuse('damaged');

  // pdf.js may transfer the buffer to its worker; keep the caller's intact.
  const task = engine.open(data.slice());
  let doc: PdfDocumentLike;
  try {
    const opened = await withTimeout(task.promise, openTimeout);
    if (opened === TIMED_OUT) {
      try { await task.destroy(); } catch { /* already gone */ }
      return refuse('too_slow');
    }
    doc = opened;
  } catch (err) {
    try { await task.destroy(); } catch { /* already gone */ }
    return refuse(classifyOpenError(err));
  }

  try {
    const pageCount = doc.numPages;
    if (!pageCount) return refuse('empty');
    if (pageCount > maxPages) return refuse('too_many_pages', pageCount);

    const pages: RenderedPdfPage<Out>[] = [];
    for (let n = 1; n <= pageCount; n++) {
      let surface: { canvas: unknown; context: CanvasRenderingContext2D } | null = null;
      try {
        const page = await doc.getPage(n);
        const natural = page.getViewport({ scale: 1 });
        if (!(natural.width > 0) || !(natural.height > 0)) return refuse('damaged', pageCount);
        const viewport = page.getViewport({ scale: renderScale(natural.width, natural.height) });
        const width = Math.max(1, Math.round(viewport.width));
        const height = Math.max(1, Math.round(viewport.height));

        surface = surfaces.create(width, height);
        // White, not transparent: the page is paper, and an ink layer with an
        // alpha mask (GoodNotes) must land on what a photograph would show.
        surface.context.fillStyle = '#ffffff';
        surface.context.fillRect(0, 0, width, height);

        const job = page.render({
          canvas: surface.canvas, canvasContext: surface.context, viewport, background: '#ffffff',
        });
        const rendered = await withTimeout(job.promise, pageTimeout);
        if (rendered === TIMED_OUT) {
          job.cancel();
          return refuse('too_slow', pageCount);
        }
        const image = await surfaces.encode(surface.canvas);
        pages.push({ pageNumber: n, image, width, height });
        page.cleanup();
      } catch {
        return refuse('damaged', pageCount);
      } finally {
        if (surface) surfaces.release(surface.canvas);
      }
    }
    return { ok: true, pageCount, pages };
  } finally {
    try { await task.destroy(); } catch { /* already gone */ }
  }
};

/**
 * Ruling 7: which pages to keep, given whether each registered.
 * Order is the PDF's own; nothing is reordered and nothing is silently dropped.
 */
export const partitionByRegistration = <P extends { pageNumber: number }>(
  pages: P[], registered: (page: P) => boolean,
): { kept: P[]; notUsed: number[] } => {
  const kept: P[] = [];
  const notUsed: number[] = [];
  for (const p of pages) {
    if (registered(p)) kept.push(p);
    else notUsed.push(p.pageNumber);
  }
  return { kept, notUsed };
};

/** The name a rendered page carries in the uploader, so a student can tell them apart. */
export const renderedPageName = (pdfName: string, pageNumber: number): string =>
  `${(pdfName || 'document.pdf').replace(/\.pdf$/i, '')}, page ${pageNumber}.png`;
