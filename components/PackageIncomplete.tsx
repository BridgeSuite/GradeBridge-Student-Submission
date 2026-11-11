import React, { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * What a student sees when their submission file could not be made whole:
 * the answers PDF or its description (`fixed_layout`) on the generic page, or
 * the PDF on the electronic path, failed to build. Phase 1.5 of
 * `PLAN_SUBMISSION_APP_FIXES_AND_REVAMP_2026-11-08`.
 *
 * **No file was saved or downloaded**: `buildSubmissionPackage` refuses to
 * hand back an incomplete archive, so there is nothing a student could upload
 * by mistake. In the page, never a browser dialog (standing rule, `CLAUDE.md`):
 * a suppressed dialog would be a silent refusal of a download. Its main button
 * tries again; nothing the student made is lost by closing it.
 *
 * WORDING: PROPOSED, NOT YET CLEARED by Andre Knoesen (`PACKAGE_INCOMPLETE_WORDING`).
 * Kept quiet by André Knoesen's ruling of 11 Nov 15:05: minimum wording, calm,
 * never sounding like an error.
 */
export const PACKAGE_INCOMPLETE_WORDING = {
  heading: 'Please try again',
  body:
    'Your submission file could not be made just now. Your work is saved and will still be here. ' +
    'If this happens again, reload this page and download once more.',
  tryAgain: 'Try again',
  close: 'Close',
} as const;

interface PackageIncompleteProps {
  /** Close this and build the file again. */
  onTryAgain: () => void;
  /** Close this. Nothing is downloaded and nothing is discarded. */
  onClose: () => void;
}

const W = PACKAGE_INCOMPLETE_WORDING;

const PackageIncomplete: React.FC<PackageIncompleteProps> = ({ onTryAgain, onClose }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="package-incomplete-heading"
      data-package-incomplete
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 pt-6 pb-4">
          <h2
            ref={headingRef}
            tabIndex={-1}
            id="package-incomplete-heading"
            className="text-lg font-bold text-slate-900 flex items-center gap-2 outline-none"
          >
            <RefreshCw className="w-5 h-5 text-blue-600 flex-shrink-0" />
            {W.heading}
          </h2>
          <p className="mt-2 text-sm text-gray-700">{W.body}</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-slate-50 rounded-b-2xl flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onTryAgain}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {W.tryAgain}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-medium text-sm transition-colors"
          >
            {W.close}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackageIncomplete;
