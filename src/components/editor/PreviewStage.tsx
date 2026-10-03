// GalaxyCut — preview + controles de reprodução.
// v7.1: o quadro do vídeo é EXATAMENTE do tamanho do formato do projeto (fit
// calculado em px) com uma moldura demarcando o limite da tela na cor do app —
// e as alças de editar (mover/escalar/girar) só aparecem quando você CLICA no
// clipe dentro da prévia.
// v7.2:
//  - clicar num elemento da prévia SELECIONA ele (se tiver 2 sobrepostos, o de
//    cima ganha — texto primeiro, depois as faixas de vídeo de cima pra baixo);
//    arrastar move QUELE que foi clicado, não o que estava selecionado antes;
//  - arraste com requestAnimationFrame (1 atualização por quadro) — fim do modo
//    de mexer "travado";
//  - modo MAGNÉTICO (ímã na barrinha): chegou perto do centro → gruda e acende
//    as linhas de centralização (1 vertical + 1 horizontal, como os editores
//    grandes fazem); perto da borda → gruda na borda. Botão do ímã desliga
//    (modo livre) e fica salvo nas configurações;
//  - clique FORA da prévia (em qualquer outro lugar do app) desliga o modo de
//    mexer e deixa o clipe onde estava.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProject, usePlayback } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { useComboLabel } from "@/lib/editor/shortcuts";
import { engine } from "@/lib/editor/playback";
import { Clip, fmtTime } from "@/lib/editor/types";
import { useT } from "@/lib/editor/i18n";
import { Play, Pause, SkipBack, ChevronLeft, ChevronRight, Move, RotateCw, Magnet, Diamond } from "lucide-react";
import { DbMeter } from "./DbMeter";
import { toast } from "sonner";

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

// ---------- caixa de TEXTO medida (mesma fórmula do render.ts) ----------
let measureCtx: CanvasRenderingContext2D | null = null;

/** Caixa ocupada por um clipe de texto (medição de verdade, com quebra de linha). */
function textRect(
  clip: Clip,
  W: number,
  H: number
): { cx: number; cy: number; dw: number; dh: number } | null {
  const tp = clip.text;
  if (!tp || !tp.content?.trim()) return null;
  if (!measureCtx) {
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d");
    if (!measureCtx) return null;
  }
  const ctx = measureCtx;
  const size = (tp.size * H) / 1080;
  ctx.font = `${tp.italic ? "italic " : ""}${tp.bold ? "700" : "400"} ${size}px ${tp.font}`;
  const raw = tp.content.split(/\s+/).filter(Boolean);
  const maxW = W * 0.88;
  const spaceW = ctx.measureText(" ").width;
  const lines: string[][] = [];
  let line: string[] = [];
  let lineW = 0;
  for (const tok of raw) {
    const w = ctx.measureText(tok).width;
    if (line.length && lineW + spaceW + w > maxW) {
      lines.push(line);
      line = [tok];
      lineW = w;
    } else {
      lineW += (line.length ? spaceW : 0) + w;
      line.push(tok);
    }
  }
  if (line.length) lines.push(line);
  if (!lines.length) return null;
  let maxLineW = 0;
  for (const ln of lines) {
    const w = ln.reduce((acc, wd) => acc + ctx.measureText(wd).width, 0) + spaceW * Math.max(0, ln.length - 1);
    if (w > maxLineW) maxLineW = w;
  }
  const pad = (tp.bgPad * H) / 1080;
  return {
    cx: W / 2 + (clip.x * W) / 2,
    cy: H / 2 + (clip.y * H) / 2,
    dw: maxLineW + pad * 2 + (tp.strokeW * H) / 540,
    dh: lines.length * size * 1.24 + pad * 1.6,
  };
}

/** Clique dentro deste retângulo (com folinha pros dedos)? */
function inRect(px: number, py: number, r: { cx: number; cy: number; dw: number; dh: number }): boolean {
  return Math.abs(px - r.cx) <= r.dw / 2 && Math.abs(py - r.cy) <= r.dh / 2;
}

/** AABB de um retângulo girado (hit-test do clipe girado). */
function rotAABB(r: { cx: number; cy: number; dw: number; dh: number }, deg: number) {
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = r.dw * c + r.dh * s;
  const h = r.dw * s + r.dh * c;
  return { cx: r.cx, cy: r.cy, dw: w, dh: h };
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

/** guias magnéticas acesas durante o arraste */
interface Guides {
  v: "center" | "left" | "right" | null;
  h: "center" | "top" | "bottom" | null;
}
const NO_GUIDES: Guides = { v: null, h: null };

export function PreviewStage({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const project = useProject((s) => s.project);
  const duration = usePlayback((s) => s.duration);
  const selectedId = useProject((s) => s.selectedId);
  const selected = useProject((s) => s.clips.find((c) => c.id === s.selectedId));
  const playhead = usePlayback((s) => s.playhead);
  const magnet = useSettings((s) => s.magnetMove);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editMode, setEditMode] = useState(false); // alças visíveis (clicou no clipe aqui)
  const [guides, setGuides] = useState<Guides>(NO_GUIDES);
  const [, setTick] = useState(0); // força re-render das alças quando o clipe muda
  const t = useT();

  // tamanho EXATO do quadro do vídeo na tela (fim da "demarcação esquisita")
  const fit = useFitSize(containerRef, project.width, project.height);

  useEffect(() => {
    if (canvasRef.current) engine.bind(canvasRef.current);
  }, []);

  // Informações de Keyframes do clipe selecionado
  const isInsideClip = !!selected && playhead >= selected.start - 0.001 && playhead <= selected.start + selected.duration + 0.001;
  const tRel = selected ? Math.max(0, Math.min(selected.duration, playhead - selected.start)) : 0;
  const kfs = (selected?.keyframes || []).slice().sort((a, b) => a.time - b.time);
  const currentKf = selected ? kfs.find((k) => Math.abs(k.time - tRel) < 0.08) : null;
  const prevKf = selected ? kfs.filter((k) => k.time < tRel - 0.08).pop() : null;
  const nextKf = selected ? kfs.filter((k) => k.time > tRel + 0.08)[0] : null;

  const jumpToKf = (time: number) => {
    if (!selected) return;
    engine.seek(selected.start + time);
  };

  const toggleKeyframeAtPlayhead = () => {
    if (!selected || !isInsideClip) {
      toast.info("Posicione a agulha dentro do clipe para marcar o losango ◆");
      return;
    }
    const addOrUpdateKeyframe = useProject.getState().addOrUpdateKeyframe;
    const deleteKeyframe = useProject.getState().deleteKeyframe;
    if (currentKf) {
      deleteKeyframe(selected.id, currentKf.id);
      toast.success("Losango ◆ removido neste ponto");
    } else {
      addOrUpdateKeyframe(selected.id, tRel, {
        x: selected.x,
        y: selected.y,
        scale: selected.scale,
        rotation: selected.rotation,
        opacity: selected.opacity,
      });
      toast.success("Losango ◆ marcado! Mova a figura na tela para animar.");
    }
    engine.markDirty();
  };

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
  // v7.3: TEXTO também ganha alças — a caixa é medida de verdade (textRect,
  // com quebra de linha igual ao render). Escalar ajusta o TAMANHO DA FONTE
  // (o que a pessoa espera: esticar o texto deixa as letras maiores).
  const textBox = selected?.kind === "text" ? textRect(selected, project.width, project.height) : null;
  const showHandles =
    editMode && !!selected && activeNow && fit.w > 0 &&
    ((selected.kind === "text" && !!textBox) || ((selected.kind === "video" || selected.kind === "image") && sw > 0 && sh > 0));
  const rect = showHandles && selected ? (selected.kind === "text" ? textBox : clipRect(selected, project, sw, sh)) : null;
  const k = fit.w > 0 && rect ? fit.w / project.width : 1; // projeto → px exatos do quadro

  /** Quem tá debaixo do clique? (TEXTO primeiro — é desenhado por cima —
   *  depois as faixas de vídeo na ordem da tela: a de cima ganha).
   *  2 elementos no mesmo trecho: clicou no de cima → mexe no de cima. */
  function pickClipAt(px: number, py: number): Clip | null {
    const st = useProject.getState();
    const { clips, tracks } = st;
    const W = project.width;
    const H = project.height;
    const at = (c: Clip) => c.start <= playhead + 0.0001 && c.start + c.duration > playhead - 0.0001;

    // texto por cima de tudo
    const textTrack = tracks.find((tr) => tr.kind === "text" && !tr.hidden);
    if (textTrack) {
      const c = clips.find((x) => x.trackId === textTrack.id && x.kind === "text" && !!x.text && at(x));
      if (c) {
        const r = textRect(c, W, H);
        if (r && inRect(px, py, c.rotation ? rotAABB(r, c.rotation) : r)) return c;
      }
    }
    // faixas de vídeo na ordem original (V3 topo → V1 base): a primeira que
    // contiver o clique é a que aparece por cima na prévia
    for (const tr of tracks.filter((x) => x.kind === "video" && !x.hidden)) {
      const c = clips.find((x) => x.trackId === tr.id && (x.kind === "video" || x.kind === "image") && !x.videoHidden && at(x));
      if (!c) continue;
      if (c.opacity < 0.03) continue; // invisível: não intercepta
      const media = engine.getElement(c.id);
      const msw = media instanceof HTMLVideoElement ? media.videoWidth : media instanceof HTMLImageElement ? media.naturalWidth : 0;
      const msh = media instanceof HTMLVideoElement ? media.videoHeight : media instanceof HTMLImageElement ? media.naturalHeight : 0;
      const r = msw && msh ? clipRect(c, project, msw, msh) : null;
      if (!r) continue;
      if (inRect(px, py, c.rotation ? rotAABB(r, c.rotation) : r)) return c;
    }
    return null;
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

  /** Aplica o encaixe magnético (só quando CHEGA PERTO, 2% da tela) e devolve
   *  as guias que devem acender. Trabalha no espaço do projeto. */
  function snapMove(
    clip: Clip,
    box: { cx: number; cy: number; dw: number; dh: number } | null,
    rawX: number,
    rawY: number
  ): { x: number; y: number; guides: Guides } {
    const g: Guides = { v: null, h: null };
    if (!magnet || !box) return { x: rawX, y: rawY, guides: g };
    const W = project.width;
    const H = project.height;
    const thX = W * 0.02;
    const thY = H * 0.02;
    const halfW = box.dw / 2;
    const halfH = box.dh / 2;
    const cx = W / 2 + (rawX * W) / 2;
    const cy = H / 2 + (rawY * H) / 2;
    let x = rawX;
    let y = rawY;
    // eixo X: centro primeiro, senão as bordas
    if (Math.abs(cx - W / 2) < thX) {
      x = 0;
      g.v = "center";
    } else if (Math.abs(cx - halfW) < thX) {
      x = (box.dw - W) / W; // borda esquerda do clipe encostando em 0
      g.v = "left";
    } else if (Math.abs(cx + halfW - W) < thX) {
      x = (W - box.dw) / W; // borda direita encostando em W
      g.v = "right";
    }
    // eixo Y: idem
    if (Math.abs(cy - H / 2) < thY) {
      y = 0;
      g.h = "center";
    } else if (Math.abs(cy - halfH) < thY) {
      y = (box.dh - H) / H;
      g.h = "top";
    } else if (Math.abs(cy + halfH - H) < thY) {
      y = (H - box.dh) / H;
      g.h = "bottom";
    }
    return { x, y, guides: g };
  }

  /** Caixa do clipe (vídeo/imagem pelo elemento; texto medindo as linhas). */
  function boxOf(clip: Clip): { cx: number; cy: number; dw: number; dh: number } | null {
    if (clip.kind === "text") return textRect(clip, project.width, project.height);
    const media = engine.getElement(clip.id);
    const msw = media instanceof HTMLVideoElement ? media.videoWidth : media instanceof HTMLImageElement ? media.naturalWidth : 0;
    const msh = media instanceof HTMLVideoElement ? media.videoHeight : media instanceof HTMLImageElement ? media.naturalHeight : 0;
    return msw && msh ? clipRect(clip, project, msw, msh) : null;
  }

  /** inicia o arraste de ESCALA (cantos) ou ROTAÇÃO (alça de cima) — com rAF.
   *  v7.3: em TEXTO, escalar muda o tamanho da fonte (não há scale de clipe). */
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
    const isText = selected.kind === "text";
    const scale0 = selected.scale;
    const size0 = selected.text?.size ?? 64;
    const rot0 = selected.rotation;
    let moved = false;
    let raf = 0;
    let latest: { clientX: number; clientY: number } | null = null;

    const apply = () => {
      raf = 0;
      if (!latest) return;
      const s = useProject.getState();
      const cur = s.clips.find((c) => c.id === selected.id);
      if (!cur) return;
      const cX = b.left + (cx / project.width) * b.width;
      const cY = b.top + (cy / project.height) * b.height;
      const curRel = Math.max(0, Math.min(cur.duration, playhead - cur.start));
      const hasKfs = (cur.keyframes && cur.keyframes.length > 0);

      if (mode === "scale") {
        const d = Math.hypot(latest.clientX - cX, latest.clientY - cY);
        const ratio = d / startDist;
        if (isText && cur.text) {
          // texto: alça de escala = tamanho da fonte (14…480)
          const next = Math.max(14, Math.min(480, Math.round(size0 * ratio)));
          s.updateClip(selected.id, { text: { ...cur.text, size: next } }, { history: false });
        } else {
          const next = Math.max(0.1, Math.min(4, scale0 * ratio));
          if (hasKfs) {
            s.addOrUpdateKeyframe(cur.id, curRel, { scale: Math.round(next * 100) / 100 });
          } else {
            s.updateClip(selected.id, { scale: Math.round(next * 100) / 100 }, { history: false });
          }
        }
      } else {
        const a = Math.atan2(latest.clientY - cY, latest.clientX - cX);
        let deg = rot0 + ((a - startAngle) * 180) / Math.PI;
        deg = ((Math.round(deg) % 360) + 360) % 360;
        if (deg > 180) deg -= 360;
        if (hasKfs) {
          s.addOrUpdateKeyframe(cur.id, curRel, { rotation: deg });
        } else {
          s.updateClip(selected.id, { rotation: deg }, { history: false });
        }
      }
      engine.markDirty();
    };
    const onMove = (ev: PointerEvent) => {
      moved = true;
      latest = ev;
      if (!raf) raf = requestAnimationFrame(apply); // 1× por quadro — liso
    };
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
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
    const hit = toProject(e);

    // QUEM foi clicado? (o de cima, se tiver 2 sobrepostos). Clicou noutro
    // elemento → ele vira o selecionado NA HORA e é ele quem mexe.
    const picked = hit ? pickClipAt(hit.px, hit.py) : null;
    if (picked && picked.id !== selectedId) {
      useProject.getState().select(picked.id);
      setEditMode(false); // reinicia o modo pro novo elemento
    }
    const clipId = picked?.id ?? selectedId;
    const clip = useProject.getState().clips.find((c) => c.id === clipId);
    const pickedHere = !!picked;

    let raf = 0;
    let latest: { px: number; py: number } | null = null;
    const applyMove = () => {
      raf = 0;
      if (!latest || !clip) return;
      const rawX = Math.max(-1, Math.min(1, (latest.px / project.width) * 2 - 1));
      const rawY = Math.max(-1, Math.min(1, (latest.py / project.height) * 2 - 1));
      const box = boxOf(clip);
      const snap = clip.kind === "text" || clip.kind === "video" || clip.kind === "image"
        ? snapMove(clip, box, rawX, rawY)
        : { x: rawX, y: rawY, guides: NO_GUIDES };
      const st = useProject.getState();
      const curRel = Math.max(0, Math.min(clip.duration, playhead - clip.start));
      const hasKfs = (clip.keyframes && clip.keyframes.length > 0);
      if (hasKfs) {
        st.addOrUpdateKeyframe(clip.id, curRel, { x: snap.x, y: snap.y });
      } else {
        st.updateClip(clip.id, { x: snap.x, y: snap.y }, { history: false });
      }
      setGuides(snap.guides);
      // legenda gerada e destravada: mexer numa mexe TODAS (posição global)
      if (clip.kind === "text" && clip.isCaption && !clip.posLock) {
        useSettings.getState().set({ captionPos: { x: snap.x, y: snap.y } });
      }
      engine.markDirty();
    };

    const onMove = (ev: PointerEvent) => {
      if (!cv || !clip || !(clip.kind === "text" || clip.kind === "video" || clip.kind === "image")) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return; // clique parado
      if (!moved) {
        // arrastar DIRETO sobre o elemento também vale editar
        if (pickedHere) setEditMode(true);
        moved = true;
        setDragging(true);
        useProject.getState().pushHistory();
      }
      if (!editMode && !pickedHere && clip.kind !== "text") return; // arrasto no vazio não mexe em nada
      const b = cv.getBoundingClientRect();
      latest = {
        px: ((ev.clientX - b.left) / Math.max(1, b.width)) * project.width,
        py: ((ev.clientY - b.top) / Math.max(1, b.height)) * project.height,
      };
      if (!raf) raf = requestAnimationFrame(applyMove); // 1× por quadro
    };
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setGuides(NO_GUIDES);
      if (!moved) {
        if (pickedHere) setEditMode(true); // quer mexer: alças aparecem
        else if (editMode) setEditMode(false); // clique fora do clipe: sai do modo (sem dar play)
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

  // clique em qualquer lugar FORA da prévia → desliga o modo de mexer
  // (o clipe fica onde estava). O botão do ímã não conta (é configuração).
  useEffect(() => {
    if (!editMode) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-gc-keepedit]")) return;
      if (containerRef.current?.contains(e.target as Node)) return;
      setEditMode(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [editMode]);

  const H = 11; // tamanho da alça (px)
  const handleCls =
    "pointer-events-auto absolute z-10 flex items-center justify-center rounded-full border-2 border-[#080b11] bg-[var(--gc-accent)] shadow-[0_0_8px_var(--gc-accent-50)] transition hover:scale-110";

  const guideCls = "pointer-events-none absolute z-[5] bg-[var(--gc-accent)] shadow-[0_0_8px_var(--gc-accent-50)]";

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
          {/* guias magnéticas (linhas de centralização) — acendem quando o
              clipe encosta no centro/borda durante o arraste */}
          {guides.v && (
            <div
              className={`${guideCls} top-0 bottom-0 w-px`}
              style={{
                left: guides.v === "center" ? "50%" : guides.v === "left" ? 1 : undefined,
                right: guides.v === "right" ? 1 : undefined,
              }}
            />
          )}
          {guides.h && (
            <div
              className={`${guideCls} left-0 right-0 h-px`}
              style={{
                top: guides.h === "center" ? "50%" : guides.h === "top" ? 1 : undefined,
                bottom: guides.h === "bottom" ? 1 : undefined,
              }}
            />
          )}
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
        {/* ímã: ligado, o clipe gruda no centro e nas bordas perto delas;
            desligado, movimento 100% livre. Fica salvo nas configurações. */}
        {(draggable || editMode) && (
          <button
            type="button"
            data-gc-keepedit
            onClick={() => useSettings.getState().set({ magnetMove: !magnet })}
            title={magnet ? t("pv.magnetOn") : t("pv.magnetOff")}
            aria-pressed={magnet}
            className={`ml-1 flex h-7 items-center gap-1 rounded-md border px-1.5 text-[10px] font-medium transition ${
              magnet
                ? "border[var(--gc-accent-40)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]"
                : "border-[#2a3546] bg-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Magnet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("pv.magnet")}</span>
          </button>
        )}
        {/* Controles rápidos de Keyframe (Losango ◆ estilo CapCut) */}
        {selected && selected.kind !== "audio" && (
          <div className="ml-1 flex items-center gap-0.5 rounded-md border border-[#2a3546] bg-[#121722] p-0.5" data-gc-keepedit>
            <button
              type="button"
              onClick={() => prevKf && jumpToKf(prevKf.time)}
              disabled={!prevKf}
              className="flex h-6 w-5 items-center justify-center text-zinc-400 hover:text-amber-300 disabled:opacity-25 transition"
              title="Losango anterior (◀◆)"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={toggleKeyframeAtPlayhead}
              className={`flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium transition ${
                currentKf
                  ? "bg-amber-500 text-black shadow-[0_0_6px_rgba(245,158,11,0.5)] font-bold"
                  : "text-zinc-400 hover:text-amber-300 hover:bg-amber-500/10"
              }`}
              title={currentKf ? "Remover Losango ◆ neste ponto" : "Marcar Losango ◆ de animação aqui"}
            >
              <Diamond className={`h-3 w-3 ${currentKf ? "fill-current" : ""}`} />
              <span className="hidden sm:inline">{currentKf ? "◆ Ativo" : "+ ◆"}</span>
            </button>
            <button
              type="button"
              onClick={() => nextKf && jumpToKf(nextKf.time)}
              disabled={!nextKf}
              className="flex h-6 w-5 items-center justify-center text-zinc-400 hover:text-amber-300 disabled:opacity-25 transition"
              title="Próximo losango (◆▶)"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
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
