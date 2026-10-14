/**
 * pdfImagePage.ts — a PDF page that is one photograph, recognised and unwrapped.
 *
 * `WORKORDER_SS_PDF_PAGE_THAT_IS_A_PHOTOGRAPH_2026-10-14`. A scanned page, and a
 * page printed to PDF from a Windows application, is a JPEG wrapped in a PDF.
 * pdf.js can draw it, but painting a 25 MP image onto the render canvas took
 * 15 s a page on the machine the findings were measured on, while the
 * photograph path decodes and downsamples a phone's 12–48 MP camera images
 * every day. So when a page is nothing but one JPEG covering the page, its own
 * bytes are taken out here and handed to the photograph path, and pdf.js never
 * draws it.
 *
 * **This file reads the PDF itself and does not use pdf.js.** pdf.js gives no
 * public route to an image's raw bytes, and asking it for the page's operator
 * list decodes the image as a side effect, which is the work this file exists
 * to avoid. So the page's content stream is tokenised here, and the gate and
 * the bytes come from the same parse (Andre Knoesen's ruling, 14 October 2026).
 *
 * **Anything this file does not understand is a page that renders**, exactly as
 * before. Every function here answers with a value and never throws; a reason
 * comes back with every refusal so the suite can show which condition fired.
 * The student is never told: the fallback is silent by design.
 *
 * The gate, every condition of which must hold:
 *  1. `one-image`   exactly one image is painted, once, and no inline image, form
 *                   or shading is painted at all;
 *  2. `text`        no text operator anywhere;
 *  3. `drawing`     nothing is drawn but transforms, save/restore and clipping —
 *                   except FILLS PAINTED BEFORE THE IMAGE, which the opaque image
 *                   then covers (ruling of 14 October 2026: the Print To PDF page
 *                   fills the page white before it paints the image). No stroke
 *                   anywhere, nothing painted after the image, no graphics state
 *                   dictionary (`gs` can carry transparency);
 *  4. `coverage`    the image, after the page transform, lands on the page's
 *                   visible box within `COVER_TOLERANCE` on every edge, upright
 *                   and unmirrored, at the aspect its pixels have; and every clip
 *                   is a rectangle that covers that box, so nothing of it is cut;
 *  5. `colour`      a JPEG (`/DCTDecode` alone, no parameters) in `DeviceGray`
 *                   or `DeviceRGB`, 8 bits, with no soft mask, mask or `/Decode`
 *                   array, whose own header agrees on size and components, is a
 *                   kind every browser decodes, and carries no EXIF rotation;
 *  6. `rotation`    the page's `/Rotate` is 0. A rotated page renders.
 * And two the work order did not list, both because the render would show
 * something the image does not:
 *  7. `annotations` the page has no annotations (pdf.js draws their appearance,
 *                   and ink added in a PDF viewer lives there);
 *  8. `structure`   the file is unencrypted and this reader can follow it.
 */

/** How far an image edge may sit from the page edge, as a fraction of the page: 1%. */
export const COVER_TOLERANCE = 0.01;

export type ImagePageRefusal =
  | 'structure' | 'one-image' | 'text' | 'drawing' | 'coverage' | 'colour' | 'rotation' | 'annotations';

export type ImagePageResult =
  | { ok: true; jpeg: Uint8Array; width: number; height: number }
  | { ok: false; reason: ImagePageRefusal; detail: string };

// ---------- objects ----------

class PdfRef { constructor(readonly num: number, readonly gen: number) {} }
class PdfName { constructor(readonly name: string) {} }
class PdfCmd { constructor(readonly cmd: string) {} }
type PdfValue = number | boolean | null | string | PdfName | PdfRef | PdfCmd | PdfValue[] | PdfDict | PdfStream;
class PdfDict { constructor(readonly map: Map<string, PdfValue>) {} get(k: string) { return this.map.get(k); } }
class PdfStream { constructor(readonly dict: PdfDict, readonly start: number, readonly length: number) {} }

/** Thrown inside this file only, and always caught before anything leaves it. */
class Unreadable extends Error {}
const fail = (why: string): never => { throw new Unreadable(why); };

const isWhite = (b: number) => b === 0 || b === 9 || b === 10 || b === 12 || b === 13 || b === 32;
const isDelim = (b: number) =>
  b === 0x28 || b === 0x29 || b === 0x3c || b === 0x3e || b === 0x5b || b === 0x5d ||
  b === 0x7b || b === 0x7d || b === 0x2f || b === 0x25;

class Lexer {
  pos: number;
  constructor(readonly bytes: Uint8Array, start = 0, readonly end = bytes.length) { this.pos = start; }

  skip(): void {
    const b = this.bytes;
    while (this.pos < this.end) {
      const c = b[this.pos];
      if (isWhite(c)) { this.pos++; continue; }
      if (c === 0x25) { while (this.pos < this.end && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++; continue; }
      break;
    }
  }

  /** One token: a value, or a `PdfCmd` for a bare keyword and for `[ ] << >>`. `undefined` at the end. */
  token(): PdfValue | undefined {
    this.skip();
    const b = this.bytes;
    if (this.pos >= this.end) return undefined;
    const c = b[this.pos];
    if (c === 0x5b) { this.pos++; return new PdfCmd('['); }
    if (c === 0x5d) { this.pos++; return new PdfCmd(']'); }
    if (c === 0x3c && b[this.pos + 1] === 0x3c) { this.pos += 2; return new PdfCmd('<<'); }
    if (c === 0x3e && b[this.pos + 1] === 0x3e) { this.pos += 2; return new PdfCmd('>>'); }
    if (c === 0x2f) {
      let s = '';
      this.pos++;
      while (this.pos < this.end && !isWhite(b[this.pos]) && !isDelim(b[this.pos])) {
        if (b[this.pos] === 0x23 && this.pos + 2 < this.end) {
          s += String.fromCharCode(parseInt(String.fromCharCode(b[this.pos + 1], b[this.pos + 2]), 16));
          this.pos += 3;
        } else s += String.fromCharCode(b[this.pos++]);
      }
      return new PdfName(s);
    }
    if (c === 0x28) return this.literalString();
    if (c === 0x3c) {
      const close = b.indexOf(0x3e, this.pos);
      if (close < 0 || close >= this.end) fail('unterminated hex string');
      this.pos = close + 1;
      return '';   // the content of a hex string is never needed here
    }
    if (c === 0x29 || c === 0x3e || c === 0x7b || c === 0x7d) { this.pos++; return new PdfCmd(String.fromCharCode(c)); }
    let s = '';
    while (this.pos < this.end && !isWhite(b[this.pos]) && !isDelim(b[this.pos])) s += String.fromCharCode(b[this.pos++]);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    return new PdfCmd(s);
  }

  private literalString(): string {
    const b = this.bytes;
    let depth = 0;
    let out = '';
    this.pos++;
    while (this.pos < this.end) {
      const c = b[this.pos++];
      if (c === 0x5c) { out += String.fromCharCode(b[this.pos++] ?? 0); continue; }
      if (c === 0x28) depth++;
      if (c === 0x29) { if (depth === 0) return out; depth--; }
      out += String.fromCharCode(c);
    }
    return fail('unterminated string');
  }

  /** A complete object: arrays, dictionaries and `n g R` references assembled. */
  value(): PdfValue {
    const t = this.token();
    if (t === undefined) return fail('unexpected end');
    if (t instanceof PdfCmd) {
      if (t.cmd === '[') {
        const items: PdfValue[] = [];
        for (;;) {
          this.skip();
          if (this.bytes[this.pos] === 0x5d) { this.pos++; return items; }
          if (this.pos >= this.end) fail('unterminated array');
          items.push(this.value());
        }
      }
      if (t.cmd === '<<') {
        const map = new Map<string, PdfValue>();
        for (;;) {
          this.skip();
          if (this.bytes[this.pos] === 0x3e && this.bytes[this.pos + 1] === 0x3e) { this.pos += 2; return new PdfDict(map); }
          const key = this.token();
          if (!(key instanceof PdfName)) return fail('bad dictionary key');
          const v = this.value();
          // `n g R` inside a dictionary: the value lexed as n, so look ahead.
          map.set(key.name, typeof v === 'number' ? this.maybeRef(v) : v);
        }
      }
      return t;
    }
    return typeof t === 'number' ? this.maybeRef(t) : t;
  }

  private maybeRef(n: number): PdfValue {
    const save = this.pos;
    const g = this.token();
    if (typeof g === 'number') {
      const r = this.token();
      if (r instanceof PdfCmd && r.cmd === 'R') return new PdfRef(n, g);
    }
    this.pos = save;
    return n;
  }
}

// ---------- the file ----------

const latin1 = (bytes: Uint8Array, start: number, end: number): string => {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
};

const inflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') fail('no inflate in this browser');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** The PNG predictors (10–15) cross-reference streams use. TIFF predictor 2 is not supported. */
const unpredict = (data: Uint8Array, params: PdfDict | null): Uint8Array => {
  const predictor = params ? num(params.get('Predictor') ?? 1) : 1;
  if (predictor === 1) return data;
  if (predictor < 10) return fail(`predictor ${predictor}`);
  const colors = num(params!.get('Colors') ?? 1), bpc = num(params!.get('BitsPerComponent') ?? 8);
  const columns = num(params!.get('Columns') ?? 1);
  const bpp = Math.max(1, Math.ceil(colors * bpc / 8)), rowLen = Math.ceil(colors * bpc * columns / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = r * (rowLen + 1) + 1, dst = r * rowLen, prev = dst - rowLen;
    for (let i = 0; i < rowLen; i++) {
      const raw = data[src + i];
      const left = i >= bpp ? out[dst + i - bpp] : 0;
      const up = r > 0 ? out[prev + i] : 0;
      const ul = r > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let v: number;
      switch (type) {
        case 0: v = raw; break;
        case 1: v = raw + left; break;
        case 2: v = raw + up; break;
        case 3: v = raw + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - ul, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
          v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul);
          break;
        }
        default: return fail(`PNG filter ${type}`);
      }
      out[dst + i] = v & 0xff;
    }
  }
  return out;
};

function num(v: PdfValue | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fail('expected a number');
}

type XrefEntry = { type: 1; offset: number } | { type: 2; stream: number; index: number };

class PdfFile {
  private xref = new Map<number, XrefEntry>();
  private cache = new Map<number, PdfValue>();
  private objStreams = new Map<number, { data: Uint8Array; offsets: Map<number, number> }>();
  trailer!: PdfDict;

  private constructor(readonly bytes: Uint8Array) {}

  static async open(bytes: Uint8Array): Promise<PdfFile> {
    const f = new PdfFile(bytes);
    const tail = latin1(bytes, Math.max(0, bytes.length - 1024), bytes.length);
    const at = tail.lastIndexOf('startxref');
    if (at < 0) fail('no startxref');
    const m = /^startxref\s+(\d+)/.exec(tail.slice(at));
    if (!m) fail('bad startxref');
    let offset: number | null = Number(m![1]);
    const seen = new Set<number>();
    while (offset !== null) {
      if (seen.has(offset) || seen.size > 64) fail('xref loop');
      seen.add(offset);
      const section: PdfDict = await f.readXrefSection(offset);
      if (!f.trailer) f.trailer = section;
      const hybrid = section.get('XRefStm');
      if (typeof hybrid === 'number') await f.readXrefSection(hybrid);
      const prev = section.get('Prev');
      offset = typeof prev === 'number' ? prev : null;
    }
    if (f.trailer.get('Encrypt') !== undefined) fail('encrypted');
    return f;
  }

  /** Reads one xref section; older sections never overwrite what a newer one said. */
  private async readXrefSection(offset: number): Promise<PdfDict> {
    if (offset < 0 || offset >= this.bytes.length) fail('xref offset out of range');
    const lx = new Lexer(this.bytes, offset);
    const first = lx.token();
    if (first instanceof PdfCmd && first.cmd === 'xref') {
      for (;;) {
        const t = lx.token();
        if (t instanceof PdfCmd && t.cmd === 'trailer') break;
        const start = num(t ?? undefined), count = num(lx.token() ?? undefined);
        for (let i = 0; i < count; i++) {
          const off = num(lx.token() ?? undefined);
          lx.token();   // generation
          const kind = lx.token();
          if (!(kind instanceof PdfCmd)) fail('bad xref row');
          // Free rows are not recorded: in a hybrid file the table lists as free
          // the objects its `/XRefStm` places in object streams.
          if (kind instanceof PdfCmd && kind.cmd === 'n' && !this.xref.has(start + i)) this.xref.set(start + i, { type: 1, offset: off });
        }
      }
      const trailer = lx.value();
      return trailer instanceof PdfDict ? trailer : fail('bad trailer');
    }
    // A cross-reference stream: `n g obj << /Type /XRef … >> stream`.
    lx.pos = offset;
    const obj = this.parseIndirectAt(offset);
    if (!(obj instanceof PdfStream) || !(obj.dict.get('Type') instanceof PdfName) ||
        (obj.dict.get('Type') as PdfName).name !== 'XRef') fail('not an xref');
    const stream = obj as PdfStream;
    const data = await this.streamData(stream);
    const w = (stream.dict.get('W') as PdfValue[] | undefined)?.map(v => num(v));
    if (!w || w.length !== 3) fail('bad /W');
    const size = num(stream.dict.get('Size'));
    const index = (stream.dict.get('Index') as PdfValue[] | undefined)?.map(v => num(v)) ?? [0, size];
    const rowLen = w![0] + w![1] + w![2];
    let p = 0;
    const field = (width: number, dflt: number) => {
      if (width === 0) return dflt;
      let v = 0;
      for (let i = 0; i < width; i++) v = v * 256 + data[p++];
      return v;
    };
    for (let s = 0; s + 1 < index.length; s += 2) {
      for (let i = 0; i < index[s + 1]; i++) {
        if (p + rowLen > data.length) fail('xref stream too short');
        const type = field(w![0], 1), a = field(w![1], 0), b = field(w![2], 0);
        const n = index[s] + i;
        if (this.xref.has(n)) continue;
        if (type === 1) this.xref.set(n, { type: 1, offset: a });
        else if (type === 2) this.xref.set(n, { type: 2, stream: a, index: b });
      }
    }
    return stream.dict;
  }

  private parseIndirectAt(offset: number): PdfValue {
    const lx = new Lexer(this.bytes, offset);
    const n = lx.token(), g = lx.token(), kw = lx.token();
    if (typeof n !== 'number' || typeof g !== 'number' || !(kw instanceof PdfCmd) || kw.cmd !== 'obj') fail('not an object');
    const v = lx.value();
    if (!(v instanceof PdfDict)) return v;
    const save = lx.pos;
    const next = lx.token();
    if (!(next instanceof PdfCmd) || next.cmd !== 'stream') { lx.pos = save; return v; }
    // The stream keyword ends with CRLF or LF; its data starts after that.
    let start = lx.pos;
    if (this.bytes[start] === 13) start++;
    if (this.bytes[start] === 10) start++;
    const len = this.resolve(v.get('Length'));
    if (typeof len !== 'number' || len < 0 || start + len > this.bytes.length) fail('bad stream length');
    return new PdfStream(v, start, len as number);
  }

  resolve(v: PdfValue | undefined): PdfValue | undefined {
    let depth = 0;
    while (v instanceof PdfRef) {
      if (++depth > 32) fail('reference loop');
      v = this.object(v.num);
    }
    return v;
  }

  private object(n: number): PdfValue {
    if (this.cache.has(n)) return this.cache.get(n)!;
    const e = this.xref.get(n);
    if (!e) return null;
    let v: PdfValue;
    if (e.type === 1) {
      if (e.offset < 0) return null;
      v = this.parseIndirectAt(e.offset);
    } else {
      const os = this.objStreams.get(e.stream);
      if (!os) return fail('object stream not loaded');
      const at = os.offsets.get(n);
      if (at === undefined) return fail('object missing from its stream');
      v = new Lexer(os.data, at).value();
    }
    this.cache.set(n, v);
    return v;
  }

  /** Object streams are inflated up front, asynchronously, for the objects a page will need. */
  async loadObjectStreams(): Promise<void> {
    const wanted = new Set<number>();
    for (const e of this.xref.values()) if (e.type === 2) wanted.add(e.stream);
    if (wanted.size > 256) fail('too many object streams');
    for (const s of wanted) {
      const stream = this.object(s);
      if (!(stream instanceof PdfStream)) fail('object stream is not a stream');
      const data = await this.streamData(stream as PdfStream);
      const count = num((stream as PdfStream).dict.get('N')), first = num((stream as PdfStream).dict.get('First'));
      const lx = new Lexer(data);
      const offsets = new Map<number, number>();
      for (let i = 0; i < count; i++) offsets.set(num(lx.token() ?? undefined), first + num(lx.token() ?? undefined));
      this.objStreams.set(s, { data, offsets });
    }
  }

  raw(stream: PdfStream): Uint8Array { return this.bytes.subarray(stream.start, stream.start + stream.length); }

  /** A stream's data with `/FlateDecode` (or nothing) undone. Any other filter is not read here. */
  async streamData(stream: PdfStream): Promise<Uint8Array> {
    const filter = this.resolve(stream.dict.get('Filter'));
    const filters = filter === undefined || filter === null ? [] : Array.isArray(filter) ? filter : [filter];
    let data = this.raw(stream);
    if (filters.length === 0) return data;
    if (filters.length > 1 || !(filters[0] instanceof PdfName) || filters[0].name !== 'FlateDecode') fail('unsupported filter');
    const parms = this.resolve(stream.dict.get('DecodeParms'));
    const p = Array.isArray(parms) ? this.resolve(parms[0]) : parms;
    data = await inflate(data);
    return unpredict(data, p instanceof PdfDict ? p : null);
  }

  dict(v: PdfValue | undefined): PdfDict | null {
    const r = this.resolve(v);
    return r instanceof PdfDict ? r : r instanceof PdfStream ? r.dict : null;
  }
}

// ---------- the page tree ----------

interface PageInfo {
  dict: PdfDict;
  resources: PdfDict | null;
  box: [number, number, number, number];
  rotate: number;
}

const rect = (file: PdfFile, v: PdfValue | undefined): [number, number, number, number] | null => {
  const r = file.resolve(v);
  if (!Array.isArray(r) || r.length !== 4) return null;
  const [a, b, c, d] = r.map(x => num(file.resolve(x)));
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
};

const collectPages = (file: PdfFile): PageInfo[] => {
  const root = file.dict(file.trailer.get('Root'));
  const top = root && file.dict(root.get('Pages'));
  if (!top) return fail('no page tree');
  const out: PageInfo[] = [];
  const seen = new Set<PdfDict>();
  const walk = (node: PdfDict, inherited: { resources: PdfDict | null; media: PdfValue | undefined; crop: PdfValue | undefined; rotate: PdfValue | undefined }, depth: number) => {
    if (depth > 32 || seen.has(node) || out.length > 10_000) fail('page tree too deep');
    seen.add(node);
    const here = {
      resources: node.get('Resources') !== undefined ? file.dict(node.get('Resources')) : inherited.resources,
      media: node.get('MediaBox') ?? inherited.media,
      crop: node.get('CropBox') ?? inherited.crop,
      rotate: node.get('Rotate') ?? inherited.rotate,
    };
    const type = file.resolve(node.get('Type'));
    const kids = file.resolve(node.get('Kids'));
    if (Array.isArray(kids) && !(type instanceof PdfName && type.name === 'Page')) {
      for (const k of kids) {
        const kid = file.dict(k);
        if (!kid) fail('bad kid');
        walk(kid!, here, depth + 1);
      }
      return;
    }
    const media = rect(file, here.media);
    if (!media) fail('no MediaBox');
    const crop = here.crop !== undefined ? rect(file, here.crop) : null;
    const box: [number, number, number, number] = crop
      ? [Math.max(media![0], crop[0]), Math.max(media![1], crop[1]), Math.min(media![2], crop[2]), Math.min(media![3], crop[3])]
      : media!;
    const rotate = here.rotate === undefined ? 0 : num(file.resolve(here.rotate));
    out.push({ dict: node, resources: here.resources, box, rotate: ((rotate % 360) + 360) % 360 });
  };
  walk(top, { resources: null, media: undefined, crop: undefined, rotate: undefined }, 0);
  return out;
};

// ---------- the JPEG itself ----------

/** SOF0, SOF1 and SOF2: the Huffman-coded JPEGs every browser decodes. */
const BROWSER_SOF = new Set([0xc0, 0xc1, 0xc2]);

const checkJpeg = (j: Uint8Array, width: number, height: number, components: number): string | null => {
  if (j.length < 4 || j[0] !== 0xff || j[1] !== 0xd8) return 'not a JPEG';
  const view = new DataView(j.buffer, j.byteOffset, j.byteLength);
  let p = 2;
  while (p + 4 <= j.length) {
    if (j[p] !== 0xff) { p++; continue; }
    let m = p + 1;
    while (m < j.length && j[m] === 0xff) m++;
    const marker = j[m];
    p = m + 1;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda || marker === 0xd9) return 'no frame header';
    if (p + 2 > j.length) return 'truncated';
    const size = view.getUint16(p);
    if (size < 2) return 'bad segment';
    const seg = p + 2;
    // APP1 Exif: a rotation flag the photograph path would honour and pdf.js does not.
    if (marker === 0xe1 && seg + 6 <= j.length && view.getUint32(seg) === 0x45786966) {
      const tiff = seg + 6;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 <= j.length) {
        const entries = view.getUint16(ifd, little);
        for (let i = 0; i < entries && ifd + 2 + i * 12 + 12 <= j.length; i++) {
          const e = ifd + 2 + i * 12;
          if (view.getUint16(e, little) === 0x0112 && view.getUint16(e + 8, little) !== 1) return 'EXIF orientation';
        }
      }
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (!BROWSER_SOF.has(marker)) return `JPEG coding SOF${marker - 0xc0}`;
      if (seg + 6 > j.length) return 'truncated frame header';
      if (j[seg] !== 8) return `${j[seg]}-bit JPEG`;
      if (view.getUint16(seg + 1) !== height || view.getUint16(seg + 3) !== width) return 'JPEG size disagrees with the PDF';
      if (j[seg + 5] !== components) return `${j[seg + 5]} JPEG components for ${components}`;
      return null;
    }
    p = seg + size - 2;
  }
  return 'no frame header';
};

// ---------- the content stream ----------

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const TEXT_OPS = new Set(['BT', 'ET', 'Tc', 'Tw', 'Tz', 'TL', 'Tf', 'Tr', 'Ts', 'Td', 'TD', 'Tm', 'T*', 'Tj', 'TJ', "'", '"', 'd0', 'd1']);
const PATH_OPS = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're']);
const FILL_OPS = new Set(['f', 'F', 'f*']);
const STROKE_OPS = new Set(['S', 's', 'B', 'B*', 'b', 'b*']);
/** Colour and line state: they set how a later operator would paint, and paint nothing themselves. */
const STATE_OPS = new Set(['rg', 'RG', 'g', 'G', 'k', 'K', 'cs', 'CS', 'sc', 'SC', 'scn', 'SCN', 'w', 'J', 'j', 'M', 'd', 'i', 'ri']);
/** Marked content without properties, and marked points: labels, not paint. */
const MARK_OPS = new Set(['BMC', 'EMC', 'MP', 'DP']);

type Gate = { ok: true; image: PdfStream; ctm: Matrix } | { ok: false; reason: ImagePageRefusal; detail: string };

const runGate = (file: PdfFile, content: Uint8Array, page: PageInfo): Gate => {
  const refuse = (reason: ImagePageRefusal, detail: string): Gate => ({ ok: false, reason, detail });
  const [px0, py0, px1, py1] = page.box;
  const tolX = (px1 - px0) * COVER_TOLERANCE, tolY = (py1 - py0) * COVER_TOLERANCE;
  const xobjects = page.resources ? file.dict(page.resources.get('XObject')) : null;

  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let path: Array<[number, number]> = [];
  let curved = false;
  let clip = false;
  let image: { stream: PdfStream; ctm: Matrix } | null = null;

  /** A clip must be a rectangle that holds the whole visible page, or it cuts the image. */
  const clipCovers = (): string | null => {
    if (curved || path.length < 4) return 'a clip that is not a rectangle';
    const xs = path.map(p => p[0]), ys = path.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const onCorner = path.every(([x, y]) =>
      (Math.abs(x - x0) <= tolX || Math.abs(x - x1) <= tolX) && (Math.abs(y - y0) <= tolY || Math.abs(y - y1) <= tolY));
    if (!onCorner) return 'a clip that is not a rectangle';
    if (x0 > px0 + tolX || x1 < px1 - tolX || y0 > py0 + tolY || y1 < py1 - tolY) return 'a clip smaller than the page';
    return null;
  };

  const lx = new Lexer(content);
  let operands: PdfValue[] = [];
  for (let guard = 0; ; guard++) {
    if (guard > 200_000) return refuse('drawing', 'too many operators');
    lx.skip();
    if (lx.pos >= lx.end) break;
    const t = lx.value();
    if (!(t instanceof PdfCmd)) { operands.push(t); continue; }
    const op = t.cmd;
    const args = operands;
    operands = [];
    if (op === 'q') { stack.push(ctm); continue; }
    if (op === 'Q') { ctm = stack.pop() ?? ctm; continue; }
    if (op === 'cm') {
      if (args.length !== 6 || !args.every(a => typeof a === 'number')) return refuse('drawing', 'malformed cm');
      ctm = mul(args as Matrix, ctm);
      continue;
    }
    if (TEXT_OPS.has(op)) return refuse('text', `text operator ${op}`);
    if (PATH_OPS.has(op)) {
      const n = args.filter((a): a is number => typeof a === 'number');
      if (op === 're') {
        if (n.length !== 4) return refuse('drawing', 'malformed re');
        const [x, y, w, h] = n;
        path.push(apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h));
      } else if (op === 'm' || op === 'l') {
        if (n.length !== 2) return refuse('drawing', `malformed ${op}`);
        path.push(apply(ctm, n[0], n[1]));
      } else if (op !== 'h') {
        curved = true;
        for (let i = 0; i + 1 < n.length; i += 2) path.push(apply(ctm, n[i], n[i + 1]));
      }
      continue;
    }
    if (op === 'W' || op === 'W*') { clip = true; continue; }
    if (op === 'n' || FILL_OPS.has(op)) {
      if (FILL_OPS.has(op) && image) return refuse('drawing', `a fill (${op}) painted after the image`);
      if (clip) {
        const why = clipCovers();
        if (why) return refuse('coverage', why);
      }
      path = []; curved = false; clip = false;
      continue;
    }
    if (STROKE_OPS.has(op)) return refuse('drawing', `a stroke (${op})`);
    if (STATE_OPS.has(op) || MARK_OPS.has(op)) continue;
    if (op === 'gs') return refuse('drawing', 'a graphics state dictionary (gs)');
    if (op === 'BI') return refuse('one-image', 'an inline image');
    if (op === 'sh') return refuse('one-image', 'a shading (sh)');
    if (op === 'BDC') return refuse('drawing', 'marked content with properties (BDC)');
    if (op === 'Do') {
      const name = args[0];
      if (!(name instanceof PdfName) || !xobjects) return refuse('structure', 'Do without an XObject');
      const xo = file.resolve(xobjects.get(name.name));
      if (!(xo instanceof PdfStream)) return refuse('structure', `XObject ${name.name} is not a stream`);
      const sub = file.resolve(xo.dict.get('Subtype'));
      if (!(sub instanceof PdfName) || sub.name !== 'Image') return refuse('one-image', `a ${sub instanceof PdfName ? sub.name : 'non-image'} XObject`);
      if (image) return refuse('one-image', 'a second image');
      image = { stream: xo, ctm };
      continue;
    }
    return refuse('drawing', `operator ${op}`);
  }
  if (!image) return refuse('one-image', 'no image');
  return { ok: true, image: (image as { stream: PdfStream; ctm: Matrix }).stream, ctm: (image as { stream: PdfStream; ctm: Matrix }).ctm };
};

// ---------- one page ----------

const imageOf = async (file: PdfFile, page: PageInfo): Promise<ImagePageResult> => {
  const refuse = (reason: ImagePageRefusal, detail: string): ImagePageResult => ({ ok: false, reason, detail });
  if (page.rotate !== 0) return refuse('rotation', `/Rotate ${page.rotate}`);
  const annots = file.resolve(page.dict.get('Annots'));
  if (Array.isArray(annots) && annots.length > 0) return refuse('annotations', `${annots.length} annotations`);

  const contents = file.resolve(page.dict.get('Contents'));
  const parts = contents === undefined || contents === null ? [] : Array.isArray(contents) ? contents : [contents];
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    const s = file.resolve(part);
    if (!(s instanceof PdfStream)) return refuse('structure', 'content is not a stream');
    chunks.push(await file.streamData(s), new Uint8Array([10]));
  }
  const content = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { content.set(c, at); at += c.length; }

  const gate = runGate(file, content, page);
  if (gate.ok === false) return refuse(gate.reason, gate.detail);
  const d = gate.image.dict;
  const get = (k: string) => file.resolve(d.get(k));

  const [a, b, c, dd, e, f] = gate.ctm;
  const [px0, py0, px1, py1] = page.box;
  const pw = px1 - px0, ph = py1 - py0;
  if (Math.abs(b) > COVER_TOLERANCE * Math.abs(a) || Math.abs(c) > COVER_TOLERANCE * Math.abs(dd)) {
    return refuse('coverage', 'the image is turned on the page');
  }
  if (!(a > 0 && dd > 0)) return refuse('coverage', 'the image is mirrored or upside down');
  if (Math.abs(e - px0) > pw * COVER_TOLERANCE || Math.abs(e + a - px1) > pw * COVER_TOLERANCE ||
      Math.abs(f - py0) > ph * COVER_TOLERANCE || Math.abs(f + dd - py1) > ph * COVER_TOLERANCE) {
    return refuse('coverage', `the image covers ${e.toFixed(1)},${f.toFixed(1)} to ${(e + a).toFixed(1)},${(f + dd).toFixed(1)} ` +
      `on a page of ${px0},${py0} to ${px1},${py1}`);
  }

  const width = get('Width'), height = get('Height');
  if (typeof width !== 'number' || typeof height !== 'number' || width < 1 || height < 1) return refuse('structure', 'no image size');
  if (Math.abs((width / height) / (a / dd) - 1) > COVER_TOLERANCE) return refuse('coverage', 'the image is stretched on the page');

  if (get('ImageMask') === true) return refuse('colour', 'an image mask');
  for (const k of ['SMask', 'Mask', 'Decode']) if (d.get(k) !== undefined) return refuse('colour', `/${k}`);
  if (d.get('OC') !== undefined) return refuse('drawing', 'optional content on the image');
  const filter = get('Filter');
  const filters = Array.isArray(filter) ? filter.map(x => file.resolve(x)) : [filter];
  if (filters.length !== 1 || !(filters[0] instanceof PdfName) || filters[0].name !== 'DCTDecode') return refuse('colour', 'not a JPEG alone');
  const parms = get('DecodeParms');
  if (parms !== undefined && parms !== null && !(Array.isArray(parms) && parms.every(x => file.resolve(x) === null))) {
    return refuse('colour', 'JPEG decode parameters');
  }
  const cs = get('ColorSpace');
  const components = cs instanceof PdfName ? ({ DeviceGray: 1, DeviceRGB: 3 } as Record<string, number>)[cs.name] : undefined;
  if (!components) return refuse('colour', `colour space ${cs instanceof PdfName ? cs.name : 'other than a device space'}`);
  if (get('BitsPerComponent') !== 8) return refuse('colour', 'not 8 bits per component');

  const jpeg = file.raw(gate.image);
  const bad = checkJpeg(jpeg, width, height, components);
  if (bad) return refuse('colour', bad);
  return { ok: true, jpeg: jpeg.slice(), width, height };
};

// ---------- what pdfIntake calls ----------

export interface ImagePageReader {
  /** The page count this reader found; `splitPdf` uses it only if it agrees with pdf.js. */
  pageCount: number;
  /** 1-based. Never throws. */
  page(n: number): Promise<ImagePageResult>;
}

/**
 * Reads a PDF's structure once. `null` when this file cannot be followed here,
 * in which case every page of it renders, as before.
 */
export const openImagePageReader = async (data: Uint8Array): Promise<ImagePageReader | null> => {
  try {
    const file = await PdfFile.open(data);
    await file.loadObjectStreams();
    const pages = collectPages(file);
    return {
      pageCount: pages.length,
      page: async (n: number): Promise<ImagePageResult> => {
        try {
          const page = pages[n - 1];
          if (!page) return { ok: false, reason: 'structure', detail: `no page ${n}` };
          return await imageOf(file, page);
        } catch (err) {
          return { ok: false, reason: 'structure', detail: err instanceof Error ? err.message : String(err) };
        }
      },
    };
  } catch {
    return null;
  }
};
