// GalaxyCut — diálogo de legendas automáticas (Whisper no navegador)
// v7.1: painel reformulado — tudo em coluna (nada de arrastar pro lado pra
// ver o resto), idioma num MENU (com detecção automática + mais idiomas).
"use client";

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useProject } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { transcribe, SubSegment, useSubtitleJob, WhisperProgress, cancelTranscription, WhisperModelId } from "@/lib/editor/subtitles";
import { CAPTION_PRESETS, CaptionPreset, makeClip, defaultTextProps } from "@/lib/editor/types";
import { isDesktopBuild, desktop } from "@/lib/editor/desktop";
import { useT } from "@/lib/editor/i18n";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle2, TriangleAlert, Cpu, Palette, Layers, Minus, Download, XCircle } from "lucide-react";

// idiomas que o Whisper entende — dentro de um menu agora (dá pra listar mais)
const LANGS = [
  { v: "auto", label: "🌐 " },
  { v: "pt", label: "Português" },
  { v: "en", label: "English" },
  { v: "es", label: "Español" },
  { v: "fr", label: "Français" },
  { v: "de", label: "Deutsch" },
  { v: "it", label: "Italiano" },
  { v: "ja", label: "日本語" },
  { v: "ko", label: "한국어" },
  { v: "ru", label: "Русский" },
  { v: "id", label: "Indonesia" },
  { v: "hi", label: "हिन्दी" },
  { v: "tr", label: "Türkçe" },
  { v: "zh", label: "中文" },
  { v: "ar", label: "العربية" },
  { v: "pl", label: "Polski" },
  { v: "nl", label: "Nederlands" },
  { v: "vi", label: "Tiếng Việt" },
  { v: "uk", label: "Українська" },
  { v: "cs", label: "Čeština" },
  { v: "el", label: "Ελληνικά" },
  { v: "he", label: "עברית" },
  { v: "th", label: "ไทย" },
  { v: "sv", label: "Svenska" },
];

export function SubtitleDialog() {
  const clips = useProject((s) => s.clips);
  const selectedId = useProject((s) => s.selectedId);
  const model = useSettings((s) => s.whisperModel);
  const presetId = useSettings((s) => s.captionPreset);
  const maxWords = useSettings((s) => s.captionMaxWords);
  const setSettings = useSettings((s) => s.set);
  const job = useSubtitleJob();
  const [lang, setLang] = useState("pt");
  const t = useT();

  const preset: CaptionPreset = useMemo(
    () => CAPTION_PRESETS.find((p) => p.id === presetId) ?? CAPTION_PRESETS[0],
    [presetId]
  );

  // fonte: clipe selecionado (vídeo/áudio) ou o primeiro clipe com áudio
  const source = useMemo(() => {
    const sel = clips.find((c) => c.id === selectedId);
    if (sel && (sel.kind === "video" || sel.kind === "audio") && sel.mediaId) return sel;
    return clips.find((c) => (c.kind === "video" || c.kind === "audio") && c.mediaId);
  }, [clips, selectedId]);

  const modelLabel = (id: WhisperModelId) =>
    id === "tiny" ? t("sub.modelFast") : id === "base" ? t("sub.modelBalanced") : t("sub.modelAccurate");
  const modelHint = (id: WhisperModelId) =>
    id === "tiny" ? t("sub.modelFastHint") : id === "base" ? t("sub.modelBalancedHint") : t("sub.modelAccurateHint");

  async function generate() {
    if (!source?.mediaId) return;
    // no navegador a IA local trava a aba — a função fica só no app baixado
    if (!isDesktopBuild()) {
      toast.info(t("sub.webToast"), { description: t("sub.webToastDesc") });
      return;
    }
    job.start();
    try {
      const segs = await transcribe(source.mediaId!, lang, (p: WhisperProgress) => useSubtitleJob.getState().setProg(p), model, maxWords);
      if (!segs.length) {
        toast.info(t("sub.noSpeech"));
      } else {
        applySegments(segs);
        toast.success(t("sub.created", { n: segs.length }), { description: t("sub.createdDesc") });
        job.setOpen(false);
      }
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg.includes("cancel")) toast.info(t("sub.cancelled"));
      else toast.error(t("sub.fail"), { description: msg });
    } finally {
      job.finish();
    }
  }

  function applySegments(segs: SubSegment[]) {
    const st = useProject.getState();
    const textTrack = st.tracks.find((t) => t.kind === "text");
    if (!textTrack) return;
    const speed = source?.speed ?? 1;
    const offset = source?.start ?? 0;
    const base = defaultTextProps();
    const style = { ...base, ...preset.props };
    const pos = useSettings.getState().captionPos ?? { x: 0, y: 0.62 };
    const newClips = segs.map((s) =>
      makeClip({
        kind: "text",
        trackId: textTrack.id,
        start: offset + s.start * speed,
        duration: Math.max(0.5, (s.end - s.start) * speed),
        inPoint: 0,
        outPoint: Math.max(0.5, (s.end - s.start) * speed),
        x: pos.x,
        y: pos.y, // posição global das legendas (mover uma move todas)
        posLock: false,
        isCaption: true, // é legenda → segue a posição global
        text: {
          ...style,
          content: s.text,
          words: s.words, // tempos por palavra → karaokê
        },
      })
    );
    st.pushHistory();
    useProject.setState({ clips: [...st.clips, ...newClips] });
  }

  const pct = Math.round(job.pct * 100);
  const stageLabel =
    job.stage === "download"
      ? t("sub.stageDownload")
      : job.stage === "prepare"
        ? t("sub.stagePrepare")
        : t("sub.stageTranscribe");
  const onWeb = !isDesktopBuild();

  return (
    <Dialog
      open={job.open}
      onOpenChange={(v) => {
        // fechar durante a geração = MINIMIZAR (a IA continua em 2º plano)
        if (!v && job.running) job.setMinimized(true);
        job.setOpen(v);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Sparkles className="h-4 w-4 text-[var(--gc-accent)]" /> {t("sub.title")}
            <button
              type="button"
              onClick={() => {
                if (job.running) job.setMinimized(true);
                job.setOpen(false);
              }}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md border border-[#2a3546] text-zinc-400 transition hover:border[var(--gc-accent-50)] hover:text-[var(--gc-accent)]"
              title={t("sub.minimizeHint")}
              aria-label={t("sub.minimize")}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </DialogTitle>
          <DialogDescription className="text-zinc-500">{t("sub.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* origem + idioma — compactos, tudo empilhado (sem rolar pro lado) */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-2.5">
            <span className="shrink-0 text-xs text-zinc-400">{t("sub.source")}</span>
            <span className="min-w-0 truncate text-xs font-medium text-zinc-200" title={source ? undefined : t("sub.noClip")}>
              {source ? t("sub.sourceVal", { kind: source.kind === "video" ? t("mp.video") : t("mp.audio"), s: Math.round(source.duration) }) : t("sub.noClip")}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-2.5">
            <span className="shrink-0 text-xs text-zinc-400">{t("sub.language")}</span>
            <Select value={lang} onValueChange={setLang} disabled={job.running}>
              <SelectTrigger className="h-8 w-44 shrink-0 border-[#2a3546] bg-[#121722] text-xs text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 border-[#232d3d] bg-[#121722] text-zinc-200">
                {LANGS.map((l) => (
                  <SelectItem key={l.v} value={l.v} className="text-xs">
                    {l.v === "auto" ? t("sub.autoDetect") : l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* qualidade da detecção */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
              <Cpu className="h-3.5 w-3.5" /> {t("sub.accuracy")}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["tiny", "base", "small"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={job.running}
                  onClick={() => setSettings({ whisperModel: id })}
                  className={`rounded-md border px-2 py-1.5 text-center transition ${
                    model === id
                      ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]"
                      : "border-[#2a3546] hover:border-[#3a4759]"
                  }`}
                >
                  <span className={`block text-[11px] font-semibold ${model === id ? "text-[var(--gc-accent)]" : "text-zinc-300"}`}>{modelLabel(id)}</span>
                  <span className="block text-[9px] leading-tight text-zinc-500">{modelHint(id)}</span>
                </button>
              ))}
            </div>
            {model === "small" && (
              <p className="mt-1 text-[10px] text-amber-400/80">{t("sub.modelAccurateWarn")}</p>
            )}
          </div>

          {/* estilo da legenda */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
              <Palette className="h-3.5 w-3.5" /> {t("sub.style")}
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {CAPTION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={job.running}
                  onClick={() => setSettings({ captionPreset: p.id })}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition ${
                    presetId === p.id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
                  }`}
                  title={p.name}
                >
                  <span
                    className="text-[13px] leading-none"
                    style={{
                      fontFamily: p.props.font,
                      color: p.props.highlight ? p.props.highlightColor : p.props.color,
                      WebkitTextStroke: (p.props.strokeW ?? 0) > 0 ? `1px ${p.props.strokeColor}` : undefined,
                      textShadow: p.props.shadow ? "0 1px 3px rgba(0,0,0,.8)" : undefined,
                    }}
                  >
                    AaBb
                  </span>
                  <span className={`w-full truncate text-center text-[8.5px] ${presetId === p.id ? "text-[var(--gc-accent)]" : "text-zinc-500"}`}>
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* palavras por caixa (anti-inundação) */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
              <Layers className="h-3.5 w-3.5" /> {t("sub.words")}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={job.running}
                  onClick={() => setSettings({ captionMaxWords: n })}
                  className={`rounded-md border px-2 py-1.5 text-center transition ${
                    maxWords === n ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
                  }`}
                >
                  <span className={`block text-[11px] font-semibold ${maxWords === n ? "text-[var(--gc-accent)]" : "text-zinc-300"}`}>{n}</span>
                  <span className="block text-[9px] text-zinc-500">{n === 2 ? t("sub.wordsHint2") : n === 3 ? t("sub.wordsHint3") : t("sub.wordsHint4")}</span>
                </button>
              ))}
            </div>
          </div>

          {!source && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("sub.noClipHint")}
            </p>
          )}

          {/* no navegador: as legendas automáticas ficam só no app baixado */}
          {onWeb && (
            <div className="space-y-2 rounded-lg border border[var(--gc-accent-40)] bg[var(--gc-accent-7)] p-3">
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--gc-accent-text)]">
                <Download className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("sub.webOnly")}</span>
              </p>
              <Button
                onClick={() => {
                  const url = "https://github.com/lucasgabrieldevgg/galaxycut/releases/latest";
                  if (desktop) desktop.openExternal(url);
                  else window.open(url, "_blank", "noreferrer");
                }}
                className="w-full gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
              >
                <Download className="h-4 w-4" /> {t("sub.webCta")}
              </Button>
              <p className="text-[10px] text-zinc-500">{t("sub.webNote")}</p>
            </div>
          )}

          {job.running && (
            <div className="space-y-2 rounded-lg border border[var(--gc-accent-30)] bg[var(--gc-accent-5)] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gc-accent)]" /> {stageLabel}
                  {job.stage === "transcribe" && job.windows ? ` (${job.window ?? 1}/${job.windows})` : ""}
                </span>
                <span className="font-mono text-[var(--gc-accent)]">{pct}%</span>
              </div>
              <Progress value={pct} className="h-1.5 bg-[#0a0d14]" />
              <p className="text-[10px] text-zinc-500">
                {t("sub.runningNote", { model: modelLabel(model), hint: modelHint(model) })}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (job.running) job.setMinimized(true);
              job.setOpen(false);
            }}
            className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]"
          >
            {job.running ? t("sub.minimize") : t("sub.cancel")}
          </Button>
          {job.running ? (
            <Button
              variant="outline"
              onClick={() => {
                cancelTranscription(); // mata o worker na hora
              }}
              className="gap-1.5 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4" /> {t("sub.cancelTranscribe")}
            </Button>
          ) : (
            <Button
              onClick={() => void generate()}
              disabled={!source || onWeb}
              title={onWeb ? t("misc.desktopOnly") : undefined}
              className="gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
            >
              <CheckCircle2 className="h-4 w-4" />
              {t("sub.generate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
