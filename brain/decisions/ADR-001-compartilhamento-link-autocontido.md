# ADR-001 — Compartilhar edição via link autocontido (sem servidor)

Data: 2026-11-01 · Status: aceito · Decide: botão Compartilhar (v9)

## Contexto
O GalaxyCut é 100% estático e local; não há contas nem backend (só `api/feedback.js`). Compartilhar uma edição precisa funcionar sem introduzir servidor, custo ou superfície de abuso.

## Decisão
O link CARREGA a edição: JSON do projeto (`project`/`tracks`/`clips`/`folders`/metadados de mídia) comprimido com gzip (`CompressionStream`) e codificado em base64url no **fragmento** `#s=…` — que nunca é enviado a servidor algum.

Níveis de acesso (modos de UX, não criptografia):
- **view** — abre num visualizador travado (play/scrub), com CTA "fazer uma cópia".
- **edit** — abre a edição no editor; alterações salvam na cópia local de QUEM ABRIU.
- **copy** — duplica a edição na biblioteca de quem abriu.

Como não há servidor, "editar" é por definição local ao destinatário — o diálogo e a tela de chegada dizem isso explicitamente. O nível é sinalizado no link e aplicado como modo de UI; não é barreira criptográfica (um link autocontido é legível por quem o tem — aceito e dito em voz alta).

## Consequências
(+) Zero infra, zero custo, zero superfície de abuso; funciona offline e para sempre (o link não "apodrece").
(+) Privacidade por construção: o fragmento não vai pra log de servidor nenhum.
(-) Arquivos de mídia NÃO viajam (seriam MBs/GBs) — a edição chega com metadados e o destinatário reconecta os próprios arquivos (fluxo "mídia não carregada" já existente).
(-) Links de edições gigantes ficam compridos (limite: 2,5 MB codificado → erro amigável).
(-) Colaboração simultânea/centralizada fica para um futuro com backend (revogar isto exige ADR novo).
