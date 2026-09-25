/**
 * loadRefusal.ts — whether an assignment file that decoded cleanly must still
 * be refused, and in what words.
 *
 * `WORKORDER_SS_NO_GRADER_STRINGS_AND_LOAD_ORDER_2026-09-25` and its Supplement 1.
 *
 * This decision used to live inside the load handler in `App.tsx`, where only
 * a browser could reach it, and that is how a defect hid there: the
 * printed-sheet refusal ran BEFORE the generic-sheet check, so a generic-page
 * file with no map was refused with the printed sheet's message, which named a
 * PDF a generic-page student never printed and said a load that had just been
 * refused could go ahead. The approved generic refusal could never be shown.
 *
 * **It decides and returns. It does not act.** No `alert`, no status line, no
 * state: `App` does the refusing, in the page's status line and in a dialog,
 * so the refusal is seen even when the browser suppresses the dialog.
 *
 * **The order is the fix.** The generic check runs first. `genericSheetProblem`
 * returns null at once for a file with no `sheet`, which is every printed-sheet
 * assignment, so a printed-sheet file falls through to the check written for it.
 */

import type { Assignment, StoredLayoutMap } from '../types';
import { genericSheetProblem } from './genericSheet';
import { GENERIC_WORDING } from './genericWording';

/**
 * A printed-sheet assignment that arrived with no map. Approved 2026-09-25,
 * replacing a message that said "You can still photograph your pages" directly
 * above a refusal, and promised whole pages to a grader.
 */
export const PRINTED_NO_MAP_REFUSAL =
  'This assignment file is incomplete: it is missing the map that tells the application ' +
  'where your answers are on the page.\n\n' +
  'Nothing has been loaded.\n\n' +
  'Load the assignment zip your instructor gave you, the one you printed the question PDF from, ' +
  'rather than the assignment_spec.json on its own. If the zip does the same thing, tell your instructor.';

export interface LoadRefusal {
  /** Which check refused it. */
  kind: 'generic-sheet' | 'no-layout-map';
  /** What the student is shown, word for word. */
  message: string;
  /** For the console, never the student: the generic check's own reason. */
  detail?: string;
}

export const assignmentLoadRefusal = (
  json: Pick<Assignment, 'inputMode' | 'sheet' | 'parts'>,
  layout: StoredLayoutMap | null,
): LoadRefusal | null => {
  const genericProblem = genericSheetProblem(json, layout);
  if (genericProblem) {
    return { kind: 'generic-sheet', message: GENERIC_WORDING.badGenericFile, detail: genericProblem };
  }
  if (json.inputMode === 'handwritten' && !layout) {
    return { kind: 'no-layout-map', message: PRINTED_NO_MAP_REFUSAL };
  }
  return null;
};
