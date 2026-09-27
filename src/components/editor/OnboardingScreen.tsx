// GalaxyCut — configuração inicial (primeira vez que o app abre):
// 1) idioma · 2) cor do app · 3) [desktop] modelo de IA de legendas (opcional,
// com checkboxes pros modelos e download com progresso) · 4) "tudo pronto".
// No navegador o passo de IA não aparece (a IA é do app baixado).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/lib/editor/settings";
import { useLang, LANGUAGES, useT, t as tr } from "@/lib/editor/i18n";
import { ACCENTS } from "@/lib/editor/theme";
import { downloadModel, WhisperModelId } from "@/lib/editor/subtitles";
import { isDesktopBuild } from "@/lib/editor/desktop";
import { BrandLogo } from "./BrandLogo";
import { toast } from "sonner";
import { Languages, Palette, Sparkles, PartyPopper, ArrowLeft, ArrowRight, Check, Download, Loader2 } from "lucide-react";

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const accent = useSettings((s) => s.accent);
  const setSettings = useSettings((s) => s.set);
  const inApp = isDesktopBuild();
  // desktop: idioma → cor → IA → pronto / web: idioma → cor → pronto
  const totalSteps = inApp ? 4 : 3;
  const [step, setStep] = useState(1);
  // download de modelos (checkboxes: pode marcar quantos quiser)
  const [pick, setPick] = useState<Record<WhisperModelId, boolean>>({ tiny: false, base: true, small: false });
  const [downloading, setDownloading] = useState<WhisperModelId | null>(null);
  const [pct, setPct] = useState(0);
  const [finished, setFinished] = useState<WhisperModelId[]>([]);

  const modelLabel = (id: WhisperModelId) =>
    id === "tiny" ? tr("sub.modelFast") : id === "base" ? tr("sub.modelBalanced") : tr("sub.modelAccurate");
  const modelHint = (id: WhisperModelId) =>
    id === "tiny" ? tr("sub.modelFastHint") : id === "base" ? tr("sub.modelBalancedHint") : tr("sub.modelAccurateHint");

  async function downloadPicked() {
    const queue = (Object.keys(pick) as WhisperModelId[]).filter((m) => pick[m] && !finished.includes(m));
    if (!queue.length) {
      setStep(totalSteps);
      return;
    }
    let failed: WhisperModelId | null = null;
    for (const m of queue) {
      setDownloading(m);
      setPct(0);
      try {
        await downloadModel(m, (p) => setPct(p.pct));
        setFinished((f) => [...f, m]);
        toast.success(tr("ob.downloadDone"));
      } catch {
        failed = m;
        toast.error(tr("ob.downloadFail", { name: modelLabel(m) }));
      }
    }
    setDownloading(null);
    // seguiu tudo (ou falhou)? vai pra tela final do mesmo jeito
    void failed;
    setStep(totalSteps);
  }

  function finish() {
    useSettings.getState().set({ onboarded: true });
    onDone();
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-y-auto bg-[#080b11] px-4 py-10 text-zinc-200 timeline-scroll">
      {/* fundo galáxia */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(900px 500px at 12% -8%, var(--gc-accent-10), transparent 65%)," +
            "radial-gradient(1100px 640px at 96% 4%, rgba(99,102,241,0.12), transparent 65%)," +
            "radial-gradient(760px 520px at 50% 110%, var(--gc-accent-6), transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative flex w-full max-w-md flex-1 flex-col">
        {/* topo: logo + passo */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BrandLogo size={64} />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Galaxy<span className="text-[var(--gc-accent)]">Cut</span>
            </h1>
            <p className="mt-1 text-[12px] text-zinc-500">{step === 1 ? t("ob.welcomeSub") : t("ob.step", { n: step - 1, total: totalSteps - 1 })}</p>
          </div>
        </div>

        {/* ---- passo 1: idioma ---- */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-zinc-100">
                <Languages className="h-5 w-5 text-sky-400" /> {t("ob.langTitle")}
              </h2>
              <p className="mb-4 text-[12px] text-zinc-500">{t("ob.langHint")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLang(l.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition ${
                    lang === l.id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
                  }`}
                >
                  <span className="text-2xl leading-none">{l.flag}</span>
                  <span className={`text-[11px] font-medium ${lang === l.id ? "text-[var(--gc-accent)]" : "text-zinc-400"}`}>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- passo 2: cor do app ---- */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-zinc-100">
                <Palette className="h-5 w-5 text-fuchsia-400" /> {t("ob.colorTitle")}
              </h2>
              <p className="mb-4 text-[12px] text-zinc-500">{t("ob.colorHint")}</p>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSettings({ accent: a.id })}
                  title={a.label}
                  aria-label={a.label}
                  className={`flex h-16 items-center justify-center rounded-xl border-2 transition hover:scale-105 ${
                    accent === a.id ? "border-white shadow-[0_0_14px_var(--gc-accent-50)]" : "border-transparent"
                  }`}
                  style={{ background: `linear-gradient(135deg, ${a.hex}, ${a.deep})` }}
                >
                  {accent === a.id && <Check className="h-5 w-5 text-white drop-shadow" />}
                </button>
              ))}
            </div>
            {/* amostra do que a cor muda */}
            <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-[#232d3d] bg-[#0c1017] p-3">
              <Button size="sm" className="bg-[var(--gc-accent)] font-bold text-black hover:bg-[var(--gc-accent-hover)]">Aa</Button>
              <span className="rounded-full border border[var(--gc-accent-40)] px-3 py-1 text-[11px] text-[var(--gc-accent)]">timeline</span>
              <span className="h-6 w-6 rounded-full border-2 border-[var(--gc-accent)]" />
            </div>
          </div>
        )}

        {/* ---- passo 3 (só no app): modelos de IA de legendas ---- */}
        {step === 3 && inApp && (
          <div className="space-y-4">
            <div>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-zinc-100">
                <Sparkles className="h-5 w-5 text-[var(--gc-accent)]" /> {t("ob.aiTitle")}
              </h2>
              <p className="mb-1 text-[12px] leading-relaxed text-zinc-500">{t("ob.aiHint")}</p>
              <p className="text-[11px] text-zinc-600">{t("ob.aiOptional")}</p>
            </div>
            <div className="space-y-2">
              {(["tiny", "base", "small"] as const).map((id) => {
                const done = finished.includes(id);
                const active = downloading === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!!downloading}
                    onClick={() => setPick((p) => ({ ...p, [id]: !p[id] }))}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                      pick[id] ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
                    } ${done ? "opacity-60" : ""}`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                        pick[id] || done ? "border-[var(--gc-accent)] bg-[var(--gc-accent)]" : "border-zinc-600"
                      }`}
                    >
                      {(pick[id] || done) && <Check className="h-3.5 w-3.5 text-black" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] font-semibold ${pick[id] || done ? "text-[var(--gc-accent)]" : "text-zinc-200"}`}>
                        {modelLabel(id)} {done && "✓"}
                      </span>
                      <span className="block text-[10px] text-zinc-500">{modelHint(id)}</span>
                    </span>
                    {active && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--gc-accent)]" />}
                  </button>
                );
              })}
            </div>
            {downloading && (
              <div className="space-y-2 rounded-xl border border[var(--gc-accent-30)] bg[var(--gc-accent-5)] p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-zinc-300">
                    <Download className="h-3.5 w-3.5 text-[var(--gc-accent)]" /> {t("ob.downloading", { name: modelLabel(downloading) })}
                  </span>
                  <span className="font-mono text-[var(--gc-accent)]">{Math.round(pct * 100)}%</span>
                </div>
                <Progress value={pct * 100} className="h-1.5 bg-[#0a0d14]" />
              </div>
            )}
          </div>
        )}

        {/* ---- passo final: tudo pronto ---- */}
        {step === totalSteps && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border[var(--gc-accent-40)] bg[var(--gc-accent-10)]">
              <PartyPopper className="h-9 w-9 text-[var(--gc-accent)]" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-100">{t("ob.ready")}</h2>
            <p className="max-w-xs text-[13px] leading-relaxed text-zinc-500">{t("ob.readySub")}</p>
            <Button
              onClick={finish}
              className="mt-2 h-12 gap-2 rounded-xl bg-[var(--gc-accent)] px-8 text-[15px] font-bold text-black shadow-[0_0_24px_var(--gc-accent-glow)] transition hover:scale-[1.02] hover:bg-[var(--gc-accent-hover)]"
            >
              {t("ob.start")} <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* navegação embaixo (some na última tela) */}
        {step < totalSteps && (
          <div className="mt-8 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="gap-1 text-zinc-400 disabled:opacity-0"
            >
              <ArrowLeft className="h-4 w-4" /> {t("ob.back")}
            </Button>
            {/* bolinhas do progresso */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i + 1 === step ? "w-5 bg-[var(--gc-accent)]" : i + 1 < step ? "w-1.5 bg-[var(--gc-accent-50)]" : "w-1.5 bg-[#2a3546]"
                  }`}
                />
              ))}
            </div>
            {step === 3 && inApp ? (
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  onClick={() => setStep(totalSteps)}
                  className="text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  {t("ob.downloadSkip")}
                </Button>
                <Button
                  onClick={() => void downloadPicked()}
                  disabled={!!downloading}
                  className="h-9 gap-1.5 bg-[var(--gc-accent)] text-[13px] font-bold text-black hover:bg-[var(--gc-accent-hover)]"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {t("ob.downloadNow")}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
                className="h-9 gap-1 bg-[var(--gc-accent)] text-[13px] font-bold text-black hover:bg-[var(--gc-accent-hover)]"
              >
                {t("ob.next")} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
