/**
 * pdfLoader.ts — pdf.js, fetched only when a student picks a PDF.
 *
 * Ruling 4 (`WORKORDER_SS_PDF_INTAKE_2026-10-08`): a student who never uploads
 * a PDF downloads nothing extra. Both imports below are dynamic, so Vite emits
 * pdf.js and its worker as files of their own that the main bundle only names.
 *
 * **The worker comes from our own origin, never a CDN.** That is a constraint,
 * not a convenience: the app makes no third-party request, and a reader that
 * parses files a student supplies is the last thing to fetch from elsewhere.
 * `?url` makes Vite copy the worker into `dist/assets` and hand back its path.
 *
 * Pinned to pdfjs-dist 6.3.289, legacy build (older phone browsers), by
 * Andre Knoesen's ruling of 8 October 2026. No font or character-map data is
 * shipped: handwriting and the sheet's marks and QR are drawn as graphics, and
 * the sheet's printed text, in non-embedded base-14 fonts, falls back to the
 * system's — it plays no part in registration.
 */

import { PdfEngine, PdfSplit, PdfSurfaces, refusalMessage, splitPdf } from './pdfIntake';

let engine: Promise<PdfEngine> | null = null;

const loadEngine = (): Promise<PdfEngine> => {
  if (!engine) {
    engine = (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      // One worker for the session. Left to itself pdf.js starts a worker per
      // document and ends it with the document, which re-fetched and re-parsed
      // 1.3 MB of worker for every PDF a student added. A worker passed in is
      // not ended when the document is.
      const sharedWorker = new pdfjs.PDFWorker();
      return {
        open: (data: Uint8Array) => pdfjs.getDocument({
          data,
          worker: sharedWorker,
          // Nothing fetched on the document's behalf: no fonts, no maps, no wasm.
          disableFontFace: false,
          useSystemFonts: true,
          enableXfa: false,
          stopAtErrors: false,
          verbosity: 0,
        }),
      } as unknown as PdfEngine;
    })();
    // A failed load (offline before the chunk arrived) must not stick: the next
    // PDF the student picks tries again.
    engine.catch(() => { engine = null; });
  }
  return engine;
};

const surfaces: PdfSurfaces<Blob> = {
  create: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, context: canvas.getContext('2d')! };
  },
  // PNG, lossless: the one JPEG encode happens in `ingestPage`, exactly once,
  // as it does for a photograph.
  encode: (canvas) => new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/png');
  }),
  release: (canvas) => {
    (canvas as HTMLCanvasElement).width = 0;
    (canvas as HTMLCanvasElement).height = 0;
  },
  // A page that is one photograph: its JPEG as it sits in the file. The one
  // JPEG encode still happens in `ingestPage`, after it is downsampled there.
  fromJpeg: (bytes) => new Blob([bytes as BlobPart], { type: 'image/jpeg' }),
};

/**
 * Splits a picked PDF into page PNGs. Never throws: a file pdf.js cannot load
 * (or a chunk that could not be fetched) comes back as a named refusal.
 */
export const splitPdfFile = async (file: File): Promise<PdfSplit<Blob>> => {
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf: PdfEngine;
  try {
    pdf = await loadEngine();
  } catch {
    return { ok: false, refusal: 'unavailable', pageCount: 0, message: refusalMessage('unavailable') };
  }
  return splitPdf(data, pdf, surfaces);
};
