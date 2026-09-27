// GalaxyCut — legendas automáticas com IA (Whisper via transformers.js, 100% no navegador)
"use client";

import { create } from "zustand";
import { registry } from "./media";
import { KaraokeWord } from "./types";

export interface SubSegment {
  start: number;
  end: number;
  text: string;
  words?: KaraokeWord[]; // tempos por palavra (relativos ao começo do segmento)
}

export interface WhisperProgress {
  stage: string; // "download" | "prepare" | "transcribe"
  pct: number; // 0..1
}

export type WhisperModelId = "tiny" | "base" | "small";

export const WHISPER_MODELS: { id: WhisperModelId; label: string; hint: string }[] = [
  { id: "tiny", label: "Rápido", hint: "~40 MB · mais erros, mas voa" },
  { id: "base", label: "Equilibrado", hint: "~80 MB · bom pra português" },
  { id: "small", label: "Preciso", hint: "~250 MB · detecta bem mais palavras (demora mais)" },
];

// import() dinâmico de URL externa sem o bundler enxergar
const dynImport = new Function("u", "return import(u)") as (u: string) => Promise<Record<string, unknown>>;

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
const MODEL_IDS: Record<WhisperModelId, string> = {
  tiny: "onnx-community/whisper-tiny",
  base: "onnx-community/whisper-base",
  small: "onnx-community/whisper-small",
};
// cadeia de fallback: pedido → base → tiny (nunca deixa o usuário na mão)
function fallbackChain(requested: WhisperModelId): string[] {
  const order: WhisperModelId[] = requested === "small" ? [requested, "base", "tiny"] : requested === "tiny" ? [requested, "base"] : [requested, "tiny"];
  return order.map((m) => MODEL_IDS[m]);
}

/** Extrai PCM mono 16 kHz de um blob de áudio/vídeo. */
async function extractPcm16k(blob: Blob): Promise<Float32Array> {
  const AC: typeof AudioContext = window.AudioContext;
  const ctx = new AC({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.slice(0).arrayBuffer());
    const ch = buf.getChannelData(0);
    return new Float32Array(ch);
  } finally {
    void ctx.close();
  }
}

let pipelineCache = new Map<string, CallableFunction>();

async function getAsr(modelId: string, onProgress: (p: WhisperProgress) => void): Promise<CallableFunction> {
  const cached = pipelineCache.get(modelId);
  if (cached) return cached;
  const mod: any = await dynImport(TRANSFORMERS_URL);
  const pipeline = mod.pipeline as (t: string, m: string, o?: unknown) => Promise<unknown>;
  const opts = {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p: any) => {
      if (p?.status === "progress" && p.total) {
        onProgress({ stage: "download", pct: p.loaded / p.total });
      } else if (p?.status === "ready" || p?.status === "done") {
        onProgress({ stage: "prepare", pct: 1 });
      }
    },
  };
  const asr = (await pipeline("automatic-speech-recognition", modelId, opts)) as CallableFunction;
  pipelineCache.set(modelId, asr);
  return asr;
}

interface RawWord {
  w: string;
  s: number;
  e: number;
}

/**
 * Transcreve um blob de mídia e devolve segmentos com timestamps —
 * inclusive POR PALAVRA (usado pro karaokê da legenda).
 * maxWords: quantas palavras por caixa (2–4, anti-inundação de tela).
 */
export async function transcribe(
  mediaId: string,
  lang: string,
  onProgress: (p: WhisperProgress) => void,
  model: WhisperModelId = "base",
  maxWords: number = 4
): Promise<SubSegment[]> {
  const blob = registry.getBlob(mediaId);
  if (!blob) throw new Error("Mídia não encontrada neste navegador — reimporte o arquivo antes de gerar legendas.");
  onProgress({ stage: "prepare", pct: 0.02 });
  const pcm = await extractPcm16k(blob);
  onProgress({ stage: "prepare", pct: 0.08 });

  let asr: CallableFunction | null = null;
  let lastErr: unknown = null;
  for (const id of fallbackChain(model)) {
    try {
      asr = await getAsr(id, onProgress);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!asr) throw lastErr instanceof Error ? lastErr : new Error("Não consegui carregar o modelo de IA");

  onProgress({ stage: "transcribe", pct: 0.1 });
  let words: RawWord[] = [];
  try {
    // 1ª tentativa: timestamps POR PALAVRA (karaokê)
    const out: any = await asr(pcm, {
      language: lang,
      task: "transcribe",
      chunk_length_s: 30,
      stride_chunk_s: 5,
      return_timestamps: "word",
    });
    words = parseWords(out);
  } catch {
    words = [];
  }
  if (!words.length) {
    // 2ª tentativa: timestamps por trecho (fallback antigo)
    const out: any = await asr(pcm, {
      language: lang,
      task: "transcribe",
      chunk_length_s: 30,
      stride_chunk_s: 5,
      return_timestamps: true,
    });
    const chunks: { text: string; timestamp: [number | null, number | null] }[] =
      out?.chunks && out.chunks.length ? out.chunks : out?.text ? [{ text: out.text, timestamp: [0, null] }] : [];
    const segs = chunkToSegments(chunks);
    onProgress({ stage: "transcribe", pct: 0.98 });
    return polish(segs);
  }
  onProgress({ stage: "transcribe", pct: 0.98 });
  return groupWords(words, Math.max(2, Math.min(6, maxWords)));
}

function parseWords(out: any): RawWord[] {
  const chunks: { text: string; timestamp: [number | null, number | null] }[] = out?.chunks ?? [];
  const words: RawWord[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const w = (c.text ?? "").replace(/\s+/g, "").trim();
    if (!w) continue;
    const s = c.timestamp?.[0] ?? (words.length ? words[words.length - 1].e : 0);
    let e = c.timestamp?.[1] ?? null;
    if (e === null) {
      const next = chunks.slice(i + 1).find((x) => x.timestamp?.[0] != null)?.timestamp?.[0];
      e = next ?? s + 0.4;
    }
    words.push({ w, s, e: Math.max(s + 0.12, e) });
  }
  return words;
}

/** Agrupa palavras em caixinhas de legenda (2–4 palavras, corta em pontuação e pausas). */
function groupWords(words: RawWord[], maxWords = 4): SubSegment[] {
  const segs: SubSegment[] = [];
  let cur: RawWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    const start = cur[0].s;
    const end = cur[cur.length - 1].e;
    segs.push({
      start,
      end,
      text: cur.map((x) => x.w).join(" "),
      words: cur.map((x) => ({ w: x.w, s: x.s - start, e: x.e - start })),
    });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // pausa natural da fala antes desta palavra → fecha a caixinha anterior
    if (cur.length >= 2 && w.s - cur[cur.length - 1].e > 0.42) flush();
    const dur = cur.length ? w.e - cur[0].s : 0;
    const chars = cur.reduce((a, x) => a + x.w.length, 0) + w.w.length;
    cur.push(w);
    const endsSentence = /[.!?…]$/.test(w.w);
    const commaBreak = /[,]$/.test(w.w) && cur.length >= 3;
    if (endsSentence || commaBreak || cur.length >= maxWords || dur >= 1.8 || chars >= 40) flush();
  }
  flush();
  return polish(segs);
}

function chunkToSegments(chunks: { text: string; timestamp: [number | null, number | null] }[]): SubSegment[] {
  const segs: SubSegment[] = [];
  let prevEnd = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const s = c.timestamp?.[0] ?? prevEnd;
    let e = c.timestamp?.[1] ?? null;
    if (e === null) {
      const next = chunks[i + 1]?.timestamp?.[0];
      e = next ?? s + 2.5;
    }
    prevEnd = e;
    const text = (c.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    segs.push({ start: s, end: Math.max(s + 0.4, e), text });
  }
  return segs;
}

/** Estima tempos por palavra (quando a IA não deu) — distribui proporcional ao tamanho. */
export function estimateWords(text: string, start: number, end: number): KaraokeWord[] {
  const ws = text.split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  const totalChars = ws.reduce((a, w) => a + w.length + 1, 0);
  const dur = Math.max(0.4, end - start);
  let t = start;
  return ws.map((w) => {
    const d = ((w.length + 1) / totalChars) * dur;
    const item = { w, s: t - start, e: t + d - start };
    t += d;
    return item;
  });
}

function polish(segs: SubSegment[]): SubSegment[] {
  const merged: SubSegment[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    // só junta caixinhas MUITO curtas quando nenhuma tem tempo por palavra
    // (juntar destruiria o karaokê e inundaria a tela — o dono pediu 2–4 palavras)
    const canMerge =
      !s.words && !last?.words &&
      last && (s.end - s.start) < 0.8 && (last.text.length + s.text.length) < 30 && s.start - last.end < 0.4;
    if (canMerge) {
      last.end = s.end;
      last.text = `${last.text} ${s.text}`.trim();
      last.words = undefined; // sem tempos confiáveis por palavra
    } else {
      merged.push({ ...s });
    }
  }
  const out: SubSegment[] = [];
  for (const s of merged) {
    if (s.words) {
      out.push(s);
      continue;
    }
    if (s.text.length <= 46 || !s.text.includes(" ")) {
      out.push({ ...s, words: estimateWords(s.text, s.start, s.end) });
      continue;
    }
    // divide em duas linhas no meio (mais próximo do espaço central)
    const words = s.text.split(" ");
    let best = 1;
    let bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const leftLen = words.slice(0, i).join(" ").length;
      const diff = Math.abs(leftLen - s.text.length / 2);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    const mid = s.start + (s.end - s.start) * (words.slice(0, best).join(" ").length / s.text.length);
    const leftText = words.slice(0, best).join(" ");
    const rightText = words.slice(best).join(" ");
    out.push({ start: s.start, end: mid, text: leftText, words: estimateWords(leftText, s.start, mid) });
    out.push({ start: mid, end: s.end, text: rightText, words: estimateWords(rightText, mid, s.end) });
  }
  return out;
}

// ---------------- trabalho de legendas em 2º plano ----------------
// O diálogo pode ser minimizado (botão "−") enquanto a IA continua transcrevendo;
// a barrinha flutuante mostra a % e a aba abre de novo com 1 clique.

interface SubtitleJob {
  running: boolean;
  stage: string; // "download" | "prepare" | "transcribe"
  pct: number; // 0..1
  open: boolean; // diálogo aberto?
  minimized: boolean; // rodando em 2º plano (barrinha em cima)?
  setProg: (p: WhisperProgress) => void;
  setOpen: (v: boolean) => void;
  setMinimized: (v: boolean) => void;
  start: () => void;
  finish: () => void;
}

export const useSubtitleJob = create<SubtitleJob>((set) => ({
  running: false,
  stage: "prepare",
  pct: 0,
  open: false,
  minimized: false,
  setProg: (p) => set({ stage: p.stage, pct: p.pct }),
  setOpen: (v) => set({ open: v }),
  setMinimized: (v) => set({ minimized: v }),
  start: () => set({ running: true, stage: "prepare", pct: 0 }),
  finish: () => set({ running: false, pct: 1, minimized: false }),
}));
