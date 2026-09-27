// GaláxiaCut — registro de mídia (blobs, URLs, miniaturas, picos de áudio)
"use client";

import { MediaMeta, uid } from "./types";
import { idbDel, idbGet, idbPut } from "./mediaDB";

class MediaRegistry {
  private blobs = new Map<string, Blob>();
  private urls = new Map<string, string>();
  private cachedMetas = new Map<string, MediaMeta>();
  private hydrated = new Set<string>();

  hasBlob(id: string) {
    return this.blobs.has(id);
  }

  getUrl(id: string): string | undefined {
    return this.urls.get(id);
  }

  getBlob(id: string): Blob | undefined {
    return this.blobs.get(id);
  }

  put(id: string, blob: Blob, opts?: { persist?: boolean }) {
    // reimportou/revinculou com arquivo NOVO? troca a URL (a antiga apontava pro blob velho)
    if (this.blobs.get(id) !== blob && this.urls.has(id)) {
      URL.revokeObjectURL(this.urls.get(id)!);
      this.urls.delete(id);
    }
    this.blobs.set(id, blob);
    if (!this.urls.has(id)) this.urls.set(id, URL.createObjectURL(blob));
    // persiste no IndexedDB pra sobreviver ao F5 (salvo pedido expresso pra não salvar)
    if (opts?.persist !== false) idbPut(id, blob);
  }

  drop(id: string) {
    const u = this.urls.get(id);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(id);
    this.blobs.delete(id);
    this.cachedMetas.delete(id);
    idbDel(id);
  }

  guessKind(file: File | Blob, name: string): "video" | "image" | "audio" {
    if (file instanceof File) {
      if (file.type.startsWith("video/")) return "video";
      if (file.type.startsWith("image/")) return "image";
      if (file.type.startsWith("audio/")) return "audio";
    }
    const n = name.toLowerCase();
    if (/\.(mp4|webm|mov|mkv|m4v|avi)$/.test(n)) return "video";
    if (/\.(png|jpe?g|webp|gif|avif|bmp)$/.test(n)) return "image";
    if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(n)) return "audio";
    return "video";
  }

  /** Importa um arquivo: gera meta com dimensões, duração, miniatura e picos.
   *  Arquivo que o navegador não abre → ERRO na hora (nada de clipe zumbi
   *  com "mídia não carregada" pra sempre na timeline). */
  async importFile(file: File | Blob, forcedName?: string): Promise<MediaMeta> {
    const name = forcedName || (file instanceof File ? file.name : "mídia");
    const kind = this.guessKind(file, name);
    const id = uid();
    this.put(id, file);
    let meta: MediaMeta;
    try {
      if (kind === "image") meta = await this.probeImage(id, name, file);
      else if (kind === "video") meta = await this.probeVideo(id, name, this.urls.get(id)!);
      else meta = await this.probeAudio(id, name, this.urls.get(id)!, file);
    } catch (err) {
      this.drop(id); // não deixa blob órfão no IndexedDB
      throw err;
    }
    this.cachedMetas.set(id, meta);
    return meta;
  }

  /** Revincula mídia ausente após recarregar a página. Também persiste a nova versão. */
  async relink(id: string, file: File | Blob): Promise<MediaMeta | null> {
    this.put(id, file);
    const old = this.cachedMetas.get(id);
    const kind = this.guessKind(file, old?.name ?? "mídia");
    let meta: MediaMeta;
    if (kind === "image") meta = await this.probeImage(id, old?.name ?? "imagem", file);
    else if (kind === "video") meta = await this.probeVideo(id, old?.name ?? "vídeo", this.urls.get(id)!);
    else meta = await this.probeAudio(id, old?.name ?? "áudio", this.urls.get(id)!, file);
    this.cachedMetas.set(id, meta);
    return meta;
  }

  private async probeImage(id: string, name: string, blob: Blob): Promise<MediaMeta> {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Falha ao carregar imagem"));
      img.src = url;
    });
    const thumbnail = thumbFromImage(img);
    URL.revokeObjectURL(url);
    return { id, name, kind: "image", duration: 4.8, width: img.naturalWidth, height: img.naturalHeight, thumbnail, source: "local" };
  }

  private async probeVideo(id: string, name: string, url: string): Promise<MediaMeta> {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.src = url;
    await waitEvent(v, "loadedmetadata", "Falha ao carregar vídeo");
    const duration = isFinite(v.duration) && v.duration > 0 ? v.duration : 5;
    // miniatura no meio do clipe
    const thumbnail = await new Promise<string>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          resolve(thumbFromVideo(v));
        } catch {
          resolve("");
        }
      };
      v.addEventListener("seeked", finish, { once: true });
      setTimeout(finish, 2500);
      try {
        v.currentTime = Math.min(duration / 2, 1);
      } catch {
        finish();
      }
    });
    // picos de áudio do vídeo (waveform dentro do clipe) — melhor esforço
    let peaks: number[] | undefined;
    try {
      const blob = this.blobs.get(id);
      if (blob && blob.size < 400 * 1024 * 1024) peaks = await computePeaks(blob, duration, 900);
    } catch {
      peaks = undefined;
    }
    return { id, name, kind: "video", duration, width: v.videoWidth, height: v.videoHeight, thumbnail, peaks, source: "local" };
  }

  private async probeAudio(id: string, name: string, url: string, blob: Blob): Promise<MediaMeta> {
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.src = url;
    let duration = 10;
    try {
      await waitEvent(a, "loadedmetadata", "Falha ao carregar áudio");
      duration = isFinite(a.duration) && a.duration > 0 ? a.duration : 10;
    } catch {
      /* mantém fallback */
    }
    let peaks: number[] | undefined;
    try {
      peaks = await computePeaks(blob, duration);
    } catch {
      peaks = undefined;
    }
    return { id, name, kind: "audio", duration, width: 0, height: 0, peaks, source: "local" };
  }
}

function waitEvent(el: HTMLMediaElement, ev: string, errMsg: string): Promise<void> {
  return new Promise((res, rej) => {
    const ok = () => cleanup(true);
    const fail = () => cleanup(false);
    const cleanup = (success: boolean) => {
      el.removeEventListener(ev, ok);
      el.removeEventListener("error", fail);
      clearTimeout(timer);
      if (success) res();
      else rej(new Error(errMsg));
    };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", fail, { once: true });
    // antes o timeout "resolvia" como sucesso — arquivo travado virava clipe zumbi
    // com "mídia não carregada" pra sempre. Agora: erro claro na importação.
    const timer = setTimeout(() => {
      if (el.readyState >= 1) cleanup(true); // já tem metadata (evento só atrasou)
      else cleanup(false);
    }, 12000);
  });
}

function thumbCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  const H = 120;
  const W = Math.max(2, Math.round((w / Math.max(1, h)) * H));
  c.width = Math.min(320, Math.max(48, W));
  c.height = H;
  const ctx = c.getContext("2d")!;
  return [c, ctx];
}

function thumbFromVideo(v: HTMLVideoElement): string {
  const [c, ctx] = thumbCanvas(v.videoWidth || 1080, v.videoHeight || 1920);
  ctx.drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.55);
}

function thumbFromImage(img: HTMLImageElement): string {
  const [c, ctx] = thumbCanvas(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.55);
}

/** Decodifica o áudio e calcula picos normalizados para desenhar a waveform. */
export async function computePeaks(blob: Blob, duration: number, buckets = 900): Promise<number[]> {
  const AC: typeof AudioContext = window.AudioContext;
  const ctx = new AC();
  const buf = await ctx.decodeAudioData(await blob.slice(0).arrayBuffer());
  const ch = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / buckets));
  const peaks: number[] = [];
  let max = 0.0001;
  for (let i = 0; i < buckets; i++) {
    let m = 0;
    const from = i * step;
    const to = Math.min(ch.length, from + step);
    for (let j = from; j < to; j += 4) {
      const a = Math.abs(ch[j]);
      if (a > m) m = a;
    }
    peaks.push(m);
    if (m > max) max = m;
  }
  void duration;
  ctx.close();
  return peaks.map((p) => Math.round(Math.min(1, p / max) * 100) / 100);
}

/**
 * Recupera do IndexedDB os arquivos das mídias cujo blob NÃO está no registro
 * (depois do F5 o registro nasce vazio — independe da flag missing do localStorage,
 * que só retrata o momento em que o projeto foi salvo).
 */
export async function rehydrateMedia(metas: MediaMeta[]): Promise<MediaMeta[]> {
  const need = metas.filter((m) => !registry.hasBlob(m.id));
  if (!need.length) return metas;
  const fixed = new Set<string>();
  for (const m of need) {
    try {
      const blob = await idbGet(m.id);
      if (blob) {
        registry.put(m.id, blob, { persist: false }); // já está salvo — não grava de novo
        fixed.add(m.id);
      }
    } catch {
      /* sem chance — continua ausente */
    }
  }
  if (!fixed.size) return metas;
  return metas.map((m) => (fixed.has(m.id) ? { ...m, missing: false } : m));
}

export const registry = new MediaRegistry();
