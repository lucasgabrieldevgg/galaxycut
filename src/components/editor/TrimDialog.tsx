// GalaxyCut — diálogo de CORTE/SELEÇÃO DE TRECHOS (v9.4, reformulação completa).
// Modal CENTRALIZADO e grande (não mais a barrinha lateral): prévia do vídeo
// em cima, forma de onda do clipe inteiro embaixo (estilo timeline), extremidades
// arrastáveis por subparte, medidor de dB ao vivo, reprodução SEQUENCIAL das
// subpartes (pula os intervalos descartados) e integração com a timeline.
//
// Não destrutivo: o arquivo original nunca é alterado — as subpartes viram
// in/out points de clipes, e a última seleção fica salva na mídia.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Scissors, Play, Pause, Plus, X, Loader2 } from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { registry } from "@/lib/editor/media";
import { decodeAudioOf, peaksFromBuffer } from "@/lib/editor/wav";
import { DbMeter } from "./DbMeter";
import { useT } from "@/lib/editor/i18n";
import { toast } from "sonner";

/** localStorage: dispensa a abertura automática ao importar (a opção
 *  "Não mostrar novamente" da janela de importação — o ✂ continua no card) */
const TRIM_DONT_SHOW_KEY = "galaxycut_trim_dontshow_v1";
export function trimAutoDismissed(): boolean {
  try {
    return localStorage.getItem(TRIM_DONT_SHOW_KEY) === "1";
  } catch {
    return false;
  }
}

interface Part {
  inPt: number;
  outPt: number;
}

interface TrimEvent extends Event {
  detail?: { mediaId?: string; clipId?: string; fromImport?: boolean };
}

export function openTrimDialog(detail: { mediaId?: string; clipId?: string; fromImport?: boolean }) {
  window.dispatchEvent(new CustomEvent("galaxycut:opentrim", { detail }));
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
}

export function TrimDialog() {
  const [open, setOpen] = useState(false);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [anchorClipId, setAnchorClipId] = useState<string | null>(null);
  const [fromImport, setFromImport] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as TrimEvent).detail ?? {};
      if (d.mediaId) setMediaId(d.mediaId);
      else if (d.clipId) {
        const c = useProject.getState().clips.find((x) => x.id === d.clipId);
        if (c?.mediaId) setMediaId(c.mediaId);
      }
      setAnchorClipId(d.clipId ?? null);
      setFromImport(Boolean(d.fromImport));
      if (d.mediaId || d.clipId) setOpen(true);
    };
    window.addEventListener("galaxycut:opentrim", onOpen);
    return () => window.removeEventListener("galaxycut:opentrim", onOpen);
  }, []);

  if (!open || !mediaId) return null;
  return (
    <TrimDialogInner
      key={mediaId + (anchorClipId ?? "")}
      mediaId={mediaId}
      anchorClipId={anchorClipId}
      fromImport={fromImport}
      onOpenChange={setOpen}
    />
  );
}

function TrimDialogInner({
  mediaId,
  anchorClipId,
  fromImport,
  onOpenChange,
}: {
  mediaId: string;
  anchorClipId: string | null;
  fromImport: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useT();
  const media = useProject((s) => s.media.find((m) => m.id === mediaId));

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [dur, setDur] = useState(media?.duration ?? 0);
  const [parts, setParts] = useState<Part[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [headT, setHeadT] = useState(0); // posição (tempo da FONTE)
  const [playing, setPlaying] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [peaks, setPeaks] = useState<number[]>(media?.peaks ?? []);
  const [computing, setComputing] = useState(false);
  const [dontShow, setDontShow] = useState(trimAutoDismissed());
  const [applying, setApplying] = useState(false);
  const [drag, setDrag] = useState<{ kind: "in" | "out" | "move" | "head"; idx: number; startX: number; orig: Part | number } | null>(null);

  const url = useMemo(() => registry.getUrl(mediaId), [mediaId]);
  const sorted = useMemo(() => [...parts].sort((a, b) => a.inPt - b.inPt), [parts]);
  const activePart = parts[activeIdx] ?? null;
  const totalSel = sorted.reduce((acc, p) => acc + (p.outPt - p.inPt), 0);

  // ---------- inicialização: partes salvas / âncora do clipe / inteiro ----------
  useEffect(() => {
    const m = useProject.getState().media.find((x) => x.id === mediaId);
    const d = m?.duration ?? 0;
    setDur(d);
    if (m?.parts?.length) {
      setParts(m.parts.map((p) => ({ inPt: p.inPoint, outPt: p.outPoint })));
    } else if (anchorClipId) {
      const c = useProject.getState().clips.find((x) => x.id === anchorClipId);
      if (c && (c.outPoint || c.duration) && c.kind !== "text" && c.kind !== "image") {
        setParts([{ inPt: c.inPoint || 0, outPt: Math.max(c.inPoint + 0.2, c.outPoint || d) }]);
      } else if (d > 0) {
        setParts([{ inPt: 0, outPt: d }]);
      }
    } else if (d > 0) {
      setParts([{ inPt: 0, outPt: d }]);
    }
  }, [mediaId, anchorClipId]);

  // ---------- peaks: usa os da mídia; senão decodifica uma vez ----------
  useEffect(() => {
    if (media?.peaks?.length) {
      setPeaks(media.peaks);
      return;
    }
    const blob = registry.getBlob(mediaId);
    if (!blob) return;
    let cancelled = false;
    setComputing(true);
    decodeAudioOf(blob, Math.max(1, media?.duration ?? 5))
      .then((buf) => {
        if (cancelled) return;
        const p = peaksFromBuffer(buf, 900);
        setPeaks(p);
        useProject.getState().updateMedia(mediaId, { peaks: p });
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setComputing(false));
    return () => {
      cancelled = true;
    };
  }, [mediaId, media?.peaks, media?.duration]);

  // ---------- medidor dB ao vivo (AnalyserNode na prévia) ----------
  useEffect(() => {
    if (!open) return;
    const el = videoRef.current;
    if (!el) return;
    try {
      const AC: typeof AudioContext = window.AudioContext;
      const ctx = new AC();
      const src = ctx.createMediaElementSource(el);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      an.connect(ctx.destination);
      audioCtxRef.current = ctx;
      srcNodeRef.current = src;
      analyserRef.current = an;
      setAnalyser(an);
    } catch {
      setAnalyser(null); // sem medidor (o áudio continua pelo elemento)
    }
    return () => {
      try {
        srcNodeRef.current?.disconnect();
        analyserRef.current?.disconnect();
        void audioCtxRef.current?.close();
      } catch {
        /* noop */
      }
      audioCtxRef.current = null;
      srcNodeRef.current = null;
      analyserRef.current = null;
      setAnalyser(null);
    };
  }, [open]);

  // ---------- desenho da forma de onda (fundo ciano/teal, estilo timeline) ----------
  useEffect(() => {
    const cv = waveRef.current;
    if (!cv) return;
    const render = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // fundo escuro
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, w, h);
      if (!peaks.length || dur <= 0) {
        ctx.fillStyle = "rgba(148,163,184,0.35)";
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillText(computing ? "…" : "", 6, h / 2);
        return;
      }
      const mid = h / 2;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(34,211,238,0.85)");
      grad.addColorStop(0.5, "rgba(34,211,238,0.55)");
      grad.addColorStop(1, "rgba(34,211,238,0.85)");
      ctx.fillStyle = grad;
      for (let x = 0; x < w; x += 2) {
        const tpos = (x / w) * dur;
        const idx = Math.min(peaks.length - 1, Math.max(0, Math.floor((tpos / dur) * peaks.length)));
        const amp = Math.max(1, peaks[idx] * (h / 2 - 3));
        ctx.fillRect(x, mid - amp, 1.4, amp * 2);
      }
      // linha central
      ctx.fillStyle = "rgba(34,211,238,0.25)";
      ctx.fillRect(0, mid - 0.5, w, 1);
    };
    render();
    const ro = new ResizeObserver(render);
    if (stripRef.current) ro.observe(stripRef.current);
    return () => ro.disconnect();
  }, [peaks, dur, computing, open]);

  // ---------- reprodução sequencial das subpartes ----------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      const el = videoRef.current;
      if (el && !el.paused) {
        const cur = el.currentTime;
        setHeadT(cur);
        // regra de ouro: ao passar do fim da parte ativa, pula pra PRÓXIMA
        // subparte (ou para no fim da última — nunca toca o intervalo descartado)
        const sortedIdx = sorted.findIndex((p) => cur >= p.inPt - 0.001 && cur <= p.outPt + 0.35);
        if (sortedIdx >= 0) {
          const p = sorted[sortedIdx];
          if (cur >= p.outPt - 0.02) {
            const next = sorted[sortedIdx + 1];
            if (next) {
              setActiveIdx(parts.indexOf(next));
              el.currentTime = next.inPt;
            } else if (sorted.length === 1) {
              el.currentTime = p.inPt; // parte única: repete o trecho
            } else {
              el.pause();
              setPlaying(false);
              setHeadT(p.outPt);
            }
          }
        } else if (cur >= dur - 0.05) {
          el.pause();
          setPlaying(false);
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, sorted, parts, dur]);

  // ---------- controles ----------
  const seekTo = useCallback((time: number) => {
    const el = videoRef.current;
    const clamped = Math.max(0, Math.min(dur || 0, time));
    setHeadT(clamped);
    if (el) {
      try {
        el.currentTime = clamped;
      } catch {
        /* noop */
      }
    }
  }, [dur]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    // play começa sempre DENTRO de uma subparte
    let startAt = headT;
    const inside = sorted.find((p) => headT >= p.inPt && headT < p.outPt - 0.05);
    if (!inside && sorted.length) startAt = sorted[0].inPt;
    if (Math.abs(startAt - headT) > 0.01) seekTo(startAt);
    if (inside) setActiveIdx(parts.indexOf(inside));
    void audioCtxRef.current?.resume();
    el.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  };

  // ---------- arrasto das extremidades / mover / playhead ----------
  const timeAtClientX = (clientX: number): number => {
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const frac = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(dur, frac * dur));
  };

  /** limites impostos pelas OUTRAS subpartes (sem sobreposição: cada trecho toca 1×) */
  const neighborBounds = (all: Part[], idx: number): { prevOut: number; nextIn: number } => {
    const me = all[idx];
    let prevOut = 0;
    let nextIn = dur;
    for (const p of all) {
      if (p === me) continue;
      if (p.outPt <= me.inPt + 0.001) prevOut = Math.max(prevOut, p.outPt);
      if (p.inPt >= me.outPt - 0.001) nextIn = Math.min(nextIn, p.inPt);
    }
    return { prevOut, nextIn };
  };

  const onHandleDown = (e: React.PointerEvent, kind: "in" | "out" | "move" | "head", idx: number) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveIdx(idx);
    setDrag({ kind, idx, startX: e.clientX, orig: kind === "head" ? headT : { ...parts[idx] } });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const time = timeAtClientX(e.clientX);
      if (drag.kind === "head") {
        seekTo(time);
        return;
      }
      setParts((prev) => {
        const next = [...prev];
        const p = { ...next[drag.idx] };
        const { prevOut, nextIn } = neighborBounds(next, drag.idx);
        const minLen = 0.2;
        if (drag.kind === "in") {
          p.inPt = Math.max(prevOut, Math.min(p.outPt - minLen, Math.max(0, time)));
        } else if (drag.kind === "out") {
          p.outPt = Math.min(nextIn, Math.max(p.inPt + minLen, Math.min(dur, time)));
        } else if (drag.kind === "move") {
          const orig = drag.orig as Part;
          const len = orig.outPt - orig.inPt;
          let newIn = orig.inPt + (time - (orig.inPt + len / 2));
          newIn = Math.max(prevOut, Math.min(Math.max(prevOut, nextIn - len), newIn));
          newIn = Math.max(0, Math.min(dur - len, newIn));
          p.inPt = newIn;
          p.outPt = newIn + len;
        }
        next[drag.idx] = p;
        return next;
      });
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, dur]);

  // ---------- gerenciamento de subpartes ----------
  const addPart = () => {
    // acha o maior buraco livre entre as partes (≥1s); senão, desabilitado
    const gaps: Part[] = [];
    let cursor = 0;
    for (const p of sorted) {
      if (p.inPt - cursor >= 1) gaps.push({ inPt: cursor, outPt: p.inPt });
      cursor = Math.max(cursor, p.outPt);
    }
    if (dur - cursor >= 1) gaps.push({ inPt: cursor, outPt: dur });
    gaps.sort((a, b) => b.outPt - b.inPt - (a.outPt - a.inPt));
    const gap = gaps[0];
    if (!gap) {
      toast.info(t("trim.noGap"));
      return;
    }
    const len = Math.min(5, (gap.outPt - gap.inPt) * 0.8);
    const np: Part = { inPt: gap.inPt, outPt: gap.inPt + len };
    setParts((prev) => {
      const next = [...prev, np];
      setActiveIdx(next.length - 1);
      return next;
    });
    seekTo(np.inPt);
  };

  const removePart = (idx: number) => {
    setParts((prev) => {
      if (prev.length <= 1) return prev; // sempre fica pelo menos 1
      const next = prev.filter((_, i) => i !== idx);
      setActiveIdx(0);
      return next;
    });
  };

  // ---------- aplicar na timeline ----------
  const apply = () => {
    const usable = sorted.filter((p) => p.outPt - p.inPt >= 0.2);
    if (!usable.length) {
      toast.warning(t("trim.tooShort"));
      return;
    }
    setApplying(true);
    try {
      const st = useProject.getState();
      // lembra a seleção na mídia (reabrir = voltar de onde parou)
      st.updateMedia(mediaId, { parts: usable.map((p) => ({ inPoint: p.inPt, outPoint: p.outPt })) });
      const anchor = anchorClipId ? st.clips.find((c) => c.id === anchorClipId) : null;
      if (anchor && anchor.mediaId === mediaId) {
        // 1ª parte ajusta o PRÓPRIO clipe da timeline (não destrutivo: só in/out)
        const sp = anchor.speed || 1;
        st.updateClip(anchor.id, {
          inPoint: usable[0].inPt,
          outPoint: usable[0].outPt,
          duration: (usable[0].outPt - usable[0].inPt) / sp,
        });
        // partes extra viram clipes novos logo depois
        for (const p of usable.slice(1)) st.addClipFromMedia(mediaId, { inPoint: p.inPt, outPoint: p.outPt });
        toast.success(usable.length > 1 ? t("trim.updatedMany", { n: usable.length }) : t("trim.updated"));
      } else {
        let n = 0;
        for (const p of usable) {
          st.addClipFromMedia(mediaId, { inPoint: p.inPt, outPoint: p.outPt });
          n++;
        }
        toast.success(n > 1 ? t("trim.addedMany", { n }) : t("trim.added"));
      }
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  };

  const closeDialog = () => {
    const el = videoRef.current;
    if (el) el.pause();
    setPlaying(false);
    if (fromImport && dontShow) {
      try {
        localStorage.setItem(TRIM_DONT_SHOW_KEY, "1");
      } catch {
        /* noop */
      }
    }
    onOpenChange(false);
  };

  const pct = (v: number) => (dur > 0 ? `${(v / dur) * 100}%` : "0%");

  return (
    <Dialog open onOpenChange={(v) => !v && closeDialog()}>
      <DialogContent className="flex max-h-[92vh] w-[min(980px,94vw)] max-w-[min(980px,94vw)] flex-col overflow-hidden border-[#232d3d] bg-[#0c1017] text-zinc-200">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scissors className="h-4 w-4 text-[var(--gc-accent)]" /> {t("trim.title")}
            <span className="truncate text-xs font-normal text-zinc-500">— {media?.name}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">{t("trim.desc")}</DialogDescription>
        </DialogHeader>

        {/* ===== PRÉVIA (parte superior) + medidor dB ===== */}
        <div className="flex min-h-[220px] items-stretch gap-3">
          <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-[#1c2430] bg-black">
            <video
              ref={videoRef}
              src={url ?? undefined}
              className="max-h-[42vh] w-auto max-w-full"
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (isFinite(v.duration) && v.duration > 0 && Math.abs(v.duration - dur) > 0.05) setDur(v.duration);
                // partes iniciais (uma vez, quando a duração real chega)
                setParts((prev) => (prev.length ? prev : [{ inPt: 0, outPt: v.duration }]));
              }}
              onTimeUpdate={(e) => !playing && setHeadT(e.currentTarget.currentTime)}
              onError={() => toast.error(t("trim.videoError"))}
            />
          </div>
          {/* medidor de nível — o MESMO componente da barra do editor */}
          <div className="flex w-40 shrink-0 flex-col justify-center gap-1 rounded-lg border border-[#1c2430] bg-[#10151d] p-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{t("pv.sound")}</p>
            <DbMeter mode="live" analyser={analyser} className="w-full" label={t("pv.sound")} />
            <p className="text-[8px] leading-tight text-zinc-600">{t("trim.meterHint")}</p>
          </div>
        </div>

        {/* ===== controles de reprodução ===== */}
        <div className="flex shrink-0 items-center gap-3 pt-1">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--gc-accent)] text-black transition hover:brightness-110"
            title={playing ? t("trim.pause") : t("trim.play")}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-zinc-300">
            {fmtTime(headT)} <span className="text-zinc-600">/ {fmtTime(dur)}</span>
          </span>
          {activePart && sorted.includes(activePart) && (
            <span className="rounded-md border border-[#232d3d] bg-[#10151d] px-2 py-0.5 font-mono text-[10px] tabular-nums text-zinc-400">
              {t("trim.part")} {sorted.indexOf(activePart) + 1}: {fmtTime(activePart.inPt)} → {fmtTime(activePart.outPt)} ({(activePart.outPt - activePart.inPt).toFixed(1)}s)
            </span>
          )}
          <span className="ml-auto text-[10px] text-zinc-500">
            {t("trim.total")}: <b className="text-[var(--gc-accent)]">{totalSel.toFixed(1)}s</b> · {sorted.length} {t("trim.partsWord")}
          </span>
        </div>

        {/* ===== FAIXA DO CLIPE: forma de onda + subpartes + playhead ===== */}
        <div className="shrink-0 space-y-1.5 pt-1">
          <div
            ref={stripRef}
            className="relative h-24 w-full cursor-pointer select-none overflow-hidden rounded-lg border border-[#1c2430]"
            onPointerDown={(e) => {
              // clique simples na faixa = buscar posição (permitido fora das partes)
              if (e.button !== 0) return;
              seekTo(timeAtClientX(e.clientX));
            }}
          >
            {/* forma de onda (fundo) */}
            <canvas ref={waveRef} className="absolute inset-0 h-full w-full" />

            {/* escurece SÓ os intervalos descartados (as partes ficam com a onda viva) */}
            {(() => {
              const gaps: { left: string; width: string }[] = [];
              let cursor = 0;
              for (const p of sorted) {
                if (p.inPt > cursor) gaps.push({ left: pct(cursor), width: pct(p.inPt - cursor) });
                cursor = Math.max(cursor, p.outPt);
              }
              if (cursor < dur) gaps.push({ left: pct(cursor), width: pct(dur - cursor) });
              return gaps.map((g, i) => (
                <div key={`gap-${i}`} className="pointer-events-none absolute inset-y-0 bg-black/55" style={{ left: g.left, width: g.width }} />
              ));
            })()}

            {/* subpartes (seleção clara com extremidades arrastáveis) */}
            {parts.map((p, idx) => {
              const dimmed = p.outPt - p.inPt < 0.2;
              return (
                <div
                  key={idx}
                  className={`group absolute inset-y-1 cursor-grab ${dimmed ? "outline outline-1 outline-red-400" : ""}`}
                  style={{ left: pct(p.inPt), width: pct(p.outPt - p.inPt) }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    onHandleDown(e, "move", idx);
                  }}
                >
                  {/* corpo da parte */}
                  <div
                    className={`h-full w-full border-y ${
                      idx === activeIdx
                        ? "border-[var(--gc-accent)] bg-[var(--gc-accent)]/20"
                        : "border-cyan-500/50 bg-cyan-500/10"
                    }`}
                  >
                    <span className="pointer-events-none absolute left-1.5 top-0.5 font-mono text-[8px] text-cyan-200/90">
                      {fmtTime(p.inPt)}–{fmtTime(p.outPt)}
                    </span>
                  </div>
                  {/* extremidade INICIAL (arrastável) */}
                  <div
                    onPointerDown={(e) => onHandleDown(e, "in", idx)}
                    className="absolute inset-y-0 left-0 z-10 flex w-3 -translate-x-1/2 cursor-ew-resize items-center justify-center rounded-l bg-[var(--gc-accent)]/90 hover:bg-[var(--gc-accent)]"
                    title={t("trim.dragStart")}
                  >
                    <div className="h-5 w-0.5 rounded bg-black/50" />
                  </div>
                  {/* extremidade FINAL (arrastável) */}
                  <div
                    onPointerDown={(e) => onHandleDown(e, "out", idx)}
                    className="absolute inset-y-0 right-0 z-10 flex w-3 translate-x-1/2 cursor-ew-resize items-center justify-center rounded-r bg-[var(--gc-accent)]/90 hover:bg-[var(--gc-accent)]"
                    title={t("trim.dragEnd")}
                  >
                    <div className="h-5 w-0.5 rounded bg-black/50" />
                  </div>
                </div>
              );
            })}

            {/* indicador de reprodução (arrastável) */}
            <div
              className="absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize"
              style={{ left: pct(headT) }}
              onPointerDown={(e) => onHandleDown(e, "head", 0)}
              title={t("trim.dragHead")}
            >
              <div className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
              <div className="absolute left-1/2 top-0 h-2.5 w-3 -translate-x-1/2 rounded-b-sm bg-white" />
            </div>

            {computing && (
              <div className="absolute bottom-1 right-2 z-20 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-zinc-300">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> {t("trim.wave")}
              </div>
            )}
          </div>

          {/* chips das subpartes */}
          <div className="flex flex-wrap items-center gap-1.5">
            {sorted.map((p, si) => {
              const idx = parts.indexOf(p);
              return (
                <span
                  key={si}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                    parts[activeIdx] === p
                      ? "border-[var(--gc-accent)] bg-[var(--gc-accent-10)] text-[var(--gc-accent)]"
                      : "border-[#2c364c] bg-[#121824] text-zinc-400"
                  }`}
                >
                  <button
                    type="button"
                    className="tabular-nums"
                    onClick={() => {
                      setActiveIdx(idx);
                      seekTo(p.inPt);
                    }}
                  >
                    {t("trim.part")} {si + 1} · {fmtTime(p.inPt)}–{fmtTime(p.outPt)}
                  </button>
                  <button
                    type="button"
                    onClick={() => removePart(idx)}
                    disabled={parts.length <= 1}
                    className="text-zinc-600 transition hover:text-red-400 disabled:opacity-30"
                    title={t("trim.removePart")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={addPart}
              className="flex items-center gap-1 rounded-full border border-dashed border-[#2c364c] px-2 py-0.5 text-[10px] text-zinc-400 transition hover:border-[var(--gc-accent)] hover:text-[var(--gc-accent)]"
            >
              <Plus className="h-3 w-3" /> {t("trim.addPart")}
            </button>
          </div>
        </div>

        {/* ===== rodapé ===== */}
        <div className="mt-auto flex shrink-0 flex-wrap items-center gap-3 border-t border-[#1f2837] pt-3">
          {fromImport && (
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={dontShow}
                onChange={(e) => setDontShow(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--gc-accent)]"
              />
              {t("trim.dontShow")}
            </label>
          )}
          <span className="hidden text-[10px] text-zinc-600 md:block">{t("trim.hint")}</span>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={closeDialog} className="border-[#2c364c] text-xs">
              {t("trim.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={applying || !parts.length}
              className="bg-[var(--gc-accent)] text-xs font-bold text-black hover:bg-[var(--gc-accent-hover)]"
            >
              <Scissors className="mr-1 h-3.5 w-3.5" />
              {anchorClipId ? t("trim.apply") : t("trim.addToTimeline")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
