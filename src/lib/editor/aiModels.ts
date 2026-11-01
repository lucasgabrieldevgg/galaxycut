// GalaxyCut — catálogo de modelos de IA com TAREFAS DECLARADAS (roadmap v9):
// um modelo não é "só transcrição" — cada um declara o que executa, e a UI
// mostra o que já roda no app e o que chega em breve (sistema de pacotes).
// Tudo local por padrão: nenhum modelo manda áudio pra fora da máquina.
// v9.1: catálogo enriquecido — mais opções por categoria, com nomes reais
// dos modelos planejados (tamanhos publicados dos repositórios quantizados).
"use client";

export type AiTaskId =
  | "transcribe" // áudio → texto (legendas)
  | "voice-separate" // separar voz e música
  | "denoise" // redução de ruído
  | "tts" // síntese de voz
  | "voice-transform" // transformação de voz (robô/telefone/grave/…)
  | "bg-remove" // remoção de fundo (imagem/vídeo)
  | "translate"; // tradução/correção de legendas

export interface AiTask {
  id: AiTaskId;
  nameKey: string;
  descKey: string;
  /** true = já roda no app hoje */
  available: boolean;
}

export const AI_TASKS: AiTask[] = [
  { id: "transcribe", nameKey: "ai.taskTranscribe", descKey: "ai.taskTranscribeDesc", available: true },
  { id: "voice-transform", nameKey: "ai.taskVoiceFx", descKey: "ai.taskVoiceFxDesc", available: true },
  { id: "voice-separate", nameKey: "ai.taskVoiceSep", descKey: "ai.taskVoiceSepDesc", available: false },
  { id: "denoise", nameKey: "ai.taskDenoise", descKey: "ai.taskDenoiseDesc", available: false },
  { id: "tts", nameKey: "ai.taskTts", descKey: "ai.taskTtsDesc", available: false },
  { id: "bg-remove", nameKey: "ai.taskBgRemove", descKey: "ai.taskBgRemoveDesc", available: false },
  { id: "translate", nameKey: "ai.taskTranslate", descKey: "ai.taskTranslateDesc", available: false },
];

export interface AiModelInfo {
  id: string;
  name: string;
  task: AiTaskId;
  /** download aproximado do modelo quantizado (MB) — 0 = ainda sem tamanho publicado */
  sizeMb: number;
  /** idiomas suportados ("99") ou "—" */
  langs: string;
  /** 1 = lento/mais preciso · 3 = rápido */
  speed: 1 | 2 | 3;
  /** 1 = mais erros · 3 = mais preciso */
  accuracy: 1 | 2 | 3;
  /** RAM aproximada pra rodar confortável */
  memory: string;
  /** roda 100% local (Web Worker) — nada sai da máquina */
  local: boolean;
  status: "built-in" | "planned";
}

// tamanhos acompanham os hints do próprio app (subtitles.ts): ~40/80/250/750 MB
export const AI_MODELS: AiModelInfo[] = [
  // ---- TRANSCRIÇÃO (roda hoje: 4 tamanhos de Whisper local) ----
  { id: "tiny", name: "Whisper tiny", task: "transcribe", sizeMb: 40, langs: "99", speed: 3, accuracy: 1, memory: "2 GB", local: true, status: "built-in" },
  { id: "base", name: "Whisper base", task: "transcribe", sizeMb: 80, langs: "99", speed: 2, accuracy: 2, memory: "2 GB", local: true, status: "built-in" },
  { id: "small", name: "Whisper small", task: "transcribe", sizeMb: 250, langs: "99", speed: 1, accuracy: 3, memory: "4 GB", local: true, status: "built-in" },
  { id: "medium", name: "Whisper medium", task: "transcribe", sizeMb: 750, langs: "99", speed: 1, accuracy: 3, memory: "6 GB", local: true, status: "built-in" },

  // ---- TRANSFORMAÇÃO DE VOZ (roda hoje: efeitos de voz do clipe) ----
  { id: "voicefx", name: "Efeitos de voz (DSP local)", task: "voice-transform", sizeMb: 0, langs: "—", speed: 3, accuracy: 3, memory: "0 (WebAudio)", local: true, status: "built-in" },

  // ---- SEPARAÇÃO VOZ / MÚSICA (planejados, com nome real) ----
  { id: "planned-uvr-mdx", name: "UVR-MDX-NET InstHQ", task: "voice-separate", sizeMb: 80, langs: "—", speed: 2, accuracy: 3, memory: "4 GB", local: true, status: "planned" },
  { id: "planned-htdemucs", name: "HT-Demucs (Meta)", task: "voice-separate", sizeMb: 300, langs: "—", speed: 1, accuracy: 3, memory: "6 GB", local: true, status: "planned" },
  { id: "planned-mdx23c", name: "MDX23C Instrumental", task: "voice-separate", sizeMb: 270, langs: "—", speed: 1, accuracy: 3, memory: "6 GB", local: true, status: "planned" },

  // ---- REDUÇÃO DE RUÍDO (planejado) ----
  { id: "planned-rnnoise", name: "RNNoise (Xiph)", task: "denoise", sizeMb: 5, langs: "—", speed: 3, accuracy: 2, memory: "1 GB", local: true, status: "planned" },
  { id: "planned-denoise", name: "DeepFilterNet 3", task: "denoise", sizeMb: 30, langs: "—", speed: 3, accuracy: 3, memory: "2 GB", local: true, status: "planned" },
  { id: "planned-dfn2", name: "DeepFilterNet 2 Light", task: "denoise", sizeMb: 16, langs: "—", speed: 3, accuracy: 2, memory: "1 GB", local: true, status: "planned" },

  // ---- SÍNTESE DE VOZ (planejado — v9.2: homem, mulher, criança…) ----
  { id: "planned-tts-piper-f", name: "Piper — Voz feminina (PT)", task: "tts", sizeMb: 60, langs: "PT + 20", speed: 3, accuracy: 2, memory: "2 GB", local: true, status: "planned" },
  { id: "planned-tts-piper-m", name: "Piper — Voz masculina (PT)", task: "tts", sizeMb: 60, langs: "PT + 20", speed: 3, accuracy: 2, memory: "2 GB", local: true, status: "planned" },
  { id: "planned-tts-piper-k", name: "Piper — Voz infantil", task: "tts", sizeMb: 60, langs: "EN/ES", speed: 3, accuracy: 2, memory: "2 GB", local: true, status: "planned" },
  { id: "planned-tts-kokoro", name: "Kokoro-82M (multi-voz)", task: "tts", sizeMb: 330, langs: "8", speed: 2, accuracy: 3, memory: "4 GB", local: true, status: "planned" },
  { id: "planned-tts-xtts", name: "XTTS-v2 (clonagem de voz)", task: "tts", sizeMb: 1900, langs: "17", speed: 1, accuracy: 3, memory: "8 GB", local: true, status: "planned" },

  // ---- REMOÇÃO DE FUNDO (planejado) ----
  { id: "planned-bg-mediapipe", name: "MediaPipe Selfie", task: "bg-remove", sizeMb: 10, langs: "—", speed: 3, accuracy: 2, memory: "2 GB", local: true, status: "planned" },
  { id: "planned-bg-modnet", name: "MODNet", task: "bg-remove", sizeMb: 25, langs: "—", speed: 2, accuracy: 3, memory: "4 GB", local: true, status: "planned" },
  { id: "planned-bg-rvm", name: "RVM (fundo em vídeo)", task: "bg-remove", sizeMb: 27, langs: "—", speed: 2, accuracy: 3, memory: "4 GB", local: true, status: "planned" },
  { id: "planned-bg-u2net", name: "U²-Net (máxima precisão)", task: "bg-remove", sizeMb: 170, langs: "—", speed: 1, accuracy: 3, memory: "6 GB", local: true, status: "planned" },

  // ---- TRADUÇÃO DE LEGENDAS (planejado) ----
  { id: "planned-m2m", name: "M2M100 418M", task: "translate", sizeMb: 200, langs: "100", speed: 2, accuracy: 2, memory: "4 GB", local: true, status: "planned" },
  { id: "planned-nllb", name: "NLLB-200 distilled", task: "translate", sizeMb: 350, langs: "200", speed: 1, accuracy: 3, memory: "4 GB", local: true, status: "planned" },
  { id: "planned-opusmt", name: "Opus-MT (por par de idiomas)", task: "translate", sizeMb: 310, langs: "60+", speed: 3, accuracy: 2, memory: "2 GB", local: true, status: "planned" },
];
