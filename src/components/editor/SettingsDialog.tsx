// GalaxyCut — configurações do aplicativo (geral, atalhos EDITÁVEIS, atualizações, chaves de busca)
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
import { SHORTCUT_DEFS, comboFromEvent, comboLabel, useShortcuts } from "@/lib/editor/shortcuts";
import { CAPTION_PRESETS } from "@/lib/editor/types";
import { WHISPER_MODELS } from "@/lib/editor/subtitles";
import { APP_VERSION } from "@/lib/editor/version";
import { checkForUpdate } from "@/lib/editor/updater";
import { useUpdatePrompt } from "./UpdateDialog";
import { toast } from "sonner";
import {
  Keyboard, SlidersHorizontal, KeyRound, ExternalLink, ArrowUpDown, Pencil, RotateCcw, RefreshCw,
} from "lucide-react";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-hidden border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#22C55E]" /> Configurações do GalaxyCut
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Tudo fica salvo no seu navegador (incluindo as chaves de API).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="geral" className="mt-1">
          <TabsList className="grid h-9 w-full grid-cols-3 bg-[#151b26]">
            <TabsTrigger value="geral" className="gap-1.5 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <SlidersHorizontal className="h-3 w-3" /> Geral
            </TabsTrigger>
            <TabsTrigger value="atalhos" className="gap-1.5 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <Keyboard className="h-3 w-3" /> Atalhos
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <KeyRound className="h-3 w-3" /> Buscas
            </TabsTrigger>
          </TabsList>

          {/* ---------- GERAL ---------- */}
          <TabsContent value="geral" className="mt-3">
            <ScrollArea className="h-[52vh] pr-3">
              <div className="space-y-5">
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <ArrowUpDown className="h-3.5 w-3.5 text-amber-400" /> Movimento da seta do playhead
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PLAYHEAD_MODES.map((m) => (
                      <PlayheadModeBtn key={m.id} id={m.id} label={m.label} hint={m.hint} />
                    ))}
                  </div>
                </div>

                <GeneralSwitches />

                <div>
                  <p className="mb-1.5 text-xs font-medium text-zinc-300">Atualizações do aplicativo</p>
                  <UpdateSection />
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-zinc-300">Modelo das legendas automáticas (roda no seu PC)</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {WHISPER_MODELS.map((m) => (
                      <WhisperBtn key={m.id} id={m.id} label={m.label} hint={m.hint} />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-zinc-300">Estilo padrão das legendas automáticas</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {CAPTION_PRESETS.map((p) => (
                      <CaptionBtn key={p.id} id={p.id} name={p.name} font={p.props.font as string} highlight={p.props.highlight} color={(p.props.highlight ? p.props.highlightColor : p.props.color) as string} />
                    ))}
                  </div>
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

/** switches da aba Geral (componente pra re-renderizar sozinho) */
function UpdateSection() {
  const auto = useSettings((s) => s.autoUpdateCheck);
  const set = useSettings((s) => s.set);
  const [checking, setChecking] = useState(false);
  return (
    <div className="space-y-2 rounded-lg border border-[#2a3546] bg-[#0e1320] p-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="autoupd" className="text-[11px] font-normal leading-snug text-zinc-400">
          Avisar quando sair versão nova (mostra o que mudou e pergunta se quer atualizar)
        </Label>
        <Switch id="autoupd" checked={auto} onCheckedChange={(v) => set({ autoUpdateCheck: v })} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-zinc-600">Versão instalada: v{APP_VERSION}</span>
        <Button
          size="sm"
          className="h-7 gap-1 bg-[#22C55E] px-2.5 text-[10px] font-semibold text-black hover:bg-[#1ed467]"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            void checkForUpdate().then((u) => {
              setChecking(false);
              if (u) useUpdatePrompt.getState().show(u);
              else toast.success(`Você já tá na última (v${APP_VERSION})`);
            });
          }}
        >
          <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Procurando…" : "Verificar agora"}
        </Button>
      </div>
    </div>
  );
}

function PlayheadModeBtn({ id, label, hint }: { id: string; label: string; hint: string }) {
  const cur = useSettings((s) => s.playheadMode);
  return (
    <button
      onClick={() => useSettings.getState().set({ playheadMode: id as PlayheadMode })}
      className={`rounded-lg border p-2.5 text-left transition ${cur === id ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#2a3546] hover:border-[#3a4759]"}`}
    >
      <span className={`block text-[11px] font-semibold ${cur === id ? "text-[#22C55E]" : "text-zinc-300"}`}>{label}</span>
      <span className="block text-[10px] leading-snug text-zinc-500">{hint}</span>
    </button>
  );
}

function GeneralSwitches() {
  const snapEnabled = useSettings((s) => s.snapEnabled);
  const showWaveOnVideo = useSettings((s) => s.showWaveOnVideo);
  const set = useSettings((s) => s.set);
  return (
    <div className="space-y-3 rounded-lg border border-[#2a3546] bg-[#0e1320] p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium text-zinc-300">Encaixe magnético ao arrastar</p>
          <p className="text-[10px] text-zinc-500">Clipe gruda na borda dos outros, na seta e no INÍCIO da timeline</p>
        </div>
        <Switch checked={snapEnabled} onCheckedChange={(v) => set({ snapEnabled: v })} className="data-[state=checked]:bg-[#22C55E]" />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium text-zinc-300">Waveform nos clipes de vídeo</p>
          <p className="text-[10px] text-zinc-500">Mostra o áudio dentro do clipe (some quando o clipe fica mudo)</p>
        </div>
        <Switch checked={showWaveOnVideo} onCheckedChange={(v) => set({ showWaveOnVideo: v })} className="data-[state=checked]:bg-[#22C55E]" />
      </div>
    </div>
  );
}

function WhisperBtn({ id, label, hint }: { id: string; label: string; hint: string }) {
  const cur = useSettings((s) => s.whisperModel);
  return (
    <button
      onClick={() => useSettings.getState().set({ whisperModel: id as "tiny" | "base" | "small" })}
      className={`rounded-lg border p-2 text-center transition ${cur === id ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#2a3546] hover:border-[#3a4759]"}`}
    >
      <span className={`block text-[11px] font-semibold ${cur === id ? "text-[#22C55E]" : "text-zinc-300"}`}>{label}</span>
      <span className="block text-[9px] leading-tight text-zinc-500">{hint}</span>
    </button>
  );
}

function CaptionBtn({ id, name, font, highlight, color }: { id: string; name: string; font: string; highlight?: boolean; color: string }) {
  const cur = useSettings((s) => s.captionPreset);
  return (
    <button
      onClick={() => useSettings.getState().set({ captionPreset: id })}
      className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition ${cur === id ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#2a3546] hover:border-[#3a4759]"}`}
      title={name}
    >
      <span className="text-[13px] leading-none" style={{ fontFamily: font, color }}>
        AaBb
      </span>
      <span className={`w-full truncate text-center text-[8.5px] ${cur === id ? "text-[#22C55E]" : "text-zinc-500"}`}>{name}</span>
      <span className="sr-only">{highlight ? "com destaque" : ""}</span>
    </button>
  );
}

/** aba de chaves de busca (reativa) */
function StockKeysTab() {
  const keys = useSettings((s) => s.keys);
  const set = useSettings((s) => s.set);
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-[#232d3d] bg-[#0e1320] p-3 text-[11px] leading-relaxed text-zinc-500">
        A busca de fotos, vídeos, músicas e efeitos já funciona <b className="text-zinc-400">sem chave nenhuma</b>{" "}
        (Openverse, Freesound, Wikimedia e Internet Archive). As chaves abaixo são <b className="text-zinc-400">opcionais</b> e
        liberam bancos maiores. São <b className="text-zinc-400">grátis</b> — só criar conta e colar aqui.
      </p>
      <div>
        <Label className="mb-1 block text-[11px] text-zinc-400">Chave do Pexels (fotos + vídeos em HD)</Label>
        <Input
          type="password"
          value={keys.pexels}
          onChange={(e) => set({ keys: { ...keys, pexels: e.target.value.trim() } })}
          placeholder="cole a chave aqui"
          className="h-8 border-[#2a3546] bg-[#0e1320] text-xs text-zinc-200 placeholder:text-zinc-600"
        />
        <a
          href="https://www.pexels.com/api/"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#22C55E] hover:underline"
        >
          Pegar chave grátis no site do Pexels <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div>
        <Label className="mb-1 block text-[11px] text-zinc-400">Chave do Pixabay (fotos extras)</Label>
        <Input
          type="password"
          value={keys.pixabay}
          onChange={(e) => set({ keys: { ...keys, pixabay: e.target.value.trim() } })}
          placeholder="cole a chave aqui"
          className="h-8 border-[#2a3546] bg-[#0e1320] text-xs text-zinc-200 placeholder:text-zinc-600"
        />
        <a
          href="https://pixabay.com/api/docs/"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#22C55E] hover:underline"
        >
          Pegar chave grátis no site do Pixabay <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sobre licenças</p>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Cada resultado da busca mostra um selo: <b className="text-emerald-400">Livre</b> (usa sem preocupar),{" "}
          <b className="text-amber-400">Crédito</b> (cita o autor na descrição do vídeo),{" "}
          <b className="text-orange-400">Não comercial</b> (cuidado se monetizar) e{" "}
          <b className="text-red-400">Possível ©</b> (licença desconhecida — trate como protegido). Não dá pra
          fazer detecção por impressão digital (tipo Content ID) offline, então eu mostro a licença declarada
          pela fonte.
        </p>
      </div>
    </div>
  );
}

// ---------------- aba ATALHOS: redefinir teclas ----------------
function ShortcutsTab() {
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
        toast.info("Atalho desvinculado");
        setCapturing(null);
        return;
      }
      const conflict = shortcuts.setCombo(capturing, combo);
      if (conflict) toast.info(`"${conflict}" perdeu essa tecla (ela agora é desta ação)`);
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as EventListenerOptions);
  }, [capturing, shortcuts]);

  const groups = useMemo(() => {
    const f = SHORTCUT_DEFS.filter(
      (d) =>
        !search.trim() ||
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

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar atalho… (ex: cortar, apagar)"
        className="mb-2 h-8 border-[#2a3546] bg-[#0e1320] text-xs text-zinc-200 placeholder:text-zinc-600"
      />
      <div className="mb-2 flex items-center justify-between rounded-md border border-[#232d3d] bg-[#0e1320] px-2.5 py-1.5">
        <p className="text-[10px] leading-snug text-zinc-500">
          Clica no lápis e aperta a nova tecla (Esc cancela, Backspace desvincula). Salvo automático.
        </p>
        <button
          onClick={() => {
            shortcuts.resetAll();
            toast.success("Atalhos restaurados pro padrão");
          }}
          className="flex shrink-0 items-center gap-1 rounded border border-[#2a3546] px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:text-[#22C55E]"
        >
          <RotateCcw className="h-3 w-3" /> Resetar tudo
        </button>
      </div>
      <ScrollArea className="h-[44vh] pr-3">
        <div className="space-y-4">
          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group}</p>
              <div className="space-y-1">
                {items.map((d) => {
                  const combo = shortcuts.combos[d.id] ?? d.def;
                  const isCapture = capturing === d.id;
                  return (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
                        isCapture ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#232d3d] bg-[#0e1320]"
                      }`}
                    >
                      <span className="text-[11px] text-zinc-300">{d.label}</span>
                      <span className="flex items-center gap-1.5">
                        {d.fixed ? (
                          <kbd className="cursor-default rounded border border-[#2a3546] bg-[#151b26] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                            {comboLabel(combo)}
                          </kbd>
                        ) : isCapture ? (
                          <span className="animate-pulse rounded border border-[#22C55E] px-2 py-0.5 font-mono text-[10px] text-[#22C55E]">
                            pressione as teclas…
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => useShortcuts.getState().resetAction(d.id)}
                              className="text-[9px] text-zinc-600 transition hover:text-zinc-400"
                              title="Voltar pro padrão"
                            >
                              padrão: {comboLabel(d.def)}
                            </button>
                            <button
                              onClick={() => setCapturing(d.id)}
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                                combo
                                  ? "border-[#2a3546] bg-[#151b26] text-zinc-300 hover:border-[#22C55E]/60 hover:text-[#22C55E]"
                                  : "border-dashed border-amber-500/50 text-amber-400"
                              }`}
                              title="Redefinir esta tecla"
                            >
                              {comboLabel(combo)}
                            </button>
                            <Pencil className="h-3 w-3 text-zinc-600 hover:text-[#22C55E]" />
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!groups.length && <p className="py-6 text-center text-xs text-zinc-600">Nenhum atalho encontrado.</p>}
        </div>
      </ScrollArea>
    </div>
  );
}

