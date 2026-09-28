// GalaxyCut — menu de botão direito PRÓPRIO (sem Radix).
// Motivo: o menu do clipe piscava e fechava sozinho em alguns mouses/touchpads
// (clique rápido era interpretado como clique fora). Este aqui abre no evento
// contextmenu e fecha APENAS em: clique esquerdo fora, Esc, rolagem ou item.
// v7.1: o menu NUNCA mais passa da borda da tela — abre pra cima quando não
// cabe embaixo.
// v7.2: o SUBMENU agora é um PORTAL irmão (antes ele nascia dentro do menu,
// que tem rolagem — e era CORTADO, obrigando a arrastar pra ver). Portal
// ancorado no item, abrindo PRA CIMA quando não cabe embaixo — igual ao menu
// principal. Hover abre, sem clique, sem arrastar.
"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_W = 240; // largura máxima do menu (pro clamp lateral)
const SUB_W = 210; // largura estimada do submenu (antes de medir)

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
  /** retângulo da linha que abriu o submenu (âncora do portal) */
  const [subAnchor, setSubAnchor] = useState<{ left: number; right: number; top: number; bottom: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  /** posicionamento do submenu: pra cima/pra baixo + flipX, medido após pintar */
  const [subAdj, setSubAdj] = useState<{ flipX: boolean; openUp: boolean; maxH: number; width: number }>({
    flipX: false, openUp: false, maxH: 400, width: SUB_W,
  });
  /** o menu em si abre pra cima quando não cabe embaixo do ponto */
  const [openUp, setOpenUp] = useState(false);
  const [maxMenuH, setMaxMenuH] = useState<number>(9999);
  const openedAt = useRef(0);
  const subCloseTimer = useRef<number>(0);

  // fecha e limpa
  const close = () => {
    window.clearTimeout(subCloseTimer.current);
    setPos(null);
    setSubOpen(-1);
    setSubAnchor(null);
  };

  // abre (ou troca) o submenu ancorado numa linha — hover mostra na hora
  const openSub = (i: number, row: HTMLElement | null) => {
    window.clearTimeout(subCloseTimer.current);
    if (!row) {
      setSubOpen(-1);
      setSubAnchor(null);
      return;
    }
    const r = row.getBoundingClientRect();
    setSubAnchor({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    setSubOpen(i);
  };
  const scheduleSubClose = () => {
    window.clearTimeout(subCloseTimer.current);
    subCloseTimer.current = window.setTimeout(() => {
      setSubOpen(-1);
      setSubAnchor(null);
    }, 160);
  };

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return; // clique dentro do menu
      if (subRef.current?.contains(target)) return; // clique dentro do submenu (portal)
      // clique de abrir (botão direito) logo após abrir não conta como "fora"
      if (e.button === 2 && performance.now() - openedAt.current < 400) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // rolagem FORA do menu/submenu fecha; rolagem DENTRO deixa (o submenu
    // pode ter rolagem própria quando a tela é muito baixa)
    const onGo = (e: WheelEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || subRef.current?.contains(target)) return;
      close();
    };
    const onResize = () => close();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onGo, { passive: true, capture: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onGo, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(subCloseTimer.current);
    };
  }, [pos]);

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) return; // só dentro deste wrapper
      e.preventDefault();
      e.stopPropagation();
      openedAt.current = performance.now();
      setSubOpen(-1);
      setSubAnchor(null);
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
      setSubAnchor(null);
      // v7.3: âncora é o BOTÃO clicado de verdade. O wrapper é display:contents
      // (não gera caixa) — o getBoundingClientRect dele volta tudo 0 e o menu
      // abria no CANTO SUPERIOR ESQUERDO da tela, longe do cursor.
      const btn = (el.closest("button") ?? el) as HTMLElement;
      const r = btn.getBoundingClientRect();
      setPos({ x: r.right - 218, y: r.bottom + 4 }); // alinhado à direita do botão
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

  // SUBMENU (portal): mede DEPOIS de pintar e posiciona pra ver TUDO sem
  // arrastar — pra cima quando não cabe embaixo (igual ao menu principal),
  // pra esquerda quando não cabe à direita. Sem cortes: ele não mora mais
  // dentro do container com rolagem do menu.
  useLayoutEffect(() => {
    if (subOpen < 0 || !subAnchor || !subRef.current) return;
    const sub = subRef.current.getBoundingClientRect();
    const w = sub.width || SUB_W;
    // lateral: à direita da âncora; se estourar, vira pra esquerda
    let x = subAnchor.right - 4;
    if (x + w > window.innerWidth - 8) x = Math.max(8, subAnchor.left - w + 4);
    // vertical: cabe embaixo da âncora? senão abre PRA CIMA (tudo visível);
    // se não couber em nenhum lado, o maior espaço vence com rolagem interna
    const roomBelow = window.innerHeight - subAnchor.top - 8;
    const roomAbove = subAnchor.bottom - 8;
    const subH = sub.height;
    let openUp: boolean;
    let maxH: number;
    if (subH <= roomBelow) {
      openUp = false;
      maxH = roomBelow;
    } else if (subH <= roomAbove) {
      openUp = true;
      maxH = roomAbove;
    } else if (roomAbove >= roomBelow) {
      openUp = true;
      maxH = roomAbove;
    } else {
      openUp = false;
      maxH = roomBelow;
    }
    subRef.current.style.left = `${Math.round(x)}px`;
    if (openUp) {
      subRef.current.style.bottom = `${Math.round(window.innerHeight - subAnchor.bottom - 4)}px`;
      subRef.current.style.top = "auto";
    } else {
      subRef.current.style.top = `${Math.round(subAnchor.top - 2)}px`;
      subRef.current.style.bottom = "auto";
    }
    subRef.current.style.maxHeight = `${Math.round(Math.max(160, maxH))}px`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- só registra p/ re-render estável
    setSubAdj((prev) => (prev.flipX === (x !== subAnchor.right - 4) && prev.openUp === openUp ? prev : { ...prev, flipX: x !== subAnchor.right - 4, openUp }));
  }, [subOpen, subAnchor]);

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
          /* v7.3: o portal é FILHO do card na árvore React — sem isso, o clique
             num item (Renomear/Excluir…) borbulha sinteticamente até o onClick
             do card e ABRE O EDITOR (o bug do "3 pontinhos abre o editor") */
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
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
                onMouseEnter={(e) => openSub(i, e.currentTarget)}
                onMouseLeave={scheduleSubClose}
              >
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#1c2430] ${
                    subOpen === i ? "bg-[#1c2430]" : ""
                  }`}
                >
                  {it.icon}
                  <span className="flex-1">{it.label}</span>
                  <span className="text-zinc-600">›</span>
                </button>
              </div>
            ) : (
              <div
                key={i}
                onMouseEnter={() => {
                  // hover numa linha comum fecha o submenu aberto
                  window.clearTimeout(subCloseTimer.current);
                  setSubOpen(-1);
                  setSubAnchor(null);
                }}
              >
                <button
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
              </div>
            )
          )}
        </div>,
        document.body
      )}
      {/* SUBMENU em portal irmão: nunca é cortado pelo menu (fim do arrastar
          pra ver as transições) — abre pra cima quando não cabe embaixo */}
      {subOpen >= 0 && subAnchor && pos && createPortal(
        <div
          ref={subRef}
          className="fixed z-[92] min-w-[170px] overflow-y-auto rounded-lg border border-[#232d3d] bg-[#121722] p-1 text-zinc-200 shadow-[0_12px_36px_rgba(0,0,0,0.55)] timeline-scroll"
          style={{ left: -9999, top: -9999 }} // posicionado pelo layoutEffect após medir
          onMouseEnter={() => window.clearTimeout(subCloseTimer.current)}
          onMouseLeave={scheduleSubClose}
          onContextMenu={(e) => e.preventDefault()}
          /* v7.3: idem ao menu — portal filho do card/clip não vaza clique pro
             ancestral React (mesmo bug do "abre o editor") */
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {items[subOpen]?.children?.map((c, j) =>
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
        </div>,
        document.body
      )}
    </div>
  );
}
