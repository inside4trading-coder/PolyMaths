import { lazy, Suspense, useEffect, useRef, useState } from 'react';

const OrderFlowScene = lazy(() => import('./OrderFlowScene'));

// Static gradient matching the scene's average tone, so the lazy swap is imperceptible.
// Also the permanent background for reduced-motion / low-end devices.
function StaticFallback() {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 30% 35%, hsl(38 92% 50% / 0.07), transparent 60%), radial-gradient(ellipse 60% 50% at 75% 65%, hsl(38 70% 40% / 0.05), transparent 65%), hsl(228 20% 5%)',
      }}
    />
  );
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function shouldRender3D(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  // Low-end mobile: coarse pointer + narrow viewport gets the static fallback
  if (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768) return false;
  return supportsWebGL();
}

export function HeroBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setEnabled(shouldRender3D());
  }, []);

  // Pause the render loop when the hero scrolls out of view
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !enabled) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" aria-hidden>
      <StaticFallback />
      {enabled && (
        <Suspense fallback={null}>
          <OrderFlowScene active={visible} />
        </Suspense>
      )}
    </div>
  );
}
