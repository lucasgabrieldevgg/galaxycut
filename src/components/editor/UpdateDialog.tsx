// GalaxyCut — diálogo "tem versão nova": mostra o changelog e pergunta se quer atualizar.
"use client";

import { create } from "zustand";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rocket, Check, Clock, SkipForward } from "lucide-react";
import { UpdateInfo, skipVersion } from "@/lib/editor/updater";
import { APP_VERSION } from "@/lib/editor/version";
import { desktop } from "@/lib/editor/desktop";
import { toast } from "sonner";

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

  if (!info) return null;

  const apply = () => {
    clear();
    if (desktop && info.url) {
      desktop.openExternal(info.url); // app: abre a página de download da nova versão
      toast.info("Baixando pela página do GitHub — é só substituir o AppImage antigo.");
    } else {
      location.reload(); // web: recarrega já pega os arquivos novos
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && clear()}>
      <DialogContent className="max-w-md border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-[#22C55E]" /> Versão {info.version} disponível!
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Você está na {APP_VERSION}. Veja o que mudou — é rapidinho atualizar.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto rounded-lg border border-[#232d3d] bg-[#0e1320] p-3 timeline-scroll">
          {info.notes.map((n, i) => (
            <p key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-zinc-300">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
              {n}
            </p>
          ))}
        </div>

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
            <SkipForward className="h-3.5 w-3.5" /> Pular esta versão
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]" onClick={clear}>
            <Clock className="h-3.5 w-3.5" /> Mais tarde
          </Button>
          <Button onClick={apply} className="gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]">
            <Rocket className="h-4 w-4" /> {desktop ? "Baixar atualização" : "Atualizar agora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
