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
          'radial-gradient(ellipse 80% 60% at 30% 35%, hsl(var(--primary) / 0.07), transparent 60%), radial-gradient(ellipse 60% 50% at 75% 65%, hsl(var(--primary) / 0.05), transparent 65%), hsl(var(--background))',
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

function isLowEndDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 3) return true;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return true;
  return false;
}

function shouldRender3D(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (isLowEndDevice()) return false;
  return supportsWebGL();
}

function isMobileViewport(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
}

export function HeroBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [quality, setQuality] = useState<'low' | 'high'>('high');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setEnabled(shouldRender3D());
    setQuality(isMobileViewport() ? 'low' : 'high');
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
          <OrderFlowScene active={visible} quality={quality} />
        </Suspense>
      )}
    </div>
  );
}
