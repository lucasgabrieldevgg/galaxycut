# Intent — v9.0.0 (Suite de Compartilhamento e Pacotes)

## Done-when (o que deve ser verdade no fim)
1. **Compartilhar edição** (ideia do Lucas): botão no TopBar → menu com 3 níveis → "Gerar link" → painel com "Este link permite acesso à edição: {nome}" + "Nível de acesso: {nível} — {descrição}". Quem abre cai numa tela que diz exatamente o que o link permite. Níveis: visualização (viewer travado), edição (abre editável, salva localmente em quem abriu), cópia (duplica na biblioteca de quem abriu).
2. **Roadmap (11 itens)**: corte de mídia no painel; importar .txt/.srt/.vtt; efeitos com demonstração; catálogo de modelos de IA; efeitos de voz (preview E exportação); velocidade por gráfico com pontos; sistema de pacotes complementares (abas por categoria, instalar/desinstalar/tamanho, .gcpack local, packs seed); rastreamento de elemento na tela (qualquer visual); estabilizador de vídeo; expansão das funções de IA (taxonomia declarada, não só transcrição).
3. **Fixes da análise**: todos pagos (config, deps, naming, i18n de catálogos, lockfile desktop, ícones, teste).
4. **CI verde**: tsc + lint (0 erros) + vitest + build.
5. **Verificado no navegador**: fluxo completo de share (gerar → abrir em aba nova → nível certo + viewer), importação de texto, pacotes, gráfico de velocidade.

## Must-not-change
- `drawFrame` única; app 100% estático; privacidade local.
- Atalhos, undo/redo e projetos salvos de usuários atuais (migrações preservadas).
- Identidade visual: Archivo + Martian Mono, tema dark, accent dinâmico do usuário.
- Performance do loop de playback: nada de trabalho pesado dentro do rAF.

## Out of scope (desta versão)
- Servidor/contas para colaboração em tempo real (share é link autocontido — ver ADR-001).
- Novos modelos de IA rodando de fato além da transcrição (a taxonomia é declarada; a UI marca "em breve").
- Registro remoto de pacotes (v1 = built-ins + import de `.gcpack` local).
- Tema claro (dark é identidade).
