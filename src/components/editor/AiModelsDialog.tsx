// GalaxyCut — catálogo de modelos de IA: o que cada modelo faz, quanto baixa,
// o que exige de máquina e o que roda 100% local. As tarefas são DECLARADAS
// (não é tudo "transcrição") — o que ainda não roda no app vem "em breve".
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bot, Download, Languages, Gauge, Cpu, ShieldCheck, MemoryStick } from "lucide-react";
import { AI_MODELS, AI_TASKS, type AiModelInfo, type AiTaskId } from "@/lib/editor/aiModels";
import { useSettings } from "@/lib/editor/settings";
import { useT } from "@/lib/editor/i18n";

/** botão de abrir + diálogo, autocontido (encaixa em qualquer painel sem fiação) */
export function AiModelsButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#232d3d] bg-[#0e1320] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:border-[var(--gc-accent-40)] hover:text-[var(--gc-accent)]"
      >
        <Bot className="h-3.5 w-3.5" /> {t("ai.title")}
      </button>
      <AiModelsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AiModelsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const model = useSettings((s) => s.whisperModel);
  const setSettings = useSettings((s) => s.set);
  const [task, setTask] = useState<AiTaskId | "all">("all");

  const shown = task === "all" ? AI_MODELS : AI_MODELS.filter((m) => m.task === task);
  const taskName = (id: AiTaskId) => t(AI_TASKS.find((x) => x.id === id)?.nameKey ?? "ai.taskTranscribe");

  const chip = (active: boolean, available: boolean) =>
    `rounded-full border px-2.5 py-1 text-[11px] transition ${
      active
        ? "border-[var(--gc-accent)] bg-[var(--gc-accent-15)] font-semibold text-[var(--gc-accent)]"
        : available
          ? "border-[#232d3d] bg-[#10151d] text-zinc-300 hover:border-[#2a3546]"
          : "border-[#232d3d] bg-transparent text-zinc-500 hover:text-zinc-400"
    }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-[#232d3d] bg-[#0c1017] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-[var(--gc-accent)]" /> {t("ai.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">{t("ai.intro")}</DialogDescription>
        </DialogHeader>

        {/* tarefas declaradas: o que cada modelo FAZ (não é tudo transcrição) */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("ai.tasks")}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setTask("all")} className={chip(task === "all", true)}>
              {t("ai.all")}
            </button>
            {AI_TASKS.map((x) => (
              <button key={x.id} type="button" onClick={() => setTask(x.id)} className={chip(task === x.id, x.available)}>
                {t(x.nameKey)}
                {!x.available && <span className="text-zinc-600"> · {t("ai.soon")}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* modelos */}
        <div className="space-y-2">
          {shown.map((m) => (
            <ModelCard
              key={m.id}
              m={m}
              taskName={taskName(m.task)}
              current={m.status === "built-in" && m.id === model}
              onPick={() => setSettings({ whisperModel: m.id as "tiny" | "base" | "small" })}
            />
          ))}
        </div>

        <p className="text-[11px] leading-snug text-zinc-500">{t("ai.footNote")}</p>
      </DialogContent>
    </Dialog>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <span className="ml-0.5 flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-[var(--gc-accent)]" : "bg-[#2a3546]"}`} />
      ))}
    </span>
  );
}

function ModelCard({
  m,
  taskName,
  current,
  onPick,
}: {
  m: AiModelInfo;
  taskName: string;
  current: boolean;
  onPick: () => void;
}) {
  const t = useT();
  const planned = m.status === "planned";
  return (
    <div
      className={`rounded-lg border p-3 text-left transition ${
        current
          ? "border-[var(--gc-accent)] bg-[var(--gc-accent-7)]"
          : planned
            ? "border-[#232d3d] bg-[#0e1320]"
            : "border-[#232d3d] bg-[#10151d] hover:border-[#2a3546]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-zinc-100">{m.name}</span>
        <span className="rounded-full bg-[var(--gc-accent-15)] px-2 py-0.5 text-[10px] font-medium text-[var(--gc-accent)]">
          {taskName}
        </span>
        {current && (
          <span className="rounded-full bg-[var(--gc-accent)] px-2 py-0.5 text-[10px] font-bold text-black">
            {t("ai.current")}
          </span>
        )}
        {planned && (
          <span className="rounded-full border border-[#2a3546] px-2 py-0.5 text-[10px] text-zinc-500">{t("ai.soon")}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" /> {m.sizeMb ? t("ai.mb", { n: m.sizeMb }) : "—"}
        </span>
        <span className="flex items-center gap-1">
          <Languages className="h-3 w-3" /> {m.langs !== "—" ? t("ai.nLangs", { n: m.langs }) : "—"}
        </span>
        <span className="flex items-center gap-1">
          <Gauge className="h-3 w-3" /> {t("ai.speed")}
          <Dots n={m.speed} />
        </span>
        <span className="flex items-center gap-1">
          <Cpu className="h-3 w-3" /> {t("ai.accuracy")}
          <Dots n={m.accuracy} />
        </span>
        <span className="flex items-center gap-1">
          <MemoryStick className="h-3 w-3" /> {m.memory}
        </span>
        {m.local && (
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="h-3 w-3" /> {t("ai.local")}
          </span>
        )}
      </div>

      {m.status === "built-in" && !current && (
        <button
          type="button"
          onClick={onPick}
          className="mt-2 text-[11px] font-semibold text-[var(--gc-accent)] transition hover:underline"
        >
          {t("ai.use")} →
        </button>
      )}
      {planned && <p className="mt-1.5 text-[10px] text-zinc-600">{t("ai.planned")}</p>}
    </div>
  );
}
