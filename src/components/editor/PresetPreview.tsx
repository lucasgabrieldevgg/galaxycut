// GalaxyCut — preview de estilo de legenda em CANVAS (v7.3).
// Motivo: o exemplo "AaBb" era um <span> HTML com -webkit-text-stroke, que
// COME o preenchimento da letra (contorno por cima da cor) — com fontes
// finas (Anton, Bebas) a amostra ficava PRETA em vez de amarela/verde.
// Aqui o desenho é o MESMO do renderizador de verdade: contorno ATRÁS
// (strokeText primeiro, fillText por cima) — o que você vê no exemplo é o
// que sai no vídeo. A segunda palavra usa a cor de destaque (karaokê).
"use client";

import { useEffect, useRef } from "react";
import type { TextProps } from "@/lib/editor/types";

export function PresetPreview({ tp, height = 34 }: { tp: Partial<TextProps>; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 150;
    const H = height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const size = Math.round(height * 0.52);
    const base = tp.bold ? "700" : "400";
    ctx.font = `${tp.italic ? "italic " : ""}${base} ${size}px ${tp.font ?? "Arial, sans-serif"}`;
    ctx.textBaseline = "middle";

    // duas palavras: normal + destaque (o conceito do karaokê)
    const w1 = "Aa";
    const w2 = "Bb";
    const space = ctx.measureText(" ").width;
    const w1w = ctx.measureText(w1).width;
    const w2w = ctx.measureText(w2).width;
    const total = w1w + space + w2w;
    let x = (W - total) / 2;
    const y = H / 2;

    // caixa de fundo (preset "Caixa escura")
    if (tp.bg) {
      const pad = Math.max(3, (tp.bgPad ?? 14) * (size / 64));
      const boxH = size * 1.35;
      ctx.fillStyle = tp.bg;
      const r = Math.min((tp.bgRadius ?? 10) * (size / 64), boxH / 2);
      ctx.beginPath();
      ctx.moveTo(x - pad + r, y - boxH / 2);
      ctx.arcTo(x - pad + total + pad, y - boxH / 2, x - pad + total + pad, y + boxH / 2, r);
      ctx.arcTo(x - pad + total + pad, y + boxH / 2, x - pad, y + boxH / 2, r);
      ctx.arcTo(x - pad, y + boxH / 2, x - pad, y - boxH / 2, r);
      ctx.arcTo(x - pad, y - boxH / 2, x - pad + total + pad, y - boxH / 2, r);
      ctx.closePath();
      ctx.fill();
    }

    const drawWord = (text: string, color: string, px: number) => {
      if (tp.shadow) {
        ctx.shadowColor = "rgba(0,0,0,0.65)";
        ctx.shadowBlur = size / 9;
        ctx.shadowOffsetY = size / 22;
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      if ((tp.strokeW ?? 0) > 0) {
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = tp.strokeColor ?? "#000000";
        // mesma proporção do render.ts (strokeW @64px de fonte), com teto pra
        // não engolir a amostra pequena
        ctx.lineWidth = Math.min(4, (tp.strokeW! * size) / (tp.size ?? 64));
        ctx.strokeText(text, px, y);
        ctx.restore();
      }
      ctx.fillStyle = color;
      ctx.fillText(text, px, y);
    };

    drawWord(w1, tp.color ?? "#FFFFFF", x);
    x += w1w + space;
    // palavra em destaque: a cor de karaokê (ou a primeira do gradiente)
    const hi = tp.highlight
      ? tp.highlightGradient
        ? tp.highlightGradient.split(",")[0].trim()
        : tp.highlightColor || "#FACC15"
      : tp.color || "#FFFFFF";
    drawWord(w2, hi, x);
    ctx.shadowColor = "transparent";
  }, [tp, height]);

  return <canvas ref={ref} className="mx-auto block max-w-full" aria-hidden />;
}
