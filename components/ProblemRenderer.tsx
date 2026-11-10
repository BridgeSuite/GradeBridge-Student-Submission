import React from 'react';
import { GenericPart, Problem, Subsection, SubmissionData, SubmissionType } from '../types';
import { GENERIC_WORDING as W } from '../services/genericWording';
import SubmissionWidget from './SubmissionWidget';
import { LatexContent } from './KatexRenderer';

interface ProblemRendererProps {
  problem: Problem;
  problemIndex: number;
  submissionData: SubmissionData;
  onSubmissionChange: (id: string, data: SubmissionData['key']) => void;
  /** The generic answer page, where the student says which part each page is. */
  genericSheet?: boolean;
  /** Generic page: the assignment's parts, to find each part's id. */
  parts?: readonly GenericPart[];
  /**
   * Generic page: part id → the pages matched to it, in page order, so each
   * part shows what it got. A part with none keeps the answer-on-paper note.
   */
  matchedPages?: Record<string, ReadonlyArray<{ key: string; url?: string; headerUrl?: string; photo: number }>>;
}

/** Brings a page's card in the matching grid into view, when it is on screen. */
const showPageCard = (key: string) => {
  document.getElementById(`page-card-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const AI_GRADED_STRINGS = new Set([
  'AI Graded: Binary',
  'AI Graded: Short',
  'AI Graded: Medium',
  'AI Graded: Long',
  SubmissionType.AI_GRADED_BINARY,
  SubmissionType.AI_GRADED_SHORT,
  SubmissionType.AI_GRADED_MEDIUM,
  SubmissionType.AI_GRADED_LONG,
]);

// Handwritten parts are answered on paper — the page pool holds the answer, so
// no per-part input widget is rendered for them.
const isHandwritten = (submissionType: SubmissionType | string): boolean =>
  submissionType === SubmissionType.HANDWRITTEN || submissionType === 'Handwritten';

// Convert submissionType to widget type string
const getWidgetType = (submissionType: SubmissionType | string): string => {
  switch (submissionType) {
    case SubmissionType.TEXT:
    case 'Text':
      return 'Answer as text';
    case SubmissionType.IMAGE:
    case 'Image':
      return 'Answer as image';
    case SubmissionType.TEXT_AND_IMAGE:
    case 'Text and Image':
      return 'Text and Image';
    default:
      if (AI_GRADED_STRINGS.has(submissionType)) return submissionType as string;
      return 'Answer as text';
  }
};

// Combine name and description for display
const getStatement = (name: string, description: string): string => {
  if (name && description) {
    return `${name}\n\n${description}`;
  }
  return name || description || '';
};

// Calculate total points for a problem from its subsections
const calculateProblemPoints = (subsections: Subsection[]): number => {
  return subsections.reduce((sum, sub) => sum + sub.points, 0);
};

const ProblemRenderer: React.FC<ProblemRendererProps> = ({
  problem, problemIndex, submissionData, onSubmissionChange, genericSheet = false, parts, matchedPages,
}) => {
  const problemId = `p${problemIndex}`;
  const problemPoints = calculateProblemPoints(problem.subsections);
  const problemStatement = getStatement(problem.name, problem.description);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8 transition-all hover:shadow-md">
      {/* Problem Header */}
      <div className="bg-slate-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-bold text-aggie-900">
          Problem {problemIndex + 1}{problem.name ? `: ${problem.name}` : ''}
        </h2>
        <span className="bg-aggie-100 text-aggie-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-aggie-200">
          {problemPoints} Points
        </span>
      </div>

      <div className="p-6 space-y-6">
        {/* Problem Description */}
        {problem.description && (
          <div className="prose max-w-none text-gray-800">
            <LatexContent content={problem.description} />
          </div>
        )}

        {/* Subsections */}
        {problem.subsections && problem.subsections.length > 0 && (
          <div className="space-y-8 mt-6 pl-4 border-l-2 border-gray-100">
            {problem.subsections.map((sub: Subsection, sIdx: number) => {
              const subId = `${problemId}_s${sIdx}`;
              const subStatement = sub.name || sub.description;
              const widgetType = getWidgetType(sub.submissionType);

              return (
                <div key={sub.id || sIdx} className="space-y-4">
                  <div className="font-serif font-medium text-gray-900">
                    <span className="mr-2 text-gray-500 font-sans text-sm uppercase tracking-wide">Part {String.fromCharCode(97 + sIdx)}</span>
                    {sub.name && <span className="font-bold">{sub.name}</span>}
                    <span className="ml-2 text-gray-400 text-sm font-sans">({sub.points} pts)</span>
                  </div>

                  {sub.description && (
                    <div className="prose max-w-none text-gray-700 text-sm">
                      <LatexContent content={sub.description} />
                    </div>
                  )}

                  <div className="pl-2 space-y-4">
                    {isHandwritten(sub.submissionType) ? (() => {
                      // A handwritten part has no input of its own: the answer lives
                      // on the uploaded pages. Approved 2026-09-25 (Supplement 5),
                      // replacing a sentence that promised page marking "in the
                      // next update" after it had shipped. On the generic page the
                      // student then says which part each page is; on the printed
                      // sheet the QR does that, so the last clause is generic-only.
                      // Once pages are matched to the part on the generic page, they
                      // are shown here instead (2026-11-04), so the list says what
                      // each part got.
                      const part = genericSheet
                        ? parts?.find(p => p.problem_number === problemIndex + 1 && p.subsection_letter === String.fromCharCode(97 + sIdx))
                        : undefined;
                      const matched = part ? matchedPages?.[part.part_id] ?? [] : [];
                      if (matched.length > 0) {
                        return (
                          <div data-matched-pages={part!.part_id}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{W.matchedPagesLabel(matched.length)}</p>
                            <div className="flex flex-wrap gap-2">
                              {matched.map(m => (
                                <button key={m.key} type="button" onClick={() => showPageCard(m.key)}
                                  className="w-44 rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-aggie-400 hover:shadow text-left">
                                  {m.headerUrl && <img src={m.headerUrl} alt="" className="w-full h-auto border-b border-gray-100" />}
                                  {m.url
                                    ? <img src={m.url} alt={W.photoHeading(m.photo)} className="w-full aspect-[2/1] object-cover object-left-top" />
                                    : <span className="block w-full aspect-[2/1] bg-gray-100" />}
                                  <span className="block px-2 py-1 text-[11px] font-medium text-gray-700 border-t border-gray-100">{W.photoHeading(m.photo)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          <span className="font-medium text-slate-700">Answer on paper.</span>{' '}
                          Write this part in your handwritten work and upload the page in
                          <span className="font-medium"> Your Pages</span> above
                          {genericSheet ? ', then say which part it is.' : '.'}
                        </div>
                      );
                    })() : (
                      <SubmissionWidget
                        type={widgetType}
                        id={subId}
                        maxImages={sub.maxImages}
                        minWords={sub.minWords}
                        data={submissionData[subId] || {}}
                        onChange={onSubmissionChange}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProblemRenderer;