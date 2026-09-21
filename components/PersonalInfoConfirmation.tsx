import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { PERSONAL_INFO_GUIDANCE, PERSONAL_INFO_STATEMENT } from '../services/personalInfo';

/**
 * The student's confirmation that no answer shows who they are.
 *
 * `WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` §6. One box, once, where the
 * student has just looked at every answer: after the crops on the handwritten
 * path, after the typed answers and uploaded images on the electronic one.
 *
 * **Controlled, and never pre-ticked.** `confirmed` comes from
 * `isConfirmationCurrent` in `App.tsx`, which is false until the student ticks
 * the box AND for as long as nothing it covers has changed since. There is no
 * `defaultChecked` and no local state here to drift from that.
 *
 * `stale` is the case the box exists for on a retake: the student ticked it,
 * then changed an answer. The box is unticked again, and this says why rather
 * than leaving them to wonder whether their tick was lost.
 */

export const PERSONAL_INFO_ANCHOR_ID = 'personal-info-confirmation';

interface PersonalInfoConfirmationProps {
  confirmed: boolean;
  /** Ticked earlier, and an answer has changed since. */
  stale: boolean;
  onChange: (checked: boolean) => void;
}

const PersonalInfoConfirmation: React.FC<PersonalInfoConfirmationProps> = ({
  confirmed, stale, onChange,
}) => (
  <section
    id={PERSONAL_INFO_ANCHOR_ID}
    className={`mb-10 rounded-lg border p-5 shadow-sm scroll-mt-6 ${
      confirmed ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'
    }`}
  >
    <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
      <ShieldCheck className="h-5 w-5 flex-shrink-0 text-blue-700" />
      Before you download
    </h2>
    {stale && !confirmed && (
      <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
        An answer changed after you ticked this box, so it is unticked again. Look at your
        answers once more, then tick it.
      </p>
    )}
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={confirmed}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 flex-shrink-0 accent-blue-600"
      />
      <span className="text-sm font-medium text-slate-900">{PERSONAL_INFO_STATEMENT}</span>
    </label>
    <p className="mt-3 pl-8 text-sm text-gray-700">{PERSONAL_INFO_GUIDANCE}</p>
  </section>
);

export default PersonalInfoConfirmation;
