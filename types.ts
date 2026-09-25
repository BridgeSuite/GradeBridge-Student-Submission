// =====================================================
// Assignment Format (matches Assignment Maker export)
// =====================================================

export enum SubmissionType {
  TEXT = 'Text',
  IMAGE = 'Image',
  TEXT_AND_IMAGE = 'Text and Image',
  AI_GRADED_BINARY = 'AI Graded: Binary',
  AI_GRADED_SHORT = 'AI Graded: Short',
  AI_GRADED_MEDIUM = 'AI Graded: Medium',
  AI_GRADED_LONG = 'AI Graded: Long',
  HANDWRITTEN = 'Handwritten',
  MATLAB_GRADER = 'MatlabGrader',
  CODE = 'Code',
  FILE_UPLOAD = 'File Upload'
}

export interface Subsection {
  id: string;
  name: string;
  description: string;
  points: number;
  submissionType: SubmissionType | string;
  maxImages?: number;
  config?: string;
  minWords?: number;
}

export interface Problem {
  id: string;
  name: string;
  description: string;
  subsections: Subsection[];
}

/** How students answer. Absent on older assignments, which means 'electronic'. */
export type InputMode = 'electronic' | 'handwritten';

export interface Assignment {
  id: string;
  courseCode: string;
  title: string;
  inputMode?: InputMode;
  // No dueDate / dueTime, deliberately (removed 2026-08-31). They were declared
  // **required** here and read nowhere in this app, while the Assignment Maker
  // never sent them: its markdown parser never set them and its editor stripped
  // them on load. A required field that is never present is a type that lies to
  // the next person who trusts it. Due dates are set in Canvas.
  preamble: string;
  problems: Problem[];
  createdAt: number;
  updatedAt: number;
  // No course public key, deliberately (removed 2026-09-21). A spec may still
  // carry one from before that date; it loads, and nothing reads it. The
  // submission is plain JSON and plain JPEGs, bounded by what goes into it
  // rather than by sealing it. `WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21`.
  /**
   * Per-assignment AI-feedback flag, set in the Assignment Maker. Absent means
   * off. The app is pass-through only: it carries the flag to Gradescope, which
   * owns the election, the tally, and the pointer. No UI here.
   */
  aiFeedback?: boolean;
  /**
   * The layout map, carried inside the spec instead of beside it.
   *
   * `layoutCsv` is the EXACT text of `layout_{ID}.csv` — unchanged, newlines
   * and all. It is not reformatted, not converted to JSON, not normalised, and
   * that is the whole reason it is safe to carry: `computeLayoutId` hashes
   * `canonicalMapSerialization(rows)`, the rows produced by `parseLayoutCsv`,
   * never the file's bytes. The same text through the same parser gives the
   * same rows by construction, so the hash printed into the QR on every sheet
   * cannot move.
   *
   * `layoutCsvName` is the file name that text would have had, so a parse
   * error still names a file the student can recognise.
   *
   * **Both present or both absent. Never one.** A separate `layout_*.csv` in
   * the bundle still wins over these; see `chooseLayoutSource`.
   */
  layoutCsvName?: string;
  layoutCsv?: string;
  /**
   * Which sheet the student writes on. Absent means the sheet the Assignment
   * Maker printed for THIS assignment, whose map says which part every box is.
   * `'generic'` means the one GradeBridge answer page every assignment shares
   * (`GBGEN1`, layout `5F0B10BC`): the page cannot say which part it holds, so
   * the student says so here, from `parts`. Read only on a handwritten
   * assignment; an electronic one ignores it. `services/genericSheet.ts`.
   */
  sheet?: 'generic';
  /** The parts a generic-sheet student chooses from, in order. Absent otherwise. */
  parts?: GenericPart[];
}

/**
 * One entry in `Assignment.parts`, exactly as the Assignment Maker writes it
 * (`WORKORDER_AM_GENERIC_ANSWER_PAGE_2026-09-24` §2). Snake case because it is
 * the file's shape, carried through untouched.
 */
export interface GenericPart {
  /** `1(a)`, or `2` for a problem with one part. Written into the package. */
  part_id: string;
  problem_number: number;
  subsection_letter: string;
  /** What the student is shown: `Problem 1, part (a)`. */
  label: string;
  /** Conventional assignments only. A reader assignment omits it. */
  max_points?: number;
}

// =====================================================
// Handwritten pages and crops
// =====================================================

/** What stage 6 of the registration pipeline made of one photographed page. */
export interface PageRegistrationInfo {
  status: 'pending' | 'ok' | 'degraded' | 'failed' | 'layout_mismatch';
  /** Page number and page count, read from the QR on the paper — never from upload order. */
  k?: number;
  n?: number;
  /** `layout_id` as printed on the page. Compared against the loaded map's. */
  layoutId?: string;
  marksFound?: number;
  /**
   * Which of NW, NE, SW, SE the fit was actually built on.
   *
   * `marksFound` says how many; this says which, and on a three-mark fit the
   * two are different questions. The missing corner is the end of the page the
   * transform had to infer rather than measure, so it is the end a grader
   * looking at a disputed crop should look at first. Empty when nothing fitted.
   */
  marksDetected?: string[];
  /**
   * Corners where a mark WAS detected and the chosen fit did not use it.
   *
   * "Detected and not used" and "never found" are different facts. Before
   * 2026-09-02 the app collapsed them — it reported the complement of
   * `marksDetected` as missing — and on `ios2_05` that made it state a mark had
   * not been found when it had been found, measured and discarded.
   */
  marksDeclined?: string[];
  residualMm?: number;
  /**
   * Worst error at a declined mark near one of the fit's own predicted corners.
   * The QR residual is one point in the NE corner; this is the second witness.
   */
  heldOutMm?: number;
  /** Student-facing, one sentence. */
  message?: string;
}

export interface PageRef {
  id: string;
  file: string;    // name inside the submission ZIP, e.g. page_1.jpg
  width: number;   // dimensions of the STORED (ingested) image
  height: number;
  // Local bookkeeping for the uploader. The exported submission JSON carries
  // only the four fields above, plus `registration` where a page has one.
  bytes?: number;
  sourceName?: string;
  warnings?: string[];
  registration?: PageRegistrationInfo;
  /**
   * Changes whenever the stored bitmap does: upload, replace, rotate. Local
   * only — never exported. It is what makes the personal-information
   * confirmation stop counting when a page is retaken, even at the same size.
   * See `services/personalInfo.ts`.
   */
  captureId?: string;
}

/**
 * How a crop was obtained. The grader must not assume a direct capture came
 * from a known rectangle on a registered page: nothing was registered, no
 * rectangle was declared, and the framing is the student's.
 */
export type CropSource = 'registration' | 'direct_capture';

/** What the student said about the crop after looking at it. */
export type StudentReview = 'signed_off' | 'flagged' | 'not_reviewed';

/**
 * Who said which part a crop is. `'layout'`: the printed sheet's map, as it
 * always has. `'student'`: the student chose it, on the generic sheet, because
 * the page cannot say.
 */
export type PartSource = 'layout' | 'student';

/** Where the writing is inside a crop, in crop pixels; `x1`, `y1` exclusive. */
export interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * One answer, cut out and shown back. Every field above `cropSource` is read
 * from the map row — never parsed out of `region_id`, never inferred from the
 * order pages were uploaded in.
 */
export interface CropRef {
  regionId: string;
  partId: string;
  pageK: number;
  isDrawing: boolean;
  maxPoints: number;
  cropSource: CropSource;
  review: StudentReview;
  /** Advisory only. A flagged or warned crop still submits. */
  qualityFlags: string[];
  /** Name inside the submission ZIP. */
  file: string;
  width: number;
  height: number;
  bytes: number;
  /** PageRef.id this was cut from. Absent for a direct capture. */
  fromPage?: string;
  /** New on every cut and every direct capture. Local only; see `PageRef.captureId`. */
  captureId?: string;
  /**
   * Generic sheet only; absent means `'layout'`. On that path `partId` is what
   * the student chose, and `''` until they choose.
   */
  partSource?: PartSource;
  /**
   * Generic sheet only. The map's `region_id` the crop was cut from. There is
   * one region and one crop per PAGE, so the record's key (`regionId` above)
   * is per page, `gen@{pageId}`, and this carries the map's own id.
   */
  mapRegionId?: string;
  /** Generic sheet only. Where the ink is; null when the page has none. */
  inkBox?: InkBox | null;
}

export interface SubmissionData {
  [key: string]: {
    textAnswer?: string;
    imageAnswers?: string[]; // Array of base64 strings
    aiAnswer?: string;
  };
}

/**
 * The geometry map, as loaded from `layout_{ID}.csv` in the assignment zip.
 * Structurally identical to `services/layoutMap.ts`'s `LayoutMap`; declared
 * here too because `AppState` is autosaved and restored as plain JSON.
 */
export interface StoredLayoutMap {
  rows: Array<{
    assignmentId: string;
    layoutId: string;
    regionId: string;
    partId: string;
    pageK: number;
    x0: number; y0: number; x1: number; y1: number;
    isDrawing: boolean;
    maxPoints: number;
  }>;
  assignmentId: string;
  declaredLayoutId: string;
  computedLayoutId: string;
  maxPageK: number;
  sourceName: string;
}

export interface AppState {
  assignment: Assignment | null;
  submissionData: SubmissionData;
  /** Handwritten page pool — metadata only; the bitmaps live in IndexedDB. */
  pages: PageRef[];
  /** The map from the assignment zip. Null for electronic assignments. */
  layout: StoredLayoutMap | null;
  /** One entry per region the map declares, keyed by region_id. */
  crops: Record<string, CropRef>;
  viewMode: 'edit' | 'print';
  lastSaved: string | null;
  privacyAcknowledged: boolean;
}

export interface BackupData {
  submission_data: SubmissionData;
  assignment_title: string;
  course_code: string;
  exported_at: string;
  version: string;
  // Handwritten backups carry the pages too, so the file is genuinely complete
  // and a restore does not send the student back to re-photograph everything.
  pages?: PageRef[];
  page_images?: Record<string, string>;  // PageRef.id → data URI
  // ...and the crops, including the sign-off state, so a restore does not send
  // them back through the review either.
  layout?: StoredLayoutMap | null;
  crops?: Record<string, CropRef>;
  crop_images?: Record<string, string>;  // region_id → data URI
}