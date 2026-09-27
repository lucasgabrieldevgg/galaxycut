// GaláxiaCut — preview + controles de reprodução.
// v7.1: o quadro do vídeo é EXATAMENTE do tamanho do formato do projeto (fit
// calculado em px) com uma moldura demarcando o limite da tela na cor do app —
// e as alças de editar (mover/escalar/girar) só aparecem quando você CLICA no
// clipe dentro da prévia. Clique fora delas = tocar/pausar, como sempre.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProject, usePlayback } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { useComboLabel } from "@/lib/editor/shortcuts";
import { engine } from "@/lib/editor/playback";
import { fmtTime } from "@/lib/editor/types";
import { useT } from "@/lib/editor/i18n";
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
  const t = useT();
  return (
    <Button
      onClick={() => engine.toggle()}
      className="h-10 w-10 rounded-full bg-[var(--gc-accent)] p-0 text-black shadow-[0_0_16px_var(--gc-accent-30)] transition hover:scale-105 hover:bg-[var(--gc-accent-hover)]"
      aria-label={playing ? t("pv.pause", { key }) : t("pv.play", { key })}
    >
      {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
    </Button>
  );
}

/** Retângulo do clipe no espaço do projeto (mesmo cálculo do render.ts). */
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

/** Mede o container e devolve o tamanho exato (px) que respeita a proporção do projeto. */
function useFitSize(ref: React.RefObject<HTMLDivElement | null>, w: number, h: number) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth - 24; // padding do container
      const H = el.clientHeight - 24;
      if (W <= 0 || H <= 0) return;
      const k = Math.min(W / w, H / h);
      setSize({ w: Math.max(2, Math.floor(w * k)), h: Math.max(2, Math.floor(h * k)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, w, h]);
  return size;
}

export function PreviewStage({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const project = useProject((s) => s.project);
  const duration = usePlayback((s) => s.duration);
  const selectedId = useProject((s) => s.selectedId);
  const selected = useProject((s) => s.clips.find((c) => c.id === s.selectedId));
  const playhead = usePlayback((s) => s.playhead);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editMode, setEditMode] = useState(false); // alças visíveis (clicou no clipe aqui)
  const [, setTick] = useState(0); // força re-render das alças quando o clipe muda
  const t = useT();

  // tamanho EXATO do quadro do vídeo na tela (fim da "demarcação esquisita")
  const fit = useFitSize(containerRef, project.width, project.height);

  useEffect(() => {
    if (canvasRef.current) engine.bind(canvasRef.current);
  }, []);

  // trocou a seleção pela timeline? o modo de edição aqui só liga clicando na
  // prévia (padrão React de ajustar state quando uma "prop" muda — sem effect)
  const [prevSelected, setPrevSelected] = useState(selectedId);
  if (prevSelected !== selectedId) {
    setPrevSelected(selectedId);
    setEditMode(false);
  }

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
  const showHandles =
    editMode && !!selected && activeNow && (selected.kind === "video" || selected.kind === "image") && sw > 0 && sh > 0 && fit.w > 0;
  const rect = showHandles && selected ? clipRect(selected, project, sw, sh) : null;
  const k = fit.w > 0 && rect ? fit.w / project.width : 1; // projeto → px exatos do quadro

  /** Clique dentro do clipe selecionado (em coords do projeto)? */
  function hitSelectedClip(px: number, py: number): boolean {
    if (!selected || !(selected.kind === "video" || selected.kind === "image") || !activeNow || !sw || !sh) return false;
    if (selected.rotation) return true; // girado: aproximamos pelo quadro inteiro
    const r = clipRect(selected, project, sw, sh);
    if (!r) return false;
    return Math.abs(px - r.cx) <= r.dw / 2 && Math.abs(py - r.cy) <= r.dh / 2;
  }

  /** Converte px da tela → coordenadas do projeto (com o frame exato). */
  function toProject(e: { clientX: number; clientY: number }): { px: number; py: number } | null {
    const cv = canvasRef.current;
    if (!cv || !fit.w) return null;
    const b = cv.getBoundingClientRect();
    return {
      px: ((e.clientX - b.left) / b.width) * project.width,
      py: ((e.clientY - b.top) / b.height) * project.height,
    };
  }

  /** inicia o arraste de ESCALA (cantos) ou ROTAÇÃO (alça de cima) */
  function onHandleDown(e: React.PointerEvent, mode: "scale" | "rotate") {
    if (!selected || !rect || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const st = useProject.getState();
    st.pushHistory();
    const b = canvasRef.current!.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const cx = rect.cx;
    const cy = rect.cy;
    const startDist = Math.hypot(startX - (b.left + (cx / project.width) * b.width), startY - (b.top + (cy / project.height) * b.height)) || 1;
    const startAngle = Math.atan2(startY - (b.top + (cy / project.height) * b.height), startX - (b.left + (cx / project.width) * b.width));
    const scale0 = selected.scale;
    const rot0 = selected.rotation;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      moved = true;
      const s = useProject.getState();
      const cX = b.left + (cx / project.width) * b.width;
      const cY = b.top + (cy / project.height) * b.height;
      if (mode === "scale") {
        const d = Math.hypot(ev.clientX - cX, ev.clientY - cY);
        const next = Math.max(0.1, Math.min(4, scale0 * (d / startDist)));
        s.updateClip(selected.id, { scale: Math.round(next * 100) / 100 }, { history: false });
      } else {
        const a = Math.atan2(ev.clientY - cY, ev.clientX - cX);
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
    const hit = toProject(e);

    // clique parado sobre o clipe selecionado → LIGA o modo de edição (alças)
    // clique parado fora → desliga (se tava ligado) ou toca/pausa (se tava desligado)
    const hitClip = !!hit && hitSelectedClip(hit.px, hit.py);

    const onMove = (ev: PointerEvent) => {
      if (!cv || !clip || !(clip.kind === "text" || clip.kind === "video" || clip.kind === "image")) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return; // clique parado
      if (!moved) {
        // arrastar DIRETO sobre o clipe também vale editar (CapCut faz assim)
        if (hitClip) setEditMode(true);
        moved = true;
        setDragging(true);
        useProject.getState().pushHistory();
      }
      if (!editMode && !hitClip && clip.kind !== "text") return; // arrasto no vazio não mexe em nada
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
      if (!moved) {
        if (hitClip) setEditMode(true); // quer mexer: alças aparecem
        else if (editMode) setEditMode(false); // clique fora: sai do modo (sem dar play)
        else engine.toggle(); // era só um clique → play/pause
      } else setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Esc sai do modo de edição das alças
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editMode) setEditMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  const H = 11; // tamanho da alça (px)
  const handleCls =
    "pointer-events-auto absolute z-10 flex items-center justify-center rounded-full border-2 border-[#080b11] bg-[var(--gc-accent)] shadow-[0_0_8px_var(--gc-accent-50)] transition hover:scale-110";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#05070a]">
      <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        {/* quadro do vídeo: EXATAMENTE no formato do projeto, com moldura que
            demarca o limite da tela (na cor que o dono escolheu pro app) */}
        <div
          className="relative"
          style={{ width: fit.w || 1, height: fit.h || 1 }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            className={`h-full w-full rounded-md bg-black object-contain shadow-2xl ${
              editMode
                ? "cursor-move border-2 border-[var(--gc-accent)]"
                : dragging
                  ? "cursor-grabbing border-2 border-[var(--gc-accent-50)]"
                  : draggable
                    ? "cursor-grab border border-[var(--gc-accent-25)]"
                    : "cursor-pointer border border-[var(--gc-accent-25)]"
            }`}
            style={{ aspectRatio: `${project.width} / ${project.height}` }}
            aria-label={t("pv.preview")}
            title={editMode ? t("pv.editOn") : draggable ? t("pv.clickToEdit") : t("pv.play", { key: "▶" })}
          />
          {/* alças de transformação do clipe (só no modo de edição: clicou no clipe) */}
          {rect && selected && (
            <div
              className="pointer-events-none absolute z-10 border-2 border-dashed border-[var(--gc-accent)] shadow-[0_0_10px_var(--gc-accent-20)]"
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
                title={t("sc.scaleRotate")}
                role="button"
                aria-label={t("sc.scaleRotate")}
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
                  title={t("pv.dragVideo")}
                  role="button"
                  aria-label={t("pv.dragVideo")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-t border-[#1c2430] bg-[#0c1017] px-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => engine.seek(0)} aria-label={t("pv.start")}>
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => engine.nudgeFrames(-1)} aria-label={t("pv.prevFrame")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <PlayButton />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={() => engine.nudgeFrames(1)} aria-label={t("pv.nextFrame")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="ml-2">
          <TimeDisplay />
        </div>
        {editMode && (
          <span className="ml-2 hidden items-center gap-1 rounded border border[var(--gc-accent-30)] bg[var(--gc-accent-10)] px-1.5 py-0.5 text-[10px] text-[var(--gc-accent)] sm:flex" title={t("pv.editOn")}>
            <Move className="h-3 w-3" />
            {t("pv.editOn")}
          </span>
        )}
        {!editMode && draggable && !dragging && (
          <span className="ml-2 hidden items-center gap-1 rounded border border[var(--gc-accent-30)] bg[var(--gc-accent-10)] px-1.5 py-0.5 text-[10px] text-[var(--gc-accent)] sm:flex" title={t("pv.clickToEdit")}>
            <Move className="h-3 w-3" />
            {selected?.kind === "text"
              ? selected.isCaption
                ? selected.posLock
                  ? t("pv.dragCapLock")
                  : t("pv.dragCapAll")
                : t("pv.dragText")
              : t("pv.clickToEdit")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* medidor de áudio horizontal estilo OBS — som no ponto da seta, em decibéis */}
          <DbMeter className="w-44 shrink-0 lg:w-56" label={t("pv.sound")} />
          <span className="hidden rounded border border-[#2a3546] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 xl:inline">{aspect}</span>
          <span className="hidden rounded border border-[#2a3546] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 lg:inline">{project.fps}fps</span>
          {duration > 0 && (
            <span className="hidden rounded border border[var(--gc-accent-30)] bg[var(--gc-accent-10)] px-1.5 py-0.5 text-[10px] text-[var(--gc-accent)] lg:inline">
              {t("pv.videoOf", { t: fmtTime(duration) })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
