// GaláxiaCut — renderização de frame no canvas (preview e exportação usam a mesma função)
"use client";

import {
  Clip,
  Track,
  ProjectMeta,
  TextProps,
  TransitionType,
  clipEnd,
  fadeEnvelope,
  evaluateClipState,
  EvaluatedTransform,
  easeOutBack,
} from "./types";
import { registry } from "./media";
import { estimateWords } from "./subtitles";
import { useSettings } from "./settings";
import { accentById } from "./theme";
import { t } from "./i18n";

export type MediaStatus = "ok" | "loading" | "missing" | "error";

export interface RenderAssets {
  getElement: (clipId: string) => HTMLVideoElement | HTMLAudioElement | HTMLImageElement | undefined;
  /** v5: estado da mídia do clipe — placeholder honesto em vez de "mídia não carregada" eterno */
  statusOf?: (clipId: string) => MediaStatus;
  /** v7: quanto do arquivo já carregou (0..1) — o placeholder mostra a % */
  progressOf?: (clipId: string) => number | null;
}

/** opções extras de camada (usadas pelas transições) */
interface LayerOpts {
  alpha: number;
  dx?: number; // deslocamento px no espaço do projeto
  dy?: number;
  scaleMul?: number;
  blurPx?: number;
}

const IDENTITY: LayerOpts = { alpha: 1 };

/**
 * Desenha o frame no tempo `t` no espaço do projeto (ctx já escalado para width×height).
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  project: ProjectMeta,
  tracks: Track[],
  clips: Clip[],
  t: number,
  assets: RenderAssets
) {
  const W = project.width;
  const H = project.height;
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(-2, -2, W + 4, H + 4);
  ctx.restore();

  // vídeo: de baixo para cima (V1 base → V2 → V3), texto por cima
  const videoTracks = tracks.filter((tr) => tr.kind === "video").slice().reverse(); // V1 primeiro
  for (const tr of videoTracks) {
    if (tr.hidden) continue;
    const c = clips.find((x) => x.trackId === tr.id && x.start <= t + 0.0001 && x.start + x.duration > t - 0.0001 && (x.kind === "video" || x.kind === "image"));
    if (!c || c.videoHidden) continue; // trecho "só áudio" (detector de silêncio) → tela preta
    drawVisualClip(ctx, W, H, clips, c, t, assets);
  }

  // texto
  const textTrack = tracks.find((tr) => tr.kind === "text");
  if (textTrack && !textTrack.hidden) {
    const raw = clips.find((x) => x.trackId === textTrack.id && x.start <= t + 0.0001 && x.start + x.duration > t - 0.0001 && x.kind === "text");
    if (raw?.text) {
      // posição efetiva: legenda sem "posição própria" segue a posição global de todas
      const c = effectiveCaptionPos(raw);
      const trans = activeTransition(c, clips, t);
      if (trans) {
        const prevRaw = prevClip(clips, c);
        const prev = prevRaw ? effectiveCaptionPos(prevRaw) : null;
        drawTextTransition(ctx, W, H, c, prev, trans.p, trans.type, t);
      } else {
        drawTextLayer(ctx, W, H, c, t, { alpha: c.opacity * fadeEnvelope(c, t) });
      }
    }
  }
}

/** Legenda (gerada pelo whisper) sem trava: segue a posição global de todas. */
function effectiveCaptionPos(c: Clip): Clip {
  if (!c.isCaption || c.posLock) return c;
  const { captionPos } = useSettings.getState();
  if (!captionPos) return c;
  if (Math.abs(captionPos.x - c.x) < 0.0001 && Math.abs(captionPos.y - c.y) < 0.0001) return c;
  return { ...c, x: captionPos.x, y: captionPos.y };
}

// ---------- transições ----------
function activeTransition(c: Clip, clips: Clip[], t: number): { type: TransitionType; p: number; duration: number } | null {
  const tr = c.transitionIn;
  if (!tr || tr.type === "none" || tr.duration <= 0) return null;
  if (t >= c.start + tr.duration) return null;
  return { type: tr.type, p: Math.max(0, Math.min(1, (t - c.start) / tr.duration)), duration: tr.duration };
}

/** clipe anterior da mesma faixa que encosta na entrada deste */
function prevClip(clips: Clip[], c: Clip): Clip | null {
  let best: Clip | null = null;
  for (const o of clips) {
    if (o.id === c.id || o.trackId !== c.trackId) continue;
    if (o.start >= c.start) continue;
    if (clipEnd(o) <= c.start + 0.35) {
      if (!best || clipEnd(o) > clipEnd(best)) best = o;
    }
  }
  return best;
}

function drawVisualClip(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  clips: Clip[],
  c: Clip,
  t: number,
  assets: RenderAssets
) {
  const trans = activeTransition(c, clips, t);
  if (!trans) {
    drawMediaLayer(ctx, W, H, c, t, assets, { alpha: 1 });
    return;
  }
  const prev = prevClip(clips, c);
  const p = trans.p;
  const type = trans.type;
  const cur = (o: Partial<LayerOpts>) => drawMediaLayer(ctx, W, H, c, t, assets, { ...IDENTITY, alpha: 1, ...o });
  const old = (o: Partial<LayerOpts>) => {
    if (!prev) return;
    drawMediaLayer(ctx, W, H, prev, t, assets, { ...IDENTITY, alpha: 1, ...o });
  };

  switch (type) {
    case "fade": {
      // passando pelo preto
      if (p < 0.5) old({ alpha: 1 - p * 2 });
      else cur({ alpha: (p - 0.5) * 2 });
      break;
    }
    case "dissolve": {
      old({ alpha: 1 - p });
      cur({ alpha: p });
      break;
    }
    case "slideLeft": {
      old({ dx: -p * W * 0.3 });
      cur({ dx: (1 - p) * W });
      break;
    }
    case "slideRight": {
      old({ dx: p * W * 0.3 });
      cur({ dx: -(1 - p) * W });
      break;
    }
    case "wipeLeft": {
      old({});
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, p * W, H);
      ctx.clip();
      cur({});
      ctx.restore();
      break;
    }
    case "wipeRight": {
      old({});
      ctx.save();
      ctx.beginPath();
      ctx.rect((1 - p) * W, 0, p * W, H);
      ctx.clip();
      cur({});
      ctx.restore();
      break;
    }
    case "zoom": {
      old({ alpha: 1 - p });
      cur({ alpha: p, scaleMul: 1.35 - 0.35 * p });
      break;
    }
    case "flash": {
      old({ alpha: 1 - p });
      cur({ alpha: p });
      ctx.save();
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    }
    case "blurIn": {
      old({ alpha: 1 - p });
      cur({ alpha: p, blurPx: (1 - p) * (H * 0.03) });
      break;
    }
    default:
      cur({});
  }
}

function drawableSize(el: HTMLVideoElement | HTMLAudioElement | HTMLImageElement | undefined): { el: CanvasImageSource; sw: number; sh: number } | null {
  if (!el) return null;
  if (el instanceof HTMLVideoElement) {
    if ((el.readyState >= 1 || el.videoWidth > 0) && el.videoWidth > 0 && el.videoHeight > 0) {
      return { el, sw: el.videoWidth, sh: el.videoHeight };
    }
  } else if (el instanceof HTMLImageElement) {
    if (el.complete && el.naturalWidth > 0) return { el, sw: el.naturalWidth, sh: el.naturalHeight };
  }
  return null;
}

function buildEvaluatedFilter(st: EvaluatedTransform, H: number, extraBlurPx?: number): string {
  const parts: string[] = [];
  if (st.brightness !== 1) parts.push(`brightness(${st.brightness})`);
  if (st.contrast !== 1) parts.push(`contrast(${st.contrast})`);
  if (st.saturation !== 1) parts.push(`saturate(${st.saturation})`);
  const totalBlur = (st.blur || 0) + (st.extraBlur || 0);
  if (totalBlur > 0) parts.push(`blur(${(totalBlur * H) / 1080}px)`);
  if (extraBlurPx && extraBlurPx > 0.5) parts.push(`blur(${extraBlurPx}px)`);
  if (st.hue !== 0) parts.push(`hue-rotate(${st.hue}deg)`);
  if (st.sepia > 0) parts.push(`sepia(${st.sepia})`);
  if (st.grayscale > 0) parts.push(`grayscale(${st.grayscale})`);
  return parts.length ? parts.join(" ") : "none";
}

let offscreenPixelCanvas: HTMLCanvasElement | null = null;
function getPixelCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!offscreenPixelCanvas) {
    offscreenPixelCanvas = document.createElement("canvas");
  }
  if (offscreenPixelCanvas.width !== w || offscreenPixelCanvas.height !== h) {
    offscreenPixelCanvas.width = Math.max(1, w);
    offscreenPixelCanvas.height = Math.max(1, h);
  }
  return offscreenPixelCanvas;
}

function applyPostEffects(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  c: Clip,
  t: number,
  d: { el: CanvasImageSource; sw: number; sh: number } | null,
  dw: number,
  dh: number,
  st: EvaluatedTransform
) {
  const tRel = Math.max(0, t - c.start);
  const effects = (c.effects || []).filter((e) => e.enabled);

  // Flash de impacto / batida
  if (st.flashAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = st.flashAlpha;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  for (const eff of effects) {
    const effStart = eff.start ?? 0;
    const effDur = eff.duration != null ? eff.duration : (c.duration - effStart);
    if (tRel < effStart || tRel > effStart + effDur) continue;

    const intensity = eff.intensity ?? 1;
    const spd = eff.speed ?? 1;

    switch (eff.type) {
      case "chromatic": {
        if (!d) break;
        const shift = Math.max(2, (H * 0.012) * intensity);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.65 * intensity;
        try {
          ctx.drawImage(d.el, -dw / 2 - shift, -dh / 2, dw, dh);
          ctx.drawImage(d.el, -dw / 2 + shift, -dh / 2, dw, dh);
        } catch {}
        ctx.restore();
        break;
      }
      case "glitch": {
        if (!d) break;
        const numSlices = Math.floor(4 * intensity) + 2;
        const seed = Math.floor(tRel * spd * 14);
        ctx.save();
        for (let i = 0; i < numSlices; i++) {
          const rand1 = Math.sin(seed * 37 + i * 19);
          if (rand1 > 0.15) {
            const sliceY = (Math.sin(seed * 23 + i * 11) * 0.5 + 0.5) * dh;
            const sliceH = ((Math.cos(seed * 41 + i * 17) * 0.5 + 0.5) * 0.14 + 0.04) * dh;
            const offset = Math.sin(seed * 53 + i * 7) * (W * 0.04) * intensity;
            const sy = (sliceY / dh) * d.sh;
            const sh = (sliceH / dh) * d.sh;
            try {
              ctx.drawImage(d.el, 0, Math.max(0, sy), d.sw, Math.min(d.sh, sh), -dw / 2 + offset, -dh / 2 + sliceY, dw, sliceH);
            } catch {}
          }
        }
        ctx.restore();
        break;
      }
      case "vhs": {
        ctx.save();
        // Scanlines horizontais
        ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
        const gap = Math.max(2, Math.round(H / 220));
        for (let y = -dh / 2; y < dh / 2; y += gap * 2) {
          ctx.fillRect(-dw / 2, y, dw, gap);
        }
        // Faixa de tracking analógico
        const scanY = -dh / 2 + (((tRel * spd * 140) % (dh + 60)) - 30);
        ctx.fillStyle = "rgba(0, 255, 230, 0.08)";
        ctx.fillRect(-dw / 2, scanY, dw, gap * 6);
        ctx.fillStyle = "rgba(255, 0, 100, 0.06)";
        ctx.fillRect(-dw / 2, scanY + gap * 3, dw, gap * 4);
        ctx.restore();
        break;
      }
      case "glow": {
        if (!d) break;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = `blur(${Math.max(4, Math.round(H * 0.02 * intensity))}px) brightness(1.35)`;
        ctx.globalAlpha = 0.55 * intensity;
        try {
          ctx.drawImage(d.el, -dw / 2, -dh / 2, dw, dh);
        } catch {}
        ctx.restore();
        break;
      }
      case "vignette": {
        ctx.save();
        const rad = Math.max(dw, dh) * 0.68;
        const grad = ctx.createRadialGradient(0, 0, rad * 0.25, 0, 0, rad);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.7, `rgba(0,0,0,${0.35 * intensity})`);
        grad.addColorStop(1, `rgba(0,0,0,${0.9 * intensity})`);
        ctx.fillStyle = grad;
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        break;
      }
      case "radialBlur": {
        if (!d) break;
        ctx.save();
        ctx.globalAlpha = 0.25 * intensity;
        for (let step = 1; step <= 3; step++) {
          const zoom = 1 + step * 0.035 * intensity;
          const zw = dw * zoom;
          const zh = dh * zoom;
          try {
            ctx.drawImage(d.el, -zw / 2, -zh / 2, zw, zh);
          } catch {}
        }
        ctx.restore();
        break;
      }
      case "pixelate":
      case "fisheye": {
        // Renderizado diretamente na camada base (drawMediaLayer) para não sobrepor o original
        break;
      }
      case "thermal": {
        if (!d) break;
        ctx.save();
        ctx.globalCompositeOperation = "difference";
        ctx.globalAlpha = 0.85 * intensity;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);

        ctx.globalCompositeOperation = "color-dodge";
        ctx.globalAlpha = 0.9 * intensity;
        const tGrad = ctx.createLinearGradient(-dw / 2, -dh / 2, dw / 2, dh / 2);
        tGrad.addColorStop(0.0, "#0000ff");
        tGrad.addColorStop(0.25, "#00ffff");
        tGrad.addColorStop(0.5, "#00ff00");
        tGrad.addColorStop(0.75, "#ffff00");
        tGrad.addColorStop(1.0, "#ff0044");
        ctx.fillStyle = tGrad;
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);

        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.4 * intensity;
        try {
          ctx.drawImage(d.el, -dw / 2, -dh / 2, dw, dh);
        } catch {}
        ctx.restore();
        break;
      }
      case "lightLeak": {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const phase = (tRel * spd * 0.35) % 1;
        const lx = Math.sin(phase * Math.PI * 2) * dw * 0.35;
        const ly = Math.cos(phase * Math.PI * 2) * dh * 0.35;
        const leakRad = Math.max(dw, dh) * 0.65;
        const leakGrad = ctx.createRadialGradient(lx, ly, 10, lx, ly, leakRad);
        leakGrad.addColorStop(0, `rgba(255, 200, 60, ${0.75 * intensity})`);
        leakGrad.addColorStop(0.4, `rgba(255, 80, 100, ${0.4 * intensity})`);
        leakGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = leakGrad;
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        break;
      }
      case "filmGrain": {
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = 0.45 * intensity;
        const seed = Math.floor(tRel * 24);
        const grainCount = Math.floor(800 * intensity);
        for (let i = 0; i < grainCount; i++) {
          const rx = (Math.sin(seed * 197.3 + i * 47.9) * 43758.5453) % 1;
          const ry = (Math.cos(seed * 113.7 + i * 61.3) * 23421.6312) % 1;
          const gx = ((rx >= 0 ? rx : -rx) - 0.5) * dw;
          const gy = ((ry >= 0 ? ry : -ry) - 0.5) * dh;
          const sz = (Math.sin(i * 17.1) * 0.5 + 0.5) * 2.2 + 1;
          const isBright = i % 3 === 0;
          ctx.fillStyle = isBright ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.65)";
          ctx.fillRect(gx, gy, sz, sz);
        }
        ctx.restore();
        break;
      }
      case "tealOrange": {
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = 0.45 * intensity;
        const toGrad = ctx.createLinearGradient(-dw / 2, -dh / 2, dw / 2, dh / 2);
        toGrad.addColorStop(0, "#0d9488"); // Teal
        toGrad.addColorStop(1, "#f97316"); // Orange
        ctx.fillStyle = toGrad;
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        break;
      }
      case "cyberpunk": {
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = 0.5 * intensity;
        const cpGrad = ctx.createLinearGradient(-dw / 2, dh / 2, dw / 2, -dh / 2);
        cpGrad.addColorStop(0, "#06b6d4"); // Cyan
        cpGrad.addColorStop(1, "#ec4899"); // Magenta
        ctx.fillStyle = cpGrad;
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        break;
      }
      case "goldenHour": {
        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        ctx.globalAlpha = 0.6 * intensity;
        ctx.fillStyle = "#f59e0b"; // Dourado âmbar
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        break;
      }
      case "matrix": {
        ctx.save();
        ctx.globalCompositeOperation = "color";
        ctx.globalAlpha = 0.7 * intensity;
        ctx.fillStyle = "#22c55e"; // Verde Matrix
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
        const gap = Math.max(3, Math.round(H / 180));
        for (let y = -dh / 2; y < dh / 2; y += gap * 3) {
          ctx.fillRect(-dw / 2, y, dw, gap);
        }
        ctx.restore();
        break;
      }
      case "noir": {
        ctx.save();
        ctx.globalCompositeOperation = "color";
        ctx.fillStyle = "#808080";
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = 0.35 * intensity;
        ctx.fillStyle = "#000000";
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        break;
      }
      case "invert": {
        ctx.save();
        ctx.globalCompositeOperation = "difference";
        ctx.globalAlpha = intensity;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        break;
      }
      case "duotone": {
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = 0.5 * intensity;
        ctx.fillStyle = "#3b82f6";
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.4 * intensity;
        ctx.fillStyle = "#f43f5e";
        ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
        ctx.restore();
        break;
      }
      case "mirror": {
        if (!d) break;
        ctx.save();
        ctx.scale(-1, 1);
        ctx.globalAlpha = 0.45 * intensity;
        try {
          ctx.drawImage(d.el, -dw / 2, -dh / 2, dw, dh);
        } catch {}
        ctx.restore();
        break;
      }
      case "tiltShift": {
        ctx.save();
        const blurBandH = dh * 0.28 * intensity;
        ctx.fillStyle = "rgba(0,0,0,0.01)";
        ctx.filter = `blur(${Math.round(H * 0.015 * intensity)}px)`;
        if (d) {
          try {
            ctx.drawImage(d.el, 0, 0, d.sw, d.sh * 0.3, -dw / 2, -dh / 2, dw, blurBandH);
            ctx.drawImage(d.el, 0, d.sh * 0.7, d.sw, d.sh * 0.3, -dw / 2, dh / 2 - blurBandH, dw, blurBandH);
          } catch {}
        }
        ctx.restore();
        break;
      }
      case "neonEdge": {
        if (!d) break;
        ctx.save();
        ctx.globalCompositeOperation = "difference";
        ctx.globalAlpha = 0.8 * intensity;
        const shift = Math.max(1, (H * 0.003) * intensity);
        try {
          ctx.drawImage(d.el, -dw / 2 - shift, -dh / 2 - shift, dw, dh);
          ctx.globalCompositeOperation = "screen";
          ctx.filter = "hue-rotate(180deg) saturate(3)";
          ctx.drawImage(d.el, -dw / 2 + shift, -dh / 2 + shift, dw, dh);
        } catch {}
        ctx.restore();
        break;
      }
      case "wave": {
        if (!d) break;
        const waveSlices = 12;
        const sliceH = dh / waveSlices;
        const srcSliceH = d.sh / waveSlices;
        ctx.save();
        for (let i = 0; i < waveSlices; i++) {
          const wOff = Math.sin((tRel * spd * 6) + (i * 0.7)) * (W * 0.02) * intensity;
          try {
            ctx.drawImage(d.el, 0, i * srcSliceH, d.sw, srcSliceH, -dw / 2 + wOff, -dh / 2 + i * sliceH, dw, sliceH);
          } catch {}
        }
        ctx.restore();
        break;
      }
      case "emboss": {
        if (!d) break;
        ctx.save();
        ctx.globalCompositeOperation = "difference";
        ctx.globalAlpha = 0.7 * intensity;
        const shift = Math.max(1, (H * 0.002) * intensity);
        try {
          ctx.drawImage(d.el, -dw / 2 - shift, -dh / 2 - shift, dw, dh);
        } catch {}
        ctx.restore();
        break;
      }
      default:
        break;
    }
  }
}

function drawMediaLayer(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  c: Clip,
  t: number,
  assets: RenderAssets,
  opts: LayerOpts
) {
  const d = drawableSize(assets.getElement(c.id));
  if (!d) {
    if (opts.alpha >= 0.999) {
      const st = assets.statusOf?.(c.id) ?? (c.mediaId ? "loading" : "missing");
      const eff: MediaStatus = st === "ok" ? "loading" : st;
      drawPlaceholder(ctx, W, H, c, eff, assets.progressOf?.(c.id) ?? null);
    }
    return;
  }

  // Avaliação unificada de Keyframes, Animações e Efeitos
  const st = evaluateClipState(c, t);
  const fade = fadeEnvelope(c, t);
  const effAlpha = Math.max(0, Math.min(1, opts.alpha * st.opacity * st.extraAlpha * fade));

  const base = Math.min(W / d.sw, H / d.sh);
  const k = base * st.scale * (opts.scaleMul ?? 1) * st.extraScale;
  const dw = d.sw * k;
  const dh = d.sh * k;

  const effX = st.x + st.extraDx + st.shakeOffsetX + ((opts.dx ?? 0) * 2 / W);
  const effY = st.y + st.extraDy + st.shakeOffsetY + ((opts.dy ?? 0) * 2 / H);
  const cx = W / 2 + (effX * W) / 2;
  const cy = H / 2 + (effY * H) / 2;
  const rot = st.rotation + st.extraRot + st.shakeRot;

  ctx.save();
  ctx.globalAlpha = effAlpha;
  ctx.filter = buildEvaluatedFilter(st, H, opts.blurPx);
  ctx.translate(cx, cy);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  if (st.extraScaleX !== 1 || st.extraScaleY !== 1) {
    ctx.scale(st.extraScaleX ?? 1, st.extraScaleY ?? 1);
  }

  try {
    const tRel = Math.max(0, t - c.start);
    const activeEffects = (c.effects || []).filter((e) => {
      if (!e.enabled) return false;
      const s = e.start ?? 0;
      const dur = e.duration != null ? e.duration : (c.duration - s);
      return tRel >= s && tRel <= s + dur;
    });

    const hasPixelate = activeEffects.find((e) => e.type === "pixelate");
    const hasFisheye = activeEffects.find((e) => e.type === "fisheye");

    if (hasPixelate) {
      const intensity = hasPixelate.intensity ?? 1;
      const pixelSize = Math.max(3, Math.round(24 * intensity));
      const offW = Math.max(2, Math.floor(dw / pixelSize));
      const offH = Math.max(2, Math.floor(dh / pixelSize));
      const pCan = getPixelCanvas(offW, offH);
      if (pCan) {
        const pCtx = pCan.getContext("2d");
        if (pCtx) {
          pCtx.imageSmoothingEnabled = false;
          pCtx.drawImage(d.el, 0, 0, offW, offH);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(pCan, -dw / 2, -dh / 2, dw, dh);
        }
      }
    } else if (hasFisheye) {
      const intensity = hasFisheye.intensity ?? 1;
      const rings = 16;
      const maxR = Math.hypot(dw, dh) * 0.55;
      for (let r = rings; r >= 1; r--) {
        const norm = r / rings;
        const distNorm = Math.pow(norm, 1 + 1.1 * intensity);
        const radius = norm * maxR;
        const srcRadius = distNorm * maxR;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.clip();
        const zoom = radius / Math.max(1, srcRadius);
        const zw = dw * zoom;
        const zh = dh * zoom;
        try {
          ctx.drawImage(d.el, -zw / 2, -zh / 2, zw, zh);
        } catch {}
        ctx.restore();
      }
      const grad = ctx.createRadialGradient(0, 0, maxR * 0.4, 0, 0, maxR);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.8, `rgba(0,0,0,${0.25 * intensity})`);
      grad.addColorStop(1, `rgba(0,0,0,${0.85 * intensity})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, maxR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.drawImage(d.el, -dw / 2, -dh / 2, dw, dh);
    }

    // Aplicação de efeitos de pós-processamento (Glitch, VHS, Glow, Vinheta, Aberração, Thermal, FilmGrain, etc.)
    applyPostEffects(ctx, W, H, c, t, d, dw, dh, st);
  } catch {
    /* frame não disponível */
  }
  ctx.restore();
}

function drawTextTransition(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  c: Clip,
  prev: Clip | null,
  p: number,
  type: TransitionType,
  t: number
) {
  const cur = (o: Partial<LayerOpts>) => drawTextLayer(ctx, W, H, c, t, { ...IDENTITY, alpha: 1, ...o });
  const old = (o: Partial<LayerOpts>) => {
    if (prev?.text) drawTextLayer(ctx, W, H, prev, t, { ...IDENTITY, alpha: 1, ...o });
  };
  switch (type) {
    case "fade":
      if (p < 0.5) old({ alpha: 1 - p * 2 });
      else cur({ alpha: (p - 0.5) * 2 });
      break;
    case "slideLeft":
      old({ dx: -p * W * 0.3 });
      cur({ dx: (1 - p) * W });
      break;
    case "slideRight":
      old({ dx: p * W * 0.3 });
      cur({ dx: -(1 - p) * W });
      break;
    case "wipeLeft":
      old({});
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, p * W, H);
      ctx.clip();
      cur({});
      ctx.restore();
      break;
    case "wipeRight":
      old({});
      ctx.save();
      ctx.beginPath();
      ctx.rect((1 - p) * W, 0, p * W, H);
      ctx.clip();
      cur({});
      ctx.restore();
      break;
    case "zoom":
      old({ alpha: 1 - p });
      cur({ alpha: p, scaleMul: 1.25 - 0.25 * p });
      break;
    case "flash":
      old({ alpha: 1 - p });
      cur({ alpha: p });
      ctx.save();
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    case "blurIn":
      old({ alpha: 1 - p });
      cur({ alpha: p });
      break; // texto não suporta blur incremental confiável — usa dissolve
    case "dissolve":
    default:
      old({ alpha: 1 - p });
      cur({ alpha: p });
  }
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, W: number, H: number, c: Clip, status: MediaStatus, progress: number | null) {
  const accent = accentById(useSettings.getState().accent).hex;
  ctx.save();
  ctx.fillStyle = status === "loading" ? "#0d1117" : "#111827";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = status === "loading" ? "#71717a" : "#4b5563";
  ctx.font = `${Math.round(H / 30)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const loading = status === "loading";
  const pct = loading && progress != null && progress > 0.001 ? Math.round(Math.min(0.99, progress) * 100) : null;
  const label =
    status === "error"
      ? t("render.noDecode")
      : loading
        ? pct != null
          ? t("render.loadingPct", { pct })
          : t("render.loading")
        : status === "missing"
          ? t("render.missing")
          : c.mediaId
            ? t("render.notLoaded")
            : t("render.noMedia");
  ctx.fillText(label, W / 2, H / 2);
  if (loading) {
    // barrinha de progresso (a % que falta pra carregar inteiro, na própria tela)
    const bw = W * 0.4;
    const bx = (W - bw) / 2;
    const by = H / 2 + H / 22;
    ctx.fillStyle = "#1c2430";
    roundedBar(ctx, bx, by, bw, Math.max(3, H / 220));
    ctx.fill();
    if (pct != null) {
      ctx.fillStyle = accent;
      roundedBar(ctx, bx, by, (bw * Math.min(0.99, progress!)), Math.max(3, H / 220));
      ctx.fill();
    }
    ctx.fillStyle = "#52525b";
    ctx.font = `${Math.round(H / 44)}px Arial, sans-serif`;
    ctx.fillText(pct != null ? t("render.loadingHint", { pct }) : t("render.slowHint"), W / 2, by + H / 40);
  }
  ctx.restore();
}

function roundedBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- texto / legendas ----------
function wrapWords(ctx: CanvasRenderingContext2D, tokens: string[], maxW: number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  let lineW = 0;
  const spaceW = ctx.measureText(" ").width;
  for (const tok of tokens) {
    const w = ctx.measureText(tok).width;
    if (line.length && lineW + spaceW + w > maxW) {
      lines.push(line);
      line = [tok];
      lineW = w;
    } else {
      lineW += (line.length ? spaceW : 0) + w;
      line.push(tok);
    }
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[""]];
}

interface WordToken {
  text: string;
  active: boolean;
  wp: number; // progresso dentro da palavra ativa (0..1)
  color: string;
}

function tokensForKaraoke(tp: TextProps, tRel: number): WordToken[] {
  const content = tp.content || "";
  const raw = content.split(/\s+/).filter(Boolean);
  if (!tp.highlight || raw.length <= 1) {
    return raw.map((w) => ({ text: w, active: false, wp: 0, color: tp.color }));
  }
  let words = tp.words?.length ? tp.words : estimateWords(content, 0, 1);
  if (!words.length || words.length !== raw.length) {
    words = estimateWords(content, 0, 1);
  }
  const grad = tp.highlightGradient ? tp.highlightGradient.split(",").map((s) => s.trim()).filter(Boolean) : [];
  return raw.map((w, i) => {
    const tm = words[i];
    const active = !!tm && tRel >= tm.s - 0.02 && tRel < tm.e + 0.06;
    const wp = tm && tm.e > tm.s ? Math.max(0, Math.min(1, (tRel - tm.s) / (tm.e - tm.s))) : 0;
    const color = active ? (grad.length ? grad[i % grad.length] : tp.highlightColor || tp.color) : tp.color;
    return { text: w, active, wp, color };
  });
}

function drawTextLayer(ctx: CanvasRenderingContext2D, W: number, H: number, c: Clip, t: number, opts: LayerOpts) {
  const tp = c.text!;
  const st = evaluateClipState(c, t);
  const fade = fadeEnvelope(c, t);
  const effAlpha = Math.max(0, Math.min(1, opts.alpha * st.opacity * st.extraAlpha * fade));

  const size = (tp.size * H) / 1080 * (opts.scaleMul ?? 1) * st.scale * st.extraScale;
  const weight = tp.bold ? "700" : "400";
  const style = tp.italic ? "italic " : "";
  const tRel = t - c.start;

  const effX = st.x + st.extraDx + st.shakeOffsetX + ((opts.dx ?? 0) * 2 / W);
  const effY = st.y + st.extraDy + st.shakeOffsetY + ((opts.dy ?? 0) * 2 / H);
  const cx = W / 2 + (effX * W) / 2;
  const cy = H / 2 + (effY * H) / 2;
  const rot = st.rotation + st.extraRot + st.shakeRot;

  ctx.save();
  ctx.globalAlpha = effAlpha;
  const totalBlur = (st.blur || 0) + (st.extraBlur || 0) + (opts.blurPx ? (opts.blurPx * 1080) / H : 0);
  if (totalBlur > 0.5) ctx.filter = `blur(${totalBlur}px)`;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  if (st.extraScaleX !== 1 || st.extraScaleY !== 1) {
    ctx.scale(st.extraScaleX ?? 1, st.extraScaleY ?? 1);
  }

  ctx.font = `${style}${weight} ${size}px ${tp.font}`;
  ctx.textBaseline = "middle";
  const maxW = W * 0.88;
  const spaceW = ctx.measureText(" ").width;

  // Efeito Máquina de Escrever (Typewriter)
  const isTypewriter = c.animation?.inType === "typewriter" || tp.typewriter;
  let activeTextProps = tp;
  let typewriterCursor = "";

  if (isTypewriter && tp.content) {
    const rawLen = tp.content.length;
    const inDur = Math.min(c.duration * 0.92, c.animation?.inDuration ?? Math.max(0.8, rawLen * 0.07));
    if (tRel < inDur && inDur > 0.001) {
      const p = Math.max(0, Math.min(1, tRel / inDur));
      const visibleCount = Math.max(1, Math.floor(p * rawLen));
      const sliced = tp.content.slice(0, visibleCount);
      typewriterCursor = Math.floor(tRel * 5) % 2 === 0 ? " ▌" : "";
      activeTextProps = { ...tp, content: sliced };
    }
  }

  const tokens = tokensForKaraoke(activeTextProps, tRel);
  if (typewriterCursor && tokens.length > 0) {
    tokens[tokens.length - 1] = {
      ...tokens[tokens.length - 1],
      text: tokens[tokens.length - 1].text + typewriterCursor,
    };
  }

  const lines = wrapWords(ctx, tokens.map((x) => x.text), maxW);
  const lineH = size * 1.24;
  const totalH = lines.length * lineH;
  const pad = (tp.bgPad * H) / 1080;

  // caixa de fundo atrás de tudo
  if (tp.bg) {
    ctx.save();
    ctx.font = `${style}${weight} ${size}px ${tp.font}`;
    let maxLineW = 0;
    for (const ln of lines) {
      const w = ln.reduce((acc, word) => acc + ctx.measureText(word).width, 0) + spaceW * Math.max(0, ln.length - 1);
      if (w > maxLineW) maxLineW = w;
    }
    const boxW = maxLineW + pad * 2;
    const boxH = totalH + pad * 1.6;
    ctx.fillStyle = tp.bg;
    roundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, (tp.bgRadius * H) / 1080);
    ctx.fill();
    ctx.restore();
  }

  if (tp.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = size / 9;
    ctx.shadowOffsetY = size / 22;
  }

  // desenha palavra por palavra (karaokê: a palavra atual pulsa/muda de cor)
  let tokenIdx = 0;
  const startY = -totalH / 2 + lineH / 2;
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li];
    const lineW = ln.reduce((acc, word) => acc + ctx.measureText(word).width, 0) + spaceW * Math.max(0, ln.length - 1);
    let x: number;
    if (tp.align === "left") x = -maxW / 2;
    else if (tp.align === "right") x = maxW / 2 - lineW;
    else x = -lineW / 2;
    const y = startY + li * lineH;
    for (const word of ln) {
      const tok = tokens[tokenIdx++] ?? { text: word, active: false, wp: 0, color: tp.color };
      const wWidth = ctx.measureText(tok.text).width;
      let scale = 1;
      if (tok.active) {
        const hS = tp.highlightScale || 1.12;
        let k = 1;
        if (tp.highlightAnim === "pop") k = easeOutBack(Math.min(1, 0.15 + tok.wp));
        else if (tp.highlightAnim === "bounce") k = Math.abs(Math.sin(tok.wp * Math.PI)) * 0.9 + 0.1;
        else if (tp.highlightAnim === "pulse") k = 0.75 + 0.25 * Math.sin(tok.wp * Math.PI * 2);
        scale = 1 + (hS - 1) * Math.max(0, Math.min(1.2, k));
      }
      ctx.save();
      ctx.translate(x + wWidth / 2, y);
      if (scale !== 1) ctx.scale(scale, scale);
      if (tp.strokeW > 0) {
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = tp.strokeColor;
        ctx.lineWidth = ((tp.strokeW * (tok.active ? 1.18 : 1)) * H) / 1080;
        ctx.strokeText(tok.text, -wWidth / 2, 0);
      }
      ctx.fillStyle = tok.color;
      ctx.fillText(tok.text, -wWidth / 2, 0);
      ctx.restore();
      x += wWidth + spaceW;
    }
  }

  // Flash em texto também
  if (st.flashAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = st.flashAlpha * 0.8;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-maxW / 2, -totalH / 2, maxW, totalH);
    ctx.restore();
  }

  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// útil para o motor de exportação saber se uma mídia está carregada
export { registry };
