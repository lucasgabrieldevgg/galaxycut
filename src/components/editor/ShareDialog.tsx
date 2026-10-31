// GalaxyCut — diálogo "Compartilhar edição": escolhe o nível de acesso e gera
// um link autocontido (ADR-001). O link carrega a edição comprimida no #s=…
"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, PencilLine, CopyPlus, Link2, Copy, Check, RefreshCw, FileVideo, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/lib/editor/store";
import { useT } from "@/lib/editor/i18n";
import { APP_VERSION } from "@/lib/editor/version";
import { buildShareLink, isShareCodecSupported, SHARE_LEVEL_INFO, type ShareLevel } from "@/lib/editor/share";

const LEVEL_ICONS: Record<ShareLevel, typeof Eye> = { view: Eye, edit: PencilLine, copy: CopyPlus };

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const [level, setLevel] = useState<ShareLevel>("view");
  const [link, setLink] = useState<string | null>(null);
  const [generatedName, setGeneratedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"too-big" | "no-codec" | null>(null);
  const [copied, setCopied] = useState(false);
  const codecOk = useMemo(() => isShareCodecSupported(), []);

  const info = SHARE_LEVEL_INFO.find((l) => l.id === level) ?? SHARE_LEVEL_INFO[0];

  // trocar o nível invalida o link gerado (o nível viaja DENTRO do link)
  function pick(l: ShareLevel) {
    setLevel(l);
    setLink(null);
    setError(null);
    setCopied(false);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const st = useProject.getState();
      const url = await buildShareLink({
        v: 1,
        lvl: level,
        name: st.project.name.slice(0, 200),
        made: Date.now(),
        app: APP_VERSION,
        project: st.project,
        tracks: st.tracks,
        clips: st.clips,
        folders: st.folders,
        media: st.media,
      });
      setGeneratedName(st.project.name.slice(0, 200));
      setLink(url);
    } catch (e) {
      setError(e instanceof Error && e.message === "share/too-big" ? "too-big" : "no-codec");
      setLink(null);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // contexto sem permissão (http antigo etc.): seleciona pra copiar na mão
      const el = document.getElementById("gc-share-link") as HTMLInputElement | null;
      el?.select();
      try {
        document.execCommand("copy");
      } catch {
        /* melhor esforço */
      }
    }
    setCopied(true);
    toast.success(t("share.copied"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-[#232d3d] bg-[#0c1017] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-[var(--gc-accent)]" />
            {t("share.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">{t("share.intro")}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-2">
          {SHARE_LEVEL_INFO.map((l) => {
            const Icon = LEVEL_ICONS[l.id];
            const sel = l.id === level;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => pick(l.id)}
                aria-pressed={sel}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
                  sel
                    ? "border-[var(--gc-accent)] bg-[var(--gc-accent-7)]"
                    : "border-[#232d3d] bg-[#10151d] hover:border-[#2a3546]"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                    sel ? "bg-[var(--gc-accent-20)] text-[var(--gc-accent)]" : "bg-[#1c2430] text-zinc-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${sel ? "text-[var(--gc-accent)]" : "text-zinc-200"}`}>
                    {t(l.nameKey)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-400">{t(l.descKey)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-zinc-500">
          <FileVideo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("share.mediaNote")}
        </p>

        {link ? (
          <div className="mt-4 rounded-lg border border-[#232d3d] bg-[#10151d] p-3.5">
            <p className="text-xs text-zinc-500">{t("share.linkFor")}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-zinc-100">“{generatedName}”</p>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("share.levelLabel")}</span>
              <span className="rounded-full bg-[var(--gc-accent-15)] px-2 py-0.5 text-[11px] font-semibold text-[var(--gc-accent)]">
                {t(info.nameKey)}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              <Input
                id="gc-share-link"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                className="h-8 border-[#232d3d] bg-[#0c1017] font-mono text-[11px] text-zinc-400"
              />
              <Button
                size="sm"
                onClick={copyLink}
                className="h-8 shrink-0 gap-1.5 bg-[var(--gc-accent)] px-3 text-xs font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t("share.copied") : t("share.copy")}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setLink(null)}
              className="mt-2.5 flex items-center gap-1 text-[11px] text-zinc-500 transition hover:text-zinc-300"
            >
              <RefreshCw className="h-3 w-3" /> {t("share.regen")}
            </button>
          </div>
        ) : (
          <div className="mt-4">
            {error === "too-big" && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-900/70 bg-amber-950/40 p-2.5 text-xs text-amber-300">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">{t("share.tooBig")}</span>
                  <span className="mt-0.5 block text-amber-500/80">{t("share.tooBigDesc", { mb: 2.5 })}</span>
                </span>
              </div>
            )}
            {error === "no-codec" && (
              <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-900/70 bg-amber-950/40 p-2.5 text-xs text-amber-300">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">{t("share.noCodec")}</span>
                  <span className="mt-0.5 block text-amber-500/80">{t("share.noCodecDesc")}</span>
                </span>
              </div>
            )}
            <Button
              onClick={generate}
              disabled={busy || !codecOk}
              className="h-9 w-full gap-2 bg-[var(--gc-accent)] text-sm font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {busy ? t("share.generating") : t("share.generate")}
            </Button>
            <p className="mt-2 text-center text-[11px] text-zinc-600">{t("share.changeLevel")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
