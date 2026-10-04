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
    if (this.blobs.get(id) !== blob && this.urls.has(id)) {
      URL.revokeObjectURL(this.urls.get(id)!);
      this.urls.delete(id);
    }
    this.blobs.set(id, blob);
    if (!this.urls.has(id)) this.urls.set(id, URL.createObjectURL(blob));
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

  duplicate(id: string, newId = uid()): Blob | undefined {
    const b = this.blobs.get(id);
    if (!b) return undefined;
    this.put(newId, b);
    return b;
  }

  guessKind(file: File | Blob, name: string): "video" | "image" | "audio" {
    if (file instanceof File) {
      if (file.type.startsWith("video/")) return "video";
      if (file.type.startsWith("image/")) return "image";
      if (file.type.startsWith("audio/")) return "audio";
    }
    const n = name.toLowerCase();
    if (/\.(mp4|webm|mov|mkv|m4v|avi|flv|wmv|ts)$/.test(n)) return "video";
    if (/\.(png|jpe?g|webp|gif|avif|bmp|svg)$/.test(n)) return "image";
    if (/\.(mp3|wav|ogg|m4a|aac|flac|opus|wma|aiff)$/.test(n)) return "audio";
    return "video";
  }

  /** Importa um arquivo com segurança total */
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
      console.warn("probe error, using fallback meta:", err);
      // Fallback seguro em vez de lançar erro e travar o app
      const url = this.urls.get(id) || "";
      if (kind === "video") {
        meta = { id, name, kind: "video", duration: 5, width: 1920, height: 1080, thumbnail: "", source: "local" };
      } else if (kind === "image") {
        meta = { id, name, kind: "image", duration: 4.8, width: 1080, height: 1080, thumbnail: "", source: "local" };
      } else {
        meta = { id, name, kind: "audio", duration: 10, width: 0, height: 0, source: "local" };
      }
    }
    this.cachedMetas.set(id, meta);
    return meta;
  }

  /** Revincula mídia ausente após recarregar a página */
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
    return { id, name, kind: "image", duration: 4.8, width: img.naturalWidth || 1080, height: img.naturalHeight || 1080, thumbnail, source: "local" };
  }

  private async probeVideo(id: string, name: string, url: string): Promise<MediaMeta> {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    v.src = url;

    try {
      v.load();
    } catch {}

    let duration = 5;
    let width = 1920;
    let height = 1080;
    let thumbnail = "";

    try {
      await waitMediaReady(v, 6000);
      if (isFinite(v.duration) && v.duration > 0) duration = v.duration;
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        width = v.videoWidth;
        height = v.videoHeight;
      }

      try {
        thumbnail = await new Promise<string>((resolve) => {
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
          setTimeout(finish, 1500);
          try {
            v.currentTime = Math.min(duration / 2, 0.5);
          } catch {
            finish();
          }
        });
      } catch {
        thumbnail = "";
      }
    } catch (e) {
      console.warn("probeVideo warning:", e);
    }

    let peaks: number[] | undefined;
    try {
      const blob = this.blobs.get(id);
      if (blob && blob.size < 400 * 1024 * 1024) peaks = await computePeaks(blob, duration, 900);
    } catch {
      peaks = undefined;
    }
    return { id, name, kind: "video", duration, width, height, thumbnail, peaks, source: "local" };
  }

  private async probeAudio(id: string, name: string, url: string, blob: Blob): Promise<MediaMeta> {
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.src = url;
    let duration = 10;
    try {
      await waitMediaReady(a, 5000);
      duration = isFinite(a.duration) && a.duration > 0 ? a.duration : 10;
    } catch {}
    let peaks: number[] | undefined;
    try {
      peaks = await computePeaks(blob, duration);
    } catch {
      peaks = undefined;
    }
    return { id, name, kind: "audio", duration, width: 0, height: 0, peaks, source: "local" };
  }
}

function waitMediaReady(el: HTMLMediaElement, timeoutMs = 6000): Promise<void> {
  return new Promise((res, rej) => {
    if (el.readyState >= 1) return res();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      el.removeEventListener("loadedmetadata", onOk);
      el.removeEventListener("loadeddata", onOk);
      el.removeEventListener("canplay", onOk);
      el.removeEventListener("error", onErr);
      clearTimeout(timer);
      if (ok) res();
      else rej(new Error("Timeout ao carregar mídia"));
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    el.addEventListener("loadedmetadata", onOk, { once: true });
    el.addEventListener("loadeddata", onOk, { once: true });
    el.addEventListener("canplay", onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
    const timer = setTimeout(() => {
      if (el.readyState >= 1) finish(true);
      else finish(false);
    }, timeoutMs);
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
  const [c, ctx] = thumbCanvas(img.naturalWidth || 1080, img.naturalHeight || 1080);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.55);
}

async function computePeaks(blob: Blob, duration: number, sampleCount = 600): Promise<number[]> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return [];
  const ctx = new AC();
  try {
    const buf = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / sampleCount));
    const peaks: number[] = [];
    for (let i = 0; i < ch.length; i += step) {
      let max = 0;
      for (let j = 0; j < step && i + j < ch.length; j++) {
        const v = Math.abs(ch[i + j]);
        if (v > max) max = v;
      }
      peaks.push(Math.round(max * 100) / 100);
    }
    return peaks;
  } finally {
    try {
      await ctx.close();
    } catch {}
  }
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
        registry.put(m.id, blob, { persist: false });
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
