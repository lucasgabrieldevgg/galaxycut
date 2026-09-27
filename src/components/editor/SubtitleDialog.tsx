// GalaxyCut — diálogo de legendas automáticas (Whisper no navegador)
// v4: botão "−" minimiza pro canto enquanto a IA continua — a barrinha
// flutuante mostra a % e a aba abre de novo com 1 clique.
"use client";

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProject } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { transcribe, SubSegment, useSubtitleJob, WhisperProgress, WHISPER_MODELS, WhisperModelId, cancelTranscription } from "@/lib/editor/subtitles";
import { CAPTION_PRESETS, CaptionPreset, makeClip, defaultTextProps } from "@/lib/editor/types";
import { isDesktopBuild, desktop } from "@/lib/editor/desktop";
import { toast } from "sonner";
import { Sparkles, Loader2, CheckCircle2, TriangleAlert, Cpu, Palette, Layers, Minus, Download, XCircle } from "lucide-react";

// idiomas que o Whisper entende (a IA detecta na hora — mais idiomas chegando)
const LANGS = [
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

  async function generate() {
    if (!source?.mediaId) return;
    // no navegador a IA local trava a aba — a função fica só no app baixado
    if (!isDesktopBuild()) {
      toast.info("Legendas automáticas só no app de desktop", {
        description: "No navegador o modelo de IA congela a página. Baixe o app (grátis) — lá ele roda em 2º plano sem travar nada.",
      });
      return;
    }
    job.start();
    try {
      const segs = await transcribe(source.mediaId!, lang, (p: WhisperProgress) => useSubtitleJob.getState().setProg(p), model, maxWords);
      if (!segs.length) {
        toast.info("A IA não encontrou fala nesse áudio");
      } else {
        applySegments(segs);
        toast.success(`${segs.length} legendas criadas!`, {
          description: "Elas entraram na faixa de texto — a palavra falada fica destacada 🎤",
        });
        job.setOpen(false);
      }
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg.includes("cancel")) toast.info("Transcrição cancelada");
      else toast.error("Falha na transcrição", { description: msg });
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
      ? "Baixando o modelo de IA (só na primeira vez)…"
      : job.stage === "prepare"
        ? "Preparando o áudio…"
        : "Transcrevendo com IA local (sem travar nada)…";
  const modelInfo = WHISPER_MODELS.find((m) => m.id === model)!;
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Sparkles className="h-4 w-4 text-[#22C55E]" /> Legendas automáticas com IA
            <button
              type="button"
              onClick={() => {
                if (job.running) job.setMinimized(true);
                job.setOpen(false);
              }}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md border border-[#2a3546] text-zinc-400 transition hover:border-[#22C55E]/50 hover:text-[#22C55E]"
              title="Minimizar (a geração continua em 2º plano)"
              aria-label="Minimizar"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Whisper rodando no seu próprio navegador, com tempo de <b className="text-zinc-400">cada palavra</b> — a
            legenda vai "cantando" conforme a fala. Nada é enviado pra servidor nenhum.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-2.5">
            <span className="text-xs text-zinc-400">Origem do áudio</span>
            <span className="max-w-[55%] truncate text-xs font-medium text-zinc-200">
              {source ? `${source.kind === "video" ? "Vídeo" : "Áudio"} • ${Math.round(source.duration)}s na timeline` : "nenhum clipe"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-2.5">
            <span className="text-xs text-zinc-400">Idioma da fala</span>
            <div className="flex gap-1">
              {LANGS.map((l) => (
                <button
                  key={l.v}
                  type="button"
                  disabled={job.running}
                  onClick={() => setLang(l.v)}
                  className={`rounded-md border px-2 py-1 text-[11px] transition ${
                    lang === l.v ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* qualidade da detecção */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
              <Cpu className="h-3.5 w-3.5" /> Precisão da detecção de palavras
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {WHISPER_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={job.running}
                  onClick={() => setSettings({ whisperModel: m.id as WhisperModelId })}
                  className={`rounded-md border px-2 py-1.5 text-center transition ${
                    model === m.id
                      ? "border-[#22C55E] bg-[#22C55E]/10"
                      : "border-[#2a3546] hover:border-[#3a4759]"
                  }`}
                >
                  <span className={`block text-[11px] font-semibold ${model === m.id ? "text-[#22C55E]" : "text-zinc-300"}`}>{m.label}</span>
                  <span className="block text-[9px] leading-tight text-zinc-500">{m.hint}</span>
                </button>
              ))}
            </div>
            {model === "small" && (
              <p className="mt-1 text-[10px] text-amber-400/80">
                ⚠️ O modelo Preciso baixa ~250 MB e pode levar uns minutos — vale a pena em narração com nomes difíceis.
              </p>
            )}
          </div>

          {/* estilo da legenda */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
              <Palette className="h-3.5 w-3.5" /> Estilo das legendas
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {CAPTION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={job.running}
                  onClick={() => setSettings({ captionPreset: p.id })}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition ${
                    presetId === p.id ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#2a3546] hover:border-[#3a4759]"
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
                  <span className={`w-full truncate text-center text-[8.5px] ${presetId === p.id ? "text-[#22C55E]" : "text-zinc-500"}`}>
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* palavras por caixa (anti-inundação) */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
              <Layers className="h-3.5 w-3.5" /> Palavras por legenda (pra não encher a tela)
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={job.running}
                  onClick={() => setSettings({ captionMaxWords: n })}
                  className={`rounded-md border px-2 py-1.5 text-center transition ${
                    maxWords === n ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#2a3546] hover:border-[#3a4759]"
                  }`}
                >
                  <span className={`block text-[11px] font-semibold ${maxWords === n ? "text-[#22C55E]" : "text-zinc-300"}`}>{n} palavras</span>
                  <span className="block text-[9px] text-zinc-500">{n === 2 ? " estilo CapCut" : n === 3 ? " equilíbrio" : " mais contexto"}</span>
                </button>
              ))}
            </div>
          </div>

          {!source && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Selecione um clipe de vídeo ou áudio na timeline antes de gerar as legendas.
            </p>
          )}

          {/* no navegador: as legendas automáticas ficam só no app baixado */}
          {onWeb && (
            <div className="space-y-2 rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/[0.07] p-3">
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[#86efac]">
                <Download className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <b>As legendas automáticas rodam só no app de desktop.</b> No navegador o modelo de IA congela a
                  página inteira — no app ele roda em 2º plano, sem travar nada, e dá pra cancelar no meio.
                </span>
              </p>
              <Button
                onClick={() => window.open("https://github.com/lucasgabrieldevgg/galaxycut/releases/latest", "_blank", "noreferrer")}
                className="w-full gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]"
              >
                <Download className="h-4 w-4" /> Baixar o app (grátis, Linux e Windows)
              </Button>
              <p className="text-[10px] text-zinc-500">
                As legendas MANUAIS (aba Texto) continuam funcionando normalmente no navegador.
              </p>
            </div>
          )}

          {job.running && (
            <div className="space-y-2 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/5 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#22C55E]" /> {stageLabel}
                </span>
                <span className="font-mono text-[#22C55E]">{pct}%</span>
              </div>
              <Progress value={pct} className="h-1.5 bg-[#0a0d14]" />
              <p className="text-[10px] text-zinc-500">
                Modelo {modelInfo.label} ({modelInfo.hint}). Pode levar alguns minutos — dá pra minimizar com{" "}
                <b className="text-zinc-400">−</b> e continuar editando.
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
            {job.running ? "Minimizar" : "Cancelar"}
          </Button>
          {job.running ? (
            <Button
              variant="outline"
              onClick={() => {
                cancelTranscription(); // mata o worker na hora
              }}
              className="gap-1.5 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4" /> Cancelar transcrição
            </Button>
          ) : (
            <Button
              onClick={() => void generate()}
              disabled={!source || onWeb}
              title={onWeb ? "Disponível só no app de desktop — baixe aí em cima" : undefined}
              className="gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]"
            >
              <CheckCircle2 className="h-4 w-4" />
              Gerar legendas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
