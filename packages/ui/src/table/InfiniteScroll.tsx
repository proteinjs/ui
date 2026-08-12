import { Box, BoxProps } from '@mui/material';
import React, { ReactNode, useEffect, useRef } from 'react';

export interface InfiniteScrollProps {
  children: ReactNode;
  /** Ask for the next page. Callers guard re-entrancy (see `Table`'s handleFetchNextPage). */
  next: () => void;
  hasMore: boolean;
  /**
   * True while a page fetch is actually in flight — the ONLY state that renders `loader`.
   * (The previous react-infinite-scroll-component integration rendered its loader whenever
   * `hasMore` was true — with a single React element as children the library's has-children
   * check is always false — so an idle table promised "Loading..." forever while fetching
   * nothing: the n3xa5 Migrations stall shape, one page of rows + a perpetual loader.)
   */
  isFetching: boolean;
  loader: ReactNode;
  /** The scroll container the sentinel is observed against; null/undefined = the viewport. */
  scrollableTarget?: HTMLElement | null;
  sx?: BoxProps['sx'];
}

/**
 * The table's load-more pager: a sentinel div after the content, watched by an
 * IntersectionObserver rooted at the scroll container. One trigger owner, two cases it covers:
 * - UNDER-FILLED content: the sentinel is visible immediately, so pages chain until the
 *   container fills (or `hasMore` ends).
 * - OVERFLOWING content: the sentinel enters the root's margin as the user scrolls near the
 *   bottom, fetching the next page.
 * react-infinite-scroll-component was retired from this path (2026-08): its scroll listener was
 * bound to `window` (the element target is filtered out below deliberately — the app's layout
 * scrolls inner containers, never the window), so the observer was already the only working
 * trigger, and its always-on loader rendering lied about progress (see `isFetching`).
 */
export const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
  children,
  next,
  hasMore,
  isFetching,
  loader,
  scrollableTarget,
  sx,
}) => {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const options: IntersectionObserverInit = {
      root: scrollableTarget instanceof HTMLElement ? scrollableTarget : null,
      rootMargin: '100px 0px',
      threshold: 0,
    };

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore) {
        next();
      }
    }, options);

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [next, hasMore, scrollableTarget]);

  return (
    <Box sx={sx}>
      {children}
      {hasMore && isFetching && loader}
      {hasMore && (
        <Box
          ref={observerTarget}
          data-infinite-scroll-sentinel
          sx={{
            height: '48px',
            visibility: 'hidden',
          }}
        />
      )}
    </Box>
  );
};
