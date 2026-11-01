// GalaxyCut — dados da demonstração dos catálogos com FOTOS REAIS (v9.3).
// Efeitos, transições e animações mostram miniaturas geradas pelo PRÓPRIO
// motor (drawFrame) rodando sobre fotos: o quadradinho do catálogo é
// exatamente o que a preview e a exportação produzem — paridade total,
// sem bifurcar o motor (decisão estrutural nº 1 do brain/context.md).
// Este módulo é 100% puro (só dados/tipos) — quem desenha é o fxDemoRender.
import type { EffectType } from "./types";

/**
 * Fotos de demonstração (public/fx-demo/*.jpg — geradas por IA para este fim,
 * ~160KB no total). Quadradas porque os tiles são quadrados (contain-fill).
 * - woman/man/kid: retratos pra linha "Pessoas & Beleza" (pele, grades, vibraça)
 * - scene: cena urbana na golden hour com neon — mostra bem grades de cor,
 *   chuva/neve, vhs, glitch e companhia
 */
export type FxDemoPhoto = "woman" | "man" | "kid" | "scene";

/** base das URLs (respeita NEXT_PUBLIC_BASE_PATH — mesmo padrão do updater) */
export const FX_DEMO_BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/fx-demo/";

export const FX_DEMO_FILE: Record<FxDemoPhoto, string> = {
  woman: "woman.jpg",
  man: "man.jpg",
  kid: "kid.jpg",
  scene: "scene.jpg",
};

/**
 * Qual foto demonstra melhor cada efeito. A linha Pessoas & Beleza ganha o
 * retrato na medida (Homem Cinema → homem, Criança Vibrante → criança…);
 * o resto usa a cena urbana, que realça grades de cor e clima.
 */
export function photoForEffect(type: EffectType): FxDemoPhoto {
  switch (type) {
    case "manGrade":
      return "man";
    case "kidPop":
      return "kid";
    case "skinSmooth":
    case "beautyGlow":
    case "womanGrade":
    case "clarity":
      return "woman";
    default:
      return "scene";
  }
}

/** fotos da demonstração de transições: cena → retrato (troca bem visível) */
export const FX_TRANSITION_PHOTOS: readonly [FxDemoPhoto, FxDemoPhoto] = ["scene", "woman"];

/** foto das demonstrações de animação (entrada/saída/combo) */
export const FX_ANIM_PHOTO: FxDemoPhoto = "scene";

/**
 * Efeitos que só fazem sentido em MOVIMENTO — estes animam no tile (loop no
 * rAF compartilhado). Os demais (grades de cor, vinheta, pixelize…) são um
 * frame fixo, que já demonstra o visual por completo.
 * Lista curta e consciente: cada item aqui custa um redraw ~30fps enquanto
 * o tile está visível.
 */
export function effectAnimates(type: EffectType): boolean {
  switch (type) {
    case "shake":
    case "glitch":
    case "flash":
    case "vhs":
    case "lightning":
    case "rain":
    case "snowfall":
    case "sciFiScan":
      return true;
    default:
      return false;
  }
}
