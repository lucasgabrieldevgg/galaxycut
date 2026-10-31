// GalaxyCut — barra do player da biblioteca: fica embaixo do painel de mídia,
// perfeitamente ajustada para larguras estreitas sem cortar botões,
// com pausar, avançar/voltar, scrubbing suave e botão de expandir para prévia grande.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  X,
  Loader2,
  Music2,
  Video as VideoIcon,
  Maximize2,
  Plus,
  Volume2,
  VolumeX,
  Scissors,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useLibPlayer, LibItem } from "@/lib/editor/libPlayer";
import { useT } from "@/lib/editor/i18n";
import { useProject } from "@/lib/editor/store";
import { registry } from "@/lib/editor/media";
import { downloadStockFile } from "@/lib/editor/stockClient";
import { StockPreviewModal } from "./StockPreviewModal";
import { toast } from "sonner";

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LibraryPlayerBar() {
  const item = useLibPlayer((s) => s.item);
  const src = useLibPlayer((s) => s.src);
  const loading = useLibPlayer((s) => s.loading);
  const close = useLibPlayer((s) => s.close);

  if (!item) return null;
  // key = item+src: trocar de mídia REMONTA o player (estado limpo, do zero)
  return <PlayerCore key={`${item.id}|${src ?? ""}`} item={item} src={src} loading={loading} onClose={close} />;
}

function PlayerCore({
  item,
  src,
  loading,
  onClose,
}: {
  item: LibItem;
  src: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // modo corte: trecho in/out marcado NA PRÉVIA, antes de ir pra timeline
  const [trim, setTrim] = useState<{ inPt: number; outPt: number } | null>(null);

  const addMedia = useProject((s) => s.addMedia);
  const addClipFromMedia = useProject((s) => s.addClipFromMedia);

  const getMediaEl = () => (item.kind === "video" ? videoRef.current : audioRef.current);

  // montou com src? toca
  useEffect(() => {
    const el = getMediaEl();
    if (!el || !src) return;
    el.src = src;
    el.currentTime = 0;
    el.volume = muted ? 0 : 1;
    try {
      el.load();
    } catch {}
    const p = el.play();
    if (p !== undefined) {
      p.then(() => setPlaying(true)).catch((e) => {
        console.warn("Playback auto-start notice:", e);
        setPlaying(false);
      });
    }
  }, [src, item.kind]);

  const toggle = () => {
    const el = getMediaEl();
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const skip = (d: number) => {
    const el = getMediaEl();
    if (!el) return;
    el.currentTime = Math.max(0, Math.min((el.duration || dur || 0) - 0.05, el.currentTime + d));
    setTime(el.currentTime);
  };

  // modo corte: a prévia dá loop dentro do trecho marcado (feedback ao vivo)
  const handleTimeUpdate = (cur: number) => {
    const el = getMediaEl();
    if (trim && el && !el.paused && dur > 0.2 && cur >= trim.outPt - 0.05 && trim.outPt < dur - 0.05) {
      el.currentTime = trim.inPt;
      setTime(trim.inPt);
    } else {
      setTime(cur);
    }
  };

  const markIn = () => {
    if (!trim || !dur) return;
    const cur = getMediaEl()?.currentTime ?? time;
    const inPt = Math.max(0, Math.min(cur, dur - 0.2));
    const outPt = Math.max(inPt + 0.2, Math.min(trim.outPt, dur));
    setTrim({ inPt, outPt });
  };

  const markOut = () => {
    if (!trim || !dur) return;
    const cur = getMediaEl()?.currentTime ?? time;
    const outPt = Math.min(dur, Math.max(cur, 0.2));
    const inPt = Math.min(Math.max(0, trim.inPt), outPt - 0.2);
    setTrim({ inPt, outPt });
  };

  const handleAddDirect = async () => {
    setAdding(true);
    try {
      if (item.rawStockItem) {
        const catName = item.kind === "video" ? "Vídeos" : "Músicas & Efeitos";
        const catFolder = useProject.getState().getOrCreateCategoryFolder(catName);
        const blob = await downloadStockFile(item.rawStockItem.url);
        const meta = await registry.importFile(blob, `${item.title}.${item.kind === "video" ? "mp4" : "mp3"}`);
        addMedia({
          ...meta,
          source: "stock",
          stockUrl: item.rawStockItem.url,
          folderId: catFolder.id,
          license: item.rawStockItem.license,
          licenseLabel: item.rawStockItem.license,
          creator: item.rawStockItem.creator,
        });
        addClipFromMedia(meta.id);
        useProject.getState().setCurrentFolderId(catFolder.id);
        toast.success(t("st.addedToTimeline"));
      } else {
        // Se for mídia local — com trecho marcado, entra só o corte escolhido
        const range = trim && trim.outPt - trim.inPt > 0.2 ? { inPoint: trim.inPt, outPoint: trim.outPt } : undefined;
        addClipFromMedia(item.id, range);
        toast.success(range ? t("lib.rangeAdded") : t("mp.addedClip"));
      }
    } catch {
      toast.error(t("st.errorDownload"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-[#1c2430] bg-[#0e1320] px-3 py-2 shadow-xl select-none">
        {/* Elemento de Áudio/Vídeo invisível ou mini */}
        <div className="sr-only pointer-events-none">
          {item.kind === "video" ? (
            <video
              ref={videoRef}
              playsInline
              preload="auto"
              muted={muted}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={() => handleTimeUpdate(videoRef.current?.currentTime ?? 0)}
              onLoadedMetadata={() => setDur(videoRef.current?.duration || 0)}
              onEnded={() => setPlaying(false)}
              onError={(e) => {
                console.warn("Video element playback warning:", e);
                setPlaying(false);
              }}
            />
          ) : (
            <audio
              ref={audioRef}
              preload="auto"
              muted={muted}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={() => handleTimeUpdate(audioRef.current?.currentTime ?? 0)}
              onLoadedMetadata={() => setDur(audioRef.current?.duration || 0)}
              onEnded={() => setPlaying(false)}
              onError={(e) => {
                console.warn("Audio element playback warning:", e);
                setPlaying(false);
              }}
            />
          )}
        </div>

        {/* Linha 1: Thumbnail/Ícone + Título + Tempo + Botão Expandir + Fechar */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded bg-[#18202f] border border-[#232d3d] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gc-accent)]" />
            ) : item.thumb ? (
              <img src={item.thumb} alt={item.title} className="h-full w-full object-cover" />
            ) : item.kind === "video" ? (
              <VideoIcon className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Music2 className="h-3.5 w-3.5 text-amber-400" />
            )}
          </div>

          <p className="truncate text-xs font-semibold text-zinc-200 flex-1 min-w-0" title={item.title}>
            {item.title}
          </p>

          <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-400">
            {fmt(time)} <span className="text-zinc-600">/ {fmt(dur)}</span>
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-400 hover:text-white hover:bg-[#1c2430] rounded"
            onClick={() => setModalOpen(true)}
            title={t("lib.expand")}
            aria-label={t("lib.expand")}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-500 hover:text-zinc-200 hover:bg-[#1c2430] rounded"
            onClick={onClose}
            title={t("lib.close")}
            aria-label={t("lib.close")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Modo corte: barra do trecho + marcação de início/fim antes de adicionar */}
        {trim && dur > 0 && (
          <>
            <div className="relative h-1 w-full rounded bg-[#1c2430]">
              <div
                className="absolute inset-y-0 rounded bg-[var(--gc-accent-60)]"
                style={{ left: `${(trim.inPt / dur) * 100}%`, width: `${((trim.outPt - trim.inPt) / dur) * 100}%` }}
              />
              <div className="absolute -top-[3px] h-2 w-[2px] rounded bg-white" style={{ left: `${(trim.inPt / dur) * 100}%` }} />
              <div className="absolute -top-[3px] h-2 w-[2px] rounded bg-white" style={{ left: `${(trim.outPt / dur) * 100}%` }} />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded px-2 text-[10px] font-semibold text-zinc-300 hover:bg-[#1c2430] hover:text-white"
                onClick={markIn}
                title={t("lib.setIn")}
              >
                <ChevronLeft className="h-3 w-3" /> {t("lib.setIn")} {fmt(trim.inPt)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded px-2 text-[10px] font-semibold text-zinc-300 hover:bg-[#1c2430] hover:text-white"
                onClick={markOut}
                title={t("lib.setOut")}
              >
                {t("lib.setOut")} {fmt(trim.outPt)} <ChevronRight className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 rounded px-2 text-[10px] text-zinc-500 hover:bg-[#1c2430] hover:text-zinc-300"
                onClick={() => setTrim({ inPt: 0, outPt: dur })}
              >
                {t("lib.resetRange")}
              </Button>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500">
                {t("lib.range", { a: fmt(trim.inPt), b: fmt(trim.outPt), d: (trim.outPt - trim.inPt).toFixed(1) })}
              </span>
            </div>
          </>
        )}

        {/* Linha 2: Controles de Reprodução + Barra de Progresso Inteira + Volume + Adicionar */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-400 hover:text-zinc-200 p-0"
            onClick={() => skip(-5)}
            aria-label={t("lib.back5")}
            title={t("lib.back5")}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full bg-[var(--gc-accent)] p-0 text-black hover:bg-[var(--gc-accent-hover)] font-bold shadow-sm transition hover:scale-105"
            onClick={toggle}
            aria-label={playing ? t("lib.pause") : t("lib.play")}
          >
            {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-400 hover:text-zinc-200 p-0"
            onClick={() => skip(5)}
            aria-label={t("lib.fwd5")}
            title={t("lib.fwd5")}
          >
            <RotateCw className="h-3 w-3" />
          </Button>

          {/* Range Slider de Scrubbing com largura flexível garantida */}
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.05}
            value={Math.min(time, dur || 0)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTime(v);
              const el = getMediaEl();
              if (el) el.currentTime = v;
            }}
            className="gc-range h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--gc-accent)]"
            aria-label={t("lib.position")}
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-400 hover:text-zinc-200 p-0"
            onClick={() => setMuted((m) => !m)}
            title={muted ? t("lib.unmute") : t("lib.mute")}
          >
            {muted ? <VolumeX className="h-3 w-3 text-red-400" /> : <Volume2 className="h-3 w-3" />}
          </Button>

          {/** liga/desliga o modo corte (só pra mídia local — stock baixa inteiro) */}
          {!item.rawStockItem && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-6 w-6 shrink-0 rounded p-0 ${trim ? "bg-[var(--gc-accent-15)] text-[var(--gc-accent)]" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1c2430]"}`}
              onClick={() => setTrim((tr) => (tr ? null : { inPt: 0, outPt: dur || 0 }))}
              title={t("lib.trim")}
              aria-label={t("lib.trim")}
              aria-pressed={!!trim}
            >
              <Scissors className="h-3 w-3" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={handleAddDirect}
            disabled={adding}
            className="h-6 px-2 text-[10px] font-semibold bg-[var(--gc-accent)] hover:bg-[var(--gc-accent-hover)] text-black rounded shrink-0 shadow gap-1"
            title={trim ? t("lib.addRange") : t("lib.addToTimeline")}
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" strokeWidth={3} />}
            <span className="hidden xs:inline">{trim ? t("lib.addRange") : t("lib.add")}</span>
          </Button>
        </div>
      </div>

      {/* Modal Grande quando clicar em Expandir */}
      {modalOpen && (
        <StockPreviewModal
          item={
            item.rawStockItem || {
              id: item.id,
              title: item.title,
              url: item.url,
              // item.thumb é opcional no LibItem; o modal tolera ausência em runtime (comportamento pré-tipagem)
              thumb: item.thumb as string,
              duration: dur || 0,
              provider: item.provider || "GalaxyCut",
              license: item.license || "cc0",
              creator: item.creator,
              audio: item.kind === "audio",
            }
          }
          open={modalOpen}
          onOpenChange={setModalOpen}
          onAddStock={async () => {
            await handleAddDirect();
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
