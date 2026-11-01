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

## Lote 4 — feedback do Lucas pós-v9.0.0 (sessão de 2026-11-01, TUDO FEITO)
- [x] Quadradinho animado nos catálogos (FxTile.tsx + keyframes gcfx-* no globals.css): efeitos, transições E animações (23/25 animando verificado no navegador)
- [x] 5 novos efeitos de voz (estúdio/subaquático/alienígena/telefone/grave) + chips direto no Inspetor + "Ativar filtros" longe do X
- [x] Link de vídeo direto no Share (#s=…&w=1): cai direto no player fullscreen estilo shorts, autoplay com fallback de toque (verificado ponta a ponta)
- [x] Visualização não oferece mais "copiar pra mim"; edição usa ID estável (reabrir o link atualiza a cópia local); cópia segue duplicando
- [x] SFX com fallback pro Internet Archive (0 → 12 resultados com Openverse fora do ar) + empty states com buscas populares
- [x] Vídeo da biblioteca toca VISÍVEL na barrinha (mini-video) e o modal grande pausa a barrinha (antes tocavam dobrado); modal a 74vh guiado pelo aspecto real
- [x] PresetPreview mede o container e auto-ajusta a fonte (legenda não corta mais)
- [x] Categorias nos stickers (10 chips de busca) e emojis (10 categorias + Todas, 160 emojis, filtro verificado)
- [x] Whisper medium (~750 MB) + catálogo de IA com modelos nomeados por tarefa + voice-transform marcado disponível
- [x] "Shorts" removido da aba de músicas (→ "Estilos instrumentais") e do README ("creators of every kind")
- [x] mp.recordVoice existia em PT?? não — nem existia: mostrava a chave crua. Corrigido ×3 idiomas + layout line-clamp
- [x] Bump 9.1.0 + changelog trilingue (11 itens × 3) + 63/63 testes + lint no nível do HEAD + build verde

## Lote 5 — feedback do Lucas pós-9.1.0 (sessão de 2026-11-01, v9.2.0)
- [x] Preview do IA não trava mais: pickIaFile escolhe o DERIVADO leve (h.264/512Kb ~480p) em vez do maior arquivo (o 4K de 3h) — resolveIaFile + libPlayer + reidratação de link usam a mesma escolha (8 testes novos)
- [x] Barra do player não abre mais junto com o modal da busca (clicou resultado = SÓ modal; a barra segue na aba Mídia)
- [x] Cortar vídeo na mídia com SUBPARTES: importar 1 vídeo abre o editor de partes (dica com "Não mostrar de novo"); marcar in/out + VÁRIAS partes, cada uma vira um clipe; remover/adicionar partes; botão ✂ do lado de converter/excluir nos cards
- [x] +12 efeitos (Pessoas & Beleza: pele suave/glow/homem/mulher/criança/nítido + raio/god rays/chuva/neve/sci-fi/halftone) e +10 transições (empurrar↑↓, cortina↑↓, zoom afastando, giro 3D, glitch, whip pan, persianas, íris) — paridade automática (drawFrame única)
- [x] Abas Efeitos/Animar do painel ESQUERDO com quadradinhos animados + chips de categoria (o inspetor já tinha)
- [x] Links compartilhados: mídia de stock é re-baixada da fonte em quem abre (antes: placeholder preto/sem áudio), gate "Preparando…" com progresso antes do autoplay, volume/mudo no player + retry de mídia
- [x] Round-trip de edição: links carregam sid (id estável) + oid (id do projeto original) — link de retorno ABERTO PELO AUTOR atualiza a edição local dele em lugar (toast próprio); explicações no ShareDialog e na tela do link; descrições dos níveis reescritas ×3 idiomas
- [x] Modo shorts unificado: o nível Visualização JÁ abre no player direto (toggle "vídeo direto" removido do diálogo)
- [x] Busca avançada: filtro de licença + orientação (vídeo/foto), "Carregar mais" (paginação), popover em todas as abas
- [x] Figurinhas multi-fonte (Openverse + Wikimedia PNG) — Openverse caindo não zera mais a aba
- [x] Catálogo de IA: 3-5 modelos por categoria "em breve" — TTS com voz masculina/feminina/infantil, U²-Net/RVM, MDX23C, DFN2 Light, Opus-MT
- [x] 78/78 testes (26 novos: pickIaFile 8, share sid/oid 4, catálogos 3 + os 11 do share v1), lint no nível do HEAD, build verde
- [x] Verificado no navegador: import→partes→2 clipes na timeline, aba Pessoas (6 efeitos), link view → player direto com volume, modal da busca sem a barra, IA 480p derivado TOCANDO, Whip Pan aplicado, sem erros de console
- [ ] Push + deploy: tokens da sessão expiraram (eram só de ambiente) — Lucas roda `git push` (a action Deploy Web cuida da Vercel) ou manda token novo
