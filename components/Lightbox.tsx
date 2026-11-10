import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Maximize2, X } from 'lucide-react';

/**
 * A full-screen picture viewer, like a phone's photo app.
 *
 * Any picture the student has added or the app has cut out can be opened
 * here: the answer crops, the page photographs, the pictures uploaded to a
 * typed answer. It shows one picture as large as the screen allows; ← and →
 * (or the arrows on screen) move through the set it was opened from; Esc, the
 * close button, or a click outside the picture closes it. Where a cut-out
 * answer has a whole page photograph behind it, a button switches between the
 * two.
 *
 * It only shows pictures already in this browser. Nothing is uploaded and
 * nothing about the submission changes.
 */

export interface LightboxImage {
  src: string;
  caption?: string;
  /** The whole page photograph behind a cut-out answer, when there is one. */
  wholeSrc?: string;
}

type Open = (images: LightboxImage[], index?: number) => void;

const LightboxContext = createContext<Open>(() => {});

/** Opens the viewer. Outside a provider (a test render) it does nothing. */
export const useLightbox = (): Open => useContext(LightboxContext);

export const LIGHTBOX_WORDING = {
  close: 'Close',
  previous: 'Previous picture',
  next: 'Next picture',
  showWhole: 'Show whole photo',
  showAnswer: 'Show answer box',
  viewLarger: 'View larger',
  position: (i: number, n: number): string => `${i} of ${n}`,
} as const;
const L = LIGHTBOX_WORDING;

/**
 * Whether the viewer shows the whole page photo or the answer box, remembered
 * in this browser so the choice holds from picture to picture, from one
 * opening to the next, and on a later visit. A convenience only: when storage
 * is unavailable (a private window) the viewer simply starts on the answer box.
 */
const WHOLE_KEY = 'gb-viewer-show-whole-photo';
const readWhole = (): boolean => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(WHOLE_KEY) === '1'; } catch { return false; }
};
const saveWhole = (on: boolean) => {
  try { localStorage.setItem(WHOLE_KEY, on ? '1' : '0'); } catch { /* not remembered; nothing else changes */ }
};

export const LightboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [images, setImages] = useState<LightboxImage[] | null>(null);
  const [index, setIndex] = useState(0);
  const [whole, setWhole] = useState(readWhole);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const count = useRef(0);

  const open = useCallback<Open>((list, at = 0) => {
    if (list.length === 0) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    count.current = list.length;
    setImages(list);
    setIndex(Math.max(0, Math.min(at, list.length - 1)));
  }, []);

  const close = useCallback(() => {
    setImages(null);
    returnFocus.current?.focus?.();
  }, []);

  const step = useCallback((d: number) => {
    const n = count.current;
    if (n > 0) setIndex(i => (i + d + n) % n);
  }, []);

  // Keys while open. Caught first and stopped there, so the page's own keys
  // (the swipe check's arrows, the part keys) do nothing behind the viewer.
  useEffect(() => {
    if (!images) return;
    const onKey = (e: KeyboardEvent) => {
      // Every key stops here while the viewer is open; Tab still moves focus.
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', onKey, true);
    // Keep the page behind from scrolling while the viewer is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [images, close, step]);

  const current = images ? images[index] : null;
  const many = !!images && images.length > 1;

  return (
    <LightboxContext.Provider value={open}>
      {children}
      {current && (
        <div
          role="dialog" aria-modal="true" aria-label={current.caption || L.viewLarger}
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
          onClick={close}
          data-lightbox
        >
          <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
            <p className="flex-1 min-w-0 text-sm font-medium truncate">
              {current.caption}
              {many && <span className="ml-2 text-white/60">{L.position(index + 1, images!.length)}</span>}
            </p>
            {current.wholeSrc && (
              <button type="button" onClick={() => { const next = !whole; saveWhole(next); setWhole(next); }}
                className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm font-medium flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" /> {whole ? L.showAnswer : L.showWhole}
              </button>
            )}
            <button ref={closeRef} type="button" onClick={close} aria-label={L.close} title={`${L.close} (Esc)`}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 pb-4 sm:px-16">
            {/* A click on the picture itself does not close the viewer. */}
            <img
              src={whole && current.wholeSrc ? current.wholeSrc : current.src}
              alt={current.caption || ''}
              onClick={e => e.stopPropagation()}
              className="max-w-full max-h-full object-contain bg-white shadow-2xl select-none"
              draggable={false}
            />
            {many && (
              <>
                <button type="button" aria-label={L.previous} title={`${L.previous} (←)`}
                  onClick={e => { e.stopPropagation(); step(-1); }}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/25 text-white">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button type="button" aria-label={L.next} title={`${L.next} (→)`}
                  onClick={e => { e.stopPropagation(); step(1); }}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/25 text-white">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </LightboxContext.Provider>
  );
};

/** The small corner button that opens a picture, for places where a click on the picture already does something else. */
export const ExpandButton: React.FC<{ onClick: () => void; className?: string }> = ({ onClick, className = '' }) => (
  <button
    type="button"
    onClick={e => { e.stopPropagation(); onClick(); }}
    onPointerDown={e => e.stopPropagation()}
    aria-label={L.viewLarger} title={L.viewLarger}
    className={`p-1.5 rounded-md bg-white/90 text-aggie-900 border border-gray-200 shadow-sm hover:bg-white ${className}`}
  >
    <Maximize2 className="w-4 h-4" />
  </button>
);
