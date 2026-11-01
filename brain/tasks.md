# Tasks — v9.0.0 (status real da sessão de 2026-11-01)

> Como continuar: leia `context.md` → este arquivo → pegue o primeiro item aberto do "próximo lote".

## Lote 6 — fotos reais nos catálogos (sessão de 2026-11-01, v9.3.0)
> Contexto: o Lucas testou a produção ANTES do deploy da v9.2.0 (que estava
> preso sem token) e achou que nada tinha sido feito — a v9.2.0 já continha
> todo o feedback dele. Antes de mexer, AUDITEI item por item contra o site
> live (aba Efeitos/Pessoas/Homem Cinema/etc. confirmados no navegador) e
> respondi com o mapa do que está onde. O pedido NOVO desta rodada: fotos
> reais demonstrando efeitos e transições.
- [x] Efeitos/transições/animações demonstrados com FOTOS REAIS: cada tile é um mini-projeto (1-2 clipes de imagem) renderizado pela drawFrame REAL (`fxDemo.ts` puro + `fxDemoRender.ts` desenha + `FxTile.tsx` canvas/fallback) — paridade por construção, zero duplicação do motor
- [x] 4 fotos IA em public/fx-demo (~160KB total: mulher 46KB, homem 28KB, criança 31KB, cena urbana 55KB): Pessoas & Beleza usa o retrato na medida (Homem Cinema→homem, Mulher Glow→mulher, Criança Vibrante→criança, Pele Suave/Glow/Clareza→mulher); o resto usa a cena urbana; transições = cena→mulher
- [x] Transições e animações em loop na foto (segura→transiciona→segura / entra→segura / segura→sai→vazio / combo contínuo); 8 efeitos de movimento animam (shake, glitch, flash, vhs, raio, chuva, neve, sci-fi); grades de cor em frame fixo escolhido por heurística de "frame mais presente" (diff de pixels vs foto crua)
- [x] Performance: UM rAF compartilhado a ~30fps p/ todos os tiles, IntersectionObserver (fora da tela não desenha NADA), prefers-reduced-motion estático, fallback pro quadradinho CSS antigo se a foto falhar (nada quebra offline)
- [x] Tiles maiores: lista de Efeitos 58px (size=lg), grids de transição/animação 46px (size=md), inspetores compactos seguem 34px (sm); nenhuma string nova de i18n (tiles são aria-hidden)
- [x] Verificado no navegador (build local servido): 37/37 efeitos pintam conforme o scroll (lazy OK), assinaturas de cor comprovam o motor de verdade (noir saturação 0, matrix verde dominante, thermal quente, womanGrade rosado), Dissolver anima 9 estados no ciclo, zoomOut 4 estados, transições do Inspector idem, ZERO erros de console
- [x] 83/83 testes (5 novos: fxDemo cobre o mapa foto↔efeito p/ o catálogo todo), tsc ok, lint 0 erros, build verde, bump 9.3.0 + changelog trilingue (4 itens x3) + README (linha de features nova)
- [x] Push + deploy v9.3.0 concluídos: main fb91ec6 + tag v9.3.0 — CI #58 ✓, Deploy Web #57 ✓, Vercel READY servindo 9.3.0 (version.json + 4 fotos fx-demo HTTP 200), Release Desktop #23 ✓ (AppImage 103 MB + Setup-9.3.0.exe 79 MB + feeds). Verificado COMPORTAMENTALMENTE no live: 37 tiles de foto na aba Efeitos, lazy pintando os visíveis, zero console errors

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
- [x] Push + deploy concluídos (sessão de 2026-11-01, tokens novos do Lucas): main 1ad80ef + tag v9.2.0 no ar — CI #56 ✓, Deploy Web #55 ✓ (secret VERCEL_TOKEN renovado ANTES do push, senão a action morria com token rotacionado), Vercel dpl_8zku4xj READY servindo 9.2.0 em galaxycut.vercel.app (version.json confere), Release Desktop #22 ✓ com GalaxyCut-9.2.0.AppImage (103 MB) + GalaxyCut-Setup-9.2.0.exe (79 MB) + feeds electron-updater (latest.yml/latest-linux.yml/latest.json)

## 2026-11-02 — v9.4.0 (deploy OK — CI #60, Deploy Web #59, Release Desktop #24, Vercel dpl_Ex7DMpKX READY)
Prompt grande do usuário pós-teste da 9.2/9.3 ("você não colocou algumas coisas") → auditoria honesta de 3 frentes + implementação:
- CORTE: TrimDialog central (prévia + waveform ciano + handles arrastáveis + medidor dB + subpartes sequenciais 1→2→3, salvas por mídia; ✂ no card/menu do clipe/player; modo PARTES antigo do LibraryPlayerBar removido). "Não mostrar de novo" na importação respeitado.
- VOZ: bug CRÍTICO corrigido (needsDsp não incluía voiceFx → efeito mudo na prévia; preview=export agora). +20 efeitos (29 total) com pitch-shift real (pitchWorklet.ts, AudioWorklet granular via Blob URL — funciona em offline ctx tb), parâmetros intensidade/tonalidade, A/B, ouvir, lote. Transformação de voz: 4 motores locais (m→f/f→m/jovem/idosa) geram NOVA faixa (original preservado) — testado ponta a ponta no browser (sine 440Hz → "test-clip — Masculino → Feminino.wav" na timeline). 17 cards fictícios de IA removidos (só funcional entra na lista).
- VÍDEO/REPRODUÇÃO: URL do IA resolvida antes de tocar (resolveStockPlayable + cache; era página HTML → tela preta 0:00), erro honesto c/ "abrir na fonte", .mkv fora, proporção imediata (width/height do resultado), hover object-contain. Selo "Preparando mídia… N%".
- BIBLIOTECA: Foto agora busca Met+AIC (CC0 keyless) + Pexels Fotos + Openverse c/ chave opcional; status ✓/✕ por fonte visível; duração custom com inputs; drop de URL de imagem (Google Imagens) com /api/img-proxy (api/img-proxy.js, só imagem, 25MB/10s); sub-aba Figurinhas removida.
- VISUAL: +7 efeitos (fog/sparks/confetti/bubbles/neonGrid/mirrorV/filmBurn), +6 transições (crosszoom/fadeWhite/spinblur/split/filmBurnT/zoomRota — tb em texto), +10 animações. Tiles demo animados.
- HONESTIDADE: filtros OBS no mix da exportação (eram só prévia), gravação sem duplo processamento, "Usar" do AiModels não grava mais lixo em whisperModel.
- Testes: 86/86 vitest (voiceFx 29 ids + worklet, aiModels 8 reais, pickIaFile sem mkv, fxDemo allowlist, i18n ES completo c/ 119 chaves novas), tsc limpo, lint 0 erros, build OK, smoke no browser (agent-browser): onboarding→projeto→import mp4→TrimDialog→efeito voz aguda c/ sliders→play sem erros→transformação m→f→playback OK→diálogo IA honesto. Nota: i18n.ts foi truncado por script meu no meio — recuperado do git + chaves ES re-sincronizadas (teste de cobertura pegou).
Deploy: push main 9302573 + tag v9.4.0 → CI/Deploy/Release verdes; vercel.app 9.4.0; AppImage 103MB + Setup 79MB + 3 feeds.

## 2026-11-02 — v9.4.1 HOTFIX (deploy OK — CI #62, Deploy Web #61, Release Desktop #25, Vercel READY)
Usuário testou a 9.4.0 e relatou 4 regressões de áudio/vídeo + pediu aviso de busca. Diagnóstico + correção raiz (cada item verificado com MEDIÇÃO REAL DE SINAL no browser, não só "compila"):
- EFEITO DE VOZ MUDO: camadas de ambiente das vias (chiado/estática/estalos) ligavam DIRETO no output da cadeia → agora seguem gate+intensidade via nó aux dedicado (aux.gain = mix só na via ativa). Medido: RMS 0.168 com "rádio".
- ORIGINAL AINDA MUDO: caminho "sem DSP" antigo só mexia volume nativo — elemento capturado ficava com ganho da cadeia travado em 0 PRA SEMPRE. Agora: needsDsp || isLinked(el) → SEMPRE cadeia com ganho real (transparente). Medido: RMS 0.025 ≈ nível real do arquivo (-32dB; volumedetect ffmpeg: max -28.8dB) após remover efeito.
- TRANSFORMAR VOZ MUDO: AudioBufferSourceNode do OfflineAudioContext NUNCA recebia start(0) → render = silêncio puro. Corrigido + contexto compartilhado de decodificação (decodeCtx em wav.ts; antes 1 AudioContext por chamada → limite ~6 do Chrome cascateava). Verificado: WAV gerado com picos max=1.0/méd=0.46, clipe toca vol=1 sem mudo, original silenciado conforme opção.
- CÂMERA LENTA + TICKS PRA TRÁS: relógio do playback refeito (clockT0/clockStart por performance.now; líder re-ancora em janela assimétrica +0.5/-0.2s; stall congela honestamente 2.5s c/ válvula 1x por trava; seek re-ancora). Medido: taxa 0.973x e 1.000x, ZERO passos negativos em janelas de 2-4s.
- MEDIDOR dB DO TRIM: AnalyserNode em ctx próprio nascia SUSPENSO e sequestrava a prévia → modo "fn" novo no DbMeter lê PICO da waveform na posição da seta (funciona pausado). Medido: -5.0dB / fill 91.6% (bate c/ sine 440Hz 0.55amp).
- AVISO DE BUSCA (pedido do usuário): banner âmbar no topo da aba Busca — "fontes limitadas, pesquise no Google e ARRASTE pra cá ou baixe e importe" (pt/en/es, localStorage galaxycut_search_notice_v1, dismissível). Verificado renderizado 336×77px.
- Extras: enablePitch() re-liga vias quando worklet assenta p/ cadeias EXISTENTES (allChains); attach() nasce limpo (vol=1, muted=false); __gcAudio hook dev; helperefs de debug.
- Processo: tsc ✓, vitest 86/86 ✓, lint 0 erros ✓, build ✓; smoke agent-browser COMPLETO (import mp4→TrimDialog dB vivo→timeline→play 1.0x sem recuos→radio RMS 0.168→Original RMS 0.025→esquilo/fantasma + worklet gc-pitch registrado→transform f→m (picos 1.0)→play do WAV vol=1→banner Busca ok→console limpo). Nota: 157 arquivos com mode 644→755 no working tree (artefato de ambiente) — resolvido com core.fileMode=false, commit limpo só com as 15 mudanças reais; public/pwtest.js (lixo de teste antigo) removido.
- Deploy: push main ab2bdbb + tag v9.4.1 → CI #62 ✓, Deploy Web #61 ✓, Vercel READY servindo 9.4.1 (version.json confere em galaxycut.vercel.app), Release Desktop #25 ✓ (AppImage 108MB + Setup 83MB + 3 feeds electron-updater), release v9.4.1 publicada (não-draft).

## 2026-11-02 — v9.4.2 (deploy OK — CI #64, Deploy Web #63, Release Desktop #26, Vercel READY)
Usuário testou a 9.4.1 e relatou: efeitos de voz AINDA mudavam o vídeo, uns áudios tocavam mas a voz principal não, e a experiência "extrememente travada, não dá pra reproduzir". Reconstruí o cenário real dele com motor de estresse medido:
- SETUP DE TESTE: projeto 75s / 12 clipes / 6 faixas / 5 mídias (2× 1080p 52MB, 720p, wav de voz, mp3), overlaps, mesma mídia em 2 faixas ao mesmo tempo, efeito numa faixa do meio. Instrumentação: patch de prototype (currentTime/play/pause/playbackRate com contagem), rAF recorder (sem setTimeout = sem contaminação), sonda RMS PÓS-master, tracer de syncMedia via prototype wrap.
- CAUSAS RAIZ ENCONTRADAS (medidas, não chutadas): (1) STORM OF SEEKS — v9.4.1 buscava TODO frame com drift > 0,4s (líder E secundários) — cada seek de 1080p custa centenas de ms; (2) SEM PRIMING — toda ativação de clipe fazia seek na hora → congelava a seta 0,7s e a válvula PULAVA 1,1s de conteúdo (medido na borda dos 63s); (3) gate do play esperava TODA a mídia do projeto; (4) janela do isActive no updateAudio (±0,0001s) ≠ janela do syncMedia (±0,05s) → play→pause→play em toda borda (44/44 plays/pauses pra 12 clipes); (5) âncora de áudio podia dar micro-passos de 30ms pra trás.
- MOTOR NOVO (playback.ts): priming 1,6s à frente (seek silencioso em elemento pausado, throttle 800ms); disciplina de deriva por TAXA (±4,5%, ±9% acima de 0,3s, preservesPitch do browser); seek único com cooldown 700ms-1s por elemento (nunca storm); relógio monotônico por construção (só re-ancora em líder à frente; líder atrasado ≤1,2s é alcançado a +9% com relógio em 1x — nunca câmera lenta); carência de ativação 800ms; gate do play e "carregando N%" só olham mídia dos próximos 3s; teto de prewarm 12s→6s.
- MÍDIA: arquivo só-de-áudio em container de vídeo (.webm sem trilha — nota de voz exportada) era classificado como VÍDEO (clipe fantasma na faixa de vídeo): probeVideo agora recusa com "audio-only" (videoWidth 0) e o importFile reclassifica via probeAudio. Verificado: voz.webm entra como audio.
- RESULTADO MEDIDO (mesmo projeto de estresse, antes → depois): passos pra trás 1 (30ms) → 0; congelamentos 1 → 0; saltos de conteúdo 1 (4,87x) → 0; plays/pauses de elemento 44/44 → 12/12 (exatamente 1 ativação por clipe); seeks 41 → 33 (todos legítimos: priming + ativação + corte de mesma mídia); taxa 1,0x ponta a ponta.
- EFEITOS PELA UI REAL (a queixa #1): aprendizado de medição — o "Rádio" medido antes era só o chiado da camada aux (o elemento tinha parado sem eu ver); desta vez TODA amostra inclui estado do elemento. Esquilo (pitch +9st) aplicado pela UI durante o play → RMS 0,0002–0,027 seguindo o envelope da fonte (áudio deslocado REAL); "Original" → RMS 0,0001–0,024 (som limpo recuperado). NOTA UI: o botão de limpar efeito chama "Original" (vfx.none) — confundir com os "Nenhuma" dos seletores de transição mandou meus cliques pro lugar errado e contaminou 2 sessões de teste.
- NOTA PARA O USUÁRIO: WAVs gerados pelo "Transformar voz" da v9.4.0 continuam mudos PARA SEMEPR (dados gerados com o bug do src.start) — re-transformar na 9.4.2 gera áudio de verdade. Clipes silenciados pela opção "silenciar original" podem ser reativados no inspetor.
- Ambiente: sandbox reciclou no meio da sessão (v9.4.1 sumiu do working tree) — recuperado com git reset --hard origin/main. tsc ✓, vitest 86/86 ✓, lint 0 erros ✓, build ✓, console limpo.
- Deploy: push main 6faa62b + tag v9.4.2 → CI #64 ✓, Deploy Web #63 ✓, Vercel READY servindo 9.4.2, Release Desktop #26 (AppImage + Setup + 3 feeds).
