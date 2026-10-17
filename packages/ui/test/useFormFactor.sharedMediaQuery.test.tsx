/**
 * @jest-environment jsdom
 *
 * `useFormFactor` shares one MediaQueryList per query across every caller (src/hooks/mediaQueryRegistry.ts).
 * A list surface forks on the form factor in several components per row — a swipe wrapper, a tooltip, an
 * icon button — so a hook that queried `matchMedia` per instance cost a list and a `change` listener per
 * component: ten or more live subscriptions per row, thousands on a long page. Outcomes, on rendered
 * consumers over a recording `matchMedia`:
 *  1. Twelve consumers cost one `matchMedia` call per distinct query (the hook asks two) and one `change`
 *     listener per list — not one per consumer.
 *  2. A change on the shared list reaches every consumer: all twelve re-render with the new answer.
 *  3. The last consumer leaving releases the list (its listener removed, nothing held), and a later mount
 *     reads the environment afresh rather than a held answer.
 *  4. `matchMedia` swapped under a MOUNTED tree (a test double replaced between renders of one root): the
 *     next render reads the new function's answer, the held list dropped — the shape a per-instance
 *     `useMediaQuery` had by keying on the function's identity.
 */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useFormFactor } from '../src/hooks/useFormFactor';
import { mediaQueryRegistry } from '../src/hooks/mediaQueryRegistry';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A MediaQueryList double that records its listeners and lets a test flip its answer. */
class RecordingList {
  readonly listeners = new Set<(event: MediaQueryListEvent) => void>();
  onchange = null;
  constructor(
    public readonly media: string,
    public matches: boolean
  ) {}
  addEventListener(type: string, listener: (event: MediaQueryListEvent) => void) {
    if (type === 'change') {
      this.listeners.add(listener);
    }
  }
  removeEventListener(type: string, listener: (event: MediaQueryListEvent) => void) {
    if (type === 'change') {
      this.listeners.delete(listener);
    }
  }
  addListener(listener: (event: MediaQueryListEvent) => void) {
    this.listeners.add(listener);
  }
  removeListener(listener: (event: MediaQueryListEvent) => void) {
    this.listeners.delete(listener);
  }
  dispatchEvent() {
    return false;
  }
  /** The browser's `change`: the answer flips and every listener hears it. */
  change(matches: boolean) {
    this.matches = matches;
    Array.from(this.listeners).forEach((listener) => listener({ matches, media: this.media } as MediaQueryListEvent));
  }
}

/** Every list `matchMedia` handed out, in call order; `answer` is what a new list starts with. */
const lists: RecordingList[] = [];
const answer = { coarse: true, phoneWindow: true };
const isCoarseQuery = (query: string) => query.includes('pointer: coarse');

beforeAll(() => {
  (window as any).matchMedia = (query: string) => {
    const list = new RecordingList(query, isCoarseQuery(query) ? answer.coarse : answer.phoneWindow);
    lists.push(list);
    return list;
  };
});

afterAll(() => {
  delete (window as any).matchMedia;
});

const CONSUMERS = 12;

const Consumer = ({ index }: { index: number }) => {
  const { isPhone, isCoarsePointer } = useFormFactor();
  return (
    <span data-consumer={index}>
      {isPhone ? 'phone' : 'desktop'}/{isCoarsePointer ? 'coarse' : 'fine'}
    </span>
  );
};

const theme = createTheme();

describe('useFormFactor — one MediaQueryList per query, shared by every caller', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    lists.length = 0;
    answer.coarse = true;
    answer.phoneWindow = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = () =>
    act(() => {
      root.render(
        <ThemeProvider theme={theme}>
          {Array.from({ length: CONSUMERS }, (unused, index) => (
            <Consumer key={index} index={index} />
          ))}
        </ThemeProvider>
      );
    });

  const readings = () => Array.from(container.querySelectorAll('[data-consumer]')).map((el) => el.textContent);
  const listenerCounts = () => lists.map((list) => list.listeners.size);
  const coarseList = () => lists.find((list) => isCoarseQuery(list.media))!;

  it('twelve consumers cost one matchMedia call per query and one change listener per list', () => {
    mount();
    expect(readings()).toEqual(Array(CONSUMERS).fill('phone/coarse'));
    // The hook asks two queries; every consumer rides the same two lists.
    expect(lists.map((list) => list.media).sort()).toEqual(
      ['(max-width: 599.95px), (max-height: 599.95px)', '(pointer: coarse)'].sort()
    );
    expect(listenerCounts()).toEqual([1, 1]);
    expect(mediaQueryRegistry.size()).toBe(2);
  });

  it('a change on the shared list reaches every consumer', () => {
    mount();
    act(() => coarseList().change(false));
    // The pointer went fine: no consumer is phone-class or coarse any more — all twelve re-rendered.
    expect(readings()).toEqual(Array(CONSUMERS).fill('desktop/fine'));
    act(() => coarseList().change(true));
    expect(readings()).toEqual(Array(CONSUMERS).fill('phone/coarse'));
  });

  it('the last consumer leaving releases the list; a later mount reads the environment afresh', () => {
    mount();
    act(() => root.unmount());
    expect(listenerCounts()).toEqual([0, 0]);
    expect(mediaQueryRegistry.size()).toBe(0);
    // The environment changed while nothing was mounted (a fine pointer now): the next mount asks
    // matchMedia again and reads the current answer, never the list it held before.
    answer.coarse = false;
    root = createRoot(container);
    mount();
    expect(readings()).toEqual(Array(CONSUMERS).fill('desktop/fine'));
    expect(lists.length).toBe(4);
  });

  it('matchMedia swapped under a mounted tree: the next render reads the new answer', () => {
    mount();
    expect(readings()).toEqual(Array(CONSUMERS).fill('phone/coarse'));
    // The double replaced wholesale (a suite's setMedia(false) between two renders of one root).
    const swapped: RecordingList[] = [];
    (window as any).matchMedia = (query: string) => {
      const list = new RecordingList(query, false);
      swapped.push(list);
      return list;
    };
    mount();
    expect(readings()).toEqual(Array(CONSUMERS).fill('desktop/fine'));
    // One new list per query, the consumers' listeners carried onto them; the old lists released.
    expect(swapped.map((list) => list.listeners.size)).toEqual([1, 1]);
    expect(lists.map((list) => list.listeners.size)).toEqual([0, 0]);
    (window as any).matchMedia = (query: string) => {
      const list = new RecordingList(query, isCoarseQuery(query) ? answer.coarse : answer.phoneWindow);
      lists.push(list);
      return list;
    };
  });
});
