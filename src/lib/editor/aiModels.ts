// GalaxyCut — catálogo de modelos de IA.
// REGRA v9.4 (pós-auditoria): nenhum card fictício. Só entra na lista modelo
// que RODA no app de verdade — "Em breve" com nome/tamanho bonito mas sem
// implementação é marketing, não produto. Categorias sem modelo funcional
// aparecem vazias na UI, com texto honesto.
//
// O que roda hoje:
//  - Transcrição: Whisper tiny/base/small/medium (transformers.js, 100% local)
//  - Transformação de voz: 4 motores de conversão de identidade vocal
//    (pitch granular + formantes, preservando ritmo e interpretação) —
//    implementados em voiceTransform.ts, processam e geram uma NOVA faixa.
"use client";

export type AiTaskId =
  | "transcribe" // áudio → texto (legendas)
  | "voice-transform" // transformação de voz (m→f, f→m, jovem, idosa)
  | "voice-separate" // separar voz e música
  | "denoise" // redução de ruído
  | "tts" // síntese de voz
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
  { id: "voice-transform", nameKey: "ai.taskVoiceTransform", descKey: "ai.taskVoiceTransformDesc", available: true },
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
  /** download aproximado do modelo (MB) — 0 = sem download */
  sizeMb: number;
  /** idiomas suportados ("99") ou "—" */
  langs: string;
  /** 1 = lento/mais preciso · 3 = rápido */
  speed: 1 | 2 | 3;
  /** 1 = mais erros · 3 = mais preciso */
  accuracy: 1 | 2 | 3;
  /** RAM aproximada pra rodar confortável */
  memory: string;
  /** roda 100% local (Web Worker/WebAudio) — nada sai da máquina */
  local: boolean;
  status: "built-in";
  /** como ativar: "whisper" = escolhe tamanho de transcrição · "transform" = abre o diálogo de transformação */
  action: "whisper" | "transform";
}

export const AI_MODELS: AiModelInfo[] = [
  // ---- TRANSCRIÇÃO (Whisper local — já roda) ----
  { id: "tiny", name: "Whisper tiny", task: "transcribe", sizeMb: 40, langs: "99", speed: 3, accuracy: 1, memory: "2 GB", local: true, status: "built-in", action: "whisper" },
  { id: "base", name: "Whisper base", task: "transcribe", sizeMb: 80, langs: "99", speed: 2, accuracy: 2, memory: "2 GB", local: true, status: "built-in", action: "whisper" },
  { id: "small", name: "Whisper small", task: "transcribe", sizeMb: 250, langs: "99", speed: 1, accuracy: 3, memory: "4 GB", local: true, status: "built-in", action: "whisper" },
  { id: "medium", name: "Whisper medium", task: "transcribe", sizeMb: 750, langs: "99", speed: 1, accuracy: 3, memory: "6 GB", local: true, status: "built-in", action: "whisper" },

  // ---- TRANSFORMAÇÃO DE VOZ (motores de conversão local — já roda) ----
  { id: "vt-m2f", name: "Conversão Masculino → Feminino", task: "voice-transform", sizeMb: 0, langs: "—", speed: 3, accuracy: 3, memory: "0 (WebAudio)", local: true, status: "built-in", action: "transform" },
  { id: "vt-f2m", name: "Conversão Feminino → Masculino", task: "voice-transform", sizeMb: 0, langs: "—", speed: 3, accuracy: 3, memory: "0 (WebAudio)", local: true, status: "built-in", action: "transform" },
  { id: "vt-jovem", name: "Voz Jovem (adulta → jovem)", task: "voice-transform", sizeMb: 0, langs: "—", speed: 3, accuracy: 3, memory: "0 (WebAudio)", local: true, status: "built-in", action: "transform" },
  { id: "vt-idosa", name: "Voz Idosa (adulta → idosa)", task: "voice-transform", sizeMb: 0, langs: "—", speed: 3, accuracy: 3, memory: "0 (WebAudio)", local: true, status: "built-in", action: "transform" },
];
