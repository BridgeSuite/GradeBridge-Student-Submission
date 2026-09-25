/**
 * genericSheet.ts — the one answer page every assignment shares, and the
 * student saying which part each photographed page is.
 *
 * `WORKORDER_SS_PAGE_LABELLING_2026-09-24`, built to
 * `WORKORDER_AM_GENERIC_ANSWER_PAGE_2026-09-24` §2 and its four rulings.
 *
 * ## What changes, and what does not
 *
 * The generic page is registered exactly like a printed sheet: the same four
 * marks, the same QR grammar (`GB1-GBGEN1-HWMSTR-1-1-5F0B10BC`), the same
 * refusal of a page that cannot be read. Its map has ONE region, the writing
 * box, so every page yields one crop: the whole box.
 *
 * What the page cannot say is which part it holds. **The student says so in
 * this app**, from the file's `parts` list, and the package records
 * `part_source: "student"` beside the choice so nobody downstream has to infer
 * which kind of label they are reading.
 *
 * **Only when a HANDWRITTEN file says `sheet: "generic"`.** An electronic file
 * never reaches anything here, whatever it carries, and a handwritten file
 * without the field is today's printed sheet, untouched.
 *
 * Everything here is plain functions over plain data, so the tests drive the
 * same code the component calls.
 */

import { Assignment, CropRef, GenericPart, InkBox, PageRef, StoredLayoutMap } from '../types';
import type { CompletenessNotice } from './completeness';

/** The generic page's template id: field 2 of its QR, and its map's `assignment_id`. */
export const GENERIC_TEMPLATE_ID = 'GBGEN1';

/**
 * The generic map's `layout_id`. A constant here, in the Assignment Maker and
 * in the page-format spec, the way `95438EDF` is for ENG17 HW1: it is printed
 * on every generic page there will ever be, so it cannot move.
 */
export const GENERIC_LAYOUT_ID = '5F0B10BC';

/**
 * The stored crop's long edge is capped at this many pixels (§2a). A fixed
 * number, so the same page always gives the same size, and it loses no
 * content — it bounds resolution, where a trim would bound the writing.
 *
 * 1600 px over the box's 199 mm is 8.0 px/mm, about 203 dpi. A page reaches
 * this app at no more than 2200 px on its long edge (`PAGE_MAX_EDGE`), which
 * is 7.9 px/mm across the whole sheet, so on today's ingest the cap is a
 * guarantee rather than a reduction: it binds only if ingest ever keeps more.
 */
export const GENERIC_CROP_LONG_EDGE_PX = 1600;

/** Quality flag on a crop with no part chosen. Advisory, like every flag. */
export const CROP_FLAG_UNLABELLED = 'unlabelled';

export const isGenericSheet = (a: Pick<Assignment, 'inputMode' | 'sheet'> | null | undefined): boolean =>
  !!a && a.inputMode === 'handwritten' && a.sheet === 'generic';

/**
 * What is wrong with a loaded file, for the generic path, or null.
 *
 * **A file is refused rather than guessed at.** A `sheet` value this app does
 * not know is refused, not treated as absent: absent means "the part is on the
 * printed map", and applying that to a sheet whose map cannot say would cut
 * crops under wrong labels with no error anywhere. A generic file whose map is
 * not the generic map, or whose `parts` list is missing or malformed, is
 * refused for the same reason.
 *
 * Electronic files are never checked here: `sheet` means nothing to them.
 */
export const genericSheetProblem = (
  json: Pick<Assignment, 'inputMode' | 'sheet' | 'parts'>, layout: StoredLayoutMap | null,
): string | null => {
  if (json.inputMode !== 'handwritten') return null;
  const sheet = (json as { sheet?: unknown }).sheet;
  if (sheet === undefined) return null;
  if (sheet !== 'generic') return `unknown sheet "${String(sheet)}"`;
  if (!layout) return 'no layout map';
  if (layout.computedLayoutId !== GENERIC_LAYOUT_ID) {
    return `map is ${layout.computedLayoutId}, not the generic ${GENERIC_LAYOUT_ID}`;
  }
  if (layout.rows.length !== 1) return `map has ${layout.rows.length} regions, not 1`;
  const parts = (json as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) return 'no parts list';
  const ids = new Set<string>();
  for (const p of parts as Partial<GenericPart>[]) {
    if (!p || typeof p.part_id !== 'string' || !p.part_id.trim()) return 'a part has no part_id';
    if (typeof p.label !== 'string' || !p.label.trim()) return `part ${p.part_id} has no label`;
    if (ids.has(p.part_id)) return `part ${p.part_id} is listed twice`;
    ids.add(p.part_id);
  }
  return null;
};

/** The crop record's key for a page. One page, one crop. */
export const genericCropKey = (mapRegionId: string, pageId: string): string => `${mapRegionId}@${pageId}`;

/**
 * The student chose a part for a page, or chose again.
 *
 * **Only the label moves.** The picture, its sign-off and its capture id stay
 * as they are: the student relabelling a page has not retaken it, and the
 * personal-information confirmation covers the pictures, not their labels.
 * `''` clears the choice.
 */
export const labelGenericCrop = (
  crops: Record<string, CropRef>, key: string, partId: string,
): Record<string, CropRef> => {
  const crop = crops[key];
  if (!crop || crop.partSource !== 'student' || crop.partId === partId) return crops;
  return { ...crops, [key]: { ...crop, partId } };
};

/** The generic crops, in the order their pages are in the pool: capture order. */
export const genericCropsInPageOrder = (crops: Record<string, CropRef>, pages: PageRef[]): CropRef[] => {
  const at = new Map(pages.map((p, i) => [p.id, i]));
  return Object.values(crops)
    .filter(c => c.partSource === 'student')
    .sort((a, b) => (at.get(a.fromPage ?? '') ?? 1e9) - (at.get(b.fromPage ?? '') ?? 1e9));
};

/**
 * A part id as a file-name fragment: `1(a)` → `1a`, `2` → `2`. If two part
 * ids in one list would collide (not possible from the Assignment Maker's
 * derivation, but not this file's to assume), the later one is named by its
 * position instead, so no crop can overwrite another in the archive.
 */
const partSlugs = (parts: readonly GenericPart[]): Map<string, string> => {
  const out = new Map<string, string>();
  const used = new Set<string>(['unlabelled']);
  parts.forEach((p, i) => {
    let slug = p.part_id.replace(/[()]/g, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || `part${i + 1}`;
    if (used.has(slug)) slug = `part${i + 1}`;
    used.add(slug);
    out.set(p.part_id, slug);
  });
  return out;
};

/** One generic crop as it goes into the package. */
export interface ResolvedGenericCrop {
  crop: CropRef;
  /** Key in the payload's `crops` object: the file stem, e.g. `1a_2`. */
  key: string;
  /** `crops/1a_2.jpg`, or `crops/unlabelled_1.jpg`. */
  file: string;
  /** Null when the student has not chosen, or chose something no longer listed. */
  part: GenericPart | null;
  /** 1-based position among this part's pages, in capture order. Null when unlabelled. */
  partPage: number | null;
  /** How many pages the part has. Null when unlabelled. */
  partPages: number | null;
  /** `page_N.jpg` of the photograph it was cut from. */
  pageFile: string | null;
}

/**
 * Names every generic crop for the archive, from the labels as they are NOW.
 *
 * Names are derived at packaging time rather than stored, so relabelling a
 * page cannot leave a stale file name behind. Within a part, pages keep their
 * capture order — the order they sit in the page pool, which the student can
 * change with the arrows — and are numbered 1, 2, … in it.
 */
export const resolveGenericCrops = (
  crops: Record<string, CropRef>, pages: PageRef[], parts: readonly GenericPart[],
): ResolvedGenericCrop[] => {
  const byId = new Map(parts.map(p => [p.part_id, p]));
  const slugs = partSlugs(parts);
  const ordered = genericCropsInPageOrder(crops, pages);
  const totals = new Map<string, number>();
  for (const c of ordered) if (byId.has(c.partId)) totals.set(c.partId, (totals.get(c.partId) ?? 0) + 1);

  const seen = new Map<string, number>();
  const pageFile = new Map(pages.map(p => [p.id, p.file]));
  return ordered.map(crop => {
    const part = byId.get(crop.partId) ?? null;
    const stem = part ? slugs.get(part.part_id)! : 'unlabelled';
    const n = (seen.get(stem) ?? 0) + 1;
    seen.set(stem, n);
    return {
      crop,
      key: `${stem}_${n}`,
      file: `crops/${stem}_${n}.jpg`,
      part,
      partPage: part ? n : null,
      partPages: part ? totals.get(part.part_id)! : null,
      pageFile: pageFile.get(crop.fromPage ?? '') ?? null,
    };
  });
};

/** What the review shows above the list, and what the download gate is built from. */
export interface GenericCoverage {
  /** Parts with no page, in the file's order. */
  missing: GenericPart[];
  /**
   * Parts with more than one page **while another part has none** — the case
   * where a repeated label looks unintended. A part with several pages when
   * every part is covered is a long answer, and is not mentioned.
   */
  repeated: Array<{ part: GenericPart; pages: number }>;
  /** Pages with no part chosen. */
  unlabelled: number;
  /** Pages the ink measure positively found nothing on. Uncertain pages are not counted. */
  blank: number;
  /** Parts that do have a page. */
  covered: number;
}

/**
 * Coverage of the parts by the pages, from the crops as they are.
 *
 * `entries`, when given, is what a built archive actually holds, and a crop
 * counts only if its file is in it — the same rule as the printed sheet's
 * completeness check, for the same reason: a crop record with no bytes behind
 * it is exactly the silent loss that check exists for.
 */
export const genericCoverage = (
  parts: readonly GenericPart[], crops: Record<string, CropRef>, pages: PageRef[],
  entries?: readonly string[],
): GenericCoverage => {
  const resolved = resolveGenericCrops(crops, pages, parts);
  const written = entries ? new Set(entries) : null;
  const present = resolved.filter(r => !written || written.has(r.file));
  const counts = new Map<string, number>();
  for (const r of present) if (r.part) counts.set(r.part.part_id, (counts.get(r.part.part_id) ?? 0) + 1);
  const missing = parts.filter(p => !counts.has(p.part_id));
  const repeated = missing.length === 0 ? [] : parts
    .filter(p => (counts.get(p.part_id) ?? 0) > 1)
    .map(part => ({ part, pages: counts.get(part.part_id)! }));
  return {
    missing,
    repeated,
    unlabelled: present.filter(r => !r.part).length,
    blank: present.filter(r => r.crop.inkVerdict === 'blank').length,
    covered: parts.length - missing.length,
  };
};

/**
 * The download gate's content on the generic path, or null when every part
 * has a page. **The same sentences as the printed sheet's gate**, counting
 * parts as answers; the only difference is that the missing names are not
 * grouped under a page number, because on this sheet a page number means
 * nothing. It informs and never blocks, like the printed sheet's.
 */
export const genericCompletenessNotice = (c: GenericCoverage, total: number): CompletenessNotice | null => {
  if (c.missing.length === 0) return null;
  const answers = (n: number): string => `${n} ${n === 1 ? 'answer' : 'answers'}`;
  if (c.covered === 0) {
    return {
      headline: `This assignment has ${answers(total)}. ` +
        (total === 1 ? 'Your submission does not have it.' : 'Your submission has none of them.'),
      itemised: false,
      groups: [],
      choice: 'If that is deliberate, you can download it anyway.',
    };
  }
  return {
    headline: `This assignment has ${answers(total)}. Your submission has ${c.covered}.`,
    itemised: true,
    groups: [{ names: c.missing.map(p => p.label) }],
    choice: 'If you left those blank on purpose, you can download anyway.',
  };
};

/** The ink box as the payload writes it. */
export const inkBoxJson = (box: InkBox | null | undefined): InkBox | null =>
  box ? { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 } : null;

/** What one registered generic page yields, before it becomes a crop record. */
export interface GenericCut {
  row: { regionId: string; pageK: number; isDrawing: boolean; maxPoints: number };
  width: number;
  height: number;
  bytes: number;
  flags: string[];
  inkBox: InkBox | null;
  inkVerdict: 'ink' | 'blank' | 'uncertain';
}

/**
 * The crop record for one registered generic page. **Starts unlabelled** (`''`):
 * a new page has not been said to be anything, and guessing a part for it would
 * be the one thing this path exists not to do. `file` is empty because the name
 * is derived from the label at packaging time (`resolveGenericCrops`).
 */
export const genericCropRecord = (
  cut: GenericCut, pageId: string, pageWarnings: string[], captureId: string,
): CropRef => ({
  regionId: genericCropKey(cut.row.regionId, pageId),
  mapRegionId: cut.row.regionId,
  partId: '',
  partSource: 'student',
  pageK: cut.row.pageK,
  isDrawing: cut.row.isDrawing,
  maxPoints: cut.row.maxPoints,
  cropSource: 'registration',
  // Re-cutting resets the sign-off, as on the printed sheet: the picture the
  // student approved is not the picture that would now be submitted.
  review: 'not_reviewed',
  qualityFlags: [...cut.flags, ...pageWarnings],
  file: '',
  width: cut.width,
  height: cut.height,
  bytes: cut.bytes,
  fromPage: pageId,
  captureId,
  inkBox: cut.inkBox,
  inkVerdict: cut.inkVerdict,
});

/**
 * Puts freshly cut crops over the old ones. On the printed sheet a re-cut
 * simply replaces; **a retaken generic page keeps the part the student chose
 * for it**, because retaking a photograph is not a change of mind about what
 * the page is.
 */
export const mergeRecutCrops = (
  prev: Record<string, CropRef>, cut: Record<string, CropRef>,
): Record<string, CropRef> => {
  const out = { ...prev };
  for (const [key, crop] of Object.entries(cut)) {
    const kept = crop.partSource === 'student' ? prev[key]?.partId : undefined;
    out[key] = kept ? { ...crop, partId: kept } : crop;
  }
  return out;
};
