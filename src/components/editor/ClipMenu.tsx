// GalaxyCut — menu de botão direito PRÓPRIO (sem Radix).
// Motivo: o menu do clipe piscava e fechava sozinho em alguns mouses/touchpads
// (clique rápido era interpretado como clique fora). Este aqui abre no evento
// contextmenu e fecha APENAS em: clique esquerdo fora, Esc, rolagem ou item.
// Nenhum pointerup do próprio clique de abertura pode fechá-lo.
"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_W = 240; // largura máxima do menu (pro clamp lateral)

export interface MenuItem {
  type?: "item" | "sep" | "submenu" | "info";
  label?: string;
  icon?: ReactNode;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children?: MenuItem[]; // submenu (abre ao passar o mouse)
}

export function FloatMenu({ items, children }: { items: MenuItem[]; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [subOpen, setSubOpen] = useState<number>(-1);
  const hostRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);

  // fecha e limpa
  const close = () => {
    setPos(null);
    setSubOpen(-1);
  };

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.contains(e.target as Node)) return; // clique dentro do menu
      // clique de abrir (botão direito) logo após abrir não conta como "fora"
      if (e.button === 2 && performance.now() - openedAt.current < 400) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onGo = () => close(); // qualquer rolagem/redimensionamento fecha
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onGo, { passive: true, capture: true });
    window.addEventListener("resize", onGo);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onGo, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onGo);
    };
  }, [pos]);

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) return; // só dentro deste wrapper
      e.preventDefault();
      e.stopPropagation();
      openedAt.current = performance.now();
      setSubOpen(-1);
      setPos({ x: e.clientX, y: e.clientY });
    };
    // captura: pega antes de qualquer outro handler de contextmenu
    window.addEventListener("contextmenu", onCtx, true);
    return () => window.removeEventListener("contextmenu", onCtx, true);
  }, []);

  // clampa o menu dentro da tela — calculado na renderização (sem setState em effect)
  const clamped = pos
    ? {
        x: Math.min(pos.x, Math.max(8, window.innerWidth - MENU_W - 12)),
        y: Math.min(pos.y, Math.max(8, window.innerHeight - 8)),
      }
    : null;

  return (
    <div ref={hostRef} className="contents">
      {children}
      {clamped &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[90] min-w-[218px] rounded-lg border border-[#232d3d] bg-[#121722] p-1 text-zinc-200 shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
            style={{ left: clamped.x, top: clamped.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {items.map((it, i) =>
              it.type === "sep" ? (
                <div key={i} className="my-1 h-px bg-[#232d3d]" />
              ) : it.type === "info" ? (
                <div key={i} className="px-2 py-1 text-[10px] text-zinc-500">
                  {it.label}
                </div>
              ) : it.type === "submenu" ? (
                <div
                  key={i}
                  className="relative"
                  onMouseEnter={() => setSubOpen(i)}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#1c2430]"
                  >
                    {it.icon}
                    <span className="flex-1">{it.label}</span>
                    <span className="text-zinc-600">›</span>
                  </button>
                  {subOpen === i && it.children?.length ? (
                    <div className="absolute left-[calc(100%-4px)] top-0 z-[91] min-w-[170px] rounded-lg border border-[#232d3d] bg-[#121722] p-1 shadow-[0_12px_36px_rgba(0,0,0,0.55)]">
                      {it.children.map((c, j) =>
                        c.type === "sep" ? (
                          <div key={j} className="my-1 h-px bg-[#232d3d]" />
                        ) : (
                          <button
                            key={j}
                            type="button"
                            title={c.title}
                            onClick={() => {
                              close();
                              c.onClick?.();
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#1c2430]"
                          >
                            {c.icon}
                            <span className="flex-1 whitespace-nowrap">{c.label}</span>
                          </button>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <button
                  key={i}
                  type="button"
                  title={it.title}
                  disabled={it.disabled}
                  onClick={() => {
                    close();
                    it.onClick?.();
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-[#1c2430] disabled:pointer-events-none disabled:opacity-40 ${
                    it.danger ? "text-red-400" : ""
                  }`}
                >
                  {it.icon}
                  <span className="flex-1">{it.label}</span>
                  {it.kbd && <kbd className="rounded bg-[#1c2430] px-1 text-[9px] text-zinc-500">{it.kbd}</kbd>}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
