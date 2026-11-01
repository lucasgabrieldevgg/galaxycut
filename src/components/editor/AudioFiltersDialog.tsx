// GalaxyCut — Filtros de Áudio estilo OBS Studio (Passa-Alta, Compressor, Limitador, Ganho, Noise Gate)
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Sliders, Volume2, ShieldAlert, Waves, Sparkles, RefreshCw } from "lucide-react";
import { AudioFilterConfig, DEFAULT_AUDIO_FILTERS } from "@/lib/editor/types";
import { VOICE_FX, PITCH_FX, type VoiceFxId, type VoiceFxParams } from "@/lib/editor/voiceFx";
import { useT } from "@/lib/editor/i18n";

interface AudioFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters?: AudioFilterConfig;
  onApply: (filters: AudioFilterConfig) => void;
  title?: string;
  description?: string;
  /** efeito de voz do clipe — vale no preview E na exportação */
  voiceFx?: VoiceFxId | null;
  onVoiceFx?: (id: VoiceFxId | null) => void;
  /** parâmetros do efeito de voz (intensidade/tonalidade) */
  voiceFxParams?: VoiceFxParams | null;
  onVoiceFxParams?: (p: VoiceFxParams | null) => void;
}

const PRESETS: { id: string; name: string; desc: string; config: AudioFilterConfig }[] = [
  {
    id: "obs_default",
    name: "Padrão OBS Studio (Voz Clara)",
    desc: "Passa-alta 85Hz + Compressor suave (-24dB, 3.5:1) + Limitador -1.5dB",
    config: {
      enabled: true,
      highpassEnabled: true,
      highpassFrequency: 85,
      compressorEnabled: true,
      compressorThreshold: -24,
      compressorRatio: 3.5,
      compressorAttack: 6,
      compressorRelease: 250,
      compressorMakeupGain: 2,
      limiterEnabled: true,
      limiterThreshold: -1.5,
      limiterRelease: 100,
      gainDb: 0,
      noiseGateEnabled: false,
      noiseGateThreshold: -40,
    },
  },
  {
    id: "podcast_pro",
    name: "Podcast & Locução Profissional",
    desc: "Voz encorpada, volume consistente e presença em frequências médias",
    config: {
      enabled: true,
      highpassEnabled: true,
      highpassFrequency: 80,
      compressorEnabled: true,
      compressorThreshold: -18,
      compressorRatio: 4.0,
      compressorAttack: 5,
      compressorRelease: 200,
      compressorMakeupGain: 3.5,
      limiterEnabled: true,
      limiterThreshold: -1.0,
      limiterRelease: 80,
      gainDb: 1,
      noiseGateEnabled: true,
      noiseGateThreshold: -42,
    },
  },
  {
    id: "noise_aggressive",
    name: "Redução Agressiva de Ruído",
    desc: "Corta ruídos graves de vento/ventilador e comprime ruídos de fundo",
    config: {
      enabled: true,
      highpassEnabled: true,
      highpassFrequency: 120,
      compressorEnabled: true,
      compressorThreshold: -28,
      compressorRatio: 5.0,
      compressorAttack: 4,
      compressorRelease: 180,
      compressorMakeupGain: 4,
      limiterEnabled: true,
      limiterThreshold: -2.0,
      limiterRelease: 100,
      gainDb: 0,
      noiseGateEnabled: true,
      noiseGateThreshold: -34,
    },
  },
  {
    id: "natural_clean",
    name: "Gravação Limpa & Natural",
    desc: "Apenas corte sutil de sub-graves sem compressão pesada",
    config: {
      enabled: true,
      highpassEnabled: true,
      highpassFrequency: 60,
      compressorEnabled: true,
      compressorThreshold: -12,
      compressorRatio: 2.0,
      compressorAttack: 10,
      compressorRelease: 300,
      compressorMakeupGain: 1,
      limiterEnabled: true,
      limiterThreshold: -0.5,
      limiterRelease: 120,
      gainDb: 0,
      noiseGateEnabled: false,
      noiseGateThreshold: -45,
    },
  },
];

export function AudioFiltersDialog({
  open,
  onOpenChange,
  filters = DEFAULT_AUDIO_FILTERS,
  onApply,
  title = "Filtros de Áudio (Estilo OBS Studio)",
  description = "Ajuste os processadores de sinal (DSP) em tempo real para tratar ruídos e dar presença de estúdio.",
  voiceFx = null,
  onVoiceFx,
  voiceFxParams = null,
  onVoiceFxParams,
}: AudioFiltersDialogProps) {
  const t = useT();
  const [config, setConfig] = useState<AudioFilterConfig>({ ...DEFAULT_AUDIO_FILTERS, ...filters });
  const [activeTab, setActiveTab] = useState<"presets" | "custom">("presets");

  const applyPreset = (presetConfig: AudioFilterConfig) => {
    const updated = { ...presetConfig, enabled: true };
    setConfig(updated);
  };

  const resetDefaults = () => {
    setConfig({ ...DEFAULT_AUDIO_FILTERS });
  };

  const handleSave = () => {
    onApply(config);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto border-[#232d3d] bg-[#10141d] text-zinc-200">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Sliders className="h-4 w-4 text-[var(--gc-accent)]" /> {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-400">{description}</DialogDescription>
        </DialogHeader>

        {/* v9.1: o interruptor saiu do cabeçalho — ficava colado no X de fechar.
            Agora é uma linha do corpo, com espaço de sobra pra clicar. */}
        <div className="mb-2 flex items-center justify-between rounded-lg border border-[#232d3d] bg-[#0e1320] px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Waves className="h-3.5 w-3.5 text-sky-400" />
            {t("vfx.enableFilters")}
          </span>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
          />
        </div>

        {/* Efeitos de voz — timbre do clipe (o mesmo grafo roda no preview e na exportação) */}
        {onVoiceFx && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("vfx.title")}</p>
            <div className="grid max-h-36 grid-cols-3 gap-1.5 overflow-y-auto rounded-md border border-[#1c2430] bg-[#0a0f18] p-1.5">
              <VoiceFxBtn active={voiceFx == null} onClick={() => onVoiceFx(null)} label={t("vfx.none")} title={t("vfx.note")} />
              {VOICE_FX.map((fx) => (
                <VoiceFxBtn
                  key={fx.id}
                  active={voiceFx === fx.id}
                  onClick={() => onVoiceFx(fx.id)}
                  label={t(fx.nameKey)}
                  title={t(fx.descKey)}
                />
              ))}
            </div>
            {voiceFx && onVoiceFxParams && (
              <div className="mt-2 space-y-2 rounded-md border border-[#1c2430] bg-[#0e1320] p-2">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span>{t("vfx.intensity")}</span>
                    <span className="font-mono text-[var(--gc-accent)]">{Math.round((voiceFxParams?.intensity ?? 1) * 100)}%</span>
                  </div>
                  <Slider
                    value={[voiceFxParams?.intensity ?? 1]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={(v) => onVoiceFxParams({ ...(voiceFxParams ?? {}), intensity: v[0] })}
                    className="mt-1"
                  />
                </div>
                {PITCH_FX.has(voiceFx) && (
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>{t("vfx.tone")}</span>
                      <span className="font-mono text-[var(--gc-accent)]">{(voiceFxParams?.pitch ?? 0) > 0 ? "+" : ""}{voiceFxParams?.pitch ?? 0} st</span>
                    </div>
                    <Slider
                      value={[voiceFxParams?.pitch ?? 0]}
                      min={-12}
                      max={12}
                      step={1}
                      onValueChange={(v) => onVoiceFxParams({ intensity: voiceFxParams?.intensity ?? 1, pitch: v[0] })}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Abas */}
        <div className="flex border-b border-[#1f2837] mb-2">
          <button
            type="button"
            className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "presets"
                ? "border-[var(--gc-accent)] text-[var(--gc-accent)]"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => setActiveTab("presets")}
          >
            <Sparkles className="inline-block h-3.5 w-3.5 mr-1" /> Presets Rápidos
          </button>
          <button
            type="button"
            className={`px-4 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "custom"
                ? "border-[var(--gc-accent)] text-[var(--gc-accent)]"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
            onClick={() => setActiveTab("custom")}
          >
            <Sliders className="inline-block h-3.5 w-3.5 mr-1" /> Configurações Detalhadas (OBS)
          </button>
        </div>

        {activeTab === "presets" && (
          <div className="space-y-2 py-1">
            {PRESETS.map((p) => {
              const isMatch =
                config.highpassFrequency === p.config.highpassFrequency &&
                config.compressorThreshold === p.config.compressorThreshold &&
                config.compressorRatio === p.config.compressorRatio;
              return (
                <div
                  key={p.id}
                  onClick={() => applyPreset(p.config)}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    isMatch
                      ? "border-[var(--gc-accent)] bg-[var(--gc-accent)]/10"
                      : "border-[#1e2638] bg-[#141a26] hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200">{p.name}</span>
                    {isMatch && (
                      <span className="rounded bg-[var(--gc-accent)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--gc-accent)]">
                        Ativo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400 leading-snug">{p.desc}</p>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "custom" && (
          <div className="space-y-4 py-1">
            {/* 1. Filtro Passa-Alta */}
            <div className="rounded-lg border border-[#1e2638] bg-[#141a26] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Waves className="h-4 w-4 text-emerald-400" />
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">Filtro Passa-Alta (Corte de Graves)</h4>
                    <p className="text-[10px] text-zinc-400">Elimina ruídos de ar condicionado, batidas no microfone e vento</p>
                  </div>
                </div>
                <Switch
                  checked={config.highpassEnabled}
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, highpassEnabled: v }))}
                />
              </div>

              {config.highpassEnabled && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] text-zinc-300">
                    <span>Frequência de Corte</span>
                    <span className="font-mono text-[var(--gc-accent)]">{config.highpassFrequency} Hz</span>
                  </div>
                  <Slider
                    value={[config.highpassFrequency]}
                    min={20}
                    max={300}
                    step={5}
                    onValueChange={(val) => setConfig((c) => ({ ...c, highpassFrequency: val[0] }))}
                  />
                  <div className="flex justify-between text-[9px] text-zinc-500">
                    <span>20 Hz (Sutil)</span>
                    <span>85 Hz (Padrão OBS)</span>
                    <span>300 Hz (Agressivo)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Compressor */}
            <div className="rounded-lg border border-[#1e2638] bg-[#141a26] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-sky-400" />
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">Compressor de Dinâmica</h4>
                    <p className="text-[10px] text-zinc-400">Nivela partes altas e sussurros, deixando a voz com volume estável</p>
                  </div>
                </div>
                <Switch
                  checked={config.compressorEnabled}
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, compressorEnabled: v }))}
                />
              </div>

              {config.compressorEnabled && (
                <div className="space-y-3 pt-1">
                  {/* Limiar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-zinc-300">
                      <span>Limiar (Threshold)</span>
                      <span className="font-mono text-[var(--gc-accent)]">{config.compressorThreshold} dB</span>
                    </div>
                    <Slider
                      value={[config.compressorThreshold]}
                      min={-60}
                      max={0}
                      step={1}
                      onValueChange={(val) => setConfig((c) => ({ ...c, compressorThreshold: val[0] }))}
                    />
                  </div>

                  {/* Proporção */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-zinc-300">
                      <span>Proporção (Ratio)</span>
                      <span className="font-mono text-[var(--gc-accent)]">{config.compressorRatio.toFixed(1)}:1</span>
                    </div>
                    <Slider
                      value={[config.compressorRatio]}
                      min={1}
                      max={20}
                      step={0.5}
                      onValueChange={(val) => setConfig((c) => ({ ...c, compressorRatio: val[0] }))}
                    />
                  </div>

                  {/* Ataque & Liberação */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-300">
                        <span>Ataque</span>
                        <span className="font-mono text-[var(--gc-accent)]">{config.compressorAttack} ms</span>
                      </div>
                      <Slider
                        value={[config.compressorAttack]}
                        min={1}
                        max={100}
                        step={1}
                        onValueChange={(val) => setConfig((c) => ({ ...c, compressorAttack: val[0] }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-300">
                        <span>Liberação</span>
                        <span className="font-mono text-[var(--gc-accent)]">{config.compressorRelease} ms</span>
                      </div>
                      <Slider
                        value={[config.compressorRelease]}
                        min={10}
                        max={1000}
                        step={10}
                        onValueChange={(val) => setConfig((c) => ({ ...c, compressorRelease: val[0] }))}
                      />
                    </div>
                  </div>

                  {/* Ganho de Saída (Makeup Gain) */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-zinc-300">
                      <span>Ganho de Saída (Makeup Gain)</span>
                      <span className="font-mono text-[var(--gc-accent)]">+{config.compressorMakeupGain} dB</span>
                    </div>
                    <Slider
                      value={[config.compressorMakeupGain]}
                      min={0}
                      max={24}
                      step={0.5}
                      onValueChange={(val) => setConfig((c) => ({ ...c, compressorMakeupGain: val[0] }))}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 3. Limitador */}
            <div className="rounded-lg border border-[#1e2638] bg-[#141a26] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200">Limitador de Picos (Limiter)</h4>
                    <p className="text-[10px] text-zinc-400">Impede que gritos ou ruídos altos estourem em 0dB causando distorção digital</p>
                  </div>
                </div>
                <Switch
                  checked={config.limiterEnabled}
                  onCheckedChange={(v) => setConfig((c) => ({ ...c, limiterEnabled: v }))}
                />
              </div>

              {config.limiterEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between text-[11px] text-zinc-300">
                    <span>Limiar de Corte</span>
                    <span className="font-mono text-[var(--gc-accent)]">{config.limiterThreshold} dB</span>
                  </div>
                  <Slider
                    value={[config.limiterThreshold]}
                    min={-20}
                    max={0}
                    step={0.5}
                    onValueChange={(val) => setConfig((c) => ({ ...c, limiterThreshold: val[0] }))}
                  />
                </div>
              )}
            </div>

            {/* 4. Ganho Geral */}
            <div className="rounded-lg border border-[#1e2638] bg-[#141a26] p-3 space-y-2">
              <div className="flex justify-between text-[11px] text-zinc-200 font-semibold">
                <span>Ganho Geral Adicional (dB)</span>
                <span className="font-mono text-[var(--gc-accent)]">
                  {config.gainDb > 0 ? `+${config.gainDb}` : config.gainDb} dB
                </span>
              </div>
              <Slider
                value={[config.gainDb]}
                min={-20}
                max={20}
                step={0.5}
                onValueChange={(val) => setConfig((c) => ({ ...c, gainDb: val[0] }))}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between border-t border-[#1f2837] pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetDefaults}
            className="text-xs text-zinc-400 hover:text-white"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Restaurar Padrões OBS
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs border-[#2c364c]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)] text-xs px-4"
            >
              Salvar Filtros
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** botãozinho de efeito de voz (grade no topo do diálogo de áudio) */
function VoiceFxBtn({
  active,
  disabled,
  onClick,
  label,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`rounded-md border px-2.5 py-1.5 text-left text-[11px] font-semibold transition ${
        disabled
          ? "cursor-not-allowed border-[#232d3d] bg-transparent text-zinc-600"
          : active
            ? "border-[var(--gc-accent)] bg-[var(--gc-accent-15)] text-[var(--gc-accent)]"
            : "border-[#232d3d] bg-[#10151d] text-zinc-300 hover:border-[#2a3546] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
