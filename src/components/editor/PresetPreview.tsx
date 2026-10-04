// GalaxyCut — preview de estilo de legenda em CANVAS (v7.8).
// Desenha fielmente fontes, contorno, caixa de fundo e o comportamento
// da palavra ativa (karaokê, caixa na palavra, sem saltos, neon, etc.)
"use client";

import { useEffect, useRef } from "react";
import type { TextProps } from "@/lib/editor/types";

export function PresetPreview({
  tp,
  height = 36,
  previewText,
}: {
  tp: Partial<TextProps>;
  height?: number;
  previewText?: { w1: string; w2: string };
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 160;
    const H = height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const size = Math.round(height * 0.48);
    const base = tp.bold ? "700" : "400";
    ctx.font = `${tp.italic ? "italic " : ""}${base} ${size}px ${tp.font ?? "Arial, sans-serif"}`;
    ctx.textBaseline = "middle";

    let w1 = previewText?.w1 ?? "Texto";
    let w2 = previewText?.w2 ?? "Ativo";
    if (tp.uppercase) {
      w1 = w1.toUpperCase();
      w2 = w2.toUpperCase();
    }
    const space = ctx.measureText(" ").width;
    const w1w = ctx.measureText(w1).width;
    const w2w = ctx.measureText(w2).width;
    const total = w1w + space + w2w;
    let x = (W - total) / 2;
    const y = H / 2;

    // caixa de fundo global (ex: "Tarja de Cinema" ou "Hormozi")
    if (tp.bg) {
      const pad = Math.max(3, (tp.bgPad ?? 14) * (size / 64));
      const boxH = size * 1.35;
      ctx.fillStyle = tp.bg;
      const r = Math.min((tp.bgRadius ?? 8) * (size / 64), boxH / 2);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - pad, y - boxH / 2, total + pad * 2, boxH, r) : ctx.rect(x - pad, y - boxH / 2, total + pad * 2, boxH);
      ctx.fill();
    }

    const drawWord = (text: string, color: string, px: number, isActive = false) => {
      ctx.save();
      const wordW = ctx.measureText(text).width;
      const isBox = isActive && tp.highlightAnim === "box";
      const isGlow = isActive && tp.highlightAnim === "glow";
      const scale = isActive && tp.highlightScale && tp.highlightAnim !== "none" && tp.highlightAnim !== "colorOnly" && tp.highlightAnim !== "box"
        ? Math.min(1.2, tp.highlightScale)
        : 1;

      ctx.translate(px + wordW / 2, y);
      if (scale !== 1) ctx.scale(scale, scale);

      if (isBox) {
        ctx.save();
        const bPad = 4;
        const bH = size * 1.25;
        ctx.fillStyle = tp.highlightBg || tp.highlightColor || "#FACC15";
        const bW = wordW + bPad * 2;
        if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(-bW / 2, -bH / 2, bW, bH, 4), ctx.fill();
        else ctx.fillRect(-bW / 2, -bH / 2, bW, bH);
        ctx.restore();
      }

      if (isGlow) {
        ctx.shadowColor = color || "#38BDF8";
        ctx.shadowBlur = size / 2.5;
        ctx.shadowOffsetY = 0;
      } else if (tp.shadow) {
        ctx.shadowColor = "rgba(0,0,0,0.65)";
        ctx.shadowBlur = size / 9;
        ctx.shadowOffsetY = size / 22;
      } else {
        ctx.shadowColor = "transparent";
      }

      if ((tp.strokeW ?? 0) > 0) {
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = tp.strokeColor ?? "#000000";
        ctx.lineWidth = Math.min(4, (tp.strokeW! * size) / (tp.size ?? 64));
        ctx.strokeText(text, -wordW / 2, 0);
        ctx.restore();
      }

      ctx.fillStyle = color;
      ctx.fillText(text, -wordW / 2, 0);
      ctx.restore();
    };

    drawWord(w1, tp.color ?? "#FFFFFF", x, false);
    x += w1w + space;

    const hi = tp.highlight
      ? tp.highlightGradient
        ? tp.highlightGradient.split(",")[0].trim()
        : tp.highlightColor || "#FACC15"
      : tp.color || "#FFFFFF";

    drawWord(w2, hi, x, true);
  }, [tp, height, previewText]);

  return <canvas ref={ref} className="mx-auto block max-w-full" aria-hidden />;
}
