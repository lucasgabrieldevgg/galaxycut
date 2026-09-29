// GalaxyCut — diálogo de exportação (vídeo + GIF + WAV + PNG/JPG + SRT)
// v7.5: Categorias claras (Vídeo, Áudio, Animação GIF e Foto da Cena PNG/JPG),
// mais formatos de vídeo (MP4, WebM, MOV, MKV), opção de vídeo Mudo (sem áudio),
// e correção definitiva do áudio na exportação.
"use client";

import { useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProject, usePlayback } from "@/lib/editor/store";
import {
  buildSrt, canExport, downloadBlob, exportVideo, exportGif, exportWav, exportPng, exportJpg,
  listVideoFormats, outputSize, sanitizeName, suggestBitrate, VideoFormat, ExportProgress,
} from "@/lib/editor/exporter";
import { deliverExport, askExportDestination, isDesktopBuild } from "@/lib/editor/desktop";
import { useT } from "@/lib/editor/i18n";
import { toast } from "sonner";
import {
  Download, Loader2, CheckCircle2, FileText, MonitorPlay, FolderOpen, Star, ChevronDown, ChevronUp,
  Image as ImageIcon, Music4, FileVideo, XCircle, Volume2, VolumeX, Sparkles, Film, Camera, Clock
} from "lucide-react";
import { clipEnd } from "@/lib/editor/types";
import { computeEffectiveDuration } from "@/lib/editor/store";

function fmtDur(d: number) {
  if (!isFinite(d)) return "0:00";
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

type ExportCategory = "video" | "audio" | "gif" | "photo";

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const project = useProject((s) => s.project);
  const duration = usePlayback((s) => s.duration);
  const playhead = usePlayback((s) => s.playhead);
  const clips = useProject((s) => s.clips);

  const [category, setCategory] = useState<ExportCategory>("video");
  const [shortSide, setShortSide] = useState(1080);
  const [fps, setFps] = useState(30);
  const [quality, setQuality] = useState<"alta" | "media" | "baixa">("alta");
  const [format, setFormat] = useState<VideoFormat>("mp4");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [photoFormat, setPhotoFormat] = useState<"png" | "jpg">("png");
  const [audioFormat, setAudioFormat] = useState<"wav" | "mp3">("wav");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progInfo, setProgInfo] = useState<{ frame?: number; frames?: number; etaSec?: number; speed?: number }>({});
  const [result, setResult] = useState<{ blob: Blob; name: string; path?: string | null } | null>(null);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const videoFormats = useMemo(() => listVideoFormats(), []);
  const supported = canExport();

  const isVideo = category === "video";
  const { W, H } = outputSize(project, shortSide);

  const bitrate = useMemo(() => {
    const base = suggestBitrate(shortSide, project.width / project.height);
    return quality === "alta" ? base : quality === "media" ? Math.round(base * 0.65) : Math.round(base * 0.38);
  }, [shortSide, quality, project]);

  const videoDuration = useMemo(() => {
    let maxV = 0;
    for (const c of clips) {
      if (c.kind === "video" || c.kind === "image" || c.kind === "text") {
        maxV = Math.max(maxV, clipEnd(c));
      }
    }
    return maxV;
  }, [clips]);

  const totalDuration = useMemo(() => {
    return computeEffectiveDuration(clips, useProject.getState().tracks);
  }, [clips]);

  const audioHasExtra = videoDuration > 0 && totalDuration > videoDuration + 0.5;
  const [trimToVideo, setTrimToVideo] = useState(true);

  const finalExportDuration = (isVideo || category === "gif") && trimToVideo && videoDuration > 0 ? videoDuration : (totalDuration > 0 ? totalDuration : duration);

  function fmtEta(s?: number) {
    if (s == null || !isFinite(s) || s <= 0) return "";
    if (s < 60) return `${Math.max(1, Math.round(s))}s`;
    const m = Math.floor(s / 60);
    return `${m}m${String(Math.round(s % 60)).padStart(2, "0")}s`;
  }

  async function run() {
    if (category !== "photo" && duration <= 0) {
      toast.error(t("ex.emptyTimeline"));
      return;
    }

    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;

    let ext = "mp4";
    let resTag = `${shortSide}p`;

    if (category === "photo") {
      ext = photoFormat;
      resTag = `Frame_${playhead.toFixed(1)}s`;
    } else if (category === "audio") {
      ext = audioFormat;
      resTag = "AUDIO";
    } else if (category === "gif") {
      ext = "gif";
      resTag = `${shortSide}p_GIF`;
    } else {
      ext = format;
      resTag = !includeAudio ? `${shortSide}p_MUTE` : `${shortSide}p`;
    }

    const name = `GalaxyCut_${ts}_${sanitizeName(project.name)}_${resTag}.${ext}`;

    // no APP: pergunta ANTES onde salvar
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
      if (info?.stage === "render") {
        setProgInfo({ frame: info.frame, frames: info.frames, etaSec: info.etaSec, speed: info.speed });
      } else {
        setProgInfo({});
      }
    };

    try {
      let out: { blob: Blob; ext: string };
      let stage = "";

      if (category === "photo") {
        out = photoFormat === "jpg" ? await exportJpg() : await exportPng();
        stage = photoFormat.toUpperCase();
      } else if (category === "audio") {
        out = await exportWav((v) => setProgress(v));
        stage = audioFormat.toUpperCase();
      } else if (category === "gif") {
        out = await exportGif({ shortSide, fps }, (v) => setProgress(v));
        stage = "GIF";
      } else {
        out = await exportVideo(
          { shortSide, fps, bitrate, format, includeAudio, duration: finalExportDuration, cancel: cancelRef.current },
          onProg
        );
        stage = out.ext.toUpperCase();
      }

      const path = await deliverExport(out.blob, name, dest.dest === "desktop" ? dest.path || undefined : undefined);
      setResult({ blob: out.blob, name, path });
      toast.success(
        isDesktopBuild()
          ? t("ex.savedAt", { path: String(path) })
          : t("ex.done"),
        {
          description: isDesktopBuild()
            ? t("ex.savedAtDesc")
            : `${stage} · ${category === "photo" ? `${project.width}×${project.height}` : `${W}×${H}`}${isVideo ? ` · ${fps}fps · ${fmtDur(finalExportDuration)} · ${!includeAudio ? "Mudo" : "Com áudio"}` : ""}`,
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
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-[var(--gc-accent)]" /> {t("ex.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            {t("ex.descSimple")}
          </DialogDescription>
        </DialogHeader>

        {/* Abas de Categorias */}
        <div className="flex rounded-lg border border-[#232d3d] bg-[#0c1017] p-1">
          <button
            type="button"
            onClick={() => setCategory("video")}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
              category === "video" ? "bg-[var(--gc-accent)] text-black shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Film className="h-3.5 w-3.5" /> {t("ex.catVideo")}
          </button>
          <button
            type="button"
            onClick={() => setCategory("audio")}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
              category === "audio" ? "bg-[var(--gc-accent)] text-black shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Music4 className="h-3.5 w-3.5" /> {t("ex.catAudio")}
          </button>
          <button
            type="button"
            onClick={() => setCategory("gif")}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
              category === "gif" ? "bg-[var(--gc-accent)] text-black shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" /> GIF
          </button>
          <button
            type="button"
            onClick={() => setCategory("photo")}
            disabled={busy}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
              category === "photo" ? "bg-[var(--gc-accent)] text-black shadow-sm" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Camera className="h-3.5 w-3.5" /> {t("ex.catPhoto")}
          </button>
        </div>

        <div className="space-y-3.5 py-1">
          {/* CATEGORIA: VÍDEO */}
          {category === "video" && (
            <>
              {/* Duração & Ajuste Inteligente ao Vídeo */}
              <div className="rounded-lg border border-[#232d3d] bg-[#0e1320] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-emerald-400" />
                    Duração da Exportação:
                  </span>
                  <span className="font-mono text-emerald-300 font-semibold text-sm">
                    {fmtDur(finalExportDuration)} ({finalExportDuration.toFixed(1)}s)
                  </span>
                </div>

                {audioHasExtra && (
                  <div className="pt-2 border-t border-[#1c2430] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="trim-video-opt" className="text-[11px] text-zinc-300 font-medium cursor-pointer flex items-center gap-2">
                        <input
                          id="trim-video-opt"
                          type="checkbox"
                          checked={trimToVideo}
                          onChange={(e) => setTrimToVideo(e.target.checked)}
                          className="rounded border-[#2a3546] bg-[#121722] text-emerald-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                        />
                        Cortar no final do último vídeo ({videoDuration.toFixed(1)}s)
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono">
                        {trimToVideo ? "Sem tela preta" : `Trilha até ${totalDuration.toFixed(1)}s`}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      {trimToVideo
                        ? `A música dura ${fmtDur(totalDuration)}, mas o vídeo termina aos ${fmtDur(videoDuration)}. O vídeo exportado terminará certinho aos ${fmtDur(videoDuration)} evitando tela preta no final.`
                        : `A exportação continuará até ${fmtDur(totalDuration)} com tela preta enquanto a música toca.`}
                    </p>
                  </div>
                )}
              </div>

              {/* Formato de Vídeo */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.format")}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {videoFormats.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFormat(f.id)}
                      disabled={busy}
                      title={f.hint}
                      className={`flex flex-col items-center justify-center rounded-md border p-2 text-center text-xs transition ${
                        format === f.id
                          ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold"
                          : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <FileVideo className="h-3.5 w-3.5" /> {f.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-zinc-500">
                  {videoFormats.find((f) => f.id === format)?.hint}
                </p>
              </div>

              {/* Opção de Áudio no Vídeo (Novo!) */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.audioTrack")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIncludeAudio(true)}
                    disabled={busy}
                    className={`flex items-center justify-center gap-2 rounded-md border p-2 text-xs transition ${
                      includeAudio
                        ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold"
                        : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                    }`}
                  >
                    <Volume2 className="h-4 w-4" /> {t("ex.audioInclude")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIncludeAudio(false)}
                    disabled={busy}
                    className={`flex items-center justify-center gap-2 rounded-md border p-2 text-xs transition ${
                      !includeAudio
                        ? "border-amber-400 bg-amber-400/10 text-amber-300 font-semibold"
                        : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                    }`}
                  >
                    <VolumeX className="h-4 w-4" /> {t("ex.audioMute")}
                  </button>
                </div>
                {!includeAudio && (
                  <p className="mt-1 text-[10px] text-amber-400/80">
                    {t("ex.audioMuteNote")}
                  </p>
                )}
              </div>

              {/* Resolução */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-medium text-zinc-400">{t("ex.resolution")}</p>
                  <span className="text-[10px] text-zinc-500">
                    {W}×{H} ({project.width >= project.height ? t("ex.horizontal") : project.width === project.height ? t("ex.square") : t("ex.vertical")})
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {RESOLUTIONS.map((r) => resBtn(r.id, r.label, t(r.hintKey)))}
                </div>
                {shortSide >= 2160 && (
                  <p className="mt-1 text-[10px] text-amber-400/80">
                    {t("ex.hugeWarn", { k: shortSide === 4320 ? "8K" : "4K" })}
                  </p>
                )}
              </div>

              {/* Taxa de Quadros (FPS) */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.fps")}</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {FPS_OPTIONS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFps(f)}
                      disabled={busy}
                      className={`rounded-md border px-2 py-1.5 text-xs transition ${
                        fps === f ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                      }`}
                    >
                      {f} fps {f === 30 && <span className="block text-[8px] opacity-70">({t("ex.default")})</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Qualidade (Bitrate) */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.quality")}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["baixa", "media", "alta"] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      disabled={busy}
                      className={`rounded-md border px-2 py-1.5 text-xs capitalize transition ${
                        quality === q ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
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
            </>
          )}

          {/* CATEGORIA: ÁUDIO APENAS */}
          {category === "audio" && (
            <div className="space-y-3 rounded-lg border border-[#232d3d] bg-[#0e1320] p-3.5">
              <div className="flex items-center gap-2 text-zinc-200">
                <Music4 className="h-5 w-5 text-amber-400" />
                <div>
                  <h4 className="text-xs font-semibold">{t("ex.audioTitle")}</h4>
                  <p className="text-[11px] text-zinc-400">{t("ex.wavNote")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAudioFormat("wav")}
                  disabled={busy}
                  className={`rounded-md border p-2 text-xs transition ${
                    audioFormat === "wav" ? "border-amber-400 bg-amber-400/10 text-amber-300 font-semibold" : "border-[#2a3546] text-zinc-400"
                  }`}
                >
                  <span className="block font-semibold">WAV (48kHz 16-bit)</span>
                  <span className="text-[9px] text-zinc-500">{t("ex.audioLossless")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudioFormat("mp3")}
                  disabled={busy}
                  className={`rounded-md border p-2 text-xs transition ${
                    audioFormat === "mp3" ? "border-amber-400 bg-amber-400/10 text-amber-300 font-semibold" : "border-[#2a3546] text-zinc-400"
                  }`}
                >
                  <span className="block font-semibold">MP3 / AAC</span>
                  <span className="text-[9px] text-zinc-500">{t("ex.audioCompressed")}</span>
                </button>
              </div>
            </div>
          )}

          {/* CATEGORIA: GIF ANIMADO */}
          {category === "gif" && (
            <div className="space-y-3 rounded-lg border border-[#232d3d] bg-[#0e1320] p-3.5">
              <div className="flex items-center gap-2 text-zinc-200">
                <ImageIcon className="h-5 w-5 text-teal-400" />
                <div>
                  <h4 className="text-xs font-semibold">{t("ex.gifTitle")}</h4>
                  <p className="text-[11px] text-zinc-400">{t("ex.gifNote")}</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-zinc-400">{t("ex.resolution")}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {[240, 360, 480].map((id) => resBtn(id, `${id}p`, ""))}
                </div>
              </div>
            </div>
          )}

          {/* CATEGORIA: FOTO DA CENA (PNG/JPG) */}
          {category === "photo" && (
            <div className="space-y-3 rounded-lg border border-[#232d3d] bg-[#0e1320] p-3.5">
              <div className="flex items-start gap-2.5 text-zinc-200">
                <Camera className="h-5 w-5 shrink-0 text-[var(--gc-accent)]" />
                <div>
                  <h4 className="text-xs font-semibold">{t("ex.photoTitle")}</h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                    {t("ex.photoDesc", { s: playhead.toFixed(2), w: project.width, h: project.height })}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs text-zinc-400">{t("ex.photoFormat")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPhotoFormat("png")}
                    disabled={busy}
                    className={`rounded-md border p-2 text-xs transition ${
                      photoFormat === "png"
                        ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold"
                        : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                    }`}
                  >
                    <span className="block font-semibold">PNG (Máxima Fidelidade)</span>
                    <span className="text-[9px] text-zinc-500">Sem perdas · Ideal para miniaturas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoFormat("jpg")}
                    disabled={busy}
                    className={`rounded-md border p-2 text-xs transition ${
                      photoFormat === "jpg"
                        ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold"
                        : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                    }`}
                  >
                    <span className="block font-semibold">JPG (Foto Compactada)</span>
                    <span className="text-[9px] text-zinc-500">Arquivo leve e rápido</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Barra de Progresso */}
          {busy && (
            <div className="space-y-2 rounded-lg border border[var(--gc-accent-30)] bg[var(--gc-accent-5)] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gc-accent)]" />{" "}
                  {category === "gif" ? t("ex.gifStage") : category === "audio" ? t("ex.wavStage") : category === "photo" ? t("ex.photoStage") : t("ex.rendering")}
                </span>
                <span className="font-mono text-[var(--gc-accent)]">{Math.round(progress * 100)}%</span>
              </div>
              <Progress value={progress * 100} className="h-1.5 bg-[#0a0d14]" />
              <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                <span>
                  {isVideo && progInfo.frames
                    ? t("ex.frameOf", { i: progInfo.frame ?? 0, n: progInfo.frames })
                    : category === "gif" || category === "audio"
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

          {/* Resultado */}
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
          {category === "video" && (
            <Button variant="outline" onClick={downloadSrt} disabled={busy} className="gap-1.5 border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
              <FileText className="h-4 w-4" /> {t("ex.srt")}
            </Button>
          )}
          <Button
            onClick={() => void run()}
            disabled={busy || (isVideo && !supported)}
            className="gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy
              ? t("ex.exporting")
              : category === "photo"
                ? t("ex.captureBtn")
                : category === "audio"
                  ? t("ex.exportAudioBtn")
                  : t("ex.exportBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
