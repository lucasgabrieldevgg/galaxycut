// GalaxyCut — Sistema Global de Favoritos (Persistente entre Projetos/Edições)
// Permite favoritar qualquer mídia (da busca ou importada) com estrelas.
// Os favoritos aparecem automaticamente na pasta "⭐ Favoritos" com subpastas organizadas.
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { StockItem, resolveIaFile, downloadStockFile } from "./stockClient";
import { MediaMeta } from "./types";
import { useProject } from "./store";
import { registry } from "./media";
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
        const rawId = raw.id.replace(/^fav-/, "");
        const exists = current.some((x) => x.id === raw.id || x.id === rawId);
        const resolvedKind = forcedKind || normalizeKind(raw.kind);

        if (exists) {
          const next = current.filter((x) => x.id !== raw.id && x.id !== rawId);
          set({ items: next });

          // Remove do projeto atual
          const pState = useProject.getState();
          const targetIds = new Set([raw.id, `fav-${raw.id}`, rawId]);
          const nextMedia = pState.media.filter((m) => !targetIds.has(m.id) || !m.id.startsWith("fav-"));
          useProject.setState({ media: nextMedia });

          toast.info("Removido dos Favoritos", { description: `"${raw.title}"` });
          return false;
        } else {
          const newItem: FavoriteItem = {
            id: rawId,
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

          // Sincroniza imediatamente na pasta ⭐ Favoritos do projeto
          setTimeout(() => {
            get().syncToProjectFolders();
          }, 50);

          toast.success("⭐ Adicionado aos Favoritos!", {
            description: `Salvo na pasta "⭐ Favoritos" para todas as suas próximas edições.`,
          });
          return true;
        }
      },

      isFavorite: (id: string) => {
        const rawId = id.replace(/^fav-/, "");
        return get().items.some((x) => x.id === id || x.id === rawId);
      },

      removeFavorite: (id: string) => {
        const rawId = id.replace(/^fav-/, "");
        set((s) => ({ items: s.items.filter((x) => x.id !== id && x.id !== rawId) }));
        const pState = useProject.getState();
        const targetIds = new Set([id, `fav-${id}`, rawId]);
        const nextMedia = pState.media.filter((m) => !targetIds.has(m.id) || !m.id.startsWith("fav-"));
        useProject.setState({ media: nextMedia });
      },

      clearFavorites: () => {
        set({ items: [] });
        const pState = useProject.getState();
        const favRoot = pState.folders.find((f) => f.name === "⭐ Favoritos" && !f.parentId);
        if (favRoot) {
          pState.deleteFolder(favRoot.id);
        }
        toast.info("Todos os favoritos foram limpos.");
      },

      setEnabled: (enabled: boolean) => {
        set({ enabled });
        if (!enabled) {
          const pState = useProject.getState();
          const favRoot = pState.folders.find((f) => f.name === "⭐ Favoritos" && !f.parentId);
          if (favRoot) {
            pState.deleteFolder(favRoot.id);
          }
        } else {
          get().syncToProjectFolders();
        }
      },

      syncToProjectFolders: () => {
        const pState = useProject.getState();
        if (!get().enabled) {
          const favRoot = pState.folders.find((f) => f.name === "⭐ Favoritos" && !f.parentId);
          if (favRoot) pState.deleteFolder(favRoot.id);
          return;
        }

        const favs = get().items;
        if (!favs.length) return;

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

        // Insere as mídias favoritadas nas respectivas subpastas
        const currentMedia = pState.media;
        const newMediaList: MediaMeta[] = [...currentMedia];
        let changed = false;

        for (const fav of favs) {
          const targetFolderId = subFolderMap.get(fav.kind);
          if (!targetFolderId) continue;

          const mediaId = `fav-${fav.id}`;
          const existing = newMediaList.find((m) => m.id === mediaId || m.id === fav.id);

          if (!existing) {
            const meta: MediaMeta = {
              id: mediaId,
              name: fav.title,
              kind:
                fav.kind === "music" || fav.kind === "sfx"
                  ? "audio"
                  : fav.kind === "image" || fav.kind === "sticker"
                  ? "image"
                  : "video",
              duration: fav.duration || (fav.kind === "image" || fav.kind === "sticker" ? 4.8 : 10),
              width: 1920,
              height: 1080,
              thumbnail: fav.thumb,
              source: fav.isStock ? "stock" : "local",
              stockUrl: fav.url,
              folderId: targetFolderId,
              license: fav.license || "free",
              licenseLabel: fav.license || "free",
              creator: fav.creator,
            };
            newMediaList.push(meta);
            changed = true;
          } else if (existing.id.startsWith("fav-") && existing.folderId !== targetFolderId) {
            existing.folderId = targetFolderId;
            changed = true;
          }
        }

        if (changed) {
          useProject.setState({ media: newMediaList });
        }
      },
    }),
    {
      name: "galaxycut_favorites",
    }
  )
);
