/**
 * previewWording.ts — what a HANDWRITTEN student sees on tapping Preview.
 *
 * `WORKORDER_SS_HANDWRITTEN_PREVIEW_2026-09-25`. The preview shows typed
 * answers and is never given the photographs, so on a handwritten assignment
 * it used to print "No answer submitted." under every part: the most alarming
 * sentence the app could produce, shown to the student who opened Preview
 * because they wanted reassurance. It now shows the title page and one of
 * these instead, chosen by how many pages the student has photographed.
 *
 * **STATUS: APPROVED by Andre, 2026-09-25.** The singular drops the numeral
 * ("the page", not "the 1 page"). A change to any string here needs approval
 * again.
 *
 * **What these deliberately do not say.** The draft ended its first sentence
 * "…, and those pages are in your submission." That was true, since every
 * photographed page goes into the ZIP, and it was removed anyway: it is the
 * one phrase a worried student would read as "your submission is fine", and
 * the preview cannot know that. Whether every part has a page is the
 * completeness gate's to say (`services/completeness.ts`), at download, where
 * the student can act on it. **So nothing here may claim the submission is
 * complete or correct**, and the work order's own brief ("there is nothing
 * missing") was not followed, because a student can photograph three pages
 * and still leave a part without one.
 *
 * Two sentences each, for someone who tapped Preview to be reassured in five
 * seconds. No grader and no platform is named (`tests/platform-neutral-tests.mjs`).
 */

export const handwrittenPreviewNote = (pageCount: number): string => {
  if (pageCount <= 0) {
    return 'You have not photographed any pages yet. ' +
      'This preview only shows typed answers, so your pages will not appear here.';
  }
  if (pageCount === 1) {
    return 'Your answers are on the page you photographed. ' +
      'This preview only shows typed answers, so it cannot show yours.';
  }
  return `Your answers are on the ${pageCount} pages you photographed. ` +
    'This preview only shows typed answers, so it cannot show yours.';
};
