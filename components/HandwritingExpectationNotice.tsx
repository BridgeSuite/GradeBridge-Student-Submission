import React from 'react';
import { PenLine } from 'lucide-react';
import { HANDWRITING_EXPECTATION_WORDING } from '../services/handwritingExpectation';

/**
 * The assignment's stated handwriting expectation. Rendered only when the
 * assignment carries one; the caller decides, from `handwritingExpectedFor`.
 * It has no control and never blocks anything.
 */
const HandwritingExpectationNotice: React.FC = () => (
  <div
    className="text-sm text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 flex items-start gap-2"
    data-handwriting-expectation=""
  >
    <PenLine className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-500" aria-hidden="true" />
    <div className="space-y-2 min-w-0">
      {HANDWRITING_EXPECTATION_WORDING.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  </div>
);

export default HandwritingExpectationNotice;
