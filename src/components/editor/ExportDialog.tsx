// GaláxiaCut — diálogo de exportação (vídeo + GIF + WAV + PNG + SRT)
// v7: padrão 1080p/30fps, com "mais opções" revelando 240p→8K, fps 24–60
// e formatos (MP4, WebM, GIF animado, WAV do áudio e PNG do quadro).
"use client";

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProject, usePlayback } from "@/lib/editor/store";
import {
  buildSrt, canExport, downloadBlob, exportVideo, exportGif, exportWav, exportPng,
  listVideoFormats, outputSize, sanitizeName, suggestBitrate, VideoFormat,
} from "@/lib/editor/exporter";
import { deliverExport, isDesktopBuild } from "@/lib/editor/desktop";
import { useT } from "@/lib/editor/i18n";
import { toast } from "sonner";
import { Download, Loader2, CheckCircle2, FileText, MonitorPlay, FolderOpen, Star, ChevronDown, ChevronUp, Image as ImageIcon, Music4, FileVideo } from "lucide-react";

/** qualidade = MENOR lado da saída. 1080 é o padrão; o resto aparece em "mais opções". */
const RESOLUTIONS: { id: number; label: string; hint: string }[] = [
  { id: 4320, label: "8K", hint: "4320p · monstro" },
  { id: 2160, label: "4K", hint: "2160p · ultra" },
  { id: 1440, label: "2K", hint: "1440p · qHD" },
  { id: 1080, label: "1080p", hint: "padrão full" },
  { id: 720, label: "720p", hint: "leve" },
  { id: 480, label: "480p", hint: "bem leve" },
  { id: 360, label: "360p", hint: "miniatura" },
  { id: 240, label: "240p", hint: "preview rápido" },
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
  const [result, setResult] = useState<{ blob: Blob; name: string; path?: string | null } | null>(null);

  const videoFormats = useMemo(() => listVideoFormats(), []);
  const supported = canExport();

  const isVideo = format === "mp4" || format === "webm9" || format === "webm8";
  const { W, H } = outputSize(project, shortSide);

  const bitrate = useMemo(() => {
    const base = suggestBitrate(shortSide, project.width / project.height);
    return quality === "alta" ? base : quality === "media" ? Math.round(base * 0.65) : Math.round(base * 0.38);
  }, [shortSide, quality, project]);

  async function run() {
    if (duration <= 0) {
      toast.error("Timeline vazia — adicione mídia antes de exportar");
      return;
    }
    setBusy(true);
    setProgress(0);
    setResult(null);
    try {
      // nomeação própria: nunca briga com outros vídeos da pasta
      const now = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const ts = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}-${p(now.getSeconds())}`;
      const resTag = format === "wav" || format === "png" || format === "gif" ? format.toUpperCase() : `${shortSide}p`;
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
        out = await exportVideo({ shortSide, fps, bitrate, format }, (v) => setProgress(v));
        stage = out.ext.toUpperCase();
      }
      void stage;
      const name = `GalaxyCut_${ts}_${sanitizeName(project.name)}_${resTag}.${out.ext}`;
      const path = await deliverExport(out.blob, name);
      setResult({ blob: out.blob, name, path });
      toast.success(
        isDesktopBuild()
          ? `Salvo em ${path}`
          : t("ex.done"),
        {
          description: isDesktopBuild()
            ? "Pasta Vídeos/GalaxyCut — o arquivo já abriu no gerenciador."
            : `${stage} · ${W}×${H} · ${isVideo ? `${fps}fps · ` : ""}${quality}`,
        }
      );
    } catch (e) {
      toast.error("Falha na exportação", { description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  function downloadSrt() {
    const srt = buildSrt(project, clips);
    if (!srt.trim()) {
      toast.info("Nenhuma legenda de texto na timeline para exportar");
      return;
    }
    downloadBlob(new Blob([srt], { type: "text/plain;charset=utf-8" }), `${sanitizeName(project.name)}.srt`);
    toast.success("Arquivo .srt baixado");
  }

  const resBtn = (id: number, label: string, hint: string) => (
    <button
      key={id}
      onClick={() => setShortSide(id)}
      disabled={busy}
      className={`rounded-md border px-2 py-2 text-xs transition ${
        shortSide === id ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
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
            <MonitorPlay className="h-4 w-4 text-[#22C55E]" /> {t("ex.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Padrão 1080p em 30fps — sem marca d&apos;água. Toque em “{t("ex.more")}” pra revelar de 240p a 8K, outros fps e formatos.
          </DialogDescription>
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
                    format === f.id ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
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
                  format === "gif" ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" /> GIF
              </button>
              <button
                onClick={() => setFormat("wav")}
                disabled={busy}
                title={t("ex.wavNote")}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition ${
                  format === "wav" ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                <Music4 className="h-3.5 w-3.5" /> WAV
              </button>
              <button
                onClick={() => setFormat("png")}
                disabled={busy}
                title={t("ex.pngNote")}
                className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition ${
                  format === "png" ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" /> PNG
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              {format === "gif" ? t("ex.gifNote") : format === "wav" ? t("ex.wavNote") : format === "png" ? t("ex.pngNote") : `Saída final: ${W}×${H} (${project.width >= project.height ? "horizontal" : project.width === project.height ? "quadrado" : "vertical"})`}
            </p>
          </div>

          {/* resolução (vídeo/gif) */}
          {format !== "wav" && format !== "png" && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("ex.resolution")}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {showMore
                  ? RESOLUTIONS.map((r) => resBtn(r.id, r.label, r.hint))
                  : [720, 1080].map((id) => resBtn(id, id === 1080 ? "1080p" : "720p", id === 1080 ? "padrão full" : "mais leve"))}
              </div>
              {shortSide >= 2160 && (
                <p className="mt-1 text-[10px] text-amber-400/80">
                  ⚠️ {shortSide === 4320 ? "8K" : "4K"} grava em tempo real e pede um PC bom — exportar assim pode levar bastante tempo.
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
                      fps === f ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                    }`}
                  >
                    {f} fps {f === 30 && <span className="text-[8px] opacity-70">(padrão)</span>}
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
                      quality === q ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                    }`}
                  >
                    {q === "media" ? "média" : q}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">
                {t("ex.quality")}: {(bitrate / 1_000_000).toFixed(1)} Mbps — escala com a resolução escolhida.
              </p>
            </div>
          )}

          {/* revelar/ocultar as opções extra */}
          {format !== "wav" && format !== "png" && (
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#232d3d] bg-[#0e1320] px-2 py-1.5 text-[11px] text-zinc-400 transition hover:border-[#22C55E]/40 hover:text-[#22C55E]"
            >
              {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showMore ? t("ex.less") : t("ex.more")}
            </button>
          )}

          {busy && (
            <div className="space-y-2 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/5 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#22C55E]" />{" "}
                  {format === "gif" ? "Desenhando o GIF quadro a quadro…" : format === "wav" ? "Mixando o áudio…" : t("ex.recording")}
                </span>
                <span className="font-mono text-[#22C55E]">{Math.round(progress * 100)}%</span>
              </div>
              <Progress value={progress * 100} className="h-1.5 bg-[#0a0d14]" />
              <p className="text-[10px] text-zinc-500">
                {isVideo
                  ? "A exportação roda em tempo real (um short de 30s leva ~30s). Dá pra deixar a janela aberta fazendo outra coisa."
                  : "Render offline — mais rápido que tempo real."}
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22C55E]" /> <span className="truncate">{result.path ? result.name : `Pronto: ${result.name}`}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 gap-1 border-[#22C55E]/40 bg-transparent text-[#22C55E] hover:bg-[#22C55E]/10"
                  onClick={() => {
                    void deliverExport(result.blob, result.name);
                  }}
                >
                  {result.path ? <FolderOpen className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                  {result.path ? "Salvar outra cópia" : "Baixar de novo"}
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
              Seu navegador não suporta gravação de vídeo. Use Chrome ou Edge atualizado.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={downloadSrt} disabled={busy} className="gap-1.5 border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
            <FileText className="h-4 w-4" /> {t("ex.srt")}
          </Button>
          <Button onClick={() => void run()} disabled={busy || (isVideo && !supported)} className="gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? t("ex.exporting") : t("ex.exportBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
