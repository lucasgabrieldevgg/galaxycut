// GaláxiaCut — detector de trechos sem áudio (análise local de energia, 100% no navegador)
"use client";

export interface SilenceSpan {
  start: number; // segundos NO ARQUIVO de origem
  end: number;
}

export interface SilenceOptions {
  /** janelas abaixo deste nível (dBFS) contam como silêncio. -45 = só quase zero · -30 = agressivo */
  thresholdDb: number;
  /** duração mínima de um trecho pra ser considerado cena sem som (s) */
  minDuration: number;
}

export const SENSITIVITY_PRESETS: { id: string; label: string; opts: SilenceOptions; hint: string }[] = [
  { id: "suave", label: "Só o mudo total", opts: { thresholdDb: -45, minDuration: 0.6 }, hint: "pega só silêncio quase absoluto" },
  { id: "normal", label: "Normal", opts: { thresholdDb: -37, minDuration: 0.45 }, hint: "ignora chiado de fundo, acha pausas de verdade" },
  { id: "agressivo", label: "Agressivo", opts: { thresholdDb: -28, minDuration: 0.3 }, hint: "pega até pausas curtas e fala baixinha" },
  // pedido do dono: "não cortou TODO o silêncio" — sobrou trecho com ruído de fundo
  { id: "tudo", label: "Tudo", opts: { thresholdDb: -22, minDuration: 0.25 }, hint: "corta até respiro e fundo com ruído" },
];

/**
 * Decodifica o áudio da mídia e devolve os trechos em que ninguém fala.
 * Roda local (WebAudio) — não usa IA, não pesa o PC, não sai do navegador.
 */
export async function detectSilence(blob: Blob, opts: SilenceOptions): Promise<SilenceSpan[]> {
  const AC: typeof AudioContext = window.AudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await blob.slice(0).arrayBuffer());
    const chans = buf.numberOfChannels;
    const len = buf.length;
    // mistura todos os canais num só (mono)
    let data: Float32Array;
    if (chans <= 1) {
      data = buf.getChannelData(0);
    } else {
      data = new Float32Array(len);
      for (let c = 0; c < chans; c++) {
        const ch = buf.getChannelData(c);
        for (let i = 0; i < len; i++) data[i] += ch[i] / chans;
      }
    }
    const sr = buf.sampleRate;
    const win = Math.max(1, Math.round(sr * 0.03)); // janelas de 30ms
    const nWin = Math.floor(len / win);
    const silent: boolean[] = new Array(nWin);
    const th = Math.pow(10, opts.thresholdDb / 20); // dB → amplitude
    const floor = 0.0012; // quase zero absoluto (~-58dB)
    for (let w = 0; w < nWin; w++) {
      let sum = 0;
      const from = w * win;
      const to = from + win;
      for (let i = from; i < to; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / win);
      silent[w] = rms < Math.max(th, floor);
    }
    // agrupa janelas contíguas em trechos
    const spans: SilenceSpan[] = [];
    let s = -1;
    for (let w = 0; w <= nWin; w++) {
      const sil = w < nWin && silent[w];
      if (sil && s < 0) s = w;
      if (!sil && s >= 0) {
        const a = (s * win) / sr;
        const b = (w * win) / sr;
        if (b - a >= opts.minDuration) spans.push({ start: a, end: b });
        s = -1;
      }
    }
    return spans;
  } finally {
    void ctx.close();
  }
}

/** Converte trechos (tempo do ARQUIVO) → tempo da TIMELINE dentro de um clipe. */
export function spansToTimeline(
  spans: SilenceSpan[],
  clip: { start: number; duration: number; inPoint: number; speed: number }
): { a: number; b: number }[] {
  const speed = clip.speed || 1;
  const srcFrom = clip.inPoint;
  const srcTo = clip.inPoint + clip.duration * speed;
  const out: { a: number; b: number }[] = [];
  for (const sp of spans) {
    const a = Math.max(srcFrom, sp.start);
    const b = Math.min(srcTo, sp.end);
    if (b - a < 0.08) continue; // fora do clipe ou casca de trecho
    out.push({
      a: clip.start + (a - srcFrom) / speed,
      b: clip.start + (b - srcFrom) / speed,
    });
  }
  return out;
}
