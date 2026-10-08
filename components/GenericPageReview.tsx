import React, { useRef, useState } from 'react';
import {
  AlertTriangle, Camera, Check, CheckCircle2, Flag, Image as ImageIcon, Info, RefreshCw, Upload,
} from 'lucide-react';
import { CropRef, GenericPart, PageRef, StudentReview } from '../types';
import {
  GenericProblem, chosenPartIds, chosenProblemNumber, genericCoverage, genericCropsInPageOrder,
  partDisplayLabel, partSubsectionTitle, problemsOf,
} from '../services/genericSheet';
import { GENERIC_WORDING as W } from '../services/genericWording';

/**
 * The review step on the generic answer page, where it is also the labelling
 * step (`WORKORDER_SS_PAGE_LABELLING_2026-09-24` §2).
 *
 * One row per photographed page: the whole box, as the grader will see it,
 * with what the student says it is beside it. **The student chooses the
 * problem, then ticks the parts of it the page carries**
 * (`WORKORDER_SS_MULTIPART_PAGES_2026-10-07`, S1): every part starts ticked, a
 * one-part problem has nothing to tick, and parts of two problems cannot share
 * a page. The problem is a native `<select>`, which is the one control every
 * phone renders as a proper picker; the parts are tick boxes at least 44 px
 * tall. Both stay editable: relabelling never needs a retake.
 *
 * Above the list, what the labels add up to: parts with no page, a part with
 * several pages while another has none, pages with no part, pages that look
 * blank. **All of it is said, none of it blocks.** A student at midnight with
 * one part missing downloads what they have.
 *
 * The review buttons and their words are the printed sheet's, unchanged.
 */

interface GenericPageReviewProps {
  parts: GenericPart[];
  /**
   * The assignment's problems, so each part is shown with its question's own
   * title (`services/genericSheet.ts`, `partDisplayLabel`). Absent, or a part
   * with no title: the formal label alone, exactly as before.
   */
  problems?: readonly { subsections?: readonly { name?: unknown }[] }[];
  crops: Record<string, CropRef>;
  /** crop key → object URL for the stored crop bitmap. */
  cropUrls: Record<string, string>;
  pages: PageRef[];
  /** The student chose a page's problem; `0` clears it. Every part of it starts ticked. */
  onChooseProblem: (cropKey: string, problemNumber: number) => void;
  /** The student ticked or unticked one part of the page's problem. */
  onTogglePart: (cropKey: string, partId: string) => void;
  onReview: (cropKey: string, review: StudentReview) => void;
  /** Replace this page's photograph and cut its box again. The label is kept. */
  onRetakePage: (pageId: string, file: File) => Promise<void>;
  busy: string | null;
}

const REVIEW_LABEL: Record<StudentReview, string> = {
  signed_off: 'Looks right',
  flagged: 'Flagged',
  not_reviewed: 'Not checked yet',
};

const GenericPageReview: React.FC<GenericPageReviewProps> = ({
  parts, problems, crops, cropUrls, pages, onChooseProblem, onTogglePart, onReview, onRetakePage, busy,
}) => {
  const shown = (p: GenericPart): string => partDisplayLabel(p, problems);
  const groups = problemsOf(parts);
  /**
   * What the problem list shows. A one-part problem is its one part, title and
   * all, exactly as the part list showed it. A multi-part problem is
   * "Problem N", with the problem's own name after a colon when it has one.
   */
  const problemShown = (g: GenericProblem): string => {
    if (g.parts.length === 1) return shown(g.parts[0]);
    const name = problems?.[g.problemNumber - 1] as { name?: unknown } | undefined;
    const title = typeof name?.name === 'string' ? name.name.replace(/\s+/g, ' ').trim() : '';
    return title ? `Problem ${g.problemNumber}: ${title}` : `Problem ${g.problemNumber}`;
  };
  const retakeRef = useRef<HTMLInputElement>(null);
  const retakeTarget = useRef<string | null>(null);
  const [hasCamera] = useState(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches);

  const ordered = genericCropsInPageOrder(crops, pages);
  const coverage = genericCoverage(parts, crops, pages);
  const reviewed = ordered.filter(c => c.review === 'signed_off').length;
  const flagged = ordered.filter(c => c.review === 'flagged').length;
  const photoNumber = (c: CropRef): number => pages.findIndex(p => p.id === c.fromPage) + 1;
  const hasNotes = coverage.missing.length > 0 || coverage.repeated.length > 0 ||
    coverage.unlabelled > 0 || coverage.blank > 0;

  const handleRetake = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    const target = retakeTarget.current;
    retakeTarget.current = null;
    if (target && files.length > 0) void onRetakePage(target, files[0]);
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8" aria-labelledby="generic-review-heading">
      <input
        ref={retakeRef} type="file" accept="image/*,.heic,.heif"
        {...(hasCamera ? { capture: 'environment' as const } : {})}
        onChange={handleRetake} className="hidden"
      />

      <div className="bg-slate-50 px-4 sm:px-6 py-4 border-b border-gray-200">
        <h2 id="generic-review-heading" className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
          {W.reviewHeading}
        </h2>
        <p className="text-sm text-gray-600 mt-1">{W.reviewIntro}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 border border-green-200">
            {reviewed} of {ordered.length} checked
          </span>
          {flagged > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              {flagged} flagged
            </span>
          )}
          {coverage.unlabelled > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
              {W.chipUnlabelled(coverage.unlabelled)}
            </span>
          )}
        </div>
      </div>

      {hasNotes && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-1.5 min-w-0">
              {coverage.missing.length > 0 && (
                <div>
                  <p className="font-semibold">{W.coverageMissing}</p>
                  <ul className="list-disc pl-5">
                    {coverage.missing.map(p => <li key={p.part_id}>{shown(p)}</li>)}
                  </ul>
                </div>
              )}
              {coverage.repeated.map(r => (
                <p key={r.part.part_id}>{W.coverageRepeated(r.part.label, r.pages)}</p>
              ))}
              {coverage.unlabelled > 0 && <p>{W.coverageUnlabelled(coverage.unlabelled)}</p>}
              {coverage.blank > 0 && <p>{W.coverageBlank(coverage.blank)}</p>}
              <p className="text-xs text-amber-800">{W.coverageNeverBlocks}</p>
            </div>
          </div>
        </div>
      )}

      <ul className="divide-y divide-gray-200">
        {ordered.map((crop) => {
          const key = crop.regionId;
          const url = cropUrls[key];
          const isBusy = busy === key || busy === `page-${crop.fromPage}`;
          const n = photoNumber(crop);
          const selectId = `problem-for-${key}`;
          const problemNumber = chosenProblemNumber(crop, parts);
          const problem = groups.find(g => g.problemNumber === problemNumber) ?? null;
          const ticked = chosenPartIds(crop, parts);
          const chosen = parts.filter(p => ticked.includes(p.part_id));
          const labelled = chosen.length > 0;
          const chosenTitle = problem && problem.parts.length === 1 ? partSubsectionTitle(problem.parts[0], problems) : '';

          return (
            <li key={key} className="p-4 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h3 className="font-semibold text-gray-900">{W.photoHeading(n)}</h3>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                  crop.review === 'signed_off'
                    ? 'bg-green-50 text-green-800 border-green-200'
                    : crop.review === 'flagged'
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-gray-50 text-gray-600 border-gray-200'
                }`}>
                  {REVIEW_LABEL[crop.review]}
                </span>
              </div>

              <label htmlFor={selectId} className="block text-sm font-medium text-gray-800 mb-1">
                {W.choosePrompt}
              </label>
              <select
                id={selectId}
                value={problem ? String(problem.problemNumber) : ''}
                disabled={isBusy}
                onChange={(e) => onChooseProblem(key, Number(e.target.value) || 0)}
                className={`w-full min-h-[44px] rounded-lg border px-3 text-base bg-white mb-3 ${
                  labelled ? 'border-gray-300 text-gray-900' : 'border-red-300 text-gray-500'
                }`}
              >
                <option value="">{W.choosePlaceholder}</option>
                {groups.map(g => (
                  <option key={g.problemNumber} value={String(g.problemNumber)}>{problemShown(g)}</option>
                ))}
              </select>

              {/* The phone draws the closed dropdown and clips a long title to its
                  width; this line is what guarantees it can be read. Only for a
                  one-part problem with a title: a multi-part problem's parts are
                  read in full from their tick boxes below. */}
              {problem && problem.parts.length === 1 && chosenTitle && (
                <p className="-mt-1 mb-3 text-sm font-medium text-gray-900 break-words" data-part-title>
                  {shown(problem.parts[0])}
                </p>
              )}

              {/* A multi-part problem: every part starts ticked; untick what is
                  not on this page. A one-part problem has nothing to tick. */}
              {problem && problem.parts.length > 1 && (
                <fieldset className="mb-3" data-part-ticks>
                  <legend className="block text-sm font-medium text-gray-800 mb-1">{W.partsPrompt}</legend>
                  <div className="space-y-1">
                    {problem.parts.map(p => {
                      const tickId = `tick-${key}-${p.part_id}`;
                      return (
                        <label
                          key={p.part_id} htmlFor={tickId}
                          className="flex items-center gap-3 min-h-[44px] px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 break-words cursor-pointer"
                        >
                          <input
                            id={tickId} type="checkbox" value={p.part_id}
                            checked={ticked.includes(p.part_id)}
                            disabled={isBusy}
                            onChange={() => onTogglePart(key, p.part_id)}
                            className="w-5 h-5 flex-shrink-0"
                          />
                          <span className="min-w-0">{shown(p)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {!labelled && (
                <p className="mb-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {W.unlabelledNote}
                </p>
              )}

              <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                {url ? (
                  <img
                    src={url}
                    alt={`${W.photoHeading(n)}${chosen.map(p => `, ${shown(p)}`).join('')}`}
                    className="w-full h-auto max-h-[60vh] object-contain bg-white"
                  />
                ) : (
                  <div className="p-6 text-center text-sm text-gray-500">
                    <RefreshCw className="w-4 h-4 animate-spin inline" />
                  </div>
                )}
              </div>

              {crop.qualityFlags.length > 0 && (
                <ul className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-1">
                  {crop.qualityFlags.map((flag) => (
                    <li key={flag} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        {flag === 'looks-empty'
                          ? 'This looks blank. If you wrote an answer here, check the picture above shows it.'
                          : flag}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onReview(key, 'signed_off')}
                  className={`min-h-[44px] px-4 rounded-lg text-sm font-medium flex items-center gap-2 border transition-colors disabled:opacity-40 ${
                    crop.review === 'signed_off'
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {crop.review === 'signed_off' ? <CheckCircle2 className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  Looks right
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onReview(key, 'flagged')}
                  className={`min-h-[44px] px-4 rounded-lg text-sm font-medium flex items-center gap-2 border transition-colors disabled:opacity-40 ${
                    crop.review === 'flagged'
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Flag className="w-4 h-4" />
                  Something is wrong
                </button>
                <button
                  type="button"
                  disabled={isBusy || !crop.fromPage}
                  onClick={() => { retakeTarget.current = crop.fromPage ?? null; retakeRef.current?.click(); }}
                  className="min-h-[44px] px-4 rounded-lg text-sm font-medium flex items-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  {hasCamera ? <Camera className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  {W.retakeThisPage}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-slate-50 text-xs text-gray-600">
        Flagging a part does <strong>not</strong> stop you submitting. The flag goes with your submission,
        beside the picture.
      </div>
    </section>
  );
};

export default GenericPageReview;
