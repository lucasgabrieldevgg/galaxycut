// GalaxyCut — Diálogo de conversão e otimização de formato de vídeo
"use client";

import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MediaMeta } from "@/lib/editor/types";
import {
  TRANSCODE_FORMATS, TranscodeFormat, transcodeMedia,
} from "@/lib/editor/transcoder";
import { useProject } from "@/lib/editor/store";
import { engine } from "@/lib/editor/playback";
import { toast } from "sonner";
import {
  Video, ChevronDown, ChevronUp, Check, Sparkles, Loader2,
  FileVideo, Music2, Image as ImageIcon, CheckCircle2, AlertCircle, X,
} from "lucide-react";

interface ConvertMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaList: MediaMeta[];
  onConverted?: (items: MediaMeta[]) => void;
}

export function ConvertMediaDialog({
  open,
  onOpenChange,
  mediaList,
  onConverted,
}: ConvertMediaDialogProps) {
  // Padrão: MP4 pré-marcado
  const [selectedFormat, setSelectedFormat] = useState<TranscodeFormat>("mp4");
  const [expanded, setExpanded] = useState(false);
  const [shortSide, setShortSide] = useState<number>(0); // 0 = original
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageText, setStageText] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const cancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const activeFormatInfo = TRANSCODE_FORMATS.find((f) => f.id === selectedFormat) || TRANSCODE_FORMATS[0];

  const handleConvert = async () => {
    if (!mediaList.length) return;
    setBusy(true);
    setProgress(0);
    setStageText("Iniciando conversão...");
    cancelRef.current = { cancelled: false };

    const convertedMetas: MediaMeta[] = [];
    let okCount = 0;

    for (let i = 0; i < mediaList.length; i++) {
      if (cancelRef.current.cancelled) break;
      setCurrentIdx(i);
      const item = mediaList[i];
      try {
        const res = await transcodeMedia(item, selectedFormat, {
          shortSide,
          onProgress: (pct, stage) => {
            const overall = (i + pct) / mediaList.length;
            setProgress(overall * 100);
            setStageText(`${stage} (${i + 1}/${mediaList.length})`);
          },
          cancelRef: cancelRef.current,
        });

        // Atualiza a mídia no store substituindo o item original pelo convertido
        const st = useProject.getState();
        const currentMediaList = st.media;
        const exists = currentMediaList.some((m) => m.id === item.id);
        if (exists) {
          const updated = currentMediaList.map((m) => (m.id === item.id ? { ...res.meta, id: item.id } : m));
          useProject.setState({ media: updated });
        } else {
          st.addMedia(res.meta);
        }

        convertedMetas.push(res.meta);
        okCount++;
      } catch (err: any) {
        console.error("Transcode item error:", err);
        if (String(err?.message || "").includes("cancelada")) {
          toast.info("Conversão cancelada");
          break;
        }
        toast.error(`Falha ao converter "${item.name}": ${err?.message || "Erro desconhecido"}`);
      }
    }

    setBusy(false);
    engine.markDirty();

    if (okCount > 0) {
      toast.success(
        okCount === 1
          ? `Vídeo convertido para ${activeFormatInfo.label} com sucesso!`
          : `${okCount} vídeos convertidos para ${activeFormatInfo.label} com sucesso!`
      );
      onConverted?.(convertedMetas);
      onOpenChange(false);
    }
  };

  const handleKeepOriginal = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-md border-[#232d3d] bg-[#0d121c] p-5 text-zinc-100 shadow-2xl">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--gc-accent)]/20 text-[var(--gc-accent)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-zinc-100">
                Converter Formato de Vídeo
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                Deseja converter o(s) vídeo(s) para otimizar compatibilidade e performance?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Resumo dos itens importados */}
        <div className="rounded-lg border border-[#1e2633] bg-[#121824] p-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium text-zinc-200">
              {mediaList.length} vídeo(s) pronto(s) para importação
            </span>
            <span className="text-[10px] text-zinc-500">
              {mediaList.map((m) => m.name.split(".").pop()).filter(Boolean).slice(0, 3).join(", ").toUpperCase()}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {mediaList.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded bg-[#1c2436] px-2 py-0.5 text-[11px] text-zinc-300"
              >
                <Video className="h-3 w-3 text-[var(--gc-accent)]" />
                <span className="truncate max-w-[160px]">{m.name}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Formato Selecionado / Padrão MP4 */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-300">
            Formato de Destino:
          </label>

          {/* Card Principal: MP4 Padrão */}
          <div
            onClick={() => setSelectedFormat("mp4")}
            className={`cursor-pointer rounded-lg border p-3 transition ${
              selectedFormat === "mp4"
                ? "border-[var(--gc-accent)] bg-[var(--gc-accent)]/10 shadow-[0_0_12px_var(--gc-accent-15)]"
                : "border-[#1e2633] bg-[#121824] hover:border-[#2f3b4f]"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
                  <FileVideo className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-zinc-100">MP4 (H.264 / AAC)</span>
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-400">
                      Padrão Universal
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Recomendado · 100% compatível com YouTube, TikTok, Instagram e navegadores.
                  </p>
                </div>
              </div>
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  selectedFormat === "mp4"
                    ? "border-[var(--gc-accent)] bg-[var(--gc-accent)] text-black"
                    : "border-zinc-600 bg-transparent"
                }`}
              >
                {selectedFormat === "mp4" && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
            </div>
          </div>

          {/* Botão de Expandir Outros Formatos */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-between rounded-md border border-[#1e2633] bg-[#101520] px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-[#161c2a] hover:text-zinc-200"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[var(--gc-accent)]" />
              {expanded ? "Ocultar outros formatos" : "Expandir para ver mais formatos (WebM, MOV, MKV, AVI, GIF, MP3, WAV)"}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {/* Lista Expandida de Formatos */}
          {expanded && (
            <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
              {TRANSCODE_FORMATS.filter((f) => f.id !== "mp4").map((fmt) => {
                const isSel = selectedFormat === fmt.id;
                return (
                  <div
                    key={fmt.id}
                    onClick={() => setSelectedFormat(fmt.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-md border p-2 text-left transition ${
                      isSel
                        ? "border-[var(--gc-accent)] bg-[var(--gc-accent)]/10"
                        : "border-[#1e2633] bg-[#121824] hover:border-[#2f3b4f]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1c2436] text-zinc-300">
                        {fmt.kind === "video" ? (
                          <FileVideo className="h-3.5 w-3.5 text-sky-400" />
                        ) : fmt.kind === "audio" ? (
                          <Music2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 text-amber-400" />
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-medium text-zinc-200">{fmt.label}</span>
                        <p className="text-[10px] text-zinc-400 line-clamp-1">{fmt.desc}</p>
                      </div>
                    </div>
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSel
                          ? "border-[var(--gc-accent)] bg-[var(--gc-accent)] text-black"
                          : "border-zinc-600 bg-transparent"
                      }`}
                    >
                      {isSel && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resolução de Saída */}
        <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
          <span>Resolução de Saída:</span>
          <select
            value={shortSide}
            onChange={(e) => setShortSide(Number(e.target.value))}
            className="rounded border border-[#1e2633] bg-[#121824] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[var(--gc-accent)]"
          >
            <option value={0}>Original / Máxima (Sem corte)</option>
            <option value={1080}>1080p Full HD</option>
            <option value={720}>720p HD</option>
            <option value={480}>480p SD</option>
          </select>
        </div>

        {/* Barra de Progresso Durante a Conversão */}
        {busy && (
          <div className="space-y-1.5 rounded-lg border border-[var(--gc-accent)]/30 bg-[#121824] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-zinc-200 font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gc-accent)]" />
                {stageText}
              </span>
              <span className="font-mono text-zinc-400">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        <DialogFooter className="flex items-center justify-end gap-2 pt-2">
          {busy ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                cancelRef.current.cancelled = true;
              }}
              className="text-xs"
            >
              Cancelar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleKeepOriginal}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Manter Original
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConvert}
                className="bg-gradient-to-r from-[var(--gc-accent)] to-teal-400 text-black font-semibold text-xs hover:brightness-110"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Converter para {activeFormatInfo.label.split(" ")[0]}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
