/**
 * handwritingExpectation.ts — whether this assignment carries a stated
 * handwriting expectation, and the words the student is shown when it does.
 *
 * `WORKORDER_SS_SUBMISSION_RULE_PER_ASSIGNMENT_2026-10-10`, as revised the
 * evening of 10 October. **The default is silence.** An expectation nobody set
 * is not shown, because showing one puts words in an instructor's mouth.
 *
 * The decision reads ONE field, `Assignment.handwritingExpected`, and nothing
 * else — never the course code, the title or the id. Only a literal `true`
 * shows the wording. Absent, `false`, or anything malformed (`"true"`, `1`)
 * shows nothing at all on this subject: no softened line, no "check your
 * assignment".
 *
 * The wording never blocks anything. There is no detector, by policy: nothing
 * in the reader can tell a handwritten page from one produced another way, and
 * the expectation is weighed by the grader, not the app.
 *
 * **The wording is the work order's appendix, verbatim. Do not reword, shorten
 * or split it.** A change needs Andre's approval. Two paragraphs.
 */

import type { Assignment } from '../types';

export const HANDWRITING_EXPECTATION_WORDING = [
  'Answers must be handwritten, either on paper or written with a stylus on a tablet. ' +
    'Typed or electronically generated text is not accepted, including a photograph or ' +
    'screenshot of typed text, whatever produced it.',
  'Where an assignment asks for a computer-generated plot, a simulation result or a code ' +
    'listing, include it as the assignment directs. This rule is about your worked solution, ' +
    'not about figures: the reasoning and working around them must be in your hand.',
] as const;

/** Whether to state the expectation. Reads the field and nothing else; only `true` says yes. */
export const handwritingExpectedFor = (
  assignment: Pick<Assignment, 'handwritingExpected'> | null | undefined,
): boolean => assignment?.handwritingExpected === true;
