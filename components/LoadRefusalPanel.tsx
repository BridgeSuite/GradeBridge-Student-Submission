/**
 * LoadRefusalPanel — why an assignment file was not loaded, at the top of the page.
 *
 * `WORKORDER_SS_NO_GRADER_STRINGS_AND_LOAD_ORDER_2026-09-25`, Supplements 3 and 4.
 *
 * A refused load used to be told only in an `alert`, and a browser that has
 * begun ignoring dialogs shows nothing: the student taps a file, nothing loads,
 * and nothing says why. The status line was tried next and could not be read
 * (ten pixels, pulsing, at the foot of the sidebar). This panel is where the
 * student is looking: the top of the page, above the sidebar on a phone and
 * above both columns on a wide screen, and `App` scrolls it into view when it
 * appears, so a student who had scrolled down still sees it.
 *
 * **It adds no words.** It renders the approved message it is given, one
 * paragraph per blank-line-separated block, with an icon and no heading. It has
 * no button: it clears when a file is accepted, so there is no dismissal that
 * could itself fail. It borrows `CompletenessGate`'s in-the-page idea, not its
 * overlay: that one interrupts a submission in progress, and a refused load
 * does not.
 */

import React, { forwardRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface LoadRefusalPanelProps {
  /** The approved refusal, exactly as `services/loadRefusal.ts` returns it. */
  message: string;
}

const LoadRefusalPanel = forwardRef<HTMLDivElement, LoadRefusalPanelProps>(({ message }, ref) => (
  <div
    ref={ref}
    id="load-refusal"
    role="alert"
    className="w-full flex-none bg-red-50 border-b-2 border-red-300 text-red-950 px-4 py-4 sm:px-6"
  >
    <div className="max-w-4xl mx-auto flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-600" aria-hidden="true" />
      <div className="space-y-2 text-sm leading-relaxed">
        {message.split(/\n\s*\n/).map((paragraph, i) => (
          <p key={i} className={i === 0 ? 'font-semibold' : undefined}>{paragraph}</p>
        ))}
      </div>
    </div>
  </div>
));

LoadRefusalPanel.displayName = 'LoadRefusalPanel';

export default LoadRefusalPanel;
