import React from 'react';
import { PenLine } from 'lucide-react';
import { SUBMISSION_RULE_WORDING, SubmissionRule } from '../services/submissionRule';

/**
 * Whether answers must be handwritten, shown before any page is added.
 * Exactly one of the two wordings, never both and never neither, and it never
 * blocks anything. `services/submissionRule.ts`.
 *
 * A rule this component does not know is shown as the default, so a caller
 * that passes nothing still tells the student the handwritten rule.
 */
const SubmissionRuleNotice: React.FC<{ rule: SubmissionRule }> = ({ rule: given }) => {
  const rule: SubmissionRule = given === 'nonHandwrittenAccepted' ? given : 'handwritten';
  return (
    <div
      className="text-sm text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 flex items-start gap-2"
      data-submission-rule={rule}
    >
      <PenLine className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-500" aria-hidden="true" />
      <div className="space-y-2">
        {SUBMISSION_RULE_WORDING[rule].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
};

export default SubmissionRuleNotice;
