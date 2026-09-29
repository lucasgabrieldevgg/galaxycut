// GalaxyCut — detector automático de cenas sem áudio (acha onde ninguém fala e oferece excluir)
// v5: analisa o ARQUIVO e aplica em TODOS os clipes que usam ele
// v7.1: depois de aplicar, SÓ os trechos sem som ficam selecionados — Delete
// apaga o silêncio (antes selecionava a faixa inteira, sem noção).
"use client";

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useProject, usePlayback } from "@/lib/editor/store";
import { engine } from "@/lib/editor/playback";
import { registry } from "@/lib/editor/media";
import { fmtTime } from "@/lib/editor/types";
import { detectSilence, SENSITIVITY_PRESETS, SilenceOptions, SilenceSpan } from "@/lib/editor/silence";
import type { SilenceMode } from "@/lib/editor/store";
import { toast } from "sonner";
import { useT } from "@/lib/editor/i18n";
import { AudioLines, Loader2, Play, Scissors, Trash2, EyeOff, TriangleAlert, VolumeX, CheckSquare, Square, Eraser, AudioLines as AudioLinesOff } from "lucide-react";

type Mode = SilenceMode;

export function SilenceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const clips = useProject((s) => s.clips);
  const media = useProject((s) => s.media);
  const selectedId = useProject((s) => s.selectedId);
  const [preset, setPreset] = useState("normal");
  const [minDur, setMinDur] = useState(0.45);
  const [busy, setBusy] = useState(false);
  /** trechos no tempo do ARQUIVO (converto pra cada clipe na hora de aplicar) */
  const [spans, setSpans] = useState<(SilenceSpan & { on: boolean })[] | null>(null);
  const [mode, setMode] = useState<Mode>("delaudio");
  const t = useT();

  // fonte: clipe selecionado (vídeo/áudio) ou o primeiro com áudio
  const source = useMemo(() => {
    const sel = clips.find((c) => c.id === selectedId);
    if (sel && (sel.kind === "video" || sel.kind === "audio") && sel.mediaId) return sel;
    return clips.find((c) => (c.kind === "video" || c.kind === "audio") && c.mediaId);
  }, [clips, selectedId]);

  // TODOS os clipes que usam o mesmo arquivo — o corte vale pra todos eles
  const sameFileClips = useMemo(
    () => (source?.mediaId ? clips.filter((c) => c.mediaId === source.mediaId && (c.kind === "video" || c.kind === "audio")) : []),
    [clips, source]
  );
  const sourceMedia = source?.mediaId ? media.find((m) => m.id === source.mediaId) : undefined;

  const isVideo = source?.kind === "video";
  const checked = spans?.filter((s) => s.on) ?? [];
  const totalSel = checked.reduce((acc, s) => acc + (s.end - s.start), 0);

  async function detect() {
    if (!source?.mediaId) return;
    const blob = registry.getBlob(source.mediaId);
    if (!blob) {
      toast.error(t("sd.mediaMissing"), { description: t("sd.mediaMissingDesc") });
      return;
    }
    setBusy(true);
    setSpans(null);
    try {
      const opts: SilenceOptions = { ...SENSITIVITY_PRESETS.find((p) => p.id === preset)!.opts, minDuration: minDur };
      const raw = await detectSilence(blob, opts);
      if (!raw.length) {
        setSpans([]);
        toast.info(t("sd.noneToast"), { description: t("sd.noneToastDesc") });
      } else {
        setSpans(raw.map((s) => ({ ...s, on: true })));
        toast.success(t("sd.found", { n: raw.length }), { description: t("sd.foundDesc") });
      }
    } catch (e) {
      toast.error(t("sd.analyzeFail"), { description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!source || !checked.length || !spans) return;
    const st = useProject.getState();
    const n = st.applySilenceToMany(
      sameFileClips.map((c) => c.id),
      checked.map(({ start, end }) => ({ start, end })),
      mode
    );
    engine.markDirty();
    // nos modos que DEIXAM trechos na timeline (mutar/esconder), eles já vêm
    // SELECIONADOS — só o silêncio marcado (Delete apaga de uma vez)
    const leavesPieces = mode === "audio" || mode === "scene" || mode === "delaudio";
    toast.success(
      mode === "delaudio"
        ? t("sd.appliedDelaudio", { n: checked.length, m: n })
        : mode === "both"
          ? t("sd.appliedBoth", { n: checked.length, m: n })
          : mode === "audio"
            ? t("sd.appliedMuted", { n: checked.length, m: n })
            : t("sd.appliedHidden", { n: checked.length, m: n }),
      {
        description: leavesPieces
          ? t("sd.selectedOnly")
          : mode === "both"
            ? t("sd.appliedBothDesc")
            : t("sd.appliedSceneDesc"),
      }
    );
    setSpans(null);
    onOpenChange(false);
  }

  const modes: { id: Mode; label: string; hint: string; icon: React.ReactNode }[] = [
    {
      id: "delaudio",
      label: t("sd.modeDelaudio"),
      hint: t("sd.modeDelaudioHint"),
      icon: <AudioLinesOff className="h-3.5 w-3.5 text-red-400" />,
    },
    {
      id: "both",
      label: isVideo ? t("sd.modeBoth") : t("sd.modeBothAudio"),
      hint: t("sd.modeBothHint"),
      icon: <Trash2 className="h-3.5 w-3.5" />,
    },
    {
      id: "audio",
      label: isVideo ? t("sd.modeAudio") : t("sd.modeAudioAudio"),
      hint: isVideo ? t("sd.modeAudioHint") : t("sd.modeAudioHintAudio"),
      icon: <VolumeX className="h-3.5 w-3.5" />,
    },
    ...(isVideo
      ? [{ id: "scene" as Mode, label: t("sd.modeScene"), hint: t("sd.modeSceneHint"), icon: <EyeOff className="h-3.5 w-3.5" /> }]
      : []),
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AudioLines className="h-4 w-4 text-[var(--gc-accent)]" /> {t("sd.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">{t("sd.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-2.5">
            <span className="shrink-0 text-xs text-zinc-400">{t("sd.file")}</span>
            <span className="min-w-0 truncate text-xs font-medium text-zinc-200" title={sourceMedia?.name}>
              {sourceMedia ? sourceMedia.name : t("sd.noClip")}
            </span>
          </div>
          {sameFileClips.length > 1 && (
            <p className="flex items-start gap-2 rounded-lg border border[var(--gc-accent-30)] bg[var(--gc-accent-7)] p-2.5 text-[11px] leading-relaxed text-[var(--gc-accent-text)]">
              <AudioLines className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("sd.multiInfo", { n: sameFileClips.length })}
            </p>
          )}

          {!source && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("sd.noClipHint")}
            </p>
          )}

          {/* sensibilidade */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-300">{t("sd.sensitivity")}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SENSITIVITY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => { setPreset(p.id); setMinDur(p.opts.minDuration); }}
                  className={`rounded-md border px-2 py-1.5 text-center transition ${
                    preset === p.id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
                  }`}
                  title={t(`sd.preset.${p.id}Hint`)}
                >
                  <span className={`block text-[11px] font-semibold ${preset === p.id ? "text-[var(--gc-accent)]" : "text-zinc-300"}`}>{t(`sd.preset.${p.id}`)}</span>
                  <span className="block text-[9px] leading-tight text-zinc-500">{t(`sd.preset.${p.id}Hint`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* duração mínima */}
          <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-zinc-400">{t("sd.minDuration")}</span>
              <span className="font-mono text-[11px] text-[var(--gc-accent)]">{minDur.toFixed(2)}s</span>
            </div>
            <Slider value={[minDur]} min={0.2} max={2} step={0.05} onValueChange={(v) => setMinDur(v[0])} aria-label={t("sd.minDuration")} />
            <p className="mt-1 text-[10px] text-zinc-600">{t("sd.minDurHint")}</p>
          </div>

          <Button
            onClick={() => void detect()}
            disabled={busy || !source}
            className="w-full gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
            {busy ? t("sd.analyzing") : spans === null ? t("sd.detect") : t("sd.detectAgain")}
          </Button>

          {/* resultado */}
          {spans !== null && spans.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-300">{t("sd.found", { n: spans.length })}</p>
                <button
                  type="button"
                  className="text-[10px] text-[var(--gc-accent)] hover:underline"
                  onClick={() => setSpans((ss) => (ss ? ss.map((s) => ({ ...s, on: ss.every((x) => x.on) ? false : true })) : ss))}
                >
                  {spans.every((s) => s.on) ? t("sd.uncheckAll") : t("sd.checkAll")}
                </button>
              </div>
              <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {spans.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSpans((ss) => (ss ? ss.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) : ss))}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                      s.on ? "border[var(--gc-accent-50)] bg[var(--gc-accent-5)]" : "border-[#2a3546] opacity-60"
                    }`}
                  >
                    {s.on ? <CheckSquare className="h-3.5 w-3.5 shrink-0 text-[var(--gc-accent)]" /> : <Square className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                    <span className="font-mono text-[10px] text-zinc-300">
                      {fmtTime(s.start)} → {fmtTime(s.end)}
                    </span>
                    <span className="ml-auto rounded bg-[#1c2430] px-1.5 py-0.5 font-mono text-[9px] text-amber-300">{(s.end - s.start).toFixed(2)}s</span>
                    <span
                      role="button"
                      tabIndex={0}
                      title={t("sd.playHint")}
                      aria-label={t("sd.playHint")}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!source) return;
                        // tempo no arquivo → tempo da timeline (no clipe analisado)
                        const speed = source.speed || 1;
                        const tt = source.start + Math.max(0, (s.start - source.inPoint) / speed) + 0.02;
                        engine.seek(Math.min(tt, usePlayback.getState().duration));
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" && source) engine.seek(source.start + Math.max(0, (s.start - source.inPoint) / (source.speed || 1))); }}
                      className="rounded p-0.5 text-zinc-500 hover:text-[var(--gc-accent)]"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>

              {/* o que fazer com os trechos */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-300">{t("sd.whatToDo")}</p>
                <div className="space-y-1.5">
                  {modes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                        mode === m.id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
                      }`}
                    >
                      <span className={mode === m.id ? "text-[var(--gc-accent)]" : "text-zinc-500"}>{m.icon}</span>
                      <span className="flex-1">
                        <span className={`block text-[11px] font-medium ${mode === m.id ? "text-[var(--gc-accent)]" : "text-zinc-300"}`}>{m.label}</span>
                        <span className="block text-[9px] text-zinc-500">{m.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {mode === "both" && (
                  <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">{t("sd.noteBoth")}</p>
                )}
                {mode === "delaudio" && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
                    <Eraser className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                    {t("sd.noteDelaudio")}
                  </p>
                )}
                {mode === "audio" && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
                    <Eraser className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                    {t("sd.noteAudio")}
                  </p>
                )}
              </div>
            </div>
          )}

          {spans !== null && spans.length === 0 && (
            <p className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-3 text-center text-[11px] text-zinc-500">
              {t("sd.none")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
            {t("sd.cancel")}
          </Button>
          <Button onClick={apply} disabled={busy || !checked.length} className="gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]">
            <Scissors className="h-4 w-4" />
            {t("sd.apply", { n: checked.length, s: totalSel.toFixed(1) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
