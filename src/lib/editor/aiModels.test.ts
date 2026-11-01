// Catálogo de IA: integridade — toda tarefa citada existe, todo modelo embutido
// é um Whisper real, toda chave de i18n existe no dicionário.
import { describe, expect, it } from "vitest";
import { AI_MODELS, AI_TASKS } from "./aiModels";
import { PT } from "./i18n";

describe("catálogo de modelos de IA", () => {
  it("toda tarefa citada por um modelo existe no catálogo de tarefas", () => {
    const ids = new Set(AI_TASKS.map((x) => x.id));
    for (const m of AI_MODELS) {
      expect(ids.has(m.task), `modelo ${m.id} cita tarefa ${m.task} inexistente`).toBe(true);
    }
  });

  it("v9.4: embutidos = 4 Whisper + 4 motores de transformação de voz (todos funcionais)", () => {
    const builtIn = AI_MODELS.filter((m) => m.status === "built-in").map((m) => m.id).sort();
    expect(builtIn).toEqual(["base", "medium", "small", "tiny", "vt-f2m", "vt-idosa", "vt-jovem", "vt-m2f"]);
  });

  it("v9.4: nenhum modelo fictício — todo card tem ação real (whisper/transform)", () => {
    for (const m of AI_MODELS) {
      expect(["whisper", "transform"]).toContain(m.action);
    }
  });

  it("toda chave de i18n citada existe no dicionário PT", () => {
    for (const x of AI_TASKS) {
      expect(PT[x.nameKey], `chave ${x.nameKey} ausente`).toBeTruthy();
      expect(PT[x.descKey], `chave ${x.descKey} ausente`).toBeTruthy();
    }
  });

  it("tarefa marcada disponível tem pelo menos um modelo embutido", () => {
    for (const task of AI_TASKS.filter((x) => x.available)) {
      const ok = AI_MODELS.some((m) => m.task === task.id && m.status === "built-in");
      expect(ok, `tarefa ${task.id} disponível sem modelo`).toBe(true);
    }
  });

  it("velocidade e precisão ficam na escala 1–3", () => {
    for (const m of AI_MODELS) {
      expect(m.speed).toBeGreaterThanOrEqual(1);
      expect(m.speed).toBeLessThanOrEqual(3);
      expect(m.accuracy).toBeGreaterThanOrEqual(1);
      expect(m.accuracy).toBeLessThanOrEqual(3);
    }
  });
});
