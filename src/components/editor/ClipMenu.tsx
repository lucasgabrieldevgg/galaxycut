// GalaxyCut — menu de botão direito PRÓPRIO (sem Radix).
// Motivo: o menu do clipe piscava e fechava sozinho em alguns mouses/touchpads
// (clique rápido era interpretado como clique fora). Este aqui abre no evento
// contextmenu e fecha APENAS em: clique esquerdo fora, Esc, rolagem ou item.
// v7.1: o menu NUNCA mais passa da borda da tela — abre pra cima quando não
// cabe embaixo, e o submenu também vira pra cima/lado conforme o espaço.
"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_W = 240; // largura máxima do menu (pro clamp lateral)
const SUB_W = 200; // largura estimada do submenu

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

export function FloatMenu({
  items,
  children,
  /** abre também com clique ESQUERDO no trigger (ex: botão "…" dos projetos) */
  triggerClick,
}: {
  items: MenuItem[];
  children: ReactNode;
  triggerClick?: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [subOpen, setSubOpen] = useState<number>(-1);
  const hostRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  /** ajuste do submenu: vira pra esquerda/cima e rola quando não cabe */
  const [subAdj, setSubAdj] = useState<{ flipX: boolean; flipY: boolean; maxH: number }>({ flipX: false, flipY: false, maxH: 400 });
  /** o menu em si abre pra cima quando não cabe embaixo do ponto */
  const [openUp, setOpenUp] = useState(false);
  const [maxMenuH, setMaxMenuH] = useState<number>(9999);
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

  // trigger de clique esquerdo (o "…" da home, por exemplo)
  useEffect(() => {
    if (!triggerClick) return;
    const onClick = (e: MouseEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) return;
      // cliques que NÃO são no trigger (dentro do menu tratado acima) são ignorados
      const el = e.target as HTMLElement;
      if (el.closest("[data-gc-notrigger]")) return;
      e.preventDefault();
      e.stopPropagation();
      openedAt.current = performance.now();
      setSubOpen(-1);
      const r = hostRef.current.getBoundingClientRect();
      setPos({ x: r.left, y: r.bottom + 2 });
    };
    const host = hostRef.current;
    host?.addEventListener("click", onClick, true);
    return () => host?.removeEventListener("click", onClick, true);
  }, [triggerClick, pos]);

  // clampa o menu dentro da tela (lateral) — o resto (vertical) é medido depois de pintar
  const clampedX = pos
    ? Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - MENU_W - 12))
    : null;

  // menu já pintado: mede a altura DE VERDADE e decide se abre pra cima.
  // Assim TODAS as opções ficam visíveis (o pedido: "extender até aparecer a última").
  useLayoutEffect(() => {
    if (!pos || !menuRef.current) return;
    const h = menuRef.current.offsetHeight;
    const roomBelow = window.innerHeight - pos.y - 10;
    const roomAbove = pos.y - 10;
    if (h > roomBelow && h <= roomAbove) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- medição pós-pintura (idempotente)
      setOpenUp(true);
      setMaxMenuH(Math.min(h + 4, roomAbove));
    } else if (h > roomBelow && h > roomAbove) {
      // não cabe em nenhum lado → o maior espaço vence, com rolagem interna
       
      setOpenUp(roomAbove > roomBelow);
      setMaxMenuH(Math.max(180, Math.max(roomAbove, roomBelow)));
    } else {
       
      setOpenUp(false);
      setMaxMenuH(Math.max(180, roomBelow));
    }
  }, [pos, items.length]);

  // submenu aberto perto da borda? mede DEPOIS de pintar e ajusta:
  // vira pra ESQUERDA quando não cabe à direita, pra CIMA quando não cabe
  // abaixo do item — fim do bug da "lista que some lá pra baixo"
  useLayoutEffect(() => {
    if (subOpen < 0 || !subRef.current || !menuRef.current) {
      return;
    }
    const sub = subRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const flipX = sub.right > window.innerWidth - 8 || menu.right + SUB_W > window.innerWidth - 8;
    const below = window.innerHeight - Math.max(8, sub.top) - 12;
    const above = sub.top - menu.top + menu.height; // espaço medindo a partir do topo do submenu p/ cima
    const flipY = sub.height > below && above > below;
    const maxH = Math.max(160, flipY ? above : below);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- medição pós-pintura (só muda se mudou)
    setSubAdj((prev) => {
      if (prev.flipX === flipX && prev.flipY === flipY && prev.maxH === maxH) return prev;
      return { flipX, flipY, maxH };
    });
  }, [subOpen, pos]);

  return (
    <div ref={hostRef} className="contents">
      {children}
      {clampedX !== null && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[90] min-w-[218px] overflow-y-auto rounded-lg border border-[#232d3d] bg-[#121722] p-1 text-zinc-200 shadow-[0_12px_36px_rgba(0,0,0,0.55)] timeline-scroll"
          style={{
            left: clampedX,
            top: openUp ? undefined : pos.y,
            bottom: openUp ? Math.max(8, window.innerHeight - pos.y) : undefined,
            maxHeight: maxMenuH,
          }}
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
                  <div
                    ref={subRef}
                    className={`absolute z-[91] min-w-[170px] overflow-y-auto rounded-lg border border-[#232d3d] bg-[#121722] p-1 shadow-[0_12px_36px_rgba(0,0,0,0.55)] timeline-scroll ${
                      subAdj.flipX ? "right-[calc(100%-4px)]" : "left-[calc(100%-4px)]"
                    } ${subAdj.flipY ? "bottom-0" : "top-0"}`}
                    style={{ maxHeight: subAdj.maxH }}
                  >
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
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#1c2430] ${
                            c.danger ? "text-red-400" : ""
                          }`}
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
