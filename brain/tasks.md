# Tasks — v9 (em ordem; o critério entre parênteses é como se verifica)

## Lote 0 — fixes de análise
- [x] Rede de segurança: tsc strict + build sem ignore + ESLint religado (tsc/lint/build verdes — commit 20a4717)
- [x] Deps mortas (mediabunny, tailwindcss-animate) + tailwind.config legado + gifenc tipado (lockfiles coerentes)
- [x] Desktop: electron-updater no package.json + lockfile regenerado + ícones commitados (npm ci resolve; icons/ no repo)
- [x] i18n: `<html lang>` dinâmico + strings soltas + naming galaxiacut→galaxycut com migração (chave antiga ainda lida)
- [x] Aviso de mídia >600MB (idbPut devolve false; toast único a cada 10s)
- [ ] i18n dos catálogos PT-only: efeitos/animações/transições/presets/vibes/transcoder (critério: UI em EN/ES sem resíduo de PT)
- [ ] Vitest + testes dos módulos puros + passo de teste no CI (critério: `npm test` verde no CI)

## Lote 1 — compartilhar edição (ADR-001)
- [ ] `lib/editor/share.ts`: payload v1 + codec gzip/base64url + caps de tamanho (critério: roundtrip e rejeição de payload inválido testados)
- [ ] ShareDialog: 3 níveis com nome+descrição, botão Gerar, painel "Este link permite acesso à edição…" + copiar
- [ ] SharedEditScreen: banner com nível/descrição + viewer travado (play/scrub) + CTAs por nível
- [ ] Botão no TopBar + detecção de `#s=` no boot (critério: abrir link de cada nível no navegador faz a coisa certa)

## Lote 2 — roadmap
- [ ] Corte de mídia no painel (in/out antes da timeline)
- [ ] Importar texto .txt/.srt/.vtt (critério: parser testado; clipes com timing do SRT)
- [ ] Efeitos com demonstração (miniaturas ao vivo no catálogo)
- [ ] Catálogo de modelos de IA com tarefas declaradas (taxonomia)
- [ ] Efeitos de voz no preview E na exportação (critério: render OfflineAudioContext não-vazio no teste)
- [ ] Velocidade por gráfico com pontos (critério: integral da curva idêntica em preview e exportação; testes)
- [ ] Pacotes v1: abas por categoria, instalar/desinstalar/tamanho, `.gcpack` local, packs seed (critério: desinstalar pack não corrompe projeto que usa mídia dele)
- [ ] Rastreamento de elemento (critério: teste sintético — objeto em movimento → keyframes seguem)
- [ ] Estabilizador de vídeo (mesma engine de rastreio, inversão suavizada)

## Lote 3 — fechamento
- [ ] Passada de segurança nas superfícies novas (codec do share, import de .gcpack)
- [ ] changelog.json v9.0.0 trilingue + README + bump de versão
- [ ] Build + verificação no navegador por fluxo + push da branch + handoff
