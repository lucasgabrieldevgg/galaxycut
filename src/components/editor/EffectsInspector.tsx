// GalaxyCut — Inspetor de Efeitos Visuais Contínuos (Shake, Glitch, VHS, RGB, etc.)
"use client";

import { useState } from "react";
import { useProject } from "@/lib/editor/store";
import { Clip, ClipEffect, EFFECT_CATALOG, EffectMeta, EffectType, uid } from "@/lib/editor/types";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { engine } from "@/lib/editor/playback";
import { Sparkles, Plus, Trash2, Sliders, Check, Eye, EyeOff, Clock } from "lucide-react";
import { toast } from "sonner";

export function EffectsInspector({ clip }: { clip: Clip }) {
  const addClipEffect = useProject((s) => s.addClipEffect);
  const updateClipEffect = useProject((s) => s.updateClipEffect);
  const removeClipEffect = useProject((s) => s.removeClipEffect);
  const updateClip = useProject((s) => s.updateClip);

  const effects = clip.effects || [];

  const addEffect = (meta: EffectMeta) => {
    // se já tiver esse efeito, apenas ativa
    const existing = effects.find((e) => e.type === meta.type);
    if (existing) {
      updateClipEffect(clip.id, existing.id, { enabled: true });
      toast.success(`Efeito "${meta.name}" reativado`);
    } else {
      const newEffect: ClipEffect = {
        id: uid(),
        type: meta.type,
        enabled: true,
        intensity: meta.defaultIntensity,
        speed: 1,
      };
      addClipEffect(clip.id, newEffect);
      toast.success(`Efeito "${meta.name}" adicionado!`);
    }
    engine.markDirty();
  };

  const clearAll = () => {
    updateClip(clip.id, { effects: undefined });
    engine.markDirty();
    toast.success("Todos os efeitos foram removidos");
  };

  const categories = [
    { id: "motion", label: "Impacto & Movimento" },
    { id: "retro", label: "Retrô & VHS" },
    { id: "light", label: "Luz & Brilho" },
    { id: "stylize", label: "Cinema & Estilização" },
  ] as const;

  return (
    <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-3 space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-semibold text-zinc-200">Efeitos Visuais ({effects.length})</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-6 px-2 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.3)]"
            >
              <Plus className="h-3 w-3" /> Adicionar Efeito
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 max-h-80 overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200 timeline-scroll">
            {categories.map((cat) => {
              const items = EFFECT_CATALOG.filter((e) => e.category === cat.id);
              return (
                <div key={cat.id}>
                  <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1">
                    {cat.label}
                  </DropdownMenuLabel>
                  {items.map((item) => (
                    <DropdownMenuItem
                      key={item.type}
                      onClick={() => addEffect(item)}
                      className="flex items-center gap-2 px-2 py-1.5 text-[11px] cursor-pointer hover:bg-[#1a2230] focus:bg-[#1a2230]"
                    >
                      <span className="text-sm">{item.icon}</span>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-medium text-zinc-200">{item.name}</span>
                        <span className="text-[9px] text-zinc-500 truncate">{item.description}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="bg-[#1c2430]" />
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Lista de efeitos ativos no clipe */}
      {effects.length === 0 ? (
        <div className="rounded border border-dashed border-[#232d3d] p-3 text-center">
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Nenhum efeito visual aplicado. Clique em <strong>+ Adicionar Efeito</strong> para adicionar Tremor de Câmera, Glitch, VHS, RGB Split, Vinheta, etc.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {effects.map((eff) => {
            const meta = EFFECT_CATALOG.find((m) => m.type === eff.type);
            if (!meta) return null;
            const hasSpeed = ["shake", "glitch", "vhs", "wave", "lightLeak", "flash"].includes(eff.type);

            return (
              <div
                key={eff.id}
                className={`rounded-md border p-2.5 space-y-2 transition ${
                  eff.enabled
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-[#232d3d] bg-[#121722]/50 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{meta.icon}</span>
                    <span className="text-[11px] font-semibold text-zinc-200">{meta.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={eff.enabled}
                      onCheckedChange={(v) => {
                        updateClipEffect(clip.id, eff.id, { enabled: v });
                        engine.markDirty();
                      }}
                      className="data-[state=checked]:bg-emerald-500 h-4 w-7"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        removeClipEffect(clip.id, eff.id);
                        engine.markDirty();
                        toast.success(`Efeito "${meta.name}" removido`);
                      }}
                      className="text-zinc-500 hover:text-red-400 transition"
                      title="Excluir este efeito"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {eff.enabled && (
                  <div className="space-y-2 pt-1">
                    {/* Intensidade */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span>Intensidade</span>
                        <span className="font-mono text-emerald-300">{Math.round((eff.intensity ?? 1) * 100)}%</span>
                      </div>
                      <Slider
                        value={[eff.intensity ?? 1]}
                        min={0.1}
                        max={2}
                        step={0.05}
                        onValueChange={([v]) => {
                          updateClipEffect(clip.id, eff.id, { intensity: v });
                          engine.markDirty();
                        }}
                        className="py-0.5"
                      />
                    </div>

                    {/* Velocidade (se aplicável) */}
                    {hasSpeed && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span>Velocidade / Frequência</span>
                          <span className="font-mono text-emerald-300">{(eff.speed ?? 1).toFixed(1)}×</span>
                        </div>
                        <Slider
                          value={[eff.speed ?? 1]}
                          min={0.2}
                          max={3}
                          step={0.1}
                          onValueChange={([v]) => {
                            updateClipEffect(clip.id, eff.id, { speed: v });
                            engine.markDirty();
                          }}
                          className="py-0.5"
                        />
                      </div>
                    )}

                    {/* Posicionamento de Tempo & Duração do Efeito no Clipe */}
                    <div className="pt-2 border-t border-[#1c2430] space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span className="flex items-center gap-1 font-medium text-zinc-300">
                          <Clock className="h-3 w-3 text-emerald-400" />
                          Tempo no Clipe
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            updateClipEffect(clip.id, eff.id, { start: 0, duration: undefined });
                            engine.markDirty();
                          }}
                          className="text-[9px] text-emerald-400 hover:text-emerald-300 transition hover:underline"
                        >
                          Clipe inteiro
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[9px] text-zinc-400">
                            <span>Início</span>
                            <span className="font-mono text-emerald-300">{(eff.start ?? 0).toFixed(1)}s</span>
                          </div>
                          <Slider
                            value={[eff.start ?? 0]}
                            min={0}
                            max={Math.max(0, clip.duration - 0.1)}
                            step={0.1}
                            onValueChange={([v]) => {
                              const maxDur = clip.duration - v;
                              const newDur = eff.duration !== undefined ? Math.min(eff.duration, maxDur) : undefined;
                              updateClipEffect(clip.id, eff.id, { start: v, duration: newDur });
                              engine.markDirty();
                            }}
                            className="py-0.5"
                          />
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[9px] text-zinc-400">
                            <span>Duração</span>
                            <span className="font-mono text-emerald-300">
                              {eff.duration !== undefined ? `${eff.duration.toFixed(1)}s` : "Total"}
                            </span>
                          </div>
                          <Slider
                            value={[eff.duration !== undefined ? eff.duration : (clip.duration - (eff.start ?? 0))]}
                            min={0.1}
                            max={Math.max(0.1, clip.duration - (eff.start ?? 0))}
                            step={0.1}
                            onValueChange={([v]) => {
                              const isMax = Math.abs(v - (clip.duration - (eff.start ?? 0))) < 0.05;
                              updateClipEffect(clip.id, eff.id, { duration: isMax ? undefined : v });
                              engine.markDirty();
                            }}
                            className="py-0.5"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] text-zinc-500 hover:text-red-400 transition underline"
            >
              Remover todos os efeitos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
