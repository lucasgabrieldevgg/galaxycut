// GalaxyCut — motor de exportação OFFLINE (quadro a quadro, mais rápido que
// tempo real). Substituiu a gravação em tempo real (MediaRecorder) do v6:
//  - 30s de vídeo NÃO leva mais 30s: o app renderiza cada quadro no canvas e
//    codifica com a GPU/plataforma (WebCodecs) na velocidade que o PC aguentar;
//  - NADA de "mídia não carregada" queimado no vídeo final: cada quadro só é
//    codificado DEPOIS do seek do vídeo terminar de verdade;
//  - a proporção do projeto é respeitada em QUALQUER resolução de saída
//    (o espaço do projeto é escalado pro canvas de exportação);
//  - dá pra cancelar, mostra quadro atual + tempo estimado e não trava a UI
//    (cede o fôlego pro navegador entre lotes de quadros).
// Fallback: se o navegador não tiver WebCodecs (raro — Chrome 94+/Electron
// têm), o Exporter cai no caminho antigo de tempo real.
"use client";

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import { useProject, usePlayback } from "./store";
import { registry } from "./media";
import { drawFrame } from "./render";
import { Clip, clipEnd, fadeEnvelope } from "./types";

export interface OfflineProgressInfo {
  stage: "prepare" | "render" | "finish";
  frame?: number;
  frames?: number;
  etaSec?: number;
  speed?: number; // × tempo real (1 = mesma velocidade de assistir)
}

export interface OfflineOptions {
  shortSide: number;
  fps: number;
  bitrate: number;
  format: "mp4" | "webm9" | "webm8";
  includeAudio?: boolean;
  onProgress: (p: number, info?: OfflineProgressInfo) => void;
  /** objeto vivo: setar cancelled=true aborta o render o quanto antes */
  cancel?: { cancelled: boolean };
}

export interface OfflineResult {
  blob: Blob;
  ext: string;
  mime: string;
  /** vídeo saiu sem faixa de áudio (codificador de áudio indisponível) */
  noAudio?: boolean;
}


const WC = typeof window !== "undefined" ? (window as any) : ({} as any);

/** WebCodecs existe neste navegador? */
export function offlineSupported(): boolean {
  return !!(WC.VideoEncoder && WC.VideoFrame && typeof WC.VideoEncoder === "function");
}

// ---------- dimensões de saída (mesma regra do exporter: qualidade = menor lado) ----------

export function offlineOutputSize(project: { width: number; height: number }, shortSide: number) {
  const aspect = project.width / project.height;
  let W: number;
  let H: number;
  if (aspect >= 1) {
    H = shortSide;
    W = Math.round((H * aspect) / 2) * 2;
  } else {
    W = shortSide;
    H = Math.round(W / aspect / 2) * 2;
  }
  return { W: Math.max(2, W), H: Math.max(2, H) };
}

// ---------- codecs: escada de candidatos (o primeiro suportado vence) ----------

interface VideoCodecPick {
  webcodecs: string; // string pro VideoEncoder
  muxer: string; // codec pro muxer ("avc" | "vp9" | "vp8")
}

function h264Level(W: number, H: number): string {
  const px = W * H;
  if (px <= 1280 * 720) return "avc1.64001f"; // High 3.1
  if (px <= 1920 * 1080) return "avc1.640028"; // High 4.0
  if (px <= 3840 * 2160) return "avc1.640033"; // High 5.1
  return "avc1.640034"; // High 5.2 (8K)
}

function videoCodecCandidates(format: OfflineOptions["format"], W: number, H: number): VideoCodecPick[] {
  if (format === "mp4") {
    const l = h264Level(W, H);
    return [
      { webcodecs: l, muxer: "avc" },
      { webcodecs: l.replace("6400", "4d00"), muxer: "avc" }, // Main
      { webcodecs: l.replace("6400", "42E00"), muxer: "avc" }, // Baseline
      { webcodecs: "vp09.00.10.08", muxer: "vp9" }, // último recurso: VP9 dentro de MP4
    ];
  }
  if (format === "webm9") return [{ webcodecs: "vp09.00.10.08", muxer: "V_VP9" }];
  return [{ webcodecs: "vp8", muxer: "V_VP8" }];
}

async function pickVideoCodec(format: OfflineOptions["format"], W: number, H: number, fps: number, bitrate: number): Promise<VideoCodecPick | null> {
  for (const cand of videoCodecCandidates(format, W, H)) {
    try {
      const support = await WC.VideoEncoder.isConfigSupported({
        codec: cand.webcodecs,
        width: W,
        height: H,
        bitrate,
        framerate: fps,
      });
      if (support?.supported) return cand;
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

// ---------- mix de áudio offline (determinístico, sem tempo real) ----------

/** Mistura TODOS os clipes com som numa OfflineAudioContext e devolve o buffer. */
export async function renderAudioMix(duration: number, onProgress?: (p: number) => void): Promise<AudioBuffer | null> {
  const { clips, tracks } = useProject.getState();
  const withSound = clips.filter((c) => c.kind === "video" || c.kind === "audio");
  const audible = withSound.filter((c) => {
    const track = tracks.find((t) => t.id === c.trackId);
    return !c.muted && !track?.muted && (c.volume ?? 1) > 0.001;
  });
  if (!audible.length) return null;

  const AC: typeof AudioContext = window.AudioContext;
  const probe = new AC();
  const OAC: typeof OfflineAudioContext = window.OfflineAudioContext;
  const off = new OAC(2, Math.max(1, Math.ceil(duration * 48000)), 48000);
  const decoded = new Map<string, AudioBuffer | null>();

  const uniqueIds = [...new Set(audible.map((c) => c.mediaId).filter(Boolean))] as string[];
  let done = 0;
  for (const mediaId of uniqueIds) {
    const blob = registry.getBlob(mediaId);
    if (!blob) {
      decoded.set(mediaId, null);
      continue;
    }
    try {
      const arr = await blob.slice(0).arrayBuffer();
      const buf = await probe.decodeAudioData(arr);
      decoded.set(mediaId, buf);
    } catch {
      // Fallback: se for vídeo e decodeAudioData direto falhar em containers complexos, tenta extrair via elemento de mídia
      try {
        const url = registry.getUrl(mediaId);
        if (url) {
          const resp = await fetch(url);
          const buf = await probe.decodeAudioData(await resp.arrayBuffer());
          decoded.set(mediaId, buf);
        } else {
          decoded.set(mediaId, null);
        }
      } catch {
        decoded.set(mediaId, null);
      }
    }
    done++;
    onProgress?.(done / uniqueIds.length);
  }
  void probe.close();

  for (const c of audible) {
    const buf = c.mediaId ? decoded.get(c.mediaId) : null;
    if (!buf) continue;
    const src = off.createBufferSource();
    src.buffer = buf;
    const speed = Math.max(0.0625, Math.min(16, c.speed || 1));
    src.playbackRate.value = speed;
    const gain = off.createGain();
    const g0 = Math.max(0.0001, c.volume ?? 1);
    const start = Math.max(0, c.start);
    const end = clipEnd(c);
    gain.gain.setValueAtTime(c.fadeIn > 0 ? 0.0001 : g0, start);
    if (c.fadeIn > 0) gain.gain.linearRampToValueAtTime(g0, start + Math.min(c.fadeIn, c.duration));
    if (c.fadeOut > 0) {
      gain.gain.setValueAtTime(g0, Math.max(start, end - c.fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, end);
    }
    src.connect(gain).connect(off.destination);
    const offsetInBuf = Math.max(0, Math.min(buf.duration - 0.01, c.inPoint || 0));
    const durInBuf = Math.max(0.01, Math.min(buf.duration - offsetInBuf, c.duration * speed));
    src.start(start, offsetInBuf, durInBuf);
  }
  return off.startRendering();
}

// ---------- pool de elementos DEDICADOS à exportação ----------

type ExportEl = HTMLVideoElement | HTMLImageElement;

interface ElPool {
  free: ExportEl[];
  all: ExportEl[];
}

function makeExportEl(kind: string, mediaId: string): ExportEl | null {
  const url = registry.getUrl(mediaId);
  if (!url) return null;
  if (kind === "image") {
    const img = new Image();
    img.src = url;
    return img;
  }
  const v = document.createElement("video");
  v.src = url;
  v.preload = "auto";
  v.muted = true; // o som vem do mix offline — export não toca nada
  v.playsInline = true;
  void v.load();
  return v;
}

function elementReady(el: ExportEl): boolean {
  if (el instanceof HTMLImageElement) return el.complete && el.naturalWidth > 0;
  return el.readyState >= 2 && el.videoWidth > 0;
}

function waitForElement(el: ExportEl, timeoutMs: number): Promise<void> {
  if (elementReady(el)) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      el.removeEventListener("loadeddata", fin);
      el.removeEventListener("error", fin);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(fin, timeoutMs);
    if (el instanceof HTMLImageElement) {
      el.addEventListener("load", fin, { once: true });
      el.addEventListener("error", fin, { once: true });
    } else {
      el.addEventListener("loadeddata", fin, { once: true });
      el.addEventListener("error", fin, { once: true });
    }
  });
}

/** Põe o vídeo EXATAMENTE no tempo pedido (espera o seeked de verdade). */
function seekVideo(v: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min((v.duration || time) - 0.001, time));
  if (Math.abs(v.currentTime - target) < 0.002 && v.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      v.removeEventListener("seeked", fin);
      clearTimeout(timer);
      resolve();
    };
    // teto de segurança: PC fraco não pode travar a exportação inteira num seek
    const timer = setTimeout(fin, 4000);
    v.addEventListener("seeked", fin, { once: true });
    try {
      v.currentTime = target;
    } catch {
      fin();
    }
  });
}

// ---------- o motor ----------

export async function exportOffline(opts: OfflineOptions): Promise<OfflineResult> {
  if (!offlineSupported()) throw new Error("WebCodecs indisponível");
  const { project, tracks, clips } = useProject.getState();
  const duration = usePlayback.getState().duration;
  if (duration <= 0) throw new Error("Timeline vazia — adicione mídia antes de exportar.");

  const cancelled = () => !!opts.cancel?.cancelled;
  const throwIfCancelled = () => {
    if (cancelled()) throw new Error("exportação cancelada");
  };

  const { W, H } = offlineOutputSize(project, opts.shortSide);
  const fps = opts.fps;

  // ---- 1) codecs ----
  onProgress0(opts, 0.01, { stage: "prepare" });
  const vPick = await pickVideoCodec(opts.format, W, H, fps, opts.bitrate);
  if (!vPick) throw new Error("no-offline-codec"); // exporter cai no tempo real

  // ---- 2) monta o pool de elementos e espera todos carregarem ----
  const pools = new Map<string, ElPool>(); // mediaId
  const bindings = new Map<string, ExportEl>(); // clipId
  const elKind = (c: Clip) => (c.kind === "image" ? "image" : "video");
  const needed = clips.filter((c) => (c.kind === "video" || c.kind === "image") && c.mediaId && !c.videoHidden);

  // mídia ausente/indecodificável → erro ANTES de começar (nada de placeholder no vídeo)
  for (const c of needed) {
    const meta = useProject.getState().media.find((m) => m.id === c.mediaId);
    if (!meta || !registry.hasBlob(c.mediaId!)) {
      throw new Error(`Mídia “${meta?.name ?? c.mediaId}” não está carregada — reimporte o arquivo antes de exportar.`);
    }
  }

  const getEl = (c: Clip): ExportEl | null => {
    let bound = bindings.get(c.id);
    if (bound) return bound;
    const pool = pools.get(c.mediaId!) ?? { free: [], all: [] };
    pools.set(c.mediaId!, pool);
    bound = pool.free.pop();
    let fresh = false;
    if (!bound) {
      bound = makeExportEl(elKind(c), c.mediaId!) ?? undefined;
      fresh = true;
    }
    if (!bound) return null;
    if (fresh) {
      pool.all.push(bound);
      (bound as any).__gcMedia = c.mediaId; // pro retorno ao pool / limpeza
    }
    bindings.set(c.id, bound);
    return bound;
  };

  // pré-carrega 1 elemento por mídia (o resto nasce sob demanda, quando 2 clipes
  // do mesmo arquivo se sobrepõem)
  let prepared = 0;
  const mediaIds = [...new Set(needed.map((c) => c.mediaId!))];
  const metas = useProject.getState().media;
  for (const mediaId of mediaIds) {
    throwIfCancelled();
    const kind = metas.find((m) => m.id === mediaId)?.kind === "image" ? "image" : "video";
    const pool = pools.get(mediaId) ?? { free: [], all: [] };
    pools.set(mediaId, pool);
    const el = pool.all[0] ?? makeExportEl(kind, mediaId);
    if (!el) continue;
    if (!pool.all.includes(el)) {
      pool.all.push(el);
      (el as any).__gcMedia = mediaId;
    }
    await waitForElement(el, 20000);
    prepared++;
    onProgress0(opts, 0.02 + 0.06 * (prepared / Math.max(1, mediaIds.length)), { stage: "prepare" });
  }
  // solta os pré-carregados de volta pra pool livre
  for (const pool of pools.values()) {
    pool.free = [...pool.all];
  }
  bindings.clear();

  // ---- 3) áudio offline (mix determinístico) ----
  onProgress0(opts, 0.09, { stage: "prepare" });
  let audioBuffer: AudioBuffer | null = null;
  const wantAudio = opts.includeAudio !== false;
  if (wantAudio) {
    try {
      audioBuffer = await renderAudioMix(duration, (p) => onProgress0(opts, 0.09 + 0.06 * p, { stage: "prepare" }));
    } catch {
      audioBuffer = null; // sem áudio tocável → exporta vídeo mudo
    }
  }

  // ---- 4) muxer + codificadores ----
  let noAudio = false;
  const isMp4 = opts.format === "mp4";

  let audioEncoder: any = null;
  let audioConfigured = false;
  if (audioBuffer && wantAudio) {
    const aCodec = isMp4 ? "mp4a.40.2" : "opus";
    try {
      const support = await WC.AudioEncoder.isConfigSupported({
        codec: aCodec,
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 160000,
      });
      if (support?.supported) {
        audioConfigured = true;
      }
    } catch {
      audioConfigured = false;
    }
  }

  let muxer: any;
  if (isMp4) {
    muxer = new Mp4Muxer({
      target: new Mp4Target(),
      video: { codec: vPick.muxer as "avc", width: W, height: H, frameRate: fps },
      audio: audioConfigured
        ? { codec: "aac", numberOfChannels: 2, sampleRate: 48000 }
        : undefined,
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });
  } else {
    muxer = new WebmMuxer({
      target: new WebmTarget(),
      video: { codec: vPick.muxer, width: W, height: H, frameRate: fps },
      audio: audioConfigured
        ? { codec: "A_OPUS", numberOfChannels: 2, sampleRate: 48000 }
        : undefined,
      firstTimestampBehavior: "permissive",
    });
  }

  const videoEncoder = new WC.VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: any) => {
      throw new Error(`Codificador de vídeo falhou: ${e?.message ?? e}`);
    },
  });
  videoEncoder.configure({
    codec: vPick.webcodecs,
    width: W,
    height: H,
    bitrate: opts.bitrate,
    framerate: fps,
    latencyMode: "quality",
  });

  if (audioConfigured && audioBuffer) {
    try {
      const aCodec = isMp4 ? "mp4a.40.2" : "opus";
      audioEncoder = new WC.AudioEncoder({
        output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
        error: (err: any) => console.warn("AudioEncoder error:", err),
      });
      audioEncoder.configure({
        codec: aCodec,
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 160000,
      });
    } catch {
      audioEncoder = null;
    }
  }
  if (!audioEncoder) noAudio = true;

  // ---- 5) render quadro a quadro ----
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const scaledProject = { ...project, width: W, height: H }; // espaço do projeto → saída
  const total = Math.max(1, Math.ceil(duration * fps));
  const frameDur = 1 / fps;
  const startedAt = performance.now();
  let encodedFps = 0;

  const activeAt = (t: number) =>
    needed.filter((c) => c.start <= t + 0.0001 && c.start + c.duration > t - 0.0001);

  for (let i = 0; i < total; i++) {
    throwIfCancelled();
    const t = Math.min(duration - 0.0001, i * frameDur);

    // devolve ao pool quem saiu de cena; pega quem entrou
    const active = activeAt(t);
    const activeIds = new Set(active.map((c) => c.id));
    for (const [clipId, el] of bindings) {
      if (!activeIds.has(clipId)) {
        bindings.delete(clipId);
        pools.get((el as any).__gcMedia ?? "")?.free.push(el);
      }
    }
    for (const c of active) getEl(c); // reserva o elemento de cada clipe ativo

    // coloca cada vídeo no tempo certo e ESPERA o frame de verdade
    const seeks: Promise<void>[] = [];
    for (const c of active) {
      const el = bindings.get(c.id);
      if (!el) continue;
      if (!elementReady(el)) {
        seeks.push(waitForElement(el, 20000)); // nasceu agora (clipe sobreposto): espera carregar
        continue;
      }
      if (el instanceof HTMLVideoElement) {
        const target = c.inPoint + (t - c.start) * (c.speed || 1);
        seeks.push(seekVideo(el, target));
      }
    }
    if (seeks.length) await Promise.all(seeks);

    drawFrame(ctx, scaledProject, tracks, clips, t, {
      getElement: (clipId) => bindings.get(clipId),
    });

    const frame = new WC.VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / fps),
      duration: Math.round(1e6 / fps),
    });
    videoEncoder.encode(frame, { keyFrame: i % Math.max(1, Math.round(fps * 2)) === 0 });
    frame.close();

    // contrapressão: não empilha quadros demais na GPU/CPU (polling — o evento
    // "dequeue" existe no spec mas nem todo build dispara)
    let guard = 0;
    while (videoEncoder.encodeQueueSize > 6 && guard++ < 20000) {
      await new Promise((r) => setTimeout(r, 12));
      throwIfCancelled();
    }

    // progresso + fôlego pra UI (a cada quadro um yield barato)
    if (i % 2 === 0 || i === total - 1) {
      const elapsed = (performance.now() - startedAt) / 1000;
      encodedFps = elapsed > 0.5 ? i / elapsed : fps;
      const eta = encodedFps > 0 ? (total - 1 - i) / encodedFps : undefined;
      onProgress0(opts, 0.15 + 0.8 * ((i + 1) / total), {
        stage: "render",
        frame: i + 1,
        frames: total,
        etaSec: eta,
        speed: encodedFps / fps,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ---- 6) áudio → codificador ----
  throwIfCancelled();
  if (audioBuffer && audioEncoder) {
    onProgress0(opts, 0.96, { stage: "finish" });
    const CH = 2;
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    const CHUNK = 4096;
    for (let off = 0; off < audioBuffer.length; off += CHUNK) {
      const n = Math.min(CHUNK, audioBuffer.length - off);
      const data = new Float32Array(n * CH);
      data.set(left.subarray(off, off + n), 0);
      data.set(right.subarray(off, off + n), n);
      const ad = new WC.AudioData({
        format: "f32-planar",
        sampleRate: 48000,
        numberOfFrames: n,
        numberOfChannels: CH,
        timestamp: Math.round((off / 48000) * 1e6),
        data,
      });
      audioEncoder.encode(ad);
      ad.close();
      if (off % 245760 === 0) await new Promise((r) => setTimeout(r, 0)); // fôlego
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  // ---- 7) finaliza ----
  onProgress0(opts, 0.98, { stage: "finish" });
  await videoEncoder.flush();
  videoEncoder.close();
  muxer.finalize();
  const buffer = muxer.target.buffer as ArrayBuffer;
  onProgress0(opts, 1, { stage: "finish" });

  // limpa os elementos dedicados
  for (const pool of pools.values()) {
    for (const el of pool.all) if (el instanceof HTMLVideoElement) el.removeAttribute("src");
  }

  const mime = isMp4 ? "video/mp4" : "video/webm";
  return { blob: new Blob([buffer], { type: mime }), ext: isMp4 ? "mp4" : "webm", mime, noAudio };
}

function onProgress0(opts: OfflineOptions, p: number, info?: OfflineProgressInfo) {
  opts.onProgress(Math.max(0, Math.min(1, p)), info);
}
