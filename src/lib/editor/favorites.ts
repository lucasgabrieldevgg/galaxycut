// GalaxyCut — Sistema Global de Favoritos (Persistente entre Projetos/Edições)
// Permite favoritar qualquer mídia (da busca ou importada) com estrelas.
// Os favoritos aparecem automaticamente na pasta "⭐ Favoritos" com subpastas organizadas.
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { StockItem } from "./stockClient";
import { MediaMeta } from "./types";
import { useProject } from "./store";
import { toast } from "sonner";

export type FavoriteKind = "video" | "music" | "sfx" | "image" | "sticker";

export interface FavoriteItem {
  id: string;
  title: string;
  kind: FavoriteKind;
  url: string;
  thumb?: string;
  duration?: number;
  provider?: string;
  license?: string;
  creator?: string;
  isStock?: boolean;
  createdAt: number;
}

interface FavoritesState {
  items: FavoriteItem[];
  enabled: boolean;
  toggleFavorite: (
    item: {
      id: string;
      title: string;
      url?: string;
      kind?: string;
      thumb?: string;
      duration?: number;
      provider?: string;
      license?: string;
      creator?: string;
    },
    forcedKind?: FavoriteKind
  ) => boolean;
  isFavorite: (id: string) => boolean;
  removeFavorite: (id: string) => void;
  clearFavorites: () => void;
  setEnabled: (enabled: boolean) => void;
  syncToProjectFolders: () => void;
}

function normalizeKind(kind?: string, isAudio?: boolean): FavoriteKind {
  if (!kind) return isAudio ? "music" : "video";
  const k = kind.toLowerCase();
  if (k === "sfx" || k.includes("sound effect") || k.includes("efeito")) return "sfx";
  if (k === "music" || k === "audio" || k.includes("música") || k.includes("shorts")) return "music";
  if (k === "image" || k === "photo" || k.includes("imagem") || k.includes("foto")) return "image";
  if (k === "sticker" || k.includes("figurinhas") || k.includes("emoji")) return "sticker";
  return "video";
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      items: [],
      enabled: true,

      toggleFavorite: (raw, forcedKind) => {
        const current = get().items;
        const exists = current.some((x) => x.id === raw.id);
        const resolvedKind = forcedKind || normalizeKind(raw.kind);

        if (exists) {
          const next = current.filter((x) => x.id !== raw.id);
          set({ items: next });
          toast.info("Removido dos Favoritos", { description: `"${raw.title}"` });
          return false;
        } else {
          const newItem: FavoriteItem = {
            id: raw.id,
            title: raw.title || "Favorito",
            kind: resolvedKind,
            url: raw.url || "",
            thumb: raw.thumb,
            duration: raw.duration,
            provider: raw.provider || "Local / Importado",
            license: raw.license || "free",
            creator: raw.creator,
            isStock: Boolean(raw.provider && raw.provider !== "Local / Importado"),
            createdAt: Date.now(),
          };
          const next = [newItem, ...current];
          set({ items: next });
          toast.success("⭐ Adicionado aos Favoritos!", {
            description: `Estará disponível nas suas próximas edições na pasta "⭐ Favoritos".`,
          });
          return true;
        }
      },

      isFavorite: (id: string) => {
        return get().items.some((x) => x.id === id);
      },

      removeFavorite: (id: string) => {
        set((s) => ({ items: s.items.filter((x) => x.id !== id) }));
      },

      clearFavorites: () => {
        set({ items: [] });
        toast.info("Todos os favoritos foram limpos.");
      },

      setEnabled: (enabled: boolean) => {
        set({ enabled });
      },

      syncToProjectFolders: () => {
        if (!get().enabled) return;
        const favs = get().items;
        if (!favs.length) return;

        const pState = useProject.getState();
        const rootFolders = pState.folders;

        // Cria a pasta raiz "⭐ Favoritos" se não existir
        let favRoot = rootFolders.find((f) => f.name === "⭐ Favoritos" && !f.parentId);
        if (!favRoot) {
          favRoot = pState.createFolder("⭐ Favoritos", null);
        }

        const subNames: Record<FavoriteKind, string> = {
          video: "🎬 Vídeos Favoritos",
          music: "🎵 Músicas Favoritas",
          sfx: "⚡ Efeitos Sonoros Favoritos",
          image: "🖼️ Fotos & Imagens Favoritas",
          sticker: "🎨 Figurinhas Favoritas",
        };

        const subFolderMap = new Map<FavoriteKind, string>();
        for (const [k, name] of Object.entries(subNames) as [FavoriteKind, string][]) {
          let sub = pState.folders.find((f) => f.name === name && f.parentId === favRoot!.id);
          if (!sub) {
            sub = pState.createFolder(name, favRoot!.id);
          }
          subFolderMap.set(k, sub.id);
        }
      },
    }),
    {
      name: "galaxycut_favorites",
    }
  )
);
