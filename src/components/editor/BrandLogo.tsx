// GalaxyCut — a logo VERDADEIRA do app (a mesma do repo: public/logo.svg).
// Quadrado arredondado com a órbita da galáxia, planeta, estrelas e o play
// com contorno — usada no TopBar, na home e no onboarding. Nada de "raizinho".
"use client";

export function BrandLogo({ size = 32, glow = true }: { size?: number; glow?: boolean }) {
  // ids únicos por instância (2 logos na mesma tela não podem repetir id de gradiente)
  const uid = `gc${size}`;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[22.7%] border border-white/10"
      style={{
        width: size,
        height: size,
        boxShadow: glow ? "0 0 14px var(--gc-accent-glow)" : undefined,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 512 512" width={size} height={size}>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0e1430" />
            <stop offset="0.55" stopColor="#141b45" />
            <stop offset="1" stopColor="#221a55" />
          </linearGradient>
          <linearGradient id={`${uid}-play`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2ee56b" />
            <stop offset="1" stopColor="#0f9d56" />
          </linearGradient>
          <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="0.5" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#f0abfc" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.42" r="0.55">
            <stop offset="0" stopColor="#3ddc84" stopOpacity="0.32" />
            <stop offset="1" stopColor="#3ddc84" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* fundo + brilho */}
        <rect width="512" height="512" rx="116" fill={`url(#${uid}-bg)`} />
        <rect width="512" height="512" rx="116" fill={`url(#${uid}-glow)`} />

        {/* estrelas */}
        <g fill="#e2e8f0">
          <circle cx="92" cy="96" r="5" opacity="0.85" />
          <circle cx="150" cy="58" r="3" opacity="0.5" />
          <circle cx="428" cy="120" r="4" opacity="0.7" />
          <circle cx="466" cy="200" r="2.6" opacity="0.5" />
          <circle cx="70" cy="300" r="3" opacity="0.55" />
          <circle cx="120" cy="420" r="4" opacity="0.65" />
          <circle cx="452" cy="352" r="3.4" opacity="0.6" />
          <circle cx="392" cy="448" r="2.6" opacity="0.45" />
          <circle cx="256" cy="46" r="2.4" opacity="0.4" />
          <path d="M402 60l3.2 8.4 8.4 3.2-8.4 3.2-3.2 8.4-3.2-8.4-8.4-3.2 8.4-3.2z" fill="#fef9c3" opacity="0.9" />
          <path d="M86 176l2.2 5.8 5.8 2.2-5.8 2.2-2.2 5.8-2.2-5.8-5.8-2.2 5.8-2.2z" fill="#a5f3fc" opacity="0.7" />
        </g>

        {/* órbita da galáxia */}
        <g transform="rotate(-24 256 250)">
          <ellipse
            cx="256" cy="250" rx="196" ry="72"
            fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="14" strokeLinecap="round" opacity="0.92"
          />
        </g>

        {/* planeta na órbita */}
        <circle cx="392" cy="180" r="17" fill="#a78bfa" />
        <circle cx="392" cy="180" r="17" fill="none" stroke="#c4b5fd" strokeWidth="3" opacity="0.7" />

        {/* play */}
        <path d="M212 168 L344 250 L212 332 Z" fill={`url(#${uid}-play)`} stroke="#bbf7d0" strokeWidth="7" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
