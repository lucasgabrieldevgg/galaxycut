// GalaxyCut — a logo do app (redondinha, com o play galáxia).
// Usada no TopBar, na home e no onboarding — nunca mais o "raizinho".
"use client";

export function BrandLogo({ size = 32, glow = true }: { size?: number; glow?: boolean }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10"
      style={{
        width: size,
        height: size,
        boxShadow: glow ? "0 0 14px var(--gc-accent-glow)" : undefined,
        background: "linear-gradient(135deg, #0e1430 0%, #141b45 55%, #221a55 100%)",
      }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={size * 0.62} height={size * 0.62}>
        <defs>
          <linearGradient id="gcp" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--gc-accent-hover)" />
            <stop offset="1" stopColor="var(--gc-accent-deep)" />
          </linearGradient>
        </defs>
        <path d="M25 16 L49 32 L25 48 Z" fill="url(#gcp)" />
      </svg>
      {/* brilho de galáxia no cantinho */}
      <span
        className="absolute rounded-full"
        style={{
          width: size * 0.16,
          height: size * 0.16,
          top: size * 0.14,
          left: size * 0.18,
          background: "var(--gc-accent)",
          opacity: 0.9,
          filter: "blur(0.5px)",
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          width: size * 0.08,
          height: size * 0.08,
          top: size * 0.34,
          left: size * 0.1,
          background: "#e2e8f0",
          opacity: 0.8,
        }}
      />
    </span>
  );
}
