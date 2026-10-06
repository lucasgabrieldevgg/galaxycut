// GalaxyCut — legendas automáticas com IA (Whisper via transformers.js, 100% no navegador)
"use client";

import { create } from "zustand";
import { registry } from "./media";
import { KaraokeWord, Clip } from "./types";
import { decodeAudioOf } from "./wav";

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
  perWinSec?: number; // v7.3: segundos estimados por janela (pro ~restante)
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

// ---------------- Web Worker PERSISTENTE (v7.3) ----------------
// Um worker só pra TODA a sessão: o modelo carrega UMA vez e o asrCache do
// worker sobrevive entre transcrições (nada de "baixando o modelo" de novo a
// cada legenda). Cancelar = matar o worker (a próxima transcrição recria e
// pega o modelo do cache do navegador em segundos).

interface WorkerMsg {
  job?: number;
  type: string;
  stage?: string;
  pct?: number;
  range?: number;
  window?: number;
  windows?: number;
  secs?: number;
  words?: RawWord[];
  message?: string;
  model?: string;
}

let whisperWorker: Worker | null = null;
let whisperJobSeq = 0;
let workerListener: ((m: WorkerMsg) => void) | null = null;
/** rejeição pendente do job atual (o botão Cancelar dispara isso) */
let pendingCancel: ((reason: Error) => void) | null = null;

function ensureWhisperWorker(): Worker {
  if (whisperWorker) return whisperWorker;
  const blob = new Blob([WORKER_SRC], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url, { type: "module" });
  w.onmessage = (ev: MessageEvent) => workerListener?.(ev.data as WorkerMsg);
  w.onerror = (e) => workerListener?.({ type: "error", message: e.message || "o worker de IA não abriu" });
  whisperWorker = w;
  return w;
}

/** Cancela a transcrição em andamento — o worker é morto na hora. */
export function cancelTranscription() {
  const reject = pendingCancel;
  if (whisperWorker) {
    whisperWorker.terminate();
    whisperWorker = null;
  }
  workerListener = null;
  pendingCancel = null;
  if (reject) reject(new Error("cancelada pelo usuário"));
}

/** O modelo já foi baixado/carregado alguma vez? (guarda no localStorage) */
function modelCached(repoId: string): boolean {
  try {
    return localStorage.getItem(`gc_whisper_ready:${repoId}`) === "1";
  } catch {
    return false;
  }
}
function markModelCached(repoId: string) {
  try {
    localStorage.setItem(`gc_whisper_ready:${repoId}`, "1");
  } catch {
    /* noop */
  }
}

/** v7.3: o AVANÇO da barra roda na THREAD PRINCIPAL. O WASM roda síncrono no
 *  worker e bloqueia o event loop dele — o heartbeat antigo (setInterval lá)
 *  nunca disparava e a barra congelava em 10% exatos. Aqui: cada janela
 *  começa com uma base fixa e a estimativa anda aqui fora até o worker
 *  respirar e contar quanto tempo a janela levou DE VERDADE (recalibra). */
function makeEstimatingProgress(onProgress: (p: WhisperProgress) => void, cached: boolean) {
  let timer: number | null = null;
  let estPerWin = 15; // chute inicial em segundos — recalibrado com medidas reais
  let lastPerWin = estPerWin;
  const stop = () => {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };
  const feed = (m: WorkerMsg) => {
    if (m.type === "stage" && m.stage) {
      stop();
      const stage = m.stage === "download" && cached ? "prepare" : m.stage;
      onProgress({ stage, pct: m.pct ?? 0 });
    } else if (m.type === "windowStart") {
      stop();
      const base = m.pct ?? 0;
      const range = m.range ?? 0;
      const w = m.window ?? 0;
      const n = m.windows ?? 0;
      const t0 = performance.now();
      onProgress({ stage: "transcribe", pct: base, window: w, windows: n, perWinSec: Math.round(estPerWin) });
      timer = window.setInterval(() => {
        const elapsed = (performance.now() - t0) / (estPerWin * 1000);
        // avanço assintótico suave que não trava em 88%
        const frac = Math.min(0.96, 1 - Math.exp(-elapsed * 1.4));
        onProgress({ stage: "transcribe", pct: base + range * frac, window: w, windows: n, perWinSec: Math.round(estPerWin) });
      }, 300);
    } else if (m.type === "windowDone") {
      const measured = Math.max(1, m.secs ?? estPerWin);
      estPerWin = 0.4 * estPerWin + 0.6 * measured;
      lastPerWin = estPerWin;
      stop();
      onProgress({ stage: "transcribe", pct: m.pct ?? 0, window: m.window, windows: m.windows, perWinSec: Math.round(estPerWin) });
    }
  };
  return { feed, stop, get perWinSec() { return lastPerWin; } };
}

// código do worker (blob module): importa o transformers.js do CDN, mantém o
// cache de pipelines e responde TUDO com a etiqueta do job (worker persistente
// = várias transcrições na mesma sessão, modelo carregado 1× só)
const WORKER_SRC = `
import { pipeline, env } from "${TRANSFORMERS_URL}";

// configurações seguras pro Web Worker (evita travamento com multi-threading)
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

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

async function loadAsr(msg, reply) {
  let asr = asrCache.get(msg.model);
  if (!asr) {
    reply({ type: "stage", stage: "download", pct: 0 });
    const prog = downloadProgress();
    asr = await pipeline("automatic-speech-recognition", msg.model, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p?.status === "progress") {
          const pct = prog(p);
          if (pct != null) reply({ type: "stage", stage: "download", pct });
        } else if (p?.status === "ready" || p?.status === "done") {
          reply({ type: "stage", stage: "prepare", pct: 1 });
        }
      },
    });
    asrCache.set(msg.model, asr);
    reply({ type: "asrReady", model: msg.model });
  } else {
    reply({ type: "stage", stage: "prepare", pct: 1 });
  }
  return asr;
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  const reply = (o) => self.postMessage({ ...o, job: msg.job });
  try {
    const asr = await loadAsr(msg, reply);

    if (msg.type === "download") {
      reply({ type: "done", words: [] });
      return;
    }
    if (msg.type !== "run") return;

    const WIN = 30;
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
      const basePct = 0.1 + 0.85 * (w / n);
      const rangePct = 0.85 / n;
      reply({ type: "windowStart", pct: basePct, range: rangePct, window: w + 1, windows: n });
      const t0 = performance.now();
      const out = await asr(slice, {
        language: msg.lang === "auto" ? null : msg.lang,
        task: "transcribe",
        chunk_length_s: 30,
        stride_chunk_s: 5,
        return_timestamps: "word",
      });
      const secs = (performance.now() - t0) / 1000;
      reply({ type: "windowDone", pct: basePct + rangePct, window: w + 1, windows: n, secs });
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
    reply({ type: "stage", stage: "transcribe", pct: 0.97, window: n, windows: n });
    reply({ type: "done", words: allWords });
  } catch (err) {
    reply({ type: "error", message: String((err && err.message) || err) });
  }
};
`;

/** Fallback SEM worker (navegadores que bloqueiam blob worker): o código antigo,
 *  só que com yield entre etapas. Usado só se o worker não abrir. */

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

/** Renderiza o áudio composto da timeline (todos os clipes em seus devidos pontos e velocidades) a 16 kHz mono */
export async function extractTimelinePcm16k(
  targetClips: Clip[],
  totalDuration: number
): Promise<Float32Array> {
  const dur = Math.max(0.5, totalDuration);
  const OAC: typeof OfflineAudioContext =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const off = new OAC(1, Math.max(1, Math.ceil(dur * 16000)), 16000);

  // Decodifica áudios únicos para não decodificar o mesmo blob 2 vezes
  const audioBufferCache = new Map<string, AudioBuffer>();
  for (const c of targetClips) {
    if (!c.mediaId || c.muted || c.videoHidden) continue;
    if (!audioBufferCache.has(c.mediaId)) {
      const blob = registry.getBlob(c.mediaId);
      if (blob) {
        try {
          const ab = await decodeAudioOf(blob, 5);
          if (ab) audioBufferCache.set(c.mediaId, ab);
        } catch {}
      }
    }
  }

  for (const c of targetClips) {
    if (!c.mediaId || c.muted || c.videoHidden) continue;
    const buf = audioBufferCache.get(c.mediaId);
    if (!buf) continue;

    const src = off.createBufferSource();
    src.buffer = buf;
    const speed = c.speed || 1;
    src.playbackRate.value = speed;

    const gainNode = off.createGain();
    gainNode.gain.value = c.volume ?? 1;
    src.connect(gainNode);
    gainNode.connect(off.destination);

    const playDuration = Math.min(c.duration, Math.max(0, buf.duration - c.inPoint) / speed);
    if (playDuration > 0.05) {
      src.start(c.start, Math.max(0, c.inPoint), playDuration * speed);
    }
  }

  const resampled = await off.startRendering();
  return new Float32Array(resampled.getChannelData(0));
}

/** Extrai PCM mono 16 kHz de qualquer arquivo de áudio ou vídeo */
async function extractPcm16k(blob: Blob): Promise<Float32Array> {
  const buf = await decodeAudioOf(blob);
  const OAC: typeof OfflineAudioContext =
    window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const off = new OAC(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0);
  const resampled = await off.startRendering();
  return new Float32Array(resampled.getChannelData(0));
}

interface RawWord {
  w: string;
  s: number;
  e: number;
}

/** Transcreve tentando os modelos da cadeia no worker PERSISTENTE
 *  (fallback: pedido → base → tiny). O pcm é clonado por tentativa porque o
 *  postMessage TRANSFERE o buffer (que fica neutroizado). */
async function transcribeInWorkerWithFallback(
  pcm: Float32Array,
  lang: string,
  model: WhisperModelId,
  onProgress: (p: WhisperProgress) => void,
  maxWords: number
): Promise<SubSegment[]> {
  let lastErr: unknown = null;
  for (const repoId of fallbackChain(model)) {
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

/** Roda UMA transcrição no worker persistente com protocolo de jobs (as
 *  mensagens voltam etiquetadas — nada de resposta cruzada entre tentativas). */
async function transcribeInWorkerOnce(
  pcm: Float32Array,
  repoId: string,
  lang: string,
  onProgress: (p: WhisperProgress) => void,
  maxWords: number
): Promise<SubSegment[]> {
  const worker = ensureWhisperWorker();
  const job = ++whisperJobSeq;
  const cached = modelCached(repoId);
  const est = makeEstimatingProgress(onProgress, cached);
  try {
    const words = await new Promise<RawWord[]>((resolve, reject) => {
      pendingCancel = reject; // o botão Cancelar dispara esta rejeição
      workerListener = (m) => {
        if (m.job !== job) return; // resposta de outro job
        if (m.type === "asrReady") {
          markModelCached(String(m.model ?? repoId));
          return;
        }
        if (m.type === "done") {
          resolve(m.words ?? []);
          return;
        }
        if (m.type === "error") {
          reject(new Error(m.message ?? "falha na transcrição"));
          return;
        }
        est.feed(m);
      };
      worker.postMessage({ job, type: "run", pcm, lang, model: repoId });
    });
    onProgress({ stage: "transcribe", pct: 0.98, perWinSec: est.perWinSec });
    if (!words.length) return [];
    return groupWords(words, Math.max(2, Math.min(6, maxWords)));
  } finally {
    est.stop();
    pendingCancel = null;
    workerListener = null;
  }
}

/**
 * Baixa um modelo de IA pra deixar pronto (onboarding). Worker persistente com
 * progresso REAL por arquivo — o app nunca trava, e o modelo fica em cache.
 */
export async function downloadModel(
  model: WhisperModelId,
  onProgress: (p: WhisperProgress) => void
): Promise<void> {
  const repoId = MODEL_IDS[model];
  if (modelCached(repoId)) {
    // já baixou outra vez: só esquenta o worker (a carga sai do cache em segundos)
    onProgress({ stage: "prepare", pct: 0.02 });
  }
  const worker = ensureWhisperWorker();
  const job = ++whisperJobSeq;
  const cached = modelCached(repoId);
  const est = makeEstimatingProgress(onProgress, cached);
  try {
    await new Promise<void>((resolve, reject) => {
      pendingCancel = reject;
      workerListener = (m) => {
        if (m.job !== job) return;
        if (m.type === "asrReady") {
          markModelCached(String(m.model ?? repoId));
          return;
        }
        if (m.type === "done") {
          resolve();
          return;
        }
        if (m.type === "error") {
          reject(new Error(m.message ?? "falha no download do modelo"));
          return;
        }
        est.feed(m);
      };
      worker.postMessage({ job, type: "download", model: repoId });
    });
  } finally {
    est.stop();
    pendingCancel = null;
    workerListener = null;
  }
}

/**
 * Transcreve toda a composição da timeline (ou grupo de clipes) com timestamps
 * absolutos 100% alinhados com o relógio da timeline.
 */
export async function transcribeTimeline(
  targetClips: Clip[],
  totalDuration: number,
  lang: string,
  onProgress: (p: WhisperProgress) => void,
  model: WhisperModelId = "base",
  maxWords: number = 4
): Promise<SubSegment[]> {
  onProgress({ stage: "prepare", pct: 0.02 });
  const pcm = await extractTimelinePcm16k(targetClips, totalDuration);
  onProgress({ stage: "prepare", pct: 0.08 });

  try {
    const segs = await transcribeInWorkerWithFallback(pcm, lang, model, onProgress, maxWords);
    if (segs.length) return segs;
    throw new Error("sem fala detectada");
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("cancel")) throw err;
    return transcribeLegacy(pcm.slice(), lang, model, onProgress, maxWords);
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
  perWinSec?: number; // v7.3: segundos estimados por janela (pro ~restante)
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
  setProg: (p) => set({ stage: p.stage, pct: p.pct, window: p.window, windows: p.windows, perWinSec: p.perWinSec }),
  setOpen: (v) => set({ open: v }),
  setMinimized: (v) => set({ minimized: v }),
  start: () => set({ running: true, stage: "prepare", pct: 0, window: undefined, windows: undefined, perWinSec: undefined }),
  finish: () => set({ running: false, pct: 1, minimized: false }),
}));
