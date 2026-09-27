// GalaxyCut — tela de NOVA EDIÇÃO: escolha do formato com quadradinho visual
// (o dono vê como o vídeo é antes de criar) + título opcional.
// v7.1: formato PERSONALIZADO — largura e altura que você quiser.
"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ASPECT_CHOICES } from "@/lib/editor/types";
import { useT } from "@/lib/editor/i18n";
import { Film, Ruler } from "lucide-react";

/** quadradinho que demonstra a proporção (como ela aparece na tela) */
function AspectSquare({ w, h, active }: { w: number; h: number; active: boolean }) {
  const box = 34; // maior lado do quadradinho
  const ratio = w / h;
  const gw = ratio >= 1 ? box : Math.max(10, Math.round(box * ratio));
  const gh = ratio >= 1 ? Math.max(10, Math.round(box / ratio)) : box;
  return (
    <span
      className={`block rounded-[3px] border-2 transition ${active ? "border-[var(--gc-accent)] bg[var(--gc-accent-25)]" : "border-zinc-600 bg-zinc-700/40"}`}
      style={{ width: gw, height: gh }}
      aria-hidden
    />
  );
}

/** deixa o valor de largura/altura dentro do permitido (120–7680, par) */
function clampSide(v: number): number {
  if (!isFinite(v) || v <= 0) return 1080;
  return Math.max(120, Math.min(7680, Math.round(v / 2) * 2));
}

/** só dígitos no input (vazio é válido enquanto a pessoa digita — o “0” que
 *  não apagava acabou: o estado agora é TEXTO, o número só nasce no blur/criar) */
function onlyDigits(s: string): string {
  return s.replace(/[^0-9]/g, "").slice(0, 5);
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
  // formato personalizado (string: pode ficar vazio enquanto a pessoa apaga)
  const [cw, setCw] = useState("1080");
  const [ch, setCh] = useState("1350");

  const isCustom = key === "custom";
  // formato personalizado: guardado como TEXTO — "" é permitido enquanto digita
  const cwN = clampSide(Number(cw || 0));
  const chN = clampSide(Number(ch || 0));
  const chosen = isCustom
    ? { w: cwN, h: chN, key: "custom", label: `${cwN}×${chN}`, hint: t("np.custom") }
    : ASPECT_CHOICES.find((a) => a.key === key) ?? ASPECT_CHOICES[0];
  const mains = ASPECT_CHOICES.filter((a) => a.main);
  const others = ASPECT_CHOICES.filter((a) => !a.main);

  // fecha = reset pro próximo open (handler de evento, fora de effect)
  const close = (v: boolean) => {
    if (!v) {
      setKey("9:16");
      setTitle("");
      setCw("1080");
      setCh("1350");
    }
    onOpenChange(v);
  };

  const create = () => onCreate({ w: chosen.w, h: chosen.h, key: chosen.key }, title);

  // linha de botões de formato (função comum — sem criar componente no render)
  const row = (items: typeof ASPECT_CHOICES) => (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {items.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => setKey(a.key)}
          className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition ${
            key === a.key ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
          }`}
          title={a.hint}
        >
          <AspectSquare w={a.w} h={a.h} active={key === a.key} />
          <span className={`text-[11px] font-semibold ${key === a.key ? "text-[var(--gc-accent)]" : "text-zinc-300"}`}>{a.label}</span>
          <span className="w-full truncate text-center text-[8.5px] leading-tight text-zinc-500">{a.hint}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-4 w-4 text-[var(--gc-accent)]" /> {t("np.title")}
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
            {/* formato personalizado */}
            <button
              type="button"
              onClick={() => setKey("custom")}
              className={`mt-1.5 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition ${
                isCustom ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]" : "border-[#2a3546] hover:border-[#3a4759]"
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-500 text-zinc-400">
                <Ruler className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[11px] font-semibold ${isCustom ? "text-[var(--gc-accent)]" : "text-zinc-300"}`}>
                  {t("np.custom")} {isCustom && `· ${cwN}×${chN}`}
                </span>
                <span className="block text-[9px] text-zinc-500">{t("np.customHint")}</span>
              </span>
            </button>
            {isCustom && (
              <div className="mt-2 space-y-2 rounded-lg border border[var(--gc-accent-30)] bg[var(--gc-accent-5)] p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-1 block text-[10px] text-zinc-400">{t("np.width")} (px)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={cw}
                      onChange={(e) => setCw(onlyDigits(e.target.value))}
                      onBlur={() => setCw(String(clampSide(Number(cw || 0))))}
                      placeholder="1080"
                      className="h-8 border-[#2a3546] bg-[#0e1320] text-xs text-zinc-200"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-[10px] text-zinc-400">{t("np.height")} (px)</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={ch}
                      onChange={(e) => setCh(onlyDigits(e.target.value))}
                      onBlur={() => setCh(String(clampSide(Number(ch || 0))))}
                      placeholder="1920"
                      className="h-8 border-[#2a3546] bg-[#0e1320] text-xs text-zinc-200"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <AspectSquare w={cwN} h={chN} active />
                  <p className="text-[10px] leading-relaxed text-zinc-500">
                    {t("np.customNote", { r: `${(cwN / chN).toFixed(2)}:1` })}
                  </p>
                </div>
              </div>
            )}
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
                  create();
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
            onClick={create}
            className="gap-1.5 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
          >
            {t("np.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
