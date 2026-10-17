/**
 * THE PROBE PAGE for PrependSafeScroller — served and driven by prependSafeScroller.probe.js: a phone-shaped
 * scroller over a synthetic history read upward, in one of two shapes chosen by the URL —
 *   ?mode=reservoir   the primitive under proof;
 *   ?mode=write       the shape it replaces: a top-origin scroller that lands older rows and restores the reader's
 *                     row with a scrollTop write in the rows' own layout effect.
 * Other parameters: total (rows in the history, 80), latency (ms a page read takes, 350), count=low (the consumer
 * under-counts the rows above, so the reservoir runs short and the debt is paid at the rest), lead (viewports).
 *
 * THE PAGE JUDGES ITSELF. From the first touch or scroll event an EPISODE records every animation frame of the
 * scroller — scrollTop, scrollHeight, the row count, the first visible row and its top, the previous frame's row
 * measured in THIS frame's layout, the census of programmatic scrollTop writes on the scroller (with the finger's
 * state at each), the finger's clientY — and closes QUIET_MS after the last signal. Every frame is judged against
 * the previous one, on the previous frame's row measured in THIS frame's layout (never on whichever row is first
 * visible now: a restore that fails puts an older row first, and judging the new first row would miss that jump):
 *   • on a LANDING frame (the row count grew) the row's position in CONTENT coordinates — its viewport top plus
 *     the scroll offset, the layout above it — is unchanged within JUMP_PX (the height-neutral law: a pan or a
 *     fling moves the viewport, never the content above the row), scrollHeight is unchanged, and nothing was
 *     written; a write while a finger is down is a jump by the platform's law (the pan re-derives it away);
 *   • on a WRITE frame with no finger (the census grew — a reconcile at the rest) the row keeps its viewport top
 *     within JUMP_PX, judged over that frame and the next (an engine may acknowledge the offset a frame late).
 * The episode's summary is posted to /__log, kept in window.__probe.episodes and drawn in the overlay.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PrependSafeScroller, PrependSafeScrollerApi } from '../../src/list/PrependSafeScroller';

const params = new URLSearchParams(window.location.search);
const param = (name: string, fallback: string) => params.get(name) ?? fallback;
const MODE = param('mode', 'reservoir');
const TOTAL = Number(param('total', '80'));
const PAGE = 10;
const LATENCY = Number(param('latency', '350'));
const LOW_COUNT = param('count', 'honest') === 'low';
const LEAD = Number(param('lead', '2'));
const SCROLLER_ID = 'list';

type Row = { id: number; text: string };
const WORDS = (
  'the reader keeps the row under the finger while older rows land above and nothing below the edge moves ' +
  'a page read leaves early lands late and the block above shrinks by exactly what arrived'
).split(' ');
const textOf = (id: number): string => {
  let x = (id * 2654435761) % 2147483647 || 1;
  const next = () => {
    x = (x * 48271) % 2147483647;
    return x / 2147483647;
  };
  const sentences = 1 + Math.floor(next() * 6);
  const out: string[] = [];
  for (let s = 0; s < sentences; s++) {
    const words = 6 + Math.floor(next() * 9);
    const sentence: string[] = [];
    for (let w = 0; w < words; w++) {
      sentence.push(WORDS[Math.floor(next() * WORDS.length)]);
    }
    out.push(sentence.join(' ') + '.');
  }
  return out.join(' ');
};
const rowOf = (id: number): Row => ({ id, text: textOf(id) });
const range = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let id = from; id <= to; id++) {
    out.push(id);
  }
  return out;
};
/** The page read: the PAGE rows before `beforeId`, after LATENCY ms. */
const readPage = (beforeId: number): Promise<Row[]> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(range(Math.max(1, beforeId - PAGE), beforeId - 1).map(rowOf)), LATENCY);
  });

const RowView = ({ row }: { row: Row }) => (
  <div
    data-row-id={row.id}
    style={{
      padding: '12px 16px',
      borderBottom: '1px solid #ddd',
      fontFamily: 'system-ui',
      fontSize: 16,
      lineHeight: 1.4,
    }}
  >
    <div style={{ fontWeight: 600 }}>Row {row.id}</div>
    <div>{row.text}</div>
  </div>
);
const LoadingFace = () => (
  <div style={{ padding: '10px 16px', fontFamily: 'system-ui', fontSize: 14, color: '#666', background: '#f4f4f4' }}>
    Loading older rows…
  </div>
);

type AppDoor = {
  mode: string;
  rows: () => number;
  remaining: () => number;
  reserve: () => number;
  firstId: () => number;
};
declare global {
  interface Window {
    __app?: AppDoor;
    __probe?: ProbeDoor;
  }
}

/** The primitive under proof: the consumer counts the rows above honestly (or low, with count=low). */
const ReservoirList = () => {
  const [items, setItems] = useState<Row[]>(() => range(TOTAL - PAGE + 1, TOTAL).map(rowOf));
  const [loading, setLoading] = useState(false);
  const api = useRef<PrependSafeScrollerApi | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const firstId = useRef(items[0].id);
  firstId.current = items[0].id;
  const remainingReal = items[0].id - 1;
  const remaining = LOW_COUNT ? Math.min(remainingReal, 5) : remainingReal;
  const onNeedMore = useCallback(async () => {
    setLoading(true);
    const rows = await readPage(firstId.current);
    setItems((previous) => [...rows, ...previous]);
    setLoading(false);
  }, []);
  useLayoutEffect(() => {
    // The opening view: the end of the history.
    const el = scroller.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);
  useEffect(() => {
    window.__app = {
      mode: MODE,
      rows: () => items.length,
      remaining: () => remaining,
      reserve: () => api.current?.reservePx() ?? 0,
      firstId: () => items[0].id,
    };
  }, [items, remaining]);
  return (
    <PrependSafeScroller
      id={SCROLLER_ID}
      scrollerRef={scroller}
      apiRef={api}
      items={items}
      itemKey={(row) => row.id}
      renderItem={(row) => <RowView row={row} />}
      remainingAbove={remaining}
      estimatedRowHeight={120}
      leadViewports={LEAD}
      onNeedMore={onNeedMore}
      loading={loading}
      loadingRow={<LoadingFace />}
      sx={{ height: '100%', background: '#fff' }}
    />
  );
};

/**
 * The shape the primitive replaces: a top-origin scroller; the loader asks at the same lead; a landing restores the
 * row that was first by a scrollTop write in the rows' layout effect (pre-paint, row-anchored) — the write a pan
 * re-derives away on its next update.
 */
const WriteList = () => {
  const [items, setItems] = useState<Row[]>(() => range(TOTAL - PAGE + 1, TOTAL).map(rowOf));
  const scroller = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);
  const firstId = useRef(items[0].id);
  firstId.current = items[0].id;
  /** The first row's top in content coordinates, as of the last commit. */
  const recorded = useRef<{ id: number; top: number } | null>(null);
  const boxesOf = (el: HTMLElement) => Array.from(el.querySelectorAll('[data-row-id]')) as HTMLElement[];
  const contentTop = (el: HTMLElement, box: HTMLElement) =>
    box.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
  const ask = useCallback(() => {
    const el = scroller.current;
    if (!el || inFlight.current || firstId.current <= 1 || el.scrollTop >= el.clientHeight * LEAD) {
      return;
    }
    inFlight.current = true;
    readPage(firstId.current).then((rows) => setItems((previous) => [...rows, ...previous]));
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    const boxes = boxesOf(el);
    const previous = recorded.current;
    if (previous) {
      const index = items.findIndex((row) => row.id === previous.id);
      if (index > 0) {
        const delta = contentTop(el, boxes[index]) - previous.top;
        if (delta !== 0) {
          el.scrollTop = el.scrollTop + delta; // THE COMPENSATING WRITE
        }
      }
    }
    recorded.current = boxes[0] ? { id: items[0].id, top: contentTop(el, boxes[0]) } : null;
    inFlight.current = false;
  }, [items]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    const opening = requestAnimationFrame(() => ask());
    return () => cancelAnimationFrame(opening);
  }, [ask]);
  useEffect(() => {
    ask(); // the chain: after a landing, the lead re-asked
    window.__app = {
      mode: MODE,
      rows: () => items.length,
      remaining: () => items[0].id - 1,
      reserve: () => 0,
      firstId: () => items[0].id,
    };
  }, [items, ask]);
  return (
    <div
      id={SCROLLER_ID}
      ref={scroller}
      onScroll={ask}
      style={{ height: '100%', overflowY: 'auto', overflowAnchor: 'none', background: '#fff' }}
    >
      {items.map((row) => (
        <RowView key={row.id} row={row} />
      ))}
    </div>
  );
};

// ── The in-page judge ─────────────────────────────────────────────────────────────────────────────────────────
type Frame = {
  t: number;
  st: number;
  sh: number;
  ch: number;
  rows: number;
  anchorId: number | null;
  anchorTop: number;
  previousAnchorTop: number | null;
  writes: number;
  fingerY: number | null;
};
type Summary = {
  mode: string;
  t0: number;
  frames: number;
  landings: number;
  landingsUnderFinger: number;
  writes: number;
  writesUnderFinger: number;
  writesAtLandings: number;
  maxLandingDrift: number;
  maxWriteDrift: number;
  maxShChangeAtLanding: number;
  jumps: number;
  jumpRows: string[];
};
type ProbeDoor = {
  episodes: Summary[];
  armed: () => boolean;
  summary: () => Summary;
  closeNow: () => void;
  mark: () => void;
  since: () => Summary;
  state: () => { st: number; sh: number; ch: number; rows: number; finger: boolean; writes: number };
};

const JUMP_PX = 2;
const QUIET_MS = 1500;
const ARM_DELAY_MS = 800;

class EpisodeProbe {
  readonly episodes: Summary[] = [];
  private census = 0;
  /** Per write: whether a finger was down on the scroller at the moment of the write (the census's own record). */
  private readonly writeFlags: boolean[] = [];
  private fingerDown = false;
  private fingerY: number | null = null;
  private previous: Frame | null = null;
  private previousAnchorEl: Element | null = null;
  /** A write's displacement on its own frame, judged together with the next frame's. */
  private pendingWrite: number | null = null;
  private frame = 0;
  private quiet = 0;
  private current: Summary | null = null;
  private isArmed = false;
  private markAt = 0;
  private onFrame: ((live: Summary | null, last: Summary | null) => void) | null = null;

  install(onFrame: (live: Summary | null, last: Summary | null) => void): void {
    this.onFrame = onFrame;
    const scrollerId = SCROLLER_ID;
    const countWrite = () => {
      this.census++;
      this.writeFlags.push(this.fingerDown);
    };
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get() {
        return descriptor.get!.call(this);
      },
      set(value: number) {
        if ((this as Element).id === scrollerId) {
          countWrite();
        }
        descriptor.set!.call(this, value);
      },
    });
    const onScroller = (target: EventTarget | null) => {
      const el = document.getElementById(scrollerId);
      return !!el && target instanceof Node && el.contains(target);
    };
    document.addEventListener(
      'touchstart',
      (event) => {
        if (!onScroller(event.target)) {
          return;
        }
        this.fingerDown = true;
        this.fingerY = event.touches[0]?.clientY ?? null;
        this.signal();
      },
      { capture: true, passive: true }
    );
    document.addEventListener(
      'touchmove',
      (event) => {
        if (this.fingerDown) {
          this.fingerY = event.touches[0]?.clientY ?? this.fingerY;
        }
      },
      { capture: true, passive: true }
    );
    const lift = () => {
      if (!this.fingerDown) {
        return;
      }
      this.fingerDown = false;
      this.fingerY = null;
      this.signal();
    };
    document.addEventListener('touchend', lift, { capture: true, passive: true });
    document.addEventListener('touchcancel', lift, { capture: true, passive: true });
    document.addEventListener(
      'scroll',
      (event) => {
        if (onScroller(event.target)) {
          this.signal();
        }
      },
      { capture: true, passive: true }
    );
    setTimeout(() => {
      this.isArmed = true;
    }, ARM_DELAY_MS);
  }

  door(): ProbeDoor {
    return {
      episodes: this.episodes,
      armed: () => this.isArmed,
      summary: () => this.current ?? EpisodeProbe.blank(),
      closeNow: () => this.close(),
      mark: () => {
        this.close();
        this.markAt = this.episodes.length;
      },
      since: () => {
        this.close();
        return EpisodeProbe.merge(this.episodes.slice(this.markAt));
      },
      state: () => {
        const el = document.getElementById(SCROLLER_ID)!;
        return {
          st: el.scrollTop,
          sh: el.scrollHeight,
          ch: el.clientHeight,
          rows: el.querySelectorAll('[data-row-id]').length,
          finger: this.fingerDown,
          writes: this.census,
        };
      },
    };
  }

  private static blank(): Summary {
    return {
      mode: MODE,
      t0: 0,
      frames: 0,
      landings: 0,
      landingsUnderFinger: 0,
      writes: 0,
      writesUnderFinger: 0,
      writesAtLandings: 0,
      maxLandingDrift: 0,
      maxWriteDrift: 0,
      maxShChangeAtLanding: 0,
      jumps: 0,
      jumpRows: [],
    };
  }

  private static merge(list: Summary[]): Summary {
    const out = EpisodeProbe.blank();
    list.forEach((s) => {
      out.t0 = out.t0 || s.t0;
      out.frames += s.frames;
      out.landings += s.landings;
      out.landingsUnderFinger += s.landingsUnderFinger;
      out.writes += s.writes;
      out.writesUnderFinger += s.writesUnderFinger;
      out.writesAtLandings += s.writesAtLandings;
      out.maxLandingDrift = Math.max(out.maxLandingDrift, s.maxLandingDrift);
      out.maxWriteDrift = Math.max(out.maxWriteDrift, s.maxWriteDrift);
      out.maxShChangeAtLanding = Math.max(out.maxShChangeAtLanding, s.maxShChangeAtLanding);
      out.jumps += s.jumps;
      out.jumpRows.push(...s.jumpRows);
    });
    return out;
  }

  private signal(): void {
    if (!this.isArmed) {
      return;
    }
    if (!this.current) {
      this.current = { ...EpisodeProbe.blank(), t0: Math.round(performance.now()) };
      this.previous = null;
      this.previousAnchorEl = null;
    }
    if (this.frame === 0) {
      this.frame = requestAnimationFrame(this.sample);
    }
    if (this.quiet !== 0) {
      clearTimeout(this.quiet);
    }
    this.quiet = window.setTimeout(() => this.close(), QUIET_MS);
  }

  private readonly sample = (): void => {
    this.frame = 0;
    const summary = this.current;
    const el = document.getElementById(SCROLLER_ID);
    if (!summary || !el) {
      return;
    }
    const frame = this.read(el);
    this.judge(summary, this.previous, frame);
    summary.frames++;
    this.previous = frame;
    this.onFrame?.(summary, this.episodes[this.episodes.length - 1] ?? null);
    this.frame = requestAnimationFrame(this.sample);
  };

  private read(el: HTMLElement): Frame {
    const top0 = el.getBoundingClientRect().top;
    const rows = el.querySelectorAll('[data-row-id]');
    let anchorId: number | null = null;
    let anchorTop = 0;
    let anchorEl: Element | null = null;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (rect.bottom - top0 > 0 && rect.top - top0 < el.clientHeight) {
        anchorId = Number(rows[i].getAttribute('data-row-id'));
        anchorTop = rect.top - top0;
        anchorEl = rows[i];
        break;
      }
    }
    const previousEl = this.previousAnchorEl;
    const previousAnchorTop =
      previousEl && previousEl.isConnected ? previousEl.getBoundingClientRect().top - top0 : null;
    this.previousAnchorEl = anchorEl;
    return {
      t: Math.round(performance.now()),
      st: el.scrollTop,
      sh: el.scrollHeight,
      ch: el.clientHeight,
      rows: rows.length,
      anchorId,
      anchorTop,
      previousAnchorTop,
      writes: this.census,
      fingerY: this.fingerDown ? this.fingerY : null,
    };
  }

  private judge(summary: Summary, previous: Frame | null, frame: Frame): void {
    if (!previous) {
      return;
    }
    const landed = frame.rows > previous.rows;
    const wrote = frame.writes > previous.writes;
    const finger = frame.fingerY !== null || previous.fingerY !== null;
    // The previous frame's row: its displacement in the viewport (`moved`), and in CONTENT coordinates (`shift`) —
    // the layout change above it, which no pan and no fling enters into. A neutral landing shifts nothing.
    const moved = frame.previousAnchorTop === null ? null : frame.previousAnchorTop - previous.anchorTop;
    const shift = moved === null ? null : moved + (frame.st - previous.st);
    if (landed) {
      summary.landings++;
      if (finger) {
        summary.landingsUnderFinger++;
      }
      if (wrote) {
        summary.writesAtLandings += frame.writes - previous.writes;
      } else {
        summary.maxShChangeAtLanding = Math.max(summary.maxShChangeAtLanding, Math.abs(frame.sh - previous.sh));
      }
      if (shift !== null) {
        summary.maxLandingDrift = Math.max(summary.maxLandingDrift, Math.abs(shift));
      }
    }
    // A write is under a finger by the census's own record at the write — not by either frame's finger state: a
    // reconcile that lands on the frame after a lift (an engine firing scrollend at the lift) is not under it.
    const writesUnderFinger = wrote ? this.writeFlags.slice(previous.writes, frame.writes).filter(Boolean).length : 0;
    if (wrote) {
      summary.writes += frame.writes - previous.writes;
      summary.writesUnderFinger += writesUnderFinger;
    }
    if (frame.ch !== previous.ch) {
      this.pendingWrite = null;
      return;
    }
    const jumps: Array<{ kind: string; px: number }> = [];
    // A write at the rest is judged over its frame and the next: an engine whose scroll offset acknowledges a
    // write a frame late shows the layout shift first and the offset after; the smaller displacement is the truth.
    if (this.pendingWrite !== null && moved !== null) {
      const drift = Math.min(Math.abs(this.pendingWrite), Math.abs(this.pendingWrite + moved));
      summary.maxWriteDrift = Math.max(summary.maxWriteDrift, drift);
      if (drift > JUMP_PX) {
        jumps.push({ kind: 'write-drift', px: Math.round(drift) });
      }
      this.pendingWrite = null;
    }
    if (landed && shift !== null && Math.abs(shift) > JUMP_PX) {
      jumps.push({ kind: 'landing-shift', px: Math.round(shift) });
    }
    if (writesUnderFinger > 0) {
      jumps.push({ kind: 'write-under-finger', px: Math.round(moved ?? 0) });
    } else if (wrote && !landed && moved !== null) {
      this.pendingWrite = moved;
    }
    jumps.forEach((jump) => {
      summary.jumps++;
      if (summary.jumpRows.length < 48) {
        summary.jumpRows.push(
          `+${frame.t - summary.t0}/${jump.kind} row=${previous.anchorId} top ${Math.round(previous.anchorTop)}>${Math.round(
            frame.previousAnchorTop ?? NaN
          )} shift=${shift === null ? '-' : Math.round(shift)} d=${jump.px} st=${Math.round(previous.st)}>${Math.round(frame.st)} sh=${previous.sh}>${frame.sh} rows=${previous.rows}>${frame.rows} writes=${previous.writes}>${frame.writes} f=${frame.fingerY === null ? 'up' : Math.round(frame.fingerY)}`
        );
      }
    });
  }

  private close(): void {
    if (this.quiet !== 0) {
      clearTimeout(this.quiet);
      this.quiet = 0;
    }
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    const summary = this.current;
    this.current = null;
    this.previous = null;
    this.previousAnchorEl = null;
    if (!summary || summary.frames === 0) {
      return;
    }
    this.episodes.push(summary);
    try {
      fetch('/__log', { method: 'POST', body: JSON.stringify(summary), keepalive: true }).catch(() => undefined);
    } catch {
      // no log door: the overlay and the window door still carry the episode
    }
    this.onFrame?.(null, summary);
  }
}

// ── The overlay and the mount ─────────────────────────────────────────────────────────────────────────────────
const line = (label: string, s: Summary) =>
  `${label}: frames ${s.frames} landings ${s.landings} (finger ${s.landingsUnderFinger}) writes ${s.writes} ` +
  `(finger ${s.writesUnderFinger}, at landings ${s.writesAtLandings}) drift land ${s.maxLandingDrift.toFixed(1)} ` +
  `write ${s.maxWriteDrift.toFixed(1)} sh@land ${s.maxShChangeAtLanding} jumps ${s.jumps}`;

const Overlay = ({ probe }: { probe: EpisodeProbe }) => {
  const [text, setText] = useState('');
  useEffect(() => {
    const draw = (live: Summary | null, last: Summary | null) => {
      const app = window.__app;
      const el = document.getElementById(SCROLLER_ID);
      const head =
        app && el
          ? `${app.mode} · rows ${app.rows()} · above ${app.remaining()} · reserve ${Math.round(app.reserve())}px · st ${Math.round(el.scrollTop)} / sh ${el.scrollHeight} · ${probe.door().state().finger ? 'FINGER' : 'up'} · ${probe.door().armed() ? 'armed' : 'arming'}`
          : 'mounting';
      const all = EpisodeProbeMerge(probe.episodes);
      setText(
        [
          head,
          live ? line('live', live) : 'live: —',
          last ? line('last', last) : 'last: —',
          line(`all ${probe.episodes.length}`, all),
        ].join('\n')
      );
    };
    probe.install(draw);
    const tick = setInterval(() => draw(null, probe.episodes[probe.episodes.length - 1] ?? null), 500);
    return () => clearInterval(tick);
  }, [probe]);
  return (
    <div
      id='overlay'
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '6px 8px',
        background: 'rgba(0,0,0,0.78)',
        color: '#fff',
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {text}
    </div>
  );
};
const EpisodeProbeMerge = (list: Summary[]): Summary =>
  (EpisodeProbe as unknown as { merge: (l: Summary[]) => Summary }).merge(list);

const probe = new EpisodeProbe();
window.__probe = probe.door();
const root = createRoot(document.getElementById('root')!);
root.render(
  <>
    {MODE === 'write' ? <WriteList /> : <ReservoirList />}
    <Overlay probe={probe} />
  </>
);
