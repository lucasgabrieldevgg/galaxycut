// GaláxiaCut — detector automático de cenas sem áudio (acha onde ninguém fala e oferece excluir)
// v5: analisa o ARQUIVO e aplica em TODOS os clipes que usam ele (antes só o clipe
// selecionado era cortado — sobravam pedaços inteiros "pra frente" na timeline)
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
  const [mode, setMode] = useState<Mode>("both");

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
      toast.error("Mídia não encontrada neste navegador", { description: "Reimporte o arquivo na aba Mídia antes de detectar." });
      return;
    }
    setBusy(true);
    setSpans(null);
    try {
      const opts: SilenceOptions = { ...SENSITIVITY_PRESETS.find((p) => p.id === preset)!.opts, minDuration: minDur };
      const raw = await detectSilence(blob, opts);
      if (!raw.length) {
        setSpans([]);
        toast.info("Não achei silêncio nesse arquivo", { description: "Tenta a sensibilidade \"Agressivo\" ou \"Tudo\", ou uma duração menor." });
      } else {
        setSpans(raw.map((s) => ({ ...s, on: true })));
        toast.success(`${raw.length} trecho(s) sem som achados`, { description: "Confere aí e desmarca o que não quiser cortar." });
      }
    } catch (e) {
      toast.error("Falha ao analisar o áudio", { description: String((e as Error).message ?? e) });
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
    const verb = mode === "both" ? "excluído(s)" : mode === "audio" ? "silenciado(s)" : "escondido(s)";
    toast.success(
      mode === "delaudio"
        ? `Áudios sem som excluídos (${checked.length} trecho(s) em ${n} clipe(s)) 🎬`
        : `${checked.length} trecho(s) ${verb} em ${n} clipe(s) 🎬`,
      {
        description:
          mode === "both"
            ? "Os clipes da frente NÃO se mexeram — use \"Juntar\" na barra da timeline se quiser emendar."
            : mode === "audio"
              ? isVideo
                ? "O vídeo continua passando, mas sem som nesses trechos. A Vassoura (barra da timeline) apaga os sem som de uma vez."
                : "O tempo continua, mas esses trechos ficam sem som nenhum. A Vassoura (barra da timeline) apaga os sem som de uma vez."
              : mode === "delaudio"
                ? "Os vídeos continuam passando (sem som nos trechos) e TODO clipe de áudio sem som foi apagado."
                : "A tela ficou preta nesses trechos, mas o áudio continua.",
      }
    );
    setSpans(null);
    onOpenChange(false);
  }

  const modes: { id: Mode; label: string; hint: string; icon: React.ReactNode }[] = [
    {
      id: "both",
      label: isVideo ? "Excluir cena + áudio" : "Excluir o trecho",
      hint: "o trecho some inteiro (cortado)",
      icon: <Trash2 className="h-3.5 w-3.5" />,
    },
    {
      id: "delaudio",
      label: "Excluir só o áudio",
      hint: "vídeo continua passando; todo áudio sem som é apagado",
      icon: <AudioLinesOff className="h-3.5 w-3.5 text-red-400" />,
    },
    {
      id: "audio",
      label: isVideo ? "Só silenciar o áudio" : "Silenciar o trecho",
      hint: isVideo ? "vídeo continua, som some no trecho" : "o tempo continua passando, mas sem som",
      icon: <VolumeX className="h-3.5 w-3.5" />,
    },
    ...(isVideo
      ? [{ id: "scene" as Mode, label: "Só esconder a cena", hint: "tela preta, mas o áudio continua", icon: <EyeOff className="h-3.5 w-3.5" /> }]
      : []),
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AudioLines className="h-4 w-4 text-[#22C55E]" /> Detector de cenas sem áudio
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Analiso o áudio <b className="text-zinc-400">aqui no seu navegador</b> (sem IA, sem nuvem), acho os trechos em
            que ninguém fala e corto pra você decidir o que fazer com cada um.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-2.5">
            <span className="shrink-0 text-xs text-zinc-400">Arquivo analisado</span>
            <span className="min-w-0 truncate text-xs font-medium text-zinc-200" title={sourceMedia?.name}>
              {sourceMedia ? sourceMedia.name : "nenhum clipe"}
            </span>
          </div>
          {sameFileClips.length > 1 && (
            <p className="flex items-start gap-2 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/[0.07] p-2.5 text-[11px] leading-relaxed text-[#86efac]">
              <AudioLines className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Este arquivo aparece em <b>{sameFileClips.length} clipes</b> da timeline — o corte vale em{" "}
              <b>todos eles</b> (antes sobravam pedaços inteiros pra frente).
            </p>
          )}

          {!source && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Selecione um clipe de vídeo ou áudio na timeline antes de detectar.
            </p>
          )}

          {/* sensibilidade */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-300">Sensibilidade</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SENSITIVITY_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => { setPreset(p.id); setMinDur(p.opts.minDuration); }}
                  className={`rounded-md border px-2 py-1.5 text-center transition ${
                    preset === p.id ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#2a3546] hover:border-[#3a4759]"
                  }`}
                  title={p.hint}
                >
                  <span className={`block text-[11px] font-semibold ${preset === p.id ? "text-[#22C55E]" : "text-zinc-300"}`}>{p.label}</span>
                  <span className="block text-[9px] leading-tight text-zinc-500">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* duração mínima */}
          <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-zinc-400">Duração mínima do silêncio</span>
              <span className="font-mono text-[11px] text-[#22C55E]">{minDur.toFixed(2)}s</span>
            </div>
            <Slider value={[minDur]} min={0.2} max={2} step={0.05} onValueChange={(v) => setMinDur(v[0])} aria-label="Duração mínima" />
            <p className="mt-1 text-[10px] text-zinc-600">Pausas menores que isso são ignoradas (respiro natural da fala).</p>
          </div>

          <Button
            onClick={() => void detect()}
            disabled={busy || !source}
            className="w-full gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
            {busy ? "Analisando o áudio…" : spans === null ? "Detectar silêncio" : "Detectar de novo"}
          </Button>

          {/* resultado */}
          {spans !== null && spans.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-300">{spans.length} trecho(s) sem som</p>
                <button
                  type="button"
                  className="text-[10px] text-[#22C55E] hover:underline"
                  onClick={() => setSpans((ss) => (ss ? ss.map((s) => ({ ...s, on: ss.every((x) => x.on) ? false : true })) : ss))}
                >
                  {spans.every((s) => s.on) ? "Desmarcar tudo" : "Marcar tudo"}
                </button>
              </div>
              <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                {spans.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSpans((ss) => (ss ? ss.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) : ss))}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition ${
                      s.on ? "border-[#22C55E]/50 bg-[#22C55E]/5" : "border-[#2a3546] opacity-60"
                    }`}
                  >
                    {s.on ? <CheckSquare className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" /> : <Square className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
                    <span className="font-mono text-[10px] text-zinc-300">
                      {fmtTime(s.start)} → {fmtTime(s.end)}
                    </span>
                    <span className="ml-auto rounded bg-[#1c2430] px-1.5 py-0.5 font-mono text-[9px] text-amber-300">{(s.end - s.start).toFixed(2)}s</span>
                    <span
                      role="button"
                      tabIndex={0}
                      title="Pular pra esse trecho"
                      aria-label="Ouvir trecho"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!source) return;
                        // tempo no arquivo → tempo da timeline (no clipe analisado)
                        const speed = source.speed || 1;
                        const t = source.start + Math.max(0, (s.start - source.inPoint) / speed) + 0.02;
                        engine.seek(Math.min(t, usePlayback.getState().duration));
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter" && source) engine.seek(source.start + Math.max(0, (s.start - source.inPoint) / (source.speed || 1))); }}
                      className="rounded p-0.5 text-zinc-500 hover:text-[#22C55E]"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>

              {/* o que fazer com os trechos */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-zinc-300">O que fazer com os trechos marcados?</p>
                <div className="space-y-1.5">
                  {modes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                        mode === m.id ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#2a3546] hover:border-[#3a4759]"
                      }`}
                    >
                      <span className={mode === m.id ? "text-[#22C55E]" : "text-zinc-500"}>{m.icon}</span>
                      <span className="flex-1">
                        <span className={`block text-[11px] font-medium ${mode === m.id ? "text-[#22C55E]" : "text-zinc-300"}`}>{m.label}</span>
                        <span className="block text-[9px] text-zinc-500">{m.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {mode === "both" && (
                  <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
                    ⚠️ Os clipes da frente <b className="text-zinc-400">NÃO se movem</b> pra preencher o buraco (como você
                    pediu). Se quiser emendar, use o botão <b className="text-zinc-400">Juntar</b> da barra da timeline.
                  </p>
                )}
                {mode === "delaudio" && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
                    <Eraser className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                    Nos <b className="text-zinc-400">vídeos</b> o trecho fica mudo (a cena continua); nos clipes de{" "}
                    <b className="text-zinc-400">áudio puro</b> o trecho some — e a vassoura ainda leva qualquer outro áudio
                    sem som que já existia no projeto.
                  </p>
                )}
                {mode === "audio" && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
                    <Eraser className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                    Depois disso a <b className="text-zinc-400">Vassoura</b> (barra da timeline) apaga todos os clipes sem
                    som de uma vez — e “Fechar espaços desta faixa” emenda o que sobrar.
                  </p>
                )}
              </div>
            </div>
          )}

          {spans !== null && spans.length === 0 && (
            <p className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-3 text-center text-[11px] text-zinc-500">
              Nenhum trecho mudo achado com essa sensibilidade. Tenta <b className="text-zinc-400">Agressivo</b> ou{" "}
              <b className="text-zinc-400">Tudo</b>, ou reduzir a duração mínima.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
            Cancelar
          </Button>
          <Button onClick={apply} disabled={busy || !checked.length} className="gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]">
            <Scissors className="h-4 w-4" />
            Aplicar em {checked.length} trecho(s) · {totalSel.toFixed(1)}s
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
