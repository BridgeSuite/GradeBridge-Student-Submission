import React, { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { FRESHNESS_WORDING as W } from '../services/freshness';

/**
 * Download pressed in a tab running an older build than the live one (Phase
 * 1.10, `services/freshness.ts`). Nothing was downloaded. In the page, never a
 * browser dialog, and with recourse: Reload saves the work, reloads, and the
 * student downloads straight after.
 */
interface StaleVersionProps {
  onReload: () => void;
  onClose: () => void;
}

const StaleVersion: React.FC<StaleVersionProps> = ({ onReload, onClose }) => {
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
      aria-labelledby="stale-version-heading"
      data-stale-version
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 pt-6 pb-4">
          <h2
            ref={headingRef}
            tabIndex={-1}
            id="stale-version-heading"
            className="text-base font-medium text-slate-900 flex items-center gap-2 outline-none"
          >
            <RefreshCw className="w-5 h-5 text-blue-600 flex-shrink-0" />
            {W.message}
          </h2>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-slate-50 rounded-b-2xl flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onReload}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {W.reload}
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

export default StaleVersion;
