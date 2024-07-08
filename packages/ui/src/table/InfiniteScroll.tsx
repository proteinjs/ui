import { Box, BoxProps } from '@mui/material';
import React, { useEffect, useRef } from 'react';
import InfiniteScrollComponent, { Props as InfiniteScrollComponentProps } from 'react-infinite-scroll-component';

interface InfiniteScrollProps extends InfiniteScrollComponentProps {
  sx?: BoxProps['sx'];
}

export const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
  children,
  next,
  hasMore,
  scrollableTarget,
  sx,
  ...otherProps
}) => {
  const observerTarget = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const getScrollableTarget = () => {
      if (typeof scrollableTarget === 'string') {
        return document.getElementById(scrollableTarget);
      } else if (scrollableTarget instanceof HTMLElement) {
        return scrollableTarget;
      }
      return null;
    };

    const options = {
      root: getScrollableTarget(),
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
      <InfiniteScrollComponent next={next} hasMore={hasMore} scrollableTarget={scrollableTarget} {...otherProps}>
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
