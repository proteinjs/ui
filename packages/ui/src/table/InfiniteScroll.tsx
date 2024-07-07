import { Box, BoxProps } from '@mui/material';
import React, { useEffect, useRef, ReactNode } from 'react';
import InfiniteScrollComponent from 'react-infinite-scroll-component';

interface InfiniteScrollProps {
  children: ReactNode;
  dataLength: number;
  next: () => void;
  hasMore: boolean;
  loader?: ReactNode;
  scrollableTarget?: string;
  sx?: BoxProps['sx'];
}

export const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
  children,
  dataLength,
  next,
  hasMore,
  loader,
  scrollableTarget,
  sx,
}) => {
  const observerTarget = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const options = {
      root: scrollableTarget ? document.getElementById(scrollableTarget) : null,
      rootMargin: '0px 0px 100px 0px',
      threshold: 0.1,
    };

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore) {
        next();
      }
    }, options);

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [next, hasMore, scrollableTarget]);

  return (
    <Box ref={containerRef} sx={sx}>
      <InfiniteScrollComponent
        dataLength={dataLength}
        next={next}
        hasMore={hasMore}
        loader={loader}
        scrollableTarget={scrollableTarget}
      >
        {children}
      </InfiniteScrollComponent>
      {hasMore && (
        <Box
          ref={observerTarget}
          sx={{
            height: '100px',
            visibility: 'hidden',
          }}
        />
      )}
    </Box>
  );
};
