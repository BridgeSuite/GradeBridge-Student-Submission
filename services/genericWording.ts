/**
 * genericWording.ts — every NEW sentence a student sees on the generic-sheet
 * path, and nowhere else.
 *
 * `WORKORDER_SS_PAGE_LABELLING_2026-09-24` §5: every new string a student sees
 * goes to Andre for approval before it ships. Keeping them in one file makes
 * that approval one file to read and one file to edit, and lets a test hold
 * all of them to the platform-neutral rule at once.
 *
 * **STATUS: APPROVED by Andre, 2026-09-25**, with two changes: `reviewIntro`
 * and `unlabelledNote` no longer say "grader". EEC130A students submit reader
 * work and conventional homework through this same app, and the app cannot
 * tell the two apart, so no student-facing sentence may assume a grader exists.
 * A change to any string here needs approval again.
 *
 * Strings the generic path REUSES unchanged from the printed-sheet path are
 * not here: "Looks right", "Something is wrong", "Flagged", "Not checked yet",
 * "{n} of {m} checked", the blank-page sentence, the flagging footnote, and the
 * download gate's heading, headline, choice and buttons.
 */

export const GENERIC_WORDING = {
  /** PageUploader, before the photograph controls. §2 item 8: one line, no platform. */
  noIdentityReminder:
    'Do not write your name, student ID or email address anywhere on your pages.',

  /** PageUploader, on a page that registered. Replaces "Read as page k of n." */
  pageReadOk: 'This page lined up.',

  /** PageUploader, on a photograph of some other sheet. Replaces the layout-mismatch sentence. */
  notTheAnswerPage:
    'This is not the answer page this assignment uses, so nothing was taken from it. ' +
    'Write your answers on the GradeBridge answer page.',

  /** PageUploader footer. Replaces the sentence about the code in the top-right corner. */
  uploaderFooter:
    'You can photograph your pages in any order. In the next section, say which part each page is.',

  /** GenericPageReview. */
  reviewHeading: 'Say which part each page is, then check it',
  reviewIntro:
    'This is exactly what is collected from each page: the box, under the part you choose. ' +
    'You can change a part at any time.',
  photoHeading: (n: number): string => `Photo ${n}`,
  choosePrompt: 'Which part is this page?',
  choosePlaceholder: 'Choose a part',
  unlabelledNote:
    'No part chosen yet. This page is still submitted, but it will not be filed under any part.',
  retakeThisPage: 'Retake this page',

  /** GenericPageReview, the coverage panel above the list. §2 item 6: say, never block. */
  coverageMissing: 'No page yet for:',
  coverageRepeated: (label: string, n: number): string =>
    `${label} has ${n} pages while another part has none. If one of them belongs to another part, change it.`,
  coverageUnlabelled: (n: number): string =>
    n === 1 ? '1 page has no part chosen.' : `${n} pages have no part chosen.`,
  coverageBlank: (n: number): string =>
    n === 1 ? '1 page looks blank.' : `${n} pages look blank.`,
  coverageNeverBlocks: 'None of this stops you downloading.',
  chipUnlabelled: (n: number): string => `${n} without a part`,

  /** Loading a generic-sheet file that is not well formed. */
  badGenericFile:
    'This assignment file is incomplete, or was made by a newer version of the app. ' +
    'Ask your instructor for the file again.',
} as const;
