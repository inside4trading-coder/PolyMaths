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
      {/* Video layer — softly blurred, dimmed, slightly scaled to hide edges */}
      <video
        src={authBgVideo}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover scale-110 opacity-40 blur-2xl saturate-75"
        style={{
          WebkitMaskImage:
            'radial-gradient(ellipse at center, rgba(0,0,0,1) 35%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0) 100%)',
          maskImage:
            'radial-gradient(ellipse at center, rgba(0,0,0,1) 35%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0) 100%)',
        }}
      />
      {/* Color tint to fuse with theme */}
      <div className="absolute inset-0 bg-background/60" />
      {/* Vignette to fade the corners completely into the bg */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, hsl(var(--background)) 95%)',
        }}
      />
    </div>
  );
};

export default AuthBackground;