import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Below this the preview stops reading as the product and becomes texture. On
 * a phone the preview keeps this size and is cropped at its right edge
 * instead, the way a screenshot is cropped to fit one; from a small tablet up
 * it is shown whole.
 */
const MIN_SCALE = 0.34;

/**
 * Lays a preview out at a fixed desktop width and scales it to its frame, so
 * it keeps a desktop layout — and its proportions — at any frame size, like a
 * screenshot would. The frame takes the scaled height, so nothing overlaps.
 *
 * It is a picture of the product, not a working part of it: announced once by
 * its label, and closed to the keyboard and the pointer.
 */
export function ScaledPreview({ width, label, children }: { width: number; label: string; children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ scale: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;

    const measure = () => {
      const scale = Math.max(frame.clientWidth / width, MIN_SCALE);
      setBox({ scale, height: canvas.offsetHeight * scale });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={frameRef} className="pv-frame" role="img" aria-label={label} style={{ height: box?.height }}>
      <div
        ref={canvasRef}
        className="pv-canvas"
        aria-hidden="true"
        inert
        style={{ width, transform: `scale(${box?.scale ?? 1})`, visibility: box ? undefined : 'hidden' }}
      >
        {children}
      </div>
    </div>
  );
}
