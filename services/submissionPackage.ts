/**
 * submissionPackage.ts — what the student uploads to Gradescope.
 *
 * ## Why this is a service and not a handler
 *
 * It used to live inside `App.tsx`, in the React component, reading `state`
 * directly and interleaved with `setStatusMessage`, a progress overlay and an
 * `alert`. That made the one artefact the whole app exists to produce reachable
 * only by a person clicking a button in a browser: it could not be built in a
 * test, could not be opened, and could not be handed to whoever is writing the
 * autograder — who cannot build against a description of a ZIP.
 *
 * So the packaging is here, as functions over plain data, and the component
 * calls them. Nothing about the UI's behaviour changes: the same files go in,
 * in the same order, under the same names, with the same compression.
 *
 * ## What stays outside
 *
 * Two things are deliberately parameters rather than imports.
 *
 * **The PDF arrives as bytes, and only an electronic submission has one.**
 * Building it means rasterising a live DOM with `html2canvas`, which needs a
 * browser laying out real elements; it cannot be lifted out of the component and
 * cannot run in Node, so this file takes the result rather than pretending to own
 * the step. A handwritten submission carries no PDF at all — see
 * `buildSubmissionPackage`.
 *
 * **The page and crop bitmaps arrive through a reader.** In the app they live
 * in IndexedDB under keys this module names; a test supplies them from memory.
 * Passing the store in rather than importing it is what makes the package
 * buildable anywhere, and it keeps this file honest about the fact that it
 * writes bytes it did not produce.
 */

import JSZip from 'jszip';
import { Assignment, CropRef, PageRef, SubmissionData } from '../types';
import { AI_GRADED_TYPES } from '../constants';
import { assertNoIdentityKeys } from './identityGuard';
import {
  PERSONAL_INFO_WORDING_VERSION, PersonalInfoConfirmation, isConfirmationCurrent,
  personalInfoUnconfirmedError,
} from './personalInfo';
import { CROP_FLAG_UNLABELLED, inkBoxJson, isGenericSheet, resolveGenericCrops } from './genericSheet';

/**
 * Key a crop's bitmap is stored under. Pages use their own `PageRef.id`; crops
 * have no id of their own, so `region_id` is namespaced to keep the two apart
 * in one store.
 */
export const cropBlobKey = (regionId: string): string => `crop_${regionId}`;

/**
 * The crops as a list, in the record's own key order.
 *
 * That order is not upload order and does not need sorting: the record is
 * created with one entry per region the moment the layout map is parsed, so its
 * keys are the map's row order, which is the order the sheet was authored in. A
 * student photographing page 9 first does not reorder anything.
 *
 * Kept as a function because it is also where `Object.values` used to lose its
 * element type — `state` was untyped while `@types/react` was missing, so every
 * crop loop in the app went through here to stay typed. The types are installed
 * now and that reason has expired, but the ordering guarantee has not.
 */
export const cropList = (crops: Record<string, CropRef>): CropRef[] =>
  Object.keys(crops).map((regionId) => crops[regionId]);

/**
 * The stem every file in the download shares.
 *
 * **No name is in it, because the app no longer has one** (2026-09-03). What
 * replaces it is the moment: without a discriminator every student in a class
 * downloads an identically named file, and a second attempt lands beside the
 * first as `(1)` in a Downloads folder rather than as something a student can
 * recognise.
 *
 * `assignmentId` already begins with the course code — it is built as
 * `${courseCode}_${title}` — so the course code is not repeated here. The work
 * order specified `{course_code}_{assignment_id}_…`, which would have read
 * `ENG17_ENG17_Homework_1_…`; this keeps the intent and drops the stutter.
 *
 * The timestamp is `last_saved` from the payload, so the filename and the
 * contents cannot disagree about when the submission was made.
 */
export const submissionBaseName = (assignmentId: string, isoTimestamp: string): string => {
  const t = isoTimestamp.replace(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}).*$/, '$1$2$3-$4$5');
  return `${assignmentId}_submission_${t}`.replace(/[^a-z0-9_\-]/gi, '_');
};

/**
 * The two facts every name in the download is built from.
 *
 * **Extracted so the clock is read once.** The identity is computed first and
 * the payload is built with `now` pinned to it, so the archive name, the PDF's
 * entry name and `last_saved` inside the payload come from one `new Date()` and
 * cannot disagree.
 */
export const submissionIdentity = (
  s: SubmissionSources,
): { assignmentId: string; lastSaved: string } => ({
  assignmentId: `${s.assignment.courseCode}_${s.assignment.title.replace(/\s+/g, '_')}`,
  lastSaved: s.now ?? new Date().toISOString(),
});

export interface SubmissionSources {
  assignment: Assignment;
  submissionData: SubmissionData;
  /** `assignment.inputMode === 'handwritten'` — passed in so the caller owns the rule. */
  isHandwritten: boolean;
  /** The map's recomputed `layout_id`. Null for an electronic assignment. */
  layoutId: string | null;
  pages: PageRef[];
  /** Injectable clock, for tests that need a stable filename. Defaults to now. */
  now?: string;
  crops: Record<string, CropRef>;
  /**
   * The student's personal-information confirmation, as made on screen. The
   * package is refused unless it covers exactly these sources; see
   * `services/personalInfo.ts`.
   */
  personalInfoConfirmation?: PersonalInfoConfirmation;
}

/**
 * The submission payload.
 *
 * Every branch here is the one that was in the component, moved unchanged. The
 * electronic payload is byte-for-byte what it was; the handwritten keys are
 * only ever added when `isHandwritten`.
 */
export const buildSubmissionJson = (s: SubmissionSources): Record<string, unknown> => {
  const convertedData: Record<string, { answer: string | null; images_submitted: number }> = {};

  s.assignment.problems.forEach((problem, pIdx) => {
    problem.subsections.forEach((sub, sIdx) => {
      const internalKey = `p${pIdx}_s${sIdx}`;
      const autograderKey = `p${pIdx}s${sIdx}`;
      const subData = s.submissionData[internalKey];
      const isAiGraded = typeof sub.submissionType === 'string' && AI_GRADED_TYPES.has(sub.submissionType);

      if (sub.submissionType === 'Image') {
        convertedData[autograderKey] = {
          answer: null,
          images_submitted: subData?.imageAnswers?.length ?? 0,
        };
      } else if (sub.submissionType === 'Text and Image') {
        convertedData[autograderKey] = {
          answer: subData?.textAnswer ?? null,
          images_submitted: subData?.imageAnswers?.length ?? 0,
        };
      } else if (isAiGraded) {
        convertedData[autograderKey] = {
          answer: subData?.aiAnswer ?? null,
          images_submitted: 0,
        };
      } else {
        convertedData[autograderKey] = {
          answer: subData?.textAnswer ?? null,
          images_submitted: 0,
        };
      }
    });
  });

  const { assignmentId, lastSaved } = submissionIdentity(s);
  // **A payload that names a file the archive does not contain is the defect**
  // — that is why the handwritten path deletes this field rather than leaving it
  // pointing at a PDF it does not ship.
  const pdfFilename = `${submissionBaseName(assignmentId, lastSaved)}.pdf`;

  // **`student_name` is not here, and its absence is the point** (2026-09-03).
  //
  // Identity comes from Gradescope's authenticated submitter. A name typed into
  // a box is unverified, trivially wrong, and PII carried for no gain.
  // `services/identityGuard.ts` refuses a package that carries one, on every
  // path, so a later change cannot put it back quietly.
  //
  // What is given up, deliberately: the spec used to say "compare against
  // Gradescope's submitter; a mismatch is for instructor review". That check is
  // gone. A self-typed name never caught an impostor, only a typo.
  const submissionJson: Record<string, unknown> = {
    course_code: s.assignment.courseCode,
    assignment_id: assignmentId,
    pdf_filename: pdfFilename,
    // Pass-through, per-assignment. Always a real boolean so the autograder
    // never has to tell "off" apart from "an older app version".
    ai_feedback: s.assignment.aiFeedback === true,
    submission_data: convertedData,
    last_saved: lastSaved,
    // The student confirmed, over exactly these answers, that none of them
    // shows personal information, and which sentence they confirmed. Always
    // `true` in a built package, because `buildSubmissionPackage` refuses to
    // build one otherwise; it is recorded so each submission carries its own
    // evidence that the step existed. Not forwarded to the campus host.
    personal_info_confirmed: isConfirmationCurrent(s.personalInfoConfirmation ?? null, s),
    personal_info_wording: PERSONAL_INFO_WORDING_VERSION,
  };

  // Handwritten: the pages, the crops and what the student said about each.
  // Nothing here is emitted for an electronic assignment.
  if (s.isHandwritten) {
    // No PDF is written for a handwritten submission, so the field naming one
    // is deleted rather than left pointing at a file that is not in the archive.
    // A consumer that opens what a payload names is doing the right thing; a
    // payload that names something absent is the defect.
    //
    // It is removed here rather than left out of the literal above so that an
    // ELECTRONIC payload keeps its exact key order, which is unchanged by any of
    // this.
    delete submissionJson.pdf_filename;

    submissionJson.input_mode = 'handwritten';
    submissionJson.layout_id = s.layoutId;
    // `k` and `N` come from each page's own QR, never from upload order.
    submissionJson.pages = s.pages.map(page => ({
      file: page.file,
      width: page.width,
      height: page.height,
      k: page.registration?.k ?? null,
      n: page.registration?.n ?? null,
      registration: page.registration?.status ?? 'pending',
      marks_found: page.registration?.marksFound ?? 0,
      // WHICH corners, not just how many. A page may be registered on three
      // marks (`marks_found: 3`, `registration: "degraded"`), and then the one
      // that is absent names the end of the sheet the transform inferred
      // instead of measuring. That is the first thing to look at when a crop
      // from such a page is disputed, and a count alone cannot say it.
      marks_detected: page.registration?.marksDetected ?? [],
      // Detected, and NOT used by the fit that was chosen. This is not the
      // complement of `marks_detected`: a corner absent from both was never
      // found at all, and a corner listed here was found, measured and
      // declined. A grader deciding a disputed crop needs those to be
      // different facts, because the second one means the app had better
      // information about that end of the sheet than it used.
      marks_declined: page.registration?.marksDeclined ?? [],
      residual_mm: page.registration?.residualMm ?? null,
      // QR reprojection is `residual_mm`; this is the worst error at a declined
      // mark near one of the fit's own corners, in millimetres. 0 when the fit
      // used every candidate near its corners.
      held_out_mm: page.registration?.heldOutMm ?? null,
    }));
    const crops: Record<string, unknown> = {};
    if (isGenericSheetSubmission(s)) {
      // **The generic sheet** (`WORKORDER_SS_PAGE_LABELLING_2026-09-24`). One
      // crop per page, the whole writing box, labelled by the student. Keyed
      // by its file stem, because every crop shares the map's one `region_id`.
      for (const r of resolveGenericCrops(s.crops, s.pages, s.assignment.parts ?? [])) {
        const crop = r.crop;
        crops[r.key] = {
          region_id: crop.mapRegionId ?? crop.regionId,
          // What the student chose, and that it was the student who chose it.
          // Null when they chose nothing: the page is carried, never dropped.
          part_id: r.part ? r.part.part_id : null,
          part_source: 'student',
          page_k: crop.pageK,
          is_drawing: crop.isDrawing,
          // From the part: 0 on a reader assignment, which has no points, as
          // on a printed reader sheet. Null when no part was chosen.
          max_points: r.part ? (r.part.max_points ?? 0) : null,
          crop_source: crop.cropSource,
          student_review: crop.review,
          // An unlabelled page is marked here as well as by its null part, so
          // anyone reading only the flags still sees it.
          quality_flags: r.part ? crop.qualityFlags : [...crop.qualityFlags, CROP_FLAG_UNLABELLED],
          file: r.file,
          width: crop.width,
          height: crop.height,
          // Which photograph it came from, and where it sits among its part's
          // pages. The map cannot say either: it has one region for every page.
          page_file: r.pageFile,
          part_page: r.partPage,
          part_pages: r.partPages,
          // Where the writing is, in this crop's pixels. Metadata only: the
          // crop is the whole box, never trimmed. Null for a page with no ink.
          ink_bbox: inkBoxJson(crop.inkBox),
        };
      }
      submissionJson.crops = crops;
      return submissionJson;
    }
    for (const crop of cropList(s.crops)) {
      crops[crop.regionId] = {
        region_id: crop.regionId,
        part_id: crop.partId,
        // The printed sheet's map said which part this is. The generic sheet
        // writes "student" here, so the two can be told apart without inference.
        part_source: 'layout',
        page_k: crop.pageK,
        is_drawing: crop.isDrawing,
        max_points: crop.maxPoints,
        // How it was obtained. A grader must not assume a direct capture came
        // from a known rectangle on a registered page.
        crop_source: crop.cropSource,
        // What the student said after looking at it. A part they never reached
        // is neither signed off nor flagged.
        student_review: crop.review,
        quality_flags: crop.qualityFlags,
        file: crop.file,
        width: crop.width,
        height: crop.height,
      };
    }
    submissionJson.crops = crops;
  }

  return submissionJson;
};

/** A handwritten submission on the generic answer page. */
const isGenericSheetSubmission = (s: SubmissionSources): boolean =>
  s.isHandwritten && isGenericSheet(s.assignment);

/**
 * Compression for the submission ZIP. Named so the app and any harness that
 * builds one produce the same archive rather than differing by a default.
 */
export const SUBMISSION_ZIP_OPTIONS = {
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
} as const;

export interface PackageAssets {
  /**
   * The rendered submission PDF, for an ELECTRONIC submission only. Omit it for
   * a handwritten one; passing it there is ignored rather than honoured, because
   * whether the archive carries a PDF is a property of the submission and not of
   * what the caller happened to have to hand.
   */
  pdfBytes?: Uint8Array;
  /** Page and crop bitmaps by store key: `PageRef.id`, or `cropBlobKey(regionId)`. */
  readBlob: (key: string) => Promise<Blob | Uint8Array | null>;
  /**
   * Downsampler for the electronic image-answer path, which holds its images as
   * data URIs in state rather than in the blob store. Only called when an
   * assignment has `Image` or `Text and Image` parts.
   */
  downsampleImage: (dataUri: string) => Promise<string>;
}

export interface BuiltPackage {
  zip: JSZip;
  baseName: string;
  /** What went in, in the order it went in. */
  entries: string[];
  /** The payload, exactly as serialised into the archive's JSON entry. */
  submissionJson: Record<string, unknown>;
}

/**
 * One entry on its way into the archive after the JSON: the electronic PDF, a
 * page photograph, a crop, or an electronic image answer.
 */
interface PackageEntry {
  name: string;
  /** A blob or bytes from the store, or -- for the electronic path -- base64 text. */
  data: Blob | Uint8Array | string;
  base64?: boolean;
}

/**
 * The payload as it is written: plain JSON, UTF-8, two-space indented so a
 * teaching assistant opening it in Gradescope can read it.
 *
 * **No encoding, since 2026-09-21.** It used to be gb1 by default, and sealed on
 * a course with a public key. The gb1 key ships inside this public app, so the
 * encoding kept nothing secret and stopped nobody editing a payload; the
 * pipeline's integrity comes from a hash the relay computes. So the relay needs
 * no key, and `JSON.parse` reads this entry directly.
 */
export const serialiseSubmissionJson = (submissionJson: Record<string, unknown>): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(submissionJson, null, 2));

/**
 * Assemble the submission ZIP.
 *
 * The order is the order the component wrote it in and is kept: JSON, PDF, the
 * page photographs, the crops, then any electronic image answers.
 *
 * **A partial submission packages without complaint, deliberately.** A student
 * part-way through sixteen pages is a real state, and refusing to build a
 * package for one would leave them with nothing to hand in. What a page or a
 * part is missing is visible in the payload — a page absent from `pages`, a
 * crop whose `student_review` is `not_reviewed` — rather than by the package
 * failing to exist.
 *
 * **Two things it does refuse**, both before anything is written:
 *
 * - **No current personal-information confirmation.** The student has not
 *   confirmed, over the answers as they are now, that none of them shows who
 *   they are. The app shows that refusal in the page with the way through it;
 *   this is the backstop that makes it true of every caller.
 * - **An identity-shaped key anywhere in the payload.** See
 *   `services/identityGuard.ts`. Checked on the assembled payload, once, for
 *   both paths.
 */
export const buildSubmissionPackage = async (
  sources: SubmissionSources, assets: PackageAssets,
): Promise<BuiltPackage> => {
  if (!isConfirmationCurrent(sources.personalInfoConfirmation ?? null, sources)) {
    throw personalInfoUnconfirmedError();
  }

  // The identity, computed once and then pinned. Everything in the archive is
  // named from it, including the PDF entry. `now` is pinned onto the sources so
  // `buildSubmissionJson` reads the clock zero further times and the filename
  // cannot disagree with `last_saved` inside the payload.
  const { assignmentId, lastSaved } = submissionIdentity(sources);
  const pinned: SubmissionSources = { ...sources, now: lastSaved };
  const baseName = submissionBaseName(assignmentId, lastSaved);

  // The payload, and the guard over it, before a single byte is read from the
  // store: a package that is going to be refused should be refused before the
  // student waits for sixteen photographs to be read.
  const submissionJson = buildSubmissionJson(pinned);
  assertNoIdentityKeys(submissionJson);

  const zip = new JSZip();
  const entries: string[] = [];
  const add = (
    name: string, data: Blob | Uint8Array | string, options?: JSZip.JSZipFileOptions,
  ): void => {
    zip.file(name, data, options);
    entries.push(name);
  };

  add(`${baseName}.json`, serialiseSubmissionJson(submissionJson));

  // **A handwritten submission carries no PDF.** Andre, 2026-09-01, in
  // `workorders/DECISION_PACKAGE_CONTENTS_2026-09-01.md`.
  //
  // `PrintView` never receives the pages or the crops, so the PDF a handwritten
  // submission used to carry was the blank question paper. The instinct is to
  // fill it with the student's photographs; the decision is not to. Nothing
  // consumes it — Gradescope does not render it on the autograder path — it was
  // roughly half the archive by bytes, and it duplicates `page_N.jpg`, which is
  // kept. **A blank PDF nobody is supposed to read is worse than no PDF**,
  // because sooner or later somebody opens it and concludes the student
  // submitted nothing.
  //
  // Removing a thing that can be wrong beats maintaining a second copy of
  // something already kept. The electronic path is untouched.
  //
  // Then the pages, the crops, then any electronic image answers.
  //
  // Until the handwritten work landed the ZIP builder never referenced the
  // pages at all, so a handwritten student submitted a PDF of the blank
  // question paper and a JSON in which every answer was null — and nothing
  // anywhere said so.
  const rest: PackageEntry[] = [];

  if (!sources.isHandwritten) {
    if (!assets.pdfBytes) {
      throw new Error('An electronic submission needs a PDF, and none was supplied.');
    }
    rest.push({ name: `${baseName}.pdf`, data: assets.pdfBytes });
  }

  for (const page of sources.pages) {
    const pageBlob = await assets.readBlob(page.id);
    if (pageBlob) rest.push({ name: page.file, data: pageBlob });
  }
  // Generic crops are named from their labels as they are now, by the same
  // function the payload was written from, so the two cannot disagree.
  const cropFiles: Array<{ crop: CropRef; file: string }> = isGenericSheetSubmission(sources)
    ? resolveGenericCrops(sources.crops, sources.pages, sources.assignment.parts ?? [])
      .map(r => ({ crop: r.crop, file: r.file }))
    : cropList(sources.crops).map(crop => ({ crop, file: crop.file }));
  for (const { crop, file } of cropFiles) {
    const cropBlob = await assets.readBlob(cropBlobKey(crop.regionId));
    if (cropBlob) rest.push({ name: file, data: cropBlob });
  }
  for (let pIdx = 0; pIdx < sources.assignment.problems.length; pIdx++) {
    const problem = sources.assignment.problems[pIdx];
    for (let sIdx = 0; sIdx < problem.subsections.length; sIdx++) {
      const sub = problem.subsections[sIdx];
      if (sub.submissionType === 'Image' || sub.submissionType === 'Text and Image') {
        const autograderKey = `p${pIdx}s${sIdx}`;
        const images = sources.submissionData[`p${pIdx}_s${sIdx}`]?.imageAnswers ?? [];
        for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
          const downsampled = await assets.downsampleImage(images[imgIdx]);
          rest.push({
            name: `${autograderKey}_image_${imgIdx}.jpg`,
            data: downsampled.replace(/^data:[^;]+;base64,/, ''),
            base64: true,
          });
        }
      }
    }
  }

  // The blob straight through, and the electronic answers handed to JSZip as
  // base64 for it to decode — exactly what an unkeyed course always produced.
  for (const entry of rest) {
    add(entry.name, entry.data, entry.base64 ? { base64: true } : undefined);
  }

  return { zip, baseName, entries, submissionJson };
};
