// GaláxiaCut — preview + controles de reprodução.
// v7: edição VISUAL estilo CapCut — com o clipe selecionado aparecem alças pra
// mover (arraste), escalar (cantos) e girar (alça de cima). Tudo sincronizado
// com os números do painel da direita (mexeu num, mexe no outro).
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProject, usePlayback } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { useComboLabel } from "@/lib/editor/shortcuts";
import { engine } from "@/lib/editor/playback";
import { fmtTime } from "@/lib/editor/types";
import { Play, Pause, SkipBack, ChevronLeft, ChevronRight, Move, RotateCw } from "lucide-react";
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

/** Retângulo desenhado do clipe no espaço do projeto (o mesmo cálculo do render.ts). */
function clipRect(
  clip: { kind: string; scale: number; x: number; y: number; rotation: number; id: string },
  project: { width: number; height: number },
  sw: number,
  sh: number
): { cx: number; cy: number; dw: number; dh: number } | null {
  if (!sw || !sh) return null;
  const base = Math.min(project.width / sw, project.height / sh);
  const dw = sw * base * clip.scale;
  const dh = sh * base * clip.scale;
  const cx = project.width / 2 + (clip.x * project.width) / 2;
  const cy = project.height / 2 + (clip.y * project.height) / 2;
  return { cx, cy, dw, dh };
}

export function PreviewStage({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const project = useProject((s) => s.project);
  const duration = usePlayback((s) => s.duration);
  const selectedId = useProject((s) => s.selectedId);
  const selected = useProject((s) => s.clips.find((c) => c.id === s.selectedId));
  const playhead = usePlayback((s) => s.playhead);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [, setTick] = useState(0); // força re-render das alças quando o clipe muda
  const [canvasW, setCanvasW] = useState(0); // largura exibida do canvas (alças em px)

  useEffect(() => {
    if (canvasRef.current) engine.bind(canvasRef.current);
  }, []);

  // mede o canvas quando ele muda de tamanho (alças precisam acompanhar)
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const measure = () => setCanvasW(cv.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);

  const aspect = `${project.width}×${project.height}`;
  // dá pra arrastar texto/vídeo/imagem selecionado (legendas: todas juntas, salvo trava)
  const draggable = !!selected && (selected.kind === "text" || selected.kind === "video" || selected.kind === "image");

  // o clipe selecionado tá ativo na posição da seta? (as alças só fazem sentido aí)
  const activeNow =
    !!selected && selected.start <= playhead + 0.0001 && selected.start + selected.duration > playhead - 0.0001;

  // ---- geometria das alças (espaço do projeto → pixels da tela) ----
  const el = selected ? engine.getElement(selected.id) : undefined;
  const sw = el instanceof HTMLVideoElement ? el.videoWidth : el instanceof HTMLImageElement ? el.naturalWidth : 0;
  const sh = el instanceof HTMLVideoElement ? el.videoHeight : el instanceof HTMLImageElement ? el.naturalHeight : 0;
  const showHandles = !!selected && activeNow && (selected.kind === "video" || selected.kind === "image") && sw > 0 && sh > 0;
  const rect = showHandles && selected ? clipRect(selected, project, sw, sh) : null;
  const k = canvasW > 0 && rect ? canvasW / project.width : 1; // projeto → px

  /** inicia o arraste de ESCALA (cantos) ou ROTAÇÃO (alça de cima) */
  function onHandleDown(e: React.PointerEvent, mode: "scale" | "rotate") {
    if (!selected || !rect || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const st = useProject.getState();
    st.pushHistory();
    const startX = e.clientX;
    const startY = e.clientY;
    const cx = rect.cx;
    const cy = rect.cy;
    const startDist = Math.hypot(startX - cx, startY - cy) || 1;
    const startAngle = Math.atan2(startY - cy, startX - cx);
    const scale0 = selected.scale;
    const rot0 = selected.rotation;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      moved = true;
      const s = useProject.getState();
      if (mode === "scale") {
        const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        const next = Math.max(0.1, Math.min(4, scale0 * (d / startDist)));
        s.updateClip(selected.id, { scale: Math.round(next * 100) / 100 }, { history: false });
      } else {
        const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
        let deg = rot0 + ((a - startAngle) * 180) / Math.PI;
        deg = ((Math.round(deg) % 360) + 360) % 360;
        if (deg > 180) deg -= 360;
        s.updateClip(selected.id, { rotation: deg }, { history: false });
      }
      engine.markDirty();
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) useProject.getState().undo(); // clique parado: devolve o histórico vazio
      setTick((n) => n + 1);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

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

  const H = 11; // tamanho da alça (px)
  const handleCls =
    "pointer-events-auto absolute z-10 flex items-center justify-center rounded-full border-2 border-[#080b11] bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.5)] transition hover:scale-110";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#080b11]">
      <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        <div className="relative" style={{ aspectRatio: `${project.width} / ${project.height}`, maxHeight: "100%", maxWidth: "100%", height: "auto", width: "100%" }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            className={`h-full w-full rounded-md border border-[#1c2430] bg-black object-contain shadow-2xl ${
              dragging ? "cursor-grabbing" : draggable ? "cursor-grab" : "cursor-pointer"
            }`}
            style={{ aspectRatio: `${project.width} / ${project.height}` }}
            aria-label="Pré-visualização do vídeo"
            title={draggable ? "Arraste para mover o clipe selecionado · clique para tocar/pausar" : "Clique para tocar/pausar"}
          />
          {/* alças de transformação do clipe selecionado (estilo CapCut) */}
          {rect && selected && (
            <div
              className="pointer-events-none absolute z-10 border-2 border-dashed border-[#22C55E]"
              style={{
                left: (rect.cx - rect.dw / 2) * k,
                top: (rect.cy - rect.dh / 2) * k,
                width: rect.dw * k,
                height: rect.dh * k,
                transform: selected.rotation ? `rotate(${selected.rotation}deg)` : undefined,
              }}
            >
              {/* alça de rotação (acima do topo) */}
              <div
                className={handleCls}
                style={{ left: "50%", top: -26, width: 22, height: 22, marginLeft: -11, cursor: "grab", touchAction: "none" }}
                onPointerDown={(e) => onHandleDown(e, "rotate")}
                title="Arraste para girar o clipe"
                role="button"
                aria-label="Girar clipe"
              >
                <RotateCw className="h-3 w-3 text-black" />
              </div>
              {/* 4 cantos de escala */}
              {(
                [
                  { cls: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cur: "nwse-resize" },
                  { cls: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cur: "nesw-resize" },
                  { cls: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cur: "nesw-resize" },
                  { cls: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cur: "nwse-resize" },
                ] as const
              ).map((c, i) => (
                <div
                  key={i}
                  className={`${handleCls} ${c.cls}`}
                  style={{ width: H, height: H, marginLeft: 0, cursor: c.cur, touchAction: "none" }}
                  onPointerDown={(e) => onHandleDown(e, "scale")}
                  title="Arraste para mudar o tamanho"
                  role="button"
                  aria-label={`Escalar clipe (canto ${i + 1})`}
                />
              ))}
            </div>
          )}
        </div>
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
              : "Arraste: mover · cantos: tamanho · alça: girar"}
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
