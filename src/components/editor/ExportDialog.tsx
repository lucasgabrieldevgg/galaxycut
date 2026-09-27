// GaláxiaCut — diálogo de exportação (vídeo + SRT)
"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProject, usePlayback } from "@/lib/editor/store";
import { buildSrt, canExport, downloadBlob, exportFormatLabel, exportVideo, sanitizeName } from "@/lib/editor/exporter";
import { deliverExport, isDesktopBuild } from "@/lib/editor/desktop";
import { toast } from "sonner";
import { Download, Loader2, CheckCircle2, FileText, MonitorPlay, FolderOpen } from "lucide-react";

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const project = useProject((s) => s.project);
  const duration = usePlayback((s) => s.duration);
  const clips = useProject((s) => s.clips);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(30);
  const [quality, setQuality] = useState<"alta" | "media" | "baixa">("alta");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ blob: Blob; name: string; path?: string | null } | null>(null);

  const vertical = project.height >= project.width;
  const outLabel = vertical
    ? `${Math.round(height * (project.width / project.height))}×${height}`
    : `${height === 1080 ? 1920 : 1280}×${height === 1080 ? 1080 : 720}`;
  const outLabelSquare = `${height}×${height}`;
  const finalLabel = Math.abs(project.width / project.height - 1) < 0.01 ? outLabelSquare : outLabel;

  const bitrate = quality === "alta" ? 14_000_000 : quality === "media" ? 9_000_000 : 5_000_000;

  async function run() {
    if (duration <= 0) {
      toast.error("Timeline vazia — adicione mídia antes de exportar");
      return;
    }
    setBusy(true);
    setProgress(0);
    setResult(null);
    try {
      const out = await exportVideo({ height, fps, bitrate }, (p) => setProgress(p));
      // nomeação própria: nunca briga com outros vídeos da pasta
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}-${String(now.getSeconds()).padStart(2, "0")}`;
      const name = `GalaxyCut_${ts}_${sanitizeName(project.name)}_${height === 1080 ? "1080p" : "720p"}.${out.ext}`;
      const path = await deliverExport(out.blob, name);
      setResult({ blob: out.blob, name, path });
      toast.success(
        isDesktopBuild()
          ? `Vídeo salvo em ${path}`
          : "Vídeo exportado!",
        { description: isDesktopBuild() ? "Pasta Vídeos/GalaxyCut — o arquivo já abriu no gerenciador." : `Formato ${out.ext.toUpperCase()} • ${finalLabel} • ${fps}fps` }
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

  const supported = canExport();

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorPlay className="h-4 w-4 text-[#22C55E]" /> Exportar vídeo
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Saída {exportFormatLabel()} até 1080p em {fps}fps — sem marca d&apos;água, é claro. 😎
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-400">Resolução</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[720, 1080].map((h) => (
                <button
                  key={h}
                  onClick={() => setHeight(h)}
                  disabled={busy}
                  className={`rounded-md border px-2 py-2 text-xs transition ${
                    height === h ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                  }`}
                >
                  <span className="block font-semibold">{h === 1080 ? "1080p" : "720p"}</span>
                  <span className="block text-[9px] opacity-70">{h === 1080 ? "máxima qualidade" : "mais leve"}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">Saída final: {finalLabel} ({project.width >= project.height ? "horizontal" : "vertical"})</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-400">Taxa de quadros</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[30, 60].map((f) => (
                <button
                  key={f}
                  onClick={() => setFps(f)}
                  disabled={busy}
                  className={`rounded-md border px-2 py-1.5 text-xs transition ${
                    fps === f ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                  }`}
                >
                  {f} fps
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-400">Qualidade</p>
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
          </div>

          {busy && (
            <div className="space-y-2 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/5 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#22C55E]" /> Gravando em tempo real…
                </span>
                <span className="font-mono text-[#22C55E]">{Math.round(progress * 100)}%</span>
              </div>
              <Progress value={progress * 100} className="h-1.5 bg-[#0a0d14]" />
              <p className="text-[10px] text-zinc-500">
                A exportação roda em tempo real (um short de 30s leva ~30s). Pode minimizar a janela não.
              </p>
            </div>
          )}

          {result && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/10 p-3">
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
          )}

          {!supported && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
              Seu navegador não suporta gravação de vídeo. Use Chrome ou Edge atualizado.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={downloadSrt} disabled={busy} className="gap-1.5 border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
            <FileText className="h-4 w-4" /> Legenda .srt
          </Button>
          <Button onClick={() => void run()} disabled={busy || !supported} className="gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? "Exportando…" : "Exportar vídeo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
