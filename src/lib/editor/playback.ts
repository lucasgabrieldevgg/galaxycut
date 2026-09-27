// GalaxyCut — motor de playback (rAF + sincronização de mídia + preview)
// v4: elementos COMPARTILHADOS por mídia (os pedaços do cortar-silêncio tocam
// contínuos, sem N elementos decodificando o mesmo arquivo = fim das travadas),
// a seta para no fim do conteúdo visível/audível e temos medidor de som.
"use client";

import { computeEffectiveDuration, usePlayback, useProject } from "./store";
import { registry } from "./media";
import { audioEngine } from "./audio";
import { drawFrame, MediaStatus } from "./render";
import { Clip, clipEnd, fadeEnvelope } from "./types";
import type { PlayheadMode } from "./settings";
import { toast } from "sonner";

type MediaEl = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;

/** chave do elemento: `${clipKind}:${mediaId}` (+ "#n" quando o mesmo arquivo é usado 2× ao mesmo tempo) */
function elKeyOf(kind: string, mediaId: string, n = 0): string {
  return `${kind}:${mediaId}${n ? `#${n}` : ""}`;
}

class PlaybackEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private elements = new Map<string, MediaEl>();
  private elMeta = new Map<string, { kind: string; mediaId: string }>();
  /** qual elemento cada clipe está usando agora */
  private bindings = new Map<string, string>();
  /** clipes ativos no último sync (quem "possui" cada elemento) */
  private claims = new Map<string, string>(); // elKey -> clipId
  private lastAttach = new Map<string, MediaEl>();
  private raf = 0;
  private last = 0;
  private dirty = true;
  private disposed = false;
  /** deu play com mídia ainda carregando? segura e toca sozinho quando 100% chegar */
  private pendingPlay = false;
  // deslize suave da seta (modo "Suave")
  private glideRaf = 0;
  private glideTarget: number | null = null;

  bind(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.startLoop();
    // hook de depuração/testes: window.__gcEngine (sem ele, o motor é
    // inacessível do console — todo smoke test de mídia passa por aqui)
    if (typeof window !== "undefined") (window as unknown as { __gcEngine?: PlaybackEngine }).__gcEngine = this;
    // re-render quando qualquer estado relevante muda
    useProject.subscribe(() => {
      this.dirty = true;
      this.syncPool();
      this.recomputeDuration();
    });
    this.syncPool();
    this.recomputeDuration();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.glideRaf);
    this.glideTarget = null;
    for (const el of this.elements.values()) {
      if (el instanceof HTMLMediaElement) el.pause();
    }
    this.elements.clear();
    this.bindings.clear();
    this.claims.clear();
  }

  private startLoop() {
    if (this.disposed) return;
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const pb = usePlayback.getState();
      if (pb.playing) {
        const t = pb.playhead + dt;
        const dur = pb.duration;
        if (t >= dur && dur > 0) {
          // acabou o conteúdo visível/audível → a seta PARA aqui
          usePlayback.getState().setPlayhead(dur);
          this.pause();
        } else {
          usePlayback.getState().setPlayhead(t);
        }
      }
      const cur = usePlayback.getState();
      // o usuário deu play mas a mídia não tinha carregado inteira: quando tudo
      // chega em 100%, a reprodução começa SOZINHA (nunca mais vídeo engasgando)
      if (this.pendingPlay && !cur.playing && this.allMediaReady()) {
        this.pendingPlay = false;
        this.play();
      }
      if (cur.playing || this.dirty) {
        this.syncMedia(cur.playhead, cur.playing);
        this.updateAudio(cur.playhead);
        this.renderPreview(cur.playhead);
        this.dirty = false;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- estado ----------
  private recomputeDuration() {
    const { clips, tracks } = useProject.getState();
    const d = computeEffectiveDuration(clips, tracks);
    const cur = usePlayback.getState();
    if (Math.abs(cur.duration - d) > 0.0001) cur.setDuration(d);
    if (cur.playhead > d) cur.setPlayhead(d);
  }

  /** Cria o elemento de mídia do zero. Erro de decodificação → marca a mídia
   *  (o painel avisa e o preview explica em vez de "não carregada" pra sempre). */
  private createEl(kind: string, mediaId: string): MediaEl | null {
    const url = registry.getUrl(mediaId);
    if (!url) return null;
    const onErr = () => this.flagDecodeError(mediaId);
    if (kind === "image") {
      const img = new Image();
      img.onerror = onErr;
      img.src = url;
      img.onload = () => (this.dirty = true);
      return img;
    }
    if (kind === "audio") {
      const a = document.createElement("audio");
      a.src = url;
      a.preload = "auto";
      a.addEventListener("error", onErr);
      a.addEventListener("seeked", () => (this.dirty = true));
      this.prewarmEl(a);
      return a;
    }
    const v = document.createElement("video");
    v.src = url;
    v.preload = "auto";
    v.playsInline = true;
    v.muted = false;
    v.addEventListener("error", onErr);
    v.addEventListener("seeked", () => (this.dirty = true));
    v.addEventListener("loadeddata", () => (this.dirty = true));
    this.prewarmEl(v);
    return v;
  }

  /** v7.2: a mídia CARREGA INTEIRA assim que entra na timeline — e o navegador
   *  é FORÇADO a isso: quando o buffer para de andar, pulamos pro maior
   *  pedaço ainda não carregado (o seek obriga o player a ler aquela região).
   *  Arquivos locais (blob) terminam em instantes; o teto de 90s cobre os
   *  casos extremos. Enquanto isso a tela mostra a % andando. */
  private prewarmEl(el: HTMLMediaElement) {
    const startedAt = performance.now();
    let lastBuffered = -1;
    let stalls = 0;
    const poll = () => {
      this.dirty = true; // repinta a prévia (a % do placeholder anda)
      const dur = isFinite(el.duration) ? el.duration : 0;
      let buffered = 0;
      try {
        buffered = el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0;
      } catch {
        buffered = 0;
      }
      const done = (el.readyState >= 4 && dur > 0 && buffered >= dur * 0.985) || (dur > 0 && buffered >= dur - 0.15);
      const timedOut = performance.now() - startedAt > 90_000;
      if (!done && !timedOut && el.error === null) {
        if (dur > 0 && el.readyState >= 1) {
          if (buffered > lastBuffered + 0.01) {
            stalls = 0; // andou
          } else if (++stalls >= 6) {
            // buffer parado: pula pro meio do maior buraco não carregado
            stalls = 0;
            let hole = -1;
            try {
              for (let i = 0; i < el.buffered.length; i++) {
                const end = el.buffered.end(i);
                const next = i + 1 < el.buffered.length ? el.buffered.start(i + 1) : dur;
                if (next - end > 0.5) {
                  hole = (end + next) / 2;
                  break;
                }
              }
            } catch {
              /* noop */
            }
            if (hole < 0) hole = Math.min(dur - 0.1, buffered + 1);
            try {
              el.currentTime = Math.max(0, Math.min(dur - 0.05, hole));
            } catch {
              /* ainda não seekable */
            }
          }
          lastBuffered = buffered;
        }
        setTimeout(poll, 220);
      } else {
        this.dirty = true;
      }
    };
    setTimeout(poll, 240);
  }

  /** v7.2: TODA a mídia do projeto (vídeo/áudio/imagem dos clipes) tá 100%
   *  carregada? O play só deixa assistir com tudo pronto — nada de
   *  "carregando" no meio da reprodução. */
  allMediaReady(): boolean {
    const { clips, media } = useProject.getState();
    for (const c of clips) {
      if (c.kind === "text" || c.videoHidden) continue;
      if (!c.mediaId) continue;
      const m = media.find((x) => x.id === c.mediaId);
      if (!m || m.missing || m.decodeError || !registry.hasBlob(c.mediaId)) continue; // desses a gente não espera
      const el = this.elements.get(this.bindings.get(c.id) ?? elKeyOf(c.kind, c.mediaId));
      if (!el) return false; // nem criou ainda
      if (el instanceof HTMLImageElement) {
        if (!el.complete || !el.naturalWidth) return false;
        continue;
      }
      if (!(el instanceof HTMLMediaElement)) continue;
      const dur = isFinite(el.duration) ? el.duration : 0;
      if (dur <= 0) return false; // metadado nem chegou
      let buf = 0;
      try {
        buf = el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0;
      } catch {
        buf = 0;
      }
      if (buf < Math.min(dur - 0.15, dur * 0.985)) return false;
    }
    return true;
  }

  /** Arquivo que o navegador não decodifica → aviso ÚNICO e claro pro dono. */
  private flagDecodeError(mediaId: string) {
    const st = useProject.getState();
    const m = st.media.find((x) => x.id === mediaId);
    if (!m || m.decodeError) return;
    st.updateMedia(mediaId, { decodeError: true });
    toast.error(`Não consegui ler "${m.name}"`, {
      description: "Este formato não abre no navegador — converta pra MP4 (H.264) ou WebM e reimporte.",
    });
  }

  private getOrCreateEl(kind: string, mediaId: string, n = 0): MediaEl | undefined {
    const key = elKeyOf(kind, mediaId, n);
    let el = this.elements.get(key);
    if (!el) {
      el = this.createEl(kind, mediaId) ?? undefined;
      if (!el) return undefined;
      this.elements.set(key, el);
      this.elMeta.set(key, { kind, mediaId });
    }
    return el;
  }

  private syncPool() {
    const { clips, media } = useProject.getState();
    const liveClipIds = new Set(clips.map((c) => c.id));
    // remove bindings de clipes apagados
    for (const [clipId, key] of this.bindings) {
      if (!liveClipIds.has(clipId)) {
        this.bindings.delete(clipId);
        audioEngine.dropClip(clipId);
        this.lastAttach.delete(clipId);
      }
    }
    // mídias ainda em uso (com blob disponível)
    const needed = new Set<string>();
    for (const c of clips) {
      if (c.kind === "text" || !c.mediaId) continue;
      if (media.some((m) => m.id === c.mediaId) && registry.hasBlob(c.mediaId)) needed.add(c.mediaId);
    }
    // remove elementos de mídias que saíram do projeto
    for (const [key, meta] of this.elMeta) {
      if (!needed.has(meta.mediaId)) {
        const el = this.elements.get(key);
        if (el instanceof HTMLMediaElement) {
          el.pause();
          el.removeAttribute("src");
        }
        this.elements.delete(key);
        this.elMeta.delete(key);
        audioEngine.dropClip(key);
        this.lastAttach.delete(key);
        const owner = this.claims.get(key);
        if (owner) {
          this.claims.delete(key);
          this.bindings.delete(owner);
        }
      }
    }
    // garante 1 elemento por (tipo de clipe + mídia) — compartilhado entre os pedaços
    for (const c of clips) {
      if (c.kind === "text" || !c.mediaId) continue;
      if (!registry.hasBlob(c.mediaId)) continue;
      const el = this.getOrCreateEl(c.kind === "video" ? "video" : c.kind === "audio" ? "audio" : "image", c.mediaId);
      // reimportou o arquivo? o src do elemento troca pro blob novo
      const url = registry.getUrl(c.mediaId);
      if (el instanceof HTMLMediaElement && url && el.src !== url) {
        el.src = url;
        el.load();
        this.dirty = true;
      }
      if (!this.bindings.has(c.id)) this.bindings.set(c.id, elKeyOf(c.kind, c.mediaId));
    }
  }

  /** Estado da mídia de um clipe (placeholder honesto no preview). */
  statusOf(clipId: string): MediaStatus {
    const c = useProject.getState().clips.find((x) => x.id === clipId);
    if (!c?.mediaId) return "missing";
    const { media } = useProject.getState();
    const m = media.find((x) => x.id === c.mediaId);
    if (!m || m.missing || !registry.hasBlob(c.mediaId)) return "missing";
    if (m.decodeError) return "error";
    const el = this.elements.get(this.bindings.get(clipId) ?? "");
    if (!el) return "loading";
    if (el instanceof HTMLVideoElement) {
      if (el.readyState >= 2) return "ok";
      // buffer quase inteiro? o decode tá chegando (era o piscar de
      // "carregando" a cada seek no navegador) — conta como pronto
      const dur = isFinite(el.duration) ? el.duration : 0;
      try {
        if (dur > 0 && el.buffered.length && el.buffered.end(el.buffered.length - 1) >= dur * 0.97) return "ok";
      } catch {
        /* noop */
      }
      return "loading";
    }
    if (el instanceof HTMLImageElement) return el.complete && el.naturalWidth > 0 ? "ok" : "loading";
    return "ok";
  }

  /** Quanto do arquivo já foi carregado (0..1) — alimenta o “carregando… N%” do preview. */
  loadProgress(clipId: string): number | null {
    const key = this.bindings.get(clipId) ?? elKeyOf("video", "");
    let el = this.elements.get(this.bindings.get(clipId) ?? "");
    if (!el) {
      const c = useProject.getState().clips.find((x) => x.id === clipId);
      if (c?.mediaId) el = this.elements.get(elKeyOf(c.kind === "image" ? "image" : c.kind, c.mediaId));
    }
    void key;
    if (!el) return null;
    if (el instanceof HTMLVideoElement) {
      if (!isFinite(el.duration) || el.duration <= 0) return null;
      try {
        return el.buffered.length ? Math.min(1, el.buffered.end(el.buffered.length - 1) / el.duration) : 0;
      } catch {
        return null;
      }
    }
    if (el instanceof HTMLImageElement) return el.complete ? 1 : 0;
    if (el instanceof HTMLAudioElement) {
      if (!isFinite(el.duration) || el.duration <= 0) return null;
      try {
        return el.buffered.length ? Math.min(1, el.buffered.end(el.buffered.length - 1) / el.duration) : 0;
      } catch {
        return null;
      }
    }
    return null;
  }

  activeClips(t: number): Clip[] {
    const { clips } = useProject.getState();
    return clips.filter((c) => c.start <= t + 0.0001 && c.start + c.duration > t - 0.0001);
  }

  /** Elemento de mídia de um clipe (para desenhar no canvas de exportação). */
  getElement(clipId: string): MediaEl | undefined {
    const key = this.bindings.get(clipId);
    if (key) return this.elements.get(key);
    // fallback: primeiro elemento da mídia desse clipe
    const c = useProject.getState().clips.find((x) => x.id === clipId);
    if (!c?.mediaId) return undefined;
    return this.elements.get(elKeyOf(c.kind, c.mediaId));
  }

  /** Sincroniza os elementos com o playhead (a "setinha" da timeline). */
  private syncMedia(t: number, playing: boolean) {
    const active = this.activeClips(t).filter((c) => c.kind !== "text" && c.mediaId && registry.hasBlob(c.mediaId));
    // redistribui os elementos: quem tá ativo ganha um (cria "#2", "#3"… se o mesmo arquivo tocar 2× ao mesmo tempo)
    const newClaims = new Map<string, string>();
    for (const clip of active) {
      if (clip.kind === "image") continue; // imagens nunca brigam (sem tempo)
      const base = elKeyOf(clip.kind, clip.mediaId!);
      let key = base;
      let n = 1;
      while (newClaims.has(key) && newClaims.get(key) !== clip.id) {
        key = elKeyOf(clip.kind, clip.mediaId!, n++);
      }
      newClaims.set(key, clip.id);
      this.bindings.set(clip.id, key);
      this.getOrCreateEl(clip.kind, clip.mediaId!, n - 1);
    }
    this.claims = newClaims;
    // pausa quem não tem dono, sincroniza quem tem
    for (const [key, el] of this.elements) {
      if (!(el instanceof HTMLMediaElement)) continue;
      const ownerId = newClaims.get(key);
      if (!ownerId) {
        if (!el.paused) el.pause();
        continue;
      }
      const clip = useProject.getState().clips.find((c) => c.id === ownerId);
      if (!clip) continue;
      const expected = clip.inPoint + (t - clip.start) * clip.speed;
      el.playbackRate = Math.max(0.0625, Math.min(16, clip.speed));
      if (playing) {
        if (Math.abs(el.currentTime - expected) > 0.26) {
          try {
            el.currentTime = expected;
          } catch {
            /* ainda não seekable */
          }
        }
        if (el.paused) {
          el.currentTime = expected;
          void el.play().catch(() => undefined);
        }
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - expected) > 0.05) {
          try {
            el.currentTime = expected;
          } catch {
            /* noop */
          }
        }
      }
    }
  }

  private updateAudio(t: number) {
    const { clips, tracks } = useProject.getState();
    for (const c of clips) {
      if (c.kind === "text" || c.kind === "image") continue;
      const key = this.bindings.get(c.id);
      if (!key) continue;
      // o elemento é COMPARTILHADO entre pedaços do mesmo arquivo —
      // só o dono do momento mexe no volume/pause dele
      if (this.claims.get(key) !== c.id) continue;
      const el = this.elements.get(key);
      if (!el || !(el instanceof HTMLMediaElement)) continue;
      if (this.lastAttach.get(key) !== el) {
        audioEngine.dropClip(key);
        audioEngine.attach(key, el);
        this.lastAttach.set(key, el);
      }
      const track = tracks.find((tr) => tr.id === c.trackId);
      const isActive = c.start <= t + 0.0001 && c.start + c.duration > t - 0.0001;
      const fade = isActive ? fadeEnvelope(c, t) : 0;
      const eff = c.muted || track?.muted ? 0 : c.volume * fade;
      audioEngine.update(key, { gain: eff, enhance: c.enhance });
      if (!isActive && !el.paused) el.pause();
    }
  }

  /** Nível de som (0..1) na posição da seta — alimenta a barrinha da toolbar. */
  levelAt(t: number): number {
    const { clips, tracks, media } = useProject.getState();
    let lvl = 0;
    for (const c of clips) {
      if (c.kind !== "video" && c.kind !== "audio") continue;
      if (c.start > t || clipEnd(c) <= t) continue;
      const tr = tracks.find((x) => x.id === c.trackId);
      if (c.muted || tr?.muted) continue;
      const m = media.find((x) => x.id === c.mediaId);
      if (!m?.peaks?.length || !m.duration) {
        lvl = Math.max(lvl, 0.008); // tem som, mas sem picos calculados
        continue;
      }
      const srcT = c.inPoint + (t - c.start) * c.speed;
      const idx = Math.min(m.peaks.length - 1, Math.max(0, Math.floor((srcT / m.duration) * m.peaks.length)));
      lvl = Math.max(lvl, m.peaks[idx] * c.volume * fadeEnvelope(c, t));
    }
    return Math.min(1, lvl);
  }

  // ---------- render ----------
  renderPreview(t: number) {
    if (!this.canvas || !this.ctx) return;
    const { project, tracks, clips } = useProject.getState();
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(cv.clientWidth * dpr));
    const h = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, w, h);
    // encaixa o projeto no canvas (letterbox)
    const k = Math.min(w / project.width, h / project.height);
    ctx.save();
    ctx.translate((w - project.width * k) / 2, (h - project.height * k) / 2);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.rect(0, 0, project.width, project.height);
    ctx.clip();
    drawFrame(ctx, project, tracks, clips, t, {
      getElement: (clipId) => this.elements.get(this.bindings.get(clipId) ?? ""),
      statusOf: (clipId) => this.statusOf(clipId),
      progressOf: (clipId) => this.loadProgress(clipId),
    });
    ctx.restore();
  }

  renderTo(ctx: CanvasRenderingContext2D, t: number) {
    const { project, tracks, clips } = useProject.getState();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.scale(project.width / ctx.canvas.width, project.height / ctx.canvas.height);
    drawFrame(ctx, project, tracks, clips, t, {
      getElement: (clipId) => this.elements.get(this.bindings.get(clipId) ?? ""),
      statusOf: (clipId) => this.statusOf(clipId),
      progressOf: (clipId) => this.loadProgress(clipId),
    });
    ctx.restore();
  }

  // ---------- controles ----------
  play() {
    const pb = usePlayback.getState();
    if (pb.duration <= 0) return;
    audioEngine.ensureContext();
    // v7.2: a pessoa só VÊ o vídeo com a mídia carregada INTEIRA. Enquanto
    // não tá tudo em 100%, o play segura (a tela mostra a % carregando) e
    // dispara sozinho quando o último byte chega.
    if (!this.allMediaReady()) {
      this.pendingPlay = true;
      this.dirty = true;
      return;
    }
    this.pendingPlay = false;
    const from = pb.playhead >= pb.duration - 0.01 ? 0 : pb.playhead;
    usePlayback.getState().setPlayhead(from);
    usePlayback.getState().setPlaying(true);
    this.dirty = true;
  }

  pause() {
    this.pendingPlay = false; // cancelou a espera: não começa sozinho depois
    usePlayback.getState().setPlaying(false);
    for (const el of this.elements.values()) {
      if (el instanceof HTMLMediaElement && !el.paused) el.pause();
    }
    this.dirty = true;
  }

  toggle() {
    if (usePlayback.getState().playing) this.pause();
    else this.play();
  }

  seek(t: number, opts?: { mode?: PlayheadMode; magnetTh?: number }) {
    const pb = usePlayback.getState();
    let target = Math.max(0, Math.min(pb.duration, t));
    const mode = opts?.mode ?? "free";
    if (mode === "frames") {
      // quadro a quadro: a seta pula em passos de 1 frame
      const fps = useProject.getState().project.fps || 30;
      target = Math.round(target * fps) / fps;
    } else if (mode === "magnet") {
      // magnético: gruda na borda dos clipes ao passar perto (estilo Kdenlive)
      const th = opts?.magnetTh ?? 0.08;
      const { clips } = useProject.getState();
      let best = target;
      let bestD = th;
      for (const c of clips) {
        for (const p of [c.start, clipEnd(c)]) {
          const d = Math.abs(target - p);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      }
      target = Math.max(0, Math.min(pb.duration, best));
    }
    if (mode === "smooth" && !pb.playing) {
      this.glideTo(target);
      return;
    }
    this.glideTarget = null;
    cancelAnimationFrame(this.glideRaf);
    this.glideRaf = 0;
    usePlayback.getState().setPlayhead(target);
    this.dirty = true;
  }

  /** seta deslizando com inércia até o alvo */
  private glideTo(target: number) {
    this.glideTarget = target;
    if (this.glideRaf) return; // deslize já em andamento
    const step = () => {
      this.glideRaf = 0;
      const tgt = this.glideTarget;
      if (tgt === null) return;
      const cur = usePlayback.getState().playhead;
      const d = tgt - cur;
      if (Math.abs(d) < 0.008) {
        usePlayback.getState().setPlayhead(tgt);
        this.glideTarget = null;
        this.dirty = true;
        return;
      }
      usePlayback.getState().setPlayhead(cur + d * 0.3);
      this.dirty = true;
      this.glideRaf = requestAnimationFrame(step);
    };
    this.glideRaf = requestAnimationFrame(step);
  }

  nudgeFrames(n: number) {
    const { project } = useProject.getState();
    const pb = usePlayback.getState();
    this.seek(pb.playhead + n / project.fps);
  }

  markDirty() {
    this.dirty = true;
  }
}

export const engine = new PlaybackEngine();
