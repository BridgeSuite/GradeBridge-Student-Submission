// =====================================================
// A PDF becomes pages, and the pages are photographs from then on
// =====================================================
// `WORKORDER_SS_PDF_INTAKE_2026-10-08`, with Andre Knoesen's rulings of the
// same day. The shipped `services/pdfIntake.ts` runs here with the same
// pdf.js the app pins (6.3.289, legacy build), drawing onto `@napi-rs/canvas`
// where the browser draws onto a <canvas>. Everything after the PNG â€” the
// JPEG the ingest step writes, registration, the capture gate, the generic
// crop and the submission package â€” is the shipped code too.
//
// The acceptance inputs are REAL tablet exports, not PDFs this suite wrote:
// three files from GoodNotes, Notability and Samsung Notes, exported on
// 8 October 2026 from the generic answer page with handwriting on it, and
// described in `FINDINGS_SS_PDF_INTAKE_REAL_EXPORTS_2026-10-08.md` in the
// record repository. Their hashes are checked below, so a fixture that has
// been re-exported or edited cannot quietly become the thing tested.
//
// What this suite DOES generate, it generates because no real file can be
// asked to be broken on demand: the encrypted, damaged and empty refusals, the
// too-many-pages refusal, and the one PDF that carries a name in its metadata
// (done-when 5; the real one is still owed by Andre Knoesen).
// =====================================================

import { webcrypto, createHash } from 'node:crypto';
globalThis.crypto ??= webcrypto;

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { jsPDF } from 'jspdf';
import { loadModule, GENERIC_PAYLOAD, GENERIC_PNG } from './captureSet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const FIX = join(HERE, 'fixtures', 'pdf_intake');

let passed = 0, failed = 0;
const results = [];
const checkAsync = async (name, fn) => {
  try { await fn(); passed++; results.push(`  PASS  ${name}`); }
  catch (err) { failed++; results.push(`  FAIL  ${name}\n          ${err.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertEqual = (actual, expected, msg) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n          expected: ${e}\n          actual:   ${a}`);
};

console.log('\nPDF intake â€” a tablet export becomes pages\n');

const I = await loadModule('services/pdfIntake.ts', 'pdf_intake.mjs');
const C = await loadModule('constants.ts', 'pdf_constants.mjs');
const P = await loadModule('tests/genericPipeline.ts', 'pdf_pipeline.mjs');
const G = await loadModule('services/captureGate.ts', 'pdf_gate.mjs');
await P.initQrReader();
await G.initQrReader();
const pdfjs = await import(pathToFileURL(join(REPO, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);

// ---------- the engine, as the browser's `pdfLoader.ts` configures it ----------

const engine = {
  open: (data) => pdfjs.getDocument({
    data, disableFontFace: false, useSystemFonts: true, enableXfa: false, stopAtErrors: false, verbosity: 0,
  }),
};
/** Node's canvas, standing where the browser's <canvas> stands. Out = PNG bytes. */
const surfaces = {
  create: (w, h) => { const canvas = createCanvas(w, h); return { canvas, context: canvas.getContext('2d') }; },
  encode: async (canvas) => new Uint8Array(await canvas.encode('png')),
  release: () => {},
  fromJpeg: (bytes) => bytes,
};
const split = (bytes, options) => I.splitPdf(bytes, engine, surfaces, options);

/**
 * What `ingestPage` does to a page that arrives at its target size: nothing
 * but the one JPEG encode at `PAGE_JPEG_QUALITY`. No resample â€” that is
 * asserted separately, below â€” so this is the stored page, byte for byte in
 * kind if not in encoder.
 */
const ingestLikeApp = (png) => {
  const img = PNG.sync.read(Buffer.from(png));
  const bytes = new Uint8Array(jpeg.encode({ data: img.data, width: img.width, height: img.height },
    Math.round(C.PAGE_JPEG_QUALITY * 100)).data);
  const back = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { bytes, image: { data: back.data, width: back.width, height: back.height } };
};

// ---------- 0. the inputs are the files that were inspected ----------

results.push('  0. the real exports are the files the findings describe');

const REAL = [
  { file: 'goodnotes_2026-10-08.pdf', app: 'GoodNotes', pages: 2, answerPages: [1, 2],
    sha: '8b9a910232c26ca849ca43b8780e68d1e4bda74dafb31a3b8aae8381659593a3' },
  { file: 'notability_2026-10-08.pdf', app: 'Notability', pages: 3, answerPages: [1, 2],
    sha: '01ea91cddbf81cf6247f5eb3469d028f5c952aef9c70c446756caa9fe6995bdd' },
  { file: 'samsungnotes_2026-10-08.pdf', app: 'Samsung Notes', pages: 2, answerPages: [1, 2],
    sha: '38a634e926c18c3377fb20b028c04581421886181a35b99a199216daa6ad7689' },
];
for (const r of REAL) {
  r.bytes = new Uint8Array(readFileSync(join(FIX, r.file)));
  await checkAsync(`${r.app}: the fixture is the export of 8 October (SHA-256 ${r.sha.slice(0, 12)}â€¦)`, async () =>
    assert(createHash('sha256').update(r.bytes).digest('hex') === r.sha, `${r.file} has changed`));
}
// `WORKORDER_SS_PDF_PAGE_THAT_IS_A_PHOTOGRAPH_2026-10-14`: a real Microsoft
// Print To PDF export of 11 October, one page that is one 4426 Ã— 5728 RGB JPEG.
// Its `/Author` was rewritten in place to a synthetic name before it reached
// this repository (same encoding, same byte length).
const PRINTED = {
  file: 'printtopdf_2026-10-11.pdf', app: 'Print To PDF',
  sha: '43895e5ea4b7bd394a2555a20c82768589a7dd11213a56dfe1f2a56fa1b4a5a8',
};
PRINTED.bytes = new Uint8Array(readFileSync(join(FIX, PRINTED.file)));
await checkAsync(`${PRINTED.app}: the fixture is the export of 11 October (SHA-256 ${PRINTED.sha.slice(0, 12)}â€¦)`, async () =>
  assert(createHash('sha256').update(PRINTED.bytes).digest('hex') === PRINTED.sha, `${PRINTED.file} has changed`));

// ---------- 1. the resolution ----------

results.push('  1. every page is rendered at the size a photograph is stored at');

await checkAsync('the render long edge IS the stored long edge, not a copy of it (2,200 px)', async () => {
  assert(I.PDF_RENDER_LONG_EDGE_PX === C.PAGE_MAX_EDGE && C.PAGE_MAX_EDGE === 2200,
    `${I.PDF_RENDER_LONG_EDGE_PX} vs ${C.PAGE_MAX_EDGE}`);
});
await checkAsync('US Letter renders to exactly 1,700 Ã— 2,200 (200 DPI)', async () => {
  const s = I.renderScale(612, 792);
  assertEqual([Math.round(612 * s), Math.round(792 * s)], [1700, 2200], 'Letter');
  assert(Math.abs(s * 72 - 200) < 1e-9, `${s * 72} DPI`);
});
await checkAsync('ingest does not resample a rendered page a second time: its scale comes out at exactly 1', async () => {
  // `ingestPage`: targetScale = min(1, PAGE_MAX_EDGE / longEdge); it halves first
  // only when the source is more than twice the target. Both, for a rendered page:
  const longEdge = I.PDF_RENDER_LONG_EDGE_PX;
  const targetScale = Math.min(1, C.PAGE_MAX_EDGE / longEdge);
  assert(targetScale === 1, `targetScale ${targetScale}`);
  assert(!(longEdge > longEdge * targetScale * 2), 'would halve first');
  assert(longEdge >= C.PAGE_MIN_SOURCE_EDGE, 'below the dimension gate');
});

// ---------- 2. the three real exports, end to end ----------

results.push('  2. the three real exports go through registration, the gate and the crop');

const generic = { row: null };
{
  const assignment = await P.decryptJson(readFileSync(join(HERE, 'fixtures', 'generic_sheet_sample.json'), 'utf8'));
  const source = P.chooseLayoutSource(null, assignment);
  const map = await P.parseLayoutCsv(source.text, source.name);
  generic.assignment = assignment;
  generic.map = map;
  generic.row = map.rows[0];
}

const timings = [];
for (const r of REAL) {
  const paths = [];
  const out = await split(r.bytes, { onPage: (p) => paths.push(p) });
  r.split = out;
  await checkAsync(`${r.app}: opens and splits into ${r.pages} pages, in order`, async () => {
    assert(out.ok, out.message);
    assertEqual(out.pages.map(p => p.pageNumber), Array.from({ length: r.pages }, (_, i) => i + 1), 'page numbers');
  });
  if (!out.ok) continue;
  await checkAsync(`${r.app}: no page takes the image fast path â€” every page renders, as before`, async () => {
    assertEqual(paths.map(p => p.path), out.pages.map(() => 'render'), 'paths');
    assert(paths.every(p => p.reason !== 'no reader'), `the reader could not follow it: ${JSON.stringify(paths)}`);
  });
  await checkAsync(`${r.app}: every page is 1,700 Ã— 2,200`, async () =>
    assertEqual(out.pages.map(p => [p.width, p.height]), out.pages.map(() => [1700, 2200]), 'sizes'));
  await checkAsync(`${r.app}: what comes back carries pixels, a page number and a size, and nothing else`, async () => {
    for (const p of out.pages) assertEqual(Object.keys(p).sort(), ['height', 'image', 'pageNumber', 'width'], 'keys');
  });

  r.pagesOut = [];
  for (const page of out.pages) {
    const stored = ingestLikeApp(page.image);
    const reg = P.registerPage(stored.image);
    const t0 = Date.now();
    const verdict = G.runCaptureGate(stored.image);
    const gateMs = Date.now() - t0;
    r.pagesOut.push({ pageNumber: page.pageNumber, stored, reg, verdict, png: page.image });
    if (r.answerPages.includes(page.pageNumber)) timings.push({ app: r.app, page: page.pageNumber, gateMs });
  }

  for (const n of r.answerPages) {
    const p = r.pagesOut[n - 1];
    await checkAsync(`${r.app} page ${n}: registers on all four corner marks, QR ${GENERIC_PAYLOAD}`, async () => {
      assert(p.reg.usable && p.reg.status === 'ok', `status ${p.reg.status}: ${p.reg.message}`);
      assert(p.reg.marksFound === 4, `${p.reg.marksFound} marks`);
      assertEqual(p.reg.qr.fields,
        { assignmentId: 'GBGEN1', token: 'HWMSTR', k: 1, n: 1, layoutId: P.GENERIC_LAYOUT_ID }, 'QR');
    });
    await checkAsync(`${r.app} page ${n}: passes the capture gate inside its own budget`, async () =>
      assert(p.verdict.pass, `${p.verdict.failed}: ${p.verdict.message}`));
    await checkAsync(`${r.app} page ${n}: the generic box crops whole, with ink found in it`, async () => {
      const cut = P.cropGenericBox(p.stored.image, p.reg.transform, generic.row, P.GENERIC_CROP_LONG_EDGE_PX,
        P.registeredQrSharpness(p.stored.image, p.reg));
      assert(cut.image.width > 1400 && cut.image.height > 1400 &&
        Math.max(cut.image.width, cut.image.height) <= P.GENERIC_CROP_LONG_EDGE_PX,
        `${cut.image.width}Ã—${cut.image.height}`);
      assert(cut.inkVerdict === 'ink', `ink verdict ${cut.inkVerdict}`);
      p.cut = cut;
    });
  }
}

// Ruling 7: the Notability blank page.
{
  const nb = REAL[1];
  await checkAsync('Notability page 3 is blank and does not register (no QR, no corner marks)', async () => {
    const p = nb.pagesOut[2];
    assert(!p.reg.usable, `page 3 registered: ${p.reg.status}`);
    assert(p.reg.marksFound === 0 && !p.reg.qr, `${p.reg.marksFound} marks, qr ${!!p.reg.qr}`);
  });
  await checkAsync('ruling 7: pages 1 and 2 are kept in order, page 3 is named as not used', async () => {
    const { kept, notUsed } = I.partitionByRegistration(nb.pagesOut, p => p.reg.usable);
    assertEqual(kept.map(p => p.pageNumber), [1, 2], 'kept');
    assertEqual(notUsed, [3], 'not used');
    const message = I.PDF_WORDING.pagesNotUsed(notUsed, nb.pagesOut.length);
    assert(/^Page 3 of 3 was not used/.test(message), message);
  });
  await checkAsync('ruling 7: several pages not used are named together, in order', async () => {
    const m = I.PDF_WORDING.pagesNotUsed([2, 5, 7], 9);
    assert(m.startsWith('Pages 2, 5 and 7 of 9 were not used'), m);
  });
}

// The GoodNotes badge: required test case, both variants.
{
  const gn = REAL[0];
  const BADGE = { x0: 44, x1: 414, y0: 2107, y1: 2155 };   // 200 DPI render, from the findings
  const inkIn = (png, box) => {
    const img = PNG.sync.read(Buffer.from(png));
    let dark = 0;
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i] + img.data[i + 1] + img.data[i + 2] < 600) dark++;
    }
    return dark;
  };
  const unbadge = (png) => {
    const img = PNG.sync.read(Buffer.from(png));
    for (let y = BADGE.y0; y <= BADGE.y1; y++) for (let x = BADGE.x0; x <= BADGE.x1; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    }
    return PNG.sync.write(img);
  };
  for (const p of gn.pagesOut) {
    await checkAsync(`GoodNotes page ${p.pageNumber}: the badge really is there, below the bottom-left mark`, async () => {
      const dark = inkIn(p.png, BADGE);
      assert(dark > 500, `only ${dark} dark pixels where the badge should be: the test would be vacuous`);
    });
    await checkAsync(`GoodNotes page ${p.pageNumber}, BADGED: registers on four marks and passes the gate`, async () => {
      assert(p.reg.usable && p.reg.marksFound === 4, `${p.reg.status}, ${p.reg.marksFound} marks`);
      assert(p.verdict.pass, p.verdict.message);
    });
    await checkAsync(`GoodNotes page ${p.pageNumber}, UNBADGED: registers on four marks and passes the gate`, async () => {
      const clean = unbadge(p.png);
      assert(inkIn(clean, BADGE) === 0, 'badge not removed');
      const stored = ingestLikeApp(clean);
      const reg = P.registerPage(stored.image);
      assert(reg.usable && reg.marksFound === 4, `${reg.status}, ${reg.marksFound} marks`);
      assert(G.runCaptureGate(stored.image).pass, 'gate refused');
      const dx = Math.abs(reg.transform[2] - p.reg.transform[2]), dy = Math.abs(reg.transform[5] - p.reg.transform[5]);
      assert(dx < 1 && dy < 1, `the badge moved the fit by ${dx.toFixed(2)}, ${dy.toFixed(2)} px`);
    });
  }
}

// ---------- 3. refusals, by name ----------

results.push('  3. an encrypted, damaged or empty PDF is refused by name, and nothing is half-loaded');

const refusedAs = async (label, bytes, refusal, message) => {
  await checkAsync(`${label}: refused as ${refusal}`, async () => {
    let out;
    try { out = await split(bytes); } catch (err) { throw new Error(`threw: ${err.message}`); }
    assert(out.ok === false, `accepted, ${out.pages?.length} pages`);
    assert(out.refusal === refusal, `refused as ${out.refusal}: ${out.message}`);
    assert(out.message === message, `message: ${out.message}`);
    assert(!('pages' in out), 'a refusal carried pages');
  });
};

const jsPdfBytes = (doc) => new Uint8Array(doc.output('arraybuffer'));
const encrypted = (() => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter',
    encryption: { userPassword: 'student', ownerPassword: 'owner', userPermissions: ['print'] } });
  doc.text('answers', 72, 72);
  return jsPdfBytes(doc);
})();
const emptyDocument = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[]/Count 0>> endobj\n' +
  'trailer <</Root 1 0 R>>\n%%EOF\n');
const garbage = (() => {
  const head = new TextEncoder().encode('%PDF-1.7\n');
  const body = new Uint8Array(4000);
  let x = 7;
  for (let i = 0; i < body.length; i++) { x = (x * 1103515245 + 12345) >>> 0; body[i] = x >>> 24; }
  const out = new Uint8Array(head.length + body.length); out.set(head); out.set(body, head.length);
  return out;
})();
const jpegNamedPdf = new Uint8Array(readFileSync(GENERIC_PNG)).slice(0, 4096);

await refusedAs('a password-protected PDF', encrypted, 'encrypted', I.PDF_WORDING.encrypted);
await refusedAs('a PDF whose body is noise after a valid header', garbage, 'damaged', I.PDF_WORDING.damaged);
await refusedAs('an image file named .pdf (no %PDF header)', jpegNamedPdf, 'damaged', I.PDF_WORDING.damaged);
await refusedAs('a zero-byte file', new Uint8Array(0), 'empty', I.PDF_WORDING.empty);
await refusedAs('a well-formed PDF with no pages in it', emptyDocument, 'empty', I.PDF_WORDING.empty);
{
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  for (let i = 1; i < I.PDF_MAX_PAGES + 1; i++) doc.addPage();
  const n = I.PDF_MAX_PAGES + 1;
  await refusedAs(`a ${n}-page PDF`, jsPdfBytes(doc), 'too_many_pages', I.PDF_WORDING.tooManyPages(n));
}
await checkAsync('the password-protected PDF really is password-protected (the refusal is not vacuous)', async () => {
  let name = null;
  const task = pdfjs.getDocument({ data: encrypted.slice(), verbosity: 0 });
  try { await task.promise; } catch (e) { name = e.name; }
  await task.destroy();
  assert(name === 'PasswordException', `pdf.js said ${name}`);
});
await checkAsync('a truncated real export does not throw, and either renders whole or is refused as damaged', async () => {
  const cut = REAL[0].bytes.slice(0, Math.floor(REAL[0].bytes.length * 0.6));
  const out = await split(cut);
  assert(out.ok ? out.pages.length === out.pageCount : out.refusal === 'damaged',
    out.ok ? `${out.pages.length} of ${out.pageCount}` : out.refusal);
  results.push(`        (60% of the GoodNotes export: ${out.ok ? `recovered, ${out.pages.length} pages` : out.refusal})`);
});
await checkAsync('a PDF that never finishes opening is refused as too slow, not waited on', async () => {
  let destroyed = false;
  const stuck = { open: () => ({ promise: new Promise(() => {}), destroy: () => { destroyed = true; } }) };
  const out = await I.splitPdf(REAL[0].bytes, stuck, surfaces, { openTimeoutMs: 50 });
  assert(out.ok === false && out.refusal === 'too_slow' && out.message === I.PDF_WORDING.tooSlow, JSON.stringify(out));
  assert(destroyed, 'the loading task was left running');
});
await checkAsync('a page that fails to render refuses the whole file: no half-load', async () => {
  const flaky = { open: (data) => {
    const task = engine.open(data);
    return { destroy: () => task.destroy(), promise: task.promise.then(doc => ({
      numPages: doc.numPages,
      getPage: async (n) => { if (n === 2) throw new Error('bad page'); return doc.getPage(n); },
    })) };
  } };
  const out = await I.splitPdf(REAL[0].bytes, flaky, surfaces);
  assert(out.ok === false && out.refusal === 'damaged', JSON.stringify(out.refusal));
  assert(!('pages' in out), 'page 1 came back');
});
await checkAsync('an owner-password-only PDF (no password to open it) is accepted: nothing stops a student reading it', async () => {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', encryption: { ownerPassword: 'owner', userPermissions: ['print'] } });
  doc.text('answers', 72, 72);
  const out = await split(jsPdfBytes(doc));
  assert(out.ok && out.pages.length === 1, out.ok ? `${out.pages.length} pages` : out.message);
});

// ---------- 4. nothing identifying from the PDF reaches the package ----------

results.push('  4. a PDF carrying a name in its metadata and its file name (generated; the real one is owed)');

const NAME = 'Ottoline Quarrender';
const NAME_TOKENS = ['Ottoline', 'Quarrender'];
const named = (() => {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  doc.addImage(new Uint8Array(readFileSync(GENERIC_PNG)), 'PNG', 0, 0, 215.9, 279.4);
  doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.6);
  for (let y = 80; y < 200; y += 12) doc.line(30, y, 170, y + 4);   // the "handwriting"
  doc.setProperties({ title: `${NAME} HW1`, subject: NAME, author: NAME, keywords: NAME, creator: NAME });
  doc.addMetadata(`<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${NAME}</dc:creator></rdf:Description>`, 'http://purl.org/dc/elements/1.1/');
  return jsPdfBytes(doc);
})();
const NAMED_FILE = `${NAME} HW1.pdf`;
const containsName = (bytes) => {
  const text = Buffer.from(bytes).toString('latin1');
  const utf16 = Buffer.from(bytes).toString('utf16le');
  return NAME_TOKENS.some(t => text.includes(t) || utf16.includes(t) ||
    text.toLowerCase().includes(t.toLowerCase()));
};

await checkAsync('the generated PDF does carry the name: in Info, in XMP, and pdf.js reads it back', async () => {
  assert(containsName(named), 'name not in the bytes');
  const task = pdfjs.getDocument({ data: named.slice(), verbosity: 0 });
  const md = await (await task.promise).getMetadata();
  await task.destroy();
  assert(md.info.Author === NAME && md.info.Title.includes(NAME), JSON.stringify(md.info));
  assert(md.metadata && JSON.stringify([...md.metadata]).includes(NAME_TOKENS[1]), 'XMP not read back');
});

let namedPackage = null;
await checkAsync('it goes through end to end, and the package contains the name nowhere', async () => {
  const out = await split(named);
  assert(out.ok && out.pages.length === 1, out.ok ? `${out.pages.length} pages` : out.message);
  const png = out.pages[0].image;
  assert(!containsName(png), 'the rendered PNG carries the name');
  const pngChunks = [];
  for (let o = 8; o < png.length;) {
    const len = Buffer.from(png.slice(o, o + 4)).readUInt32BE(0);
    pngChunks.push(Buffer.from(png.slice(o + 4, o + 8)).toString('latin1'));
    o += 12 + len;
  }
  assert(!pngChunks.some(c => /^(tEXt|iTXt|zTXt|eXIf)$/.test(c)), `PNG chunks ${pngChunks}`);

  const stored = ingestLikeApp(png);
  const reg = P.registerPage(stored.image);
  assert(reg.usable, `the named page did not register: ${reg.status}`);
  const cut = P.cropGenericBox(stored.image, reg.transform, generic.row, P.GENERIC_CROP_LONG_EDGE_PX,
    P.registeredQrSharpness(stored.image, reg));
  const cropBytes = new Uint8Array(jpeg.encode({ data: Buffer.from(cut.image.data.buffer), width: cut.image.width,
    height: cut.image.height }, 90).data);

  const blobs = { pg1: stored.bytes };
  const page = { id: 'pg1', file: 'page_1.jpg', width: stored.image.width, height: stored.image.height,
    bytes: stored.bytes.length, sourceName: I.renderedPageName(NAMED_FILE, 1), warnings: [],
    registration: { status: 'ok', k: 1, n: 1, layoutId: P.GENERIC_LAYOUT_ID, marksFound: reg.marksFound },
    captureId: 'cap-1' };
  const record = P.genericCropRecord({ row: generic.row, width: cut.image.width, height: cut.image.height,
    bytes: cropBytes.length, flags: cut.flags, inkBox: cut.inkBox, inkVerdict: cut.inkVerdict }, 'pg1', [], 'c1');
  blobs[P.cropBlobKey(record.regionId)] = cropBytes;
  let crops = P.mergeRecutCrops({}, { [record.regionId]: record });
  crops = P.labelGenericCrop(crops, record.regionId, generic.assignment.parts[0].part_id);
  const s = { assignment: generic.assignment, submissionData: {}, isHandwritten: true,
    layoutId: P.GENERIC_LAYOUT_ID, pages: [page], crops, now: '2026-10-08T12:00:00.000Z' };
  const sources = { ...s, personalInfoConfirmation: P.confirmPersonalInfo(s) };
  const built = await P.buildSubmissionPackage(sources, { readBlob: async (k) => blobs[k] ?? null,
    downsampleImage: async (u) => u });
  const archive = await built.zip.generateAsync({ type: 'uint8array' });
  const zip = await JSZip.loadAsync(archive);
  const leaks = [];
  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (containsName(new TextEncoder().encode(entryName))) leaks.push(`entry name ${entryName}`);
    if (containsName(await entry.async('uint8array'))) leaks.push(entryName);
  }
  if (containsName(archive)) leaks.push('the archive bytes');
  assert(leaks.length === 0, `the name reached: ${leaks.join(', ')}`);
  namedPackage = Object.keys(zip.files);
});
if (namedPackage) results.push(`        (package entries: ${namedPackage.join(', ')})`);

// ---------- 5. which inputs take a PDF (ruling 1), and the electronic refusal (ruling 2) ----------

results.push('  5. the inputs, as ruled');

const src = (p) => readFileSync(join(REPO, p), 'utf8');
const inputs = (text) => [...text.matchAll(/<input[\s\S]*?\/>/g)].map(m => m[0]);
const takesPdf = (tag) => /accept="[^"]*(application\/pdf|\.pdf)/.test(tag);

await checkAsync('PageUploader: "Choose files" and Replace take a PDF; the two camera inputs do not', async () => {
  const tags = inputs(src('components/PageUploader.tsx'));
  const by = (ref) => tags.find(t => t.includes(`ref={${ref}}`));
  assert(takesPdf(by('chooseRef')) && takesPdf(by('replaceRef')), 'chooser or replace does not take a PDF');
  assert(!takesPdf(by('cameraRef')) && !takesPdf(by('retakeRef')), 'a camera input takes a PDF');
  assert(/capture="environment"/.test(by('cameraRef')) && /capture="environment"/.test(by('retakeRef')),
    'the camera inputs lost their capture attribute');
});
for (const file of ['components/CropReview.tsx', 'components/GenericPageReview.tsx', 'components/SubmissionWidget.tsx']) {
  await checkAsync(`${file}: no input takes a PDF`, async () => {
    const tags = inputs(src(file));
    assert(tags.length > 0 && !tags.some(takesPdf), `${tags.length} inputs, one takes a PDF`);
  });
}
await checkAsync('the drop zone and the chooser share one path, so the drop zone takes a PDF too', async () => {
  const text = src('components/PageUploader.tsx');
  assert(/handleDrop[\s\S]*?processFiles\(/.test(text) && /handleChoose[\s\S]*?processFiles\(/.test(text) &&
    /if \(isPdfFile\(file\)\)/.test(text), 'the drop zone does not reach the PDF branch');
});
await checkAsync('the electronic path refuses a non-image by type before it can become a picture', async () => {
  const text = src('components/SubmissionWidget.tsx');
  const body = text.slice(text.indexOf('const processFiles'), text.indexOf('const removeImage'));
  const refuse = body.indexOf('files.find(f => !isImageFile(f))');
  assert(refuse > 0 && refuse < body.indexOf('readAsDataURL'), 'no type refusal ahead of the data URI');
  assert(!/alert\(PDF_WORDING/.test(text), 'the refusal is an alert, which a browser may suppress');
});
await checkAsync('isPdfFile recognises a PDF by type or by name, and nothing else', async () => {
  assert(I.isPdfFile({ type: 'application/pdf', name: 'x' }) && I.isPdfFile({ type: '', name: 'Page.PDF' }), 'missed');
  assert(!I.isPdfFile({ type: 'image/jpeg', name: 'scan.jpg' }) && !I.isPdfFile({ type: '', name: 'pdf.png' }), 'false hit');
});

// ---------- 6. a page that is one photograph is unwrapped, not rendered ----------

results.push('  6. a page that is one photograph goes down the photograph path (WORKORDER_SS_PDF_PAGE_THAT_IS_A_PHOTOGRAPH)');

/**
 * What `ingestPage` does to a JPEG: decode, step down in halves to the stored
 * size, one JPEG encode. Same arithmetic as `imageIngest.ts`; the canvas is
 * Node's where the browser's would be.
 */
const ingestJpegLikeApp = async (jpegBytes) => {
  const img = await loadImage(Buffer.from(jpegBytes));
  const W = img.width, H = img.height;
  const scale = Math.min(1, C.PAGE_MAX_EDGE / Math.max(W, H));
  const tW = Math.max(1, Math.round(W * scale)), tH = Math.max(1, Math.round(H * scale));
  const halveFirst = W > tW * 2 && H > tH * 2;
  const draw = (src, w, h) => {
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return c;
  };
  let current = draw(img, halveFirst ? Math.round(W / 2) : tW, halveFirst ? Math.round(H / 2) : tH);
  while (current.width > tW * 2 && current.height > tH * 2) {
    current = draw(current, Math.max(tW, Math.round(current.width / 2)), Math.max(tH, Math.round(current.height / 2)));
  }
  if (current.width !== tW || current.height !== tH) current = draw(current, tW, tH);
  const rgba = current.getContext('2d').getImageData(0, 0, tW, tH).data;
  const bytes = new Uint8Array(jpeg.encode({ data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: tW, height: tH },
    Math.round(C.PAGE_JPEG_QUALITY * 100)).data);
  const back = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  return { bytes, image: { data: back.data, width: back.width, height: back.height } };
};

/**
 * The registration a fast-path page must match its render on: the same marks,
 * the same QR fields, and a residual within this many millimetres of the
 * render's (both well inside the 1.0 mm budget). Chosen against the findings:
 * across fifteen real pages residual ran 0.12â€“0.22 mm, so 0.25 mm admits the
 * whole spread of normal pages and nothing that moves a crop.
 */
const RESIDUAL_TOLERANCE_MM = 0.25;
const QR_EXPECTED = () => ({ assignmentId: 'GBGEN1', token: 'HWMSTR', k: 1, n: 1, layoutId: P.GENERIC_LAYOUT_ID });
const sameRegistration = (reg, ref, label) => {
  assert(reg.usable && reg.status === 'ok', `${label}: status ${reg.status}: ${reg.message}`);
  assert(reg.marksFound === ref.marksFound, `${label}: ${reg.marksFound} marks, the reference found ${ref.marksFound}`);
  assertEqual(reg.qr.fields, ref.qr.fields, `${label}: QR`);
  const d = Math.abs(reg.residualMm - ref.residualMm);
  assert(d <= RESIDUAL_TOLERANCE_MM,
    `${label}: residual ${reg.residualMm.toFixed(3)} mm against ${ref.residualMm.toFixed(3)} mm (Î” ${d.toFixed(3)})`);
};

const printed = { paths: [] };
{
  const t0 = performance.now();
  printed.fast = await split(PRINTED.bytes, { onPage: (p) => printed.paths.push(p) });
  printed.fastMs = performance.now() - t0;
}
await checkAsync('Print To PDF: its one page takes the image fast path', async () => {
  assert(printed.fast.ok, printed.fast.message);
  assertEqual(printed.paths, [{ pageNumber: 1, path: 'image' }], 'paths');
});
await checkAsync('Print To PDF: intake completes in under two seconds', async () =>
  assert(printed.fastMs < 2000, `${Math.round(printed.fastMs)} ms`));
await checkAsync('Print To PDF: what comes back is the page\'s own JPEG, at its own size, with the same four keys', async () => {
  const p = printed.fast.pages[0];
  assertEqual(Object.keys(p).sort(), ['height', 'image', 'pageNumber', 'width'], 'keys');
  assertEqual([p.width, p.height], [4426, 5728], 'size');
  assert(p.image[0] === 0xff && p.image[1] === 0xd8, 'not a JPEG');
  const at = Buffer.from(PRINTED.bytes).indexOf(Buffer.from(p.image.slice(0, 64)));
  assert(at > 0 && Buffer.from(PRINTED.bytes.subarray(at, at + p.image.length)).equals(Buffer.from(p.image)),
    'the bytes are not the image stream as it sits in the file');
});
await checkAsync('Print To PDF: the JPEG handed on carries none of the file\'s metadata (the /Author name)', async () => {
  const img = Buffer.from(printed.fast.pages[0].image);
  for (const token of ['Tomasz', 'Welbrink']) {
    for (const enc of ['latin1', 'utf16le']) assert(!img.includes(Buffer.from(token, enc)), `${token} in ${enc}`);
    assert(!img.includes(Buffer.from(token, 'utf16le').swap16()), `${token} in UTF-16BE`);
  }
  assert(Buffer.from(PRINTED.bytes).includes(Buffer.from('Welbrink', 'utf16le').swap16()),
    'the fixture does not carry the name: the check above would be vacuous');
});

printed.render = await split(PRINTED.bytes, { imagePages: false });
await checkAsync('Print To PDF, forced to render: still renders (the comparison has a reference)', async () =>
  assert(printed.render.ok && printed.render.pages.length === 1, printed.render.message));
if (printed.fast.ok && printed.render.ok) {
  const t0 = performance.now();
  printed.fastStored = await ingestJpegLikeApp(printed.fast.pages[0].image);
  printed.ingestMs = performance.now() - t0;
  printed.fastReg = P.registerPage(printed.fastStored.image);
  printed.renderStored = ingestLikeApp(printed.render.pages[0].image);
  printed.renderReg = P.registerPage(printed.renderStored.image);
  await checkAsync('Print To PDF: the render registers on four marks with the expected QR (the reference is sound)', async () => {
    assert(printed.renderReg.usable && printed.renderReg.marksFound === 4, `${printed.renderReg.status}, ${printed.renderReg.marksFound} marks`);
    assertEqual(printed.renderReg.qr.fields, QR_EXPECTED(), 'QR');
  });
  await checkAsync('Print To PDF: the fast path is stored at the size a render is (1,700 Ã— 2,200)', async () =>
    assertEqual([printed.fastStored.image.width, printed.fastStored.image.height], [1700, 2200], 'stored size'));
  await checkAsync(`Print To PDF: the fast path registers as the render does â€” same marks, same QR, residual within ${RESIDUAL_TOLERANCE_MM} mm`, async () =>
    sameRegistration(printed.fastReg, printed.renderReg, 'fast path'));
  await checkAsync('Print To PDF: the fast-path page passes the capture gate', async () => {
    const v = G.runCaptureGate(printed.fastStored.image);
    assert(v.pass, `${v.failed}: ${v.message}`);
  });
  results.push(`        (fast path: split ${Math.round(printed.fastMs)} ms, ingest ${Math.round(printed.ingestMs)} ms; ` +
    `residual ${printed.fastReg.residualMm?.toFixed(3)} mm fast, ${printed.renderReg.residualMm?.toFixed(3)} mm rendered)`);
}

// ---------- 7. each gate condition, broken one at a time ----------

results.push('  7. the fixture, broken one gate condition at a time, renders instead and registers the same');

const R = await loadModule('services/pdfImagePage.ts', 'pdf_image_page.mjs');
const JPEG = (await (await R.openImagePageReader(PRINTED.bytes)).page(1)).jpeg;
/** The fixture's own content stream, as Print To PDF wrote it: a white fill, two clips, the image. */
const BASE_CONTENT = [
  '0.750000 0.000000 0.000000 -0.750000 0.000000 792.000000 cm', 'q', 'q',
  '1.000000 0.000000 0.000000 1.000000 0.000000 0.000000 cm', '1.000000 1.000000 1.000000 rg',
  '0.000000 0.000000 m', '816.000000 0.000000 l', '816.000000 1056.000000 l', '0.000000 1056.000000 l', 'h', 'f*', 'Q',
  'q', '0.000000 0.005432 m', '816.000000 0.005432 l', '816.000000 1055.989990 l', '0.000000 1055.989990 l',
  '0.000000 0.005432 l', 'h', 'W* n', 'q', '1.000000 0.000000 0.000000 1.000000 0.000000 0.000000 cm',
  '0.000000 0.000000 m', '816.000000 0.000000 l', '816.000000 1056.000000 l', '0.000000 1056.000000 l', 'h', 'W* n',
  '0.184323 0.000000 0.000000 0.184323 0.000000 0.005432 cm', 'q',
  '4427.000000 0.000000 0.000000 -5728.999512 0.000000 5728.999512 cm', '/Image1 Do', 'Q', 'Q', 'Q', 'Q',
].join('\n');
/** An 8 Ã— 8 white image, unfiltered: a second image that changes no pixel. */
const WHITE_8 = '<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /BitsPerComponent 8 /ColorSpace /DeviceGray /Length 64 >>';

/** The fixture's page rebuilt around its own JPEG, with exactly one thing changed. */
const rebuild = ({ content = BASE_CONTENT, imageExtra = '', colorSpace = '/DeviceRGB', pageExtra = '', resourcesExtra = '', xobjectExtra = '', extra = [] } = {}) => {
  const chunks = [];
  let length = 0;
  const offsets = [];
  const add = (b) => { const u = typeof b === 'string' ? Buffer.from(b, 'latin1') : Buffer.from(b); chunks.push(u); length += u.length; };
  const obj = (n, dict, stream) => {
    offsets[n] = length;
    add(`${n} 0 obj\n${dict}\n`);
    if (stream) { add('stream\n'); add(stream); add('\nendstream\n'); }
    add('endobj\n');
  };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Image1 4 0 R ${xobjectExtra} >> ` +
    `${resourcesExtra} >> /Contents 5 0 R ${pageExtra} >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width 4426 /Height 5728 /BitsPerComponent 8 /ColorSpace ${colorSpace} ` +
    `/Filter /DCTDecode /Length ${JPEG.length} ${imageExtra} >>`, JPEG);
  const body = Buffer.from(content, 'latin1');
  obj(5, `<< /Length ${body.length} >>`, body);
  extra.forEach((e, i) => obj(6 + i, e.dict, e.stream));
  const count = 6 + extra.length;
  const xref = length;
  add(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) add(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(Buffer.concat(chunks));
};
const insertBeforeImage = (ops) => BASE_CONTENT.replace('/Image1 Do', `${ops}\n/Image1 Do`);

const BREAKAGES = [
  { condition: 'one-image', label: 'a second image (8 Ã— 8, white, painted first)', reason: 'one-image',
    pdf: () => rebuild({ xobjectExtra: '/Im2 6 0 R', extra: [{ dict: WHITE_8, stream: new Uint8Array(64).fill(255) }],
      content: `${BASE_CONTENT}\nq 6 0 0 6 400 1040 cm /Im2 Do Q` }) },
  { condition: 'text', label: 'one invisible text operation', reason: 'text',
    pdf: () => rebuild({ resourcesExtra: '/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>',
      content: `BT /F1 8 Tf 3 Tr 300 4 Td (x) Tj ET\n${BASE_CONTENT}` }) },
  { condition: 'drawing', label: 'a short stroke in the bottom margin', reason: 'drawing',
    pdf: () => rebuild({ content: `${BASE_CONTENT}\n0.5 w 400 1050 m 410 1050 l S` }) },
  { condition: 'drawing', label: 'a small white fill painted AFTER the image', reason: 'drawing',
    pdf: () => rebuild({ content: `${BASE_CONTENT}\n1 1 1 rg 400 1040 6 6 re f` }) },
  { condition: 'coverage', label: 'the image shrunk to 96%, centred', reason: 'coverage',
    pdf: () => rebuild({ content: insertBeforeImage('0.96 0 0 0.96 0.02 0.02 cm') }) },
  { condition: 'coverage', label: 'a clip 1.5% inside the page edge', reason: 'coverage',
    pdf: () => rebuild({ content: `9 12 594 768 re W n\n${BASE_CONTENT}` }) },
  { condition: 'colour', label: 'a CalRGB colour space', reason: 'colour',
    pdf: () => rebuild({ colorSpace: '[/CalRGB << /WhitePoint [0.9505 1 1.089] >>]' }) },
  { condition: 'colour', label: 'a soft mask (fully opaque)', reason: 'colour',
    pdf: () => rebuild({ imageExtra: '/SMask 6 0 R', extra: [{ dict: WHITE_8, stream: new Uint8Array(64).fill(255) }] }) },
  { condition: 'colour', label: 'a /Decode array (the identity)', reason: 'colour',
    pdf: () => rebuild({ imageExtra: '/Decode [0 1 0 1 0 1]' }) },
  { condition: 'rotation', label: '/Rotate 180', reason: 'rotation',
    pdf: () => rebuild({ pageExtra: '/Rotate 180' }) },
  { condition: 'annotations', label: 'one annotation (a 2 pt white square)', reason: 'annotations',
    pdf: () => rebuild({ pageExtra: '/Annots [<< /Type /Annot /Subtype /Square /Rect [300 2 302 4] /C [1 1 1] /F 4 >>]' }) },
];

await checkAsync('the rebuild itself, unaltered, takes the fast path and registers as the fixture does (the control)', async () => {
  const paths = [];
  const out = await split(rebuild(), { onPage: (p) => paths.push(p) });
  assert(out.ok, out.message);
  assertEqual(paths.map(p => p.path), ['image'], 'path');
  assert(Buffer.from(out.pages[0].image).equals(Buffer.from(JPEG)), 'different bytes');
});

const breakageTimes = [];
for (const b of BREAKAGES) {
  await checkAsync(`${b.condition}: ${b.label} â†’ falls back to the render path, and registers the same`, async () => {
    const paths = [];
    const t0 = performance.now();
    const out = await split(b.pdf(), { onPage: (p) => paths.push(p) });
    breakageTimes.push(performance.now() - t0);
    assert(out.ok, out.message);
    assert(paths.length === 1 && paths[0].path === 'render', `path ${JSON.stringify(paths)}`);
    assert(paths[0].reason === b.reason, `refused for ${paths[0].reason} (${paths[0].detail}), not ${b.reason}`);
    sameRegistration(P.registerPage(ingestLikeApp(out.pages[0].image).image), printed.fastReg, b.label);
  });
}
if (breakageTimes.length) {
  results.push(`        (${breakageTimes.length} renders, ${Math.round(Math.min(...breakageTimes))}â€“${Math.round(Math.max(...breakageTimes))} ms each)`);
}

// Conditions the reader settles without a render: nothing could register differently, so none is rendered.
const gateOnly = async (label, pdf, reason, detail) => {
  await checkAsync(`gate: ${label} â†’ refused for ${reason}`, async () => {
    const r = await (await R.openImagePageReader(pdf)).page(1);
    assert(!r.ok && r.reason === reason && (!detail || detail.test(r.detail)), JSON.stringify(r.ok ? 'accepted' : r));
  });
};
await gateOnly('the image drawn upside down', rebuild({ content: BASE_CONTENT.replace(
  '4427.000000 0.000000 0.000000 -5728.999512 0.000000 5728.999512 cm', '4427 0 0 5728.999512 0 0 cm') }), 'coverage', /upside down|mirrored/);
/** The rebuild with one string in it replaced; offsets after it move, so lengths are kept equal. */
const patched = (from, to) => {
  assert(from.length === to.length, 'a patch must keep the byte length');
  const pdf = Buffer.from(rebuild());
  const at = pdf.indexOf(from);
  assert(at > 0, `${from} not found`);
  pdf.write(to, at, 'latin1');
  return new Uint8Array(pdf);
};
await gateOnly('a square image stretched over the page', patched('/Width 4426', '/Width 5728'), 'coverage', /stretched/);
await gateOnly('a JPEG under a second filter', patched('/Filter /DCTDecode', '/Filter[/A85 /DCT]'), 'colour', /not a JPEG alone/);
await gateOnly('a JPEG whose own header disagrees with the PDF on its size', patched('/Height 5728', '/Height 5727'), 'colour', /size disagrees/);
await gateOnly('a CMYK colour space', rebuild({ colorSpace: '/DeviceCMYK' }), 'colour', /DeviceCMYK/);
await checkAsync('gate: an encrypted file is not read here at all, so every page renders', async () =>
  assert(await R.openImagePageReader(encrypted) === null, 'the reader opened an encrypted file'));
await checkAsync('gate: a file the reader cannot follow (noise after a header) gives no reader, not an exception', async () =>
  assert(await R.openImagePageReader(garbage) === null, 'reader opened noise'));

// ---------- 8. the budgets ----------

results.push('  8. the per-page budget covers the encode; the whole file has a ceiling');

/** A one-or-more-page document that renders at once, so only `encode` or the page count can be slow. */
const instantEngine = (pages, renderMs = 0) => ({ open: () => ({
  destroy: () => {},
  promise: Promise.resolve({ numPages: pages, getPage: async () => ({
    getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
    render: () => ({ promise: new Promise(r => setTimeout(r, renderMs)), cancel: () => {} }),
    cleanup: () => {},
  }) }),
}) });
const slowEncode = (ms) => ({ ...surfaces, create: () => ({ canvas: null, context: { fillRect() {} } }),
  encode: () => new Promise(r => setTimeout(() => r(new Uint8Array([1])), ms)) });

await checkAsync('per page: a page whose render and encode both fit the budget is accepted (control)', async () => {
  const out = await I.splitPdf(REAL[0].bytes, instantEngine(1), slowEncode(10), { pageTimeoutMs: 400, imagePages: false });
  assert(out.ok && out.pages.length === 1, JSON.stringify(out));
});
await checkAsync('per page: a page that renders at once but encodes past the budget is refused as too slow', async () => {
  const out = await I.splitPdf(REAL[0].bytes, instantEngine(1), slowEncode(600), { pageTimeoutMs: 150, imagePages: false });
  assert(out.ok === false && out.refusal === 'too_slow' && out.message === I.PDF_WORDING.tooSlow, JSON.stringify(out));
});
await checkAsync('whole file: pages that each fit their own budget are refused once the file runs past its ceiling', async () => {
  const out = await I.splitPdf(REAL[0].bytes, instantEngine(10, 40), slowEncode(0), {
    pageTimeoutMs: 1000, fileTimeoutMs: 150, imagePages: false });
  assert(out.ok === false && out.refusal === 'too_slow', JSON.stringify(out));
  assert(!('pages' in out), 'a refusal carried pages');
});
await checkAsync('whole file: the same file inside its ceiling is accepted whole (control)', async () => {
  const out = await I.splitPdf(REAL[0].bytes, instantEngine(10, 5), slowEncode(0), {
    pageTimeoutMs: 1000, fileTimeoutMs: 5000, imagePages: false });
  assert(out.ok && out.pages.length === 10, JSON.stringify(out.ok ? out.pages.length : out));
});
await checkAsync('the file ceiling is a real ceiling: below the page count times the per-page guard', async () =>
  assert(I.PDF_FILE_TIMEOUT_MS < I.PDF_MAX_PAGES * I.PDF_PAGE_TIMEOUT_MS && I.PDF_FILE_TIMEOUT_MS >= I.PDF_PAGE_TIMEOUT_MS,
    `${I.PDF_FILE_TIMEOUT_MS} vs ${I.PDF_MAX_PAGES} Ã— ${I.PDF_PAGE_TIMEOUT_MS}`));

// ---------- 9. what the student is told ----------

results.push('  9. no student-facing string in the PDF path gives resolution advice');

const wordings = Object.values(I.PDF_WORDING).map(w => typeof w === 'function' ? w(...[[2, 3], 41].slice(0, w.length)) : w);
await checkAsync('no PDF wording names a dpi figure or a resolution', async () => {
  const hit = wordings.filter(w => /dpi|dots per inch|resolution|\d+\s*(px|pixels)/i.test(String(w)));
  assert(hit.length === 0, hit.join(' | '));
});
await checkAsync('the too-slow refusal does not send the student back to a notes app', async () =>
  assert(!/notes app/i.test(I.PDF_WORDING.tooSlow), I.PDF_WORDING.tooSlow));
await checkAsync('the PDF uploader\'s own text names no dpi figure', async () => {
  for (const f of ['components/PageUploader.tsx', 'services/pdfLoader.ts']) assert(!/dpi/i.test(src(f)), f);
});

// ---------- report ----------

console.log(results.join('\n'));
if (timings.length) {
  const ms = timings.map(t => t.gateMs).sort((a, b) => a - b);
  console.log(`\n  gate time on the ${ms.length} answer pages: median ${ms[Math.floor(ms.length / 2)]} ms, ` +
    `slowest ${ms[ms.length - 1]} ms, against the ${G.GATE_BUDGET_MS} ms budget (unchanged)`);
}
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
