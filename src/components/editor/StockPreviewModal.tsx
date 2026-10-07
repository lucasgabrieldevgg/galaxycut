// GalaxyCut — Modal de Pré-Visualização de Vídeo e Áudio em Tela Cheia / Grande
// Permite assistir vídeos de estoque e ouvir músicas/efeitos com player completo,
// controle de volume, scrubbing e botão de adicionar diretamente à timeline.
"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Plus, Star, Loader2, Music2, Film, Download, Check } from "lucide-react";
import { StockItem, resolveIaFile, downloadStockFile } from "@/lib/editor/stockClient";
import { useFavorites } from "@/lib/editor/favorites";
import { useProject } from "@/lib/editor/store";
import { registry } from "@/lib/editor/media";
import { licenseLevel, LICENSE_STYLE } from "@/lib/editor/types";
import { toast } from "sonner";

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
  const [muted, setMuted] = useState(false);
  const [adding, setAdding] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    const p = el.play();
    if (p !== undefined) {
      p.then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [resolvedUrl, open, item?.audio]);

  if (!item) return null;

  const isAudio = Boolean(item.audio);
  const lv = licenseLevel(item.license);
  const ls = LICENSE_STYLE[lv];

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
    el.currentTime = Math.max(0, Math.min((el.duration || 0) - 0.05, el.currentTime + d));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-[#232d3d] bg-[#0e1320] text-zinc-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-4 pb-2 border-b border-[#1c2430] flex flex-row items-center justify-between">
          <div className="min-w-0 flex-1 pr-4">
            <DialogTitle className="truncate text-sm font-semibold flex items-center gap-2">
              {isAudio ? <Music2 className="h-4 w-4 text-amber-400" /> : <Film className="h-4 w-4 text-emerald-400" />}
              <span className="truncate">{item.title}</span>
            </DialogTitle>
            <DialogDescription className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2">
              <span>{item.provider}</span>
              {item.creator && <span>• {item.creator}</span>}
              <span className={`rounded border px-1 py-px text-[9px] ${ls.cls}`}>{item.license.toUpperCase()}</span>
            </DialogDescription>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleFavorite(item, isAudio ? "music" : "video")}
            className={`h-8 gap-1.5 text-xs transition ${
              isFavorite
                ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                : "border border-[#2a3546] text-zinc-400 hover:text-amber-300"
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
            {isFavorite ? "Favorito" : "Favoritar"}
          </Button>
        </DialogHeader>

        {/* Player Viewport */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--gc-accent)]" />
              <span className="text-xs text-zinc-300">Carregando pré-visualização...</span>
            </div>
          )}

          {isAudio ? (
            <div className="flex flex-col items-center justify-center gap-4 w-full h-full bg-gradient-to-br from-[#1c1809] via-[#0d111a] to-[#090c14] p-6 text-center">
              <div className="relative h-24 w-24 rounded-2xl overflow-hidden border border-amber-500/30 shadow-xl bg-black/50 flex items-center justify-center">
                {item.thumb ? (
                  <img src={item.thumb} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <Music2 className="h-10 w-10 text-amber-400" />
                )}
                {playing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="flex h-3 w-3 animate-ping rounded-full bg-amber-400 opacity-75" />
                  </div>
                )}
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
            <video
              ref={videoRef}
              playsInline
              muted={muted}
              className="h-full w-full object-contain"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={() => setTime(videoRef.current?.currentTime ?? 0)}
              onLoadedMetadata={() => setDur(videoRef.current?.duration || item.duration || 0)}
              onEnded={() => setPlaying(false)}
              onClick={togglePlay}
            />
          )}
        </div>

        {/* Controles de Reprodução */}
        <div className="p-3 bg-[#121722] border-t border-[#1c2430] space-y-2">
          {/* Barra de Progresso / Seek */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-400 w-10 text-right">{fmt(time)}</span>
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
              className="gc-range h-1.5 flex-1 cursor-pointer accent-[var(--gc-accent)]"
              aria-label="Posição do áudio/vídeo"
            />
            <span className="font-mono text-[10px] text-zinc-500 w-10">{fmt(dur)}</span>
          </div>

          {/* Botões de Controle e Ação */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white"
                onClick={() => skip(-5)}
                title="Voltar 5s"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                onClick={togglePlay}
                className="h-9 w-9 rounded-full bg-[var(--gc-accent)] text-black hover:bg-[var(--gc-accent-hover)] font-bold shadow"
              >
                {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white"
                onClick={() => skip(5)}
                title="Avançar 5s"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white ml-1"
                onClick={() => setMuted((m) => !m)}
                title={muted ? "Ativar Som" : "Mudo"}
              >
                {muted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1a2230] text-xs h-8"
              >
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={adding}
                className="gap-1.5 bg-[var(--gc-accent)] hover:bg-[var(--gc-accent-hover)] text-black font-semibold text-xs h-8 shadow"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Adicionar à Timeline
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
