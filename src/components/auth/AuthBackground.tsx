import authBgVideo from '@/assets/auth-bg.mp4';

/**
 * Subtle animated video background for the auth pages.
 * The video is heavily blurred, dimmed and masked with a radial gradient
 * so its edges blend seamlessly into the page background.
 */
const AuthBackground = () => {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      {/* Video layer — visible but softly blended */}
      <video
        src={authBgVideo}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover scale-105"
        style={{
          filter: 'blur(6px) saturate(110%) brightness(0.9)',
          opacity: 0.85,
          WebkitMaskImage:
            'radial-gradient(ellipse at center, rgba(0,0,0,1) 55%, rgba(0,0,0,0.7) 80%, rgba(0,0,0,0) 100%)',
          maskImage:
            'radial-gradient(ellipse at center, rgba(0,0,0,1) 55%, rgba(0,0,0,0.7) 80%, rgba(0,0,0,0) 100%)',
        }}
      />
      {/* Subtle theme tint — keeps video readable and brand-aligned */}
      <div className="absolute inset-0 bg-background/25" />
      {/* Edge vignette to fully fuse corners into the page bg */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, hsl(var(--background) / 0.85) 88%, hsl(var(--background)) 100%)',
        }}
      />
    </div>
  );
};

export default AuthBackground;