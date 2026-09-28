// GalaxyCut — Inspetor de Animações Prontas estilo CapCut (Entrada, Saída, Combo)
"use client";

import { useProject } from "@/lib/editor/store";
import {
  Clip,
  ANIMATIONS_IN,
  ANIMATIONS_OUT,
  ANIMATIONS_COMBO,
  AnimationInType,
  AnimationOutType,
  AnimationComboType,
} from "@/lib/editor/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { engine } from "@/lib/editor/playback";
import { Sparkles, ArrowRight, ArrowLeft, RotateCw } from "lucide-react";
import { toast } from "sonner";

export function AnimationInspector({ clip }: { clip: Clip }) {
  const setClipAnimation = useProject((s) => s.setClipAnimation);
  const anim = clip.animation || {};

  const setIn = (type: AnimationInType) => {
    setClipAnimation(clip.id, {
      ...anim,
      inType: type,
      inDuration: anim.inDuration ?? 0.5,
    });
    engine.markDirty();
    toast.success(type === "none" ? "Animação de entrada removida" : `Animação "${type}" aplicada`);
  };

  const setOut = (type: AnimationOutType) => {
    setClipAnimation(clip.id, {
      ...anim,
      outType: type,
      outDuration: anim.outDuration ?? 0.5,
    });
    engine.markDirty();
    toast.success(type === "none" ? "Animação de saída removida" : `Animação "${type}" aplicada`);
  };

  const setCombo = (type: AnimationComboType) => {
    setClipAnimation(clip.id, {
      ...anim,
      comboType: type,
      comboSpeed: anim.comboSpeed ?? 1,
    });
    engine.markDirty();
    toast.success(type === "none" ? "Animação contínua removida" : `Animação "${type}" aplicada`);
  };

  const updateInDuration = (v: number) => {
    setClipAnimation(clip.id, { ...anim, inDuration: v });
    engine.markDirty();
  };

  const updateOutDuration = (v: number) => {
    setClipAnimation(clip.id, { ...anim, outDuration: v });
    engine.markDirty();
  };

  const updateComboSpeed = (v: number) => {
    setClipAnimation(clip.id, { ...anim, comboSpeed: v });
    engine.markDirty();
  };

  const maxInDur = Math.max(0.1, Math.min(3, clip.duration * 0.9));

  return (
    <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <span className="text-xs font-semibold text-zinc-200">Animações Prontas (1-Clique)</span>
        </div>
        {(anim.inType || anim.outType || anim.comboType) && (
          <button
            type="button"
            onClick={() => {
              setClipAnimation(clip.id, undefined);
              engine.markDirty();
              toast.success("Animações removidas");
            }}
            className="text-[10px] text-zinc-500 hover:text-red-400 transition"
          >
            Limpar animações
          </button>
        )}
      </div>

      <Tabs defaultValue="in" className="w-full">
        <TabsList className="grid grid-cols-3 h-7 bg-[#151b26] p-0.5">
          <TabsTrigger value="in" className="h-6 text-[10px] data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300">
            Entrada (In)
          </TabsTrigger>
          <TabsTrigger value="out" className="h-6 text-[10px] data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300">
            Saída (Out)
          </TabsTrigger>
          <TabsTrigger value="combo" className="h-6 text-[10px] data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300">
            Combo / Loop
          </TabsTrigger>
        </TabsList>

        {/* ---------- ENTRADA (IN) ---------- */}
        <TabsContent value="in" className="space-y-2.5 pt-2">
          <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1 timeline-scroll">
            {ANIMATIONS_IN.map((item) => {
              const active = (anim.inType || "none") === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setIn(item.type)}
                  className={`flex flex-col items-center justify-center p-1.5 rounded-md border text-center transition ${
                    active
                      ? "border-violet-400 bg-violet-500/20 text-violet-200 shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                      : "border-[#232d3d] bg-[#121722] text-zinc-400 hover:border-violet-500/50 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-base mb-0.5">{item.icon}</span>
                  <span className="text-[9px] font-medium leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
          {anim.inType && anim.inType !== "none" && (
            <div className="space-y-1 rounded bg-[#121722] p-2 border border-[#232d3d]">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Duração da Entrada</span>
                <span className="font-mono text-violet-300">{(anim.inDuration ?? 0.5).toFixed(2)}s</span>
              </div>
              <Slider
                value={[anim.inDuration ?? 0.5]}
                min={0.1}
                max={maxInDur}
                step={0.05}
                onValueChange={([v]) => updateInDuration(v)}
                className="py-1"
              />
            </div>
          )}
        </TabsContent>

        {/* ---------- SAÍDA (OUT) ---------- */}
        <TabsContent value="out" className="space-y-2.5 pt-2">
          <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1 timeline-scroll">
            {ANIMATIONS_OUT.map((item) => {
              const active = (anim.outType || "none") === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setOut(item.type)}
                  className={`flex flex-col items-center justify-center p-1.5 rounded-md border text-center transition ${
                    active
                      ? "border-violet-400 bg-violet-500/20 text-violet-200 shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                      : "border-[#232d3d] bg-[#121722] text-zinc-400 hover:border-violet-500/50 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-base mb-0.5">{item.icon}</span>
                  <span className="text-[9px] font-medium leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
          {anim.outType && anim.outType !== "none" && (
            <div className="space-y-1 rounded bg-[#121722] p-2 border border-[#232d3d]">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Duração da Saída</span>
                <span className="font-mono text-violet-300">{(anim.outDuration ?? 0.5).toFixed(2)}s</span>
              </div>
              <Slider
                value={[anim.outDuration ?? 0.5]}
                min={0.1}
                max={maxInDur}
                step={0.05}
                onValueChange={([v]) => updateOutDuration(v)}
                className="py-1"
              />
            </div>
          )}
        </TabsContent>

        {/* ---------- COMBO / LOOP ---------- */}
        <TabsContent value="combo" className="space-y-2.5 pt-2">
          <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1 timeline-scroll">
            {ANIMATIONS_COMBO.map((item) => {
              const active = (anim.comboType || "none") === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setCombo(item.type)}
                  className={`flex flex-col items-center justify-center p-1.5 rounded-md border text-center transition ${
                    active
                      ? "border-violet-400 bg-violet-500/20 text-violet-200 shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                      : "border-[#232d3d] bg-[#121722] text-zinc-400 hover:border-violet-500/50 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-base mb-0.5">{item.icon}</span>
                  <span className="text-[9px] font-medium leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
          {anim.comboType && anim.comboType !== "none" && (
            <div className="space-y-1 rounded bg-[#121722] p-2 border border-[#232d3d]">
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span>Velocidade do Movimento</span>
                <span className="font-mono text-violet-300">{(anim.comboSpeed ?? 1).toFixed(1)}×</span>
              </div>
              <Slider
                value={[anim.comboSpeed ?? 1]}
                min={0.2}
                max={3}
                step={0.1}
                onValueChange={([v]) => updateComboSpeed(v)}
                className="py-1"
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
