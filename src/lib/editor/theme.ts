// GalaxyCut — cores do app (accent configurável pelo usuário).
// Uma cor escolhida vira um monte de variáveis CSS (--gc-accent-*) que os
// componentes usam no lugar do verde fixo — o app inteiro acompanha a escolha.
"use client";

export interface AccentOption {
  id: string;
  label: string;
  hex: string; // cor principal
  hover: string; // versão mais clara (hover de botões)
  deep: string; // versão escura (fim do gradiente do logo)
  text: string; // versão clara (texto em cima de fundo escuro)
}

export const ACCENTS: AccentOption[] = [
  { id: "galaxy", label: "Verde galáxia", hex: "#22C55E", hover: "#1ed467", deep: "#15803D", text: "#86efac" },
  { id: "blue", label: "Azul", hex: "#3B82F6", hover: "#60A5FA", deep: "#1D4ED8", text: "#93c5fd" },
  { id: "violet", label: "Violeta", hex: "#A855F7", hover: "#C084FC", deep: "#7E22CE", text: "#d8b4fe" },
  { id: "pink", label: "Rosa", hex: "#EC4899", hover: "#F472B6", deep: "#BE185D", text: "#f9a8d4" },
  { id: "orange", label: "Laranja", hex: "#F97316", hover: "#FB923C", deep: "#C2410C", text: "#fdba74" },
  { id: "amber", label: "Âmbar", hex: "#EAB308", hover: "#FACC15", deep: "#A16207", text: "#fde047" },
  { id: "cyan", label: "Ciano", hex: "#06B6D4", hover: "#22D3EE", deep: "#0E7490", text: "#67e8f9" },
  { id: "red", label: "Vermelho", hex: "#EF4444", hover: "#F87171", deep: "#B91C1C", text: "#fca5a5" },
];

export function accentById(id: string | undefined): AccentOption {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Níveis de transparência usados pelo app (5 a 50). */
const LEVELS = [5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];

/** Aplica a cor escolhida como variáveis CSS no <html> — o app inteiro segue. */
export function applyAccent(id: string) {
  if (typeof document === "undefined") return;
  const a = accentById(id);
  const [r, g, b] = hexToRgb(a.hex);
  const root = document.documentElement;
  root.style.setProperty("--gc-accent", a.hex);
  root.style.setProperty("--gc-accent-hover", a.hover);
  root.style.setProperty("--gc-accent-deep", a.deep);
  root.style.setProperty("--gc-accent-text", a.text);
  root.style.setProperty("--gc-accent-glow", `rgba(${r},${g},${b},0.35)`);
  for (const lv of LEVELS) root.style.setProperty(`--gc-accent-${lv}`, `rgba(${r},${g},${b},${lv / 100})`);
  // o canvas do preview usa isso (barrinha de carregamento etc.)
  root.style.setProperty("--gc-accent-rgb", `${r},${g},${b}`);
}
