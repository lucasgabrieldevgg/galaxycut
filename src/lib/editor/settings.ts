// GalaxyCut — configurações do app (playhead, encaixe, legendas, chaves de busca)
"use client";

import { create } from "zustand";

export type PlayheadMode = "free" | "smooth" | "frames" | "magnet";

export const PLAYHEAD_MODES: { id: PlayheadMode; label: string; hint: string }[] = [
  { id: "free", label: "Livre", hint: "A seta segue o mouse sem parar em nada" },
  { id: "smooth", label: "Suave", hint: "A seta desliza com inércia até o ponto" },
  { id: "frames", label: "Quadro a quadro", hint: "A seta pula de quadro em quadro (estilo Kdenlive)" },
  { id: "magnet", label: "Magnético", hint: "A seta gruda em cortes e na borda dos clipes ao passar perto" },
];

// ---------------- estado ----------------

export interface AppSettings {
  playheadMode: PlayheadMode;
  snapEnabled: boolean; // encaixe ao arrastar clipes
  showWaveOnVideo: boolean; // waveform dentro do clipe de vídeo
  captionPreset: string; // id do CAPTION_PRESETS
  captionMaxWords: 2 | 3 | 4; // palavras por caixa de legenda (anti-inundação)
  captionPos: { x: number; y: number }; // posição global das legendas (-1..1)
  whisperModel: "tiny" | "base" | "small";
  keys: { pexels: string; pixabay: string };
  /** verificador de atualização automático (mostra changelog quando sai versão nova) */
  autoUpdateCheck: boolean;
  set: (patch: Partial<AppSettings>) => void;
}

const LS_KEY = "galaxycut_settings_v1";

function load(): Partial<AppSettings> {
  if (typeof window === "undefined") return {};
  try {
    // migra das versões antigas (v1..v3) — ignora o antigo gerenciador de IA
    const raw =
      localStorage.getItem(LS_KEY) ??
      localStorage.getItem("galaxiacut_settings_v3") ??
      localStorage.getItem("galaxiacut_settings_v2") ??
      localStorage.getItem("galaxiacut_settings_v1");
    const parsed = raw ? (JSON.parse(raw) as Partial<AppSettings> & { aiProviders?: unknown; activeAiId?: unknown }) : {};
    delete parsed.aiProviders;
    delete parsed.activeAiId;
    return {
      ...parsed,
      captionMaxWords: parsed.captionMaxWords ?? 4,
      captionPos: parsed.captionPos ?? { x: 0, y: 0.62 },
      keys: { pexels: "", pixabay: "", ...(parsed.keys ?? {}) },
      autoUpdateCheck: parsed.autoUpdateCheck ?? true,
    };
  } catch {
    return {};
  }
}

function persist(s: AppSettings) {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        playheadMode: s.playheadMode,
        snapEnabled: s.snapEnabled,
        showWaveOnVideo: s.showWaveOnVideo,
        captionPreset: s.captionPreset,
        captionMaxWords: s.captionMaxWords,
        captionPos: s.captionPos,
        whisperModel: s.whisperModel,
        keys: s.keys,
        autoUpdateCheck: s.autoUpdateCheck,
      })
    );
  } catch {
    /* noop */
  }
}

const boot = load();

export const useSettings = create<AppSettings>((set, get) => ({
  playheadMode: "free",
  snapEnabled: true,
  showWaveOnVideo: true,
  captionPreset: "amarelo",
  captionMaxWords: 4,
  captionPos: { x: 0, y: 0.62 },
  whisperModel: "base",
  keys: { pexels: "", pixabay: "" },
  autoUpdateCheck: true,
  ...boot,
  set: (patch) => {
    set(patch as AppSettings);
    persist(get());
  },
}));
