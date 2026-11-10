import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, CheckCircle2, ChevronLeft, ChevronRight, Flag, X, Image as ImageIcon, Info,
  LayoutGrid, RefreshCw, Upload,
} from 'lucide-react';
import { CropRef, GenericPart, PageRef, StudentReview } from '../types';
import {
  GenericProblem, chosenPartIds, genericCoverage, genericCropsInPageOrder,
  partDisplayLabel, problemsOf,
} from '../services/genericSheet';
import { GENERIC_WORDING as W } from '../services/genericWording';
import SwipeDeck from './SwipeDeck';
import { ExpandButton, LightboxImage, useLightbox } from './Lightbox';

/**
 * The review step on the generic answer page, where it is also the labelling
 * step. It comes in two steps.
 *
 * **1. Match pages to parts.** Part first, the way a grading tool's page
 * matcher works. The parts are listed down the side, and the student picks
 * one. Every photographed page is a large thumbnail showing what the student
 * wrote on the printed `Problem ___ Part ___` line above the writing box, then
 * the box itself. Clicking a page puts the chosen part on it, or takes it off.
 * Ctrl-click and ⌘-click do the same, and Shift-click puts the part on every
 * page between the last one clicked and this one. **Only the part chosen is
 * ever added:** nothing is ticked on the student's behalf.
 * Parts of two problems still never share a page (`assignGenericPart`).
 *
 * **2. Check each page.** Only the cut-out box, the picture that is collected
 * and read, one page at a time in a swipe deck
 * (`SwipeDeck.tsx`): right for "Looks right", left for "Something is wrong",
 * up for "Not sure yet". The arrow keys do the same.
 *
 * Above both steps, what the labels add up to: parts with no page, a part with
 * several pages while another has none, pages with no part, pages that look
 * blank. **All of it is said, none of it blocks.**
 *
 * The header strip is the student's to look at, kept in this browser. It is
 * not part of the crop and is never submitted.
 */

interface GenericPageReviewProps {
  parts: GenericPart[];
  /**
   * The assignment's problems, so each part is shown with its question's own
   * title (`services/genericSheet.ts`, `partDisplayLabel`).
   */
  problems?: readonly { subsections?: readonly { name?: unknown }[] }[];
  crops: Record<string, CropRef>;
  /** crop key → object URL for the stored crop bitmap. */
  cropUrls: Record<string, string>;
  /** page id → object URL for the page's header strip, when it could be cut. */
  headerUrls?: Record<string, string>;
  /** page id → object URL for the whole photograph, for the picture viewer. */
  pageUrls?: Record<string, string>;
  pages: PageRef[];
  /** Put `partId` on these pages (`on`), or take it off them. */
  onAssignPart: (cropKeys: string[], partId: string, on: boolean) => void;
  onReview: (cropKey: string, review: StudentReview) => void;
  /** Replace this page's photograph and cut its box again. The label is kept. */
  onRetakePage: (pageId: string, file: File) => Promise<void>;
  busy: string | null;
}

// Compact shows the strip the student wrote on and the top of the box, so a
// screen holds two or three rows of pages; the larger sizes show the whole box.
type Size = 'sm' | 'lg' | 'xl';
const GRID_FOR: Record<Size, string> = {
  sm: 'repeat(auto-fill, minmax(210px, 1fr))',
  lg: 'repeat(auto-fill, minmax(250px, 1fr))',
  xl: 'repeat(auto-fill, minmax(360px, 1fr))',
};
const SIZES: Size[] = ['sm', 'lg', 'xl'];

const GenericPageReview: React.FC<GenericPageReviewProps> = ({
  parts, problems, crops, cropUrls, headerUrls = {}, pageUrls = {}, pages,
  onAssignPart, onReview, onRetakePage, busy,
}) => {
  const shown = (p: GenericPart): string => partDisplayLabel(p, problems);
  const groups = problemsOf(parts);
  const problemShown = (g: GenericProblem): string => {
    const name = problems?.[g.problemNumber - 1] as { name?: unknown } | undefined;
    const title = typeof name?.name === 'string' ? name.name.replace(/\s+/g, ' ').trim() : '';
    return title ? `Problem ${g.problemNumber}: ${title}` : `Problem ${g.problemNumber}`;
  };

  const retakeRef = useRef<HTMLInputElement>(null);
  const retakeTarget = useRef<string | null>(null);
  const [hasCamera] = useState(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches);

  const ordered = genericCropsInPageOrder(crops, pages);
  const lightbox = useLightbox();
  const coverage = genericCoverage(parts, crops, pages);
  const flagged = ordered.filter(c => c.review === 'flagged').length;
  const reviewed = ordered.filter(c => c.review === 'signed_off').length;
  const photoNumber = (c: CropRef): number => pages.findIndex(p => p.id === c.fromPage) + 1;
  const hasNotes = coverage.missing.length > 0 || coverage.repeated.length > 0 ||
    coverage.unlabelled > 0 || coverage.blank > 0;

  const partsOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of ordered) m.set(c.regionId, chosenPartIds(c, parts));
    return m;
  }, [ordered, parts]);
  const pagesFor = (partId: string): number =>
    ordered.filter(c => partsOf.get(c.regionId)?.includes(partId)).length;

  const [step, setStep] = useState<'match' | 'check'>('match');
  const [size, setSize] = useState<Size>('sm');
  // Pages that already carry a part can be hidden, so the grid shrinks as the
  // student works through it.
  const [hideMatched, setHideMatched] = useState(false);
  // Start on the first part with no page, so the student begins where work is needed.
  const [activePart, setActivePart] = useState<string | null>(() =>
    (parts.find(p => !ordered.some(c => chosenPartIds(c, parts).includes(p.part_id))) ?? parts[0])?.part_id ?? null);
  const anchor = useRef<number | null>(null);
  const [hint, setHint] = useState('');
  const active = parts.find(p => p.part_id === activePart) ?? null;

  const handleRetake = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    const target = retakeTarget.current;
    retakeTarget.current = null;
    if (target && files.length > 0) void onRetakePage(target, files[0]);
  };

  /** The pages the grid shows: all of them, or only those with no part yet. */
  const visible = hideMatched ? ordered.filter(c => (partsOf.get(c.regionId) ?? []).length === 0) : ordered;

  /** Opens the picture viewer on one page, able to step through `list`. */
  const viewPages = (list: CropRef[], key: string) => {
    const shownList = list.filter(c => cropUrls[c.regionId]);
    const images: LightboxImage[] = shownList.map(c => {
      const ids = partsOf.get(c.regionId) ?? [];
      const names = parts.filter(p => ids.includes(p.part_id)).map(shown).join(' · ');
      return {
        src: cropUrls[c.regionId],
        caption: `${W.photoHeading(photoNumber(c))}${names ? ` · ${names}` : ''}`,
        wholeSrc: c.fromPage ? pageUrls[c.fromPage] : undefined,
      };
    });
    lightbox(images, Math.max(0, shownList.findIndex(c => c.regionId === key)));
  };

  /** The pages that carry the chosen part, for Unselect all. */
  const activeKeys = active
    ? ordered.filter(c => (partsOf.get(c.regionId) ?? []).includes(active.part_id)).map(c => c.regionId)
    : [];

  /**
   * Click: toggle. Ctrl/⌘-click: toggle, keeping the anchor. Shift-click: the
   * whole range takes the state the clicked page is about to take, so a
   * Shift-click on a selected page unselects the range, as in a file manager.
   */
  const handlePageClick = (e: React.MouseEvent, i: number) => {
    if (suppressClick.current) return;
    if (!active) { setHint(W.matchPickPartFirst); return; }
    setHint('');
    const key = visible[i].regionId;
    const on = !(partsOf.get(key) ?? []).includes(active.part_id);
    if (e.shiftKey && anchor.current !== null && anchor.current < visible.length) {
      const [a, b] = anchor.current < i ? [anchor.current, i] : [i, anchor.current];
      onAssignPart(visible.slice(a, b + 1).map(c => c.regionId), active.part_id, on);
    } else {
      onAssignPart([key], active.part_id, on);
    }
    // A matched page leaves the grid when matched pages are hidden, so the
    // positions move under the anchor: start the next range afresh.
    anchor.current = hideMatched ? null : i;
  };

  // ---- Box select ----------------------------------------------------------
  // Press anywhere in the grid, on a page or in the space between, and drag:
  // a box follows the pointer, and the pages it touches are shown as they will
  // be. On release they all take the chosen part. A box that starts on a page
  // that already has the part takes it off instead, and Ctrl/⌘ held at the
  // start flips each page in the box. Esc cancels. Mouse and pen only: a finger
  // drag still scrolls. Near the top or bottom edge the page scrolls by itself
  // and the box keeps growing. A press that moves less than a few pixels is an
  // ordinary click.
  type BoxMode = 'add' | 'remove' | 'toggle';
  const gridRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number; mode: BoxMode; hits: string[] } | null>(null);
  const boxDrag = useRef<{ sx: number; sy: number; cx: number; cy: number; mode: BoxMode; started: boolean; cancelled: boolean } | null>(null);
  const suppressClick = useRef(false);
  const dragFrame = useRef<number | null>(null);

  /** The box from where the press began to where the pointer is, in grid coordinates, and the pages it touches. */
  const measureBox = () => {
    const d = boxDrag.current, grid = gridRef.current;
    if (!d || !grid) return null;
    const g = grid.getBoundingClientRect();
    const x1 = d.cx - g.left, y1 = d.cy - g.top;
    const [l, r] = d.sx < x1 ? [d.sx, x1] : [x1, d.sx];
    const [t, b] = d.sy < y1 ? [d.sy, y1] : [y1, d.sy];
    const hits: string[] = [];
    grid.querySelectorAll<HTMLElement>('[data-page-card]').forEach(li => {
      const c = li.getBoundingClientRect();
      const cl = c.left - g.left, ct = c.top - g.top;
      if (cl < r && cl + c.width > l && ct < b && ct + c.height > t) hits.push(li.getAttribute('data-page-card')!);
    });
    return { x0: l, y0: t, x1: r, y1: b, mode: d.mode, hits };
  };

  const startBox = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    if (e.button !== 0 || e.shiftKey || !active || !gridRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('[aria-label="' + 'View larger' + '"]')) return; // the expand button opens the viewer
    e.preventDefault(); // no text selection, no native image drag; a click still arrives
    const g = gridRef.current.getBoundingClientRect();
    const startKey = target.closest('[data-page-card]')?.getAttribute('data-page-card') ?? null;
    const partId = active.part_id;
    const mode: BoxMode = e.ctrlKey || e.metaKey ? 'toggle'
      : startKey && (partsOf.get(startKey) ?? []).includes(partId) ? 'remove' : 'add';
    boxDrag.current = { sx: e.clientX - g.left, sy: e.clientY - g.top, cx: e.clientX, cy: e.clientY, mode, started: false, cancelled: false };

    const move = (ev: PointerEvent) => {
      const d = boxDrag.current;
      if (!d) return;
      d.cx = ev.clientX; d.cy = ev.clientY;
      if (!d.started) {
        const g2 = gridRef.current!.getBoundingClientRect();
        if (Math.hypot(ev.clientX - g2.left - d.sx, ev.clientY - g2.top - d.sy) < 6) return;
        d.started = true;
      }
      setBox(measureBox());
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && boxDrag.current?.started) { ev.preventDefault(); boxDrag.current.cancelled = true; up(); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', onKey, true);
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
      const d = boxDrag.current;
      boxDrag.current = null;
      if (d?.started) {
        const m = measureBoxFrom(d);
        if (!d.cancelled && m && m.hits.length > 0) {
          if (d.mode === 'toggle') {
            const has = (k: string) => (partsOf.get(k) ?? []).includes(partId);
            const off = m.hits.filter(has), on = m.hits.filter(k => !has(k));
            if (on.length) onAssignPart(on, partId, true);
            if (off.length) onAssignPart(off, partId, false);
          } else {
            onAssignPart(m.hits, partId, d.mode === 'add');
          }
        }
        // The click that ends a box is not a click on the page under it.
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 0);
        anchor.current = null;
      }
      setBox(null);
    };
    // measureBox reads boxDrag.current, which `up` has already cleared.
    const measureBoxFrom = (d: NonNullable<typeof boxDrag.current>) => {
      boxDrag.current = d;
      const m = measureBox();
      boxDrag.current = null;
      return m;
    };
    const scrollAtEdges = () => {
      const d = boxDrag.current;
      if (!d) return;
      if (d.started) {
        const area = document.getElementById('main-scroll');
        const scroller = area && area.scrollHeight > area.clientHeight ? area : null;
        const top = scroller ? scroller.getBoundingClientRect().top : 0;
        const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
        // The action bar covers the bottom of the page, so its edge zone starts higher.
        const dy = d.cy < top + 80 ? -Math.ceil((top + 80 - d.cy) / 5)
          : d.cy > bottom - 150 ? Math.ceil((d.cy - (bottom - 150)) / 5) : 0;
        if (dy) { (scroller ?? window).scrollBy(0, dy); setBox(measureBox()); }
      }
      dragFrame.current = requestAnimationFrame(scrollAtEdges);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', onKey, true);
    dragFrame.current = requestAnimationFrame(scrollAtEdges);
  };

  /** Move to the next part (+1) or back to the previous one (-1), wrapping round. */
  const goToPart = (delta: number) => {
    if (parts.length === 0) return;
    const at = parts.findIndex(p => p.part_id === activePart);
    const next = parts[((at < 0 ? 0 : at + delta) + parts.length) % parts.length];
    setActivePart(next.part_id);
    anchor.current = null;
    setHint('');
    // Keep the chosen part in sight in the parts list.
    if (typeof document !== 'undefined') {
      document.querySelector(`[data-part-id="${CSS.escape(next.part_id)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  };

  // Keys while matching: N or ] for the next part, B or [ to go back. Never
  // while the student is typing in a field, and never with a modifier held.
  useEffect(() => {
    if (step !== 'match') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'n' || k === ']') { e.preventDefault(); goToPart(1); }
      else if (k === 'b' || k === '[') { e.preventDefault(); goToPart(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const partChips = (crop: CropRef) => {
    const ids = partsOf.get(crop.regionId) ?? [];
    if (ids.length === 0) {
      return <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200">{W.pageNoPart}</span>;
    }
    return ids.map(id => (
      <span key={id} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
        id === activePart ? 'bg-aggie-600 text-white border-aggie-600' : 'bg-slate-100 text-slate-700 border-slate-200'
      }`}>{id}</span>
    ));
  };

  const headerStrip = (crop: CropRef) => {
    const url = crop.fromPage ? headerUrls[crop.fromPage] : undefined;
    return url ? (
      <img src={url} alt="" draggable={false}
        className="w-full h-auto bg-white border-b border-gray-200" />
    ) : (
      <div className="px-2 py-1.5 text-[11px] text-gray-500 bg-gray-50 border-b border-gray-200">{W.headerMissing}</div>
    );
  };

  // ---- Step 1: the matching grid -------------------------------------------
  const matchStep = (
    <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-5">
      {/* The parts. A column beside the grid on a wide screen, a scrolling row on a phone. */}
      <nav aria-label={W.partsListHeading}
        className="mb-4 lg:mb-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1">
        <h3 className="hidden lg:block text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{W.partsListHeading}</h3>
        <div className="flex lg:flex-col gap-2 lg:gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {groups.map(g => (
            <div key={g.problemNumber} className="flex lg:flex-col gap-1 flex-shrink-0 lg:mb-2">
              {g.parts.length > 1 && (
                <p className="hidden lg:block text-xs font-semibold text-slate-700 mt-1 break-words">{problemShown(g)}</p>
              )}
              {g.parts.map(p => {
                const n = pagesFor(p.part_id);
                const isActive = p.part_id === activePart;
                return (
                  <button
                    key={p.part_id} type="button"
                    data-part-id={p.part_id} data-count={n} aria-pressed={isActive}
                    onClick={() => { setActivePart(p.part_id); anchor.current = null; setHint(''); }}
                    title={n === 0 ? W.partNoPage : W.partPageCount(n)}
                    className={`flex items-center gap-2 text-left min-h-[44px] w-56 lg:w-full px-2.5 py-1.5 rounded-lg border text-[13px] transition-colors ${
                      isActive
                        ? 'bg-aggie-900 border-aggie-900 border-l-4 border-l-gold-500 text-white shadow'
                        : 'bg-white border-gray-200 text-gray-900 hover:border-aggie-300 hover:bg-aggie-50'
                    }`}
                  >
                    <span className="flex-1 min-w-0 font-medium break-words leading-snug">{shown(p)}</span>
                    <span className={`flex-shrink-0 min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${
                      isActive ? 'bg-gold-500 text-aggie-900' : n === 0 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'
                    }`} aria-label={n === 0 ? W.partNoPage : W.partPageCount(n)}>
                      {n === 0 ? '0' : n}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold text-aggie-900" data-active-part>
            {active ? W.matchActive(shown(active)) : W.matchPickPartFirst}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={hideMatched} onChange={e => { setHideMatched(e.target.checked); anchor.current = null; }}
                className="w-4 h-4 accent-aggie-900" />
              {W.hideMatched}
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs" role="group" aria-label={W.sizeLabel}>
              {SIZES.map(s => (
                <button key={s} type="button" onClick={() => setSize(s)} aria-pressed={size === s}
                  className={`px-2.5 py-1.5 flex items-center gap-1 whitespace-nowrap ${size === s ? 'bg-aggie-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                  <LayoutGrid className={s === 'sm' ? 'w-3 h-3' : s === 'lg' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                  {s === 'sm' ? W.sizeCompact : s === 'lg' ? W.sizeLarge : W.sizeExtraLarge}
                </button>
              ))}
            </div>
            <button type="button" disabled={activeKeys.length === 0}
              onClick={() => { if (active) { onAssignPart(activeKeys, active.part_id, false); anchor.current = null; } }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap disabled:opacity-40"
              data-unselect-all>
              <X className="w-3.5 h-3.5" /> {W.unselectAll(activeKeys.length)}
            </button>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium" role="group">
              <button type="button" onClick={() => goToPart(-1)} disabled={parts.length < 2}
                title={W.previousPartKeys}
                className="px-2.5 py-1.5 bg-white text-gray-800 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap border-r border-gray-300 disabled:opacity-40">
                <ChevronLeft className="w-3.5 h-3.5" /> {W.previousPart}
                <kbd className="ml-1 px-1 rounded border border-gray-300 bg-gray-50 text-[10px] font-mono text-gray-500">B</kbd>
              </button>
              <button type="button" onClick={() => goToPart(1)} disabled={parts.length < 2}
                title={W.nextPartKeys}
                className="px-2.5 py-1.5 bg-white text-gray-800 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap disabled:opacity-40">
                {W.nextPart}
                <kbd className="ml-1 px-1 rounded border border-gray-300 bg-gray-50 text-[10px] font-mono text-gray-500">N</kbd>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-600 mb-3">{W.matchIntro}</p>
        {hint && <p className="mb-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2" role="status">{hint}</p>}

        <div ref={gridRef} onPointerDown={startBox} className="relative -mx-4 -mt-3 px-4 pt-3 pb-8 select-none" data-select-area>
        {box && (
          <div aria-hidden="true"
            className={`pointer-events-none absolute z-20 rounded-sm border-2 ${
              box.mode === 'remove' ? 'border-red-500 bg-red-500/10' : 'border-aggie-500 bg-aggie-500/10'
            }`}
            style={{ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 }} />
        )}
        <ul className="grid gap-3" style={{ gridTemplateColumns: GRID_FOR[size] }}>
          {visible.map((crop, i) => {
            const key = crop.regionId;
            const url = cropUrls[key];
            const n = photoNumber(crop);
            const ids = partsOf.get(key) ?? [];
            const on = !!active && ids.includes(active.part_id);
            const elsewhere = !!active && ids.length > 0 && !on &&
              parts.find(p => p.part_id === ids[0])?.problem_number !== active.problem_number;
            // While a box is drawn, each page it touches shows what release will make it.
            const inBox = !!box && box.hits.includes(key);
            const willBeOn = inBox ? (box!.mode === 'add' ? true : box!.mode === 'remove' ? false : !on) : on;
            return (
              <li key={key} id={`page-card-${key}`} data-page-card={key} data-parts={ids.join(' ')}
                className={`relative rounded-xl border-2 bg-white overflow-hidden transition-shadow ${
                  inBox && !willBeOn ? 'border-red-400 ring-4 ring-red-200 opacity-80'
                    : willBeOn ? 'border-aggie-700 shadow-md ring-4 ring-gold-300' : 'border-gray-200 hover:border-aggie-300'
                }`}
              >
                <button
                  type="button" aria-pressed={on} disabled={busy === key || busy === `page-${crop.fromPage}`}
                  onClick={(e) => handlePageClick(e, i)}
                  onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); /* no text selection on shift-click */ }}
                  className={`relative block w-full text-left ${elsewhere ? 'opacity-60' : ''}`}
                >
                  {headerStrip(crop)}
                  {url && size === 'sm' ? (
                    // Compact: the top-left of the box at about twice the size,
                    // so the writing can be read while the card stays short.
                    <div className="aspect-[2/1] overflow-hidden bg-white">
                      <img src={url} draggable={false}
                        alt={`${W.photoHeading(n)}${parts.filter(p => ids.includes(p.part_id)).map(p => `, ${shown(p)}`).join('')}`}
                        className="block max-w-none w-[190%] h-auto" />
                    </div>
                  ) : url ? (
                    <img src={url} draggable={false}
                      alt={`${W.photoHeading(n)}${parts.filter(p => ids.includes(p.part_id)).map(p => `, ${shown(p)}`).join('')}`}
                      className="w-full bg-white h-auto aspect-square object-contain" />
                  ) : (
                    <div className={`${size === 'sm' ? 'aspect-[2/1]' : 'aspect-square'} flex items-center justify-center text-gray-400`}>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    </div>
                  )}
                  {on && (
                    <span className="absolute top-2 right-2 bg-gold-500 text-aggie-900 rounded-full p-1 shadow">
                      <CheckCircle2 className="w-5 h-5" />
                    </span>
                  )}
                </button>
                <div className="px-2.5 py-2 border-t border-gray-100 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-gray-800 mr-1">{W.photoHeading(n)}</span>
                  {partChips(crop)}
                  {crop.review === 'signed_off' && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                  {crop.review === 'flagged' && <Flag className="w-3.5 h-3.5 text-amber-600" />}
                  {url && <ExpandButton onClick={() => viewPages(visible, key)} className="ml-auto" />}
                </div>
              </li>
            );
          })}
        </ul>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => setStep('check')}
            className="min-h-[44px] px-5 rounded-lg text-sm font-semibold bg-aggie-900 hover:bg-aggie-800 text-white flex items-center gap-2 shadow">
            {W.goToCheck} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  // ---- Step 2: one page at a time ------------------------------------------
  const checkStep = (
    <div className="max-w-xl mx-auto">
      <SwipeDeck
        cards={ordered.map(c => ({ ...c, key: c.regionId }))}
        cardName={(c) => W.photoHeading(photoNumber(c))}
        disabled={(c) => busy === c.regionId || busy === `page-${c.fromPage}`}
        onReview={onReview}
        wording={{
          hint: W.deckHint, looksRight: 'Looks right', somethingWrong: 'Something is wrong',
          notSure: W.notSure, undo: W.undo, progress: W.deckProgress, done: W.deckDone,
          againUnsure: W.deckAgainUnsure, againAll: W.deckAgainAll, jump: W.deckJump,
        }}
        renderThumb={(c) => {
          const url = cropUrls[c.regionId];
          return url ? <img src={url} alt="" draggable={false} className="w-full aspect-square object-cover" />
            : <div className="w-full aspect-square bg-gray-100" />;
        }}
        renderCard={(c) => {
          const url = cropUrls[c.regionId];
          const n = photoNumber(c);
          const ids = partsOf.get(c.regionId) ?? [];
          return (
            <div>
              <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
                <span className="font-semibold text-gray-900">{W.photoHeading(n)}</span>
                {partChips(c)}
                {url && <ExpandButton onClick={() => viewPages(ordered, c.regionId)} className="ml-auto" />}
              </div>
              {ids.length > 0 && (
                <p className="px-4 pt-2 text-sm text-gray-800 break-words">
                  {parts.filter(p => ids.includes(p.part_id)).map(shown).join(' · ')}
                </p>
              )}
              {ids.length === 0 && (
                <p className="mx-4 mt-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">{W.unlabelledNote}</p>
              )}
              <div className="p-3">
                {/* Only the box: exactly the picture that is collected and read.
                    The header strip is for matching, in step 1, and is not here. */}
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  {url ? (
                    <img src={url} draggable={false}
                      alt={`${W.photoHeading(n)}${parts.filter(p => ids.includes(p.part_id)).map(p => `, ${shown(p)}`).join('')}`}
                      className="w-full h-auto max-h-[50vh] object-contain bg-white" />
                  ) : (
                    <div className="p-6 text-center text-sm text-gray-500"><RefreshCw className="w-4 h-4 animate-spin inline" /></div>
                  )}
                </div>
                {c.qualityFlags.length > 0 && (
                  <ul className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-1">
                    {c.qualityFlags.map((flag) => (
                      <li key={flag} className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>
                          {flag === 'looks-empty'
                            ? 'This looks blank. If you wrote an answer here, check the picture above shows it.'
                            : flag}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  disabled={busy === c.regionId || busy === `page-${c.fromPage}` || !c.fromPage}
                  onClick={() => { retakeTarget.current = c.fromPage ?? null; retakeRef.current?.click(); }}
                  className="mt-3 min-h-[40px] px-3 rounded-lg text-sm font-medium flex items-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  {hasCamera ? <Camera className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  {W.retakeThisPage}
                </button>
              </div>
            </div>
          );
        }}
      />
    </div>
  );

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8" aria-labelledby="generic-review-heading">
      <input
        ref={retakeRef} type="file" accept="image/*,.heic,.heif"
        {...(hasCamera ? { capture: 'environment' as const } : {})}
        onChange={handleRetake} className="hidden"
      />

      <div className="bg-slate-50 px-4 sm:px-6 py-4 border-b border-gray-200">
        <h2 id="generic-review-heading" className="text-lg font-bold text-aggie-900 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
          {W.reviewHeading}
        </h2>
        <p className="text-sm text-gray-600 mt-1">{W.reviewIntro}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 border border-green-200">
            {reviewed} of {ordered.length} checked
          </span>
          {flagged > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              {flagged} flagged
            </span>
          )}
          {coverage.unlabelled > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
              {W.chipUnlabelled(coverage.unlabelled)}
            </span>
          )}
        </div>

        {/* The two steps. Either can be opened at any time. */}
        <div className="mt-4 flex gap-1 rounded-xl bg-gray-200/70 p-1 w-full sm:w-auto sm:inline-flex" role="tablist">
          {([['match', W.stepMatch], ['check', W.stepCheck]] as const).map(([s, label]) => (
            <button key={s} type="button" role="tab" aria-selected={step === s} onClick={() => setStep(s)}
              className={`flex-1 sm:flex-none min-h-[40px] px-4 rounded-lg text-sm font-medium transition-colors ${
                step === s ? 'bg-white text-aggie-900 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {hasNotes && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="space-y-1.5 min-w-0">
              {coverage.missing.length > 0 && (
                <div>
                  <p className="font-semibold">{W.coverageMissing}</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {coverage.missing.map(p => (
                      <li key={p.part_id} className="px-2 py-0.5 rounded-full bg-white border border-amber-300 text-xs">{shown(p)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {coverage.repeated.map(r => (
                <p key={r.part.part_id}>{W.coverageRepeated(r.part.label, r.pages)}</p>
              ))}
              {coverage.unlabelled > 0 && <p>{W.coverageUnlabelled(coverage.unlabelled)}</p>}
              {coverage.blank > 0 && <p>{W.coverageBlank(coverage.blank)}</p>}
              <p className="text-xs text-amber-800">{W.coverageNeverBlocks}</p>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 sm:p-6">
        {step === 'match' ? matchStep : checkStep}
      </div>

      <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-slate-50 text-xs text-gray-600">
        Flagging a part does <strong>not</strong> stop you submitting. The flag goes with your submission,
        beside the picture.
      </div>
    </section>
  );
};

export default GenericPageReview;
