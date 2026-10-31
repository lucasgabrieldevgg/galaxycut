// GalaxyCut — catálogo de modelos de IA com TAREFAS DECLARADAS (roadmap v9):
// um modelo não é "só transcrição" — cada um declara o que executa, e a UI
// mostra o que já roda no app e o que chega em breve (sistema de pacotes).
// Tudo local por padrão: nenhum modelo manda áudio pra fora da máquina.
"use client";

export type AiTaskId =
  | "transcribe" // áudio → texto (legendas)
  | "voice-separate" // separar voz e música
  | "denoise" // redução de ruído
  | "tts" // síntese de voz
  | "voice-transform" // transformação de voz (grave/aguda/robô)
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
  { id: "voice-separate", nameKey: "ai.taskVoiceSep", descKey: "ai.taskVoiceSepDesc", available: false },
  { id: "denoise", nameKey: "ai.taskDenoise", descKey: "ai.taskDenoiseDesc", available: false },
  { id: "tts", nameKey: "ai.taskTts", descKey: "ai.taskTtsDesc", available: false },
  { id: "voice-transform", nameKey: "ai.taskVoiceFx", descKey: "ai.taskVoiceFxDesc", available: false },
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

// tamanhos acompanham os hints do próprio app (subtitles.ts): ~40/80/250 MB
export const AI_MODELS: AiModelInfo[] = [
  { id: "tiny", name: "Whisper tiny", task: "transcribe", sizeMb: 40, langs: "99", speed: 3, accuracy: 1, memory: "2 GB", local: true, status: "built-in" },
  { id: "base", name: "Whisper base", task: "transcribe", sizeMb: 80, langs: "99", speed: 2, accuracy: 2, memory: "2 GB", local: true, status: "built-in" },
  { id: "small", name: "Whisper small", task: "transcribe", sizeMb: 250, langs: "99", speed: 1, accuracy: 3, memory: "4 GB", local: true, status: "built-in" },
  { id: "planned-uvr", name: "Source separation", task: "voice-separate", sizeMb: 0, langs: "—", speed: 2, accuracy: 3, memory: "4 GB", local: true, status: "planned" },
  { id: "planned-denoise", name: "Noise suppression", task: "denoise", sizeMb: 0, langs: "—", speed: 3, accuracy: 2, memory: "2 GB", local: true, status: "planned" },
  { id: "planned-tts", name: "Local TTS", task: "tts", sizeMb: 0, langs: "—", speed: 2, accuracy: 2, memory: "2 GB", local: true, status: "planned" },
  { id: "planned-bg", name: "Background removal", task: "bg-remove", sizeMb: 0, langs: "—", speed: 2, accuracy: 2, memory: "4 GB", local: true, status: "planned" },
];
