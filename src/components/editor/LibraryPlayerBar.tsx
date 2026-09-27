// GalaxyCut — barra do player da biblioteca: fica embaixo do painel, sem atrapalhar,
// com pausar, avançar/voltar e mexer livre na linha do tempo do áudio/vídeo.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, RotateCw, X, Loader2, Music2, Video as VideoIcon } from "lucide-react";
import { useLibPlayer, LibItem } from "@/lib/editor/libPlayer";
import { useT } from "@/lib/editor/i18n";

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LibraryPlayerBar() {
  const t = useT();
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
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);

  // montou com src? toca
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !src) return;
    el.src = src;
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [src]);

  const el = mediaRef.current;
  const toggle = () => {
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => undefined);
    } else {
      el.pause();
      setPlaying(false);
    }
  };
  const skip = (d: number) => {
    if (!el) return;
    el.currentTime = Math.max(0, Math.min((el.duration || 0) - 0.05, el.currentTime + d));
    setTime(el.currentTime);
  };

  return (
    <div className="flex h-[74px] shrink-0 items-center gap-2.5 border-t border-[#1c2430] bg-[#0e1320] px-2.5">
      {/* janelinha do vídeo (áudio mostra só o ícone) */}
      <div className="relative h-[52px] w-[74px] shrink-0 overflow-hidden rounded border border-[#232d3d] bg-black">
        {item.kind === "video" ? (
          <video
            ref={mediaRef}
            className="h-full w-full object-contain"
            playsInline
            onTimeUpdate={() => setTime(mediaRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDur(mediaRef.current?.duration || 0)}
            onEnded={() => setPlaying(false)}
            onError={() => setPlaying(false)}
          />
        ) : (
          <>
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              onTimeUpdate={() => setTime((mediaRef.current as HTMLAudioElement)?.currentTime ?? 0)}
              onLoadedMetadata={() => setDur((mediaRef.current as HTMLAudioElement)?.duration || 0)}
              onEnded={() => setPlaying(false)}
              onError={() => setPlaying(false)}
            />
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#3b2e0b] to-[#2e250a]">
              <Music2 className="h-5 w-5 text-amber-400/80" />
            </div>
          </>
        )}
      </div>

      {/* título + controles */}
      <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-1">
        <p className="truncate text-[11px] font-medium text-zinc-300" title={item.title}>
          {item.kind === "video" ? <VideoIcon className="mr-1 inline h-3 w-3 text-emerald-400" /> : null}
          {loading ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin text-zinc-500" /> : null}
          {item.title}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
            onClick={() => skip(-5)}
            aria-label={t("lib.back5")}
            title={t("lib.back5")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full bg-[var(--gc-accent)] p-0 text-black hover:bg-[var(--gc-accent-hover)]"
            onClick={toggle}
            aria-label={playing ? t("lib.pause") : t("lib.play")}
          >
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
            onClick={() => skip(5)}
            aria-label={t("lib.fwd5")}
            title={t("lib.fwd5")}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          {/* mexe livre na linha do tempo */}
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.05}
            value={Math.min(time, dur || 0)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTime(v);
              if (mediaRef.current) mediaRef.current.currentTime = v;
            }}
            className="gc-range h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--gc-accent)]"
            aria-label={t("lib.position")}
          />
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
            {fmt(time)} <span className="text-zinc-700">/ {fmt(dur)}</span>
          </span>
        </div>
      </div>

      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-zinc-500 hover:text-zinc-200" onClick={onClose} aria-label={t("lib.close")}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
