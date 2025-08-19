import { useCallback, useRef } from 'react';

/**
 * Custom hook for long press detection
 * Handles both mouse and touch events for cross-platform support
 */
export function useLongPress(callback, { threshold = 500, onStart, onFinish, onCancel } = {}) {
  const timerRef = useRef();
  const isLongPressing = useRef(false);

  const start = useCallback(
    (event) => {
      const isRightClick = event.button === 2;
      if (isRightClick) return;

      onStart?.(event);
      isLongPressing.current = false;

      timerRef.current = setTimeout(() => {
        isLongPressing.current = true;
        callback(event);
        onFinish?.(event);
      }, threshold);
    },
    [callback, threshold, onStart, onFinish]
  );

  const clear = useCallback(
    (event, shouldTriggerOnCancel = true) => {
      clearTimeout(timerRef.current);
      if (shouldTriggerOnCancel && !isLongPressing.current) {
        onCancel?.(event);
      }
    },
    [onCancel]
  );

  const clickHandler = useCallback(
    (event) => {
      if (isLongPressing.current) {
        event.preventDefault();
        event.stopPropagation();
        isLongPressing.current = false;
      }
    },
    []
  );

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onClick: clickHandler,
  };
}