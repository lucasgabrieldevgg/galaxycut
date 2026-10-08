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
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
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
