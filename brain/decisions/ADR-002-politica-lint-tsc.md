# ADR-002 — Política de tsc/lint: erro no que é objetivo, warning no que é dívida

Data: 2026-11-01 · Status: aceito

## Decisão
O build NÃO ignora erros de tipo (`ignoreBuildErrors` removido) e o tsc roda strict com `noUnusedLocals`/`noUnusedParameters`. No ESLint: código morto objetivo (debugger, unreachable, fallthrough, escapes inúteis) é **erro**; dívida de qualidade (`any`, `exhaustive-deps`, `console`) é **warning visível** que não trava o CI — cada release paga um pedaço.

`no-undef`/`no-redeclare` ficam OFF de propósito: o compilador TS já cobre os dois, e ligá-los em codebase TS gera chuva de falso-positivo (globals do DOM/React que o ESLint não conhece).

## Por que
A rede esteve desligada desde antes da v8 (`noImplicitAny: false` + `ignoreBuildErrors: true` + ~25 regras `off`). Ligá-la de uma vez como erro quebraria o CI com dezenas de falhas ao mesmo tempo; erro-para-o-objetivo + warning-para-a-dívida paga o débito sem travar o desenvolvimento.
