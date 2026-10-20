/**
 * fitNotice.ts — what the student is told when a part has more pages than the
 * assignment allows room for.
 *
 * ## Why this is a notice and not a refusal
 *
 * The allotment is structural: the number of pages a part occupies in the
 * fixed-layout PDF is the same for every student in the class, because one
 * blank template has to align all of them. So a student with three pages for a
 * two-page part cannot be given a third page. The two choices that remain are
 * to refuse the download, or to fit the pages into the allotted ones and say so.
 *
 * **Fitting and saying so is the right one.** A refusal at the moment of
 * download turns a student who wrote long into a student who submitted nothing,
 * and the standing rule in `CLAUDE.md` is that a guard on a constructive action
 * fails open. Every page the student photographed still reaches the grader; what
 * changes is that two of them share a sheet and are therefore smaller. That is a
 * legibility cost the student can see and decide about, not a loss.
 *
 * ## Why the wording lives here and not in the component
 *
 * The sentences were approved by Andre Knoesen on 2026-10-20, in the words
 * below. A component that assembled them from fragments would let a later edit
 * to the layout quietly reword an approved student-facing sentence. Here they
 * are one function, and `tests/fixed-layout-tests.mjs` asserts the approved
 * sentence for the work order's own case (a part with three pages and an
 * allotment of two).
 *
 * Work item W3 task 2 of `workorders\CANVAS_UPLOAD` (`WORKORDER_SS_CANVAS_UPLOAD_2026-10-19`).
 */

import { FixedLayoutPlan } from './fixedLayout';

/** What the gate shows. Sentences, already written, in the order they are read. */
export interface FitNotice {
  /** One sentence per part that overran, in the assignment's order. */
  lines: string[];
  /** What downloading will do. */
  consequence: string;
  /** The choice, which is always a real choice. */
  choice: string;
}

/**
 * Small numbers as words, because these sentences are read aloud in the head:
 * "has three pages and room for two" is a sentence, "has 3 pages and room for
 * 2" is a form field. Above twelve the digits are clearer than the words, and a
 * part with thirteen pages has bigger problems than its typography.
 */
const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
] as const;

export const numberWord = (n: number): string =>
  Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);

/**
 * The notice, or null when every part fits.
 *
 * Built from the plan the PDF was actually drawn from, not from the crop
 * record: the sentence says what the document in the archive does, and the only
 * thing that knows that is the plan. `fitted` is the plan's own word for it, and
 * is what the payload reports to the relay.
 */
export const fitNotice = (parts: FixedLayoutPlan['parts']): FitNotice | null => {
  const over = parts.filter(p => p.fitted);
  if (over.length === 0) return null;

  const lines = over.map(p =>
    `Part ${p.part_id} has ${numberWord(p.placed.length)} pages and room for ` +
    `${numberWord(p.allotment)}.`);

  // One part, or several that happen to share an allotment: name the number of
  // pages they will be fitted into. Several with different allotments: there is
  // no single number to name, and inventing one would be wrong.
  const allotments = new Set(over.map(p => p.allotment));
  const room = allotments.size === 1
    ? `the ${numberWord(over[0].allotment)} pages the assignment allows`
    : 'the pages the assignment allows';

  return {
    lines,
    consequence: `Your pages will be fitted into ${room}, so they will appear smaller.`,
    choice: 'You can rewrite more compactly, or download anyway.',
  };
};

/**
 * The same notice, read out of a built package's payload.
 *
 * The payload is a `Record<string, unknown>` on purpose: it is a document shape,
 * not a program type, and nothing in the app is allowed to assume a key is
 * there. So the narrowing happens here, once, defensively, rather than as a cast
 * at the call site. A payload with no `fixed_layout` (every path but the generic
 * answer sheet) and a payload whose block is not the shape this expects both
 * give null, which is "nothing to warn about" and is the safe answer: the gate
 * informs, so failing to show it costs a sentence, never a submission.
 */
export const fitNoticeFromPayload = (payload: Record<string, unknown>): FitNotice | null => {
  const block = payload.fixed_layout;
  if (typeof block !== 'object' || block === null) return null;
  const parts = (block as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;
  const usable = parts.filter((p): p is FixedLayoutPlan['parts'][number] =>
    typeof p === 'object' && p !== null
    && typeof (p as { part_id?: unknown }).part_id === 'string'
    && Number.isInteger((p as { allotment?: unknown }).allotment)
    && Array.isArray((p as { placed?: unknown }).placed));
  return usable.length === parts.length ? fitNotice(usable) : null;
};
