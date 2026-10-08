// GalaxyCut — Modal de Pré-Visualização de Vídeo e Áudio em Alta Definição
// Permite assistir vídeos e ouvir músicas/efeitos com player completo,
// controle de volume, scrubbing, loop, tela cheia e botão de adicionar diretamente à timeline.
"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Plus,
  Star,
  Loader2,
  Music2,
  Film,
  X,
  Maximize,
  Minimize,
  Repeat,
} from "lucide-react";
import { StockItem, resolveIaFile } from "@/lib/editor/stockClient";
import { useFavorites } from "@/lib/editor/favorites";
import { licenseLevel, LICENSE_STYLE } from "@/lib/editor/types";

interface StockPreviewModalProps {
  item: StockItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddStock: (item: StockItem) => Promise<void>;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function StockPreviewModal({ item, open, onOpenChange, onAddStock }: StockPreviewModalProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [adding, setAdding] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const isFavorite = useFavorites((s) => (item ? s.isFavorite(item.id) : false));
  const toggleFavorite = useFavorites((s) => s.toggleFavorite);

  // Resolve URL do item (ex: Internet Archive)
  useEffect(() => {
    if (!open || !item) {
      setResolvedUrl(null);
      setPlaying(false);
      setTime(0);
      setDur(0);
      return;
    }

    let active = true;
    if (item.provider.includes("Internet Archive") || item.id.startsWith("ia-")) {
      setLoading(true);
      void resolveIaFile(item.id.replace(/^ia-/, ""))
        .then((res) => {
          if (active) {
            setResolvedUrl(res.url);
            if (res.duration) setDur(res.duration);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setResolvedUrl(item.url);
            setLoading(false);
          }
        });
    } else {
      setResolvedUrl(item.url);
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [open, item]);

  // Autoplay quando a URL estiver pronta
  useEffect(() => {
    if (!resolvedUrl || !open) return;
    const el = item?.audio ? audioRef.current : videoRef.current;
    if (!el) return;
    el.src = resolvedUrl;
    el.currentTime = 0;
    el.volume = muted ? 0 : volume;
    el.loop = loop;
    const p = el.play();
    if (p !== undefined) {
      p.then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [resolvedUrl, open, item?.audio]);

  // Sincroniza volume e loop
  useEffect(() => {
    const el = item?.audio ? audioRef.current : videoRef.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
    el.loop = loop;
  }, [volume, muted, loop, item?.audio]);

  if (!item) return null;

  const isAudio = Boolean(item.audio);
  const lv = licenseLevel(item.license || "cc0");
  const ls = LICENSE_STYLE[lv] ?? { cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };

  const getMediaEl = () => (isAudio ? audioRef.current : videoRef.current);

  const togglePlay = () => {
    const el = getMediaEl();
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => undefined);
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

  const handleAdd = async () => {
    setAdding(true);
    try {
      await onAddStock(item);
      onOpenChange(false);
    } finally {
      setAdding(false);
    }
  };

  const toggleFullscreen = () => {
    if (!viewportRef.current) return;
    if (!document.fullscreenElement) {
      void viewportRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => undefined);
    } else {
      void document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[94vw] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col border border-[#232d3d] bg-[#0e1320] text-zinc-100 p-0 overflow-hidden shadow-2xl rounded-2xl gap-0 z-50"
      >
        {/* Header Superior Limpo e Alinhado */}
        <DialogHeader className="shrink-0 px-4 py-3 border-b border-[#1c2430] flex flex-row items-center justify-between gap-3 bg-[#111724]">
          <div className="min-w-0 flex-1 pr-2">
            <DialogTitle className="truncate text-sm sm:text-base font-semibold flex items-center gap-2 text-zinc-100">
              {isAudio ? <Music2 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-amber-400" /> : <Film className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-emerald-400" />}
              <span className="truncate">{item.title}</span>
            </DialogTitle>
            <DialogDescription className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="font-medium text-zinc-300">{item.provider}</span>
              {item.creator && <span className="truncate">• {item.creator}</span>}
              <span className={`rounded border px-1.5 py-px text-[9px] font-semibold ${ls.cls}`}>
                {(item.license || "CC0").toUpperCase()}
              </span>
            </DialogDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleFavorite(item, isAudio ? "music" : "video")}
              className={`h-8 px-2.5 gap-1.5 text-xs font-medium transition rounded-lg ${
                isFavorite
                  ? "bg-amber-400/20 text-amber-300 border border-amber-400/50 hover:bg-amber-400/30"
                  : "border border-[#2a3546] text-zinc-300 hover:text-amber-300 hover:bg-[#1a2230]"
              }`}
              title={isFavorite ? "Remover dos Favoritos" : "Favoritar"}
            >
              <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
              <span className="hidden sm:inline">{isFavorite ? "Favorito" : "Favoritar"}</span>
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-[#1c2430] rounded-lg"
              title="Fechar (Esc)"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Player Viewport — Amplo e Responsivo */}
        <div
          ref={viewportRef}
          className="relative flex-1 min-h-[200px] max-h-[50vh] sm:max-h-[56vh] md:max-h-[60vh] w-full bg-black flex items-center justify-center overflow-hidden select-none"
        >
          {loading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/75 backdrop-blur-xs gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--gc-accent)]" />
              <span className="text-xs text-zinc-300 font-medium">Carregando arquivo...</span>
            </div>
          )}

          {isAudio ? (
            <div className="flex flex-col items-center justify-center gap-3 w-full h-full bg-gradient-to-br from-[#1c1608] via-[#0d111a] to-[#090c14] p-6 text-center">
              <div className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-2xl overflow-hidden border border-amber-500/30 shadow-2xl bg-black/60 flex items-center justify-center group">
                {item.thumb ? (
                  <img src={item.thumb} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <Music2 className="h-12 w-12 sm:h-14 sm:w-14 text-amber-400" />
                )}
                {playing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                    <span className="flex h-4 w-4 animate-ping rounded-full bg-amber-400 opacity-80" />
                  </div>
                )}
              </div>
              <div className="max-w-md">
                <p className="text-sm sm:text-base font-semibold text-zinc-200 truncate">{item.title}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{item.creator || item.provider}</p>
              </div>
              <audio
                ref={audioRef}
                playsInline
                muted={muted}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={() => setTime(audioRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDur(audioRef.current?.duration || item.duration || 0)}
                onEnded={() => setPlaying(false)}
              />
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted={muted}
                className="h-full w-full max-h-[50vh] sm:max-h-[56vh] md:max-h-[60vh] object-contain cursor-pointer"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={() => setTime(videoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setDur(videoRef.current?.duration || item.duration || 0)}
                onEnded={() => setPlaying(false)}
                onClick={togglePlay}
              />
              {/* Botão de Tela Cheia no Viewport */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white/80 backdrop-blur-xs transition hover:bg-black/80 hover:text-white shadow"
                title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
                aria-label="Tela Cheia"
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            </>
          )}
        </div>

        {/* Controles de Reprodução e Ação — Nunca Cortam os Botões */}
        <div className="shrink-0 p-3 sm:p-4 bg-[#121722] border-t border-[#1c2430] flex flex-col gap-2.5">
          {/* Linha 1: Barra de Progresso / Scrubbing e Tempos */}
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs tabular-nums text-zinc-400 w-12 text-right shrink-0">
              {fmt(time)}
            </span>
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
              className="gc-range h-2 flex-1 min-w-0 cursor-pointer accent-[var(--gc-accent)]"
              aria-label="Posição do áudio/vídeo"
            />
            <span className="font-mono text-xs tabular-nums text-zinc-500 w-12 shrink-0">
              {fmt(dur)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 shrink-0 transition ${loop ? "text-[var(--gc-accent)] bg-[var(--gc-accent-20)]" : "text-zinc-500 hover:text-zinc-300"}`}
              onClick={() => setLoop((l) => !l)}
              title={loop ? "Repetição ativada (Loop)" : "Repetir áudio/vídeo"}
            >
              <Repeat className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Linha 2: Botões de Controle e Ações Finais */}
          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            {/* Controles de Reprodução Esquerda */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-[#1c2430] rounded-lg"
                onClick={() => skip(-5)}
                title="Voltar 5s"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                onClick={togglePlay}
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-[var(--gc-accent)] text-black hover:bg-[var(--gc-accent-hover)] font-bold shadow-md transition hover:scale-105"
                title={playing ? "Pausar" : "Tocar"}
              >
                {playing ? <Pause className="h-4 w-4 sm:h-5 sm:w-5 fill-current" /> : <Play className="ml-0.5 h-4 w-4 sm:h-5 sm:w-5 fill-current" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-[#1c2430] rounded-lg"
                onClick={() => skip(5)}
                title="Avançar 5s"
              >
                <RotateCw className="h-4 w-4" />
              </Button>

              {/* Volume / Mudo */}
              <div className="flex items-center gap-1.5 ml-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-[#1c2430] rounded-lg"
                  onClick={() => setMuted((m) => !m)}
                  title={muted ? "Ativar Som" : "Mudo"}
                >
                  {muted || volume === 0 ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setVolume(v);
                    if (muted && v > 0) setMuted(false);
                  }}
                  className="gc-range h-1.5 w-16 sm:w-20 cursor-pointer accent-[var(--gc-accent)] hidden sm:inline-block"
                  aria-label="Volume"
                />
              </div>
            </div>

            {/* Ações Direitas: Fechar e Adicionar à Timeline */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1a2230] text-xs sm:text-sm h-9 px-3.5 rounded-lg"
              >
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={adding}
                className="gap-1.5 bg-[var(--gc-accent)] hover:bg-[var(--gc-accent-hover)] text-black font-semibold text-xs sm:text-sm h-9 px-4 shadow-md rounded-lg transition hover:scale-[1.02]"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
                Adicionar à Linha do Tempo
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
