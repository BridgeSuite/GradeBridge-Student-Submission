/**
 * personalInfo.ts — the student's confirmation that no answer shows who they are.
 *
 * `WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` §6.
 *
 * ## Why this exists
 *
 * Campus reviewers, including the Privacy Officer, have been told that on
 * coursework the student is shown every answer and confirms it contains no
 * personal information before submitting. Until this file the app showed every
 * crop for sign-off and never asked that question. This is the build catching
 * up with the description.
 *
 * ## The one blocking step, and why it may block
 *
 * `CompletenessGate` informs and never blocks, and that stays true: whether to
 * hand in an incomplete submission is the student's judgement. This is
 * different. It is a single tick the student can always give truthfully, after
 * retaking an answer if they have to, and the refusal is shown in the page with
 * the way through it named. Under the standing rule in `CLAUDE.md` that is a
 * constructive guard WITH recourse (seen, actionable, and the student is told
 * how), which is the one cell where failing closed is allowed.
 *
 * ## "Cannot survive a change to what it confirmed"
 *
 * The confirmation is not a boolean. It is the FINGERPRINT of what was on
 * screen when the box was ticked, and it counts only while the fingerprint of
 * the submission still matches. So there is no list of handlers that must
 * remember to clear it: retaking a page, retaking a crop, replacing an image or
 * editing a typed answer changes the fingerprint, and the tick stops counting
 * on its own. A handler added next year that changes an answer is covered
 * without anyone knowing this file exists.
 *
 * `buildSubmissionPackage` recomputes the fingerprint from the sources it is
 * about to package and refuses on a mismatch, so the check is enforced where
 * the package is made and not only where the button is drawn.
 */

import type { Assignment, CropRef, PageRef, SubmissionData } from '../types';

/**
 * Bumped whenever `PERSONAL_INFO_STATEMENT` or `PERSONAL_INFO_GUIDANCE` changes
 * in meaning, so a payload records which sentence the student agreed to.
 *
 * `pi-1` is the work order's proposed wording, **awaiting Andre's approval
 * before release**.
 */
export const PERSONAL_INFO_WORDING_VERSION = 'pi-1';

/** What the box says. The student ticks exactly this sentence. */
export const PERSONAL_INFO_STATEMENT =
  'I have looked at every answer above. None of them shows my name, my student ID, ' +
  'my email address, or anyone else’s.';

/** What follows it, unticked-able. */
export const PERSONAL_INFO_GUIDANCE =
  'If one does, retake that answer before submitting. Your instructor knows who you are ' +
  'from your login; your answers never need to say it.';

/**
 * What the student has confirmed: the fingerprint of the submission at the
 * moment of ticking, and the wording they ticked. Null means not confirmed.
 *
 * Deliberately NOT part of `AppState`, so it is never autosaved and never
 * restored from a backup: a confirmation belongs to the student looking at the
 * screen now, not to a file.
 */
export type PersonalInfoConfirmation = { fingerprint: string; wordingVersion: string } | null;

/** What the app starts with, and what a student sees the first time: unticked. */
export const INITIAL_PERSONAL_INFO_CONFIRMATION: PersonalInfoConfirmation = null;

/** The parts of the submission the confirmation covers. */
export interface ConfirmedContent {
  assignment: Pick<Assignment, 'courseCode' | 'title'>;
  submissionData: SubmissionData;
  pages: PageRef[];
  crops: Record<string, CropRef>;
}

/**
 * A fresh id for a newly captured bitmap. Stamped on a page or a crop every
 * time its image changes, so the fingerprint moves even when a retake happens
 * to come out at the same size.
 */
export const newCaptureId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---------- the hash ----------
// cyrb53: two 32-bit lanes, 53 bits out. Not cryptographic and does not need to
// be: this detects the student's own edits, it does not resist an adversary.
// Anyone who wants to defeat a checkbox can untick nothing and tick it.

class Hasher {
  private h1 = 0xdeadbeef;
  private h2 = 0x41c6ce57;

  update(s: string): this {
    for (let i = 0; i < s.length; i++) this.char(s.charCodeAt(i));
    // A separator, so ("ab","c") and ("a","bc") hash differently.
    this.char(0x1f);
    return this;
  }

  /**
   * An image answer is a data URI of a megabyte or more, and typing in any text
   * box recomputes the fingerprint. So an image is hashed by its length, its
   * last 64 characters and every 61st character between — never whole. A
   * replaced photograph differs throughout its base64, so a sampled position
   * catches it; a collision needs the same length AND the same character at
   * every sampled position, which two different JPEGs do not produce.
   */
  updateSampled(s: string): this {
    this.update(String(s.length));
    for (let i = 0; i < s.length; i += 61) this.char(s.charCodeAt(i));
    return this.update(s.slice(-64));
  }

  private char(c: number): void {
    this.h1 = Math.imul(this.h1 ^ c, 2654435761);
    this.h2 = Math.imul(this.h2 ^ c, 1597334677);
  }

  digest(): string {
    let h1 = this.h1, h2 = this.h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
}

/**
 * The fingerprint of everything the confirmation covers.
 *
 * **In:** every typed answer and every image answer (electronic); every page
 * and every crop, by id, capture id, source, dimensions and stored size
 * (handwritten). **Out, deliberately:** a crop's `review` (signing off an
 * answer does not change what it shows), page ORDER and page file names
 * (moving a page renumbers `page_N.jpg` without changing a pixel), and the
 * registration outcome.
 */
export const confirmationFingerprint = (c: ConfirmedContent): string => {
  const h = new Hasher();
  h.update(c.assignment.courseCode).update(c.assignment.title);

  for (const key of Object.keys(c.submissionData).sort()) {
    const d = c.submissionData[key];
    h.update(key).update(d?.textAnswer ?? '').update(d?.aiAnswer ?? '');
    const images = d?.imageAnswers ?? [];
    h.update(String(images.length));
    for (const img of images) h.updateSampled(img);
  }

  for (const p of [...c.pages].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    h.update(p.id).update(p.captureId ?? '')
      .update(`${p.width}x${p.height}:${p.bytes ?? ''}`);
  }

  for (const regionId of Object.keys(c.crops).sort()) {
    const k = c.crops[regionId];
    h.update(regionId).update(k.captureId ?? '').update(k.cropSource).update(k.fromPage ?? '')
      .update(`${k.width}x${k.height}:${k.bytes}`);
  }

  return h.digest();
};

/** Confirm what is on screen now. */
export const confirmPersonalInfo = (c: ConfirmedContent): PersonalInfoConfirmation => ({
  fingerprint: confirmationFingerprint(c),
  wordingVersion: PERSONAL_INFO_WORDING_VERSION,
});

/**
 * Whether a confirmation still covers this submission. False for no
 * confirmation, for one made over different content, and for one made against
 * a wording other than the current one.
 */
export const isConfirmationCurrent = (
  confirmation: PersonalInfoConfirmation, c: ConfirmedContent,
): boolean =>
  confirmation !== null &&
  confirmation.wordingVersion === PERSONAL_INFO_WORDING_VERSION &&
  confirmation.fingerprint === confirmationFingerprint(c);

/** Error name for a package build refused because the confirmation is absent or stale. */
export const PERSONAL_INFO_UNCONFIRMED = 'PersonalInfoUnconfirmed';

export const personalInfoUnconfirmedError = (): Error => {
  const e = new Error(
    'The submission was not built: the student has not confirmed, for the answers as they ' +
    'are now, that none of them shows personal information.');
  e.name = PERSONAL_INFO_UNCONFIRMED;
  return e;
};
