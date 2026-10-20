import React, { useEffect, useRef } from 'react';
import { AlertTriangle, ArrowLeft, Download } from 'lucide-react';
import { FitNotice } from '../services/fitNotice';

/**
 * The gate that tells a student their pages will be made smaller to fit.
 *
 * ## Why it is a sibling of `CompletenessGate` and not a second mode of it
 *
 * The two gates answer different questions and offer different ways out.
 * `CompletenessGate` says something is missing and its first button sends the
 * student back to add it. This one says nothing is missing: every page will be
 * in the document, but two of them will share a sheet. Going back here means
 * rewriting an answer more compactly, which is a different act, and the button
 * says so. Folding both into one component would have meant a parameterised
 * heading and a parameterised button label, which is how an approved
 * student-facing sentence gets reworded by an edit aimed at the other case.
 *
 * Everything the other gate's own comment argues for is kept, because the same
 * reasoning applies without change:
 *
 *   - **In the page, never a `window.confirm`.** A suppressed `confirm()` shows
 *     nothing, waits for nothing and returns `false`, and a download guard that
 *     reads that as "cancelled" turns partial credit into a zero. Downloading is
 *     constructive, so its guard fails open (standing rule, `CLAUDE.md`).
 *   - **Nothing is default-activated.** The heading takes focus, so neither
 *     button is one keystroke away, and Escape returns to the work rather than
 *     downloading.
 *   - **It is a gate, not a banner.** "Download anyway" lives inside the panel,
 *     so the panel cannot be scrolled past to reach it.
 *
 * The sentences are in `services/fitNotice.ts`, approved 2026-10-20. This
 * component lays them out and owns no student-facing prose of its own beyond the
 * heading and the two button labels.
 */

interface FitGateProps {
  notice: FitNotice;
  /** Rebuilds the package and downloads it, with the pages fitted. */
  onDownloadAnyway: () => void;
  /** Dismisses the gate. Nothing is downloaded and nothing is discarded. */
  onGoBack: () => void;
}

const FitGate: React.FC<FitGateProps> = ({ notice, onDownloadAnyway, onGoBack }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { headingRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onGoBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onGoBack]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fit-gate-heading"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">

        <div className="px-6 pt-6 pb-4 border-b border-gray-200">
          <h2
            ref={headingRef}
            tabIndex={-1}
            id="fit-gate-heading"
            className="text-lg font-bold text-slate-900 flex items-center gap-2 outline-none"
          >
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            More pages than the assignment allows
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ul className="space-y-2">
            {notice.lines.map(line => (
              <li key={line} className="text-sm text-gray-700">{line}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-gray-700">{notice.consequence}</p>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-slate-50 rounded-b-2xl">
          <p className="text-sm text-gray-700 mb-4">{notice.choice}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onGoBack}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Go back
            </button>
            <button
              type="button"
              onClick={onDownloadAnyway}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-medium text-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Download anyway
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FitGate;
