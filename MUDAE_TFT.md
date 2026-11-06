# Mudae TFT: retomada e plano do Modo Caos + Aumentos

> **Execução autônoma autorizada pelo usuário (2026-11-05):** ele ficou longe do PC e pediu para seguir sem perguntar, lendo este arquivo se o contexto acabar. **Commits continuam proibidos sem "pode".** Em dúvida, escolher o mais fiel ao TFT, registrar em "Diário de execução" e seguir.
> Testes guardados em `.claude/tft-tests/` (uso: `node .claude/tft-tests/test-rules.js <raiz> .claude/tft-tests/baseline`).
> Data: 2026-11-05. Regras do usuário: trabalhar em **plano e depois execução**; **nunca commitar sem um "pode"** para aquele commit; responder em português.

## 1. Estado atual (tudo sem commit)

| Trabalho | Arquivos | Situação |
|---|---|---|
| Aba Kakeraloot | `kakeraloot-model.js`, `kakeraloot.js`, `kakeraloot.css`, `index.html`, `script.js` | Pronta; testes passando. O `$lk` com mais recompensas ainda precisa de teste do usuário |
| Coleção do TFT (vincular personagem a campeão) | `tft-collection.js`, `tft.html`, `tft.css`, `tft.js`, `tft-engine.js` | Pronta; cards no modelo Team Planner |
| Efeitos e regras, etapa 1 (21 campeões) | `tft-fx.js`, `tft-engine.js`, `tft.js`, `tft.html`, `tft.css` | Pronta; usuário disse "melhorou muito" |
| `lol-champions.json` | raiz | Só referência; não é carregado pela tela |

- **Commits:** recomendados 3 separados (Kakeraloot, coleção, efeitos). Aguardam "pode". `exemplo/` e `exemplo-tabuleiro/` ficam de fora; não são desta sessão.
- **Pendente da coleção:** ajustar enquadramento de Zac e Kog'Maw nos cards. Opção recomendada: ajuste por campeão. Sem resposta do usuário ainda.
- **Testes:** em `.claude/tft-tests/`; o `baseline/` é o motor anterior à etapa 1 de habilidades.

## 2. Decisões do usuário que valem daqui em diante

- **Fidelidade ao TFT:** "quanto mais próximo do TFT melhor"; quem joga conhece TFT.
- **Números:** são os oficiais da Riot. **Não propor nem aplicar rebalanceamento.** Se um campeão destoar, investigar o que falta implementar.
- **Efeitos:** bonito é forma e movimento certos, não "luz em tudo".
- **Qualidade:** seletor Baixo (padrão, visual simples) / Alto (`tft-fx.js`, Canvas 2D). Referência do Alto: Ryzen 5 5500, RTX 3060, 16 GB, 1080p 144 Hz.
- **Sala online:** cada jogador vê a própria coleção.
- **Seasons:** melhorar a Season 14 primeiro, depois adicionar outras. Antes de um seletor de season, a coleção precisa ser separada por season.
- **Rede:** teste real com 8 jogadores ainda não feito (só 2). Hoje cada ação manda o estado inteiro a todos.

## 3. Etapas seguintes das habilidades

| Etapa | Conteúdo | Campeões |
|---|---|---|
| 2 | Ricochetes, ligações, zonas | Jhin, Yuumi, Varus, Morgana, Fiddlesticks, Neeko, Skarner, Braum |
| 3 | Movimento: salto, teleporte, avanço, jogar ao ar | Zed, Rengar, Shaco, Viego, Aurora, Samira, Zac, Rhaast |
| 4 | Invocações e passivas | Naafiri, Annie (Tibbers), Zeri (eco), Zac (divisão), Kobuko, Renekton |

Passivas que faltam: redução do Alistar, marca da Leona, resistência da Sejuani, vampirismo da Vex, PH do Twisted Fate por ataque. Vitrine dos golpes: `tft.html?fxtest`.

## 4. O modo: Desafio da Horuja

**Nome:** "Desafios/Provações da Horuja" em português = **Tocker's Trials** em inglês (Riot usa a mesma página para ambos). Modo PvE. **O usuário quer somente o MODO CAOS.**

**Regras base confirmadas:**
- Solo, 30 rodadas (1-1 a 3-10), 6 chefes, sem cronômetro (botão "Lutar!").
- 3 vidas; cada rodada perdida custa 1. Vitória: chegar ao fim de 3-10 com ao menos 1 vida.
- Começa com 3 de ouro. Juros de 1 a cada 10, máximo 5 por rodada, mais o ouro de recompensa de cada rodada (a tabela abaixo mostra que há prêmio em ouro; a wiki fala em "só juros", contradição a resolver assumindo os dois).
- Golden Item Remover. Aumentos em 1-5, 2-5 e 3-5: ouro, ouro, prismático (a partir de Into the Arcane; Set 12 era prata, ouro, prismático).
- Pontuação por desempenho.
- **Cyber City (Season 14):** do patch 14.1 até o fim do 14.8. Chance de hack nos aumentos, que sobe depois do primeiro. Trocas de Intel do Cypher em 2-3, 2-8, 3-3 e 3-7. Orbes hackeadas em uma das rodadas. Chefe final: Cyberboss com Kobuko. Inimigos com RM reduzida e, no início, armadura e dano reduzidos só a partir do K.O. Coliseum (não se aplica à S14).

**O que se sabe do Caos:** a Riot não publicou as regras ("deixamos para você descobrir"). Só a Fandom descreve, e só no Set 12: desbloqueia ao vencer o Normal, inimigos diferentes e mais difíceis, recompensa maior, Charms na loja. **Não há rodadas de caos publicadas, nem caos documentado para a S14.** Charms não existem nos nossos dados.

**Descrição do usuário, que jogou (é a referência do nosso Caos):**
> "É mais divertido pois é mais difícil mesmo, os outros modos são bem mais fáceis, e tão difícil que é praticamente obrigatório ter um personagem de nível 5 com 3 estrelas, teve um path que tinha uma Morgana que era nível 5 com 4 estrelas (esmeralda) e todo o time esmeralda também, então o time do jogador tinha que chegar bem preparado, a gente pode fazer isso também. Os últimos 5 níveis são extremamente difíceis, mas sem personagem de nível 5 claramente, e as recompensas são MUITO boas, que é para finalizar, e o último é o mais difícil de todos."

Leitura: dificuldade brutal; lendária 3★ quase obrigatória; rodadas com time de **4 estrelas (esmeralda)**; últimos 5 níveis extremamente difíceis para quem não tem lendária; recompensas enormes; a última é a mais difícil. O trecho "sem personagem de nível 5" foi lido assim, por falta de como confirmar agora; registrar para ele conferir ao voltar.

### Rodadas oficiais da Cyber City (base; wiki, numeração sequencial)
Todas dão reroll grátis. Rótulos 1-1 a 3-10 vêm da ordem.

| # | Inimigos | Recompensa |
|---|---|---|
| 1 | 2 Drones 1★ | 2 ouro, campeão custo 2, componentes |
| 2 | 3 Drones 1★ | 1 ouro, campeão custo 3, componentes, Tiny Champion Duplicator |
| 3 | 4 Drones 1★, Kog'Maw 1★ | 6 ouro, campeão custo 3, componentes, Reforger |
| 4 | Nidalee 1★ (Bloodthirster), 3 Kindred 1★ | 5 ouro, Tiny Duplicator |
| 5 | Shaco 3★ (Infinity Edge), 2 Shaco 2★ (IE) | 11 ouro, Rare Mystery Orb |
| 6 | Kog'Maw 2★ (Deathblade, Runaan's), 4 Skarner encolhidos 1★ | 7 ouro |
| 7 | Gragas 1★ (Warmog's), Rhaast 1★ (Sterak's), Morgana 2★ (Blue Buff) | 7 ouro |
| 8 | 2 Dr. Mundo 2★ (Sunfire) | 7 ouro |
| 9 | Jhin encolhido 1★, 2 Jax 2★ (Bramble, Dragon's Claw) | 7 ouro |
| 10 | Rengar 3★ (IE, Deathblade, Hand of Justice) | 11 ouro, Support Anvil, 2 componentes |
| 11 | Darius 3★ (Evenshroud), Draven 2★ (Red Buff, Gunblade, Deathblade) | 9 ouro |
| 12 | 5 Lacaios 1★, Veigar 3★ (Nashor's, Archangel's, Blue Buff) | 9 ouro |
| 13 | 3 Mordekaiser 2★ (2 Crownguard), 2 Fiddlesticks 1★ (2 Crownguard) | 9 ouro |
| 14 | 4 Vi 2★ (Sterak's), Jinx 2★ (IE, Red Buff, Fishbones) | 9 ouro |
| 15 | Cho'Gath 2★ (2 Warmog's), Cho'Gath 2★ (Warmog's, Anima Visage, Archangel's) | 16 ouro, Reforger, 2 orbes, 2 anvils |
| 16 | Braum 3★ (2 Warmog's, Gargoyle), 2 Twisted Fate 3★ (2 Guinsoo's), 2 Darius 2★ | 9 ouro |
| 17 | 2 Zac 1★ (2 Protector's Vow, Trench Coat) | 9 ouro |
| 18 | 5 Shaco 2★, Shaco 3★ (2 Rapid Firecannon, Sniper's Focus) | 9 ouro |
| 19 | Varus 3★ (2 Shojin, Rabadon's), Sejuani 2★ (Protector's Vow, Bramble), Jax 2★ | 28 ouro, Champion Duplicator, Completed Anvil |
| 20 | Morgana 2★ (Blue Buff), Senna 2★ (Deathblade), Gragas 3★ (Warmog's, Ionic), Rhaast 3★ (Sterak's, Evenshroud), Vex 2★ (Rabadon's, Lifeblade, Blue Buff) | 20 ouro, Reforger, 2 Completed Anvils |
| 21 | 8 Zeri 2★ (3 Statikk) | 10 ouro |
| 22 | Tibbers 3★ (Gargoyle, Steadfast, Warmog's), 2 Tibbers 2★, 4 Annie 2★ (3 Manazane) | 10 ouro |
| 23 | 6 Zed 2★ (3 Hand of Justice) | 10 ouro |
| 24 | Brand 2★ (Shojin, Jeweled), Jinx 3★ (Statikk, Last Whisper), Samira 2★ (IE, Shojin), Neeko 2★ (Warmog's, Vow), Ekko 3★ (Warmog's, Vow) | 10 ouro |
| 25 | Garen 2★ (2 Gargoyle, Titan's) | 10 ouro, 2 Lesser Duplicators, Reforger, Completed Anvil |
| 26 | 2 Twisted Fate 3★, 2 Miss Fortune 2★, 2 Darius 3★, Braum 3★ (Archangel's, Jeweled, Guinsoo's, Spear of Hirana, Ionic, Evenshroud, Gargoyle, Warmog's) | 12 ouro, Thief's Gloves |
| 27 | 3 T-Rex **4★** fortalecidos (a 4★ é oficial) | 28 ouro, Champion Duplicator, Completed Anvil |
| 28 | 7 Urgot 2★ encolhidos (Giant Slayer, Deathblade, Hand of Justice), 2 Cho'Gath 2★ fortalecidos (Warmog's, Anima Visage, Archangel's) | 40 ouro, item Radiante aleatório |
| 29 | Xayah 2★, Aphelios 2★ (Luminous Deathblade, Guinsoo's Reckoning), 3 Leona 2★ e 3 Jarvan IV 2★ fortalecidos (2 Absolution) | 30 ouro, item Radiante aleatório, Reforger |
| 30 | **Chefe final:** Kobuko 2★ fortalecido (Blessed Bloodthirster, Warmog's Pride, Glamorous Gauntlet), Ziggs 2★, Veigar 3★, Poppy 3★ | não listada na wiki |

**Como reler:** `WebFetch` em `https://wiki.leagueoflegends.com/en-us/TFT:Tocker's_Trials` com `offset: 200000` e depois `300000`, pedindo só as rodadas finais da Cyber City. A API dessa wiki dá 403 por `curl`/Node; WebFetch funciona. Fandom funciona pela API: `https://leagueoflegends.fandom.com/api.php?action=parse&page=Tocker%27s_Trials_(Teamfight_Tactics)&prop=wikitext&format=json`.

## 5. Aumentos: dados levantados

**Decisão do usuário: TODOS, e também no jogo normal, não só na Horuja.** Site que ele achou: `https://playerse.net/tft/set/14/augments` (bloqueia acesso automático, 403). Fonte principal: CommunityDragon, `https://raw.communitydragon.org/latest/cdragon/tft/pt_br.json`, campos `setData[mutator].augments` e `items` (`apiName`, `name`, `desc`, `effects`, `icon`, `tags`).

| Lista | Quantidade |
|---|---|
| Jogo normal (`TFTSet14`) | 358 ids, 356 nomes |
| Horuja (`TFTSet14_PVEMODE`) | 128 |
| Famílias sem variantes `+`/`++`/`I-III` (aprox.) | 315 |
| Origem | TFT14: 96; genéricos e sets anteriores: o resto |

Categorias por palavra-chave, **só aproximadas**: dão item/campeão 93, combate 100, economia 77, de trait 53, de campeão ("hero") 13, outros 22.

**Atenção:** a descrição traz `@Variavel@` e os valores em `effects`. O campo não traz o tier (prata/ouro/prismático) de forma direta; `tags` e ícone (`-i`, `-ii`, `-iii`) precisam ser investigados. Vários dependem de sistemas que não temos: carrossel especial, Encontros, Emblemas, "próximo aumento melhor", Vida de jogador em partida solo.

## 6. O que falta no motor (`tft-engine.js`)

- **Nenhum sistema de aumentos.**
- **Estrelas limitadas a 3:** `tryStarUp` (`star >= 3`), `copiesValue`, valores por estrela nos arrays. `byStar` já limita pelo tamanho do array. `hpMul = 1.8^(star-1)` e `adMul = 1.5^(star-1)` permitem 4★ sem mudança de fórmula, mas a tela (`stars()`, CSS `.s3`) precisa suportar.
- **Rodadas:** `roundInfo` é fixo no formato PvP, sem modo; `creepWave` só usa monstros. O simulador já aceita time inimigo (`teamFromPlayer` retorna `{ units, chrome }`), então uma rodada pode ser um time montado.
- **Fim de jogo:** `settleDeaths` usa Vida 100, e `RULES.startHp`/`stageDamage` são globais; vidas exigem regra própria do modo.
- **Prêmios:** só há `REMOVER` e componentes (`combatLoot`). Faltam Duplicators, Reforger, Anvils, orbes.
- **Tela:** `allDecided`/`hostTick` usam prazo; precisa do botão "Lutar!", sem cronômetro, e placar de vidas e pontos. Unidades encolhidas e Tibbers/Drones não existem como campeões.
- **Reaproveitar:** `act`, loja, itens, `simulate`, `startPlayback`, coleção (`applyCollection`), efeitos Alto/Baixo.

## 7. Plano proposto

**Fase 0: anotação.** Criar `MUDAE_TFT.md` com este conteúdo.

**Fase 1: terminar a pesquisa (só leitura).**
- Ler rodadas 26-30 da Cyber City.
- Gerar uma tabela dos 358 aumentos com `name`, descrição resolvida, `effects`, tier e categoria real.
- Descobrir como obter o tier.

**Fase 2: base de aumentos, jogo normal.**
- Dados em `tft-augments.js`, gerados do CommunityDragon.
- Escolha de 3 opções (com reroll, como no TFT) em 2-1, 3-2 e 4-2 no jogo normal.
- Motor com ganchos: início de combate, fim de rodada, ao comprar, ao subir de nível, etc.
- Tela de escolha e lista de aumentos ativos; bots também escolhem.

**Fase 3: implementar todos os aumentos, por levas.** Em ordem: combate e atributos, economia, itens e campeões, traits, os que exigem sistemas novos. Cada leva testada e aprovada. Um aumento que dependa de sistema inexistente fica marcado como bloqueado, nunca com efeito inventado, e o usuário é avisado.

**Fase 4: Modo Caos.**
- Entrada própria no lobby (solo). Sem exigir vencer o Normal, porque só o Caos existe aqui.
- 30 rodadas partindo da tabela oficial da Cyber City, com mais estrelas e itens. Rodadas de **4★**. Últimos 5 níveis extremamente difíceis; último é o mais difícil. Recompensas bem maiores.
- 3 vidas, botão "Lutar!", pontuação, aumentos com hack, Reforger, Anvils, Duplicators.
- **Valores de dificuldade do Caos são nossos**, porque a Riot não publicou. Números de campeões e itens continuam oficiais. O ajuste é feito com simulações e o teste do usuário, garantindo que seja possível vencer com lendária 3★.

**Fase 5: o resto.** Teste de rede com 8; etapas 2 a 4 das habilidades (no Caos, a Horuja depende delas: Tibbers, Zed, Zac).

**Ordem:** aumentos antes do Caos, porque o modo depende deles. Escolha do usuário pode inverter, com o Caos usando uma seleção provisória.

## 8. Verificação

- **Node:** cada aumento com teste do efeito e do valor oficial; mesma semente gera a mesma luta; partidas de 8 bots até o fim sem erro; lutas sem aumento iguais às atuais.
- **Caos:** cada rodada contra times simulados: lendária 3★ preparada vence; time fraco perde nos últimos níveis; 3 derrotas encerram; vencer a 3-10 finaliza.
- **Navegador (Edge com a RTX 3060):** escolha de aumento, botão "Lutar!", 4★ na tela, Alto e Baixo, sala online, sem erros no console.
- **Com o usuário:** ele jogou o Caos original, então julga se a dificuldade e as recompensas estão parecidas.

**Commit:** nada será commitado sem o "pode".

## 9. Fontes

- [Wiki: Tocker's Trials](https://wiki.leagueoflegends.com/en-us/TFT:Tocker's_Trials)
- [Fandom: Tocker's Trials](https://leagueoflegends.fandom.com/wiki/Tocker's_Trials_(Teamfight_Tactics))
- [Riot: anúncio do modo](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/new-tft-workshop-mode-tockers-trials/)
- [Pichau Arena: Desafios da Horuja](https://www.pichauarena.com.br/noticias/desafios-horuja-pve-tactics/)
- [Vídeo: Set 17, lendárias 3★](https://www.youtube.com/watch?v=5CZ4SbBh8rU)
- [Lista de aumentos do Set 14 (playerse)](https://playerse.net/tft/set/14/augments)

## 10. Diário de execução

Atualizar ao fim de cada fase: o que foi feito, testes e próximo passo.

- **Fase 0:** concluída. Este arquivo criado; testes copiados para `.claude/tft-tests/`.
- **Fase 1:** rodadas completas; tier dos aumentos sai do nome do ícone (`-i` prata, `-ii` ouro, `-iii` prismático). Gerador em `.claude/tft-tests/gen-augments.js` cria `tft-augments-data.js`.
- **Fases 2 e 3 (primeira leva):** motor ligado; 274 de 382 aumentos implementados (261/358 no jogo normal, 101/128 na Horuja). Teste: `node .claude/tft-tests/test-augments.js <raiz>`. Lista dos bloqueados sai no fim desse teste. Tela: `renderAugments` em `tft.js`.
- **Fase 4 (Modo Caos):** `tft-chaos.js` + `createChaosGame`/`finishChaos` no motor; botão no lobby. Testes: `test-chaos.js`, `drive-chaos.js`. Decisões nossas (a Riot não publicou): estrelas/unidades extras, prêmios ampliados, Drone fraco próprio, 2 campeões iniciais, fim de jogo com 4★. **Não implementado:** hack de aumentos e Intel do Cypher da Cyber City.
- **Bloqueados por dependência:** Artefatos, Radiantes, itens de suporte/Estrategista, Bonecos/Golens, Carries (habilidade trocada), Encontros, loot de "espólios" sem números.
- Crests/Circlets/Crowns (`TFT14_*Crest|Circlet|Crown`): gerar pelo texto da descrição ("Recebe um Emblema de X, um Y e uma Z"), bloqueando se algum nome não existir.
- Tier ausente no ícone (34 casos): prismático para Black Market, Ascensão, Implantes III, Radiante; ouro nos demais (suposição).
- **Situação dos aumentos (fim desta sessão):** 278/382 no total; jogo normal 265/358; Horuja 101/128.
- **Bloqueados (104):** Tudo que Brilha+, Aventura Exaltada, Farmando Aura, Fábrica de Clones, Panelinha, Coroação, Capuzes Mais Mortais, Transformação em Boneco, Comprador Eficiente, Esperando o Inesperado, Polimento Final, Turbilhão de Golpes, Forja na Força, Ouro de Treinamento, Transformação em Golem, Luar Superior, Barganha Acirrada, Pesada é a Coroa, Atualização Pesada, Alta Voltagem, Agora Eu Carrego, Proteção do Infinito, Jogada Mágica, Luar, Ataque de Raiva, Furto, Piratas, Protagonista, Forja Psíquica, Qualidade > Quantidade, Objeto Inabalável, Replicação, Transferência de Atualização, Essência de Escamaluz, Upando Solo, Noite Estrelada, Noite Estrelada+, A História das Sete, Doces Deleites, Restinho, Cozinha do Estrategista, Dragão Dourado, Saque de Tumbas I, Saque de Tumbas II, Lâminas Fatais, Caça ao Tesouro, Valor em Excesso, Solte a Fera, Caminho da Guerra, Dinheiro é Vida I, Totalmente Adaptado, Bode Expiatório, Chamado ao Caos, Peso em Excesso, Reajuste Radiante, Nível de Poder, Pináculo de Suporte, Determinação Colossal, Determinação Colossal, Míssil Caçador-Assassino, 10.000 de QI, Curvem-se, Fracotes!, Novo Recorde, Diretoria, Coroa de Carrasco, Ancoragem Virtual, Teste Grátis, Gragolândia, Gragolândia+, Escudo Reativo, Golpes Adaptativos, Apelando, Alter Ego, Estilo Livre, Frenesi Grafiteiro, Coroa de Demônio Urbano, Apropriação Agressiva, Liquidação, Abates Velozes, Lobo Indomável, Boneco Armado, Capacitor, Saque e Enterrada, Lançamento Binário, Forja Portátil, Relíquias Radiantes, O Ovo Dourado, Encanto do Bosque, Forja Viva, Luvas da Sorte, Luvas da Sorte+, Preparação I, Preparação II, Tudo que Brilha, Escolhido do Protetor, Deleite de Componentes, Despojos de Guerra I, Despojos de Guerra II, Despojos de Guerra III, Forja Latente, Itens de Pandora III, Malandro Radiante, Kit de Iniciante, Provisão de Suporte.
- **Pendências para o usuário:** testar `tft.html` (botão do caos), conferir dificuldade (só simulada com times montados), confirmar a frase "sem personagem de nível 5", decidir commits. **Próximo técnico:** implementar Artefatos/Radiantes/Bonecos para liberar bloqueados; hack e Intel do Cypher; habilidades etapas 2-4; teste de rede com 8.
- **Correção:** no Modo Caos nenhum Removedor é concedido (`removers()` ignora); o inicial é infinito. Consumíveis ganharam ícones oficiais próprios.
- **Correção visual:** 3★ mantém a borda na cor do custo; só as estrelas são douradas, porque borda dourada indica custo 5. 2★ (prata) e 4★ (esmeralda) ainda trocam a cor da borda.
- **Correção:** "Jogar de novo" repete o modo da partida (caos ou bot).
- **Luvas do Ladrão (ver abaixo):** o combate agora mostra os 2 itens sorteados, nunca iguais.

## 12. Perguntas em aberto (aguardando o usuário e os testadores)

> Guardado em 2026-11-06. O usuário vai jogar, pedir para outras pessoas testarem e voltar com as respostas. Ao retomar, perguntar sobre estes itens antes de mexer neles.

**Suposições que precisam de confirmação (estão implementadas assim):**
1. **Bloblet do Vírus:** custa 1 de ouro? (Nenhuma fonte publica o custo.)
2. **Boi Dourado:** gastar 8+ de ouro numa rodada (atualizar conta em dobro) dá +1% de amplificação permanente, e a exigência seguinte sobe 7, 4 ou 3 conforme a faixa (2, 4 ou 6 Boi Dourado)? Só vale se eles lutaram na rodada anterior.
3. **Robô da Nitro (R-080T/T-43X):** fica no tabuleiro, dá para mover e **recebe itens**, sem ocupar vaga do time?
4. **Laser gigante (4 Nitro):** sai em **toda** conjuração do robô, ou só uma vez por combate?
5. **Granadas e laser:** o dano sobe por **estágio** (como implementado) ou pela estrela?
6. **T-43X:** usa a mesma habilidade do R-080T (granadas que atordoam) ou tem outra?
7. **ExoTec com 10:** só os itens ExoTec que você já tem viram Radiantes, ou você recebe todos os 7 Radiantes?
8. **Epitáfio Inspirador (aumento):** o escudo dura o combate todo? (Duração não publicada.)
9. **Semblante Espiritual:** a cura por segundo tem teto de 250? (O campo existe nos dados, a descrição não cita.)
10. **Modo Caos (do item 4 desta página):** a frase "sem personagem de nível 5" foi lida como "os últimos 5 níveis são extremamente difíceis para quem não tem lendária". Está certo?

**Informações que faltam para implementar (hoje estão adaptadas):**
11. **Esquadrão Anima:** dano de cada arma (Blade-o-rang, Guiding Hex, UwU Blasters, Ani-Mines, Searing Shortbow, Vortex Glove, Gatling Bunny-Guns, The Annihilator, Tornadoes, Final City Transit, Surprise Supply Drop) e como se escolhe a arma em cada faixa.
12. **Cifra:** quanto de Informação se ganha por derrota, por sequência de derrotas e por abate; tabela de saque completa; em quais rodadas dá para trocar.
13. **Demônio Urbano:** quais casas ficam pintadas, quando mudam e quais são as casas de Assinatura (+50%).
14. **Mata-almas:** qual é o "1 item recomendado" do holograma, e como é o Golem de pedra quando o Viego não ajudou a abater ninguém.

**Para observar nos testes:**
15. A dificuldade do Caos ficou parecida com a original? (Na simulação: o time mediano perde as 5 últimas, lendárias 3★ vencem a 26-29, o chefe final é vencido em cerca de 10% das tentativas.)
16. O laser do robô aparece bonito no modo Alto? (Ainda não foi visto numa captura.)
17. Chapéu de Rei do Crime, Mods do Deus das Redes, itens ExoTec e Bloblet: algo confuso de usar na tela?

## 11. Auditoria das traits, itens e rodadas (2026-11-06)

O usuário cobrou: a Nitro invoca o T-Rex (T-43X) e nós não implementamos; pediu revisão de todas as comps. Comparação feita contra o CommunityDragon **15.14** (último patch da Season 14; S14 = LoL 15.7 a 15.14). Arquivos baixados no scratchpad da sessão (`cdragon/`); para refazer, baixar `https://raw.communitydragon.org/15.14/cdragon/tft/en_us.json` e os `.cdtb.bin.json` de `https://raw.communitydragon.org/15.8/game/characters/`.

**Dados:** campeões e traits do `tft-data.js` são iguais aos da 15.14. **Itens não:** 21 de 44 estão com números de seasons posteriores (o "latest" traz os itens básicos atuais). Ex.: Rabadon 55→50 PH, Sterak escudo 40%/4s→50%/5s, Warmog 18%→12% e 500→600 Vida, Voto Protetor 20%/60s→25%/5s, Garra do Dragão 6%→9%. O motor também tem esses números fixos no código (`ITEM_TEXT`, `checkThresholds`). Aumentos (`tft-augments-data.js`) também vieram do "latest": conferir.

**Unidades oficiais que existem e trocamos por substitutos:** R-080T (500 Vida, 45 DA, 0,7 VA, 40/40, mana 50/100), T-43X (800, 80, 0,75, 50/50, mana 50/120), Tibbers (1200, 120, 60/60), Mechadrone = "Drone" (250, 18, alcance 3), Mechaminion = "Lacaio" (1400, 130, 50/50), Bloblet, T-URR37.

**Nitro oficial:** cada Nitro *único* dá Cromo por estrela: 2/3/6/12 (Horuja/Double Up/Hyper Roll: 4/6/10/14). Cada Cromo dá Vida e 1 PH **ao R-080T** (14 de Vida na 15.14; 11 na 14.2). (3) invoca R-080T; (4) laser gigante; com 200 de Cromo vira T-43X. Habilidade do robô: granadas nos 3 inimigos mais próximos, 100/120/140 de dano mágico, 1s de atordoamento, cura 130 (tft.tools). Laser: 425/450/475/500 (wiki, notas da 14.2). **Sem fonte:** a escala de PH da granada/laser, o que os 3-4 valores indexam (estágio ou estrela), a habilidade própria do T-43X. Valores com nome embaralhado no cdragon: 300, 800, 130 (cura), 60, 500, 100.
Nosso: soma estrelas × 3 (inventado), limite 200 (inventado), bônus no Nitro mais forte, sem robô e sem laser.

**Situação por trait:**
| Trait | Situação | O que falta |
|---|---|---|
| Brutamontes, Vanguarda, Fumegante, Estratégico, Atirador, Dínamo, Atirador de Elite, Soberano | ok | — |
| Bastião | quase | (6): não-Bastiões +25 a mais |
| Dizimador | quase | sobrecura vai 50% para o Dizimador mais ferido |
| Carrasco | quase | dano crítico em dobro abaixo de 20%; (5) 12% de durabilidade |
| Boom Bot | quase | (6): dois mísseis |
| Tecnológico | quase | (8): redução de 18% (hoje sempre 10%) |
| Boi Dourado | parcial | bônus permanente ao gastar ouro; (6) loot com chance de componente |
| Divinicorp | quase | bônus do Emblema (Omnivamp); conferir valores fixos 8/6/7%/50/9%/5% |
| Nitro | **falta** | robô R-080T/T-43X, laser, Cromo certo |
| A.M.P. | **inventado** | cada campeão melhora a habilidade de um jeito com Amp; hoje +5% de dano por Amp |
| Esquadrão Anima | **parcial** | escolha de arma por faixa; armas escalam com estrela e estágio |
| ExoTec | **parcial** | itens ExoTec exclusivos; hoje conta 1 item a mais |
| Demônio Urbano | **parcial** | casas pintadas mudam; casas de Assinatura (+50%) |
| Transgressor | **inventado** | Chapéu do Chefão melhora a habilidade de cada campeão de um jeito; hoje +30% |
| Ciberchefão | **parcial** | "forma final" muda a habilidade; DamageMod 0,3 não usado |
| Cifra | **inventado** | Informação ao perder e trocas por loot; DA/PH só depois da troca; hoje bônus fixo +1 ouro |
| Mata-almas | **inventado** | cópia holográfica do inimigo mais caro abatido; hoje cura 25% |
| Deus das Redes | **inventado** | Arsenal de Mods de Trait; hoje +25% |
| Vírus | **inventado** | Pedaços (Bloblets) na loja, 20% de chance, +1,5% Vida e +1 PH cada; hoje +30% |

### Execução (usuário aprovou a ordem em 2026-11-06: itens → Nitro + unidades oficiais → detalhes de faixa → traits inventadas/parciais)

- **Etapa 1 feita.** `gen-items.js` (novo) regera os itens do `tft-data.js` da 15.14. Motor lê todos os números de item de `fx` (sem valores fixos). Mecânicas S14: "Mana" de item = Mana inicial (não há regen), Gume/Manopla extra viram +10% de dano crítico, Efeito Azul (10 de Mana após conjurar, +5% por 8s em participação de abate), Elmo por linha, Nashor (+60% VA por 5s após conjurar), Mata-Gigantes (+20% contra >1750 de Vida), Mão da Justiça dinâmica, Sterak decai, Voto (+20 resist.), Limiar (VA, sem cura), Cráquem sem limite, Titã +20 resist. no máximo, Mercúrio a cada 2s, Semblante com teto `MaxHeal` 250 por tique (**suposição**: o campo existe, a descrição não o cita). Carrasco: crítico bônus dobra abaixo de 20%; (5) 12% de durabilidade. Tecnológico (8): 18%.
- **Aumentos:** `gen-augments.js` agora usa 15.14 e tira o tier dos tags (`{d11fd6d5}` prata, `{ce1fd21c}` ouro, `{cf1fd3af}` prismático; batem com o ícone em 310/310). Lista correta: 344 (82 que não eram da S14 saíram, 44 entraram). Ícones com URL completa da 15.14 (`asset()` em `tft.js` aceita URL). 77 com mecânica mudada revisados; 29 novos implementados, 15 bloqueados (Bonecos, Suporte, Artefatos, orbes, loja em tempo real, Voidlings, Não Pivoto). **Suposição:** escudo do Epitáfio Inspirador dura o combate todo (duração não publicada). Implementados: 245/344 (normal 242/339, Horuja 101/127).
- Testes novos: `test-items.js`, `test-aug-sanity.js`; `changed-traits.js` lista traits alteradas de propósito (testes de identidade as ignoram). `simulate(a, b, seed, probe)` aceita sonda para testes.
- **Pendente:** Caos ficou impossível no fim com os itens certos (Warmog etc. mais fracos); reequilibrar só depois das traits.
- **Etapa 2 feita (Nitro + unidades oficiais).** Robô fica em `p.board` com `summon: true` (fora de venda, pool, banco, limite do time, Recombobulador; pode mover e receber item; consumível/emblema não). `syncMech` cria/remove/troca forma (200 de Cromo → T-43X) a cada ação e antes do combate. Cromo em `nitroChrome` (normal e **caos**, que antes nunca acumulava): Nitro únicos, maior estrela, 2/3/6/12 ou 4/6/10/14 no caos, sem teto. Robô: Vida/PH por Cromo; granadas nos 3 mais próximos 100/120/140/160 por estágio, 1s de atordoamento, cura 130; (4) laser em linha 425/450/475/500 a cada conjuração (efeito `laser` no `tft-fx.js`). **Suposições:** robô como unidade de tabuleiro com itens (composições oficiais mostram R-080T/T-43X no tabuleiro; op.gg tem itens dele); valores indexados por estágio; T-43X usa a mesma habilidade; laser em toda conjuração. Unidades oficiais no Caos: Drone Mech, Tropa Mech (Lacaios), Tibbers (passivo +60% VA, queima/fere adjacentes) e T-43X (rodada 27). Teste: `test-nitro.js`.
- **Etapa 3 feita.** Bastião (6) +25 a não-Bastiões; Dizimador sobrecura (50% para o Dizimador com menor %); Boom Bot (6) dois mísseis; Divinicorp com valores da 15.14 (Morgana 9, Rhaast 6, Senna 8%, Gragas 50, Vex 7%, Renekton 5%, Emblema 3% Omnivamp; antes estavam trocados); Boi Dourado: gasto por rodada (atualização conta em dobro) dá +1% permanente, exigência 8 e +7/4/3 por faixa (**suposição** pelos campos sem nome; wiki confirma só o 8), precisa ter lutado; (6) espólio com 6% de ser componente. Teste: `test-tiers.js`.

- **Etapa 4 feita (traits que mudam habilidades/sistemas):**
  - **Ciberchefão:** o mais forte (estrela×10+custo) vira forma final; com 4, todos. Forma final libera a parte "Boss": Veigar atinge adjacentes, Poppy atinge em volta, Ziggs atinge fileira/coluna. Só o mais forte recebe Vida/PH (BigBoss com 4). Sem o `extraHits` inventado. Kobuko: parte Boss (dano ao atacar em área) não modelada, porque o passivo dele ainda não existe (etapas de habilidade).
  - **A.M.P.:** Amp = SuperchargeAmount; Samira 22 balas +1/Amp; Nidalee +AmpedDamage em 2+Amp alvos e cura por alvo; Yuumi +3 de Mana/s por Amp; Naafiri 3 companheiros + (1+Amp) Alfas e 15% de Omnivamp; Annie 2+Amp bolas menores. Tibbers da Annie ainda não é invocado.
  - **Transgressor:** consumível "Chapéu de Rei do Crime" (1 com 3, 2º com 5; volta se o Rei do Crime sair; bots colocam sozinhos). Efeitos com números oficiais: Darius (alcance 2/4, perda de 5% por casa, cura por alvo), MF (+3 levas; com 7, perfuração de 40%), Shaco (vai no inimigo de menor Vida a 3 casas, +50%/66%, reconjura com 75% se abater), TF (carta vermelha ou azul; com 7, as duas; 6% de chance de 2 de ouro), Braum (+30/80 resist., golpe extra a cada 4s/2s). Mod de Transgressor: bônus de Rei do Crime próprio (30% VA, escudo) **não feito**.
  - **ExoTec:** 7 itens + Radiantes com números da 15.14 (Estabilizador/Silenciadora de Pulso, Carcaça, Holoarco, Ciberespiral, Capacitor de Fluxo, Lanterna, Presas). 1 aleatório sem repetir em 3/5/7; com 10, os seus viram Radiantes (**suposição**: a wiki diz também "inclusive os fora da seleção", sem clareza). Só ExoTec equipam; Reforjador não mexe. Vida/VA por item sem o +1 inventado.
  - **Deus das Redes:** Arsenal com 3 Mods (dos 19 oficiais) depois de 2 combates entre jogadores com o Garen ativo, +1 a cada novo. Mod é consumível: campeão se beneficia sem contar (entra em `u.traits` só no combate). Mod e Chapéu passam na fusão de estrelas.
  - **Vírus:** Bloblet por cima de uma vaga ao atualizar (20%, Zac em campo), comprar revela a vaga; Zac mais forte +1,5% de Vida e +1 PH por Bloblet (15.14; a wiki tem valores antigos 10%/3%/4). **Suposição:** Bloblet custa 1 de ouro (nenhuma fonte publica).
  - **Mata-almas:** guarda o inimigo de maior custo que o Viego ajudou a abater (dano em qualquer momento da luta); holograma ao lado do Viego com 900/1350/9001 de Vida e 30%/40%/200% do dano. **Não feito:** o "1 item recomendado" (sem tabela de itens recomendados) e o Golem de pedra quando não há abate.
  - **Não feitos por falta de números públicos:** Esquadrão Anima (armas sem dano no cdragon e na wiki; segue o tiro de 6% da Vida a cada 4s dos campos sem nome), Cifra (sem ganho de Informação nem tabela de saque completa; segue o bônus adaptado), Demônio Urbano (sem padrão de casas pintadas e de Assinatura; segue casas fixas).
- **Bug antigo corrigido:** valores por estrela lidos como `lista[estrela - 1]` davam `NaN` em 4★ (dano, escudo, cura, aura, ganho de Vida e respingo): a unidade atingida ficava com Vida `NaN` e não morria. Isso deixava o fim do Caos sem sentido. Agora é `byStar` e há proteção contra valores não finitos em `hit`/`heal`. Teste: `test-4star.js` (65 unidades × 4 estrelas).
- **Caos depois de tudo:** mediano perde todas as 5 últimas; lendárias 3★ vencem 26-29; chefe final 10% (o mais difícil e vencível). Rodada 27 = 3 T-43X 4★ + Sejuani 4★ + Zeri 4★.
- **Tela:** robô com borda laranja (`.cost0`), Bloblet na loja, ícones da 15.14, contador "Em campo" ignora o robô, prévia de atributos com Cromo/Bloblets/Boi Dourado. Gancho `tft.html?debug` expõe `window.__tft` (só testes). Teste de navegador: `drive-new.js`. O laser não foi visto numa captura (o combate de teste acabou antes de o robô conjurar); o evento é testado no motor.
- **Testes novos:** `test-traits4.js`, `test-exotech.js`, `test-traits5.js`, `test-4star.js`, `drive-new.js`.
- **Para o usuário confirmar:** custo do Bloblet (1); Boi Dourado (+1% por gasto, exigência +7/4/3); robô recebe itens e laser em toda conjuração; Radiantes do ExoTec só para os itens que você tem.

**Rodadas do Caos:** trocar Drone inventado → Mechadrone; dragão → T-43X 4★ (rodada 27); Annie → Tibbers (rodada 22); `melee` → Mechaminion (rodada 12). "Encolhidos" e "fortalecidos" não estão modelados. **Pendente:** o jogo real sorteia pares por tier conforme estágio e nível, mas só achei a tabela do Set 18 (tftips.app/en/tables/thiefs-gloves), não a do Set 14; hoje o sorteio é uniforme entre itens completos. Não há fonte sobre os itens aparecerem no planejamento; aqui aparecem só no combate.
