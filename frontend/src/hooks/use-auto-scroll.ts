import { useEffect, useRef, useState } from "react";

// How many pixels from the bottom of the container to enable auto-scroll
const ACTIVATION_THRESHOLD = 150;
// Minimum pixels of scroll-up movement required to disable auto-scroll
const MIN_SCROLL_UP_THRESHOLD = 10;

export function useAutoScroll(dependencies: React.DependencyList) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousScrollTop = useRef<number | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [currentDistanceFromBottom, setCurrentDistanceFromBottom] =
    useState<number>(0);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);

      const distanceFromBottom = Math.abs(
        scrollHeight - scrollTop - clientHeight
      );
      setCurrentDistanceFromBottom(distanceFromBottom);

      const isScrollingUp = previousScrollTop.current
        ? scrollTop < previousScrollTop.current
        : false;

      const scrollUpDistance = previousScrollTop.current
        ? previousScrollTop.current - scrollTop
        : 0;

      const isDeliberateScrollUp =
        isScrollingUp && scrollUpDistance > MIN_SCROLL_UP_THRESHOLD;

      const isTrulyAtTheVeryBottom = distanceFromBottom < 10;
      const isScrolledNearBottomActivation =
        distanceFromBottom < ACTIVATION_THRESHOLD;

      if (isTrulyAtTheVeryBottom) {
        setShouldAutoScroll(true);
      } else if (isDeliberateScrollUp) {
        setShouldAutoScroll(false);
      } else {
        setShouldAutoScroll(isScrolledNearBottomActivation);
      }

      previousScrollTop.current = scrollTop;
    }
  };

  const handleTouchStart = () => {
    // Only disable auto-scroll if the user is not already at the bottom.
    // If they are at the bottom, a touchstart shouldn't disable auto-scroll.
    // Subsequent scrolling up will disable it via handleScroll.
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const distanceFromBottom = Math.abs(
        scrollHeight - scrollTop - clientHeight
      );
      if (distanceFromBottom >= ACTIVATION_THRESHOLD) {
        setShouldAutoScroll(false);
      }
    }
  };

  useEffect(() => {
    if (containerRef.current) {
      previousScrollTop.current = containerRef.current.scrollTop;
    }
  }, []);

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return {
    containerRef,
    scrollToBottom,
    handleScroll,
    shouldAutoScroll,
    handleTouchStart,
    isScrolling,
    currentDistanceFromBottom,
  };
}
