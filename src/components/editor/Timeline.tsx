// GaláxiaCut — timeline: faixas, clipes, playhead, arraste/corte/trim,
// botão direito, transições nas junções e arrastar mídia pra dentro
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FloatMenu, MenuItem } from "./ClipMenu";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProject, usePlayback, findFreeSlot } from "@/lib/editor/store";
import { useSettings, PLAYHEAD_MODES, PlayheadMode } from "@/lib/editor/settings";
import { useComboLabel } from "@/lib/editor/shortcuts";
import { engine } from "@/lib/editor/playback";
import { Clip, Track, TRANSITIONS, TransitionType, aspectDiff, clipEnd } from "@/lib/editor/types";
import { toast } from "sonner";
import { registry } from "@/lib/editor/media";
import { gcDrag } from "@/lib/editor/dnd";
import { SilenceDialog } from "./SilenceDialog";
import { useT, t as tr, useLang } from "@/lib/editor/i18n";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Scissors, Copy, Trash2, Magnet, ZoomIn, ZoomOut, Maximize2,
  Eye, EyeOff, VolumeX, Volume2, Type as TypeIcon, Film, ImageIcon, Music2, TriangleAlert,
  ArrowUpDown, Plus, Scissors as ScissorsIcon, ClipboardPaste, AudioLines, ArrowRightFromLine,
  AudioWaveform, UnfoldHorizontal, ArrowLeftToLine, AudioLines as AudioLinesIcon, Wand2, Eraser,
  Combine, ListChecks, X, MonitorPlay, Sparkles,
} from "lucide-react";

const HEADER_W = 128;
const RULER_H = 28;
const TRACK_H: Record<string, number> = { text: 46, video: 62, audio: 50 };
const MEDIA_DND_TYPE = "application/x-galaxiacut-media";

/** snap com estado VIVO (usado durante arrastes longos, que sobrevivem a re-renders) */
function snapInfoLive(t: number, excludeId: string, zoom: number): { t: number; hit: boolean } {
  if (!useSettings.getState().snapEnabled) return { t, hit: false };
  const th = 8 / zoom;
  const pts = new Set<number>([0, usePlayback.getState().playhead]);
  for (const c of useProject.getState().clips) {
    if (c.id === excludeId) continue;
    pts.add(c.start);
    pts.add(clipEnd(c));
  }
  let best = t;
  let bestD = th;
  for (const p of pts) {
    const d = Math.abs(t - p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { t: best, hit: bestD < th };
}

/** Arraste de clipe com estado vivo — clica uma vez, lê a store em cada evento. */
function startClipDrag(
  e: React.PointerEvent,
  clip: Clip,
  mode: "move" | "left" | "right",
  zoom: number,
  trackAtY: (clientY: number) => Track | null,
  setSnapX: (v: number | null) => void
) {
  if (e.button !== 0) return;
  e.stopPropagation();
  // Ctrl+clique: liga/desliga da seleção múltipla (sem arrastar)
  if ((e.ctrlKey || e.metaKey) && mode === "move") {
    useProject.getState().toggleSelect(clip.id);
    return;
  }
  // MODO SELEÇÃO (duplo clique): clique simples marca/desmarca, sem arrastar
  if (useProject.getState().batchMode && mode === "move") {
    useProject.getState().toggleSelect(clip.id);
    return;
  }
  const st = useProject.getState();
  st.select(clip.id);
  st.pushHistory();
  const orig = { ...clip };
  const startX = e.clientX;

  const onMove = (ev: PointerEvent) => {
    const pbs = useProject.getState();
    const live = pbs.clips.find((c) => c.id === clip.id);
    if (!live) return;
    const m = pbs.media.find((x) => x.id === clip.mediaId);
    const srcDur = m?.duration ?? Infinity;
    if (mode === "move") {
      const dx = (ev.clientX - startX) / zoom;
      let s = Math.max(0, orig.start + dx);
      const snapped = snapInfoLive(s, clip.id, zoom);
      s = snapped.t;
      setSnapX(snapped.hit ? s * zoom : null);
      // faixa destino (mesmo tipo de conteúdo)
      const hit = trackAtY(ev.clientY);
      const compatible =
        hit &&
        ((hit.kind === "video" && (clip.kind === "video" || clip.kind === "image")) ||
          (hit.kind === "audio" && clip.kind === "audio") ||
          (hit.kind === "text" && clip.kind === "text"));
      const trackId = compatible && hit ? hit.id : orig.trackId;
      // movimento LIVRE: o clipe segue o mouse; ao soltar, o settleOverlaps empurra quem ficou por baixo
      useProject.getState().moveClipLive(clip.id, s, trackId);
    } else if (mode === "left") {
      const dx = (ev.clientX - startX) / zoom;
      let ns = Math.min(orig.start + dx, orig.start + orig.duration - 0.1);
      ns = Math.max(ns, 0);
      if (clip.kind === "video" || clip.kind === "audio") ns = Math.max(ns, orig.start - orig.inPoint / orig.speed);
      ns = Math.max(
        ns,
        ...pbs.clips
          .filter((c) => c.trackId === orig.trackId && c.id !== clip.id && clipEnd(c) <= orig.start + 0.001)
          .map(clipEnd),
        0
      );
      const snappedL = snapInfoLive(ns, clip.id, zoom);
      ns = snappedL.t;
      setSnapX(snappedL.hit ? ns * zoom : null);
      const d = ns - orig.start;
      useProject.getState().updateClip(clip.id, { start: ns, duration: orig.duration - d, inPoint: Math.max(0, orig.inPoint + d * orig.speed) }, { history: false });
    } else {
      const dx = (ev.clientX - startX) / zoom;
      let ne = Math.max(orig.start + orig.duration + dx, orig.start + 0.1);
      if (clip.kind === "video" || clip.kind === "audio") ne = Math.min(ne, orig.start + (srcDur - orig.inPoint) / orig.speed);
      const nextStart = Math.min(
        ...pbs.clips.filter((c) => c.trackId === orig.trackId && c.id !== clip.id && c.start >= clipEnd(orig) - 0.001).map((c) => c.start),
        Infinity
      );
      ne = Math.min(ne, nextStart);
      const snappedR = snapInfoLive(ne, clip.id, zoom);
      ne = snappedR.t;
      setSnapX(snappedR.hit ? ne * zoom : null);
      useProject.getState().updateClip(clip.id, { duration: ne - orig.start, outPoint: Math.max(0, orig.inPoint + (ne - orig.start) * orig.speed) }, { history: false });
    }
    engine.markDirty();
  };
  const onUp = () => {
    setSnapX(null);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (mode === "move") {
      // inserção estilo CapCut: empurra os clipes que ficaram por baixo
      const pushed = useProject.getState().settleOverlaps(clip.id);
      if (pushed > 0) toast.info(`${pushed} clipe(s) da frente empurrado(s) pra abrir espaço`);
    }
    engine.markDirty();
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

export function Timeline() {
  const tracks = useProject((s) => s.tracks);
  const clips = useProject((s) => s.clips);
  const media = useProject((s) => s.media);
  const selectedId = useProject((s) => s.selectedId);
  const selectedIds = useProject((s) => s.selectedIds);
  const duration = usePlayback((s) => s.duration);
  const playheadMode = useSettings((s) => s.playheadMode);
  const snapOn = useSettings((s) => s.snapEnabled);
  const showWaveOnVideo = useSettings((s) => s.showWaveOnVideo);
  const setSettings = useSettings((s) => s.set);
  const t = useT();

  const [zoom, setZoom] = useState(64);
  const [snapX, setSnapX] = useState<number | null>(null); // guia de encaixe (px)
  const [dropHint, setDropHint] = useState<{ t: number; trackId: string; occupied: boolean } | null>(null);
  const [silenceOpen, setSilenceOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [showTrackTip, setShowTrackTip] = useState(true);
  /** Retângulo de seleção múltipla (estilo área de trabalho do Windows) */
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number; clientX: number; clientY: number } | null>(null);
  const marqueeRef = useRef<{ startX: number; startY: number; currentX: number; currentY: number; clientX: number; clientY: number } | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  /** proporção do vídeo difere da do projeto → pergunta se muda o formato */
  const [askAspect, setAskAspect] = useState<{ w: number; h: number; name: string } | null>(null);
  const batchMode = useProject((s) => s.batchMode);
  /** mídias que já perguntaram sobre proporção nesta sessão (não enche o saco) */
  const askedAspects = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom; // leitura em eventos (arraste estável), atualizado após o commit
  }, [zoom]);
  const splitKey = useComboLabel("split");
  const delKey = useComboLabel("delete");
  // quantos clipes de áudio sem som a vassoura encontraria agora
  const silentCount = clips.filter((c) => c.kind === "audio" && (c.muted || (c.volume ?? 1) <= 0.001)).length;

  const contentW = Math.max(duration * zoom + 240, 800);
  const rowTop = useMemo(() => {
    const tops: Record<string, number> = {};
    let y = RULER_H;
    for (const t of tracks) {
      tops[t.id] = y;
      y += TRACK_H[t.kind] ?? 56;
    }
    return tops;
  }, [tracks]);

  // a tela ACOMPANHA a setinha: durante o play E também ao arrastar a seta
  // com o mouse (a visão avança quando chega perto da borda) e nas setas do teclado
  useEffect(() => {
    let lastT = -1;
    const unsub = usePlayback.subscribe((s) => {
      if (s.playhead === lastT) return;
      lastT = s.playhead;
      const el = scrollRef.current;
      if (!el) return;
      const x = s.playhead * zoom;
      const viewL = el.scrollLeft + HEADER_W;
      const viewR = el.scrollLeft + el.clientWidth;
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (s.playing) {
        if (x < viewL || x > viewR - 80) el.scrollLeft = Math.min(maxScroll, Math.max(0, x - el.clientWidth * 0.35));
      } else if (x > viewR - 80) {
        // arrastando a seta pra frente: a visão acompanha (seta fica a 60% da largura)
        el.scrollLeft = Math.min(maxScroll, Math.max(0, x - el.clientWidth * 0.6));
      } else if (x < viewL) {
        el.scrollLeft = Math.max(0, x - 60);
      }
    });
    return unsub;
  }, [zoom]);

  // abre o detector de silêncio a pedido de um menu de contexto de clipe
  useEffect(() => {
    const open = () => setSilenceOpen(true);
    window.addEventListener("galaxiacut:opensilence", open);
    return () => window.removeEventListener("galaxiacut:opensilence", open);
  }, []);

  // ---------- pontos de encaixe (snap) ----------
  const snapInfo = (t: number, excludeId: string): { t: number; hit: boolean } => snapInfoLive(t, excludeId, zoom);
  const snapTime = (t: number, excludeId: string) => snapInfo(t, excludeId).t;

  // (v4) sem clamp durante o arraste: o clipe anda LIVRE e, ao soltar,
  // o settleOverlaps da store empurra quem ficou por baixo (estilo CapCut)

  const trackAtY = (clientY: number): Track | null => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const y = clientY - rect.top;
    for (const t of tracks) {
      const top = rowTop[t.id];
      const h = TRACK_H[t.kind] ?? 56;
      if (y >= top && y < top + h) return t;
    }
    return null;
  };

  const timeAtX = (clientX: number): number => {
    const r = contentRef.current?.getBoundingClientRect();
    if (!r) return 0;
    // o conteúdo da faixa começa DEPOIS do cabeçalho fixo (128px) — sem descontar
    // isso o clipe caía 128px/zoom NA FRENTE de onde o mouse soltou (o bug do "aparece lá na frente")
    return Math.max(0, (clientX - r.left - HEADER_W) / zoom);
  };

  /** tempo de soltura com ímã: borda dos clipes, seta e INÍCIO da timeline */
  const dropTimeAt = (clientX: number): number => {
    let t = snapTime(timeAtX(clientX), "@drop");
    if (t > 0 && t < 26 / zoom) t = 0; // perto do começo → gruda no 0
    return t;
  };

  // ---------- scrub (a setinha) — respeita o modo escolhido ----------
  const scrubTo = (clientX: number) => {
    const r = rulerRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = clientX - r.left;
    engine.seek(x / zoom, { mode: playheadMode, magnetTh: 10 / zoom });
  };

  // ---------- arraste de clipe (estado vivo: sobrevive a re-renders) ----------
  const trackAtYRef = useRef(trackAtY);
  useEffect(() => {
    trackAtYRef.current = trackAtY;
  });
  const onDownStable = useCallback((e: React.PointerEvent, clip: Clip, mode: "move" | "left" | "right") => {
    startClipDrag(e, clip, mode, zoomRef.current, trackAtYRef.current, setSnapX);
  }, []);

  // ---------- soltar mídia (arrastada do painel ou do PC) ----------
  async function handleDrop(e: React.DragEvent, track: Track) {
    e.preventDefault();
    setDropHint(null);
    const st = useProject.getState();
    let t = dropTimeAt(e.clientX);

    // se a faixa não combina com o tipo de mídia, redireciona pra faixa certa
    const redirectTrack = (kind: "video" | "image" | "audio"): string => {
      const ok =
        (track.kind === "video" && kind !== "audio") ||
        (track.kind === "audio" && kind === "audio");
      if (ok) return track.id;
      return kind === "audio"
        ? (st.tracks.find((x) => x.kind === "audio")?.id ?? "A1")
        : (st.tracks.find((x) => x.kind === "video")?.id ?? "V1");
    };

    /** solta e avisa se precisou desviar pra um espaço livre */
    const place = (mediaId: string, trackId: string, at: number) => {
      const out = st.dropMediaAt(mediaId, trackId, at);
      if (!out) {
        toast.error(tr("tl.cantDrop"));
        return;
      }
      const trackName = st.tracks.find((x) => x.id === out.clip.trackId)?.name ?? "";
      if (out.redirected) {
        toast.info(tr("tl.dropMoved", { track: trackName, s: out.clip.start.toFixed(1) }), {
          description: tr("tl.dropMovedDesc"),
        });
      } else {
        toast.success(tr("tl.droppedAt", { s: out.clip.start.toFixed(1), track: trackName }));
      }
      // vídeo/imagem de OUTRO formato que o do projeto → pergunta se muda (1× por mídia)
      const meta = st.media.find((m) => m.id === mediaId);
      if (
        meta && (meta.kind === "video" || meta.kind === "image") && meta.width > 0 && meta.height > 0 &&
        aspectDiff(meta.width, meta.height, st.project.width, st.project.height) > 0.08 &&
        !askedAspects.current.has(mediaId)
      ) {
        askedAspects.current.add(mediaId);
        setAskAspect({ w: meta.width, h: meta.height, name: meta.name });
      }
    };

    // 1) mídia do painel
    const mediaId = e.dataTransfer.getData(MEDIA_DND_TYPE) || e.dataTransfer.getData("text/plain");
    if (mediaId && st.media.some((m) => m.id === mediaId)) {
      const meta = st.media.find((m) => m.id === mediaId)!;
      const targetTrack = redirectTrack(meta.kind);
      place(mediaId, targetTrack, t);
      return;
    }
    // 2) arquivos do computador (ou de dentro de uma pasta)
    if (e.dataTransfer.files?.length) {
      const files = Array.from(e.dataTransfer.files).filter((f) => /^(video|audio|image)\//.test(f.type) || /\.(mp4|webm|mov|mkv|m4v|avi|png|jpe?g|webp|gif|avif|mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(f.name));
      if (!files.length) return;
      let offset = 0;
      let ok = 0;
      for (const f of files) {
        try {
          const meta = await registry.importFile(f);
          useProject.getState().addMedia(meta);
          const targetTrack = redirectTrack(meta.kind);
          const out = useProject.getState().dropMediaAt(meta.id, targetTrack, t + offset);
          if (out) {
            offset = Math.max(offset, out.clip.start + out.clip.duration - t);
            // arquivo do PC com proporção diferente → também pergunta
            const proj = useProject.getState().project;
            if (
              (meta.kind === "video" || meta.kind === "image") && meta.width > 0 &&
              aspectDiff(meta.width, meta.height, proj.width, proj.height) > 0.08 &&
              !askedAspects.current.has(meta.id)
            ) {
              askedAspects.current.add(meta.id);
              setAskAspect({ w: meta.width, h: meta.height, name: meta.name });
            }
          }
          ok++;
        } catch (err) {
          toast.error(tr("tl.importFail", { name: f.name }), { description: String((err as Error).message ?? err) });
        }
      }
      if (ok > 0) toast.success(tr("tl.importedN", { n: ok }));
    }
  }

  // ---------- Seleção com arrastar do mouse (estilo Windows) + auto-rolagem ----------
  const handleTrackAreaPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // se clicou num clipe, menu de contexto ou botão, não abre caixa de seleção
    if (target.closest("[role='button']") || target.closest("button") || target.closest(".cursor-context-menu") || target.closest("[data-no-marquee]")) {
      return;
    }

    const contentEl = contentRef.current;
    const scrollEl = scrollRef.current;
    if (!contentEl || !scrollEl) return;

    const cRect = contentEl.getBoundingClientRect();
    const startX = Math.max(0, e.clientX - cRect.left - HEADER_W);
    const startY = Math.max(0, e.clientY - cRect.top);

    const initial = {
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      clientX: e.clientX,
      clientY: e.clientY,
    };
    marqueeRef.current = initial;
    setMarquee(initial);

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      useProject.getState().select(null);
    }

    const updateSelection = (curX: number, curY: number) => {
      const m = marqueeRef.current;
      if (!m) return;
      const boxL = Math.min(m.startX, curX);
      const boxR = Math.max(m.startX, curX);
      const boxT = Math.min(m.startY, curY);
      const boxB = Math.max(m.startY, curY);

      if (Math.abs(curX - m.startX) < 4 && Math.abs(curY - m.startY) < 4) return;

      const curClips = useProject.getState().clips;
      const curTracks = useProject.getState().tracks;
      const hitIds: string[] = [];

      for (const c of curClips) {
        const clipL = c.start * zoomRef.current;
        const clipR = (c.start + c.duration) * zoomRef.current;
        const trk = curTracks.find((t) => t.id === c.trackId);
        const trackTop = rowTop[c.trackId] ?? 0;
        const trackH = TRACK_H[trk?.kind ?? "video"] ?? 56;
        const clipT = trackTop;
        const clipB = trackTop + trackH;

        if (clipR >= boxL && clipL <= boxR && clipB >= boxT && clipT <= boxB) {
          hitIds.push(c.id);
        }
      }
      useProject.getState().selectMultiple(hitIds);
    };

    const stepAutoScroll = () => {
      const m = marqueeRef.current;
      const sEl = scrollRef.current;
      const cEl = contentRef.current;
      if (!m || !sEl || !cEl) return;

      const viewRect = sEl.getBoundingClientRect();
      let scrollDelta = 0;

      // Perto da borda direita -> rola suavemente pra frente
      if (m.clientX > viewRect.right - 50) {
        const intensity = Math.min(30, (m.clientX - (viewRect.right - 50)) * 0.5);
        scrollDelta = Math.max(4, intensity);
      }
      // Perto da borda esquerda -> rola suavemente pra trás
      else if (m.clientX < viewRect.left + HEADER_W + 50) {
        const intensity = Math.min(30, (viewRect.left + HEADER_W + 50 - m.clientX) * 0.5);
        scrollDelta = -Math.max(4, intensity);
      }

      if (scrollDelta !== 0) {
        sEl.scrollLeft += scrollDelta;
        const newCurX = Math.max(0, m.clientX - cEl.getBoundingClientRect().left - HEADER_W);
        m.currentX = newCurX;
        setMarquee({ ...m });
        updateSelection(newCurX, m.currentY);
      }
      autoScrollRef.current = requestAnimationFrame(stepAutoScroll);
    };

    autoScrollRef.current = requestAnimationFrame(stepAutoScroll);

    const onMove = (ev: PointerEvent) => {
      const m = marqueeRef.current;
      const cEl = contentRef.current;
      if (!m || !cEl) return;

      const curX = Math.max(0, ev.clientX - cEl.getBoundingClientRect().left - HEADER_W);
      const curY = Math.max(0, ev.clientY - cEl.getBoundingClientRect().top);
      m.currentX = curX;
      m.currentY = curY;
      m.clientX = ev.clientX;
      m.clientY = ev.clientY;

      setMarquee({ ...m });
      updateSelection(curX, curY);
    };

    const onUp = (ev: PointerEvent) => {
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      const m = marqueeRef.current;
      if (m) {
        if (Math.abs(m.currentX - m.startX) < 4 && Math.abs(m.currentY - m.startY) < 4) {
          useProject.getState().select(null);
          scrubTo(ev.clientX);
        }
      }
      marqueeRef.current = null;
      setMarquee(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ---------- render ----------
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  let step = steps.find((s) => s * zoom >= 64) ?? 600;
  while (duration / step > 380) step *= 2;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + step; t += step) ticks.push(Math.round(t * 1000) / 1000);

  const fmtTick = (t: number) => {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0c1017]">
      {/* toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[#1c2430] bg-[#10151d] px-2">
        <TooltipProvider delayDuration={400}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:bg-[#1c2430]"
            onClick={() => {
              useProject.getState().splitAt(usePlayback.getState().playhead);
              engine.markDirty();
            }}
          >
            <Scissors className="h-3.5 w-3.5 text-[var(--gc-accent)]" /> {t("tl.cut")} <kbd className="rounded bg-[#1c2430] px-1 text-[9px] text-zinc-500">{splitKey}</kbd>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:bg-[#1c2430]"
            disabled={!selectedId}
            onClick={() => selectedId && useProject.getState().duplicateClip(selectedId)}
          >
            <Copy className="h-3.5 w-3.5" /> {t("tl.duplicate")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:bg-[#1c2430]"
            disabled={!selectedId && !selectedIds.length}
            onClick={() => {
              const st = useProject.getState();
              if (st.selectedIds.length > 1) {
                const n = st.deleteSelected();
                toast.info(tr("tl.deletedN", { n }));
              } else if (st.selectedId) {
                st.deleteClip(st.selectedId);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("tl.delete")}{" "}
            {selectedIds.length > 1 ? `(${selectedIds.length})` : ""}{" "}
            <kbd className="rounded bg-[#1c2430] px-1 text-[9px] text-zinc-500">{delKey}</kbd>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 gap-1 px-2 text-xs text-zinc-300 hover:bg-[#1c2430]`}
            onClick={() => setSilenceOpen(true)}
            title={t("tl.silenceHint")}
          >
            <AudioWaveform className="h-3.5 w-3.5 text-[var(--gc-accent)]" /> {t("tl.silence")}
          </Button>
          {/* vassoura: exclusor de todos os clipes de áudio sem som */}
          <Button
            variant="ghost"
            size="sm"
            disabled={!silentCount}
            className={`h-7 gap-1 px-2 text-xs ${silentCount ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25" : "text-zinc-600 hover:bg-[#1c2430]"}`}
            onClick={() => {
              const n = useProject.getState().deleteSilentClips();
              engine.markDirty();
              if (n) toast.success(tr("tl.broomDone", { n }), { description: tr("tl.broomDoneDesc") });
            }}
            title={t("tl.broomHint")}
          >
            <Eraser className="h-3.5 w-3.5 text-amber-400" /> {t("tl.broom")}{silentCount ? ` (${silentCount})` : ""}
          </Button>
          {/* juntar clipes: fecha os espaços (pergunta: todas as faixas ou uma) */}
          <Button
            variant="ghost"
            size="sm"
            disabled={!clips.length}
            className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:bg-[#1c2430]"
            onClick={() => setJoinOpen(true)}
            title={t("tl.joinHint")}
          >
            <Combine className="h-3.5 w-3.5 text-sky-400" /> {t("tl.join")}
          </Button>
          <div className="mx-1 h-4 w-px bg-[#1c2430]" />
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 gap-1 px-2 text-xs ${snapOn ? "bg[var(--gc-accent-15)] text-[var(--gc-accent)] hover:bg[var(--gc-accent-25)]" : "text-zinc-400 hover:bg-[#1c2430]"}`}
            onClick={() => setSettings({ snapEnabled: !snapOn })}
          >
            <Magnet className="h-3.5 w-3.5" /> {t("tl.snap")}
          </Button>

          {/* modo de movimento da seta */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:bg-[#1c2430]"
                title={t("tl.playheadMode")}
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-amber-400" />
                {tr(`pm.${PLAYHEAD_MODES.find((m) => m.id === playheadMode)?.id ?? "free"}`)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-[#232d3d] bg-[#121722] text-zinc-200">
              {PLAYHEAD_MODES.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => setSettings({ playheadMode: m.id as PlayheadMode })}
                  className={`gap-2 text-xs ${playheadMode === m.id ? "text-[var(--gc-accent)]" : ""}`}
                >
                  <span className="w-28">{tr(`pm.${m.id}`)}</span>
                  <span className="w-40 truncate text-[10px] text-zinc-500">{tr(`pm.${m.id}Hint`)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* adicionar faixa */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:bg-[#1c2430]">
                <Plus className="h-3.5 w-3.5" /> {t("tl.track")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-[#232d3d] bg-[#121722] text-zinc-200">
              <DropdownMenuItem onClick={() => useProject.getState().addTrack("video")} className="gap-2 text-xs">
                <Film className="h-3.5 w-3.5 text-emerald-400" /> {t("tl.addVideoTrack")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => useProject.getState().addTrack("audio")} className="gap-2 text-xs">
                <AudioLines className="h-3.5 w-3.5 text-amber-400" /> {t("tl.addAudioTrack")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* botão da dica de faixas */}
          {!showTrackTip && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-amber-400 hover:bg-amber-400/10"
              onClick={() => setShowTrackTip(true)}
              title={t("tl.tipTitle")}
            >
              <Sparkles className="h-3.5 w-3.5" /> {t("tl.tipBtn")}
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <div className="mx-0.5 h-4 w-px bg-[#1c2430]" />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400" onClick={() => setZoom((z) => Math.max(8, z / 1.4))} aria-label={t("tl.zoomOut")}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Slider value={[zoom]} min={8} max={240} step={1} onValueChange={(v) => setZoom(v[0])} className="w-24" aria-label={t("tl.zoomIn")} />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400" onClick={() => setZoom((z) => Math.min(240, z * 1.4))} aria-label={t("tl.zoomIn")}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400"
              aria-label={t("tl.fit")}
              title={t("tl.fit")}
              onClick={() => {
                const el = scrollRef.current;
                if (!el || duration <= 0) return;
                setZoom(Math.max(8, (el.clientWidth - HEADER_W - 60) / duration));
                el.scrollLeft = 0;
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TooltipProvider>
      </div>

      {/* Dica de Organização das Faixas */}
      {showTrackTip && (
        <div className="flex shrink-0 items-center justify-between border-b border-[#1c2430] bg-[#121824] px-3 py-1.5 text-[11px] text-zinc-300">
          <div className="flex items-center gap-2 truncate">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="truncate">
              <strong className="font-semibold text-amber-300">{t("tl.tipTitle")}:</strong> {t("tl.tipDesc")}
            </span>
          </div>
          <button
            onClick={() => setShowTrackTip(false)}
            className="ml-2 rounded p-1 text-zinc-500 hover:bg-[#1c2430] hover:text-zinc-300"
            title={t("tl.closeTip")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* área de rolagem */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto timeline-scroll"
        onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            setZoom((z) => Math.max(8, Math.min(240, z * (e.deltaY < 0 ? 1.12 : 0.89))));
          }
        }}
      >
        <div ref={contentRef} className="relative" style={{ width: contentW + HEADER_W, minHeight: "100%" }}>
          {/* régua — também aceita soltar mídia (cai na faixa certa) */}
          <div className="sticky top-0 z-40 flex" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-50 flex shrink-0 items-center border-b border-r border-[#1c2430] bg-[#10151d] px-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-600" style={{ width: HEADER_W }}>
              Timeline
            </div>
            <div
              ref={rulerRef}
              className="relative flex-1 cursor-ew-resize border-b border-[#1c2430] bg-[#10151d]"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(MEDIA_DND_TYPE)) e.preventDefault();
              }}
              onDrop={async (e) => {
                e.preventDefault();
                const st = useProject.getState();
                const mediaId = e.dataTransfer.getData(MEDIA_DND_TYPE) || e.dataTransfer.getData("text/plain");
                if (mediaId && st.media.some((m) => m.id === mediaId)) {
                  const meta = st.media.find((m) => m.id === mediaId)!;
                  const trackId = meta.kind === "audio" ? (st.tracks.find((t) => t.kind === "audio")?.id ?? "A1") : (st.tracks.find((t) => t.kind === "video")?.id ?? "V1");
                  let dt = snapTime(timeAtX(e.clientX), "@drop");
                  if (dt > 0 && dt < 26 / zoom) dt = 0; // ímã no início da timeline
                  const out = st.dropMediaAt(mediaId, trackId, dt);
                  if (out?.redirected) toast.info(tr("tl.dropMoved", { track: "", s: out.clip.start.toFixed(1) }));
                  return;
                }
                if (e.dataTransfer.files?.length) {
                  const fallback = st.tracks.find((t) => t.kind === "video") ?? st.tracks[0];
                  if (fallback) await handleDrop(e, fallback);
                }
              }}
              onPointerDown={(e) => {
                scrubTo(e.clientX);
                const move = (ev: PointerEvent) => scrubTo(ev.clientX);
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute bottom-0 flex flex-col items-start" style={{ left: t * zoom }}>
                  <span className="ml-1 text-[9px] tabular-nums text-zinc-500">{fmtTick(t)}</span>
                  <div className="h-2 w-px bg-[#2a3546]" />
                </div>
              ))}
            </div>
          </div>

          {/* faixas */}
          <div onPointerDown={handleTrackAreaPointerDown} className="relative">
            {tracks.map((track) => {
              const rowClips = clips.filter((c) => c.trackId === track.id);
              return (
                <div
                  key={track.id}
                  className="flex border-b border-[#141a24]"
                  style={{ height: TRACK_H[track.kind] ?? 56 }}
                >
                  {/* cabeçalho da faixa — com menu de botão direito */}
                  <FloatMenu
                    items={[
                      { label: track.muted ? t("tm.unmute") : t("tm.mute"), icon: <VolumeX className="h-3.5 w-3.5" />, onClick: () => useProject.getState().toggleTrack(track.id, "muted") },
                      ...(track.kind !== "audio"
                        ? [{ label: track.hidden ? t("tm.show") : t("tm.hide"), icon: track.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />, onClick: () => useProject.getState().toggleTrack(track.id, "hidden") }]
                        : []),
                      { type: "sep" },
                      { label: t("tm.addVideo"), icon: <Film className="h-3.5 w-3.5 text-emerald-400" />, onClick: () => useProject.getState().addTrack("video") },
                      { label: t("tm.addAudio"), icon: <AudioLines className="h-3.5 w-3.5 text-amber-400" />, onClick: () => useProject.getState().addTrack("audio") },
                      ...(rowClips.length > 1
                        ? [
                            { type: "sep" },
                            {
                              label: t("tm.closeGaps"),
                              icon: <UnfoldHorizontal className="h-3.5 w-3.5 text-sky-400" />,
                              title: t("tm.closeGapsHint"),
                              onClick: () => {
                                useProject.getState().closeTrackGaps(track.id);
                                engine.markDirty();
                                toast.success(t("tm.gapsClosed"));
                              },
                            },
                          ]
                        : []),
                      ...(!rowClips.length && tracks.filter((x) => x.kind === track.kind).length > 1
                        ? [
                            { type: "sep" },
                            { label: t("tm.remove"), icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => useProject.getState().removeTrack(track.id) },
                          ]
                        : []),
                    ] as MenuItem[]}
                  >
                    <div
                      className="sticky left-0 z-40 flex shrink-0 cursor-context-menu items-center gap-1 border-r border-[#1c2430] bg-[#0e1320] px-2"
                      style={{ width: HEADER_W }}
                      title={t("tm.options")}
                    >
                      <span className="flex-1 truncate text-[10px] font-medium text-zinc-400">{track.name}</span>
                      {track.kind !== "text" && (
                        <button
                          className={`rounded p-0.5 ${track.muted ? "text-amber-500" : "text-zinc-600 hover:text-zinc-400"}`}
                          onClick={() => useProject.getState().toggleTrack(track.id, "muted")}
                          title={track.muted ? t("tm.unmuteShort") : t("tm.muteShort")}
                        >
                          {track.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                        </button>
                      )}
                      {track.kind !== "audio" && (
                        <button
                          className={`rounded p-0.5 ${track.hidden ? "text-red-500" : "text-zinc-600 hover:text-zinc-400"}`}
                          onClick={() => useProject.getState().toggleTrack(track.id, "hidden")}
                          title={track.hidden ? t("tm.show") : t("tm.hide")}
                        >
                          {track.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  </FloatMenu>

                  {/* corpo da faixa — aceita soltar mídia/arquivo/pasta */}
                  <div
                    className={`relative flex-1 transition-colors ${dropHint?.trackId === track.id ? "bg[var(--gc-accent-7)]" : ""}`}
                    data-empty="1"
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(MEDIA_DND_TYPE)) {
                        e.preventDefault();
                        const want = dropTimeAt(e.clientX);
                        const st = useProject.getState();
                        const gm = gcDrag.mediaId ? st.media.find((m) => m.id === gcDrag.mediaId) : null;
                        if (gm) {
                          const okTrack =
                            (track.kind === "video" && gm.kind !== "audio") ||
                            (track.kind === "audio" && gm.kind === "audio");
                          const tid = okTrack
                            ? track.id
                            : gm.kind === "audio"
                              ? (st.tracks.find((x) => x.kind === "audio")?.id ?? track.id)
                              : (st.tracks.find((x) => x.kind === "video")?.id ?? track.id);
                          const dur = gm.kind === "image" ? 4.8 : gm.duration;
                          const slot = findFreeSlot(st.clips, tid, want, dur);
                          setDropHint({ t: slot.start, trackId: tid, occupied: slot.moved || Math.abs(slot.start - want) > 0.01 });
                        } else {
                          setDropHint({ t: want, trackId: track.id, occupied: false });
                        }
                      }
                    }}
                    onDragLeave={() => setDropHint((d) => (d?.trackId === track.id ? null : d))}
                    onDrop={(e) => void handleDrop(e, track)}
                  >
                    {rowClips.map((c) => (
                      <ClipBlock
                        key={c.id}
                        clip={c}
                        zoom={zoom}
                        selected={selectedIds.includes(c.id)}
                        missing={!!c.mediaId && !media.some((m) => m.id === c.mediaId && !m.missing)}
                        showWave={track.kind !== "audio" ? showWaveOnVideo : true}
                        onDown={onDownStable}
                      />
                    ))}
                    {/* junções de transição entre clipes encostados */}
                    <Junctions rowClips={rowClips} zoom={zoom} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Retângulo de Seleção em Bloco (Estilo Área de Trabalho do Windows) */}
          {marquee && (
            <div
              className="pointer-events-none absolute z-30 rounded border border-[var(--gc-accent)] bg-[var(--gc-accent)]/20 shadow-[0_0_12px_var(--gc-accent-25)]"
              style={{
                left: HEADER_W + Math.min(marquee.startX, marquee.currentX),
                top: Math.min(marquee.startY, marquee.currentY),
                width: Math.max(2, Math.abs(marquee.currentX - marquee.startX)),
                height: Math.max(2, Math.abs(marquee.currentY - marquee.startY)),
              }}
            />
          )}

          {/* guia de encaixe (linha laranja) */}
          {snapX !== null && (
            <div className="pointer-events-none absolute inset-y-0 z-30 w-[2px] -translate-x-1/2 bg-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.6)]" style={{ left: HEADER_W + snapX }} aria-hidden />
          )}
          {/* indicador de soltar — verde = cai onde soltou; âmbar = espaço ocupado,
              mostra o vão livre mais próximo onde o clipe vai entrar */}
          {dropHint && (
            <div
              className={`pointer-events-none absolute bottom-1 z-30 w-[2px] -translate-x-1/2 shadow-[0_0_8px_var(--gc-accent-8)] ${
                dropHint.occupied ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" : "bg-[var(--gc-accent)]"
              }`}
              style={{ left: HEADER_W + dropHint.t * zoom, top: rowTop[dropHint.trackId] ?? RULER_H, height: TRACK_H[tracks.find((t) => t.id === dropHint.trackId)?.kind ?? "video"] ?? 56 }}
              aria-hidden
            >
              {dropHint.occupied && (
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-400/95 px-1.5 py-0.5 text-[8px] font-bold text-black">
                  ocupado → aqui
                </span>
              )}
            </div>
          )}

          {/* playhead (a setinha) */}
          <PlayheadMarker zoom={zoom} />
        </div>
      </div>

      {clips.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
          <p
            className="rounded-full border border-[#232d3d] bg-[#121722]/95 px-4 py-2 text-[11px] text-zinc-500"
            dangerouslySetInnerHTML={{
              __html: t("tl.empty").replace("arraste pra cá", "<b class='text-[var(--gc-accent)]'>arraste pra cá</b>").replace(/click on the \+/i, "<b class='text-[var(--gc-accent)]'>click on the +</b>").replace("arrastra aquí", "<b class='text-[var(--gc-accent)]'>arrastra aquí</b>"),
            }}
          />
        </div>
      )}

      {/* barra flutuante do MODO SELEÇÃO (duplo clique num clipe) */}
      {batchMode && (
        <div className="absolute left-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border[var(--gc-accent-50)] bg-[#121722]/95 px-3 py-1.5 shadow-[0_0_20px_var(--gc-accent-25)] backdrop-blur">
          <ListChecks className="h-4 w-4 text-[var(--gc-accent)]" />
          <span className="text-[11px] font-medium text-zinc-200">
            {t("sel.mode")} · {t("sel.count", { n: selectedIds.length })}
          </span>
          <Button
            size="sm"
            className="h-6 gap-1 rounded-full bg-red-500/90 px-2.5 text-[10px] font-semibold text-white hover:bg-red-500"
            disabled={!selectedIds.length}
            onClick={() => {
              const st = useProject.getState();
              const n = st.deleteSelected();
              toast.info(t("sel.deletedN", { n }));
              engine.markDirty();
            }}
          >
            <Trash2 className="h-3 w-3" /> {t("sel.delete")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 rounded-full border-[#2a3546] bg-transparent px-2.5 text-[10px] text-zinc-300 hover:bg-[#1c2430]"
            onClick={() => {
              useProject.getState().setBatchMode(false);
              useProject.getState().deselectAll();
            }}
          >
            <X className="h-3 w-3" /> {t("sel.exit")}
          </Button>
        </div>
      )}

      <SilenceDialog open={silenceOpen} onOpenChange={setSilenceOpen} />

      {/* juntar clipes: todas as faixas ou uma específica */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="max-w-sm border-[#232d3d] bg-[#121722] text-zinc-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Combine className="h-4 w-4 text-sky-400" /> {t("join.title")}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">{t("join.hint")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-1.5 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                const n = useProject.getState().closeAllGaps();
                engine.markDirty();
                setJoinOpen(false);
                toast.success(n ? t("join.doneAll", { n }) : t("join.already"));
              }}
              className="flex w-full items-center gap-2 rounded-lg border border[var(--gc-accent-40)] bg[var(--gc-accent-10)] px-3 py-2.5 text-left transition hover:bg[var(--gc-accent-20)]"
            >
              <UnfoldHorizontal className="h-4 w-4 text-[var(--gc-accent)]" />
              <span>
                <span className="block text-xs font-semibold text-[var(--gc-accent)]">{t("join.all")}</span>
                <span className="block text-[10px] text-zinc-500">{t("join.allHint")}</span>
              </span>
            </button>
            {tracks.filter((tr) => clips.some((c) => c.trackId === tr.id)).map((tr) => (
              <button
                key={tr.id}
                type="button"
                onClick={() => {
                  useProject.getState().closeTrackGaps(tr.id);
                  engine.markDirty();
                  setJoinOpen(false);
                  toast.success(t("join.doneTrack", { name: tr.name }));
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-[#2a3546] px-3 py-2 text-left transition hover:border-[#3a4759]"
              >
                {tr.kind === "video" ? <Film className="h-4 w-4 text-emerald-400" /> : tr.kind === "audio" ? <AudioLines className="h-4 w-4 text-amber-400" /> : <TypeIcon className="h-4 w-4 text-zinc-400" />}
                <span>
                  <span className="block text-xs font-medium text-zinc-200">{t("join.track", { name: tr.name })}</span>
                  <span className="block text-[10px] text-zinc-500">{t("join.nClips", { n: clips.filter((c) => c.trackId === tr.id).length })}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* formato do vídeo difere do projeto → oferece mudar */}
      <Dialog open={!!askAspect} onOpenChange={(v) => !v && setAskAspect(null)}>
        <DialogContent className="max-w-sm border-[#232d3d] bg-[#121722] text-zinc-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-[var(--gc-accent)]" /> {t("ask.title")}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              {askAspect && (
                <>
                  {t("ask.question", {
                    name: askAspect.name,
                    w: askAspect.w,
                    h: askAspect.h,
                    orient: askAspect.w > askAspect.h ? t("ex.horizontal") : askAspect.w === askAspect.h ? t("ex.square") : t("ex.vertical"),
                  })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-1">
            <button
              type="button"
              onClick={() => {
                if (!askAspect) return;
                // redimensiona mantendo a QUALIDADE do projeto (menor lado atual)
                const p = useProject.getState().project;
                const vertical = askAspect.h > askAspect.w;
                const short = Math.min(p.width, p.height);
                useProject.getState().setProject({
                  width: vertical ? short : Math.round(short * (askAspect.w / askAspect.h) / 2) * 2,
                  height: vertical ? Math.round(short * (askAspect.h / askAspect.w) / 2) * 2 : short,
                });
                engine.markDirty();
                setAskAspect(null);
                toast.success(t("ask.changed"), { description: t("ask.changedDesc") });
              }}
              className="rounded-lg border border[var(--gc-accent-50)] bg[var(--gc-accent-10)] px-3 py-2.5 text-xs font-semibold text-[var(--gc-accent)] transition hover:bg[var(--gc-accent-20)]"
            >
              {t("ask.change", { r: askAspect ? `${askAspect.w}×${askAspect.h}` : "" })}
            </button>
            <button
              type="button"
              onClick={() => setAskAspect(null)}
              className="rounded-lg border border-[#2a3546] px-3 py-2.5 text-xs text-zinc-300 transition hover:bg-[#1c2430]"
            >
              {t("ask.keep", { r: `${useProject.getState().project.width}×${useProject.getState().project.height}` })}
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-600">
            {t("ask.keepHint")}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- junções de transição ----------
function Junctions({ rowClips, zoom }: { rowClips: Clip[]; zoom: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const junctions: { left: Clip; right: Clip }[] = [];
  const sorted = [...rowClips].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    // transição só onde faz sentido: vídeo/imagem/texto (áudio ganha FADE, não transição)
    if (sorted[i].kind === "audio" || sorted[i - 1].kind === "audio") continue;
    if (Math.abs(clipEnd(sorted[i - 1]) - sorted[i].start) < 0.06) {
      junctions.push({ left: sorted[i - 1], right: sorted[i] });
    }
  }
  if (!junctions.length) return null;
  return (
    <>
      {junctions.map(({ left, right }) => (
        <TransitionJunction
          key={`j-${left.id}-${right.id}`}
          left={left}
          right={right}
          zoom={zoom}
          open={openId === right.id}
          onOpenChange={(v) => setOpenId(v ? right.id : null)}
        />
      ))}
    </>
  );
}

function TransitionJunction({
  left, right, zoom, open, onOpenChange,
}: {
  left: Clip;
  right: Clip;
  zoom: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const trans = right.transitionIn;
  const x = right.start * zoom - 9;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={`absolute top-1/2 z-30 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full border text-[9px] shadow transition ${
            trans && trans.type !== "none"
              ? "border-fuchsia-400/70 bg-[#2b1a3d] text-fuchsia-300 hover:bg-[#3a2450]"
              : "border-[#3a4759] bg-[#121722] text-zinc-500 opacity-70 hover:opacity-100 hover:text-fuchsia-300"
          }`}
          style={{ left: x }}
          title={tr("cm.transitionMenu")}
          aria-label={tr("cm.transitionMenu")}
        >
          <ArrowRightFromLine className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-60 border-[#232d3d] bg-[#121722] text-zinc-200" sideOffset={6}>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{tr("cm.transitionMenu")}</p>
        <p className="mb-2 text-[10px] text-zinc-500">{tr("cm.transitionMenu")}</p>
        <div className="mb-2 grid grid-cols-2 gap-1">
          {TRANSITIONS.map((tt) => (
            <button
              key={tt.type}
              onClick={() => useProject.getState().setTransition(right.id, tt.type === "none" ? undefined : { type: tt.type as TransitionType, duration: trans?.duration ?? 0.5 })}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] transition ${
                (trans?.type ?? "none") === tt.type
                  ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]"
                  : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
              }`}
            >
              <span className="w-3 text-center">{tt.icon}</span> {tr(`trans.${tt.type}`)}
            </button>
          ))}
        </div>
        {trans && trans.type !== "none" && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">{tr("ins.duration")}</span>
              <span className="font-mono text-[10px] text-[var(--gc-accent)]">{trans.duration.toFixed(2)}s</span>
            </div>
            <Slider
              value={[trans.duration]}
              min={0.1}
              max={Math.min(2, right.duration * 0.9, left.duration * 0.9)}
              step={0.05}
              onValueChange={(v) => useProject.getState().updateClip(right.id, { transitionIn: { ...trans, duration: v[0] } }, { history: false })}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PlayheadMarker({ zoom }: { zoom: number }) {
  const playhead = usePlayback((s) => s.playhead);
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-30 w-0"
      style={{ left: HEADER_W + playhead * zoom }}
      aria-hidden
    >
      <div className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
      <div className="absolute -top-0 left-0 h-3.5 w-3 -translate-x-1/2 rounded-b-[3px] bg-red-500" style={{ clipPath: "polygon(0 0, 100% 0, 100% 45%, 50% 100%, 0 45%)" }} />
    </div>
  );
}

/**
 * Barrinha de som da toolbar: movida pro PreviewStage — virou o medidor
 * horizontal estilo OBS (DbMeter), maior e com os números de decibéis.
 */

interface ClipBlockProps {
  clip: Clip;
  zoom: number;
  selected: boolean;
  missing: boolean;
  showWave: boolean;
  onDown: (e: React.PointerEvent, clip: Clip, mode: "move" | "left" | "right") => void;
}

/** Clipe na timeline — memoizado: mexer UM clipe não re-renderiza todos os outros. */
const ClipBlock = memo(function ClipBlock({ clip, zoom, selected, missing, showWave, onDown }: ClipBlockProps) {
  const media = useProject((s) => s.media.find((m) => m.id === clip.mediaId));
  const batchMode = useProject((s) => s.batchMode);
  // idioma mudou? os itens do menu de botão direito acompanham (memo precisa
  // de um motivo pra re-renderizar)
  const lang = useLang((s) => s.lang);
  void lang;
  const splitKey = useComboLabel("split");
  const delKey = useComboLabel("delete");
  const copyKey = useComboLabel("copy");
  const cutKey = useComboLabel("cut");
  const pasteKey = useComboLabel("paste");
  const dupKey = useComboLabel("duplicate");
  const w = Math.max(10, clip.duration * zoom);
  const left = clip.start * zoom;
  const kindStyle =
    clip.kind === "video"
      ? "border-emerald-500/40 bg-gradient-to-b from-[#0b3b2a] to-[#0a2e21]"
      : clip.kind === "image"
        ? "border-teal-500/40 bg-gradient-to-b from-[#0b363b] to-[#0a2b2f]"
        : clip.kind === "audio"
            ? "border-amber-500/40 bg-gradient-to-b from-[#3b2e0b] to-[#2e250a]"
            : "border-zinc-400/40 bg-gradient-to-b from-[#23272f] to-[#1c2027]";
  const hasTrans = !!clip.transitionIn && clip.transitionIn.type !== "none";

  // ---- itens do menu de botão direito (menu PRÓPRIO: não pisca) ----
  const items: MenuItem[] = [
    {
      label: tr("cm.cutAt"),
      icon: <Scissors className="h-3.5 w-3.5 text-[var(--gc-accent)]" />,
      kbd: splitKey,
      onClick: () => {
        useProject.getState().select(clip.id);
        useProject.getState().splitAt(usePlayback.getState().playhead);
        engine.markDirty();
      },
    },
    { label: tr("cm.copy"), icon: <Copy className="h-3.5 w-3.5" />, kbd: copyKey, onClick: () => useProject.getState().copyClip(clip.id) },
    {
      label: tr("cm.cut"),
      icon: <ScissorsIcon className="h-3.5 w-3.5" />,
      kbd: cutKey,
      onClick: () => {
        useProject.getState().copyClip(clip.id);
        useProject.getState().deleteClip(clip.id);
      },
    },
    {
      label: tr("cm.pasteHere"),
      icon: <ClipboardPaste className="h-3.5 w-3.5" />,
      kbd: pasteKey,
      onClick: () => {
        useProject.getState().select(clip.id);
        useProject.getState().pasteAtPlayhead();
      },
    },
    { label: tr("cm.duplicate"), icon: <Copy className="h-3.5 w-3.5" />, kbd: dupKey, onClick: () => useProject.getState().duplicateClip(clip.id) },
  ];
  if (clip.kind === "video" || clip.kind === "audio") {
    items.push({
      label: clip.muted ? tr("cm.unmute") : tr("cm.mute"),
      icon: clip.muted ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />,
      onClick: () => useProject.getState().updateClip(clip.id, { muted: !clip.muted }),
    });
  }
  if (clip.kind === "video" && clip.videoHidden) {
    items.push({
      label: tr("cm.showScene"),
      icon: <Eye className="h-3.5 w-3.5" />,
      onClick: () => useProject.getState().updateClip(clip.id, { videoHidden: false }),
    });
  }
  if (clip.kind === "video") {
    items.push({
      label: tr("cm.extractAudio"),
      icon: <AudioLinesIcon className="h-3.5 w-3.5 text-amber-400" />,
      onClick: () => {
        const tid = toast.loading(tr("cm.extracting"));
        useProject
          .getState()
          .extractAudio(clip.id)
          .then((audio) => {
            engine.markDirty();
            if (audio) {
              toast.success(tr("cm.extractDone"), {
                id: tid,
                description: tr("cm.extractDoneDesc", { s: audio.start.toFixed(1) }),
              });
            } else {
              toast.error(tr("cm.extractFail"), { id: tid });
            }
          });
      },
    });
  }
  if (clip.kind === "video" || clip.kind === "audio") {
    items.push({
      label: tr("cm.silence"),
      icon: <AudioWaveform className="h-3.5 w-3.5 text-[var(--gc-accent)]" />,
      onClick: () => {
        useProject.getState().select(clip.id);
        window.dispatchEvent(new CustomEvent("galaxiacut:opensilence"));
      },
    });
  }
  items.push({ type: "sep" });
  if (clip.kind === "audio") {
    // áudio não tem transição VISUAL — o que faz sentido é FADE (abrir/fechar o som)
    items.push({
      type: "submenu",
      label: tr("cm.fadeMenu"),
      icon: <ArrowRightFromLine className="h-3.5 w-3.5 text-amber-400" />,
      children: [
        ...[0.3, 0.5, 1, 2].map((s) => ({
          label: tr("cm.fadeIn", { s }),
          onClick: () => {
            useProject.getState().updateClip(clip.id, { fadeIn: s });
            engine.markDirty();
          },
        })),
        { type: "sep" as const },
        ...[0.3, 0.5, 1, 2].map((s) => ({
          label: tr("cm.fadeOut", { s }),
          onClick: () => {
            useProject.getState().updateClip(clip.id, { fadeOut: s });
            engine.markDirty();
          },
        })),
        ...((clip.fadeIn > 0 || clip.fadeOut > 0)
          ? [{
              label: tr("cm.removeFades"),
              danger: true,
              onClick: () => {
                useProject.getState().updateClip(clip.id, { fadeIn: 0, fadeOut: 0 });
                engine.markDirty();
              },
            }]
          : []),
      ],
    });
  } else {
    items.push({
      type: "submenu",
      label: tr("cm.transitionMenu"),
      icon: <ArrowRightFromLine className="h-3.5 w-3.5 text-fuchsia-400" />,
      children: TRANSITIONS.map((tt) => ({
        label: tr(`trans.${tt.type}`),
        onClick: () =>
          useProject.getState().setTransition(clip.id, tt.type === "none" ? undefined : { type: tt.type as TransitionType, duration: clip.transitionIn?.duration ?? 0.5 }),
      })),
    });
  }
  items.push(
    { type: "sep" },
    {
      label: tr("cm.closeGap"),
      icon: <ArrowLeftToLine className="h-3.5 w-3.5 text-sky-400" />,
      title: tr("cm.closeGapHint"),
      onClick: () => {
        useProject.getState().closeGapBefore(clip.id);
        engine.markDirty();
      },
    },
    {
      label: tr("cm.delete"),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      kbd: delKey,
      danger: true,
      onClick: () => useProject.getState().deleteClip(clip.id),
    },
    {
      label: tr("cm.deleteClose"),
      icon: <UnfoldHorizontal className="h-3.5 w-3.5" />,
      danger: true,
      title: tr("cm.deleteCloseHint"),
      onClick: () => {
        useProject.getState().deleteClip(clip.id, true);
        engine.markDirty();
      },
    }
  );

  return (
    <FloatMenu items={items}>
      <div
        className={`group absolute bottom-1 top-1 overflow-hidden rounded-md border text-[10px] transition-shadow ${kindStyle} ${
          selected
            ? batchMode
              ? "z-20 ring-2 ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]"
              : "z-20 ring-2 ring-[var(--gc-accent)] shadow-[0_0_12px_var(--gc-accent-35)]"
            : "hover:brightness-125"
        } ${missing ? "border-red-500/60" : ""}`}
        style={{ left, width: w }}
        onPointerDown={(e) => onDown(e, clip, "move")}
        onDoubleClick={(e) => {
          if (e.button !== 0) return;
          const st = useProject.getState();
          if (!st.batchMode) {
            st.setBatchMode(true);
            st.select(clip.id);
            toast.info(tr("tl.batchOn"), { description: tr("tl.batchOnDesc") });
          } else {
            st.toggleSelect(clip.id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={tr("cm.clipLabel", { kind: clip.kind, s: Math.round(clip.duration * 10) / 10 })}
      >
        <ClipContent clip={clip} zoom={zoom} media={media} missing={missing} showWave={showWave} hasTrans={hasTrans} />
        {/* alças de trim */}
        <div
          className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-white/0 transition group-hover:bg-white/25"
          onPointerDown={(e) => onDown(e, clip, "left")}
          title={tr("cm.trimLeft")}
        />
        <div
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-white/0 transition group-hover:bg-white/25"
          onPointerDown={(e) => onDown(e, clip, "right")}
          title={tr("cm.trimRight")}
        />
      </div>
    </FloatMenu>
  );
});

function ClipContent({
  clip, zoom, media, missing, showWave, hasTrans,
}: {
  clip: Clip;
  zoom: number;
  media?: { thumbnail?: string; peaks?: number[]; duration: number; name: string };
  missing: boolean;
  showWave: boolean;
  hasTrans: boolean;
}) {
  const showWaveform = (clip.kind === "audio" || clip.kind === "video") && showWave && !clip.muted && !!media?.peaks?.length;
  // v7.3: selo de efeitos visuais aplicados (o dono pediu: aplicou efeito,
  // o clipe mostra que tem efeito)
  const hasFx =
    clip.brightness !== 1 || clip.contrast !== 1 || clip.saturation !== 1 ||
    clip.blur > 0 || clip.hue !== 0 || clip.sepia > 0 || clip.grayscale > 0 ||
    clip.opacity < 1 || clip.rotation !== 0 || clip.scale !== 1;
  return (
    <div className="pointer-events-none absolute inset-0">
      {(clip.kind === "video" || clip.kind === "image") && media?.thumbnail && (
        <div
          className="absolute inset-0 opacity-80"
          style={{ backgroundImage: `url(${media.thumbnail})`, backgroundRepeat: "repeat-x", backgroundSize: "auto 100%" }}
        />
      )}
      {showWaveform ? (
        <>
          <Waveform peaks={media!.peaks!} mediaDuration={media!.duration} clip={clip} color={clip.kind === "audio" ? "rgba(251,191,36,0.75)" : "rgba(52,211,153,0.55)"} />
          {clip.kind === "video" && <div className="absolute inset-0 bg-black/30" />}
        </>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 z-[5] flex items-center gap-1 bg-black/45 px-1 py-[1px] text-[9px] text-zinc-200">
        {clip.kind === "video" ? (
          <Film className="h-2.5 w-2.5 text-emerald-400" />
        ) : clip.kind === "image" ? (
          <ImageIcon className="h-2.5 w-2.5 text-teal-400" />
        ) : clip.kind === "audio" ? (
          <Music2 className="h-2.5 w-2.5 text-amber-400" />
        ) : (
          <TypeIcon className="h-2.5 w-2.5 text-zinc-300" />
        )}
        <span className="truncate">
          {missing ? "mídia ausente" : clip.kind === "text" ? (clip.text?.content ?? "Texto") : media?.name}
        </span>
        <span className="ml-auto tabular-nums opacity-70">{(Math.round(clip.duration * 10) / 10).toFixed(1)}s</span>
        {clip.enhance && <Wand2 className="h-2.5 w-2.5 text-[var(--gc-accent)]" />}
        {clip.keyframes && clip.keyframes.length > 0 && (
          <span className="flex items-center gap-0.5 rounded-sm bg-amber-500/25 px-0.5 text-[8px] font-bold leading-none text-amber-300" title={`${clip.keyframes.length} losangos (keyframes ◆)`}>
            <span className="text-[7px]">◆</span>{clip.keyframes.length}
          </span>
        )}
        {clip.animation && (clip.animation.inType || clip.animation.outType || clip.animation.comboType) && (
          <span className="flex items-center gap-0.5 rounded-sm bg-violet-500/25 px-0.5 text-[8px] font-bold leading-none text-violet-300" title="Animação ativa">
            <Wand2 className="h-2 w-2" />anim
          </span>
        )}
        {clip.effects && clip.effects.filter((e) => e.enabled).length > 0 && (
          <span className="flex items-center gap-0.5 rounded-sm bg-emerald-500/25 px-0.5 text-[8px] font-bold leading-none text-emerald-300" title={`${clip.effects.filter((e) => e.enabled).length} efeitos visuais`}>
            <Sparkles className="h-2 w-2" />{clip.effects.filter((e) => e.enabled).length}fx
          </span>
        )}
        {hasFx && !clip.effects?.length && !clip.keyframes?.length && (
          <span className="flex items-center gap-0.5 rounded-sm bg-fuchsia-500/20 px-0.5 text-[8px] font-bold leading-none text-fuchsia-300" title={tr("tl.fxBadge")}>
            <Sparkles className="h-2 w-2" />fx
          </span>
        )}
        {clip.speed !== 1 && (
          <span className="rounded-sm bg-sky-500/20 px-0.5 text-[8px] font-bold leading-none text-sky-300" title={tr("tl.speedBadge")}>
            {clip.speed}×
          </span>
        )}
        {clip.muted && <VolumeX className="h-2.5 w-2.5 text-amber-400" />}
        {clip.videoHidden && <EyeOff className="h-2.5 w-2.5 text-sky-400" />}
        {hasTrans && <ArrowRightFromLine className="h-2.5 w-2.5 text-fuchsia-400" />}
      </div>
      {/* Marcadores visuais dos Losangos (Keyframes ◆) ao longo do clipe */}
      {clip.keyframes && clip.keyframes.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-1 z-10">
          {clip.keyframes.map((k) => (
            <div
              key={k.id}
              className="absolute top-0 h-2 w-2 -translate-x-1/2 rotate-45 border border-amber-300 bg-amber-400 shadow-[0_0_4px_#f59e0b]"
              style={{ left: `${(k.time / clip.duration) * 100}%` }}
              title={`Losango ◆ aos ${k.time.toFixed(2)}s`}
            />
          ))}
        </div>
      )}
      {clip.fadeIn > 0 && <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-white/25 to-transparent" style={{ width: clip.fadeIn * zoom }} />}
      {clip.fadeOut > 0 && <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-white/25 to-transparent" style={{ width: clip.fadeOut * zoom }} />}
      {missing && <TriangleAlert className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-red-400" />}
    </div>
  );
}

function Waveform({ peaks, mediaDuration, clip, color }: { peaks: number[]; mediaDuration: number; clip: Clip; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth || 10;
    const h = cv.clientHeight || 30;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color ?? "rgba(251, 191, 36, 0.75)";
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      const t = clip.inPoint + (x / w) * clip.duration * clip.speed;
      const idx = Math.min(peaks.length - 1, Math.max(0, Math.floor((t / mediaDuration) * peaks.length)));
      const amp = peaks[idx] * (h / 2 - 3);
      ctx.fillRect(x, mid - amp, 1, amp * 2 || 1);
    }
  }, [peaks, mediaDuration, clip.inPoint, clip.duration, clip.speed, clip.id, color]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
