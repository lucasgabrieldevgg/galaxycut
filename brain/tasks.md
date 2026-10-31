# Tasks — v9.0.0 (status real da sessão de 2026-11-01)

> Como continuar: leia `context.md` → este arquivo → pegue o primeiro item aberto do "próximo lote".

## Lote 0 — fixes de análise (TUDO FEITO)
- [x] Rede de segurança: tsc strict + build sem ignore + ESLint religado (commit 20a4717)
- [x] Deps mortas (mediabunny, tailwindcss-animate) + tailwind.config legado + gifenc tipado
- [x] Desktop: electron-updater no package.json + lockfile regenerado + ícones commitados (gen:icons)
- [x] i18n: `<html lang>` dinâmico + strings soltas (mobile, textos default, player da biblioteca) + naming galaxiacut→galaxycut com migração de chave
- [x] Aviso de mídia >600MB (toast com throttle de 10s)
- [x] Vitest + testes dos módulos puros + passo no CI (63 testes; pegaram 2 bugs reais de atalho)

## Lote 1 — compartilhar edição (TUDO FEITO — ADR-001)
- [x] lib/editor/share.ts: payload v1 + codec gzip/base64url + caps (14 testes de fronteira)
- [x] ShareDialog: 3 níveis com nome+descrição, Gerar link, painel "Este link permite acesso à edição…" + copiar
- [x] SharedEditScreen + viewer travado (play/scrub, sem edição, sem persistir nada)
- [x] Botão no TopBar + detecção de `#s=` no boot
- [x] **VERIFICADO NO NAVEGADOR**: gerar → abrir em aba nova → viewer → importar edição (zero erros de console)

## Lote 2 — roadmap (4 de 9 nesta sessão)
- [x] Corte de mídia no painel (modo tesoura no player, loop no trecho, add só o trecho) — 018ddec
- [x] Importar texto .txt/.srt/.vtt (parser tolerante + addCueClips com estilo de legenda) — f43d491
- [x] Catálogo de modelos de IA com tarefas declaradas (taxonomia completa + UI) — 4948ade
- [x] Efeitos de voz robô/rádio/megafone/eco (buildVoiceChain único p/ preview e export) — cf0638c
- [ ] **Efeitos com demonstração** (miniaturas ao vivo no catálogo de efeitos)
- [ ] **Velocidade por gráfico** (speed ramping com pontos — mexe no playback E no exportEngine: a integral da curva precisa ser idêntica nos dois)
- [ ] **Sistema de pacotes v1** (abas por categoria, instalar/desinstalar/tamanho, `.gcpack` local, packs seed; desinstalar não pode corromper projeto que usa mídia do pack)
- [ ] **Rastreamento de elemento** (template matching em canvas → keyframes de x/y; serve pra texto/legenda/sticker/imagem/vídeo)
- [ ] **Estabilizador** (mesma engine de rastreio, inversão suavizada + zoom de segurança)
- [ ] **Grave/aguda (pitch-shift real)**: worklet de time-stretch granular — não subir sem audicionar

## Lote 3 — fechamento (FEITO)
- [x] Passada de segurança nas superfícies novas (codec do share com validação na fronteira + 14 testes; sem .gcpack ainda)
- [x] changelog.json v9.0.0 trilingue + README (features + npm test) + bump 9.0.0
- [x] Build + verificação no navegador por fluxo
- [x] Push da branch `feat/v9-suite` (o merge pra main — e o deploy — é do Lucas)

## Dívida conhecida e documentada (não desta sessão)
- Catálogos PT-only: nomes de efeitos/animações/transições/presets/vibes/transcoder seguem hardcoded em PT (~90 chaves ×3 idiomas quando for feito)
- Filtros OBS (audioFilters) ainda são preview-only na exportação — os efeitos de voz JÁ saem no arquivo
- `console.log` de erro no handleFiles usa i18n, mas diálogos antigos (AudioFiltersDialog/Inspector) têm strings PT hardcoded
- Chrome não tokenizado (hex espalhado) — só o accent é tokenizado
