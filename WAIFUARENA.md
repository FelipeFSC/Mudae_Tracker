# Waifuarena — referência e contexto

Arquivo de apoio para retomar a conversa caso o contexto acabe.
Fonte: wiki do Mudae, página **Waifuarena**.

- Página: https://mudae.fandom.com/wiki/Waifuarena
- A página bloqueia acesso direto (HTTP 402). O conteúdo foi lido pela API da wiki:
  `https://mudae.fandom.com/api.php?action=parse&page=Waifuarena&prop=wikitext&format=json`
  (o mesmo formato serve para outras páginas, ex.: `page=Lewen/Arena`).

---

## 1. O que é

Minijogo acessado pelo **Mudae GM** (outro bot do Mudae). Personagens que você possui ganham atributos e
lutam em batalhas por turnos. Ambientação: uma escola misteriosa, a **School of Illusions**.

Dois modos:

| Modo | Como | Detalhes |
|---|---|---|
| **Jogador contra jogador** | `$arena` | Até 8 jogadores. Bots com `$f bot`. Times com `$f1`…`$f4`. |
| **História** | `$ar1` … `$ar5` | Contra chefes exclusivos. Dá **insígnias no perfil** e entra no **ranking global** (`$ladder`). Qualquer um pode entrar no seu time (até 8); o kp do chefe é ajustado ao número de jogadores. |

---

## 2. Preparação

- **Distribuir pontos é obrigatório** antes de lutar:
  `$skills <personagem> <Yandere> <Tsundere> <Kuudere> <Dandere> <Deredere>`
  (`$sk` pelo Mudae, `$skgm` pelo Mudae GM).
- `$mmf` — lista os personagens que já têm pontos distribuídos.
- `$favarena <personagem>` (`$fav`, `$favarena gm`) — personagem favorito; aí basta `$go` (ou `$f`).
- Personalização:
  - `$deathsentence <personagem> $ <frase>` (`$ds`) — frase quando o personagem é eliminado.
  - `$victorysentence <personagem> $ <frase>` (`$vs`) — frase quando vence.

> A wiki **não explica** o que cada atributo (Yandere, Tsundere, Kuudere, Dandere, Deredere) faz em batalha.

---

## 3. Comandos

### Gerais
| Comando | O que faz |
|---|---|
| `$f <personagem>` | Entra na arena aberta. `$f1`–`$f4` entram em times. `$f bot` adiciona um bot. |
| `$ar <1-5>` | Inicia uma luta do modo história. |
| `$ladder` / `$ladderserv` | Ranking global / do servidor. |

### Antes da luta (durante a espera)
| Comando | O que faz |
|---|---|
| `$go` | Começa a luta. |
| `$fav` | Joga com o personagem favorito. |
| `$kp <número>` | Define o kp (pontos) base, multiplicado pelo número de jogadores. |
| `$noevent` | Desativa os eventos da luta. |
| `$difficulty <1-1000>` | Só no modo história: dificuldade do chefe (`$difficulty 2` = chefe com +20% de kp). |
| `$mode` | Muda a ordem das reações no embed (padrão: ordem fixa). |

### Durante a luta
| Comando | O que faz |
|---|---|
| `$re` | Reenvia o embed (vira a mensagem mais recente). |
| `$inv` / `$invs` | Mostra o inventário (no canal / por DM). |
| `$hist` / `$fullhist` | Histórico recente / completo da luta, por DM. |
| `$skip` | Pula um evento (todos os jogadores humanos precisam usar). |
| `$quit` | Desiste. |
| `$restart` | Reinicia (todos os jogadores iniciais precisam usar). |
| `$kickplayer <ID completo>` | Expulsa um jogador (só moderadores). |
| `$stoparena` | Fecha a arena (só moderadores). |

---

## 4. Regras da batalha

A cada turno, cada jogador escolhe **uma** reação (só a primeira conta; espere todas aparecerem antes de clicar):

| Reação | Efeito |
|---|---|
| ⚔️ **Atacar** | Causa dano. |
| 🛡️ **Proteger** | Reduz em 2 o dano recebido. |
| 📔 **Estudar** | Procura itens. Mais pontos de estudo → itens melhores. |
| 🍓 **Lewd** | Reduz 🛡️, 📔 e 💗 dos rivais em 1. |

- O turno termina quando **todos reagirem**.
- **Vitória:** zerar o 💗 dos rivais.
- Símbolos: ⚔️ ataque · 🛡️ defesa · 📔 estudo · 💗 vida.

> As seções "Ataques e habilidades" e "Eventos possíveis" da wiki estão **vazias**. A página também não explica como o kp é calculado.

---

## 4.1 Regras consolidadas do mini-game

Resumo de tudo o que se sabe, separando o que é **permanente** do que existe **só dentro da partida**.

### O que é permanente (fora da partida)
1. **Só personagens que você possui** podem lutar.
2. Antes da primeira luta, o personagem precisa ter **pontos distribuídos** com `$sk` / `$skgm` nos 5 atributos
   (Yandere, Tsundere, Kuudere, Dandere, Deredere). Sem isso, `$f` não funciona.
3. Segundo um usuário do fórum da wiki, são **5 pontos** por personagem (não confirmado oficialmente).
4. **Não há "farm" documentado:** nenhuma fonte fala em XP, nível ou forma de aumentar os pontos.
   **Chaves e kakera não têm relação conhecida** com a arena (chaves são outro sistema: rolar o próprio personagem → mais kakera e personalização).
5. O que as lutas dão de permanente: **insígnias** (chefes do modo história e baús da Naw) e posição no **ranking** (`$ladder`, `$ladderserv`).
6. Personalização permanente: frase de derrota (`$ds`) e de vitória (`$vs`) por personagem; personagem favorito (`$favarena`).

### Como uma partida acontece
1. **Abrir:** `$arena` (contra jogadores) ou `$ar1`…`$ar5` (modo história).
2. **Entrar:** `$f <personagem>` (até 8). `$f1`…`$f4` para times, `$f bot` para adicionar bot. No modo história, quem entra vai para o seu time contra o chefe.
3. **Ajustar durante a espera (opcional):** `$kp <n>` (kp base × nº de jogadores), `$noevent` (sem eventos), `$difficulty <n>` (só história: `2` = chefe com +20% de kp), `$mode` (ordem das reações).
4. **Começar:** `$go` (ou `$fav` para entrar com o favorito).
5. **Turnos:** todos escolhem 1 reação; o turno fecha quando **todos** reagirem. Só a **primeira** reação conta — espere as 4 aparecerem antes de clicar.
6. **Fim:** quem tiver o **💗 zerado** sai da luta; vence quem sobrar (ou o time).
7. **Saídas:** `$quit` (desistir), `$restart` (todos os jogadores iniciais), `$skip` (pular evento, todos os humanos).

### Atributos da luta (só valem dentro da partida)
| Símbolo | Nome | Papel |
|---|---|---|
| ⚔️ | Ataque | Dano causado ao atacar |
| 🛡️ | Defesa | Reduz dano recebido |
| 📔 | Estudo | Qualidade dos itens encontrados |
| 💗 | Vida | Zerou, está fora |

> **kp:** pelo contexto (`$difficulty 2` dá "+20% de kp" ao chefe), parece ser a vida/resistência da luta, não pontos de progresso. **Dedução — a wiki não define.**

### As 4 reações
| Reação | Efeito conhecido |
|---|---|
| ⚔️ Atacar | Causa dano (fórmula não documentada) |
| 🛡️ Proteger | Reduz em 2 o dano recebido naquele turno |
| 📔 Estudar | Encontra 1 item; mais 📔 = itens melhores |
| 🍓 Lewd | −1 em 🛡️, 📔 e 💗 dos rivais (mais com itens de "lewd melhor") |

### Itens (só existem dentro da partida)
- Encontrados com 📔. **Somam** nos atributos e alguns têm efeitos especiais (tabela completa na seção 5).
- **Evoluem com estudo:** Strange Fossil → Hew DNA (25 pts de estudo) → Hewtwo (35 pts, +20⚔️).
- **Combinam:** Key + Disabled Mech/Spacecraft Off (+10⚔️); Telekinetic Powers + Desk/Piano (+7⚔️ cada); Yaoi + Yuri + Doujinshi (Pro Lewd).
- **Geram mais itens:** Butler, Maid (10%/turno), Winning Lottery Ticket (3 itens), Memories of a Reincarnation (próximo 📔 dá 2), Magical Panties (25% por 🍓).
- **Bônus temporários:** Dynamax (+50% por 2 turnos), Ephemeral Clone (+50% no próximo ⚔️), Wild Tanuki (+15⚔️ no próximo), A Growing Horn (+25⚔️ no próximo).

### Modo história
- Cada chefe tem **fraquezas próprias** (o jogo pede "read!"); as regras de cada um ficam nas páginas `<Chefe>/Arena`.
- Lori & Lora desativam alguns itens; Naw aceita **só 1 participante** (seção 6).

### Eventos
Existem eventos durante a luta (dá para desligar com `$noevent` ou pular com `$skip`), mas a wiki **não lista** quais são.

---

## 4.2 Roteiro de testes

Objetivo: descobrir o que a wiki não diz. Sugestão: lutar contra **bot** (`$f bot`) e usar `$noevent` para tirar ruído. Use `$hist` / `$fullhist` para pegar o log.

### Teste 1 — O que cada atributo do `$sk` faz
Coloque **todos os pontos num atributo só** e anote os valores que aparecem no embed no início da luta.

| # | Comando | ⚔️ | 🛡️ | 📔 | 💗 | Observação |
|---|---|---|---|---|---|---|
| 1 | `$sk <personagem> 5 0 0 0 0` (Yandere) | | | | | |
| 2 | `$sk <personagem> 0 5 0 0 0` (Tsundere) | | | | | |
| 3 | `$sk <personagem> 0 0 5 0 0` (Kuudere) | | | | | |
| 4 | `$sk <personagem> 0 0 0 5 0` (Dandere) | | | | | |
| 5 | `$sk <personagem> 0 0 0 0 5` (Deredere) | | | | | |
| 6 | `$sk <personagem> 1 1 1 1 1` (equilibrado) | | | | | |

### Teste 2 — Limite de pontos
- `$sk <personagem>` sem números: mostra quantos pontos existem?
- Tentar distribuir **6 pontos** (ex.: `6 0 0 0 0`): o bot aceita ou recusa? Qual a mensagem?
- O total muda entre personagens diferentes (ex.: um de kakera alto vs. baixo, com e sem chaves)?

| Personagem | Kakera | Chaves | Pontos disponíveis |
|---|---|---|---|
| | | | |
| | | | |

### Teste 3 — Dano e defesa
- Dano de um ⚔️ seu contra o bot, com e sem 🛡️ dele: a diferença é sempre 2?
- O dano é igual ao seu ⚔️ menos a 🛡️ do alvo?

| Meu ⚔️ | 🛡️ do alvo | Alvo usou 🛡️? | Dano causado |
|---|---|---|---|
| | | | |
| | | | |

### Teste 4 — Kp
- Repetir a mesma luta com `$kp` diferentes (ex.: 10, 50, 100) e anotar o 💗 inicial de cada um.

| `$kp` | Jogadores | 💗 inicial |
|---|---|---|
| | | |

### Teste 5 — Estudo e itens
- Quantos 📔 seguidos até aparecer um item raro? O 📔 alto melhora mesmo o item?
- Anotar eventos que aparecerem (nome e efeito), já que a wiki não lista nenhum.

| Turno | 📔 atual | Item / evento | Efeito |
|---|---|---|---|
| | | | |

### Teste 6 — Comandos a confirmar
- `$mmf` lista os personagens com pontos distribuídos (está na wiki).
- `$mmfs` **não** está na wiki — testar se existe e o que mostra.

---

## 5. Itens

Encontrados com 📔 (Estudar). Bônus somam nos atributos; vários têm efeitos especiais ou combinações.

### Destaques
- **Mais fortes:** Holy Grail (+15⚔️ +15🛡️ +15📔 +14💗), One Piece (+20⚔️ +10🛡️ +24💗), Spear of Longinus (+25⚔️),
  Excalibur (+20⚔️ +5🛡️), Super Saiyan Transformation (+20⚔️ +10🛡️), Hewtwo / Psychobuster (+20⚔️), Philosopher's Stone (+100💗).
- **Combinações:**
  - Key + Disabled Mech **ou** Spacecraft Off → +10⚔️.
  - Telekinetic Powers + Desk **ou** Piano → +7⚔️ (cada).
  - Little Sister + Bamboo Gag → +6⚔️.
  - Yaoi Manga + Yuri Manga + Doujinshi → **Pro Lewd** (−2💗 a mais por 🍓).
  - Childhood Friend / Love Letter in the Locker → **Love Triangle** (10% de Bento por turno); os dois juntos → **Love Square** (20%).
  - Strange Fossil → **Hew DNA** (25 pontos de estudo) → **Hewtwo** (35 pontos de estudo, +20⚔️).
  - Doctor's License → 10% de chance de **Bandage** (+4💗) por turno.
  - Microwave Oven → Bento dá +50% de 💗.
- **Itens que geram itens:** Butler e Maid (10% de item grátis por turno), Winning Lottery Ticket (3 itens),
  Memories of a Reincarnation (o próximo 📔 dá 2 itens), Magical Panties (25% de item por 🍓),
  A Message from the Future (próximo item +15📔 de raridade).
- **Contra o inimigo:** Millennium Eye (−20🛡️ do alvo), Beauty's Nature (−2🛡️), Spillable Tea (−4📔),
  Tentacle (cada ⚔️ tira −1🛡️), Sharingan (próximo ⚔️ ganha bônus igual à 🛡️ do alvo).
- **Defesa contra lewd:** Doll (próximo 🍓 não te afeta), Fig Leaf (🍓 inimigo não tira mais 🛡️).
- **Curiosidade:** Private Lesson parece ser inesgotável; o binário do IBM 5100 significa "SECRET".

### Tabela completa

| Item | Bônus | Efeito / observação |
|---|---|---|
| A Growing Horn | +4⚔️ | Vira Ogro por 1 turno: se a próxima reação for ⚔️, +25⚔️ |
| A Message from the Future | — | Próximo item com +15📔 de raridade |
| Ancestral Skill of Martial Arts | +4⚔️ +3🛡️ | |
| Arc and Arrows | +5⚔️ | |
| Awakening of a Superhero Power | — | +10 num atributo aleatório |
| Bamboo Gag | — | Com Little Sister: +6⚔️ |
| Bandage | +4💗 | 10% por turno depois do Doctor's License |
| Baseball Bat | +5⚔️ +1📔 | |
| Basketball | +3⚔️ +1📔 | |
| Bazooka | +8⚔️ | |
| Beauty's Nature | — | Defesa do inimigo −2🛡️ |
| Beherit | +2⚔️ +2📔 | |
| Bento | +4💗 | 10/20% por turno com Love Triangle/Square, Onii-chan ou Onee-chan; +6💗 com Microwave Oven |
| Blue Butterfly | — | 🦋🦋🦋 |
| Bicycle | +4⚔️ | |
| Book | +2⚔️ +3📔 | |
| Bounty Hunter | +8⚔️ | |
| Boxing Gloves | +4⚔️ +1📔 | |
| Butler | — | 10% de item grátis por turno |
| Camera | +3⚔️ +2📔 | |
| Chair | +4⚔️ +1🛡️ +1📔 | |
| Childhood Friend | — | Vira Love Triangle após 3 turnos; com Love Letter forma Love Square |
| Chocolate Box | +4💗 | |
| Dagger | +5⚔️ | |
| Death Note | — | "Elimina humanos. Se você tiver o necessário..." |
| Demon Butler | +5⚔️ +2🛡️ | |
| Desk | +2🛡️ +1📔 | Com Telekinetic Powers: +7⚔️ |
| Devil Fruit | — | +1 a +8 em cada atributo |
| Digivice | +3⚔️ | |
| Disabled Mech | +5🛡️ +2📔 | Com Key: +10⚔️ |
| Disciple | +2⚔️ +2🛡️ +2📔 | |
| Doctor's License | +3📔 | 10% de Bandage por turno |
| Doll | — | O próximo 🍓 não te afeta |
| Dominator | +5⚔️ +5📔 | |
| Doujinshi | +2⚔️ +1📔 | Lewd melhor: −2💗 por 🍓; parte do Pro Lewd |
| Dragon Scale | +3⚔️ +3🛡️ | |
| Dress Break | — | Seu 🍓 tira o dobro de ⚔️, 🛡️ e 📔 |
| Dynamax Transformation | — | +50% nos atributos por 2 turnos |
| Ephemeral Clone | — | Próximo ⚔️ causa +50% de dano |
| Euphonium | +2⚔️ +1🛡️ +1📔 | |
| Excalibur | +20⚔️ +5🛡️ | |
| Extraterrestrial Auk | +3⚔️ +1🛡️ +2📔 +4💗 | |
| Fan | +1⚔️ +1🛡️ | Lewd melhor: −2💗 por 🍓 |
| Fig Leaf | — | 🍓 inimigo não tira mais 🛡️ |
| Firebolt | +3⚔️ | |
| Fishing Rod | +3⚔️ +1📔 | |
| Flashlight | +3⚔️ | |
| Forbidden Seal | +3⚔️ +3🛡️ +3📔 | |
| Gun | +5⚔️ | |
| Handball | +3⚔️ +1📔 | |
| Hew DNA | — | Vem do Strange Fossil com 25 pontos de estudo |
| Hewtwo | +20⚔️ | Vem do Hew DNA com 35 pontos de estudo |
| Holy Grail | +15⚔️ +15🛡️ +15📔 +14💗 | |
| Holy Water | +1📔 +2💗 | |
| Homunculus | +4⚔️ +4🛡️ | |
| IBM 5100 | +2🛡️ +2📔 | Binário = "SECRET" |
| Key | +2⚔️ | Com Disabled Mech ou Spacecraft Off: +10⚔️ |
| Lemonade | +4💗 | |
| Little Brother | +4🛡️ | |
| Little Sister | +4🛡️ | Com Bamboo Gag: +6⚔️ |
| Love Letter in the Locker | — | Forma Love Triangle; com Childhood Friend forma Love Square |
| Love Square | — | 20% de Bento por turno |
| Love Triangle | — | 10% de Bento por turno |
| Magical Girl Friend | +7⚔️ +2🛡️ +10💗 | |
| Magical Panties | +1📔 | 25% de item por 🍓 |
| Maid | — | 10% de item grátis por turno |
| Master | +4⚔️ +2🛡️ +3📔 | |
| Memories of a Reincarnation | — | O próximo 📔 dá 2 itens |
| Microwave Oven | +2🛡️ | Bento dá +50% de 💗 |
| Millennium Eye | +7⚔️ +7📔 | Fura a defesa inimiga: −20🛡️ |
| Monsterball | +3⚔️ | Chance de capturar um Coodgey: +3⚔️ |
| Mortal Viruses | +8⚔️ | |
| Mysterious Portrait | +3⚔️ +1🛡️ +1📔 | |
| Obediant Cyborg | +5⚔️ +3🛡️ | |
| Omni-Directional Mobility Gear | +5⚔️ +5🛡️ | |
| One Piece | +20⚔️ +10🛡️ +24💗 | |
| Onee-chan / Onii-chan | — | 10% de Bento por turno |
| Neko | +4💗 | |
| Papyrus | +3📔 | |
| Pen | +3⚔️ +1📔 | |
| Pencil | +2⚔️ +1📔 | |
| Persona | — | +1 a +4 em cada atributo |
| Philosopher's Stone | +100💗 | |
| Piano | +1🛡️ +3📔 | Com Telekinetic Powers: +7⚔️ |
| Ping Pong Paddle | +3⚔️ +1📔 | |
| Poneglyphs | +5📔 | |
| Power of Friendship | +5⚔️ +5🛡️ +3📔 +10💗 | |
| Private Lesson | +4📔 | Parece inesgotável |
| Pro Lewd | — | −2💗 a mais por 🍓 (Yaoi + Yuri + Doujinshi) |
| Psychobuster | +20⚔️ | |
| Red Fish | +4💗 | |
| Red Ribbon | — | |
| Red Shell | +2⚔️ | |
| Red Turtle | +3⚔️ +2🛡️ | |
| Rubik's Cube | +2⚔️ +2📔 | |
| Saber | +5⚔️ | |
| Saitama Training | — | ⚔️ +1 a cada turno |
| Salt | +1⚔️ | |
| Seastone | +2⚔️ | |
| Scepter | +5⚔️ | |
| Scissors | +4⚔️ | |
| Scythe | +5⚔️ | |
| Sharingan | — | Próximo ⚔️ ganha bônus igual à 🛡️ do alvo |
| Shield | +5🛡️ | |
| Shinigami Eyes | — | |
| Shuriken | +5⚔️ | |
| Slime Companion | +6🛡️ | |
| Spacecraft Off | +5🛡️ +2📔 | Com Key: +10⚔️ |
| Spear of Longinus | +25⚔️ | |
| Spillable Tea | — | Estudo do inimigo −4📔 |
| Stalker | — | Se sacrifica para proteger de um ataque fatal |
| Stand | — | +0 a +5 em cada atributo |
| Stone Mask | +2⚔️ +1🛡️ +1📔 +4💗 | |
| Strange Fossil | +3⚔️ +2📔 | Vira Hew DNA com 25 pontos de estudo |
| Strange Sense of Déjà Vu | — | |
| Strawberry Cake | +1⚔️ +2💗 | |
| Strawberry Choco Bomber Crash Seasonal Hyper Tropical Espresso | +4💗 | |
| Succubus Companion | — | Dá um 🍓 por turno (sem seus bônus) |
| Super Saiyan Transformation | +20⚔️ +10🛡️ | |
| Sword | +5⚔️ | |
| Talisman Conferring Magical Powers | +7⚔️ | |
| Talking Motorcycle | +3⚔️ +2🛡️ +3📔 | |
| Tamed Fox | +4⚔️ +1🛡️ | |
| Tamed Yokai | +5⚔️ +2🛡️ | |
| Telekinetic Powers | +7⚔️ | Com Desk ou Piano: +7⚔️ |
| Tentacle | +2⚔️ | Cada ⚔️ tira −1🛡️ do alvo |
| Thick Thighs Bible | — | Lewd melhor: −1📔 por 🍓 |
| Transponder Snail | +3⚔️ | |
| Violin | +4⚔️ +3📔 | |
| Wild Tanuki | — | Próximo ⚔️ causa +15⚔️ |
| Winning Lottery Ticket | — | Ganha 3 itens |
| Vampire Servant | +8⚔️ | |
| Yaoi Manga | +2⚔️ +1📔 | Lewd melhor: −1💗 por 🍓; parte do Pro Lewd |
| Vectors | +9⚔️ | |
| Yo-Yo | +3⚔️ | |
| Yuri Manga | +2⚔️ +1📔 | Lewd melhor: −1💗 por 🍓; parte do Pro Lewd |

---

## 6. Chefes do modo história

Cada chefe tem fraquezas próprias ("leia!"). Os detalhes ficam em páginas separadas da wiki, ainda **não lidas**.

| Comando | Chefe | Observações | Página |
|---|---|---|---|
| `$ar1` | 🦔 **Lewen**, o treinador de monstros selvagens | Referência a Pokémon (Monsterball, Hew DNA, Dynamax…) | `Lewen/Arena` |
| `$ar2` | 🧸 **Maryka**, a aristocrata | Uma boneca que ganhou existência por um desejo da irmã | `Maryka/Arena` |
| `$ar3` | 💜 **Somnia**, a donzela desperta | Drena a energia de todos com um gás roxo | `Somnia/Arena` |
| `$ar4` | 🔥 **Lori** & ❄ **Lora** | "Quebra-cabeça" difícil. Itens desativados: Succubus Companion, Dragon Torc, Future Diary, Geass, Reading Steiner, Red Stone of Aja | `Lori & Lora/Arena` |
| `$ar5` | 📜 **Naw**, a discípula da onisciência | **Só 1 participante.** Invoca monstros (lista abaixo). Dica dela: "preste atenção aos detalhes"; dá para escolher o tipo do dragão eliminando fadas | `Naw/Arena` |

Monstros invocados pela Naw: Fuchsia Dragon, Scarlet Dragon, Armored Dragon, Celestial Dragon, Fairy of Exhaustion,
Fairy of Impotence, Fairy of Shield Piercing, Fairy of Ignorance, Goblin of the Seabed, Ogre of the Volcanoes,
Orca of the Dawnbridges, Troll of the Clouds.

---

## 7. Lacunas (o que a wiki não diz)

- O que cada atributo (Yandere, Tsundere, Kuudere, Dandere, Deredere) faz → **Teste 1**.
- Quantos pontos de `$sk` cada personagem tem e se dá para aumentar → **Teste 2**.
- Como o dano é calculado → **Teste 3**. O que é exatamente o kp → **Teste 4**.
- Lista de ataques/habilidades e de eventos (seções vazias na página) → **Teste 5**.
- As fraquezas de cada chefe: as páginas `<Chefe>/Arena` existem, mas a do Lewen (lida) só traz os atributos dele
  (**9⚔️ 5🛡️ 0📔**) e nomes de habilidades sem descrição (Catercake, Metarmor, Butterflow, Arcanound, Blasturtle).

Buscas feitas em 2026-10-15 (wiki, fórum da wiki, web) não encontraram nada além disso.

---

## 8. Estado da conversa

- Data: 2026-10-15.
- O usuário leu este material e fez perguntas sobre a Waifuarena (possível ideia de levar algo disso ao Mudae Tracker — ainda não definido).
- Conclusão até aqui: **o jogo acontece dentro da partida** (itens e escolhas de reação); não há progressão permanente documentada além dos pontos do `$sk`.
- **Objetivo novo:** simular a Waifuarena. O documento deve ter **só regras consolidadas, sem estratégias prontas**.
- Pergunta em aberto: jogar **online** usando só HTML/CSS/JS, com o site hospedado no GitHub (Pages). Resposta dada: dá, via WebRTC ponto a ponto (ex.: PeerJS ou troca manual de códigos), com um jogador como anfitrião; Hamachi é opcional.
- **Próximo passo:** o usuário vai fazer os testes da seção 4.2 no Discord e trazer os resultados para completar o documento.
- **Teste de conexão online feito e funcionando** (aba "ARENA (TESTE)": `waifuarena.js` + `waifuarena.css`, PeerJS, anfitrião + até 8 jogadores, troca de números).
- **Objetivo final:** batalhas online no estilo Waifuarena — um jogador cria a sala, cada um escolhe cartas do próprio harém (do tracker) e luta contra o outro.
- **Protótipo de batalha local feito** (`waifuarena-battle.js` + `.css`): 1 carta do harém contra 1 bot, dificuldades Fácil (aleatório, 80% de vida), Normal e Difícil (+20% de vida), visual de duelo com as cartas com efeitos. Pontos do `$sk` salvos em `character.arenaSkills`.
  Regras **provisórias** (objeto `RULES` no arquivo, trocar após os testes 4.2): base 3⚔️ 1🛡️ 1📔 20💗; Yandere +2⚔️, Tsundere +1🛡️, Kuudere +2📔, Dandere +4💗 por ponto, Deredere +1 força do 🍓 a cada 2 pontos; dano = ⚔️ − 🛡️ do alvo (mín. 1), −2 se protegeu; raridade do item cresce com o 📔.
  Ordem do turno: efeitos de início → 🛡️ → 🍓 → 📔 → ⚔️ (ataques simultâneos). Itens sem efeito conhecido (Death Note, Shinigami Eyes…) só dão os atributos.
  Próximos passos combinados: escolha de cartas (feito, 1 carta), online usando o motor (`window.WaifuArenaBattle`), acabamento visual.
- Decisões tomadas: atributos **fiéis ao `$sk` do Mudae** (por enquanto) e **1 carta por jogador**.
- Decisão antiga (resolvida acima): de onde vêm os atributos das cartas (fiel ao `$sk` do Mudae, que ainda não sabemos como funciona, ou adaptação com dados do tracker: kakera, chaves, OP).

### Contexto anterior: cartas com efeitos (v1.0) — concluído, sem commit
Implementado no tracker, em arquivos separados:
- `card-effects.html` (editor, aberto num iframe pelo botão ✦), `card-effects.css` (visual das cartas, 3D e editor),
  `card-effects.js` (núcleo + integração com o tracker + editor), `card-effects-tracker.css` (encaixe na lista).
- `index.html`: só inclusões (fontes, CSS e script). `script.js`, `style.css` e `database.js` **não** foram alterados.
- Interruptor **CARTAS** em Personagens → Exibição (exclusivo com INFORMAÇÕES). Config por personagem em `character.cardStyle`.
- Raridade pelas 11 kakeras (`kakerasImg/1..11.png`: Purple 0–100, Light 101–150, Blue 151–200, Teal 201–275,
  Green 276–375, Yellow 376–500, Orange 501–700, Red 701–999, Dark 1000–1499, Chaos 1500–1999, Rainbow 2000+).
- Chaves (padrão Mudae): 1–2 bronze, 3–5 prata, 6–9 ouro, 10+ caos.
- Regras de desbloqueio: moldura e texto 1+ chave; textura 3+; animação 6+; efeitos especiais 10+;
  foil Prata 400+, Ouro 600+, Gelo/Prisma/Raios 800+, todos (e glitter) 1000+ de kakera.
- Proporção da carta: 5 × 8. Verso escuro com `Mudae.png`. Arquivos de exemplo foram apagados.
