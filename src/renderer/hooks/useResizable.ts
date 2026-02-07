import { useCallback, useRef, useEffect } from 'react';

type Direction = 'horizontal' | 'vertical';

interface UseResizableOptions {
  direction: Direction;
  /** Current size in px */
  size: number;
  /** Min size in px */
  minSize: number;
  /** Max size in px */
  maxSize: number;
  /** Whether dragging increases size when mouse moves in positive direction
   *  true = sidebar (drag right → bigger), false = diff/terminal (drag left/up → bigger) */
  reverse?: boolean;
  /** Called continuously during drag */
  onResize: (newSize: number) => void;
}

/**
 * Hook that provides mouse-drag resizing for panels.
 * Fully ref-based to avoid re-renders during drag for smooth 60fps performance.
 */
export function useResizable({
  direction,
  size,
  minSize,
  maxSize,
  reverse = false,
  onResize,
}: UseResizableOptions) {
  const draggingRef = useRef(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  // Store all options in refs so event handlers never go stale
  const directionRef = useRef(direction);
  const minSizeRef = useRef(minSize);
  const maxSizeRef = useRef(maxSize);
  const reverseRef = useRef(reverse);
  const sizeRef = useRef(size);
  const onResizeRef = useRef(onResize);

  directionRef.current = direction;
  minSizeRef.current = minSize;
  maxSizeRef.current = maxSize;
  reverseRef.current = reverse;
  sizeRef.current = size;
  onResizeRef.current = onResize;

  // These handlers are stable (no deps) — they read everything from refs
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();

      const currentPos =
        directionRef.current === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      const newSize = reverseRef.current
        ? startSizeRef.current + delta
        : startSizeRef.current - delta;

      const clamped = Math.max(
        minSizeRef.current,
        Math.min(maxSizeRef.current, newSize)
      );
      onResizeRef.current(clamped);
    };

    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Remove overlay
      const overlay = document.getElementById('resize-overlay');
      if (overlay) overlay.remove();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []); // Mount once, never re-register

  // Stable mousedown handler — reads size from ref
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    startPosRef.current =
      directionRef.current === 'horizontal' ? e.clientX : e.clientY;
    startSizeRef.current = sizeRef.current;

    const cursor =
      directionRef.current === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';

    // Transparent overlay prevents iframes/xterm from stealing mouse events
    const overlay = document.createElement('div');
    overlay.id = 'resize-overlay';
    overlay.style.cssText = `position:fixed;inset:0;z-index:9999;cursor:${cursor}`;
    document.body.appendChild(overlay);
  }, []); // Stable — never changes

  return { handleMouseDown };
}
