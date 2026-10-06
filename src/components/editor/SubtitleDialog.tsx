// GalaxyCut — diálogo de legendas automáticas com personalização completa estilo CapCut (v7.8)
"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useProject } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { transcribeTimeline, transcribe, SubSegment, useSubtitleJob, WhisperProgress, cancelTranscription, WhisperModelId } from "@/lib/editor/subtitles";
import { CAPTION_PRESETS, CaptionPreset, makeClip, defaultTextProps, TextProps, FONTS } from "@/lib/editor/types";
import { useT } from "@/lib/editor/i18n";
import { PresetPreview } from "./PresetPreview";
import { toast } from "sonner";
import {
  Sparkles, Loader2, CheckCircle2, TriangleAlert, Cpu, Palette, Layers, Minus, XCircle,
  Type, MoveVertical, Sliders, Bold, Italic, CaseUpper, Check
} from "lucide-react";

// Paletas de cores para pré-seleção rápida
const TEXT_COLORS = [
  "#FFFFFF", "#FACC15", "#22C55E", "#38BDF8", "#F43F5E", "#FB923C", "#EF4444", "#A855F7", "#000000"
];

const HIGHLIGHT_COLORS = [
  "#FACC15", "#22C55E", "#00E5FF", "#EC4899", "#FF5722", "#FFFFFF", "#A855F7", "#EAB308"
];

const STROKE_COLORS = [
  "#000000", "#FFFFFF", "#78350F", "#0F172A", "#7F1D1D", "#3B0764", "#064E3B"
];

const BG_COLORS = [
  { val: "", label: "Nenhum" },
  { val: "#00000099", label: "Preto 60%" },
  { val: "#000000", label: "Preto 100%" },
  { val: "#FACC15", label: "Amarelo" },
  { val: "#DC2626", label: "Vermelho" },
  { val: "#1D4ED8", label: "Azul" },
  { val: "#7E22CE", label: "Roxo" },
];

const LANGS = [
  { v: "auto", label: "🌐 Automático" },
  { v: "pt", label: "Português" },
  { v: "en", label: "English" },
  { v: "es", label: "Español" },
  { v: "fr", label: "Français" },
  { v: "de", label: "Deutsch" },
  { v: "it", label: "Italiano" },
  { v: "ja", label: "日本語" },
  { v: "ko", label: "한국어" },
  { v: "ru", label: "Русский" },
  { v: "zh", label: "中文" },
  { v: "ar", label: "العربية" },
];

export function SubtitleDialog() {
  const clips = useProject((s) => s.clips);
  const selectedId = useProject((s) => s.selectedId);
  const model = useSettings((s) => s.whisperModel);
  const presetId = useSettings((s) => s.captionPreset);
  const maxWords = useSettings((s) => s.captionMaxWords);
  const captionPos = useSettings((s) => s.captionPos) ?? { x: 0, y: 0.62 };
  const setSettings = useSettings((s) => s.set);
  const job = useSubtitleJob();
  const [lang, setLang] = useState("pt");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const t = useT();

  const [activeTab, setActiveTab] = useState<"presets" | "customize">("presets");

  // Estado local do estilo personalizado (iniciado com o preset atual)
  const [customStyle, setCustomStyle] = useState<TextProps>(() => {
    const base = defaultTextProps();
    const p = CAPTION_PRESETS.find((x) => x.id === presetId) ?? CAPTION_PRESETS[0];
    return { ...base, ...p.props };
  });

  // Atualiza customStyle quando o preset mudar
  const handleSelectPreset = (p: CaptionPreset) => {
    setSettings({ captionPreset: p.id });
    setCustomStyle((prev) => ({
      ...prev,
      ...p.props,
    }));
  };

  const updateStyle = (patch: Partial<TextProps>) => {
    setCustomStyle((prev) => ({ ...prev, ...patch }));
  };

  // Clipes alvo para transcrição (padrão: TODOS os clipes de áudio/vídeo da timeline)
  const selectedClip = useMemo(() => {
    return clips.find((c) => c.id === selectedId && (c.kind === "video" || c.kind === "audio") && c.mediaId);
  }, [clips, selectedId]);

  const targetClips = useMemo(() => {
    if (scope === "selected" && selectedClip) {
      return [selectedClip];
    }
    return clips
      .filter((c) => (c.kind === "video" || c.kind === "audio") && !c.videoHidden && !c.muted && c.mediaId)
      .sort((a, b) => a.start - b.start);
  }, [clips, scope, selectedClip]);

  const totalDuration = useMemo(() => {
    if (!targetClips.length) return 0;
    return Math.max(...targetClips.map((c) => c.start + c.duration));
  }, [targetClips]);

  const modelLabel = (id: WhisperModelId) =>
    id === "tiny" ? t("sub.modelFast") : id === "base" ? t("sub.modelBalanced") : t("sub.modelAccurate");
  const modelHint = (id: WhisperModelId) =>
    id === "tiny" ? t("sub.modelFastHint") : id === "base" ? t("sub.modelBalancedHint") : t("sub.modelAccurateHint");

  async function generate() {
    if (targetClips.length === 0) {
      toast.error("Nenhum clipe com som encontrado na timeline.");
      return;
    }
    job.start();
    try {
      const segs = await transcribeTimeline(
        targetClips,
        totalDuration,
        lang,
        (p: WhisperProgress) => useSubtitleJob.getState().setProg(p),
        model,
        maxWords
      );
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
    const textTrack = st.tracks.find((t) => t.kind === "text") || st.tracks[0];
    if (!textTrack) return;
    const pos = useSettings.getState().captionPos ?? { x: 0, y: 0.62 };
    const newClips = segs.map((s) =>
      makeClip({
        kind: "text",
        trackId: textTrack.id,
        start: Math.max(0, s.start),
        duration: Math.max(0.4, s.end - s.start),
        inPoint: 0,
        outPoint: Math.max(0.4, s.end - s.start),
        x: pos.x,
        y: pos.y,
        posLock: false,
        isCaption: true,
        text: {
          ...customStyle,
          content: customStyle.uppercase ? s.text.toUpperCase() : s.text,
          words: s.words,
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

  return (
    <Dialog
      open={job.open}
      onOpenChange={(v) => {
        if (!v && job.running) job.setMinimized(true);
        job.setOpen(v);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Sparkles className="h-5 w-5 text-[var(--gc-accent)]" /> {t("sub.title")}
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
          <DialogDescription className="text-zinc-500">
            Transcreva o áudio com IA e personalize as legendas com estilos estilo CapCut
          </DialogDescription>
        </DialogHeader>

        {/* Pré-visualização em tempo real do estilo selecionado */}
        <div className="relative overflow-hidden rounded-xl border border-[#2a3546] bg-[#090d14] p-3 text-center shadow-inner">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between px-1">
            <span>Pré-visualização do Estilo</span>
            <span className="text-[var(--gc-accent)]">Tempo Real</span>
          </div>
          <div className="py-2">
            <PresetPreview tp={customStyle} height={44} previewText={{ w1: "GalaxyCut", w2: "Legenda" }} />
          </div>
        </div>

        <div className="space-y-3.5 py-1">
          {/* Origem e Idioma */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col justify-center rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-1.5">
              <span className="text-[10px] text-zinc-500">{t("sub.source")}</span>
              <Select value={scope} onValueChange={(v: "all" | "selected") => setScope(v)} disabled={job.running}>
                <SelectTrigger className="h-7 w-full border-[#2a3546] bg-[#121722] text-xs text-zinc-200 p-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[#232d3d] bg-[#121722] text-zinc-200">
                  <SelectItem value="all" className="text-xs">
                    🌐 Timeline Completa ({targetClips.length} clipes, {Math.round(totalDuration)}s)
                  </SelectItem>
                  {selectedClip && (
                    <SelectItem value="selected" className="text-xs">
                      🎯 Clipe Selecionado ({Math.round(selectedClip.duration)}s)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col justify-center rounded-lg border border-[#2a3546] bg-[#0e1320] px-3 py-1.5">
              <span className="text-[10px] text-zinc-500">{t("sub.language")}</span>
              <Select value={lang} onValueChange={setLang} disabled={job.running}>
                <SelectTrigger className="h-7 w-full border-[#2a3546] bg-[#121722] text-xs text-zinc-200 p-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 border-[#232d3d] bg-[#121722] text-zinc-200">
                  {LANGS.map((l) => (
                    <SelectItem key={l.v} value={l.v} className="text-xs">
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Abas: Presets vs Personalizar */}
          <div className="flex rounded-lg border border-[#2a3546] bg-[#0e1320] p-1">
            <button
              type="button"
              onClick={() => setActiveTab("presets")}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                activeTab === "presets"
                  ? "bg-[var(--gc-accent)] text-black shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              ✨ Presets Prontos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("customize")}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition ${
                activeTab === "customize"
                  ? "bg-[var(--gc-accent)] text-black shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🎨 Personalizar Cores & Fonte
            </button>
          </div>

          {activeTab === "presets" ? (
            /* Grade de Presets */
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
                <Palette className="h-3.5 w-3.5" /> Escolha o estilo da legenda:
              </p>
              <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-1">
                {CAPTION_PRESETS.map((p) => {
                  const isSel = presetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={job.running}
                      onClick={() => handleSelectPreset(p)}
                      className={`relative flex flex-col items-center gap-1 rounded-lg border p-1.5 transition ${
                        isSel
                          ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] shadow-[0_0_12px_var(--gc-accent-20)]"
                          : "border-[#2a3546] hover:border-[#3a4759] bg-[#0e1320]"
                      }`}
                      title={p.name}
                    >
                      {isSel && (
                        <span className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--gc-accent)] text-[9px] font-bold text-black">
                          ✓
                        </span>
                      )}
                      <PresetPreview tp={p.props} height={32} />
                      <span className={`w-full truncate text-center text-[9px] font-medium ${isSel ? "text-[var(--gc-accent)]" : "text-zinc-400"}`}>
                        {p.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Painel de Personalização Completa */
            <div className="space-y-3 rounded-lg border border-[#2a3546] bg-[#0e1320] p-3 text-xs max-h-72 overflow-y-auto pr-1.5">
              {/* Comportamento da palavra ativa */}
              <div>
                <Label className="text-[11px] font-semibold text-zinc-300 mb-1.5 block">
                  Tipo de Animação / Destaque:
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "none", label: "🔇 Seca (Sem saltos)", desc: "Estática" },
                    { id: "colorOnly", label: "🎵 Karaokê Suave", desc: "Muda só a cor" },
                    { id: "pop", label: "⚡ Pop Dinâmico", desc: "Salto CapCut" },
                    { id: "box", label: "🔲 Caixa na Palavra", desc: "Tarja ativa" },
                    { id: "glow", label: "💡 Brilho Neon", desc: "Aura neon" },
                    { id: "bounce", label: "🏀 Pulo / Bounce", desc: "Pula na fala" },
                  ].map((anim) => {
                    const isSel = customStyle.highlightAnim === anim.id;
                    return (
                      <button
                        key={anim.id}
                        type="button"
                        onClick={() => {
                          updateStyle({
                            highlightAnim: anim.id as any,
                            highlight: anim.id !== "none",
                            highlightScale: anim.id === "none" || anim.id === "colorOnly" || anim.id === "box" ? 1.0 : 1.2,
                          });
                        }}
                        className={`rounded-md border p-1.5 text-left transition ${
                          isSel
                            ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]"
                            : "border-[#2a3546] bg-[#121722] text-zinc-400 hover:border-[#3a4759]"
                        }`}
                      >
                        <span className="block text-[10px] font-bold">{anim.label}</span>
                        <span className="block text-[8px] text-zinc-500">{anim.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cor do Texto com Paleta Rápida */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-[11px] text-zinc-400">Cor do Texto Principal:</Label>
                  <input
                    type="color"
                    value={customStyle.color || "#FFFFFF"}
                    onChange={(e) => updateStyle({ color: e.target.value })}
                    className="h-5 w-8 cursor-pointer rounded border border-[#2a3546] bg-transparent p-0.5"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {TEXT_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateStyle({ color: hex })}
                      style={{ backgroundColor: hex }}
                      className={`h-5 w-5 rounded-md border transition ${
                        customStyle.color === hex ? "border-white ring-2 ring-[var(--gc-accent)] scale-110" : "border-zinc-700 hover:scale-105"
                      }`}
                      title={hex}
                    />
                  ))}
                </div>
              </div>

              {/* Cor de Destaque da Palavra Ativa */}
              {customStyle.highlightAnim !== "none" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[11px] text-zinc-400">Cor de Destaque (Palavra Ativa):</Label>
                    <input
                      type="color"
                      value={customStyle.highlightColor || "#FACC15"}
                      onChange={(e) => updateStyle({ highlightColor: e.target.value })}
                      className="h-5 w-8 cursor-pointer rounded border border-[#2a3546] bg-transparent p-0.5"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {HIGHLIGHT_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => updateStyle({ highlightColor: hex })}
                        style={{ backgroundColor: hex }}
                        className={`h-5 w-5 rounded-md border transition ${
                          customStyle.highlightColor === hex ? "border-white ring-2 ring-[var(--gc-accent)] scale-110" : "border-zinc-700 hover:scale-105"
                        }`}
                        title={hex}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Contorno (Stroke) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-[11px] text-zinc-400">Contorno / Traço:</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-400">{customStyle.strokeW || 0}px</span>
                    <input
                      type="color"
                      value={customStyle.strokeColor || "#000000"}
                      onChange={(e) => updateStyle({ strokeColor: e.target.value })}
                      className="h-5 w-8 cursor-pointer rounded border border-[#2a3546] bg-transparent p-0.5"
                    />
                  </div>
                </div>
                <Slider
                  value={[customStyle.strokeW || 0]}
                  min={0}
                  max={20}
                  step={1}
                  onValueChange={(v) => updateStyle({ strokeW: v[0] })}
                  className="py-1 mb-1.5"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {STROKE_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateStyle({ strokeColor: hex, strokeW: customStyle.strokeW || 8 })}
                      style={{ backgroundColor: hex }}
                      className={`h-5 w-5 rounded-md border transition ${
                        customStyle.strokeColor === hex ? "border-white ring-2 ring-[var(--gc-accent)] scale-110" : "border-zinc-700 hover:scale-105"
                      }`}
                      title={hex}
                    />
                  ))}
                </div>
              </div>

              {/* Fundo / Tarja (Background) */}
              <div>
                <Label className="text-[11px] text-zinc-400 mb-1 block">Fundo / Tarja:</Label>
                <div className="grid grid-cols-4 gap-1">
                  {BG_COLORS.map((bg) => {
                    const isSel = (customStyle.bg || "") === bg.val;
                    return (
                      <button
                        key={bg.label}
                        type="button"
                        onClick={() => updateStyle({ bg: bg.val, bgPad: bg.val ? 18 : 0, bgRadius: 8 })}
                        className={`rounded border p-1 text-[9px] truncate transition ${
                          isSel
                            ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-bold"
                            : "border-[#2a3546] bg-[#121722] text-zinc-400 hover:border-[#3a4759]"
                        }`}
                      >
                        {bg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Fonte e Formatação */}
              <div className="space-y-2 pt-1 border-t border-[#2a3546]">
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <Select
                    value={customStyle.font}
                    onValueChange={(v) => updateStyle({ font: v })}
                  >
                    <SelectTrigger className="h-8 border-[#2a3546] bg-[#121722] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 border-[#232d3d] bg-[#121722] text-zinc-200">
                      {FONTS.map((f) => (
                        <SelectItem key={f.value} value={f.value} className="text-xs">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateStyle({ bold: !customStyle.bold })}
                      className={`h-8 w-8 rounded border text-xs font-bold transition flex items-center justify-center ${
                        customStyle.bold ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400"
                      }`}
                      title="Negrito"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStyle({ italic: !customStyle.italic })}
                      className={`h-8 w-8 rounded border text-xs italic transition flex items-center justify-center ${
                        customStyle.italic ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400"
                      }`}
                      title="Itálico"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStyle({ uppercase: !customStyle.uppercase })}
                      className={`h-8 w-8 rounded border text-[10px] font-bold transition flex items-center justify-center ${
                        customStyle.uppercase ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400"
                      }`}
                      title="CAIXA ALTA"
                    >
                      TT
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-zinc-400">Tamanho da Letra:</Label>
                  <span className="text-[11px] font-mono text-[var(--gc-accent)]">{customStyle.size || 64}px</span>
                </div>
                <Slider
                  value={[customStyle.size || 64]}
                  min={30}
                  max={120}
                  step={2}
                  onValueChange={(v) => updateStyle({ size: v[0] })}
                  className="py-1"
                />
              </div>
            </div>
          )}

          {/* Palavras por Bloco & Posição */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-2">
              <span className="block text-[10px] font-medium text-zinc-400 mb-1.5 flex items-center gap-1">
                <Layers className="h-3 w-3" /> Palavras por Bloco:
              </span>
              <div className="grid grid-cols-4 gap-1">
                {([1, 2, 3, 4] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={job.running}
                    onClick={() => setSettings({ captionMaxWords: n })}
                    className={`rounded border py-1 text-center transition ${
                      maxWords === n ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-bold text-xs" : "border-[#2a3546] text-zinc-400 text-xs"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-2">
              <span className="block text-[10px] font-medium text-zinc-400 mb-1.5 flex items-center gap-1">
                <MoveVertical className="h-3 w-3" /> Posição na Tela:
              </span>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: "Baixo", y: 0.62 },
                  { label: "Centro", y: 0.00 },
                  { label: "Topo", y: -0.60 },
                ].map((pos) => {
                  const isSel = Math.abs(captionPos.y - pos.y) < 0.15;
                  return (
                    <button
                      key={pos.label}
                      type="button"
                      onClick={() => setSettings({ captionPos: { x: 0, y: pos.y } })}
                      className={`rounded border py-1 text-center transition text-xs ${
                        isSel ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] font-bold" : "border-[#2a3546] text-zinc-400"
                      }`}
                    >
                      {pos.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {targetClips.length === 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("sub.noClipHint")}
            </p>
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
                {job.stage === "transcribe" && job.perWinSec
                  ? t("sub.runningEta", { s: job.perWinSec, left: Math.max(0, (job.windows ?? 1) - (job.window ?? 1) + 1) })
                  : t("sub.runningNote", { model: modelLabel(model), hint: modelHint(model) })}
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
                cancelTranscription();
              }}
              className="gap-1.5 border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="h-4 w-4" /> {t("sub.cancelTranscribe")}
            </Button>
          ) : (
            <Button
              onClick={() => void generate()}
              disabled={targetClips.length === 0}
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
