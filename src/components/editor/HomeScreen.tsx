// GalaxyCut — página inicial: suas edições (criar, continuar, renomear, duplicar,
// excluir), configurações e verificador de atualização (só no app — no navegador
// o site se atualiza sozinho ao recarregar).
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { enUS, es } from "date-fns/locale";
import { Plus, Settings as SettingsIcon, Film, MoreVertical, Pencil, Copy, Trash2, Github, Check, X } from "lucide-react";
import * as projects from "@/lib/editor/projects";
import { ProjectCard } from "@/lib/editor/projects";
import { useSettings } from "@/lib/editor/settings";
import { useLang } from "@/lib/editor/i18n";
import { checkForUpdate, startAutoCheck } from "@/lib/editor/updater";
import { APP_VERSION } from "@/lib/editor/version";
import { desktop, isDesktopBuild } from "@/lib/editor/desktop";
import { deleteDiskProject, listDiskProjects } from "@/lib/editor/diskProjects";
import { useT } from "@/lib/editor/i18n";
import { SettingsDialog } from "./SettingsDialog";
import { UpdateDialog, useUpdatePrompt } from "./UpdateDialog";
import { FloatMenu, MenuItem } from "./ClipMenu";
import { Star, MonitorDown } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

function fmtDur(d: number) {
  if (!d || d <= 0) return "—";
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function HomeScreen({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [cards, setCards] = useState<ProjectCard[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<ProjectCard | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [checking, setChecking] = useState(false);
  const autoUpdateCheck = useSettings((s) => s.autoUpdateCheck);
  const showUpdate = useUpdatePrompt((s) => s.show);
  const t = useT();
  const lang = useLang((s) => s.lang);
  const editRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    let list = projects.listProjects();
    if (desktop) {
      try {
        const disk = await listDiskProjects();
        for (const d of disk) {
          const cur = list.find((c) => c.id === d.id);
          if (!cur || d.savedAt > cur.savedAt) {
            projects.upsertCard({
              id: d.id,
              name: d.name,
              createdAt: cur?.createdAt ?? d.savedAt,
              savedAt: d.savedAt,
              duration: d.duration,
              clipCount: d.clipCount,
            });
          }
        }
        list = projects.listProjects();
      } catch {
        /* noop */
      }
    }
    setCards(list);
  };

  useEffect(() => {
    void refresh();
  }, []);
  // verificador rápido de atualização (boot + a cada 30 min, se ligado nas configs)
  useEffect(() => {
    startAutoCheck(autoUpdateCheck, showUpdate);
    if (desktop) {
      // o processo principal do app avisa quando achar versão nova nos releases
      desktop.onUpdateAvailable?.((info) => showUpdate({ version: info.version, notes: info.notes, url: info.url }));
    }
  }, [autoUpdateCheck, showUpdate]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const sorted = useMemo(() => [...cards].sort((a, b) => b.savedAt - a.savedAt), [cards]);
  const dateLocale = lang === "en" ? enUS : lang === "es" ? es : ptBR;
  const inApp = isDesktopBuild();

  async function manualCheck() {
    setChecking(true);
    try {
      const u = await checkForUpdate();
      if (u) showUpdate(u);
      else toast.success(t("home.upToDate", { v: APP_VERSION }));
    } finally {
      setChecking(false);
    }
  }

  function commitRename() {
    if (editingId) {
      projects.renameProject(editingId, editName);
      toast.success(t("home.renamed"));
    }
    setEditingId(null);
    refresh();
  }

  return (
    <div className="relative min-h-screen overflow-y-auto bg-[#080b11] text-zinc-200 timeline-scroll">
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

      {/* topo */}
      <header className="sticky top-0 z-20 border-b border-[#141a24] bg-[#080b11]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <BrandLogo size={34} />
          <div>
            <p className="text-[15px] font-bold leading-tight tracking-tight text-zinc-100">
              Galaxy<span className="text-[var(--gc-accent)]">Cut</span>
            </p>
            <p className="text-[10px] leading-tight text-zinc-500">{t("home.subtitle")}</p>
          </div>
          <span className="ml-1 rounded border border[var(--gc-accent-40)] px-1.5 py-px font-mono text-[9px] font-semibold text-[var(--gc-accent)]">v{APP_VERSION}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <a
              href="https://github.com/lucasgabrieldevgg/galaxycut"
              target="_blank"
              rel="noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-[#141a24] hover:text-zinc-200"
              title={t("home.github")}
              aria-label="GitHub do GalaxyCut"
            >
              <Github className="h-4 w-4" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
              onClick={() => setSettingsOpen(true)}
              aria-label={t("home.settings")}
              title={t("home.settings")}
            >
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-4 pb-20">
        {/* hero */}
        <section className="flex flex-col items-center gap-3 pb-10 pt-14 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">{t("home.yourEdits")}</h1>
          <p className="max-w-md text-[13px] leading-relaxed text-zinc-500">{t("home.saveNote")}</p>
          <Button
            onClick={onNew}
            className="mt-2 h-11 gap-2 rounded-xl bg-[var(--gc-accent)] px-6 text-[15px] font-bold text-black shadow-[0_0_24px_var(--gc-accent-glow)] transition hover:scale-[1.02] hover:bg-[var(--gc-accent-hover)]"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} /> {t("home.newEdit")}
          </Button>

          {/* no navegador: um convite pro app (legendas com IA + saves em disco) */}
          {!inApp && (
            <div className="mt-6 flex max-w-md flex-col items-center gap-2 rounded-2xl border border[var(--gc-accent-25)] bg-[#0c1017]/80 px-5 py-4 text-center sm:flex-row sm:text-left">
              <MonitorDown className="h-8 w-8 shrink-0 text-[var(--gc-accent)]" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-zinc-200">{t("home.downloadApp")}</p>
                <p className="text-[11px] leading-relaxed text-zinc-500">{t("home.downloadAppHint")}</p>
              </div>
              <a
                href="https://github.com/lucasgabrieldevgg/galaxycut/releases/latest"
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-lg bg-[var(--gc-accent)] px-4 py-2 text-[12px] font-bold text-black transition hover:bg-[var(--gc-accent-hover)]"
              >
                {t("home.download")}
              </a>
            </div>
          )}
        </section>

        {/* grade de edições */}
        {sorted.length === 0 ? (
          <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#232d3d] bg-[#0c1017] py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#232d3d] bg-[#121722]">
              <Film className="h-6 w-6 text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-400">{t("home.noEdits")}</p>
            <p className="max-w-xs text-[11px] leading-relaxed text-zinc-600">{t("home.noEditsHint")}</p>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((c) => (
              <div
                key={c.id}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-[#1c2430] bg-[#0c1017] transition hover:border[var(--gc-accent-40)] hover:shadow-[0_0_24px_var(--gc-accent-10)]"
                onClick={(e) => {
                  if (editingId === c.id) return; // renomeando: clique no card não abre
                  if (e.detail === 0) return; // ativação por teclado/a11y (Enter) não abre a edição
                  onOpen(c.id);
                }}
              >
                {/* miniatura */}
                <div className="relative aspect-video overflow-hidden border-b border-[#141a24] bg-gradient-to-br from-[#10151d] to-[#0a0d14]">
                  {c.thumb ? (
                    <img src={c.thumb} alt="" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Film className="h-7 w-7 text-zinc-700" />
                    </div>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-px font-mono text-[10px] tabular-nums text-zinc-300">
                    {fmtDur(c.duration)}
                  </span>
                </div>
                {/* nome + ações */}
                <div className="flex items-center gap-1.5 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    {editingId === c.id ? (
                      <div className="flex items-center gap-1" data-gc-notrigger onClick={(e) => e.stopPropagation()}>
                        <Input
                          ref={(el: HTMLInputElement | null) => {
                            editRef.current = el;
                            if (el) {
                              el.focus();
                              el.select();
                            }
                          }}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault(); // senão o Enter também "ativa" o card (ancestral clicável) e abre a edição
                              commitRename();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingId(null);
                            }
                          }}
                          className="h-7 border-[#2a3546] bg-[#0e1320] px-2 text-xs text-zinc-200"
                          maxLength={60}
                        />
                        <button onClick={commitRename} className="rounded p-1 text-[var(--gc-accent)] hover:bg[var(--gc-accent-10)]" aria-label="Salvar nome">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="rounded p-1 text-zinc-500 hover:bg-[#1c2430]" aria-label="Cancelar">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-[13px] font-medium text-zinc-200">{c.name}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-600">
                          {c.clipCount} {t("home.clips")} · {formatDistanceToNow(c.savedAt, { addSuffix: true, locale: dateLocale })}
                        </p>
                      </>
                    )}
                  </div>
                  {/* 3 pontinhos: RENOMEAR/DUPLICAR/EXCLUIR com um clique (antes só o botão direito abria) */}
                  <FloatMenu
                    triggerClick
                    items={
                      [
                        { label: t("home.rename"), icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => { setEditingId(c.id); setEditName(c.name); } },
                        {
                          label: t("home.duplicate"),
                          icon: <Copy className="h-3.5 w-3.5" />,
                          onClick: () => {
                            const copy = projects.duplicateProject(c.id);
                            if (copy) toast.success(t("home.copiedName", { name: copy.name }));
                            refresh();
                          },
                        },
                        { type: "sep" },
                        { label: t("home.delete"), icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => setConfirmDel(c) },
                      ] as MenuItem[]
                    }
                  >
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-md p-1.5 text-zinc-600 opacity-0 transition hover:bg-[#1c2430] hover:text-zinc-300 focus:opacity-100 group-hover:opacity-100"
                      aria-label={t("home.options")}
                      title={t("home.options")}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </FloatMenu>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* rodapé */}
        <footer className="mt-14 flex flex-col items-center gap-2.5 border-t border-[#141a24] pt-6 text-center">
          {/* procurar atualizações é coisa do APP — no navegador o site se atualiza sozinho */}
          {inApp && (
            <button
              onClick={() => void manualCheck()}
              className="flex items-center gap-1.5 rounded-lg border border-[#232d3d] bg-[#0c1017] px-3 py-1.5 text-[11px] text-zinc-400 transition hover:border[var(--gc-accent-40)] hover:text-[var(--gc-accent)]"
            >
              <svg className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {checking ? t("home.checking") : t("home.checkUpdates")}
            </button>
          )}
          {/* um empurrãozinho de estrela — quem gosta, brilha */}
          <a
            href="https://github.com/lucasgabrieldevgg/galaxycut"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-1.5 text-[11px] text-amber-300/90 transition hover:border-amber-400/50 hover:text-amber-200"
          >
            <Star className="h-3.5 w-3.5 transition group-hover:fill-amber-300" />
            {t("home.starNudge")}
          </a>
          <p className="text-[10px] text-zinc-600">{t("home.footer", { v: APP_VERSION })}</p>
        </footer>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <UpdateDialog />

      {/* confirmação de exclusão */}
      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent className="border-[#232d3d] bg-[#121722] text-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("home.deleteTitle", { name: confirmDel?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("home.deleteHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">{t("home.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              onClick={() => {
                if (confirmDel) {
                  projects.deleteProject(confirmDel.id);
                  if (desktop) void deleteDiskProject(confirmDel.id);
                  toast.success(t("home.deleted"));
                }
                setConfirmDel(null);
                refresh();
              }}
            >
              {t("home.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
