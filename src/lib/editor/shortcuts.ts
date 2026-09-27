// GalaxyCut — atalhos de teclado EDITÁVEIS (o dono seleciona outra tecla e redefine)
"use client";

import { create } from "zustand";

export interface ShortcutDef {
  id: string; // id da ação
  label: string; // o que a ação faz
  group: string;
  def: string; // combo padrão (ex: "ctrl+s")
  /** ações de referência (mouse etc) — aparecem na lista mas não são redefiníveis */
  fixed?: boolean;
}

/** Todas as ações que dão pra redefinir. */
export const SHORTCUT_DEFS: ShortcutDef[] = [
  { id: "playPause", label: "Tocar / pausar", group: "Reprodução", def: "space" },
  { id: "frameBack", label: "Andar 1 quadro pra trás (Shift = 10)", group: "Reprodução", def: "arrowleft" },
  { id: "frameFwd", label: "Andar 1 quadro pra frente (Shift = 10)", group: "Reprodução", def: "arrowright" },
  { id: "goHome", label: "Ir pro começo", group: "Reprodução", def: "home" },
  { id: "goEnd", label: "Ir pro fim do conteúdo", group: "Reprodução", def: "end" },
  { id: "split", label: "Cortar (dividir) o clipe na setinha", group: "Edição", def: "s" },
  { id: "delete", label: "Apagar selecionado (clipe na timeline OU mídia no painel)", group: "Edição", def: "delete" },
  { id: "selectAll", label: "Selecionar todas as cenas (vídeo e áudio)", group: "Edição", def: "ctrl+a" },
  { id: "deselect", label: "Desselecionar tudo", group: "Edição", def: "escape" },
  { id: "copy", label: "Copiar clipe", group: "Edição", def: "ctrl+c" },
  { id: "cut", label: "Recortar clipe (copia e apaga)", group: "Edição", def: "ctrl+x" },
  { id: "paste", label: "Colar na posição da setinha", group: "Edição", def: "ctrl+v" },
  { id: "duplicate", label: "Duplicar clipe", group: "Edição", def: "ctrl+d" },
  { id: "mute", label: "Silenciar / ativar som do clipe", group: "Edição", def: "m" },
  { id: "undo", label: "Desfazer", group: "Edição", def: "ctrl+z" },
  { id: "redo", label: "Refazer", group: "Edição", def: "ctrl+shift+z" },
  { id: "save", label: "Salvar projeto agora", group: "Projeto", def: "ctrl+s" },
  // ---- referência (não rebindáveis) ----
  { id: "dragPreview", label: "Arrastar clipe selecionado na tela (mover)", group: "Preview", def: "arrastar", fixed: true },
  { id: "scaleRotate", label: "Cantos da moldura na tela: tamanho · alça de cima: girar", group: "Preview", def: "arrastar", fixed: true },
  { id: "wheelZoom", label: "Zoom da timeline no ponteiro", group: "Timeline", def: "ctrl + roda", fixed: true },
  { id: "trim", label: "Arrastar a beirada do clipe (aparar)", group: "Timeline", def: "arrastar", fixed: true },
  { id: "dropMedia", label: "Arrastar mídia do painel pra timeline (com ímã no início)", group: "Timeline", def: "arrastar", fixed: true },
  { id: "contextMenu", label: "Menu de opções do clipe/faixa", group: "Timeline", def: "botão direito", fixed: true },
  { id: "batchMode", label: "Modo seleção: duplo clique no clipe ativa; clique marca/desmarca", group: "Timeline", def: "duplo clique", fixed: true },
  { id: "batchExit", label: "Sair do modo seleção (e desselecionar tudo)", group: "Timeline", def: "escape", fixed: true },
  { id: "shiftFrames", label: "Shift + ← → : pula 10 quadros de uma vez", group: "Reprodução", def: "shift + setas", fixed: true },
];

const LS_KEY = "galaxiacut_shortcuts_v1";
/** combos alternativos que executam a mesma ação */
const ALIASES: Record<string, string> = { backspace: "delete", "ctrl+y": "ctrl+shift+z" };

type ComboMap = Record<string, string>; // actionId -> combo ("" = sem tecla)

function load(): ComboMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: ComboMap = {};
    for (const d of SHORTCUT_DEFS) {
      const v = parsed[d.id];
      if (typeof v === "string") out[d.id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(m: ComboMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {
    /* noop */
  }
}

/** Normaliza um evento de teclado em combo: "ctrl+shift+z", "space", "delete"… */
export function comboFromEvent(e: KeyboardEvent): string {
  const mod = e.ctrlKey || e.metaKey;
  let k = e.key.toLowerCase();
  if (k === " ") k = "space";
  if (k === "esc") k = "escape";
  if (k === "+") k = "+";
  const parts: string[] = [];
  if (mod) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey && k === "space") parts.push("shift");
  else if (e.shiftKey && k.length > 1) parts.push("shift"); // shift+setas etc.
  parts.push(k);
  return parts.join("+");
}

const PRETTY: Record<string, string> = {
  space: "Espaço",
  escape: "Esc",
  delete: "Delete",
  backspace: "Backspace",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  home: "Home",
  end: "End",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

/** Combo bonito pra mostrar na tela: "Ctrl + Shift + Z". */
export function comboLabel(combo: string): string {
  if (!combo) return "—";
  return combo
    .split("+")
    .map((p) => (PRETTY[p] ?? p.toUpperCase()))
    .join(" + ");
}

interface ShortcutState {
  combos: ComboMap; // só os overrides salvos
  get: (id: string) => string; // combo efetivo (override ou padrão)
  /** redefine uma ação; devolve o nome da ação que perdeu a tecla (conflito) ou null */
  setCombo: (id: string, combo: string) => string | null;
  resetAction: (id: string) => void;
  resetAll: () => void;
}

export const useShortcuts = create<ShortcutState>((set, get) => ({
  combos: load(),
  get: (id) => {
    const def = SHORTCUT_DEFS.find((d) => d.id === id);
    return get().combos[id] ?? def?.def ?? "";
  },
  setCombo: (id, combo) => {
    const combos = { ...get().combos };
    // conflito: tira a tecla de quem já usava
    let conflict: string | null = null;
    for (const d of SHORTCUT_DEFS) {
      if (d.fixed || d.id === id) continue;
      const cur = combos[d.id] ?? d.def;
      if (cur && cur === combo) {
        conflict = d.label;
        combos[d.id] = ""; // desvincula a outra ação
      }
    }
    combos[id] = combo;
    persist(combos);
    set({ combos });
    return conflict;
  },
  resetAction: (id) => {
    const combos = { ...get().combos };
    delete combos[id];
    persist(combos);
    set({ combos });
  },
  resetAll: () => {
    persist({});
    set({ combos: {} });
  },
}));

/** Qual ação esse evento dispara? (considera overrides + apelidos) */
export function actionForEvent(e: KeyboardEvent): string | null {
  const combo = comboFromEvent(e);
  const aliased = ALIASES[combo] ?? combo;
  const st = useShortcuts.getState();
  const map = st.combos;
  for (const d of SHORTCUT_DEFS) {
    if (d.fixed) continue;
    const cur = map[d.id] ?? d.def;
    if (!cur) continue;
    if (cur === combo || cur === aliased) return d.id;
  }
  // shift+seta continua andando 10 quadros mesmo com shift no combo
  const bare = aliased.replace(/^shift\+/, "");
  if (bare !== aliased) {
    for (const d of SHORTCUT_DEFS) {
      if (d.fixed) continue;
      const cur = map[d.id] ?? d.def;
      if (cur && cur === bare) return d.id;
    }
  }
  return null;
}

/** Hook: combo atual de uma ação já formatadinho ("Ctrl + Shift + Z"). */
export function useComboLabel(id: string): string {
  const combos = useShortcuts((s) => s.combos);
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  return comboLabel(combos[id] ?? def?.def ?? "");
}
