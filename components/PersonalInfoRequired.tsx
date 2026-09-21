import React, { useEffect, useRef } from 'react';
import { ArrowDown, ShieldCheck } from 'lucide-react';

/**
 * What a student sees when they press Download before confirming that no
 * answer shows personal information.
 *
 * **This is the one download refusal in the app, and it is built to have
 * recourse** (standing rule, `CLAUDE.md`): it is shown in the page, never as a
 * browser dialog that could be suppressed into silence; it says why nothing was
 * downloaded; and its main button takes the student to the box. A refusal the
 * student cannot see, or cannot act on, would be a zero; this one costs a tick.
 *
 * Nothing is lost by dismissing it. No file is written and no answer changes.
 */

interface PersonalInfoRequiredProps {
  /** Close this and bring the confirmation box into view. */
  onGoToConfirmation: () => void;
  /** Close this. Nothing is downloaded and nothing is discarded. */
  onClose: () => void;
}

const PersonalInfoRequired: React.FC<PersonalInfoRequiredProps> = ({ onGoToConfirmation, onClose }) => {
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
      aria-labelledby="personal-info-required-heading"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 pt-6 pb-4">
          <h2
            ref={headingRef}
            tabIndex={-1}
            id="personal-info-required-heading"
            className="text-lg font-bold text-slate-900 flex items-center gap-2 outline-none"
          >
            <ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0" />
            One check before you download
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            Nothing was downloaded yet. Below your answers there is a box confirming that none of
            them shows your name, student ID or email address. Tick it, then press Download again.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-slate-50 rounded-b-2xl flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onGoToConfirmation}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-colors"
          >
            <ArrowDown className="w-4 h-4" />
            Take me to the box
          </button>
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

export default PersonalInfoRequired;
