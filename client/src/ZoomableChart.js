import React, { useRef, useState, useCallback } from 'react';

/**
 * Wraps a Recharts <ResponsiveContainer> and enables pinch-to-zoom on mobile.
 * Usage:  <ZoomableChart> <ResponsiveContainer ...> ... </ResponsiveContainer> </ZoomableChart>
 */
export default function ZoomableChart({ children, style }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState('50% 50%');
  const initialDist = useRef(null);
  const initialScale = useRef(1);

  const dist = (t1, t2) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const midpoint = (t1, t2, rect) => {
    const mx = (t1.clientX + t2.clientX) / 2 - rect.left;
    const my = (t1.clientY + t2.clientY) / 2 - rect.top;
    const px = (mx / rect.width) * 100;
    const py = (my / rect.height) * 100;
    return `${px}% ${py}%`;
  };

  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      initialDist.current = dist(e.touches[0], e.touches[1]);
      initialScale.current = scale;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setOrigin(midpoint(e.touches[0], e.touches[1], rect));
    }
  }, [scale]);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && initialDist.current) {
      e.preventDefault();
      const d = dist(e.touches[0], e.touches[1]);
      const newScale = Math.min(Math.max(initialScale.current * (d / initialDist.current), 1), 5);
      setScale(newScale);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    initialDist.current = null;
  }, []);

  const onDoubleClick = useCallback(() => {
    setScale(1);
    setOrigin('50% 50%');
  }, []);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onDoubleClick={onDoubleClick}
      style={{
        touchAction: scale > 1 ? 'none' : 'pan-y',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{
        transform: `scale(${scale})`,
        transformOrigin: origin,
        transition: initialDist.current ? 'none' : 'transform 0.2s ease-out',
      }}>
        {children}
      </div>
    </div>
  );
}
