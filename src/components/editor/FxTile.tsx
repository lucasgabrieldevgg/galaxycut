// GalaxyCut — miniatura de demonstração dos catálogos (v9.3): efeitos, transições
// e animações rodam sobre FOTOS REAIS pela drawFrame — o quadradinho é literalmente
// o pipeline de preview/exportação (paridade total).
// Estratégia de robustez/performance:
// - enquanto a foto não chega (ou se falhar), mostra o quadradinho CSS antigo —
//   nada quebra no primeiro paint, offline, ou num asset perdido;
// - só desenha/ticka tile VISÍVEL (IntersectionObserver);
// - um ÚNICO rAF compartilhado anima todos os tiles (fxDemoRender), ~30fps no
//   tilezinho; efeitos de grade de cor são frame fixo (não precisam de movimento);
// - prefers-reduced-motion → frame estático.
"use client";

import { useEffect, useRef, useState } from "react";
import {
  addFxTicker,
  drawAnimDemo,
  drawEffectDemo,
  drawEffectFrame,
  drawTransitionDemo,
  loadDemoPhoto,
  removeFxTicker,
} from "@/lib/editor/fxDemoRender";
import {
  effectAnimates,
  FX_ANIM_PHOTO,
  FX_TRANSITION_PHOTOS,
  photoForEffect,
  FxDemoPhoto,
} from "@/lib/editor/fxDemo";
import type {
  AnimationComboType,
  AnimationInType,
  AnimationOutType,
  EffectType,
  TransitionType,
} from "@/lib/editor/types";

export type FxTileKind = "effect" | "transition" | "animIn" | "animOut" | "animCombo";
export type FxTileSize = "sm" | "md" | "lg";

/** resolução interna do canvas — nítido até ~58px CSS em telas 2x */
const RES = 128;

// ---------------- fallback CSS (o visual antigo de v9.1, intacto) ----------------

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

const OUT_ALIAS: Record<string, string> = {
  zoomOut: "gcfx-a-zoomOutExit",
  slideLeft: "gcfx-a-exitLeft",
  slideRight: "gcfx-a-exitRight",
  slideUp: "gcfx-a-exitUp",
  slideDown: "gcfx-a-exitDown",
};

/** o visual CSS antigo, como fallback enquanto a foto não chega (ou se falhar) */
function CssFallback({ kind, type }: { kind: FxTileKind; type: string }) {
  if (type === "none") {
    return (
      <>
        {kind === "transition" ? (
          <>
            <div className="gcfx-a" style={{ inset: "10% 52% 10% 10%" }} />
            <div className="gcfx-b" style={{ inset: "10% 10% 10% 52%" }} />
          </>
        ) : (
          <div className="gcfx-chip" style={{ opacity: 0.25, animation: "none" }} />
        )}
      </>
    );
  }
  if (kind === "transition") {
    return (
      <>
        <div className="gcfx-a" />
        <div className={`gcfx-b gcfx-t-${type}`} />
      </>
    );
  }
  const cls = kind === "effect" ? EFFECT_CLASS[type] : ANIM_CLASS[type] ?? (kind === "animOut" ? ANIM_CLASS[`exit-${type}`] : undefined);
  const finalCls =
    cls ?? (kind === "animOut" ? OUT_ALIAS[type] : undefined) ?? "gcfx-a-fadeIn";
  return <div className={`gcfx-chip ${finalCls}`} />;
}

// ---------------- componente ----------------

export function FxTile({
  kind,
  type,
  className = "",
  size = "sm",
}: {
  kind: FxTileKind;
  type: string;
  className?: string;
  size?: FxTileSize;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** null = foto indisponível (fallback CSS permanente); undefined = carregando */
  const [imgs, setImgs] = useState<HTMLImageElement[] | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  const sizeCls = size === "md" ? " gcfx-tile--md" : size === "lg" ? " gcfx-tile--lg" : "";
  const isNone = type === "none";

  // 1) carrega a(s) foto(s) certa(s) para este tile
  useEffect(() => {
    if (isNone) return;
    let alive = true;
    const wanted: FxDemoPhoto[] =
      kind === "effect"
        ? [photoForEffect(type as EffectType)]
        : kind === "transition"
          ? [...FX_TRANSITION_PHOTOS]
          : [FX_ANIM_PHOTO];
    Promise.all(wanted.map(loadDemoPhoto)).then((els) => {
      if (!alive) return;
      setImgs(els.every(Boolean) ? (els as HTMLImageElement[]) : null);
    });
    return () => {
      alive = false;
    };
  }, [kind, type, isNone]);

  // 2) visibilidade — só desenha/anima quem está (ou quase) na tela
  useEffect(() => {
    if (isNone) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // sem IO (navegador velho): assume visível no próximo frame (setState async)
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isNone]);

  // 3) desenha (estático) ou anima (rAF compartilhado)
  useEffect(() => {
    if (isNone || !imgs || !imgs.length || !visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const reduced =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const markReady = () => setReady(true);

    // --- frames estáticos por tipo ---
    const drawStatic = () => {
      if (kind === "effect") {
        drawEffectDemo(ctx, RES, imgs[0], type as EffectType);
      } else if (kind === "transition") {
        drawTransitionDemo(ctx, RES, imgs[0], imgs[1], type as TransitionType, 0.5);
      } else if (kind === "animIn") {
        drawAnimDemo(ctx, RES, imgs[0], "in", type as AnimationInType, 0.32);
      } else if (kind === "animOut") {
        drawAnimDemo(ctx, RES, imgs[0], "out", type as AnimationOutType, 1.02);
      } else {
        drawAnimDemo(ctx, RES, imgs[0], "combo", type as AnimationComboType, 0.9);
      }
    };

    const animates =
      !reduced &&
      (kind === "transition" ||
        kind === "animIn" ||
        kind === "animOut" ||
        kind === "animCombo" ||
        (kind === "effect" && effectAnimates(type as EffectType)));

    if (!animates) {
      // frame fixo no próximo frame de render (nunca setState síncrono no effect)
      const id = requestAnimationFrame(() => {
        drawStatic();
        markReady();
      });
      return () => cancelAnimationFrame(id);
    }

    // --- ciclo animado (30fps no tilezinho; um rAF pra todos) ---
    let last = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (now - last < 33) return;
      last = now;
      const el = (now - t0) / 1000;
      if (kind === "effect") {
        // efeitos temporais: 2.4s de clipe em loop
        drawEffectFrame(ctx, RES, imgs[0], type as EffectType, el % 2.4);
      } else if (kind === "transition") {
        // segura A (0.45s) → transiciona (1.0s) → segura B (0.45s)
        const c = el % 1.9;
        const p = c < 0.45 ? 0 : c < 1.45 ? (c - 0.45) / 1.0 : 1;
        drawTransitionDemo(ctx, RES, imgs[0], imgs[1], type as TransitionType, p);
      } else if (kind === "animIn") {
        // entra (0.55s) → segura (1.05s) → repete
        const c = el % 1.6;
        drawAnimDemo(ctx, RES, imgs[0], "in", type as AnimationInType, c < 0.55 ? c : 0.85);
      } else if (kind === "animOut") {
        // segura (0.5s) → sai (0.75s) → vazio (0.65s) → repete
        const c = el % 1.9;
        const t = c < 0.5 ? 0.35 : c < 1.25 ? 0.75 + ((c - 0.5) / 0.75) * 0.55 : 1.3;
        drawAnimDemo(ctx, RES, imgs[0], "out", type as AnimationOutType, t);
      } else {
        // combo: período completo em loop
        drawAnimDemo(ctx, RES, imgs[0], "combo", type as AnimationComboType, el % 3);
      }
      markReady();
    };

    addFxTicker(tick);
    return () => removeFxTicker(tick);
  }, [imgs, visible, kind, type, isNone]);

  if (isNone) {
    // "nenhuma": quadradinho estático dividido (transição) ou apagado (efeito)
    return (
      <div className={`gcfx-tile${sizeCls} ${className}`} aria-hidden>
        <CssFallback kind={kind} type={type} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`gcfx-tile${sizeCls} ${className}`} aria-hidden>
      {!ready && <CssFallback kind={kind} type={type} />}
      {imgs && <canvas ref={canvasRef} width={RES} height={RES} className="gcfx-photo" />}
    </div>
  );
}
