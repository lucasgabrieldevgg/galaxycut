// GalaxyCut — Controle de Keyframes (Quadros-chave ◆ estilo CapCut)
"use client";

import { useProject, usePlayback } from "@/lib/editor/store";
import { Clip, Keyframe, KeyframeEasing } from "@/lib/editor/types";
import { engine } from "@/lib/editor/playback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Diamond, Trash2, Plus, Sparkles, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/editor/i18n";

export function KeyframeInspector({ clip }: { clip: Clip }) {
  const t = useT();
  const playhead = usePlayback((s) => s.playhead);
  const addOrUpdateKeyframe = useProject((s) => s.addOrUpdateKeyframe);
  const deleteKeyframe = useProject((s) => s.deleteKeyframe);
  const updateClip = useProject((s) => s.updateClip);

  const tRel = Math.max(0, Math.min(clip.duration, playhead - clip.start));
  const isInsideClip = playhead >= clip.start - 0.001 && playhead <= clip.start + clip.duration + 0.001;

  const kfs = (clip.keyframes || []).slice().sort((a, b) => a.time - b.time);
  const currentKf = kfs.find((k) => Math.abs(k.time - tRel) < 0.08);

  // Navegação entre keyframes
  const prevKf = kfs.filter((k) => k.time < tRel - 0.08).pop();
  const nextKf = kfs.filter((k) => k.time > tRel + 0.08)[0];

  const jumpTo = (time: number) => {
    usePlayback.getState().seek(clip.start + time);
    engine.markDirty();
  };

  const toggleKeyframeAtPlayhead = () => {
    if (!isInsideClip) {
      toast.info("Posicione a agulha dentro do clipe para adicionar um losango ◆");
      return;
    }
    if (currentKf) {
      deleteKeyframe(clip.id, currentKf.id);
      toast.success("Losango ◆ removido neste ponto");
    } else {
      addOrUpdateKeyframe(clip.id, tRel, {
        x: clip.x,
        y: clip.y,
        scale: clip.scale,
        rotation: clip.rotation,
        opacity: clip.opacity,
        blur: clip.blur,
        brightness: clip.brightness,
        contrast: clip.contrast,
        saturation: clip.saturation,
        hue: clip.hue,
        easing: "easeInOut",
      });
      toast.success("Losango ◆ adicionado! Altere zoom ou posição para animar.");
    }
    engine.markDirty();
  };

  const updateCurrentKfProp = (patch: Partial<Keyframe>) => {
    if (!currentKf) {
      addOrUpdateKeyframe(clip.id, tRel, patch);
    } else {
      addOrUpdateKeyframe(clip.id, currentKf.time, patch);
    }
    engine.markDirty();
  };

  const clearAllKeyframes = () => {
    updateClip(clip.id, { keyframes: undefined });
    toast.success("Todos os losangos foram removidos do clipe");
    engine.markDirty();
  };

  return (
    <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-3 space-y-3">
      {/* Cabeçalho de Controle de Keyframes ◆ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Diamond className={`h-4 w-4 ${currentKf ? "text-amber-400 fill-amber-400 animate-pulse" : "text-zinc-400"}`} />
          <span className="text-xs font-semibold text-zinc-200">Quadros-chave (Keyframes ◆)</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => prevKf && jumpTo(prevKf.time)}
            disabled={!prevKf}
            className="flex h-6 w-6 items-center justify-center rounded border border-[#2a3546] bg-[#121722] text-zinc-400 disabled:opacity-30 hover:border-amber-400 hover:text-amber-300 transition"
            title="Pular para o Losango anterior (◀◆)"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <Button
            size="sm"
            variant={currentKf ? "default" : "outline"}
            onClick={toggleKeyframeAtPlayhead}
            className={`h-6 px-2 text-[11px] font-medium gap-1 transition ${
              currentKf
                ? "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                : "border-[#2a3546] bg-[#151b26] text-zinc-300 hover:border-amber-400 hover:text-amber-300"
            }`}
          >
            <Diamond className={`h-3 w-3 ${currentKf ? "fill-current" : ""}`} />
            {currentKf ? "Remover ◆" : "+ Adicionar ◆"}
          </Button>
          <button
            type="button"
            onClick={() => nextKf && jumpTo(nextKf.time)}
            disabled={!nextKf}
            className="flex h-6 w-6 items-center justify-center rounded border border-[#2a3546] bg-[#121722] text-zinc-400 disabled:opacity-30 hover:border-amber-400 hover:text-amber-300 transition"
            title="Pular para o próximo Losango (◆▶)"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Régua visual dos Keyframes no clipe */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>{tRel.toFixed(2)}s</span>
          <span className="text-amber-400/80 font-medium">
            {kfs.length} {kfs.length === 1 ? "losango marcado" : "losangos marcados"}
          </span>
          <span>{clip.duration.toFixed(2)}s</span>
        </div>
        <div
          className="relative h-4 w-full rounded bg-[#151b26] border border-[#232d3d] cursor-pointer overflow-hidden"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            jumpTo(ratio * clip.duration);
          }}
        >
          {/* Marcador da agulha atual */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10 shadow-[0_0_4px_white]"
            style={{ left: `${(tRel / clip.duration) * 100}%` }}
          />
          {/* Losangos marcados */}
          {kfs.map((k) => (
            <div
              key={k.id}
              onClick={(e) => {
                e.stopPropagation();
                jumpTo(k.time);
              }}
              title={`Losango em ${k.time.toFixed(2)}s — clique para pular`}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rotate-45 border transition hover:scale-125 z-20 ${
                Math.abs(k.time - tRel) < 0.08
                  ? "bg-amber-400 border-amber-300 shadow-[0_0_6px_#f59e0b]"
                  : "bg-amber-500/70 border-amber-400/80"
              }`}
              style={{ left: `${(k.time / clip.duration) * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* Editor de propriedades do Keyframe Selecionado / Atual */}
      {currentKf ? (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-amber-300 flex items-center gap-1">
              <Diamond className="h-3 w-3 fill-current" /> Ponto ◆ aos {currentKf.time.toFixed(2)}s
            </span>
            <button
              onClick={() => deleteKeyframe(clip.id, currentKf.id)}
              className="text-[10px] text-zinc-500 hover:text-red-400 flex items-center gap-0.5 transition"
              title="Excluir este losango"
            >
              <Trash2 className="h-3 w-3" /> apagar ponto
            </button>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px] text-zinc-300">
              <Label className="text-[10px] text-zinc-400">Zoom / Escala</Label>
              <span className="font-mono text-[10px] text-amber-300">{Math.round((currentKf.scale ?? clip.scale) * 100)}%</span>
            </div>
            <Slider
              value={[currentKf.scale ?? clip.scale]}
              min={0.1}
              max={4}
              step={0.02}
              onValueChange={([v]) => updateCurrentKfProp({ scale: v })}
              className="py-0.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Posição X</span>
                <span className="font-mono text-zinc-300">{(currentKf.x ?? clip.x).toFixed(2)}</span>
              </div>
              <Slider
                value={[currentKf.x ?? clip.x]}
                min={-1}
                max={1}
                step={0.01}
                onValueChange={([v]) => updateCurrentKfProp({ x: v })}
                className="py-0.5"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Posição Y</span>
                <span className="font-mono text-zinc-300">{(currentKf.y ?? clip.y).toFixed(2)}</span>
              </div>
              <Slider
                value={[currentKf.y ?? clip.y]}
                min={-1}
                max={1}
                step={0.01}
                onValueChange={([v]) => updateCurrentKfProp({ y: v })}
                className="py-0.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Rotação</span>
                <span className="font-mono text-zinc-300">{Math.round(currentKf.rotation ?? clip.rotation)}°</span>
              </div>
              <Slider
                value={[currentKf.rotation ?? clip.rotation]}
                min={-180}
                max={180}
                step={1}
                onValueChange={([v]) => updateCurrentKfProp({ rotation: v })}
                className="py-0.5"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Opacidade</span>
                <span className="font-mono text-zinc-300">{Math.round((currentKf.opacity ?? clip.opacity) * 100)}%</span>
              </div>
              <Slider
                value={[currentKf.opacity ?? clip.opacity]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([v]) => updateCurrentKfProp({ opacity: v })}
                className="py-0.5"
              />
            </div>
          </div>

          {/* Curva de interpolação / Easing */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-[10px] text-zinc-400">Curva de Movimento (Easing)</Label>
            </div>
            <Select
              value={currentKf.easing || "easeInOut"}
              onValueChange={(v) => updateCurrentKfProp({ easing: v as KeyframeEasing })}
            >
              <SelectTrigger className="h-7 border-[#2a3546] bg-[#121722] text-[11px] text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-[#232d3d] bg-[#121722] text-zinc-200">
                <SelectItem value="easeInOut">Suave (Ease In-Out · CapCut padrão)</SelectItem>
                <SelectItem value="linear">Linear (Velocidade constante)</SelectItem>
                <SelectItem value="easeIn">Acelerar na partida (Ease In)</SelectItem>
                <SelectItem value="easeOut">Desacelerar na chegada (Ease Out)</SelectItem>
                <SelectItem value="spring">Mola Elástica (Spring)</SelectItem>
                <SelectItem value="bounce">Pulo com Impacto (Bounce)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="rounded border border-dashed border-[#232d3d] p-2.5 text-center">
          <p className="text-[11px] leading-relaxed text-zinc-400">
            {kfs.length === 0
              ? "Clique em + Adicionar ◆ para marcar o primeiro ponto de início do movimento ou zoom."
              : "Posicione a agulha em outro ponto da linha do tempo e mova a figura na tela para animar."}
          </p>
        </div>
      )}

      {kfs.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-zinc-500">
            Losangos próximos = zoom rápido; afastados = zoom suave
          </span>
          <button
            type="button"
            onClick={clearAllKeyframes}
            className="text-[10px] text-red-400 hover:text-red-300 transition underline"
          >
            Limpar todos ({kfs.length})
          </button>
        </div>
      )}
    </div>
  );
}
