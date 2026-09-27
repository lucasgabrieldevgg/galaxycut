// GalaxyCut — botão de feedback do editor: escreve aqui e vira uma ISSUE
// pré-preenchida no GitHub do projeto (o dono recebe a notificação e lê tudo).
"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/editor/i18n";
import { APP_VERSION } from "@/lib/editor/version";
import { desktop, isDesktopBuild } from "@/lib/editor/desktop";
import { toast } from "sonner";
import { MessageSquareHeart, Github, Copy, Check } from "lucide-react";

const REPO = "lucasgabrieldevgg/galaxycut";

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const body = [
    text.trim() || "…",
    "",
    "---",
    `GalaxyCut v${APP_VERSION} · ${isDesktopBuild() ? `app (${desktop?.platform ?? "?"})` : "web"}`,
  ].join("\n");

  function openIssue() {
    const url =
      `https://github.com/${REPO}/issues/new?title=` +
      encodeURIComponent("[Feedback] ") +
      "&body=" +
      encodeURIComponent(body);
    if (desktop) desktop.openExternal(url);
    else window.open(url, "_blank", "noreferrer");
    onOpenChange(false);
    toast.success("Abrindo o GitHub — cola o texto e envia 💚");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      toast.success(t("fb.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareHeart className="h-4 w-4 text-[#22C55E]" /> {t("fb.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">{t("fb.hint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("fb.ph")}
            rows={5}
            maxLength={4000}
            className="border-[#2a3546] bg-[#0e1320] text-sm text-zinc-200 placeholder:text-zinc-600"
          />
          <p className="text-[10px] text-zinc-600">
            v{APP_VERSION} · {isDesktopBuild() ? "app de desktop" : "navegador"} — anexado automaticamente pra facilitar o diagnóstico.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => void copy()} className="gap-1.5 border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
            {copied ? <Check className="h-4 w-4 text-[#22C55E]" /> : <Copy className="h-4 w-4" />} {t("fb.copy")}
          </Button>
          <Button onClick={openIssue} className="gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]">
            <Github className="h-4 w-4" /> {t("fb.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
