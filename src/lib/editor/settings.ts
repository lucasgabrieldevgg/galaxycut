// GalaxyCut — configurações do app (playhead, encaixe, legendas, chaves de busca)
"use client";

import { create } from "zustand";
import { applyAccent } from "./theme";
import { desktop } from "./desktop";

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
  captionMaxWords: 1 | 2 | 3 | 4; // palavras por caixa de legenda (anti-inundação)
  captionPos: { x: number; y: number }; // posição global das legendas (-1..1)
  whisperModel: "tiny" | "base" | "small";
  keys: { pexels: string; pixabay: string };
  /** verificador de atualização automático (mostra changelog quando sai versão nova) */
  autoUpdateCheck: boolean;
  /** autosave em DISCO (app de desktop): intervalo em minutos (0 = desligado) */
  autosaveMin: number;
  /** cor do app (accent) — escolhida no onboarding e nas configurações */
  accent: string;
  /** o onboarding inicial já foi feito? (false = mostra a tela de boas-vindas) */
  onboarded: boolean;
  /** mover na prévia com guias magnéticas (centro/bordas)? ligado por padrão */
  magnetMove: boolean;
  /** resetar barra de rolagem do painel de propriedades pro topo ao selecionar outro clipe? ligado por padrão */
  resetInspectorOnSelect: boolean;
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
      autosaveMin: parsed.autosaveMin ?? 2,
      accent: parsed.accent ?? "galaxy",
      onboarded: parsed.onboarded ?? false,
      magnetMove: parsed.magnetMove ?? true,
      resetInspectorOnSelect: parsed.resetInspectorOnSelect ?? true,
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
        autosaveMin: s.autosaveMin,
        accent: s.accent,
        onboarded: s.onboarded,
        magnetMove: s.magnetMove,
        resetInspectorOnSelect: s.resetInspectorOnSelect,
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
  autosaveMin: 2,
  accent: "galaxy",
  onboarded: false,
  magnetMove: true,
  resetInspectorOnSelect: true,
  ...boot,
  set: (patch) => {
    set(patch as AppSettings);
    const updated = get();
    persist(updated);
    if (desktop?.settingsSave) {
      void desktop.settingsSave(updated);
    }
    // a cor do app aplica na hora (as vars CSS mudam e tudo acompanha)
    if (patch.accent !== undefined) applyAccent(patch.accent);
  },
}));

// aplica a cor salva já no boot e sincroniza com disco no desktop
if (typeof window !== "undefined") {
  applyAccent(useSettings.getState().accent);
  if (desktop?.settingsLoad) {
    void desktop.settingsLoad().then((saved) => {
      if (saved && typeof saved === "object") {
        useSettings.setState((s) => ({ ...s, ...saved }));
        if (saved.accent && typeof saved.accent === "string") {
          applyAccent(saved.accent);
        }
      }
    });
  }
}
