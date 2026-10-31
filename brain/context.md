# GalaxyCut — contexto (o mapa)

> Sessão nova? Leia na ordem: `context.md` → `intent.md` → `tasks.md` (primeiro checkbox aberto).
> Se bater dúvida sobre "por que é assim", procure em `decisions/`.

## O que é
Editor de vídeo 100% no navegador (e app Electron), grátis, sem marca d'água, feito pra criadores de game shorts. Tudo local: nenhum arquivo sai da máquina do usuário sem ação explícita.

## Stack (boring on purpose)
- Next.js 16 (App Router, `output: "export"` — site estático) + React 19 + TypeScript strict
- Tailwind 4 com tokens em CSS (`@theme inline` no globals.css — NÃO existe tailwind.config)
- shadcn/ui (Radix) + Lucide icons
- Zustand: `useProject` = documento (undo/redo por snapshot, 60 níveis), `usePlayback` = playhead a 60fps
- Exportação: WebCodecs + mp4-muxer / webm-muxer / gifenc; áudio mixado em OfflineAudioContext
- Legendas: Whisper local (transformers.js) num Web Worker persistente, cancelável
- Desktop: Electron (contextIsolation ON, nodeIntegration OFF), auto-update via electron-updater

## Decisões estruturais que NÃO se mudam por acidente
1. `drawFrame()` (render.ts) é ÚNICA e serve preview E exportação — nunca bifurcar.
2. App 100% estático: nenhuma dependência de servidor em runtime (exceção histórica: `api/feedback.js`).
3. Privacy-first: nada sai da máquina sem o usuário pedir.
4. PT é o dicionário-base do i18n; EN/ES não podem ter gap (o teste de paridade cuida disso).
5. Undo por snapshot (60 níveis) — performance aceitável até em projetos grandes; otimizar só com dado real na mão.

## Comandos
`npm ci` · `npm run dev` (porta 3000) · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` (gera `public/version.json` e sincroniza a versão do desktop) · `npm run gen:icons`

## Convenções
- Commits: conventional commits em inglês (feat/fix/chore/release + escopo), estilo do histórico do repo.
- Código comentado em português; changelog trilingue (`items` EN, `items_pt`, `items_es`).
- Eventos/chaves: prefixo `galaxycut:`; `galaxiacut_*` só existe como chave legada de migração (ler, nunca gravar).
- Cor de destaque: SEMPRE via `var(--gc-accent-*)` — nunca hex direto em código novo.
- Qualidade: tsc strict SEM ignoreBuildErrors; ESLint: código morto = erro, dívida = warning visível.
- Release: atualizar `changelog.json` + `package.json` → commit na main → `git tag vY.Z.K && git push origin vY.Z.K` (o Actions builda AppImage + NSIS e publica o Release com changelog completo).

## Onde mora cada coisa
`src/app` (casca Next) · `src/components/editor` (toda a UI do editor) · `src/components/ui` (shadcn) · `src/lib/editor` (motor: store, playback, render, export*, subtitles, media, i18n…) · `desktop` (Electron) · `scripts` (helpers de build) · `brain` (esta pasta — memória viva do projeto)
