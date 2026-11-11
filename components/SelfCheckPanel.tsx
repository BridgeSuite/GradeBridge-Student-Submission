import React, { useEffect, useRef } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { SELF_CHECK_WORDING as W, SelfCheckResult } from '../services/selfCheck';

/**
 * The app's own reading of the file it has just built (Phase 1.6): complete,
 * with the answers PDF's page count, or what is wrong. In the page, never a
 * browser dialog. **It informs and never blocks**: the file has been saved
 * either way, and the relay stays the gatekeeper. See `services/selfCheck.ts`.
 */
interface SelfCheckPanelProps {
  result: SelfCheckResult;
  onClose: () => void;
}

const SelfCheckPanel: React.FC<SelfCheckPanelProps> = ({ result, onClose }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const heading = result.ok
    ? (result.pages !== null ? W.completeWithPages(result.pages) : W.complete)
    : W.incomplete;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="self-check-heading"
      data-self-check={result.ok ? 'complete' : 'incomplete'}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 pt-6 pb-4">
          <h2
            ref={headingRef}
            tabIndex={-1}
            id="self-check-heading"
            className="text-lg font-bold text-slate-900 flex items-center gap-2 outline-none"
          >
            {result.ok
              ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              : <RefreshCw className="w-5 h-5 text-blue-600 flex-shrink-0" />}
            {heading}
          </h2>
          {!result.ok && (
            // Which part is missing is not shown: minimum wording (ruling, 11 Nov
            // 15:05). It stays in `result.problems` and on the element for anyone
            // inspecting the page.
            <p className="mt-2 text-sm text-gray-700" data-self-check-problems={result.problems.join(' | ')}>
              {W.incompleteAdvice}
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-slate-50 rounded-b-2xl flex">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-medium text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelfCheckPanel;
