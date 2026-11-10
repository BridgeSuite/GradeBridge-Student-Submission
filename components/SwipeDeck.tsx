import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Check, CheckCircle2, Flag, HelpCircle, RotateCcw, Undo2 } from 'lucide-react';
import { StudentReview } from '../types';

/**
 * One page at a time, decided with a swipe or an arrow key.
 *
 *   right / →  "Looks right"          (signed_off)
 *   left  / ←  "Something is wrong"   (flagged)
 *   up    / ↑  "Not sure yet"         (stays not_reviewed and comes back at the end of the pass)
 *
 * The deck replaces scrolling a long list and pressing a button under every
 * picture. It decides nothing by itself: every outcome is the student's swipe
 * or key press, and an Undo puts the last one back. Flagging still never blocks
 * a download; that rule lives where it always has, in the download gates.
 *
 * Keys work without clicking anything first. They are listened for while the
 * deck is on screen, and ignored while the student is typing in a field.
 */

export interface DeckCard {
  key: string;
  review: StudentReview;
}

export interface SwipeDeckWording {
  hint: string;
  looksRight: string;
  somethingWrong: string;
  notSure: string;
  undo: string;
  progress: (done: number, total: number) => string;
  done: string;
  againUnsure: string;
  againAll: string;
  jump: string;
}

interface SwipeDeckProps<T extends DeckCard> {
  cards: T[];
  /** The body of the card: the pictures, the labels, anything else to judge by. */
  renderCard: (card: T, index: number) => React.ReactNode;
  /** A small picture for the jump strip. */
  renderThumb: (card: T, index: number) => React.ReactNode;
  /** A short name for a card, for the jump strip's buttons. */
  cardName: (card: T, index: number) => string;
  onReview: (key: string, review: StudentReview) => void;
  wording: SwipeDeckWording;
  disabled?: (card: T) => boolean;
}

type Direction = 'right' | 'left' | 'up';
const REVIEW_FOR: Record<Direction, StudentReview> = {
  right: 'signed_off', left: 'flagged', up: 'not_reviewed',
};
/** How far a card has to travel, px, before letting go decides it. */
const SWIPE_DECIDES_PX = 90;
/** How long the card takes to fly off, ms. */
const FLY_MS = 180;

interface Step { key: string; before: StudentReview; wasUnsure: boolean }

function SwipeDeck<T extends DeckCard>({
  cards, renderCard, renderThumb, cardName, onReview, wording: W, disabled,
}: SwipeDeckProps<T>) {
  // 'pending' walks the pages not decided yet; 'all' walks every page in order.
  const [sweep, setSweep] = useState<'pending' | 'all'>('pending');
  const [unsure, setUnsure] = useState<Set<string>>(() => new Set());
  const firstPending = (list: T[], skip: Set<string>): string | null =>
    list.find(c => c.review === 'not_reviewed' && !skip.has(c.key))?.key ?? null;
  const [current, setCurrent] = useState<string | null>(() => firstPending(cards, new Set()));
  const [history, setHistory] = useState<Step[]>([]);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [flying, setFlying] = useState<Direction | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  const index = cards.findIndex(c => c.key === current);
  const card = index >= 0 ? cards[index] : null;
  const decided = cards.filter(c => c.review !== 'not_reviewed').length;

  // A card can disappear under the deck (a page removed); fall forward.
  useEffect(() => {
    if (current !== null && index < 0) setCurrent(firstPending(cards, unsure));
  }, [current, index, cards, unsure]);

  /** The card after `from`, given the decision just made. Null when the pass is over. */
  const nextAfter = useCallback((from: number, override: Record<string, StudentReview>, skip: Set<string>): string | null => {
    if (sweep === 'all') return cards[from + 1]?.key ?? null;
    const reviewOf = (c: T) => override[c.key] ?? c.review;
    for (let step = 1; step <= cards.length; step++) {
      const c = cards[(from + step) % cards.length];
      if (reviewOf(c) === 'not_reviewed' && !skip.has(c.key)) return c.key;
    }
    return null;
  }, [cards, sweep]);

  const decide = useCallback((dir: Direction) => {
    if (!card || flying || disabled?.(card)) return;
    const review = REVIEW_FOR[dir];
    const skip = new Set(unsure);
    if (dir === 'up') skip.add(card.key); else skip.delete(card.key);
    setHistory(h => [...h, { key: card.key, before: card.review, wasUnsure: unsure.has(card.key) }]);
    onReview(card.key, review);
    setUnsure(skip);
    setFlying(dir);
    setDrag(null);
    const next = nextAfter(index, { [card.key]: review }, skip);
    window.setTimeout(() => { setFlying(null); setCurrent(next); }, FLY_MS);
  }, [card, flying, disabled, unsure, onReview, nextAfter, index]);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last || flying) return;
    setHistory(h => h.slice(0, -1));
    onReview(last.key, last.before);
    setUnsure(s => {
      const n = new Set(s);
      if (last.wasUnsure) n.add(last.key); else n.delete(last.key);
      return n;
    });
    setCurrent(last.key);
  }, [history, flying, onReview]);

  const restart = (mode: 'pending' | 'all') => {
    const skip = new Set<string>();
    setUnsure(skip);
    setSweep(mode);
    setCurrent(mode === 'all' ? cards[0]?.key ?? null : firstPending(cards, skip));
  };

  // Keys while the deck is on screen. Typing in a field is never hijacked.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOnScreen(true); return; }
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!onScreen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const dir: Direction | null =
        e.key === 'ArrowRight' ? 'right' : e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowUp' ? 'up' : null;
      if (dir) { e.preventDefault(); decide(dir); return; }
      if (e.key === 'Backspace' || (e.key === 'z' && !e.shiftKey)) { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onScreen, decide, undo]);

  // Swipes: mouse, pen or finger. A press on a button inside the card is left alone.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, select, label')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    start.current = null;
    if (dx > SWIPE_DECIDES_PX && Math.abs(dx) >= Math.abs(dy)) decide('right');
    else if (dx < -SWIPE_DECIDES_PX && Math.abs(dx) >= Math.abs(dy)) decide('left');
    else if (dy < -SWIPE_DECIDES_PX) decide('up');
    else setDrag(null);
  };

  const leaning: Direction | null = useMemo(() => {
    if (flying) return flying;
    if (!drag) return null;
    if (Math.abs(drag.dx) >= Math.abs(drag.dy)) return drag.dx > 40 ? 'right' : drag.dx < -40 ? 'left' : null;
    return drag.dy < -40 ? 'up' : null;
  }, [drag, flying]);

  const transform = flying === 'right' ? 'translate(120%, 0) rotate(18deg)'
    : flying === 'left' ? 'translate(-120%, 0) rotate(-18deg)'
    : flying === 'up' ? 'translate(0, -120%)'
    : drag ? `translate(${drag.dx}px, ${Math.min(drag.dy, 0)}px) rotate(${drag.dx / 18}deg)`
    : 'none';

  const stamp = leaning === 'right'
    ? { text: W.looksRight, cls: 'border-green-600 text-green-700 bg-green-50/90 left-4 -rotate-6' }
    : leaning === 'left'
      ? { text: W.somethingWrong, cls: 'border-amber-600 text-amber-800 bg-amber-50/90 right-4 rotate-6' }
      : leaning === 'up'
        ? { text: W.notSure, cls: 'border-sky-600 text-sky-800 bg-sky-50/90 left-1/2 -translate-x-1/2' }
        : null;

  const statusIcon = (r: StudentReview, isUnsure: boolean) =>
    r === 'signed_off' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
      : r === 'flagged' ? <Flag className="w-3.5 h-3.5 text-amber-600" />
        : isUnsure ? <HelpCircle className="w-3.5 h-3.5 text-sky-600" /> : null;

  if (cards.length === 0) return null;

  return (
    <div ref={root} data-swipe-deck>
      {/* Progress */}
      <div className="flex items-center justify-between gap-3 mb-2 text-sm">
        <span className="font-medium text-aggie-900" data-deck-progress>{W.progress(decided, cards.length)}</span>
        <button
          type="button" onClick={undo} disabled={history.length === 0}
          className="min-h-[36px] px-3 rounded-lg text-sm flex items-center gap-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <Undo2 className="w-4 h-4" /> {W.undo}
        </button>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden mb-4">
        <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${(decided / cards.length) * 100}%` }} />
      </div>

      {card ? (
        <>
          <p className="text-xs text-gray-500 mb-3">{W.hint}</p>
          <div className="relative select-none" style={{ touchAction: 'none' }}>
            <div
              data-deck-card={card.key}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { start.current = null; setDrag(null); }}
              className="relative rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden cursor-grab active:cursor-grabbing"
              style={{
                transform,
                transition: drag && !flying ? 'none' : `transform ${FLY_MS}ms ease-out, opacity ${FLY_MS}ms ease-out`,
                opacity: flying ? 0 : 1,
              }}
            >
              {stamp && (
                <div className={`pointer-events-none absolute top-1/3 z-10 px-3 py-1 rounded-md border-2 font-bold uppercase tracking-wide text-sm ${stamp.cls}`}>
                  {stamp.text}
                </div>
              )}
              {renderCard(card, index)}
            </div>
          </div>

          {/* The same three choices as buttons, for anyone not swiping. */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button" onClick={() => decide('left')} disabled={!!disabled?.(card)}
              className={`min-h-[48px] px-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-40 ${
                card.review === 'flagged' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-50'
              }`}
            >
              <ArrowLeft className="w-4 h-4 hidden sm:block" /><Flag className="w-4 h-4" /> {W.somethingWrong}
            </button>
            <button
              type="button" onClick={() => decide('up')} disabled={!!disabled?.(card)}
              className="min-h-[48px] px-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border border-sky-300 bg-white text-sky-900 hover:bg-sky-50 disabled:opacity-40"
            >
              <ArrowUp className="w-4 h-4 hidden sm:block" /> {W.notSure}
            </button>
            <button
              type="button" onClick={() => decide('right')} disabled={!!disabled?.(card)}
              className={`min-h-[48px] px-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-40 ${
                card.review === 'signed_off' ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-green-300 text-green-900 hover:bg-green-50'
              }`}
            >
              <Check className="w-4 h-4" /> {W.looksRight}<ArrowRight className="w-4 h-4 hidden sm:block" />
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center" data-deck-done>
          <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
          <p className="mt-2 font-semibold text-green-900">{W.done}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {unsure.size > 0 && (
              <button type="button" onClick={() => restart('pending')}
                className="min-h-[44px] px-4 rounded-lg text-sm font-medium border border-sky-300 bg-white text-sky-900 hover:bg-sky-50 flex items-center gap-2">
                <HelpCircle className="w-4 h-4" /> {W.againUnsure}
              </button>
            )}
            <button type="button" onClick={() => restart('all')}
              className="min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> {W.againAll}
            </button>
          </div>
        </div>
      )}

      {/* Every page, small, to jump straight to one. */}
      <div className="mt-5">
        <p className="text-xs font-medium text-gray-600 mb-2">{W.jump}</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {cards.map((c, i) => (
            <button
              key={c.key} type="button" onClick={() => setCurrent(c.key)}
              aria-label={cardName(c, i)} aria-current={c.key === current ? 'true' : undefined}
              className={`relative flex-shrink-0 w-16 rounded-md border-2 overflow-hidden bg-white ${
                c.key === current ? 'border-aggie-600' : c.review === 'signed_off' ? 'border-green-400'
                  : c.review === 'flagged' ? 'border-amber-400' : 'border-gray-200'
              }`}
            >
              {renderThumb(c, i)}
              <span className="absolute top-0.5 right-0.5 bg-white/90 rounded-full">{statusIcon(c.review, unsure.has(c.key))}</span>
              <span className="block text-[10px] text-gray-600 text-center bg-white">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SwipeDeck;
