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
  window?: number; // janela atual (transcrição em pedaços)
  windows?: number; // total de janelas
}

export type WhisperModelId = "tiny" | "base" | "small";

export const WHISPER_MODELS: { id: WhisperModelId; label: string; hint: string }[] = [
  { id: "tiny", label: "Rápido", hint: "~40 MB · mais erros, mas voa" },
  { id: "base", label: "Equilibrado", hint: "~80 MB · bom pra português" },
  { id: "small", label: "Preciso", hint: "~250 MB · detecta bem mais palavras (demora mais)" },
];

// import() dinâmico de URL externa sem o bundler enxergar (legado — hoje o worker importa direto)
const dynImport = new Function("u", "return import(u)") as (u: string) => Promise<Record<string, unknown>>;

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
// v7.1: modelos da XENOVA — os "onnx-community" não têm cross-attentions nos
// pesos quantizados, então o return_timestamps:"word" falhava no final com
// "Model outputs must contain cross attentions" (o bug que travava em 10% e
// terminava sem legenda nenhuma). Os da Xenova foram exportados com
// output_attentions=True e o karaokê funciona (testado com áudio real).
const MODEL_IDS: Record<WhisperModelId, string> = {
  tiny: "Xenova/whisper-tiny",
  base: "Xenova/whisper-base",
  small: "Xenova/whisper-small",
};
// cadeia de fallback: pedido → base → tiny (nunca deixa o usuário na mão)
function fallbackChain(requested: WhisperModelId): string[] {
  const order: WhisperModelId[] = requested === "small" ? [requested, "base", "tiny"] : requested === "tiny" ? [requested, "base"] : [requested, "tiny"];
  return order.map((m) => MODEL_IDS[m]);
}

// ---------------- Web Worker: a transcrição NUNCA mais trava a interface ----------------
// O modelo roda num worker próprio (blob module + import do CDN). O áudio é fatiado
// em janelas de 10s com 0,8s de sobreposição — cada janela reporta progresso REAL,
// dá pra cancelar (worker.terminate) e a UI continua fluida o tempo todo.

const WORKER_SRC = `
import { pipeline } from "${TRANSFORMERS_URL}";
let asrCache = new Map();

// progresso de download REAL: soma os bytes de TODOS os arquivos do modelo
// (encoder + decoder + tokenizer), cada um com o peso do seu tamanho
function downloadProgress() {
  const files = new Map(); // file -> {loaded, total}
  return (p) => {
    if (p?.status === "progress" && p.file && p.total) {
      files.set(p.file, { loaded: p.loaded || 0, total: p.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      return total > 0 ? Math.min(0.999, loaded / total) : 0;
    }
    return null;
  };
}

async function loadAsr(msg, send) {
  let asr = asrCache.get(msg.model);
  if (!asr) {
    send({ type: "stage", stage: "download", pct: 0 });
    const prog = downloadProgress();
    asr = await pipeline("automatic-speech-recognition", msg.model, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p?.status === "progress") {
          const pct = prog(p);
          if (pct != null) send({ type: "stage", stage: "download", pct });
        } else if (p?.status === "ready" || p?.status === "done") {
          send({ type: "stage", stage: "prepare", pct: 1 });
        }
      },
    });
    asrCache.set(msg.model, asr);
  }
  return asr;
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    const asr = await loadAsr(msg, self.postMessage);

    if (msg.type === "download") {
      // só baixar o modelo (onboarding) — nada a transcrever
      send0(self, { type: "done", words: [] });
      return;
    }
    if (msg.type !== "run") return;
    const send = (o) => self.postMessage(o);
    send({ type: "stage", stage: "prepare", pct: 1 });

    // janelas de 10s (não 30): o progresso anda 3× mais vezes — nada de
    // ficar preso em 10% enquanto a IA processa meio minuto de áudio
    const WIN = 10;
    const OVERLAP = 0.8;
    const sr = 16000;
    const total = msg.pcm.length / sr;
    const n = Math.max(1, Math.ceil((total - OVERLAP) / (WIN - OVERLAP)));
    const allWords = [];
    let lastEnd = 0;
    for (let w = 0; w < n; w++) {
      const off = w * (WIN - OVERLAP);
      const len = Math.min(WIN, total - off);
      if (len <= 0.05) break;
      const slice = msg.pcm.subarray(Math.round(off * sr), Math.round((off + len) * sr));
      send({ type: "stage", stage: "transcribe", pct: 0.1 + 0.85 * (w / n), window: w + 1, windows: n });
      const out = await asr(slice, {
        language: msg.lang === "auto" ? null : msg.lang,
        task: "transcribe",
        chunk_length_s: 30,
        stride_chunk_s: 5,
        return_timestamps: "word",
      });
      const chunks = out?.chunks ?? [];
      const winEnd = off + len;
      for (const c of chunks) {
        const text = (c.text ?? "").replace(/\\s+/g, "");
        if (!text) continue;
        const s = (c.timestamp?.[0] ?? lastEnd - off) + off;
        let e = c.timestamp?.[1];
        e = (e == null ? s - off + 0.4 : e) + off;
        if (w < n - 1 && e > winEnd - 0.35) continue;
        if (s < lastEnd - 0.06) continue;
        lastEnd = Math.max(lastEnd, e);
        allWords.push({ w: text, s, e: Math.max(s + 0.12, e) });
      }
    }
    send({ type: "stage", stage: "transcribe", pct: 0.97, window: n, windows: n });
    send({ type: "done", words: allWords });
  } catch (err) {
    self.postMessage({ type: "error", message: String((err && err.message) || err) });
  }
};

function send0(ctx, o) { ctx.postMessage(o); }
`;

/** Fallback SEM worker (navegadores que bloqueiam blob worker): o código antigo,
 *  só que com yield entre etapas. Usado só se o worker não abrir. */

let activeWorker: Worker | null = null;
/** rejeição pendente do worker atual (o botão Cancelar dispara isso) */
let pendingCancel: ((reason: Error) => void) | null = null;

/** Cancela a transcrição em andamento — o worker é morto na hora. */
export function cancelTranscription() {
  const reject = pendingCancel;
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
  pendingCancel = null;
  if (reject) reject(new Error("cancelada pelo usuário"));
}

let legacyCache = new Map<string, CallableFunction>();

async function transcribeLegacy(
  pcm: Float32Array,
  lang: string,
  model: WhisperModelId,
  onProgress: (p: WhisperProgress) => void,
  maxWords: number
): Promise<SubSegment[]> {
  let asr: CallableFunction | null = null;
  let lastErr: unknown = null;
  for (const id of fallbackChain(model)) {
    try {
      const cached = legacyCache.get(id);
      if (cached) {
        asr = cached;
        break;
      }
      const mod: any = await dynImport(TRANSFORMERS_URL);
      const pipeline = mod.pipeline as (t: string, m: string, o?: unknown) => Promise<unknown>;
      asr = (await pipeline("automatic-speech-recognition", id, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p: any) => {
          if (p?.status === "progress" && p.total) onProgress({ stage: "download", pct: p.loaded / p.total });
          else if (p?.status === "ready" || p?.status === "done") onProgress({ stage: "prepare", pct: 1 });
        },
      })) as CallableFunction;
      legacyCache.set(id, asr);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!asr) throw lastErr instanceof Error ? lastErr : new Error("Não consegui carregar o modelo de IA");
  onProgress({ stage: "transcribe", pct: 0.2 });
  const out: any = await asr(pcm, { language: lang, task: "transcribe", chunk_length_s: 30, stride_chunk_s: 5, return_timestamps: "word" });
  const words = parseWords(out);
  onProgress({ stage: "transcribe", pct: 0.98 });
  if (words.length) return groupWords(words, Math.max(2, Math.min(6, maxWords)));
  const out2: any = await asr(pcm, { language: lang, task: "transcribe", chunk_length_s: 30, stride_chunk_s: 5, return_timestamps: true });
  const chunks: { text: string; timestamp: [number | null, number | null] }[] =
    out2?.chunks && out2.chunks.length ? out2.chunks : out2?.text ? [{ text: out2.text, timestamp: [0, null] }] : [];
  return polish(chunkToSegments(chunks));
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

function getAsr(modelId: string, onProgress: (p: WhisperProgress) => void): Promise<CallableFunction> {
  const cached = pipelineCache.get(modelId);
  if (cached) return Promise.resolve(cached);
  return transcribeLegacyGetAsr(modelId, onProgress);
}

async function transcribeLegacyGetAsr(modelId: string, onProgress: (p: WhisperProgress) => void): Promise<CallableFunction> {
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

/** Transcreve num worker novo pra CADA modelo da cadeia (fallback: pedido → base → tiny). */
async function transcribeInWorkerWithFallback(
  pcm: Float32Array,
  lang: string,
  model: WhisperModelId,
  onProgress: (p: WhisperProgress) => void,
  maxWords: number
): Promise<SubSegment[]> {
  let lastErr: unknown = null;
  for (const repoId of fallbackChain(model)) {
    // pcm é TRANSFERIDO pro worker (neutroizado) — clona pra poder tentar de novo
    const pass = pcm.slice();
    try {
      return await transcribeInWorkerOnce(pass, repoId, lang, onProgress, maxWords);
    } catch (e) {
      if (String((e as Error)?.message ?? "").includes("cancel")) throw e;
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Não consegui carregar o modelo de IA");
}

async function transcribeInWorkerOnce(
  pcm: Float32Array,
  repoId: string,
  lang: string,
  onProgress: (p: WhisperProgress) => void,
  maxWords: number
): Promise<SubSegment[]> {
  const blob = new Blob([WORKER_SRC], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: "module" });
  activeWorker = worker;
  try {
    const words = await new Promise<RawWord[]>((resolve, reject) => {
      pendingCancel = reject; // o botão Cancelar dispara esta rejeição
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data as { type: string; stage?: string; pct?: number; window?: number; windows?: number; words?: RawWord[]; message?: string };
        if (m.type === "stage" && m.stage) onProgress({ stage: m.stage, pct: m.pct ?? 0, window: m.window, windows: m.windows });
        else if (m.type === "done") resolve(m.words ?? []);
        else if (m.type === "error") reject(new Error(m.message ?? "falha na transcrição"));
      };
      worker.onerror = (e) => reject(new Error(e.message || "o worker de IA não abriu"));
      worker.postMessage({ type: "run", pcm, lang, model: repoId }, [pcm.buffer]);
    });
    onProgress({ stage: "transcribe", pct: 0.98 });
    if (!words.length) return [];
    return groupWords(words, Math.max(2, Math.min(6, maxWords)));
  } finally {
    pendingCancel = null;
    worker.terminate();
    URL.revokeObjectURL(url);
    if (activeWorker === worker) activeWorker = null;
  }
}

/**
 * Baixa um modelo de IA pra deixar pronto (onboarding). Baixa em 2º plano
 * (worker), com progresso REAL por arquivo — o app nunca trava.
 */
export async function downloadModel(
  model: WhisperModelId,
  onProgress: (p: WhisperProgress) => void
): Promise<void> {
  const blob = new Blob([WORKER_SRC], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: "module" });
  activeWorker = worker;
  try {
    await new Promise<void>((resolve, reject) => {
      pendingCancel = reject;
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data as { type: string; stage?: string; pct?: number; message?: string };
        if (m.type === "stage" && m.stage) onProgress({ stage: m.stage, pct: m.pct ?? 0 });
        else if (m.type === "done") resolve();
        else if (m.type === "error") reject(new Error(m.message ?? "falha no download do modelo"));
      };
      worker.onerror = (e) => reject(new Error(e.message || "o worker de IA não abriu"));
      worker.postMessage({ type: "download", model: MODEL_IDS[model] });
    });
  } finally {
    pendingCancel = null;
    worker.terminate();
    URL.revokeObjectURL(url);
    if (activeWorker === worker) activeWorker = null;
  }
}

/**
 * Transcreve um blob de mídia e devolve segmentos com timestamps —
 * inclusive POR PALAVRA (usado pro karaokê da legenda).
 * v7: roda num Web Worker (a UI não trava, dá pra cancelar e o progresso
 * é real, janela por janela). Se o worker não abrir, cai no caminho antigo.
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

  try {
    const segs = await transcribeInWorkerWithFallback(pcm, lang, model, onProgress, maxWords);
    if (segs.length) return segs;
    // worker abriu mas não achou fala → tenta o caminho antigo por trechos
    throw new Error("sem fala detectada");
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("cancel")) throw err;
    // worker indisponível (bloqueado?) ou sem fala → caminho antigo na thread principal
    return transcribeLegacy(pcm.slice(), lang, model, onProgress, maxWords);
  }
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
  window?: number; // janela atual (progresso real da transcrição)
  windows?: number; // total de janelas
  setProg: (p: WhisperProgress & { window?: number; windows?: number }) => void;
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
  setProg: (p) => set({ stage: p.stage, pct: p.pct, window: p.window, windows: p.windows }),
  setOpen: (v) => set({ open: v }),
  setMinimized: (v) => set({ minimized: v }),
  start: () => set({ running: true, stage: "prepare", pct: 0, window: undefined, windows: undefined }),
  finish: () => set({ running: false, pct: 1, minimized: false }),
}));
