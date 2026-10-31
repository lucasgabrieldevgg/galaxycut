// Atalhos: a normalização de combos e os apelidos são contrato da UI inteira
// (EditorShell despacha pelo actionForEvent). Se o alias "c" → split sumir,
// o usuário que aprendeu "c" pra cortar perde a mão.
import { describe, expect, it } from "vitest";
import { actionForEvent, comboFromEvent, comboLabel } from "./shortcuts";

function ev(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  } as KeyboardEvent;
}

describe("comboFromEvent", () => {
  it("normaliza espaço, escape e maiúsculas", () => {
    expect(comboFromEvent(ev({ key: " " }))).toBe("space");
    expect(comboFromEvent(ev({ key: "Escape" }))).toBe("escape");
    expect(comboFromEvent(ev({ key: "S" }))).toBe("s");
  });

  it("monta combos com modificadores (ctrl cobre o cmd do mac)", () => {
    expect(comboFromEvent(ev({ ctrlKey: true, key: "z" }))).toBe("ctrl+z");
    expect(comboFromEvent(ev({ metaKey: true, key: "z" }))).toBe("ctrl+z");
    expect(comboFromEvent(ev({ ctrlKey: true, shiftKey: true, key: "Z" }))).toBe("ctrl+shift+z");
  });
});

describe("actionForEvent", () => {
  it("resolve as ações padrão", () => {
    expect(actionForEvent(ev({ key: " " }))).toBe("playPause");
    expect(actionForEvent(ev({ key: "s" }))).toBe("split");
    expect(actionForEvent(ev({ ctrlKey: true, key: "e" }))).toBe("export");
    expect(actionForEvent(ev({ ctrlKey: true, key: "," }))).toBe("settings");
  });

  it("honra os apelidos (backspace = delete, c = split)", () => {
    expect(actionForEvent(ev({ key: "Backspace" }))).toBe("delete");
    expect(actionForEvent(ev({ key: "c" }))).toBe("split");
    expect(actionForEvent(ev({ ctrlKey: true, key: "y" }))).toBe("redo");
  });

  it("shift+seta cai na ação da seta (pulo de 10 quadros)", () => {
    expect(actionForEvent(ev({ shiftKey: true, key: "ArrowRight" }))).toBe("frameFwd");
    expect(actionForEvent(ev({ shiftKey: true, key: "ArrowLeft" }))).toBe("frameBack");
  });

  it("tecla solta devolve null", () => {
    expect(actionForEvent(ev({ key: "F13" }))).toBeNull();
  });
});

describe("comboLabel", () => {
  it("formata bonito pra tela", () => {
    expect(comboLabel("ctrl+shift+z")).toBe("Ctrl + Shift + Z");
    expect(comboLabel("space")).toBe("Espaço");
    expect(comboLabel("")).toBe("—");
  });
});
