/**
 * submissionRule.ts — whether this assignment's answers must be handwritten,
 * and the words the student is shown about it.
 *
 * `WORKORDER_SS_SUBMISSION_RULE_PER_ASSIGNMENT_2026-10-10`, which supersedes
 * `WORKORDER_SS_HANDWRITTEN_RULE_IN_APP_2026-10-10`. Andre's ruling of
 * 10 October: **handwritten is the default everywhere, and an assignment says
 * when non-handwritten input is acceptable.**
 *
 * The decision reads ONE field, `Assignment.nonHandwrittenAccepted`, and
 * nothing else — never the course code, the title or the id. Only a literal
 * `true` lifts the rule. Absent, `false`, or anything malformed (`"true"`, `1`)
 * takes the default, and the default is shown, never silence: a student shown
 * nothing assumes nothing is required.
 *
 * Neither wording blocks anything. There is no detector, by policy: telling
 * typed text from very regular handwriting would wrong students, and the rule
 * is enforced by the grader, not the app.
 *
 * **The wordings are rule 10 of the submission instructions spec, verbatim.
 * Do not reword, shorten or split them.** A change needs Andre's approval and
 * a matching change to that spec. Each is an array of paragraphs; the default
 * has two, the permissive one has one.
 */

import type { Assignment } from '../types';

export const SUBMISSION_RULE_WORDING = {
  /** Shown when the assignment does not say otherwise. */
  handwritten: [
    'Answers must be handwritten, either on paper or written with a stylus on a tablet. ' +
      'Typed or electronically generated text is not accepted, including a photograph or ' +
      'screenshot of typed text, whatever produced it.',
    'Where an assignment asks for a computer-generated plot, a simulation result or a code ' +
      'listing, include it as the assignment directs. This rule is about your worked solution, ' +
      'not about figures: the reasoning and working around them must be in your hand.',
  ],
  /** Shown only when the assignment says non-handwritten input is accepted. */
  nonHandwrittenAccepted: [
    'Non-handwritten answers are accepted for this assignment. You may typeset your work or ' +
      'produce it any way you choose.',
  ],
} as const;

export type SubmissionRule = 'handwritten' | 'nonHandwrittenAccepted';

/** Which rule applies. Reads the field and nothing else; anything but `true` is the default. */
export const submissionRuleFor = (
  assignment: Pick<Assignment, 'nonHandwrittenAccepted'> | null | undefined,
): SubmissionRule =>
  assignment?.nonHandwrittenAccepted === true ? 'nonHandwrittenAccepted' : 'handwritten';
