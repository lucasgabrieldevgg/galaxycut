// GaláxiaCut — preview + controles de reprodução (com arrastar pra mover clipe/legenda)
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProject, usePlayback } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { useComboLabel } from "@/lib/editor/shortcuts";
import { engine } from "@/lib/editor/playback";
import { fmtTime } from "@/lib/editor/types";
import { Play, Pause, SkipBack, ChevronLeft, ChevronRight, Move } from "lucide-react";
import { DbMeter } from "./DbMeter";

function TimeDisplay() {
  const playhead = usePlayback((s) => s.playhead);
  const duration = usePlayback((s) => s.duration);
  return (
    <span className="font-mono text-xs tabular-nums text-zinc-300">
      {fmtTime(playhead)} <span className="text-zinc-600">/ {fmtTime(duration)}</span>
    </span>
  );
}

function PlayButton() {
  const playing = usePlayback((s) => s.playing);
  const key = useComboLabel("playPause");
  return (
    <Button
      onClick={() => engine.toggle()}
      className="h-10 w-10 rounded-full bg-[#22C55E] p-0 text-black shadow-[0_0_16px_rgba(34,197,94,0.3)] transition hover:scale-105 hover:bg-[#1ed467]"
      aria-label={playing ? `Pausar (${key})` : `Tocar (${key})`}
    >
      {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
    </Button>
  );
}

export function PreviewStage({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const project = useProject((s) => s.project);
  const duration = usePlayback((s) => s.duration);
  const selectedId = useProject((s) => s.selectedId);
  const selected = useProject((s) => s.clips.find((c) => c.id === s.selectedId));
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (canvasRef.current) engine.bind(canvasRef.current);
  }, []);

  const aspect = `${project.width}×${project.height}`;
  // dá pra arrastar texto/vídeo/imagem selecionado (legendas: todas juntas, salvo trava)
  const draggable = !!selected && (selected.kind === "text" || selected.kind === "video" || selected.kind === "image");

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const cv = canvasRef.current;
    const clip = useProject.getState().clips.find((c) => c.id === selectedId);

    const onMove = (ev: PointerEvent) => {
      if (!cv || !clip || !(clip.kind === "text" || clip.kind === "video" || clip.kind === "image")) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return; // clique parado = tocar/pausar
      if (!moved) {
        moved = true;
        setDragging(true);
        useProject.getState().pushHistory();
      }
      const rect = cv.getBoundingClientRect();
      // posição em coordenadas do projeto
      const px = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * project.width;
      const py = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * project.height;
      const x = Math.max(-1, Math.min(1, (px / project.width) * 2 - 1));
      const y = Math.max(-1, Math.min(1, (py / project.height) * 2 - 1));
      const st = useProject.getState();
      st.updateClip(clip.id, { x, y }, { history: false });
      // legenda gerada e destravada: mexer numa mexe TODAS (posição global)
      if (clip.kind === "text" && clip.isCaption && !clip.posLock) {
        useSettings.getState().set({ captionPos: { x, y } });
      }
      engine.markDirty();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) engine.toggle(); // foi só um clique → play/pause
      else setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#080b11]">
      <div ref={containerRef} className="flex min-h-0 flex-1 items-center justify-center p-3">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          className={`max-h-full max-w-full rounded-md border border-[#1c2430] bg-black shadow-2xl ${
            dragging ? "cursor-grabbing" : draggable ? "cursor-grab" : "cursor-pointer"
          }`}
          style={{ aspectRatio: `${project.width} / ${project.height}`, maxHeight: "100%", maxWidth: "100%", height: "auto", width: "100%", objectFit: "contain" }}
          aria-label="Pré-visualização do vídeo"
          title={draggable ? "Arraste para mover o clipe selecionado · clique para tocar/pausar" : "Clique para tocar/pausar"}
        />
      </div>
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-t border-[#1c2430] bg-[#0c1017] px-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => engine.seek(0)} aria-label="Voltar ao início">
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => engine.nudgeFrames(-1)} aria-label="Frame anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <PlayButton />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => engine.nudgeFrames(1)} aria-label="Próximo frame">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="ml-2">
          <TimeDisplay />
        </div>
        {draggable && !dragging && (
          <span className="ml-2 hidden items-center gap-1 rounded border border-[#22C55E]/30 bg-[#22C55E]/10 px-1.5 py-0.5 text-[10px] text-[#22C55E] sm:flex" title="Arraste o elemento na tela para reposicionar">
            <Move className="h-3 w-3" />
            {selected?.kind === "text"
              ? selected.isCaption
                ? selected.posLock
                  ? "Arraste: só esta legenda (travada)"
                  : "Arraste: todas as legendas juntas"
                : "Arraste: mover texto"
              : "Arraste: mover clipe"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* medidor de áudio horizontal estilo OBS — som no ponto da seta, em decibéis */}
          <DbMeter className="w-44 shrink-0 lg:w-56" label="Som no ponto da seta (decibéis)" />
          <span className="hidden rounded border border-[#2a3546] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 xl:inline">{aspect}</span>
          <span className="hidden rounded border border-[#2a3546] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 lg:inline">{project.fps}fps</span>
          {duration > 0 && (
            <span className="hidden rounded border border-[#22C55E]/30 bg-[#22C55E]/10 px-1.5 py-0.5 text-[10px] text-[#22C55E] lg:inline">
              {fmtTime(duration)} de vídeo
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
