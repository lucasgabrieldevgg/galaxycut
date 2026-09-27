// GaláxiaCut — renderização de frame no canvas (preview e exportação usam a mesma função)
"use client";

import { Clip, Track, ProjectMeta, TextProps, TransitionType, clipEnd, fadeEnvelope } from "./types";
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
    drawMediaLayer(ctx, W, H, c, t, assets, { alpha: c.opacity * fadeEnvelope(c, t) });
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
    if (el.readyState >= 2) return { el, sw: el.videoWidth, sh: el.videoHeight };
  } else if (el instanceof HTMLImageElement) {
    if (el.complete && el.naturalWidth > 0) return { el, sw: el.naturalWidth, sh: el.naturalHeight };
  }
  return null;
}

function buildFilter(c: Clip, H: number, extraBlurPx?: number): string {
  const parts: string[] = [];
  if (c.brightness !== 1) parts.push(`brightness(${c.brightness})`);
  if (c.contrast !== 1) parts.push(`contrast(${c.contrast})`);
  if (c.saturation !== 1) parts.push(`saturate(${c.saturation})`);
  if (c.blur > 0) parts.push(`blur(${(c.blur * H) / 1080}px)`);
  if (extraBlurPx && extraBlurPx > 0.5) parts.push(`blur(${extraBlurPx}px)`);
  if (c.hue !== 0) parts.push(`hue-rotate(${c.hue}deg)`);
  if (c.sepia > 0) parts.push(`sepia(${c.sepia})`);
  if (c.grayscale > 0) parts.push(`grayscale(${c.grayscale})`);
  return parts.length ? parts.join(" ") : "none";
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
    // mídia ausente: só desenha o placeholder se for o clipe principal (não em transição)
    if (opts.alpha >= 0.999)
      drawPlaceholder(ctx, W, H, c, assets.statusOf?.(c.id) ?? (c.mediaId ? "loading" : "missing"), assets.progressOf?.(c.id) ?? null);
    return;
  }
  const fade = opts.alpha >= 0.999 && opts.scaleMul === undefined && !opts.dx ? fadeEnvelope(c, t) : 1;
  void fade; // alpha já vem multiplicado pelo envelope nas chamadas principais
  const base = Math.min(W / d.sw, H / d.sh);
  const k = base * c.scale * (opts.scaleMul ?? 1);
  const dw = d.sw * k;
  const dh = d.sh * k;
  const cx = W / 2 + (c.x * W) / 2 + (opts.dx ?? 0);
  const cy = H / 2 + (c.y * H) / 2 + (opts.dy ?? 0);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opts.alpha));
  ctx.filter = buildFilter(c, H, opts.blurPx);
  ctx.translate(cx, cy);
  if (c.rotation) ctx.rotate((c.rotation * Math.PI) / 180);
  try {
    ctx.drawImage(d.el, -dw / 2, -dh / 2, dw, dh);
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

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
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
  const size = (tp.size * H) / 1080 * (opts.scaleMul ?? 1);
  const weight = tp.bold ? "700" : "400";
  const style = tp.italic ? "italic " : "";
  const tRel = t - c.start;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opts.alpha));
  if (opts.blurPx && opts.blurPx > 0.5) ctx.filter = `blur(${opts.blurPx}px)`;
  ctx.font = `${style}${weight} ${size}px ${tp.font}`;
  ctx.textBaseline = "middle";
  const maxW = W * 0.88;
  const spaceW = ctx.measureText(" ").width;

  const tokens = tokensForKaraoke(tp, tRel);
  const lines = wrapWords(ctx, tokens.map((x) => x.text), maxW);
  const lineH = size * 1.24;
  const cx = W / 2 + (c.x * W) / 2 + (opts.dx ?? 0);
  const cy = H / 2 + (c.y * H) / 2 + (opts.dy ?? 0);
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
    roundedRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, (tp.bgRadius * H) / 1080);
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
  const startY = cy - totalH / 2 + lineH / 2;
  for (let li = 0; li < lines.length; li++) {
    const ln = lines[li];
    const lineW = ln.reduce((acc, word) => acc + ctx.measureText(word).width, 0) + spaceW * Math.max(0, ln.length - 1);
    let x: number;
    if (tp.align === "left") x = cx - maxW / 2;
    else if (tp.align === "right") x = cx + maxW / 2 - lineW;
    else x = cx - lineW / 2;
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
