# Mudae Tracker V21

## Correção
- Unificação da interface da V19 com a fórmula de `$boostwish` da V20.
- O tooltip informativo de `$boostwish` foi preservado.
- O campo `ROLLS POR HORA (BASE)` e o indicador `Total de rolls` foram preservados.
- Favoritos recebem o bônus normal de wish do `$boostwish`.
- Estrelas recebem o bônus normal de wish mais o bônus adicional de starwish.
- Arquivos estáticos usam sufixo `?v=21` para evitar cache inconsistente no GitHub Pages.

## Regressão executada
- 1 roll de `$boostwish` aumenta a chance de Favoritos e Estrelas.
- 6 rolls produzem +115% wish e +60% adicional de starwish.
- 17 rolls-base com Safira I resultam em 18 rolls totais.
- Sintaxe dos arquivos JavaScript validada.
