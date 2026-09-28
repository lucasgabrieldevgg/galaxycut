// GalaxyCut — configurações do aplicativo (geral, atalhos EDITÁVEIS, atualizações, chaves de busca)
// v7.1: COR DO APP configurável (accent), tudo traduzido e "ver onboarding de novo".
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettings, PLAYHEAD_MODES, PlayheadMode } from "@/lib/editor/settings";
import { ACCENTS } from "@/lib/editor/theme";
import { SHORTCUT_DEFS, comboFromEvent, comboLabel, useShortcuts } from "@/lib/editor/shortcuts";
import { CAPTION_PRESETS } from "@/lib/editor/types";
import { WHISPER_MODELS, WhisperModelId } from "@/lib/editor/subtitles";
import { APP_VERSION } from "@/lib/editor/version";
import { checkForUpdate } from "@/lib/editor/updater";
import { isDesktopBuild } from "@/lib/editor/desktop";
import { LANGUAGES, useLang, t as tr } from "@/lib/editor/i18n";
import { useT } from "@/lib/editor/i18n";
import { PresetPreview } from "./PresetPreview";
import { useUpdatePrompt } from "./UpdateDialog";
import { toast } from "sonner";
import {
  Keyboard, SlidersHorizontal, KeyRound, ExternalLink, ArrowUpDown, Pencil, RotateCcw, RefreshCw, Languages, Save, Palette, Rocket,
} from "lucide-react";

/** evento pra reabrir o onboarding (GalaxyCutApp escuta) */
function reopenOnboarding() {
  window.dispatchEvent(new CustomEvent("galaxycut:onboarding"));
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-hidden border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[var(--gc-accent)]" /> {t("st.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">{t("st.desc")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="geral" className="mt-1">
          <TabsList className="grid h-9 w-full grid-cols-3 bg-[#151b26]">
            <TabsTrigger value="geral" className="gap-1.5 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <SlidersHorizontal className="h-3 w-3" /> {t("st.general")}
            </TabsTrigger>
            <TabsTrigger value="atalhos" className="gap-1.5 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <Keyboard className="h-3 w-3" /> {t("st.shortcuts")}
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <KeyRound className="h-3 w-3" /> {t("st.api")}
            </TabsTrigger>
          </TabsList>

          {/* ---------- GERAL ---------- */}
          <TabsContent value="geral" className="mt-3">
            <ScrollArea className="h-[52vh] pr-3">
              <div className="space-y-5">
                <LanguageSection />
                <AccentSection />

                {isDesktopBuild() && <AutosaveSection />}

                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <ArrowUpDown className="h-3.5 w-3.5 text-amber-400" /> {t("st.playhead")}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PLAYHEAD_MODES.map((m) => (
                      <PlayheadModeBtn key={m.id} id={m.id} />
                    ))}
                  </div>
                </div>

                <GeneralSwitches />

                {/* atualizações: coisa do APP (no navegador o site se atualiza sozinho) */}
                {isDesktopBuild() && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-zinc-300">{t("st.updates")}</p>
                    <UpdateSection />
                  </div>
                )}

                <div>
                  <p className="mb-1.5 text-xs font-medium text-zinc-300">
                    {t("st.whisper")} {isDesktopBuild() ? t("st.whisperApp") : t("st.whisperWeb")}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {WHISPER_MODELS.map((m) => (
                      <WhisperBtn key={m.id} id={m.id} />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-zinc-300">{t("st.captionStyle")}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CAPTION_PRESETS.map((p) => (
                      <CaptionBtn key={p.id} id={p.id} name={p.name} props={p.props} />
                    ))}
                  </div>
                </div>

                <div className="flex justify-center pb-2">
                  <button
                    onClick={reopenOnboarding}
                    className="flex items-center gap-1.5 rounded-lg border border-[#232d3d] bg-[#0e1320] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:border[var(--gc-accent-40)] hover:text-[var(--gc-accent)]"
                  >
                    <Rocket className="h-3.5 w-3.5" /> {t("st.redoOnboarding")}
                  </button>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ---------- ATALHOS (redefiníveis) ---------- */}
          <TabsContent value="atalhos" className="mt-3">
            <ShortcutsTab />
          </TabsContent>

          {/* ---------- CHAVES DE BUSCA ---------- */}
          <TabsContent value="api" className="mt-3">
            <ScrollArea className="h-[48vh] pr-3">
              <StockKeysTab />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** idioma do app (português / english / español) */
function LanguageSection() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
        <Languages className="h-3.5 w-3.5 text-sky-400" /> {t("st.language")}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {LANGUAGES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            className={`rounded-lg border p-2 text-center transition ${
              lang === l.id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
            }`}
          >
            <span className="block text-base leading-none">{l.flag}</span>
            <span className={`mt-1 block text-[10px] font-medium ${lang === l.id ? "text-[var(--gc-accent)]" : "text-zinc-400"}`}>{l.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-zinc-600">{t("st.languageHint")}</p>
    </div>
  );
}

/** COR DO APP — o usuário escolhe e o app inteiro acompanha (variáveis CSS) */
function AccentSection() {
  const t = useT();
  const accent = useSettings((s) => s.accent);
  const set = useSettings((s) => s.set);
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
        <Palette className="h-3.5 w-3.5 text-fuchsia-400" /> {t("st.accent")}
      </p>
      <div className="flex flex-wrap gap-2">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => set({ accent: a.id })}
            title={a.label}
            aria-label={a.label}
            className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${
              accent === a.id ? "border-white shadow-[0_0_10px_var(--gc-accent-50)]" : "border-transparent"
            }`}
            style={{ background: `linear-gradient(135deg, ${a.hex}, ${a.deep})` }}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] text-zinc-600">{t("st.accentHint")}</p>
    </div>
  );
}

/** autosave em disco (app de desktop) — intervalo configurável */
function AutosaveSection() {
  const t = useT();
  const autosaveMin = useSettings((s) => s.autosaveMin);
  const set = useSettings((s) => s.set);
  const opts: { v: number; label: string }[] = [
    { v: 1, label: "1 min" },
    { v: 2, label: "2 min" },
    { v: 3, label: "3 min" },
    { v: 5, label: "5 min" },
    { v: 10, label: "10 min" },
    { v: 0, label: t("st.off") },
  ];
  return (
    <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
        <Save className="h-3.5 w-3.5 text-[var(--gc-accent)]" /> {t("st.autosave")}
      </p>
      <div className="grid grid-cols-6 gap-1">
        {opts.map((o) => (
          <button
            key={o.v}
            onClick={() => set({ autosaveMin: o.v })}
            className={`rounded-md border px-1 py-1 text-[10px] transition ${
              autosaveMin === o.v ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]" : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">{t("st.autosaveHint")}</p>
    </div>
  );
}

function UpdateSection() {
  const t = useT();
  const auto = useSettings((s) => s.autoUpdateCheck);
  const set = useSettings((s) => s.set);
  const [checking, setChecking] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-[#2a3546] bg-[#0e1320] p-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="autoupd" className="text-[11px] font-normal leading-snug text-zinc-400">
          {t("st.autoUpdate")}
        </Label>
        <Switch id="autoupd" checked={auto} onCheckedChange={(v) => set({ autoUpdateCheck: v })} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-zinc-600">{t("st.installed", { v: APP_VERSION })}</span>
        <Button
          size="sm"
          className="h-7 gap-1 bg-[var(--gc-accent)] px-2.5 text-[10px] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            void checkForUpdate().then((u) => {
              setChecking(false);
              if (u) useUpdatePrompt.getState().show(u);
              else toast.success(t("home.upToDate", { v: APP_VERSION }));
            });
          }}
        >
          <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
          {checking ? t("st.checking") : t("st.checkNow")}
        </Button>
      </div>
    </div>
  );
}

function PlayheadModeBtn({ id }: { id: PlayheadMode }) {
  const cur = useSettings((s) => s.playheadMode);
  const label = tr(`pm.${id}`);
  const hint = tr(`pm.${id}Hint`);
  return (
    <button
      onClick={() => useSettings.getState().set({ playheadMode: id })}
      className={`rounded-lg border p-2.5 text-left transition ${cur === id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"}`}
    >
      <span className={`block text-[11px] font-semibold ${cur === id ? "text-[var(--gc-accent)]" : "text-zinc-300"}`}>{label}</span>
      <span className="block text-[10px] leading-snug text-zinc-500">{hint}</span>
    </button>
  );
}

function GeneralSwitches() {
  const t = useT();
  const snapEnabled = useSettings((s) => s.snapEnabled);
  const showWaveOnVideo = useSettings((s) => s.showWaveOnVideo);
  const set = useSettings((s) => s.set);
  return (
    <div className="space-y-3 rounded-lg border border-[#2a3546] bg-[#0e1320] p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium text-zinc-300">{t("st.snap")}</p>
          <p className="text-[10px] text-zinc-500">{t("st.snapHint")}</p>
        </div>
        <Switch checked={snapEnabled} onCheckedChange={(v) => set({ snapEnabled: v })} className="data-[state=checked]:bg-[var(--gc-accent)]" />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium text-zinc-300">{t("st.wave")}</p>
          <p className="text-[10px] text-zinc-500">{t("st.waveHint")}</p>
        </div>
        <Switch checked={showWaveOnVideo} onCheckedChange={(v) => set({ showWaveOnVideo: v })} className="data-[state=checked]:bg-[var(--gc-accent)]" />
      </div>
    </div>
  );
}

function WhisperBtn({ id }: { id: WhisperModelId }) {
  const cur = useSettings((s) => s.whisperModel);
  const label = id === "tiny" ? tr("sub.modelFast") : id === "base" ? tr("sub.modelBalanced") : tr("sub.modelAccurate");
  const hint = id === "tiny" ? tr("sub.modelFastHint") : id === "base" ? tr("sub.modelBalancedHint") : tr("sub.modelAccurateHint");
  return (
    <button
      onClick={() => useSettings.getState().set({ whisperModel: id })}
      className={`rounded-lg border p-2 text-center transition ${cur === id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"}`}
    >
      <span className={`block text-[11px] font-semibold ${cur === id ? "text-[var(--gc-accent)]" : "text-zinc-300"}`}>{label}</span>
      <span className="block text-[9px] leading-tight text-zinc-500">{hint}</span>
    </button>
  );
}

function CaptionBtn({ id, name, props }: { id: string; name: string; props: Record<string, unknown> }) {
  const cur = useSettings((s) => s.captionPreset);
  return (
    <button
      onClick={() => useSettings.getState().set({ captionPreset: id })}
      className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition ${cur === id ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"}`}
      title={name}
    >
      {/* v7.3: preview em canvas com as cores reais (contorno atrás, como no vídeo) */}
      <PresetPreview tp={props} height={30} />
      <span className={`w-full truncate text-center text-[8.5px] ${cur === id ? "text-[var(--gc-accent)]" : "text-zinc-500"}`}>{name}</span>
    </button>
  );
}

/** aba de chaves de busca (reativa) */
function StockKeysTab() {
  const t = useT();
  const keys = useSettings((s) => s.keys);
  const set = useSettings((s) => s.set);
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-[#232d3d] bg-[#0e1320] p-3 text-[11px] leading-relaxed text-zinc-500">
        {t("st.apiNote")}
      </p>
      <div>
        <Label className="mb-1 block text-[11px] text-zinc-400">{t("st.pexelsKey")}</Label>
        <Input
          type="password"
          value={keys.pexels}
          onChange={(e) => set({ keys: { ...keys, pexels: e.target.value.trim() } })}
          placeholder={t("st.pasteHere")}
          className="h-8 border-[#2a3546] bg-[#0e1320] text-xs text-zinc-200 placeholder:text-zinc-600"
        />
        <a
          href="https://www.pexels.com/api/"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--gc-accent)] hover:underline"
        >
          {t("st.getKey", { name: "Pexels" })} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div>
        <Label className="mb-1 block text-[11px] text-zinc-400">{t("st.pixabayKey")}</Label>
        <Input
          type="password"
          value={keys.pixabay}
          onChange={(e) => set({ keys: { ...keys, pixabay: e.target.value.trim() } })}
          placeholder={t("st.pasteHere")}
          className="h-8 border-[#2a3546] bg-[#0e1320] text-xs text-zinc-200 placeholder:text-zinc-600"
        />
        <a
          href="https://pixabay.com/api/docs/"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--gc-accent)] hover:underline"
        >
          {t("st.getKey", { name: "Pixabay" })} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{t("st.licenses")}</p>
        <p className="text-[10px] leading-relaxed text-zinc-500">{t("st.licensesNote")}</p>
      </div>
    </div>
  );
}

// ---------------- aba ATALHOS: redefinir teclas ----------------
function ShortcutsTab() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [capturing, setCapturing] = useState<string | null>(null);
  const shortcuts = useShortcuts();

  // captura a próxima tecla pressionada pra virar o novo atalho
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = comboFromEvent(e);
      if (combo === "escape") {
        setCapturing(null); // Esc cancela a captura
        return;
      }
      if (combo === "backspace") {
        shortcuts.setCombo(capturing, ""); // Backspace desvincula
        toast.info(t("st.scUnbinded"));
        setCapturing(null);
        return;
      }
      const conflict = shortcuts.setCombo(capturing, combo);
      if (conflict) toast.info(t("st.scConflict", { name: conflict }));
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as EventListenerOptions);
  }, [capturing, shortcuts, t]);

  const groups = useMemo(() => {
    const f = SHORTCUT_DEFS.filter(
      (d) =>
        !search.trim() ||
        tr(`sc.${d.id}`).toLowerCase().includes(search.toLowerCase()) ||
        tr(`scg.${d.group === "Reprodução" ? "playback" : d.group === "Edição" ? "editing" : d.group === "Projeto" ? "project" : d.group === "Preview" ? "preview" : "timeline"}`).toLowerCase().includes(search.toLowerCase()) ||
        d.label.toLowerCase().includes(search.toLowerCase()) ||
        d.group.toLowerCase().includes(search.toLowerCase())
    );
    const byGroup = new Map<string, typeof SHORTCUT_DEFS>();
    for (const d of f) {
      const arr = byGroup.get(d.group) ?? [];
      arr.push(d);
      byGroup.set(d.group, arr);
    }
    return [...byGroup.entries()];
  }, [search]);

  const groupKey = (g: string) =>
    g === "Reprodução" ? "scg.playback" : g === "Edição" ? "scg.editing" : g === "Projeto" ? "scg.project" : g === "Preview" ? "scg.preview" : "scg.timeline";

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("st.scSearch")}
        className="mb-2 h-8 border-[#2a3546] bg-[#0e1320] text-xs text-zinc-200 placeholder:text-zinc-600"
      />
      <div className="mb-2 flex items-center justify-between rounded-md border border-[#232d3d] bg-[#0e1320] px-2.5 py-1.5">
        <p className="text-[10px] leading-snug text-zinc-500">{t("st.scHint")}</p>
        <button
          onClick={() => {
            shortcuts.resetAll();
            toast.success(t("st.scResetDone"));
          }}
          className="flex shrink-0 items-center gap-1 rounded border border-[#2a3546] px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:text-[var(--gc-accent)]"
        >
          <RotateCcw className="h-3 w-3" /> {t("st.scReset")}
        </button>
      </div>
      <ScrollArea className="h-[44vh] pr-3">
        <div className="space-y-4">
          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{tr(groupKey(group))}</p>
              <div className="space-y-1">
                {items.map((d) => {
                  const combo = shortcuts.combos[d.id] ?? d.def;
                  const isCapture = capturing === d.id;
                  const label = tr(`sc.${d.id}`);
                  return (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
                        isCapture ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#232d3d] bg-[#0e1320]"
                      }`}
                    >
                      <span className="text-[11px] text-zinc-300">{label}</span>
                      <span className="flex items-center gap-1.5">
                        {d.fixed ? (
                          <kbd className="cursor-default rounded border border-[#2a3546] bg-[#151b26] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                            {comboLabel(combo)}
                          </kbd>
                        ) : isCapture ? (
                          <span className="animate-pulse rounded border border-[var(--gc-accent)] px-2 py-0.5 font-mono text-[10px] text-[var(--gc-accent)]">
                            {t("st.scPressKeys")}
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => useShortcuts.getState().resetAction(d.id)}
                              className="text-[9px] text-zinc-600 transition hover:text-zinc-400"
                              title={t("st.reset")}
                            >
                              {t("st.scDefault", { combo: comboLabel(d.def) })}
                            </button>
                            <button
                              onClick={() => setCapturing(d.id)}
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                                combo
                                  ? "border-[#2a3546] bg-[#151b26] text-zinc-300 hover:border[var(--gc-accent-60)] hover:text-[var(--gc-accent)]"
                                  : "border-dashed border-amber-500/50 text-amber-400"
                              }`}
                              title={t("st.scHint")}
                            >
                              {comboLabel(combo)}
                            </button>
                            <Pencil className="h-3 w-3 text-zinc-600 hover:text-[var(--gc-accent)]" />
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!groups.length && <p className="py-6 text-center text-xs text-zinc-600">{t("st.scNone")}</p>}
        </div>
      </ScrollArea>
    </div>
  );
}
