// GalaxyCut — Diálogo de Melhoria de Áudio em Lote / Filtros de Áudio por Faixas e Clipes
"use client";

import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wand2, Sliders, Volume2, Film, Music, Sparkles } from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { Clip, Track, AudioFilterConfig, DEFAULT_AUDIO_FILTERS } from "@/lib/editor/types";
import { AudioFiltersDialog } from "./AudioFiltersDialog";
import { toast } from "sonner";
import { engine } from "@/lib/editor/playback";

interface BatchAudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BatchAudioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const tracks = useProject((s) => s.tracks);
  const clips = useProject((s) => s.clips);
  const media = useProject((s) => s.media);

  // Filtra apenas faixas e clipes que possuem som (vídeo ou áudio)
  const audioTracks = useMemo(() => {
    return tracks.filter((t) => t.kind === "video" || t.kind === "audio");
  }, [tracks]);

  const audioClips = useMemo(() => {
    return clips.filter((c) => (c.kind === "video" || c.kind === "audio") && !c.videoHidden);
  }, [clips]);

  // Conjunto de IDs selecionados (por padrão, TODOS selecionados como pedido pelo usuário!)
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  const [actionType, setActionType] = useState<"obs_enhance" | "custom_filters" | "remove">("obs_enhance");
  const [customFilters, setCustomFilters] = useState<AudioFilterConfig>(DEFAULT_AUDIO_FILTERS);
  const [customFiltersOpen, setCustomFiltersOpen] = useState(false);

  // Inicializa com todos selecionados ao abrir o diálogo
  useEffect(() => {
    if (open) {
      setSelectedClipIds(new Set(audioClips.map((c) => c.id)));
    }
  }, [open, audioClips]);

  const allSelected = audioClips.length > 0 && selectedClipIds.size === audioClips.length;
  const isPartiallySelected = selectedClipIds.size > 0 && selectedClipIds.size < audioClips.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedClipIds(new Set());
    } else {
      setSelectedClipIds(new Set(audioClips.map((c) => c.id)));
    }
  };

  const toggleTrack = (trackId: string) => {
    const trackClips = audioClips.filter((c) => c.trackId === trackId);
    const trackClipIds = trackClips.map((c) => c.id);
    const allInTrackSelected = trackClipIds.every((id) => selectedClipIds.has(id));

    const next = new Set(selectedClipIds);
    if (allInTrackSelected) {
      trackClipIds.forEach((id) => next.delete(id));
    } else {
      trackClipIds.forEach((id) => next.add(id));
    }
    setSelectedClipIds(next);
  };

  const toggleClip = (clipId: string) => {
    const next = new Set(selectedClipIds);
    if (next.has(clipId)) next.delete(clipId);
    else next.add(clipId);
    setSelectedClipIds(next);
  };

  const handleApply = () => {
    if (selectedClipIds.size === 0) {
      toast.warning("Selecione pelo menos um clipe para aplicar.");
      return;
    }

    const st = useProject.getState();
    const targetIds = Array.from(selectedClipIds);

    if (actionType === "obs_enhance") {
      st.updateClips(targetIds, {
        enhance: true,
        audioFilters: DEFAULT_AUDIO_FILTERS,
      });
      toast.success(`Melhoria de áudio aplicada em ${targetIds.length} clipe(s)!`);
    } else if (actionType === "custom_filters") {
      st.updateClips(targetIds, {
        enhance: true,
        audioFilters: customFilters,
      });
      toast.success(`Filtros de áudio personalizados aplicados em ${targetIds.length} clipe(s)!`);
    } else {
      st.updateClips(targetIds, {
        enhance: false,
        audioFilters: undefined,
      });
      toast.info(`Filtros removidos de ${targetIds.length} clipe(s).`);
    }

    engine.markDirty();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col border-[#232d3d] bg-[#10141d] text-zinc-200">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-[var(--gc-accent)]" />
              <DialogTitle className="text-base font-semibold">Melhorar Áudio em Lote / Filtros de Estúdio</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-zinc-400">
              Escolha as faixas e clipes onde deseja aplicar os filtros de áudio estilo OBS Studio simultaneamente.
            </DialogDescription>
          </DialogHeader>

          {/* Opções de Ação */}
          <div className="grid grid-cols-3 gap-2 py-2">
            <button
              type="button"
              onClick={() => setActionType("obs_enhance")}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-colors ${
                actionType === "obs_enhance"
                  ? "border-[var(--gc-accent)] bg-[var(--gc-accent)]/15 text-white"
                  : "border-[#1e2638] bg-[#141a26] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="h-4 w-4 mb-1 text-[var(--gc-accent)]" />
              <span className="text-xs font-semibold">Padrão OBS (Voz Clara)</span>
              <span className="text-[10px] text-zinc-400 mt-0.5">Highpass + Compressor</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActionType("custom_filters");
                setCustomFiltersOpen(true);
              }}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-colors ${
                actionType === "custom_filters"
                  ? "border-[var(--gc-accent)] bg-[var(--gc-accent)]/15 text-white"
                  : "border-[#1e2638] bg-[#141a26] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sliders className="h-4 w-4 mb-1 text-sky-400" />
              <span className="text-xs font-semibold">Filtros Customizados</span>
              <span className="text-[10px] text-zinc-400 mt-0.5">Configurar parâmetros</span>
            </button>

            <button
              type="button"
              onClick={() => setActionType("remove")}
              className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-colors ${
                actionType === "remove"
                  ? "border-red-500 bg-red-500/15 text-white"
                  : "border-[#1e2638] bg-[#141a26] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Volume2 className="h-4 w-4 mb-1 text-zinc-400" />
              <span className="text-xs font-semibold">Desativar / Bypass</span>
              <span className="text-[10px] text-zinc-400 mt-0.5">Áudio original limpo</span>
            </button>
          </div>

          {/* Barra de Selecionar Todos */}
          <div className="flex items-center justify-between border-y border-[#1e2638] bg-[#0c1017] px-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-zinc-200">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-[var(--gc-accent)] accent-[var(--gc-accent)] cursor-pointer"
              />
              <span>Selecionar todos os clipes ({audioClips.length})</span>
            </label>
            <span className="text-[11px] text-zinc-400 font-mono">
              {selectedClipIds.size} de {audioClips.length} selecionado(s)
            </span>
          </div>

          {/* Lista de Faixas e Clipes */}
          <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
            {audioTracks.length === 0 || audioClips.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                Nenhum clipe com áudio encontrado na timeline.
              </div>
            ) : (
              audioTracks.map((track) => {
                const trackClips = audioClips.filter((c) => c.trackId === track.id);
                if (trackClips.length === 0) return null;
                const allInTrack = trackClips.every((c) => selectedClipIds.has(c.id));

                return (
                  <div key={track.id} className="rounded-lg border border-[#1e2638] bg-[#141a26] overflow-hidden">
                    {/* Header da Faixa */}
                    <div className="flex items-center justify-between bg-[#182030] px-3 py-1.5 border-b border-[#1e2638]">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allInTrack}
                          onChange={() => toggleTrack(track.id)}
                          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-[var(--gc-accent)] accent-[var(--gc-accent)] cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                          {track.kind === "video" ? (
                            <Film className="h-3.5 w-3.5 text-sky-400" />
                          ) : (
                            <Music className="h-3.5 w-3.5 text-emerald-400" />
                          )}
                          {track.name} ({trackClips.length} clipe{trackClips.length > 1 ? "s" : ""})
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => toggleTrack(track.id)}
                        className="text-[10px] text-zinc-400 hover:text-[var(--gc-accent)] font-medium"
                      >
                        {allInTrack ? "Desmarcar Faixa" : "Marcar Faixa"}
                      </button>
                    </div>

                    {/* Clipes da Faixa */}
                    <div className="p-2 space-y-1.5">
                      {trackClips.map((clip) => {
                        const m = media.find((x) => x.id === clip.mediaId);
                        const isSelected = selectedClipIds.has(clip.id);
                        const clipName = m?.name || (clip.kind === "video" ? "Vídeo" : "Áudio");

                        return (
                          <div
                            key={clip.id}
                            onClick={() => toggleClip(clip.id)}
                            className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-[var(--gc-accent)]/10 border border-[var(--gc-accent)]/30"
                                : "bg-[#0f141f] border border-transparent hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  toggleClip(clip.id);
                                }}
                                className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-[var(--gc-accent)] accent-[var(--gc-accent)] cursor-pointer"
                              />
                              <div className="min-w-0">
                                <p className="text-xs text-zinc-200 truncate font-medium">{clipName}</p>
                                <p className="text-[10px] text-zinc-500 tabular-nums">
                                  {clip.start.toFixed(1)}s - {(clip.start + clip.duration).toFixed(1)}s ({clip.duration.toFixed(1)}s)
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {clip.enhance && (
                                <span className="flex items-center gap-1 rounded bg-[var(--gc-accent)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--gc-accent)]">
                                  <Sparkles className="h-2.5 w-2.5" /> Melhorado
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="flex items-center justify-between border-t border-[#1f2837] pt-3">
            <span className="text-xs text-zinc-400">
              {selectedClipIds.size} clipe(s) marcado(s)
            </span>
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
                onClick={handleApply}
                disabled={selectedClipIds.size === 0}
                className="bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)] text-xs px-4"
              >
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                Aplicar em {selectedClipIds.size} Clipe(s)
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo auxiliar de ajuste fino dos filtros OBS */}
      <AudioFiltersDialog
        open={customFiltersOpen}
        onOpenChange={setCustomFiltersOpen}
        filters={customFilters}
        onApply={(f) => {
          setCustomFilters(f);
          setActionType("custom_filters");
        }}
        title="Configurar Filtros de Áudio (Estilo OBS)"
        description="Defina os parâmetros que serão aplicados aos clipes selecionados no lote."
      />
    </>
  );
}
