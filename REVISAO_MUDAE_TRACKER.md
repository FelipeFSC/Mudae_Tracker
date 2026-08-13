# Mudae Tracker V22

## Novidades
- Removido o campo "CATEGORIA PARA OS PERSONAGENS IMPORTADOS" do modal de Importar do Mudae (a categorização já acontece automaticamente).
- Novo botão "IMPORTAR BUFFS OP", com modal maior, para colar o texto do comando `$mmzs` (esferas investidas por personagem).
  - Esse import não traz foto, gêneros nem série — por isso só ATUALIZA personagens que já existem no sistema (por nome), nunca cria novos, igual o import de wishlist.
  - Personagens com 1.000+ esferas investidas começam com o buff 10 (p10) sugerido; abaixo disso, o buff 1 (p1) — o usuário pode trocar o buff de cada linha antes de confirmar o import.
- Arquivos estáticos atualizados para o sufixo `?v=24`.

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
