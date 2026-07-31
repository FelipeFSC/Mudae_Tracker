# Mudae Tracker V8

## Alterado

- Revertida integralmente a mudança da V7: a janela **Reordenar Wishlist** voltou a exibir a ordem real da wishlist, sem herdar filtros ou ordenações visuais da tela principal.
- As setas de reordenação manual voltaram ao comportamento da V6.

## Adicionado

- O importador agora reconhece mensagens do comando `$wishlist` / `$wl`.
- Em importações de wishlist:
  - personagens com `⭐` entram na categoria **Estrelas**;
  - os demais entram em **Favoritos**;
  - a ordem do texto importado é preservada como ordem da wishlist;
  - valores com separador de milhar, códigos de cor e URLs são reconhecidos.
- A prévia da importação mostra a categoria detectada para cada personagem.

## Corrigido

- O símbolo `💞` não é mais incorporado ao nome em importações de harem.

## Compatibilidade e regressão

- Exportações de harem continuam usando a categoria escolhida no modal.
- Validado o exemplo de wishlist com 13 personagens e 1 starwish.
- Validada importação de harem com múltiplas roletas, kakera e chaves.
- Verificada a sintaxe de todos os arquivos JavaScript.
- Preservadas as funcionalidades da V6: percentuais em lista/grade e toggle de informações da grade.

## V9 — Importação inteligente de wishlist

- A importação de wishlist compara nomes completos ignorando caixa, acentos e espaços extras.
- Personagens já cadastrados não são duplicados e mantêm imagem, kakera, série, gêneros, chaves, OP e demais dados; apenas a categoria muda para Favoritos ou Estrelas.
- Personagens novos recebem os dados disponíveis na wishlist: nome, imagem, kakera, chaves, posição, proprietário e categoria.
- O limite de harém considera somente inserções novas.
- A prévia diferencia itens novos de atualizações de categoria.
- O parser reconhece proprietário (`=> usuário`), estrela, bronze/silver/gold/chaos keys e ignora códigos de cor.
- Testes executados: parser da wishlist fornecida, valores com milhar, chaves, estrela, proprietário, sintaxe JavaScript e preservação da regressão V8.

## V10 — Modal da Kakera Tower em lista expansível

### Adicionado
- Os 12 andares da modal da Kakera Tower agora são exibidos em lista vertical.
- Cada andar possui seleção visual, status e uma área expansível com a descrição do buff.
- Várias descrições podem permanecer abertas simultaneamente.
- Ao selecionar um andar, sua descrição é aberta automaticamente.

### Alterado
- A modal foi ampliada para até 760 px e ganhou altura máxima com rolagem interna.
- O layout possui adaptação para telas pequenas.

### Compatibilidade
- A seleção continua sendo salva somente ao clicar em **Salvar**.
- Cancelar ou fechar a modal continua descartando alterações locais.
- Nenhuma fórmula de medalhas, Tower, OP, SHOP ou porcentagem foi alterada.

## V12 — Descrições oficiais da Kakera Tower

- Adicionadas descrições detalhadas dos 12 andares, baseadas na Wiki do Mudae.
- Cada expansão agora mostra efeito, valor contextual da torre atual, detalhes, observações e interações.
- Incluídas categorias visuais para spawn, wishlist, chaves, esferas, kakera, rolls e utilidade.
- O efeito contextual muda conforme o número da torre, preservando os cálculos existentes.
- Mantidos seleção múltipla de descrições, fechamento automático ao desmarcar e modal responsiva.

## V13 — correção de corte nas descrições da Kakera Tower

- Modal ampliada para aproveitar até 94% da altura da janela e até 960px de largura.
- Lista de andares transformada na única área rolável da modal.
- Cabeçalho, progresso e ações permanecem visíveis.
- Cards expandidos e descrições passam a usar altura automática, sem `max-height` ou recorte.
- Textos longos, listas, observações e chips quebram linha corretamente.
- Layout responsivo ajustado para ocupar a altura disponível em telas menores.

## V14
- O resumo principal do buff aparece ao lado do número de cada andar.
- Importação de harém virou sincronização completa dos personagens reivindicados.
- Existentes são atualizados sem perder categoria, OP ou posição da wishlist.
- Reivindicados ausentes na nova importação são removidos.
- Não reivindicados ausentes são preservados.
- Wishlist atualiza dados disponíveis e é a única importação que altera Favoritos/Estrelas.

## V15 — Grade compacta aprimorada

- No modo Grade com Informações desativadas, o card exibe nome, kakera, chaves e roletas do personagem.
- As ações Reordenar, OP, Editar e Remover foram movidas para uma sobreposição exibida no mouseover.
- Em dispositivos touch, o primeiro toque revela as ações e o toque no botão executa a ação.
- Lista e grade detalhada permanecem inalteradas.

## V16 — Correção das roletas WA/WG/HA/HG

- Restaurada a exibição das roletas na visualização em lista.
- Restaurada a exibição das roletas na grade com Informações ativadas.
- Corrigida a exibição das roletas na grade compacta com Informações desativadas.
- O campo `genders` agora é normalizado na importação, atualização e carregamento de dados antigos.
- Dados antigos salvos como texto, objeto ou array são convertidos para um array válido sem duplicatas.
- A importação de harém foi validada com `$wg`, `$wa/$wg` e `$wg/$hg`, preservando também as chaves.


## V17
- Personagens não reivindicados recebem imagem em escala de cinza e borda neutra.
- Ao marcar como reivindicado, a imagem e a borda de categoria voltam automaticamente.
- Botões e demais informações mantêm suas cores.
- Kakera e chaves foram centralizadas na grade compacta removendo o flex do contêiner.
