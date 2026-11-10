// i18n: o contrato é "zero gap" — EN e ES cobrem EXATAMENTE as chaves de PT.
// Cada chave nova que entrar só no PT quebra este teste de propósito.
import { describe, expect, it } from "vitest";
import { EN, ES, PT, t, useLang } from "./i18n";
import { TRANSITIONS } from "./types";

describe("dicionários", () => {
  it("EN cobre exatamente as mesmas chaves de PT", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(PT).sort());
  });

  it("ES cobre exatamente as mesmas chaves de PT", () => {
    expect(Object.keys(ES).sort()).toEqual(Object.keys(PT).sort());
  });

  it("nenhuma tradução é string vazia", () => {
    for (const [k, v] of Object.entries(EN)) expect(v, `EN.${k}`).not.toBe("");
    for (const [k, v] of Object.entries(ES)) expect(v, `ES.${k}`).not.toBe("");
  });
});

describe("transições", () => {
  it("todo tipo de TRANSITIONS tem chave trans.* nos 3 idiomas", () => {
    for (const tr of TRANSITIONS) {
      const key = `trans.${tr.type}`;
      expect(PT[key], `PT.${key}`).toBeTruthy();
      expect(EN[key], `EN.${key}`).toBeTruthy();
      expect(ES[key], `ES.${key}`).toBeTruthy();
    }
  });

  it("nenhuma transição mostra a chave crua na tela", () => {
    for (const tr of TRANSITIONS) {
      const key = `trans.${tr.type}`;
      for (const lang of ["pt", "en", "es"] as const) {
        useLang.setState({ lang });
        expect(t(key), `${lang}:${key}`).not.toBe(key);
      }
    }
    useLang.setState({ lang: "pt" });
  });
});

describe("t()", () => {
  it("traduz no idioma corrente", () => {
    useLang.setState({ lang: "pt" });
    expect(t("ed.textDefault")).toBe("Seu texto aqui");
    useLang.setState({ lang: "en" });
    expect(t("ed.textDefault")).toBe("Your text here");
    useLang.setState({ lang: "es" });
    expect(t("ed.textDefault")).toBe("Tu texto aquí");
  });

  it("chave inexistente devolve a própria chave (não explode)", () => {
    expect(t("chave.que.nao.existe")).toBe("chave.que.nao.existe");
  });

  it("substitui placeholders {nome}", () => {
    useLang.setState({ lang: "pt" });
    expect(t("home.upToDate", { v: "9" })).toContain("(9)");
  });

  it("volta pro PT quando o idioma ativo não tem a chave", () => {
    // simula um dicionário incompleto sem depender de estado global sujo
    const backup = EN["ed.textDefault"];
    delete EN["ed.textDefault"];
    useLang.setState({ lang: "en" });
    expect(t("ed.textDefault")).toBe("Seu texto aqui"); // fallback PT
    EN["ed.textDefault"] = backup;
  });
});
