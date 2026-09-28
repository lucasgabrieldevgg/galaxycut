// GaláxiaCut — diálogo de exportação (vídeo + GIF + WAV + PNG + SRT)
// v7: padrão 1080p/30fps, com "mais opções" revelando 240p→8K, fps 24–60
// e formatos (MP4, WebM, GIF animado, WAV do áudio e PNG do quadro).
"use client";

import { useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProject, usePlayback } from "@/lib/editor/store";
import {
  buildSrt, canExport, downloadBlob, exportVideo, exportGif, exportWav, exportPng,
  listVideoFormats, outputSize, sanitizeName, suggestBitrate, VideoFormat, ExportProgress,
} from "@/lib/editor/exporter";
import { deliverExport, askExportDestination, isDesktopBuild } from "@/lib/editor/desktop";
import { useT } from "@/lib/editor/i18n";
import { toast } from "sonner";
import { Download, Loader2, CheckCircle2, FileText, MonitorPlay, FolderOpen, Star, ChevronDown, ChevronUp, Image as ImageIcon, Music4, FileVideo, XCircle } from "lucide-react";

/** qualidade = MENOR lado da saída. 1080 é o padrão; o resto aparece em "mais opções". */
const RESOLUTIONS: { id: number; label: string; hintKey: string }[] = [
  { id: 4320, label: "8K", hintKey: "ex.hint4320" },
  { id: 2160, label: "4K", hintKey: "ex.hint2160" },
  { id: 1440, label: "2K", hintKey: "ex.hint1440" },
  { id: 1080, label: "1080p", hintKey: "ex.hint1080" },
  { id: 720, label: "720p", hintKey: "ex.hint720" },
  { id: 480, label: "480p", hintKey: "ex.hint480" },
 { id: 360, label: "360p", hintKey: "ex.hint360" },
  { id: 240, label: "240p", hintKey: "ex.hint240" },
];
const FPS_OPTIONS = [24, 25, 30, 50, 60];

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const project = useProject((s) => s.project);
  const duration = usePlayback((s) => s.duration);
  const clips = useProject((s) => s.clips);
  const [shortSide, setShortSide] = useState(1080);
  const [fps, setFps] = useState(30);
  const [quality, setQuality] = useState<"alta" | "media" | "baixa">("alta");
  const [format, setFormat] = useState<VideoFormat>("mp4");
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progInfo, setProgInfo] = useState<{ frame?: number; frames?: number; etaSec?: number; speed?: number }>({});
  const [result, setResult] = useState<{ blob: Blob; name: string; path?: string | null } | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const videoFormats = useMemo(() => listVideoFormats(), []);
  const supported = canExport();

  const isVideo = format === "mp4" || format === "webm9" || format === "webm8";
  const { W, H } = outputSize(project, shortSide);

  const bitrate = useMemo(() => {
    const base = suggestBitrate(shortSide, project.width / project.height);
    return quality === "alta" ? base : quality === "media" ? Math.round(base * 0.65) : Math.round(base * 0.38);
  }, [shortSide, quality, project]);

  function fmtEta(s?: number) {
    if (s == null || !isFinite(s) || s <= 0) return "";
    if (s < 60) return `${Math.max(1, Math.round(s))}s`;
    const m = Math.floor(s / 60);
    return `${m}m${String(Math.round(s % 60)).padStart(2, "0")}s`;
  }

  async function run() {
    if (duration <= 0) {
      toast.error(t("ex.emptyTimeline"));
      return;
    }
    // nomeação própria: nunca briga com outros vídeos da pasta
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
    const resTag = format === "wav" || format === "png" || format === "gif" ? format.toUpperCase() : `${shortSide}p`;
    const ext = format === "mp4" ? "mp4" : format === "webm9" || format === "webm8" ? "webm" : format === "gif" ? "gif" : format === "wav" ? "wav" : "png";
    const name = `GalaxyCut_${ts}_${sanitizeName(project.name)}_${resTag}.${ext}`;

    // no APP: pergunta ANTES onde salvar (cancelar aqui não joga o render fora)
    const dest = await askExportDestination(name);
    if ("canceled" in dest) {
      toast.info(t("ex.pickCanceled"));
      return;
    }

    setBusy(true);
    setProgress(0);
    setProgInfo({});
    setResult(null);
    cancelRef.current = { cancelled: false };
    const onProg: ExportProgress = (v, info) => {
      setProgress(v);
      if (info?.stage === "render") setProgInfo({ frame: info.frame, frames: info.frames, etaSec: info.etaSec, speed: info.speed });
      else setProgInfo({});
    };
    try {
      let out: { blob: Blob; ext: string };
      let stage = "";
      if (format === "gif") {
        out = await exportGif({ shortSide, fps }, (v) => setProgress(v));
        stage = "GIF";
      } else if (format === "wav") {
        out = await exportWav((v) => setProgress(v));
        stage = "WAV";
      } else if (format === "png") {
        out = await exportPng();
        stage = "PNG";
      } else {
        out = await exportVideo({ shortSide, fps, bitrate, format, cancel: cancelRef.current }, onProg);
        stage = out.ext.toUpperCase();
      }
      void stage;
      const path = await deliverExport(out.blob, name, dest.dest === "desktop" ? dest.path || undefined : undefined);
      setResult({ blob: out.blob, name, path });
      toast.success(
        isDesktopBuild()
          ? t("ex.savedAt", { path: String(path) })
          : t("ex.done"),
        {
          description: isDesktopBuild()
            ? t("ex.savedAtDesc")
            : `${stage} · ${W}×${H} · ${isVideo ? `${fps}fps · ` : ""}${quality}`,
        }
      );
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg.includes("cancel")) toast.info(t("ex.cancelled"));
      else toast.error(t("ex.fail"), { description: msg });
    } finally {
      setBusy(false);
    }
  }

  function downloadSrt() {
    const srt = buildSrt(project, clips);
    if (!srt.trim()) {
      toast.info(t("ex.srtEmpty"));
      return;
    }
    downloadBlob(new Blob([srt], { type: "text/plain;charset=utf-8" }), `${sanitizeName(project.name)}.srt`);
    toast.success(t("ex.srtDone"));
  }

  const resBtn = (id: number, label: string, hint: string) => (
    <button
      key={id}
      onClick={() => setShortSide(id)}
      disabled={busy}
      className={`rounded-md border px-2 py-2 text-xs transition ${
        shortSide === id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
      }`}
    >
      <span className="block font-semibold">
        {label} {id === 1080 && <span className="text-[8px] font-normal opacity-70">({t("ex.default")})</span>}
      </span>
      <span className="block text-[9px] opacity-70">{hint}</span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-[var(--gc-accent)]" /> {t("ex.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">{t("ex.desc", { more: t("ex.more") })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* formato */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.format")}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {videoFormats.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  disabled={busy}
                  title={f.hint}
                  className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition ${
                    format === f.id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                  }`}
                >
                  <FileVideo className="h-3.5 w-3.5" /> {f.label}
                </button>
              ))}
              <button
                onClick={() => setFormat("gif")}
                disabled={busy}
                title={t("ex.gifNote")}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition ${
                  format === "gif" ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" /> GIF
              </button>
              <button
                onClick={() => setFormat("wav")}
                disabled={busy}
                title={t("ex.wavNote")}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition ${
                  format === "wav" ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                <Music4 className="h-3.5 w-3.5" /> WAV
              </button>
              <button
                onClick={() => setFormat("png")}
                disabled={busy}
                title={t("ex.pngNote")}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition ${
                  format === "png" ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" /> PNG
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              {format === "gif" ? t("ex.gifNote") : format === "wav" ? t("ex.wavNote") : format === "png" ? t("ex.pngNote") : t("ex.outputSize", { w: W, h: H, orient: project.width >= project.height ? t("ex.horizontal") : project.width === project.height ? t("ex.square") : t("ex.vertical") })}
            </p>
          </div>

          {/* resolução (vídeo/gif) */}
          {format !== "wav" && format !== "png" && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.resolution")}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {showMore
                  ? RESOLUTIONS.map((r) => resBtn(r.id, r.label, t(r.hintKey)))
                  : [720, 1080].map((id) => resBtn(id, id === 1080 ? "1080p" : "720p", t(id === 1080 ? "ex.hint1080" : "ex.hint720b")))}
              </div>
              {/* aviso pedido pelo dono: mais resoluções moram no "Mais opções" */}
              {!showMore && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                  {t("ex.moreResHint", { more: t("ex.more") })}
                </p>
              )}
              {shortSide >= 2160 && (
                <p className="mt-1 text-[10px] text-amber-400/80">
                  {t("ex.hugeWarn", { k: shortSide === 4320 ? "8K" : "4K" })}
                </p>
              )}
            </div>
          )}

          {/* fps */}
          {isVideo && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.fps")}</p>
              <div className={`grid gap-1.5 ${showMore ? "grid-cols-5" : "grid-cols-2"}`}>
                {(showMore ? FPS_OPTIONS : [30, 60]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFps(f)}
                    disabled={busy}
                    className={`rounded-md border px-2 py-1.5 text-xs transition ${
                      fps === f ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                    }`}
                  >
                    {f} fps {f === 30 && <span className="text-[8px] opacity-70">({t("ex.default")})</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* qualidade (bitrate) — só vídeo */}
          {isVideo && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.quality")}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(["baixa", "media", "alta"] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    disabled={busy}
                    className={`rounded-md border px-2 py-1.5 text-xs capitalize transition ${
                      quality === q ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                    }`}
                  >
                    {q === "media" ? t("ex.qmid") : q === "alta" ? t("ex.qhigh") : t("ex.qlow")}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">
                {t("ex.qualityNote", { q: quality === "alta" ? t("ex.qhigh") : quality === "media" ? t("ex.qmid") : t("ex.qlow"), mbps: (bitrate / 1_000_000).toFixed(1) })}
              </p>
            </div>
          )}

          {/* revelar/ocultar as opções extra */}
          {format !== "wav" && format !== "png" && (
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#232d3d] bg-[#0e1320] px-2 py-1.5 text-[11px] text-zinc-400 transition hover:border[var(--gc-accent-40)] hover:text-[var(--gc-accent)]"
            >
              {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showMore ? t("ex.less") : t("ex.more")}
            </button>
          )}

          {busy && (
            <div className="space-y-2 rounded-lg border border[var(--gc-accent-30)] bg[var(--gc-accent-5)] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gc-accent)]" />{" "}
                  {format === "gif" ? t("ex.gifStage") : format === "wav" ? t("ex.wavStage") : t("ex.rendering")}
                </span>
                <span className="font-mono text-[var(--gc-accent)]">{Math.round(progress * 100)}%</span>
              </div>
              <Progress value={progress * 100} className="h-1.5 bg-[#0a0d14]" />
              <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                <span>
                  {isVideo && progInfo.frames
                    ? t("ex.frameOf", { i: progInfo.frame ?? 0, n: progInfo.frames })
                    : format === "gif" || format === "wav"
                      ? t("ex.offlineNote")
                      : t("ex.preparing")}
                </span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                  {progInfo.speed != null && progInfo.speed > 0 && (
                    <span className="text-[var(--gc-accent)]">{progInfo.speed.toFixed(1)}× {t("ex.realtime")}</span>
                  )}
                  {progInfo.etaSec != null && progInfo.etaSec > 1 && <span>~{fmtEta(progInfo.etaSec)}</span>}
                </span>
              </div>
              {isVideo && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full gap-1.5 border-red-500/40 bg-transparent text-[11px] text-red-400 hover:bg-red-500/10"
                  onClick={() => {
                    cancelRef.current.cancelled = true;
                  }}
                >
                  <XCircle className="h-3.5 w-3.5" /> {t("ex.cancelExport")}
                </Button>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-lg border border[var(--gc-accent-40)] bg[var(--gc-accent-10)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--gc-accent)]" /> <span className="truncate">{result.path ? result.name : t("ex.ready", { name: result.name })}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 border[var(--gc-accent-40)] bg-transparent text-[var(--gc-accent)] hover:bg[var(--gc-accent-10)]"
                  onClick={() => {
                    void deliverExport(result.blob, result.name);
                  }}
                >
                  {result.path ? <FolderOpen className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                  {result.path ? t("ex.anotherCopy") : t("ex.downloadAgain")}
                </Button>
              </div>
              {/* um empurrãozinho de estrela depois de exportar (não inconveniente) */}
              <a
                href="https://github.com/lucasgabrieldevgg/galaxycut"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-amber-300/90 transition hover:text-amber-200"
              >
                <Star className="h-3 w-3 fill-amber-300 text-amber-300" /> {t("ex.starAsk")}
              </a>
            </div>
          )}

          {!supported && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
              {t("ex.unsupported")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={downloadSrt} disabled={busy} className="gap-1.5 border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
            <FileText className="h-4 w-4" /> {t("ex.srt")}
          </Button>
          <Button onClick={() => void run()} disabled={busy || (isVideo && !supported)} className="gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? t("ex.exporting") : t("ex.exportBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
