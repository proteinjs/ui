import { useCallback, useSyncExternalStore } from 'react';

type MatchMedia = (query: string) => MediaQueryList;

type Entry = {
  list: MediaQueryList;
  listeners: Set<() => void>;
  /** Removes the one `change` listener the registry holds on the list; null while nobody subscribes. */
  detach: (() => void) | null;
};

/**
 * ONE MediaQueryList per query string for the whole page, shared by every subscriber.
 *
 * A hook that calls `matchMedia(query)` per instance (the usual `useMediaQuery` shape) costs a list and a
 * `change` listener per mounted component — in a long list where every row forks on the form factor
 * through several components, that is ten or more live subscriptions per row and thousands on a page.
 * The registry keeps one list per query and fans one `change` listener out to every subscriber, so N
 * callers cost one subscription per distinct query. `matches` is read from the list itself (live in
 * every browser), so a read never caches a stale answer.
 *
 * The last subscriber leaving drops the list, so a later mount queries `matchMedia` afresh — a page whose
 * environment changed between mounts (a test swapping `window.matchMedia` per case, a document restored
 * from the back-forward cache) reads the current answer, never a held one.
 */
export class MediaQueryRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly matchMedia: () => MatchMedia | undefined) {}

  /** The query's current answer; false where `matchMedia` does not exist (a server render, a bare DOM). */
  matches(query: string): boolean {
    const entry = this.entry(query);
    return entry ? entry.list.matches : false;
  }

  /**
   * Hear the query's changes. The first subscriber attaches the registry's one `change` listener to the
   * list; the last one leaving detaches it and drops the list.
   */
  subscribe(query: string, listener: () => void): () => void {
    const entry = this.entry(query);
    if (!entry) {
      return () => undefined;
    }
    entry.listeners.add(listener);
    if (!entry.detach) {
      entry.detach = this.attach(entry);
    }
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        entry.detach?.();
        entry.detach = null;
        this.entries.delete(query);
      }
    };
  }

  /** How many lists the registry holds — one per distinct query with a subscriber or a recent read. */
  size(): number {
    return this.entries.size;
  }

  private entry(query: string): Entry | undefined {
    const existing = this.entries.get(query);
    if (existing) {
      return existing;
    }
    const matchMedia = this.matchMedia();
    if (!matchMedia) {
      return undefined;
    }
    const entry: Entry = { list: matchMedia(query), listeners: new Set(), detach: null };
    this.entries.set(query, entry);
    return entry;
  }

  private attach(entry: Entry): () => void {
    const onChange = () => {
      Array.from(entry.listeners).forEach((listener) => listener());
    };
    const { list } = entry;
    // `addEventListener('change')` is the standard; `addListener` is the one older WebKit offers.
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    }
    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }
}

/** The page's registry — `window.matchMedia` where it exists. */
export const mediaQueryRegistry = new MediaQueryRegistry(() =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined
);

/**
 * `matches` for a media query, read synchronously on the first render (a client render never paints a
 * wrong-posture frame first) and kept current through the shared registry: every caller of the same
 * query rides one MediaQueryList and one `change` listener.
 */
export const useSharedMediaQuery = (query: string): boolean => {
  const subscribe = useCallback((notify: () => void) => mediaQueryRegistry.subscribe(query, notify), [query]);
  const getSnapshot = useCallback(() => mediaQueryRegistry.matches(query), [query]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
