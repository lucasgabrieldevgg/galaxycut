// GalaxyCut — renderização das miniaturas de demonstração (v9.3).
// Cada tile é um MINI-PROJETO (1 ou 2 clipes de imagem) desenhado pela
// drawFrame REAL — a mesma função da preview e da exportação. Nenhuma
// lógica de efeito/transição é duplicada aqui: se o motor muda, a
// miniatura muda junto (paridade por construção, não por teste).
// Também mora aqui o scheduler: UM único rAF para todos os tiles animados.
"use client";

import {
  AnimationComboType,
  AnimationInType,
  AnimationOutType,
  Clip,
  ClipEffect,
  EffectType,
  EFFECT_CATALOG,
  ProjectMeta,
  Track,
  TransitionType,
} from "./types";
import { drawFrame, RenderAssets } from "./render";
import { FX_DEMO_BASE, FX_DEMO_FILE, FxDemoPhoto } from "./fxDemo";

// ---------- fotos: um load por sessão, compartilhado por todos os tiles ----------

const photoCache = new Map<FxDemoPhoto, Promise<HTMLImageElement | null>>();

/** Carrega (uma vez) a foto de demonstração. Resolve null se falhar — o tile cai no visual CSS antigo. */
export function loadDemoPhoto(p: FxDemoPhoto): Promise<HTMLImageElement | null> {
  let prom = photoCache.get(p);
  if (!prom) {
    prom = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = FX_DEMO_BASE + FX_DEMO_FILE[p];
    });
    photoCache.set(p, prom);
  }
  return prom;
}

// ---------- mini-projeto de demonstração ----------

function demoTrack(): Track {
  return { id: "demo-v1", kind: "video", name: "V1", muted: true, hidden: false };
}

function demoProject(size: number): ProjectMeta {
  return { name: "fx-demo", width: size, height: size, fps: 30 };
}

function baseClip(id: string, start: number, duration: number): Clip {
  return {
    id,
    kind: "image",
    trackId: "demo-v1",
    start,
    duration,
    inPoint: 0,
    outPoint: duration,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    blur: 0,
    hue: 0,
    sepia: 0,
    grayscale: 0,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    volume: 0,
    muted: true,
    enhance: false,
  };
}

function assetsFor(byId: Record<string, HTMLImageElement | null>): RenderAssets {
  return {
    getElement: (id) => byId[id] ?? undefined,
    statusOf: (id) => (byId[id] ? "ok" : "missing"),
    progressOf: () => null,
  };
}

// ---------- efeitos ----------

/** Renderiza a foto com o efeito no instante t (o componente escolhe o t do ciclo). */
export function drawEffectFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  img: HTMLImageElement,
  type: EffectType,
  t: number
) {
  const meta = EFFECT_CATALOG.find((e) => e.type === type);
  const eff: ClipEffect = {
    id: "demo-fx",
    type,
    enabled: true,
    intensity: meta?.defaultIntensity ?? 1,
  };
  const clip = baseClip("demo", 0, 2.4);
  clip.effects = [eff];
  drawFrame(ctx, demoProject(size), [demoTrack()], [clip], t, assetsFor({ demo: img }));
}

/**
 * Frame ESTÁTICO de demonstração de um efeito. Efeitos temporais (glitch,
 * raio, vhs…) mudam com o tempo — renderizamos alguns instantes e ficamos
 * com aquele em que o efeito aparece mais PRESENTE (maior diferença em
 * pixels vs. a foto crua). Tudo num canvas pequeno, uma única vez por tile.
 */
export function drawEffectDemo(
  ctx: CanvasRenderingContext2D,
  size: number,
  img: HTMLImageElement,
  type: EffectType
) {
  const CANDIDATES = [0.15, 0.6, 1.1, 1.7];

  // baseline: a foto crua, sem efeito
  const bare = baseClip("demo", 0, 2.4);
  drawFrame(ctx, demoProject(size), [demoTrack()], [bare], 0.6, assetsFor({ demo: img }));

  let base: Uint8ClampedArray | null = null;
  try {
    base = ctx.getImageData(0, 0, size, size).data.slice();
  } catch {
    // canvas inacessível (não deveria: fotos são same-origin) — render direto
    drawEffectFrame(ctx, size, img, type, 0.9);
    return;
  }

  let bestT = CANDIDATES[1];
  let bestScore = -1;
  for (const t of CANDIDATES) {
    drawEffectFrame(ctx, size, img, type, t);
    let score = 0;
    try {
      const data = ctx.getImageData(0, 0, size, size).data;
      // amostra 1 em cada 4 pixels — suficiente pra comparar presença
      for (let i = 0; i < data.length; i += 16) {
        score += Math.abs(data[i] - base[i]) + Math.abs(data[i + 1] - base[i + 1]) + Math.abs(data[i + 2] - base[i + 2]);
      }
    } catch {
      return; // sem leitura de pixel: mantém o último render e sai
    }
    if (score > bestScore) {
      bestScore = score;
      bestT = t;
    }
  }
  drawEffectFrame(ctx, size, img, type, bestT);
}

// ---------- transições ----------

/**
 * Transição: clipe A (cena) encostado no clipe B (retrato) com transitionIn
 * do tipo pedido. p=0 segura em A, p=1 já é B sozinho — o componente cuida
 * do ciclo (segura → transiciona → segura).
 */
export function drawTransitionDemo(
  ctx: CanvasRenderingContext2D,
  size: number,
  imgA: HTMLImageElement,
  imgB: HTMLImageElement,
  type: TransitionType,
  p: number
) {
  const a = baseClip("a", 0, 1);
  const b = baseClip("b", 1, 1.6);
  b.transitionIn = { type, duration: 0.8 };
  const pp = Math.max(0, Math.min(1, p));
  const t = 1 + pp * 0.79; // janela da transição: [1.0, 1.8)
  drawFrame(ctx, demoProject(size), [demoTrack()], [a, b], t, assetsFor({ a: imgA, b: imgB }));
}

// ---------- animações (entrada / saída / combo) ----------

/** Anima a foto com a animação pedida no instante t da linha do tempo do clipe. */
export function drawAnimDemo(
  ctx: CanvasRenderingContext2D,
  size: number,
  img: HTMLImageElement,
  kind: "in" | "out" | "combo",
  type: AnimationInType | AnimationOutType | AnimationComboType,
  t: number
) {
  const dur = kind === "combo" ? 3 : 1.3;
  const clip = baseClip("demo", 0, dur);
  if (kind === "in") clip.animation = { inType: type as AnimationInType, inDuration: 0.55 };
  else if (kind === "out") clip.animation = { outType: type as AnimationOutType, outDuration: 0.55 };
  else clip.animation = { comboType: type as AnimationComboType, comboSpeed: 1 };
  const tt = Math.max(0, Math.min(dur, t));
  drawFrame(ctx, demoProject(size), [demoTrack()], [clip], tt, assetsFor({ demo: img }));
}

// ---------- scheduler: UM rAF para todos os tiles animados visíveis ----------

const tickers = new Set<(now: number) => void>();
let rafId = 0;

function loop(now: number) {
  rafId = 0;
  for (const fn of tickers) fn(now);
  if (tickers.size) rafId = requestAnimationFrame(loop);
}

export function addFxTicker(fn: (now: number) => void) {
  tickers.add(fn);
  if (!rafId) rafId = requestAnimationFrame(loop);
}

export function removeFxTicker(fn: (now: number) => void) {
  tickers.delete(fn);
}
