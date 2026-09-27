// GalaxyCut — tela de NOVA EDIÇÃO: escolha do formato com quadradinho visual
// (o dono vê como o vídeo é antes de criar) + título opcional.
"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ASPECT_CHOICES } from "@/lib/editor/types";
import { useT } from "@/lib/editor/i18n";
import { Film } from "lucide-react";

/** quadradinho que demonstra a proporção (como ela aparece na tela) */
function AspectSquare({ w, h, active }: { w: number; h: number; active: boolean }) {
  const box = 34; // maior lado do quadradinho
  const ratio = w / h;
  const gw = ratio >= 1 ? box : Math.max(10, Math.round(box * ratio));
  const gh = ratio >= 1 ? Math.max(10, Math.round(box / ratio)) : box;
  return (
    <span
      className={`block rounded-[3px] border-2 transition ${active ? "border-[#22C55E] bg-[#22C55E]/25" : "border-zinc-600 bg-zinc-700/40"}`}
      style={{ width: gw, height: gh }}
      aria-hidden
    />
  );
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** devolve o formato escolhido (w/h) + o título (opcional) */
  onCreate: (fmt: { w: number; h: number; key: string }, title: string) => void;
}) {
  const t = useT();
  const [key, setKey] = useState("9:16");
  const [title, setTitle] = useState("");

  const chosen = ASPECT_CHOICES.find((a) => a.key === key) ?? ASPECT_CHOICES[0];
  const mains = ASPECT_CHOICES.filter((a) => a.main);
  const others = ASPECT_CHOICES.filter((a) => !a.main);

  // fecha = reset pro próximo open (handler de evento, fora de effect)
  const close = (v: boolean) => {
    if (!v) {
      setKey("9:16");
      setTitle("");
    }
    onOpenChange(v);
  };

  // linha de botões de formato (função comum — sem criar componente no render)
  const row = (items: typeof ASPECT_CHOICES) => (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {items.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => setKey(a.key)}
          className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition ${
            key === a.key ? "border-[#22C55E] bg-[#22C55E]/10" : "border-[#2a3546] hover:border-[#3a4759]"
          }`}
          title={a.hint}
        >
          <AspectSquare w={a.w} h={a.h} active={key === a.key} />
          <span className={`text-[11px] font-semibold ${key === a.key ? "text-[#22C55E]" : "text-zinc-300"}`}>{a.label}</span>
          <span className="w-full truncate text-center text-[8.5px] leading-tight text-zinc-500">{a.hint}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-4 w-4 text-[#22C55E]" /> {t("np.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">{t("np.hint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("np.mainFormats")}</p>
            {row(mains)}
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("np.otherFormats")}</p>
            {row(others)}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("np.nameLabel")}</p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("np.namePh")}
              maxLength={60}
              className="h-9 border-[#2a3546] bg-[#0e1320] text-sm text-zinc-200 placeholder:text-zinc-600"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCreate({ w: chosen.w, h: chosen.h, key: chosen.key }, title);
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">
            ✕
          </Button>
          <Button
            onClick={() => onCreate({ w: chosen.w, h: chosen.h, key: chosen.key }, title)}
            className="gap-1.5 bg-[#22C55E] font-semibold text-black hover:bg-[#1ed467]"
          >
            {t("np.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
