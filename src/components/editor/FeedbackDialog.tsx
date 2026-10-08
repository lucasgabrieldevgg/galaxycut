// GalaxyCut — botão de feedback do editor: escreve aqui e ENVIA DIRETO
// (vira uma issue automática no GitHub via /api/feedback — um clique só).
// Se o envio não der, mostra os caminhos manuais (abrir issue / copiar).
"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT, useLang } from "@/lib/editor/i18n";
import { APP_VERSION } from "@/lib/editor/version";
import { desktop, isDesktopBuild } from "@/lib/editor/desktop";
import { toast } from "sonner";
import { MessageSquareHeart, Copy, Check, Send, Loader2, ExternalLink } from "lucide-react";

function GithubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

const REPO = "lucasgabrieldevgg/galaxycut";
const FEEDBACK_URL = "https://galaxycut.vercel.app/api/feedback";

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  // opção manual aparece quando o envio direto falhou (ou o dono preferir)
  const [showManual, setShowManual] = useState(false);

  const platform = isDesktopBuild() ? `app (${desktop?.platform ?? "?"})` : "web";

  const issueUrl = () => {
    const body = [text.trim() || "…", "", "---", `GalaxyCut v${APP_VERSION} · ${platform}`].join("\n");
    return (
      `https://github.com/${REPO}/issues/new?title=` +
      encodeURIComponent("[Feedback] ") +
      "&body=" +
      encodeURIComponent(body)
    );
  };

  function openIssue() {
    const url = issueUrl();
    if (desktop) desktop.openExternal(url);
    else window.open(url, "_blank", "noreferrer");
    onOpenChange(false);
  }

  /** envio DIRETO: um clique e chega (vira issue automática com label "feedback") */
  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const r = await fetch(FEEDBACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, version: APP_VERSION, platform, lang }),
      });
      const data = (await r.json().catch(() => ({ ok: false }))) as { ok?: boolean; url?: string | null };
      if (r.ok && data.ok) {
        toast.success(t("fb.sent"), { description: t("fb.sentDesc") });
        setText("");
        onOpenChange(false);
        if (data.url && desktop) desktop.openExternal(data.url);
        return;
      }
      // falhou (sem token no servidor? sem internet?) → mostra os jeitos manuais
      setShowManual(true);
      toast.error(t("fb.fail"), { description: t("fb.failDesc") });
    } catch {
      setShowManual(true);
      toast.error(t("fb.fail"), { description: t("fb.failDesc") });
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText([text.trim() || "…", "", "---", `GalaxyCut v${APP_VERSION} · ${platform}`].join("\n"));
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
            <MessageSquareHeart className="h-4 w-4 text-[var(--gc-accent)]" /> {t("fb.title")}
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
          <p className="text-[10px] text-zinc-600">{t("fb.meta", { v: APP_VERSION, platform })}</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => void copy()} className="gap-1.5 border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
            {copied ? <Check className="h-4 w-4 text-[var(--gc-accent)]" /> : <Copy className="h-4 w-4" />} {t("fb.copy")}
          </Button>
          <Button
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            className="gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{" "}
            {sending ? t("fb.sending") : t("fb.send")}
          </Button>
        </DialogFooter>

        {/* envio direto indisponível? os jeitos manuais aparecem aqui embaixo */}
        {showManual && (
          <div className="space-y-2 rounded-lg border border-[#2a3546] bg-[#0e1320] p-3">
            <Button variant="outline" onClick={openIssue} className="w-full gap-1.5 border-[#2a3546] bg-transparent text-zinc-200 hover:bg-[#1c2430]">
              <GithubIcon className="h-4 w-4" /> {t("fb.openIssue")} <ExternalLink className="h-3 w-3 text-zinc-500" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
