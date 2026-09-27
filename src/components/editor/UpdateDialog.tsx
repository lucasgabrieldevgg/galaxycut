// GalaxyCut — diálogo "tem versão nova": mostra o changelog (no idioma do app)
// e, no app de desktop, BAIXA a atualização sozinho e instala com 1 clique
// (nada de baixar outro arquivo e apagar o antigo — v7.1).
"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Rocket, Check, Clock, SkipForward, Download, Loader2, RefreshCw } from "lucide-react";
import { UpdateInfo, skipVersion } from "@/lib/editor/updater";
import { APP_VERSION } from "@/lib/editor/version";
import { desktop } from "@/lib/editor/desktop";
import { toast } from "sonner";
import { useT } from "@/lib/editor/i18n";

interface UpdatePromptState {
  info: UpdateInfo | null;
  show: (i: UpdateInfo) => void;
  clear: () => void;
}

export const useUpdatePrompt = create<UpdatePromptState>((set) => ({
  info: null,
  show: (i) => set({ info: i }),
  clear: () => set({ info: null }),
}));

export function UpdateDialog() {
  const info = useUpdatePrompt((s) => s.info);
  const clear = useUpdatePrompt((s) => s.clear);
  const t = useT();
  // no app: 0 = ainda não baixou · 0..1 = baixando · 1 = pronto pra instalar
  const [dlState, setDlState] = useState<"idle" | "downloading" | "ready">("idle");
  const [pct, setPct] = useState(0);

  // o main avisa o progresso do download e quando tá pronto
  useEffect(() => {
    if (!desktop || !info) return;
    const offP = desktop.onUpdateProgress?.((p) => {
      setDlState("downloading");
      setPct(p.pct);
    });
    const offR = desktop.onUpdateReady?.(() => {
      setDlState("ready");
      setPct(1);
    });
    return () => {
      offP?.();
      offR?.();
    };
  }, [info, desktop]);

  if (!info) return null;

  /** app: baixa (se precisar) e instala — reinicia sozinho */
  async function install() {
    if (!desktop || !info) return;
    try {
      if (dlState === "ready") {
        toast.info(t("upd.installToast"));
        const r = await desktop.installUpdate();
        if (!r?.ok) throw new Error("install failed");
      } else {
        setDlState("downloading");
        const r = await desktop.downloadUpdate();
        if (!r?.ok) throw new Error("download failed");
        // o progresso chega via onUpdateProgress; quando terminar, vira "ready"
      }
    } catch {
      setDlState("idle");
      // plano antigo: abre a página do release
      if (info.url) desktop.openExternal(info.url);
      toast.info(t("upd.webNote"));
    }
  }

  const applyWeb = () => {
    clear();
    location.reload(); // web: recarregar já pega os arquivos novos
  };

  return (
    <Dialog open onOpenChange={(v) => !v && clear()}>
      <DialogContent className="max-w-md border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-[var(--gc-accent)]" /> {t("upd.available", { v: info.version })}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            {t("upd.current", { v: APP_VERSION })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto rounded-lg border border-[#232d3d] bg-[#0e1320] p-3 timeline-scroll">
          {info.notes.map((n, i) => (
            <p key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-300">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--gc-accent)]" />
              {n}
            </p>
          ))}
        </div>

        {/* download da atualização em andamento (app) */}
        {desktop && dlState === "downloading" && (
          <div className="space-y-2 rounded-lg border border[var(--gc-accent-30)] bg[var(--gc-accent-5)] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gc-accent)]" /> {t("upd.downloading")}
              </span>
              <span className="font-mono text-[var(--gc-accent)]">{Math.round(pct * 100)}%</span>
            </div>
            <Progress value={pct * 100} className="h-1.5 bg-[#0a0d14]" />
          </div>
        )}
        {desktop && dlState === "ready" && (
          <p className="flex items-center gap-2 rounded-lg border border[var(--gc-accent-40)] bg[var(--gc-accent-10)] p-2.5 text-[11px] text-[var(--gc-accent-text)]">
            <Check className="h-4 w-4 shrink-0" /> {t("upd.downloaded")}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-zinc-500 hover:text-zinc-300"
            onClick={() => {
              skipVersion(info.version);
              clear();
            }}
          >
            <SkipForward className="h-3.5 w-3.5" /> {t("upd.skip")}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]" onClick={clear}>
            <Clock className="h-3.5 w-3.5" /> {t("upd.later")}
          </Button>
          <Button
            onClick={() => (desktop ? void install() : applyWeb())}
            disabled={desktop && dlState === "downloading"}
            className="gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
          >
            {desktop ? (
              dlState === "downloading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("upd.downloading")}
                </>
              ) : dlState === "ready" ? (
                <>
                  <RefreshCw className="h-4 w-4" /> {t("upd.install")}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" /> {t("upd.downloadNow")}
                </>
              )
            ) : (
              <>
                <Rocket className="h-4 w-4" /> {t("upd.updateNow")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
