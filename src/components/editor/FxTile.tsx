// GalaxyCut — quadradinho animado de demonstração (v9.1): efeitos visuais,
// transições e animações ganham uma prévia viva nos catálogos.
// 100% CSS (keyframes gcfx-* no globals.css): nada roda no rAF do editor e
// respeita prefers-reduced-motion. A classe de cada variante é derivada do
// próprio id do catálogo — não há lógica de áudio/vídeo aqui, só apresentação.
"use client";

export type FxTileKind = "effect" | "transition" | "animIn" | "animOut" | "animCombo";

const EFFECT_CLASS: Record<string, string> = {
  shake: "gcfx-shake",
  glitch: "gcfx-glitch",
  chromatic: "gcfx-chromatic",
  flash: "gcfx-flash",
  radialBlur: "gcfx-radialBlur",
  wave: "gcfx-wave",
  vhs: "gcfx-vhs",
  filmGrain: "gcfx-filmGrain",
  matrix: "gcfx-matrix",
  pixelate: "gcfx-pixelate",
  glow: "gcfx-glow",
  lightLeak: "gcfx-lightLeak",
  vignette: "gcfx-vignette",
  invert: "gcfx-invert",
  tealOrange: "gcfx-tealOrange",
  cyberpunk: "gcfx-cyberpunk",
  goldenHour: "gcfx-goldenHour",
  noir: "gcfx-noir",
  duotone: "gcfx-duotone",
  neonEdge: "gcfx-neonEdge",
  mirror: "gcfx-mirror",
  tiltShift: "gcfx-tiltShift",
  fisheye: "gcfx-fisheye",
  thermal: "gcfx-thermal",
  emboss: "gcfx-emboss",
  // v9.2 — Pessoas & Beleza
  skinSmooth: "gcfx-skinSmooth",
  beautyGlow: "gcfx-beautyGlow",
  manGrade: "gcfx-manGrade",
  womanGrade: "gcfx-womanGrade",
  kidPop: "gcfx-kidPop",
  clarity: "gcfx-clarity",
  // v9.2 — Clima & Impacto
  lightning: "gcfx-lightning",
  godRays: "gcfx-godRays",
  rain: "gcfx-rain",
  snowfall: "gcfx-snowfall",
  sciFiScan: "gcfx-sciFiScan",
  halftone: "gcfx-halftone",
};

/** animações de entrada/saída contínuas: o id do catálogo vira a classe */
const ANIM_CLASS: Record<string, string> = {
  // entrada
  zoomIn: "gcfx-a-zoomIn",
  zoomOut: "gcfx-a-zoomOut",
  slideLeft: "gcfx-a-slideLeft",
  slideRight: "gcfx-a-slideRight",
  slideUp: "gcfx-a-slideUp",
  slideDown: "gcfx-a-slideDown",
  spinIn: "gcfx-a-spinIn",
  bounceIn: "gcfx-a-bounceIn",
  fadeIn: "gcfx-a-fadeIn",
  wipeRight: "gcfx-a-wipeRight",
  dropIn: "gcfx-a-dropIn",
  popIn: "gcfx-a-popIn",
  blurIn: "gcfx-a-blurIn",
  shakeIn: "gcfx-a-shakeIn",
  flipInX: "gcfx-a-flipInX",
  flipInY: "gcfx-a-flipInY",
  typewriter: "gcfx-a-typewriter",
  // saída
  spinOut: "gcfx-a-spinOutExit",
  fadeOut: "gcfx-a-fadeOut",
  sinkDown: "gcfx-a-sinkDown",
  blurOut: "gcfx-a-blurOut",
  popOut: "gcfx-a-popOut",
  // (zoomOut/slide* de saída reutilizam as de entrada com curva de saída)
  // contínuas (combo)
  pulse: "gcfx-c-pulse",
  float: "gcfx-c-float",
  shake: "gcfx-c-shake",
  swing: "gcfx-c-swing",
  spin: "gcfx-c-spin",
  heartbeat: "gcfx-c-heartbeat",
  glitchHop: "gcfx-c-glitchHop",
  wave: "gcfx-c-wave",
  breathe: "gcfx-c-breathe",
  pendulum: "gcfx-c-pendulum",
};

export function FxTile({ kind, type, className = "" }: { kind: FxTileKind; type: string; className?: string }) {
  if (type === "none") {
    // "nenhuma": quadradinho estático dividido (transição) ou apagado (efeito)
    return (
      <div className={`gcfx-tile ${className}`} aria-hidden>
        {kind === "transition" ? (
          <>
            <div className="gcfx-a" style={{ inset: "10% 52% 10% 10%" }} />
            <div className="gcfx-b" style={{ inset: "10% 10% 10% 52%" }} />
          </>
        ) : (
          <div className="gcfx-chip" style={{ opacity: 0.25, animation: "none" }} />
        )}
      </div>
    );
  }

  if (kind === "transition") {
    return (
      <div className={`gcfx-tile ${className}`} aria-hidden>
        <div className="gcfx-a" />
        <div className={`gcfx-b gcfx-t-${type}`} />
      </div>
    );
  }

  const cls = kind === "effect" ? EFFECT_CLASS[type] : ANIM_CLASS[type] ?? (kind === "animOut" ? ANIM_CLASS[`exit-${type}`] : undefined);
  // animOut zoomOut/slideLeft/... reutilizam as classes de entrada (a curva de
  // saída já está embutida no keyframe homônimo quando existe diferença)
  const outAlias: Record<string, string> = {
    zoomOut: "gcfx-a-zoomOutExit",
    slideLeft: "gcfx-a-exitLeft",
    slideRight: "gcfx-a-exitRight",
    slideUp: "gcfx-a-exitUp",
    slideDown: "gcfx-a-exitDown",
  };
  const finalCls =
    cls ?? (kind === "animOut" ? outAlias[type] : undefined) ?? "gcfx-a-fadeIn";

  return (
    <div className={`gcfx-tile ${className}`} aria-hidden>
      <div className={`gcfx-chip ${finalCls}`} />
    </div>
  );
}
