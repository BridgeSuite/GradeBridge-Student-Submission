/**
 * fixedLayout.ts — the page plan for the document Gradescope aligns.
 *
 * ## Why a plan, separate from the drawing
 *
 * Two documents have to agree page for page: the PDF this app builds for one
 * student, and the blank template a person uploads to Gradescope once. If they
 * are drawn by two pieces of code they drift, and a millimetre of drift puts a
 * student's answer under the wrong question for a whole class. So the geometry
 * and the page order live here, once, as data; `fixedLayoutPdf.ts` draws from
 * this plan and nothing else, with or without the images.
 *
 * The geometry is `GBHW-1`, section 3 of
 * `workorders\CONTRACT_HOMEWORK_TO_GRADESCOPE_v1_2026-10-19.md`. Points, US
 * Letter, origin top left. **Neither program invents its own**, which is why
 * every number below is a constant and none is computed from a font metric.
 */

import { GenericPart } from '../types';

/** US Letter in points, portrait. */
export const PAGE = { width: 612, height: 792 } as const;

/** A rectangle as the contract writes it: x0, y0, x1, y1 from the top left. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

export const GBHW_1 = {
  /** Left empty here. The relay stamps the display code into it. */
  headerBand: { x0: 36, y0: 18, x1: 576, y1: 54 } as Box,
  /** Page 1 only. Empty and labelled; the relay stamps the name inside it. */
  nameBox: { x0: 72, y0: 180, x1: 540, y1: 240 } as Box,
  /** Page 1 only, as the name box. */
  idBox: { x0: 72, y0: 300, x1: 540, y1: 360 } as Box,
  /** Answer pages: "{label}, page {k} of {allotment}". */
  partLabel: { x0: 36, y0: 60, x1: 576, y1: 84 } as Box,
  /** Answer pages: where the student's page goes, or the outline on a template. */
  answerArea: { x0: 36, y0: 90, x1: 576, y1: 756 } as Box,
  /** Every page: the assignment identifier and "page {n} of {N}". */
  footer: { x0: 36, y0: 762, x1: 576, y1: 780 } as Box,
} as const;

/** The geometry's name, written into the payload so a consumer can tell versions apart. */
export const GEOMETRY_ID = 'GBHW-1';

/**
 * **Two pages per part unless the instructor says otherwise**, and today nobody
 * can: the Assignment Maker does not emit `allotment` yet, so every part takes
 * the default. The contract's rule is that an absent value means 2 and that
 * every reader applies that default identically, so it lives here as one
 * constant rather than as a `?? 2` at each use.
 */
export const DEFAULT_ALLOTMENT = 2;

export const allotmentOf = (part: Pick<GenericPart, 'part_id'> & { allotment?: unknown }): number =>
  Number.isInteger(part.allotment) && (part.allotment as number) >= 1
    ? (part.allotment as number)
    : DEFAULT_ALLOTMENT;

/** One crop, as the packaging layer already resolved it for the payload. */
export interface PlacedCrop {
  /** The payload's key for this crop, which is what `placed` records. */
  key: string;
  /** The part the student ticked, or null when they ticked nothing. */
  partId: string | null;
  /** Its position among its part's pages, 1-based, as the payload reports it. */
  partPage: number;
  width: number;
  height: number;
}

export type PlannedPage =
  | { kind: 'name' }
  | {
      kind: 'answer';
      partId: string;
      label: string;
      /** Which of the part's allotted pages this is, 1-based. */
      slot: number;
      allotment: number;
      /**
       * The crops drawn on this page, in order. Empty means "No page submitted
       * for this part". More than one means the part overran its allotment and
       * the student accepted the fit.
       */
      crops: PlacedCrop[];
    };

export interface FixedLayoutPlan {
  pages: PlannedPage[];
  /** The payload's `fixed_layout` block, minus the file name the packager knows. */
  parts: {
    part_id: string;
    allotment: number;
    /** 1-based page number in the finished PDF of this part's first allotted page. */
    first_page: number;
    placed: string[];
    fitted: boolean;
  }[];
}

/**
 * Deal each part's crops into its allotted pages.
 *
 * **One per page while they fit, then stacked.** A part with three pages and an
 * allotment of two puts one on the first and two on the second, rather than
 * shrinking all three evenly: the common case is a student who ran a few lines
 * over, and the page that overran should be the one that pays for it.
 */
const dealIntoSlots = (crops: PlacedCrop[], allotment: number): PlacedCrop[][] => {
  const slots: PlacedCrop[][] = Array.from({ length: allotment }, () => []);
  if (crops.length <= allotment) {
    crops.forEach((c, i) => slots[i].push(c));
    return slots;
  }
  // Overflow: fill the earlier slots one apiece, and stack what is left on the
  // last slot, in the student's own page order.
  crops.slice(0, allotment - 1).forEach((c, i) => slots[i].push(c));
  slots[allotment - 1].push(...crops.slice(allotment - 1));
  return slots;
};

/**
 * The page order: the name page, then each part's allotted pages in the student
 * spec's order. Total pages is 1 plus the sum of the allotments, **whatever the
 * student submitted**, which is the property that lets one template align every
 * submission in the class.
 */
export const planFixedLayout = (
  parts: readonly GenericPart[],
  crops: readonly PlacedCrop[],
): FixedLayoutPlan => {
  const pages: PlannedPage[] = [{ kind: 'name' }];
  const planned: FixedLayoutPlan['parts'] = [];

  for (const part of parts) {
    const allotment = allotmentOf(part);
    const mine = crops
      .filter(c => c.partId === part.part_id)
      .slice()
      .sort((a, b) => a.partPage - b.partPage);
    const slots = dealIntoSlots(mine, allotment);

    planned.push({
      part_id: part.part_id,
      allotment,
      first_page: pages.length + 1,
      placed: mine.map(c => c.key),
      fitted: mine.length > allotment,
    });

    slots.forEach((slotCrops, i) => {
      pages.push({
        kind: 'answer',
        partId: part.part_id,
        label: part.label,
        slot: i + 1,
        allotment,
        crops: slotCrops,
      });
    });
  }

  return { pages, parts: planned };
};

/** 1 plus the sum of the allotments, which the relay checks on arrival (R7). */
export const templateLength = (parts: readonly GenericPart[]): number =>
  1 + parts.reduce((n, p) => n + allotmentOf(p), 0);
