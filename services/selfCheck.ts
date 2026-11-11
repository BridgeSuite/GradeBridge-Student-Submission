/**
 * selfCheck.ts — the app reads back the suitcase it has just built and says
 * whether it is complete. Phase 1.6 of
 * `PLAN_SUBMISSION_APP_FIXES_AND_REVAMP_2026-11-08`.
 *
 * **The minimal check, by Andre Knoesen's ruling of 11 November 2026**: the
 * answers PDF is present with exactly `fixed_layout.pages` pages, every one
 * Letter size (the relay's R8); `fixed_layout` is present (R7, presence only);
 * and the `files` map is present and matches the archive, entry for entry. The
 * full R1 to R8 of `CONTRACT_HOMEWORK_TO_GRADESCOPE_v1_2026-10-19` §6 waits
 * until after turnover. **The relay stays the gatekeeper**; this is a
 * convenience, so it informs and never blocks: a download is a constructive
 * action and its guard fails open (standing rule, `CLAUDE.md`).
 *
 * It reads the archive's bytes, not the builder's account of them, so it
 * checks what the student is about to upload.
 *
 * WORDING: the four sentences the student sees (`completeWithPages`,
 * `complete`, `incomplete`, `incompleteAdvice`) are CLEARED by André Knoesen, 11 Nov 2026 15:10;
 * `incompleteAdvice` in the form he set.
 * Kept quiet by André Knoesen's ruling of 11 Nov 15:05: minimum wording, calm,
 * never sounding like an error.
 * The rest name each problem for tests and for anyone reading the result;
 * they are not shown to the student.
 */

import JSZip from 'jszip';

export const SELF_CHECK_WORDING = {
  completeWithPages: (n: number): string => `Your submission file is complete: ${n} pages.`,
  complete: 'Your submission file is complete.',
  incomplete: 'Please press Download submission once more.',
  incompleteAdvice:
    'The file just saved is not quite complete. Your work is saved. If you see this again, reload this page and download once more.',
  unreadable: 'The file could not be opened.',
  noPayload: 'The submission data is missing.',
  noFixedLayout: 'The description of the answers PDF is missing.',
  noAnswersPdf: 'The answers PDF is missing.',
  wrongPageCount: (got: number, want: number): string =>
    `The answers PDF has ${got} pages; it should have ${want}.`,
  notLetter: 'A page of the answers PDF is not Letter size.',
  noFilesMap: 'The list of files in the submission is missing.',
  fileUnlisted: (name: string): string => `${name} is in the file but not in its list.`,
  fileMissing: (name: string): string => `${name} is listed but not in the file.`,
  fileChanged: (name: string): string => `${name} does not match its fingerprint.`,
} as const;

const W = SELF_CHECK_WORDING;

export interface SelfCheckResult {
  ok: boolean;
  /** Pages of the answers PDF, on the generic page; null elsewhere. */
  pages: number | null;
  /** What is wrong, in the student's words. Empty when `ok`. */
  problems: string[];
}

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

/** Letter in PDF points, as jsPDF writes it: `[0 0 612. 792.]`. */
const LETTER_BOX = /^\[\s*0\.?\s+0\.?\s+612(\.0*)?\s+792(\.0*)?\s*\]$/;

/** The pages of a PDF and whether every one is Letter: read from its page objects. */
export const pdfPages = (pdf: string): { count: number; allLetter: boolean } => {
  const count = (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const boxes: string[] = pdf.match(/\/MediaBox\s*\[[^\]]*\]/g) ?? [];
  const allLetter = boxes.length > 0 && boxes.every(b => LETTER_BOX.test(b.replace(/^\/MediaBox\s*/, '')));
  return { count, allLetter };
};

/**
 * Checks a built archive. `generic` says whether it is a generic-page
 * submission, which carries the answers PDF; the caller knows, and the archive
 * is not trusted to say.
 */
export const checkBuiltSuitcase = async (
  zipData: Blob | Uint8Array | ArrayBuffer, generic: boolean,
): Promise<SelfCheckResult> => {
  const problems: string[] = [];
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(zipData); }
  catch { return { ok: false, pages: null, problems: [W.unreadable] }; }

  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  const payloadName = names.find(n => !n.includes('/') && n.endsWith('.json'));
  if (!payloadName) return { ok: false, pages: null, problems: [W.noPayload] };
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(await zip.file(payloadName)!.async('string')); }
  catch { return { ok: false, pages: null, problems: [W.noPayload] }; }

  // The `files` map: present, and naming exactly the archive minus the payload,
  // each with the SHA-256 of the bytes actually in it.
  const files = payload.files as Record<string, unknown> | undefined;
  if (!files || typeof files !== 'object') {
    problems.push(W.noFilesMap);
  } else {
    const others = names.filter(n => n !== payloadName);
    for (const n of others) if (!(n in files)) problems.push(W.fileUnlisted(n));
    for (const n of Object.keys(files)) {
      const entry = zip.file(n);
      if (!entry) { problems.push(W.fileMissing(n)); continue; }
      const bytes = await entry.async('uint8array');
      const sum = hex(await crypto.subtle.digest('SHA-256', bytes));
      if (sum !== files[n]) problems.push(W.fileChanged(n));
    }
  }

  let pages: number | null = null;
  if (generic) {
    const fixed = payload.fixed_layout as { file?: unknown; pages?: unknown } | undefined;
    if (!fixed || typeof fixed !== 'object') {
      problems.push(W.noFixedLayout);
    } else {
      const entry = typeof fixed.file === 'string' ? zip.file(fixed.file) : null;
      if (!entry) {
        problems.push(W.noAnswersPdf);
      } else {
        const { count, allLetter } = pdfPages(await entry.async('binarystring'));
        pages = count;
        if (typeof fixed.pages !== 'number' || count !== fixed.pages) {
          problems.push(W.wrongPageCount(count, typeof fixed.pages === 'number' ? fixed.pages : 0));
        }
        if (!allLetter) problems.push(W.notLetter);
      }
    }
  }
  return { ok: problems.length === 0, pages, problems };
};
