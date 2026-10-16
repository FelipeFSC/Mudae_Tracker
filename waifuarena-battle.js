/* ============================================================
   WAIFUARENA-BATTLE.JS — Batalha da Waifu Arena (protótipo v2)
   ------------------------------------------------------------
   Duelo de TIMES de 3 cartas, no estilo de jogo de cartas: uma carta
   fica na frente e as outras no banco. Regras da Waifuarena do Mudae
   (ver WAIFUARENA.md) + regras do time:

   - Cada carta tem os próprios 5 pontos do $sk.
   - No início, cada jogador escolhe quem começa na frente.
   - A cada turno a carta da frente faz uma reação (⚔️ atacar,
     🛡️ proteger, 📔 estudar, 🍓 lewd) OU o jogador 🔄 troca de carta.
     As escolhas são feitas ao mesmo tempo e reveladas juntas.
   - Trocar enquanto o rival ataca: se o ataque dele for MAIOR que a
     defesa da carta da frente, ela toma o golpe e depois troca; se
     não, a troca acontece antes e a carta que entrou toma o golpe.
   - Cartas no banco recuperam +5💗 por turno (até a vida máxima).
   - Carta da frente nocauteada: o dono escolhe quem entra. Perde
     quem ficar sem cartas de pé.
   - 📔 mostra de 1 a 3 itens (mais 📔 = mais opções); o jogador
     escolhe 1 item e para qual carta do time ele vai.

   O que a wiki não explica está em RULES, marcado como PROVISÓRIO.

   Quem roda o motor: no modo contra bot, este navegador; no online,
   o ANFITRIÃO, que pede as decisões do convidado e manda pacotes
   (eventos + estado) para os dois verem a mesma luta.
   ============================================================ */
(() => {
  'use strict';

  /* ============================================================
     REGRAS (o que é PROVISÓRIO está marcado)
     ============================================================ */
  const RULES = {
    points: 5,                 // pontos do $sk por carta (fórum da wiki: 5)
    protect: 2,                // 🛡️ reduz o dano em 2 (wiki)
    lewd: 1,                   // 🍓 tira 1 de 🛡️, 📔 e 💗 (wiki)
    teamSize: 3,               // cartas por jogador
    benchHeal: 5,              // vida recuperada por turno no banco
    // PROVISÓRIO: atributos base e o que cada ponto do $sk dá
    base: { atk: 3, def: 1, study: 1, hp: 20 },
    perPoint: { yandere: ['atk', 2], tsundere: ['def', 1], kuudere: ['study', 2], dandere: ['hp', 4] },
    deredereLewdEvery: 2,      // PROVISÓRIO: +1 de força do 🍓 a cada 2 pontos de Deredere
    // PROVISÓRIO: dano = ⚔️ do atacante − 🛡️ do alvo (mínimo 1); se o alvo protegeu, −2
    minDamage: 1,
    offerEvery: 4,             // PROVISÓRIO: +1 opção de item a cada 4📔 (de 1 a 3 opções)
    maxOffers: 3,
    maxTurns: 150,
  };

  const SKILLS = [
    ['yandere', 'Yandere', '+2 ⚔️ por ponto'],
    ['tsundere', 'Tsundere', '+1 🛡️ por ponto'],
    ['kuudere', 'Kuudere', '+2 📔 por ponto'],
    ['dandere', 'Dandere', '+4 💗 por ponto'],
    ['deredere', 'Deredere', '+1 força do 🍓 a cada 2 pontos'],
  ];

  const DIFFICULTIES = {
    easy:   { label: 'Fácil',   hp: 0.8, desc: 'Bot escolhe ao acaso · 80% de vida' },
    normal: { label: 'Normal',  hp: 1.0, desc: 'Bot com jogadas simples · vida normal' },
    hard:   { label: 'Difícil', hp: 1.2, desc: 'Bot calculista · +20% de vida (como $difficulty 2)' },
  };

  const ACTIONS = {
    attack:  { ico: '⚔️', label: 'ATACAR',   hint: 'Causa dano' },
    protect: { ico: '🛡️', label: 'PROTEGER', hint: `−${RULES.protect} de dano recebido` },
    study:   { ico: '📔', label: 'ESTUDAR',  hint: 'Escolha um item' },
    lewd:    { ico: '🍓', label: 'LEWD',     hint: `−${RULES.lewd} 🛡️ 📔 💗 do rival` },
  };
  const SWITCH_ICO = '🔄';
  const actionIco = a => (typeof a === 'string' && a.startsWith('switch:') ? SWITCH_ICO : ACTIONS[a] ? ACTIONS[a].ico : '?');

  /* ============================================================
     ITENS (tabela da wiki)
     [nome, ⚔️, 🛡️, 📔, 💗, efeito, descrição do efeito]
     ============================================================ */
  const RAW_ITEMS = [
    ['A Growing Horn', 4, 0, 0, 0, 'horn', 'Próximo ⚔️ causa +25'],
    ['A Message from the Future', 0, 0, 0, 0, 'future', 'Próximo item com +15📔 de raridade'],
    ['Ancestral Skill of Martial Arts', 4, 3, 0, 0],
    ['Arc and Arrows', 5, 0, 0, 0],
    ['Awakening of a Superhero Power', 0, 0, 0, 0, 'awaken', '+10 num atributo aleatório'],
    ['Bamboo Gag', 0, 0, 0, 0, 'combo', 'Com Little Sister: +6⚔️'],
    ['Baseball Bat', 5, 0, 1, 0],
    ['Basketball', 3, 0, 1, 0],
    ['Bazooka', 8, 0, 0, 0],
    ["Beauty's Nature", 0, 0, 0, 0, 'enemyDef:2', 'Rival −2🛡️'],
    ['Beherit', 2, 0, 2, 0],
    ['Blue Butterfly', 0, 0, 0, 0, null, '🦋🦋🦋'],
    ['Bicycle', 4, 0, 0, 0],
    ['Book', 2, 0, 3, 0],
    ['Bounty Hunter', 8, 0, 0, 0],
    ['Boxing Gloves', 4, 0, 1, 0],
    ['Butler', 0, 0, 0, 0, 'freeItem', '10% de item grátis por turno'],
    ['Camera', 3, 0, 2, 0],
    ['Chair', 4, 1, 1, 0],
    ['Childhood Friend', 0, 0, 0, 0, 'bento', '10% de Bento por turno'],
    ['Chocolate Box', 0, 0, 0, 4],
    ['Dagger', 5, 0, 0, 0],
    ['Death Note', 0, 0, 0, 0, null, 'Efeito ainda não simulado'],
    ['Demon Butler', 5, 2, 0, 0],
    ['Desk', 0, 2, 1, 0, 'combo', 'Com Telekinetic Powers: +7⚔️'],
    ['Devil Fruit', 0, 0, 0, 0, 'randAll:1:8', '+1 a +8 em cada atributo'],
    ['Digivice', 3, 0, 0, 0],
    ['Disabled Mech', 0, 5, 2, 0, 'combo', 'Com Key: +10⚔️'],
    ['Disciple', 2, 2, 2, 0],
    ["Doctor's License", 0, 0, 3, 0, 'bandage', '10% de Bandage (+4💗) por turno'],
    ['Doll', 0, 0, 0, 0, 'doll', 'O próximo 🍓 não te afeta'],
    ['Dominator', 5, 0, 5, 0],
    ['Doujinshi', 2, 0, 1, 0, 'lewdHp:2', 'Seu 🍓 tira +2💗'],
    ['Dragon Scale', 3, 3, 0, 0],
    ['Dress Break', 0, 0, 0, 0, 'lewdDouble', 'Seu 🍓 tira o dobro de 🛡️ e 📔'],
    ['Dynamax Transformation', 0, 0, 0, 0, 'dynamax', '+50% nos atributos por 2 turnos'],
    ['Ephemeral Clone', 0, 0, 0, 0, 'clone', 'Próximo ⚔️ causa +50%'],
    ['Euphonium', 2, 1, 1, 0],
    ['Excalibur', 20, 5, 0, 0],
    ['Extraterrestrial Auk', 3, 1, 2, 4],
    ['Fan', 1, 1, 0, 0, 'lewdHp:2', 'Seu 🍓 tira +2💗'],
    ['Fig Leaf', 0, 0, 0, 0, 'figleaf', '🍓 do rival não tira mais sua 🛡️'],
    ['Firebolt', 3, 0, 0, 0],
    ['Fishing Rod', 3, 0, 1, 0],
    ['Flashlight', 3, 0, 0, 0],
    ['Forbidden Seal', 3, 3, 3, 0],
    ['Gun', 5, 0, 0, 0],
    ['Handball', 3, 0, 1, 0],
    ['Holy Grail', 15, 15, 15, 14],
    ['Holy Water', 0, 0, 1, 2],
    ['Homunculus', 4, 4, 0, 0],
    ['IBM 5100', 0, 2, 2, 0, null, '01010011 01000101 01000011 01010010 01000101 01010100'],
    ['Key', 2, 0, 0, 0, 'combo', 'Com Disabled Mech ou Spacecraft Off: +10⚔️'],
    ['Lemonade', 0, 0, 0, 4],
    ['Little Brother', 0, 4, 0, 0],
    ['Little Sister', 0, 4, 0, 0, 'combo', 'Com Bamboo Gag: +6⚔️'],
    ['Love Letter in the Locker', 0, 0, 0, 0, 'bento', 'Love Triangle: 10% de Bento por turno'],
    ['Magical Girl Friend', 7, 2, 0, 10],
    ['Magical Panties', 0, 0, 1, 0, 'lewdItem', '25% de item a cada 🍓'],
    ['Maid', 0, 0, 0, 0, 'freeItem', '10% de item grátis por turno'],
    ['Master', 4, 2, 3, 0],
    ['Memories of a Reincarnation', 0, 0, 0, 0, 'doubleStudy', 'O próximo 📔 dá 2 itens'],
    ['Microwave Oven', 0, 2, 0, 0, 'microwave', 'Bento dá +50%💗'],
    ['Millennium Eye', 7, 0, 7, 0, 'enemyDef:20', 'Rival −20🛡️'],
    ['Monsterball', 3, 0, 0, 0, 'monsterball', 'Chance de capturar um Coodgey (+3⚔️)'],
    ['Mortal Viruses', 8, 0, 0, 0],
    ['Mysterious Portrait', 3, 1, 1, 0],
    ['Obediant Cyborg', 5, 3, 0, 0],
    ['Omni-Directional Mobility Gear', 5, 5, 0, 0],
    ['One Piece', 20, 10, 0, 24],
    ['Onee-chan', 0, 0, 0, 0, 'bento', '10% de Bento por turno'],
    ['Onii-chan', 0, 0, 0, 0, 'bento', '10% de Bento por turno'],
    ['Neko', 0, 0, 0, 4],
    ['Papyrus', 0, 0, 3, 0],
    ['Pen', 3, 0, 1, 0],
    ['Pencil', 2, 0, 1, 0],
    ['Persona', 0, 0, 0, 0, 'randAll:1:4', '+1 a +4 em cada atributo'],
    ["Philosopher's Stone", 0, 0, 0, 100],
    ['Piano', 0, 1, 3, 0, 'combo', 'Com Telekinetic Powers: +7⚔️'],
    ['Ping Pong Paddle', 3, 0, 1, 0],
    ['Poneglyphs', 0, 0, 5, 0],
    ['Power of Friendship', 5, 5, 3, 10],
    ['Private Lesson', 0, 0, 4, 0],
    ['Psychobuster', 20, 0, 0, 0],
    ['Red Fish', 0, 0, 0, 4],
    ['Red Ribbon', 0, 0, 0, 0, null, 'Efeito desconhecido'],
    ['Red Shell', 2, 0, 0, 0],
    ['Red Turtle', 3, 2, 0, 0],
    ["Rubik's Cube", 2, 0, 2, 0],
    ['Saber', 5, 0, 0, 0],
    ['Saitama Training', 0, 0, 0, 0, 'saitama', '+1⚔️ a cada turno'],
    ['Salt', 1, 0, 0, 0],
    ['Seastone', 2, 0, 0, 0],
    ['Scepter', 5, 0, 0, 0],
    ['Scissors', 4, 0, 0, 0],
    ['Scythe', 5, 0, 0, 0],
    ['Sharingan', 0, 0, 0, 0, 'sharingan', 'Próximo ⚔️ ganha bônus igual à 🛡️ do alvo'],
    ['Shield', 0, 5, 0, 0],
    ['Shinigami Eyes', 0, 0, 0, 0, null, 'Efeito ainda não simulado'],
    ['Shuriken', 5, 0, 0, 0],
    ['Slime Companion', 0, 6, 0, 0],
    ['Spacecraft Off', 0, 5, 2, 0, 'combo', 'Com Key: +10⚔️'],
    ['Spear of Longinus', 25, 0, 0, 0],
    ['Spillable Tea', 0, 0, 0, 0, 'enemyStudy:4', 'Rival −4📔'],
    ['Stalker', 0, 0, 0, 0, 'stalker', 'Se sacrifica para te salvar de um golpe fatal'],
    ['Stand', 0, 0, 0, 0, 'randAll:0:5', '+0 a +5 em cada atributo'],
    ['Stone Mask', 2, 1, 1, 4],
    ['Strange Fossil', 3, 0, 2, 0, 'fossil', 'Vira Hew DNA com 25📔 e Hewtwo com 35📔'],
    ['Strange Sense of Déjà Vu', 0, 0, 0, 0, null, 'Efeito desconhecido'],
    ['Strawberry Cake', 1, 0, 0, 2],
    ['Strawberry Choco Bomber Crash Seasonal Hyper Tropical Espresso', 0, 0, 0, 4],
    ['Succubus Companion', 0, 0, 0, 0, 'succubus', 'Dá um 🍓 por turno (sem bônus)'],
    ['Super Saiyan Transformation', 20, 10, 0, 0],
    ['Sword', 5, 0, 0, 0],
    ['Talisman Conferring Magical Powers', 7, 0, 0, 0],
    ['Talking Motorcycle', 3, 2, 3, 0],
    ['Tamed Fox', 4, 1, 0, 0],
    ['Tamed Yokai', 5, 2, 0, 0],
    ['Telekinetic Powers', 7, 0, 0, 0, 'combo', 'Com Desk ou Piano: +7⚔️ (cada)'],
    ['Tentacle', 2, 0, 0, 0, 'tentacle', 'Cada ⚔️ tira −1🛡️ do alvo'],
    ['Thick Thighs Bible', 0, 0, 0, 0, 'lewdStudy:1', 'Seu 🍓 tira +1📔'],
    ['Transponder Snail', 3, 0, 0, 0],
    ['Violin', 4, 0, 3, 0],
    ['Wild Tanuki', 0, 0, 0, 0, 'tanuki', 'Próximo ⚔️ causa +15'],
    ['Winning Lottery Ticket', 0, 0, 0, 0, 'lottery', 'Ganha 3 itens'],
    ['Vampire Servant', 8, 0, 0, 0],
    ['Yaoi Manga', 2, 0, 1, 0, 'lewdHp:1', 'Seu 🍓 tira +1💗'],
    ['Vectors', 9, 0, 0, 0],
    ['Yo-Yo', 3, 0, 0, 0],
    ['Yuri Manga', 2, 0, 1, 0, 'lewdHp:1', 'Seu 🍓 tira +1💗'],
  ];

  /* "Peso" de cada efeito para a raridade (mais 📔 = itens de valor maior) */
  const FX_VALUE = {
    horn: 15, future: 6, awaken: 8, freeItem: 10, bandage: 3, doll: 4, lewdHp: 3, lewdDouble: 6, dynamax: 15, clone: 8,
    figleaf: 4, lewdItem: 6, doubleStudy: 6, enemyDef: 0, enemyStudy: 4, monsterball: 2, saitama: 12, sharingan: 8,
    stalker: 10, fossil: 6, succubus: 10, tentacle: 3, lewdStudy: 3, tanuki: 10, lottery: 15, bento: 4, microwave: 2, combo: 3, randAll: 0,
  };

  const ITEMS = RAW_ITEMS.map(([name, atk, def, study, hp, fx = null, note = '']) => {
    const [fxKey, a, b] = fx ? fx.split(':') : [null];
    let value = atk + def + study + hp * 0.5 + (fxKey ? FX_VALUE[fxKey] || 0 : 0);
    if (fxKey === 'enemyDef') value += Number(a) / 2;
    if (fxKey === 'randAll') value += (Number(a) + Number(b)) * 2;
    return { name, atk, def, study, hp, fx: fxKey, fxA: Number(a), fxB: Number(b), note, value: Math.max(1, value) };
  });
  const ITEM_BY_NAME = Object.fromEntries(ITEMS.map(i => [i.name, i]));
  const itemSummary = it => [it.atk && `+${it.atk}⚔️`, it.def && `+${it.def}🛡️`, it.study && `+${it.study}📔`, it.hp && `+${it.hp}💗`].filter(Boolean).join(' ');

  /* ============================================================
     MOTOR DA BATALHA
     ============================================================ */
  const rand = n => Math.floor(Math.random() * n);
  const chance = p => Math.random() < p;
  const pick = list => list[rand(list.length)];
  const SIDES = ['host', 'guest'];
  const other = s => (s === 'host' ? 'guest' : 'host');

  function makeFighter(c, skills, side, idx, hpMult = 1) {
    const s = { yandere: 0, tsundere: 0, kuudere: 0, dandere: 0, deredere: 0, ...skills };
    const f = {
      char: c, name: c.name, side, idx, skills: s,
      atk: RULES.base.atk, def: RULES.base.def, study: RULES.base.study, hp: RULES.base.hp,
      lewdPower: RULES.lewd + Math.floor(s.deredere / RULES.deredereLewdEvery),
      items: [], combos: [], ko: false, protecting: false,
      fx: { horn: false, future: 0, freeItem: 0, bandage: false, doll: false, lewdHp: 0, lewdDouble: false, dynamax: 0, clone: false,
            figleaf: false, lewdItem: false, doubleStudy: false, saitama: false, sharingan: false, stalker: false, succubus: false,
            tentacle: false, lewdStudy: 0, tanuki: false, bento: 0, microwave: false },
    };
    for (const [skill, [stat, per]] of Object.entries(RULES.perPoint)) f[stat] += s[skill] * per;
    f.hp = Math.max(1, Math.round(f.hp * hpMult));
    f.hpMax = f.hp;
    return f;
  }

  const front = (B, s) => B.teams[s].cards[B.teams[s].active];
  const has = (f, name) => f.items.includes(name);
  const clamp0 = f => { f.def = Math.max(0, f.def); f.study = Math.max(0, f.study); f.hp = Math.max(0, f.hp); };
  const alive = T => T.cards.filter(c => !c.ko);
  function addHp(f, n) { f.hp += n; if (f.hp > f.hpMax) f.hpMax = f.hp; }   // itens de 💗 também aumentam a vida máxima

  /* Sorteio de UM item para um nível de estudo (mais 📔 libera itens de valor maior) */
  function rollItem(study, exclude = []) {
    const max = 6 + study * 1.5;
    let pool = ITEMS.filter(i => i.value <= max && !exclude.includes(i.name));
    const good = pool.filter(i => i.value >= max * 0.35);
    if (good.length >= 6) pool = good;
    if (!pool.length) pool = ITEMS.filter(i => !exclude.includes(i.name));
    const total = pool.reduce((t, i) => t + i.value, 0);
    let r = Math.random() * total;
    for (const i of pool) { r -= i.value; if (r <= 0) return i; }
    return pool[pool.length - 1];
  }

  /* Opções de item ao estudar: de 1 a 3, sem repetir */
  function makeOffer(f) {
    const level = f.study + f.fx.future;
    f.fx.future = 0;
    const count = Math.max(1, Math.min(RULES.maxOffers, 1 + Math.floor(level / RULES.offerEvery)));
    const names = [];
    while (names.length < count) names.push(rollItem(level, names).name);
    return names;
  }

  const statIco = st => ({ atk: '⚔️', def: '🛡️', study: '📔', hp: '💗' }[st]);

  function giveItem(B, f, item, depth = 0) {
    const foe = front(B, other(f.side));
    f.items.push(item.name);
    f.atk += item.atk; f.def += item.def; f.study += item.study;
    if (item.hp) addHp(f, item.hp);
    const sum = itemSummary(item);
    B.log(`${f.name} recebeu <b>${item.name}</b>${sum ? ` (${sum})` : ''}${item.note ? ` — ${item.note}` : ''}`, 'item', f);
    B.pop(f, `📦 ${item.name}`, 'item');

    switch (item.fx) {
      case 'horn': f.fx.horn = true; break;
      case 'future': f.fx.future += 15; break;
      case 'awaken': { const st = pick(['atk', 'def', 'study', 'hp']); if (st === 'hp') addHp(f, 10); else f[st] += 10; B.log(`${f.name} despertou um poder: +10 ${statIco(st)}`, 'fx', f); break; }
      case 'freeItem': f.fx.freeItem++; break;
      case 'bandage': f.fx.bandage = true; break;
      case 'doll': f.fx.doll = true; break;
      case 'lewdHp': f.fx.lewdHp += item.fxA; break;
      case 'lewdDouble': f.fx.lewdDouble = true; break;
      case 'dynamax': f.fx.dynamax = 2; break;
      case 'clone': f.fx.clone = true; break;
      case 'figleaf': f.fx.figleaf = true; break;
      case 'lewdItem': f.fx.lewdItem = true; break;
      case 'doubleStudy': f.fx.doubleStudy = true; break;
      case 'enemyDef': foe.def = Math.max(0, foe.def - item.fxA); B.log(`A defesa de ${foe.name} caiu: −${item.fxA}🛡️`, 'fx', foe); break;
      case 'enemyStudy': foe.study = Math.max(0, foe.study - item.fxA); B.log(`O estudo de ${foe.name} foi desperdiçado: −${item.fxA}📔`, 'fx', foe); break;
      case 'monsterball': if (chance(0.5)) { f.atk += 3; B.log(`${f.name} usa Monsterball para capturar um Coodgey! +3⚔️`, 'fx', f); } break;
      case 'saitama': f.fx.saitama = true; break;
      case 'sharingan': f.fx.sharingan = true; break;
      case 'stalker': f.fx.stalker = true; break;
      case 'succubus': f.fx.succubus = true; break;
      case 'tentacle': f.fx.tentacle = true; break;
      case 'lewdStudy': f.fx.lewdStudy += item.fxA; break;
      case 'tanuki': f.fx.tanuki = true; break;
      case 'bento': f.fx.bento++; break;
      case 'microwave': f.fx.microwave = true; break;
      case 'randAll': {
        const roll = () => item.fxA + rand(item.fxB - item.fxA + 1);
        const a = roll(), d = roll(), s = roll(), h = roll();
        f.atk += a; f.def += d; f.study += s; addHp(f, h);
        B.log(`${item.name}: +${a}⚔️ +${d}🛡️ +${s}📔 +${h}💗`, 'fx', f);
        break;
      }
      case 'lottery':
        if (depth < 2) for (let k = 0; k < 3; k++) giveItem(B, f, rollItem(f.study), depth + 1);
        break;
    }
    checkCombos(B, f);
  }

  /* Combinações da wiki: aplicadas uma vez quando os itens se juntam NA MESMA carta */
  const COMBOS = [
    { id: 'mech', need: ['Key', 'Disabled Mech'], atk: 10, text: 'insere a Key e o mecha liga! +10⚔️' },
    { id: 'space', need: ['Key', 'Spacecraft Off'], atk: 10, text: 'insere a Key e a nave liga! +10⚔️' },
    { id: 'desk', need: ['Telekinetic Powers', 'Desk'], atk: 7, text: 'agora consegue arremessar a Desk! +7⚔️' },
    { id: 'piano', need: ['Telekinetic Powers', 'Piano'], atk: 7, text: 'agora consegue arremessar o Piano! +7⚔️' },
    { id: 'gag', need: ['Little Sister', 'Bamboo Gag'], atk: 6, text: 'amordaça a Little Sister e se enche de determinação! +6⚔️' },
    { id: 'prolewd', need: ['Yaoi Manga', 'Yuri Manga', 'Doujinshi'], lewdHp: 2, text: 'virou Pro Lewd: seu 🍓 tira +2💗' },
  ];
  function checkCombos(B, f) {
    for (const c of COMBOS) {
      if (f.combos.includes(c.id) || !c.need.every(n => has(f, n))) continue;
      f.combos.push(c.id);
      if (c.atk) f.atk += c.atk;
      if (c.lewdHp) f.fx.lewdHp += c.lewdHp;
      B.log(`<b>Combinação!</b> ${f.name} ${c.text}`, 'combo', f);
      B.pop(f, '✨ COMBO', 'combo');
    }
  }

  /* Efeitos de início de turno da carta da frente (Saitama, Bandage, Bento, Butler/Maid, fóssil) */
  function startOfTurn(B, f) {
    if (f.fx.saitama) f.atk += 1;
    if (f.fx.bandage && chance(0.1)) { addHp(f, 4); B.log(`${f.name} ganhou uma Bandage: +4💗`, 'fx', f); }
    for (let i = 0; i < f.fx.bento; i++) {
      if (chance(0.1)) { const n = f.fx.microwave ? 6 : 4; addHp(f, n); B.log(`${f.name} ganhou um Bento: +${n}💗`, 'fx', f); }
    }
    for (let i = 0; i < f.fx.freeItem; i++) if (chance(0.1)) { B.log(`${f.name} recebeu um item grátis!`, 'fx', f); giveItem(B, f, rollItem(f.study)); }
    if (has(f, 'Strange Fossil') && !has(f, 'Hew DNA') && f.study >= 25) {
      f.items.push('Hew DNA');
      B.log(`${f.name} extraiu o <b>Hew DNA</b> do Strange Fossil!`, 'combo', f);
    }
    if (has(f, 'Hew DNA') && !has(f, 'Hewtwo') && f.study >= 35) {
      f.items.push('Hewtwo'); f.atk += 20;
      B.log(`${f.name} criou o <b>Hewtwo</b> a partir do Hew DNA! +20⚔️`, 'combo', f);
      B.pop(f, '🧬 HEWTWO', 'combo');
    }
  }

  function doLewd(B, src, tgt, power, boosted) {
    if (tgt.fx.doll) { tgt.fx.doll = false; B.log(`A Doll de ${tgt.name} absorveu o 🍓!`, 'fx', tgt); return; }
    const malus = power * (boosted && src.fx.lewdDouble ? 2 : 1);
    if (!tgt.fx.figleaf) tgt.def -= malus;
    tgt.study -= malus + (boosted ? src.fx.lewdStudy : 0);
    const hpLoss = power + (boosted ? src.fx.lewdHp : 0);
    tgt.hp -= hpLoss;
    clamp0(tgt);
    B.pop(tgt, `🍓 −${hpLoss}`, 'lewd');
    B.log(`${boosted ? src.name : `A succubus de ${src.name}`} usou 🍓 em ${tgt.name}: −${tgt.fx.figleaf ? 0 : malus}🛡️ −${malus + (boosted ? src.fx.lewdStudy : 0)}📔 −${hpLoss}💗`, 'lewd', tgt);
    if (boosted && src.fx.lewdItem && chance(0.25)) giveItem(B, src, rollItem(src.study));
  }

  /* Ataque bruto de src contra tgt (com os bônus de "próximo ataque") e defesa de tgt */
  function rawAttack(src, tgt) {
    let a = src.atk * (src.fx.dynamax ? 1.5 : 1);
    if (src.fx.tanuki) a += 15;
    if (src.fx.horn) a += 25;
    if (src.fx.sharingan) a += tgt.def;
    if (src.fx.clone) a *= 1.5;
    return a;
  }
  const defense = f => f.def * (f.fx.dynamax ? 1.5 : 1);

  /* Dano que src causaria em tgt agora (também usado pelo bot, sem gastar bônus) */
  function previewDamage(src, tgt, tgtProtects = false) {
    let dmg = Math.max(RULES.minDamage, Math.round(rawAttack(src, tgt) - defense(tgt)));
    if (tgtProtects) dmg = Math.max(0, dmg - RULES.protect);
    return dmg;
  }

  function doSwitch(B, s, to) {
    const T = B.teams[s];
    const from = T.active;
    if (!T.cards[to] || T.cards[to].ko || to === from) return;
    T.active = to;
    B.ev({ e: 'sw', side: s, from, to });
    B.log(`${T.cards[from].name} volta para o banco e <b>${T.cards[to].name}</b> entra na frente.`, 'switch', T.cards[to]);
  }

  /* Resolve um turno. Devolve as opções de item de quem estudou: { host: [[nomes]...], guest: [...] } */
  function resolveTurn(B, acts) {
    B.turn++;
    const offers = { host: [], guest: [] };
    B.log(`<b>Turno ${B.turn}</b>: ${front(B, 'host').name} ${actionIco(acts.host)} × ${actionIco(acts.guest)} ${front(B, 'guest').name}`, 'turn');

    for (const s of SIDES) startOfTurn(B, front(B, s));

    // 1. trocas: antes do golpe, ou depois se o ataque do rival passar da defesa
    const late = {};
    for (const s of SIDES) {
      if (!String(acts[s]).startsWith('switch:')) continue;
      const to = Number(String(acts[s]).split(':')[1]);
      const me = front(B, s), foe = front(B, other(s));
      if (acts[other(s)] === 'attack' && rawAttack(foe, me) > defense(me)) {
        late[s] = to;
        B.log(`${me.name} tentou sair, mas o ataque de ${foe.name} chega antes!`, 'fx', me);
      } else {
        doSwitch(B, s, to);
      }
    }

    // 2. proteção
    for (const s of SIDES) {
      const f = front(B, s);
      f.protecting = acts[s] === 'protect';
      if (f.protecting) B.pop(f, '🛡️', 'protect');
    }

    // 3. lewds (inclusive a succubus da carta da frente, sem bônus)
    for (const s of SIDES) if (acts[s] === 'lewd') doLewd(B, front(B, s), front(B, other(s)), front(B, s).lewdPower, true);
    for (const s of SIDES) if (front(B, s).fx.succubus) doLewd(B, front(B, s), front(B, other(s)), 1, false);

    // 4. estudo: gera as opções (o jogador escolhe depois do turno)
    for (const s of SIDES) {
      if (acts[s] !== 'study') continue;
      const f = front(B, s);
      const n = f.fx.doubleStudy ? 2 : 1;
      f.fx.doubleStudy = false;
      for (let i = 0; i < n; i++) offers[s].push(makeOffer(f));
      const total = offers[s].reduce((t, o) => t + o.length, 0);
      B.log(`${f.name} estudou e encontrou ${total} ${total > 1 ? 'opções' : 'opção'} de item.`, 'item', f);
    }

    // 5. ataques (calculados antes de aplicar: são simultâneos)
    const hits = [];
    for (const s of SIDES) {
      if (acts[s] !== 'attack') continue;
      const src = front(B, s), tgt = front(B, other(s));
      const dmg = previewDamage(src, tgt, tgt.protecting);
      const bonuses = [src.fx.tanuki && 'Wild Tanuki', src.fx.horn && 'Ogro', src.fx.sharingan && 'Sharingan', src.fx.clone && 'Clone'].filter(Boolean);
      src.fx.tanuki = src.fx.horn = src.fx.sharingan = src.fx.clone = false;
      hits.push([src, tgt, dmg, bonuses]);
    }
    for (const [src, tgt, dmg, bonuses] of hits) {
      tgt.hp -= dmg;
      if (src.fx.tentacle) tgt.def = Math.max(0, tgt.def - 1);
      B.ev({ e: 'atk', side: src.side, idx: src.idx, tside: tgt.side, tidx: tgt.idx, dmg });
      B.log(`${src.name} atacou ${tgt.name}: <b>−${dmg}💗</b>${bonuses.length ? ` (${bonuses.join(', ')})` : ''}${tgt.protecting ? ' · protegido' : ''}`, 'attack', tgt);
    }

    // 6. golpe fatal: Stalker se sacrifica
    for (const s of SIDES) {
      for (const f of B.teams[s].cards) {
        if (f.ko) continue;
        if (f.hp <= 0 && f.fx.stalker) { f.fx.stalker = false; f.hp = 1; B.log(`O Stalker se sacrificou para salvar ${f.name}!`, 'combo', f); }
        clamp0(f);
        f.protecting = false;
      }
      if (front(B, s).fx.dynamax) front(B, s).fx.dynamax--;
    }

    // 7. trocas atrasadas (quem tomou o golpe antes de sair)
    for (const s of SIDES) if (late[s] !== undefined && !front(B, s).ko && front(B, s).hp > 0) doSwitch(B, s, late[s]);
    return offers;
  }

  /* Marca nocautes. Devolve o resultado se acabou: 'host' | 'guest' | 'draw' | null */
  function checkKOs(B) {
    for (const s of SIDES) {
      for (const f of B.teams[s].cards) {
        if (!f.ko && f.hp <= 0) {
          f.ko = true;
          B.ev({ e: 'ko', side: s, idx: f.idx });
          B.log(`<b>${f.name} foi nocauteada!</b>`, 'end', f);
        }
      }
    }
    const hAlive = alive(B.teams.host).length, gAlive = alive(B.teams.guest).length;
    if (!hAlive && !gAlive) return 'draw';
    if (!gAlive) return 'host';
    if (!hAlive) return 'guest';
    if (B.turn >= RULES.maxTurns) return 'draw';
    return null;
  }

  /* Fim do turno: cartas no banco recuperam vida */
  function benchHeal(B) {
    for (const s of SIDES) {
      const T = B.teams[s];
      T.cards.forEach((f, i) => {
        if (i === T.active || f.ko || f.hp >= f.hpMax) return;
        const n = Math.min(RULES.benchHeal, f.hpMax - f.hp);
        f.hp += n;
        B.pop(f, `+${n}💗`, 'heal');
      });
    }
  }

  function applyItemChoice(B, s, names, choice) {
    const T = B.teams[s];
    const name = names[choice && Number.isInteger(choice.item) ? choice.item : 0] || names[0];
    let f = T.cards[choice && Number.isInteger(choice.target) ? choice.target : T.active];
    if (!f || f.ko) f = alive(T)[0];
    if (!f || !ITEM_BY_NAME[name]) return;
    giveItem(B, f, ITEM_BY_NAME[name]);
  }

  /* ---------- Bot ---------- */
  function botAction(me, foe, turn, difficulty) {
    if (difficulty === 'easy') return pick(Object.keys(ACTIONS));
    const myDmg = previewDamage(me, foe);
    const threat = previewDamage(foe, me);
    if (difficulty === 'normal') {
      if (chance(0.2)) return pick(Object.keys(ACTIONS));
      if (me.hp <= threat && chance(0.5)) return 'protect';
      if (turn < 2 && chance(0.6)) return 'study';
      if (foe.def >= me.atk && chance(0.5)) return 'lewd';
      return chance(0.75) ? 'attack' : 'study';
    }
    if (myDmg >= foe.hp) return 'attack';
    if (me.lewdPower >= foe.hp && !foe.fx.doll) return 'lewd';
    if (threat >= me.hp) return chance(0.75) ? 'protect' : 'attack';
    if ((turn < 3 || me.study < 6) && me.hp > me.hpMax * 0.5) return 'study';
    if (foe.def >= me.atk - 1 && !me.fx.tanuki && !me.fx.horn) return 'lewd';
    if (threat > myDmg + 3 && chance(0.4)) return 'protect';
    return chance(0.8) ? 'attack' : 'study';
  }

  const cardScore = f => f.hp + f.atk * 2 + f.def;

  function botDecide(B, s, req) {
    const T = B.teams[s], diff = B.difficulty;
    const live = T.cards.filter(c => !c.ko);
    const best = list => list.slice().sort((x, y) => cardScore(y) - cardScore(x))[0];
    if (req.kind === 'lead' || req.kind === 'replace') return (diff === 'easy' ? pick(live) : best(live)).idx;
    if (req.kind === 'item') {
      const items = req.items.map(n => ITEM_BY_NAME[n]);
      const k = diff === 'easy' ? rand(items.length) : items.reduce((bi, it, i) => (it.value > items[bi].value ? i : bi), 0);
      const it = items[k];
      let target = T.active;
      if (it.hp > 0) target = live.slice().sort((x, y) => x.hp / x.hpMax - y.hp / y.hpMax)[0].idx;
      if (T.cards[target].ko) target = live[0].idx;
      return { item: k, target };
    }
    // ação
    const me = front(B, s), foe = front(B, other(s));
    if (diff !== 'easy') {
      const bench = live.filter(c => c.idx !== T.active);
      const threat = previewDamage(foe, me);
      if (bench.length && me.hp <= threat && chance(diff === 'hard' ? 0.7 : 0.4)) {
        const b = bench.slice().sort((x, y) => y.hp - x.hp)[0];
        if (b.hp > me.hp) return `switch:${b.idx}`;
      }
    }
    return botAction(me, foe, B.turn, diff);
  }

  /* ---------- Serialização (online) ---------- */
  const ser = f => ({ name: f.name, atk: f.atk, def: f.def, study: f.study, hp: f.hp, hpMax: f.hpMax, lewdPower: f.lewdPower, items: [...f.items], fx: { ...f.fx }, ko: f.ko });
  const serState = B => Object.fromEntries(SIDES.map(s => [s, { active: B.teams[s].active, cards: B.teams[s].cards.map(ser) }]));

  /* ============================================================
     INTERFACE
     ============================================================ */
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const SECTION_HTML = `
  <div class="wa-battle" id="waBattle">
    <div class="panel wa-setup" id="waSetup">
      <div class="panel-title"><span class="bar yellow"></span> BATALHA <span class="arena-beta">PROTÓTIPO</span></div>
      <p class="wa-lead">Monte um time de <b>${RULES.teamSize} cartas</b> do seu harém e distribua os ${RULES.points} pontos do <b>$sk</b> de cada uma. Na luta, uma carta fica na frente e as outras no banco (recuperando +${RULES.benchHeal}💗 por turno). As regras seguem a Waifuarena do Mudae; o que a wiki não explica está marcado como <b>provisório</b>.</p>

      <div class="wa-setup-grid">
        <div>
          <div class="field">
            <label>MODO</label>
            <div class="wa-diff" id="waMode">
              <button type="button" class="gender-btn active" data-mode="bot">Contra bot</button>
              <button type="button" class="gender-btn" data-mode="online">Online (sala)</button>
            </div>
          </div>
          <p class="wa-online" id="waOnline" hidden></p>
          <div class="field" id="waDiffField">
            <label>DIFICULDADE DO BOT</label>
            <div class="wa-diff" id="waDiff">
              ${Object.entries(DIFFICULTIES).map(([k, d]) => `<button type="button" class="gender-btn${k === 'normal' ? ' active' : ''}" data-diff="${k}" title="${d.desc}">${d.label}</button>`).join('')}
            </div>
            <p class="wa-diff-desc" id="waDiffDesc">${DIFFICULTIES.normal.desc}</p>
          </div>
          <div class="field">
            <label>SEU TIME</label>
            <div class="wa-team" id="waTeam"></div>
          </div>
          <div class="field">
            <label for="waChar">CARTA DO SLOT <span id="waSlotN">1</span></label>
            <select id="waChar"></select>
          </div>
        </div>

        <div>
          <div class="field">
            <label>PONTOS DO $SK · <span id="waSkillOf"></span> <span class="wa-points" id="waPoints"></span></label>
            <div class="wa-skills" id="waSkills">
              ${SKILLS.map(([k, label, eff]) => `
                <div class="wa-skill">
                  <span class="wa-skill-name">${label}<small>${eff} <i>(provisório)</i></small></span>
                  <div class="wa-stepper">
                    <button type="button" data-skill="${k}" data-step="-1">−</button>
                    <b data-skill-val="${k}">0</b>
                    <button type="button" data-skill="${k}" data-step="1">+</button>
                  </div>
                </div>`).join('')}
            </div>
          </div>
          <div class="wa-preview" id="waPreview"></div>
        </div>
      </div>

      <button type="button" class="btn-add wa-start" id="waStart">INICIAR DUELO</button>
      <p class="wa-empty" id="waEmpty" hidden>Você precisa de pelo menos ${RULES.teamSize} personagens no tracker. Adicione ou importe pela aba PERSONAGENS.</p>
    </div>

    <div class="wa-board" id="waBoard" hidden>
      <div class="wa-field">
        <div class="wa-row wa-opp" id="waOpp"></div>
        <div class="wa-mid">
          <span class="wa-turn" id="waTurn">TURNO 1</span>
          <div class="wa-reveal">
            <span class="wa-pick" id="waPickOpp">?</span>
            <span class="wa-vs">VS</span>
            <span class="wa-pick" id="waPickMe">?</span>
          </div>
          <span class="wa-wait" id="waWait"></span>
        </div>
        <div class="wa-row wa-me" id="waMe"></div>
        <div class="wa-actions" id="waActions">
          ${Object.entries(ACTIONS).map(([k, a]) => `<button type="button" class="wa-act wa-act-${k}" data-act="${k}"><span class="wa-act-ico">${a.ico}</span><b>${a.label}</b><small>${a.hint}</small></button>`).join('')}
          <button type="button" class="wa-act wa-act-switch" data-act="switch"><span class="wa-act-ico">${SWITCH_ICO}</span><b>TROCAR</b><small>Escolha uma carta do banco</small></button>
        </div>
        <div class="wa-overlay" id="waOverlay" hidden></div>
        <div class="wa-end" id="waEnd" hidden></div>
      </div>
      <div class="wa-side">
        <div class="wa-side-head">
          <span>HISTÓRICO</span>
          <button type="button" class="pill red" id="waQuit">DESISTIR</button>
        </div>
        <ul class="wa-log" id="waLog"></ul>
      </div>
    </div>
  </div>`;

  let $ = null;
  let B = null;               // duelo atual
  let difficulty = 'normal';
  let busy = false;           // repetindo um pacote na tela
  let pendingMine = null;     // decisão minha em aberto { req, resolve }
  let switchMode = false;     // escolhendo a carta do banco para trocar

  /* ---------- Personagens do tracker ---------- */
  const characters = () => (typeof state !== 'undefined' && Array.isArray(state.characters) ? state.characters : [])
    .filter(c => c.claimed !== false)
    .sort((a, b) => (Number(b.kakera) || 0) - (Number(a.kakera) || 0));
  const findChar = id => characters().find(c => String(c.id) === String(id));
  const defaultSkills = () => ({ yandere: 1, tsundere: 1, kuudere: 1, dandere: 1, deredere: 1 });
  const skillTotal = s => Object.values(s).reduce((t, v) => t + v, 0);
  const savedSkills = c => (c && c.arenaSkills && skillTotal(c.arenaSkills) === RULES.points ? { ...defaultSkills(), ...c.arenaSkills } : defaultSkills());

  /* ---------- Carta (mesmo visual das cartas com efeitos) ---------- */
  // card-effects.js declara MudaeCardEffects com "const" (não fica em window)
  const cardFx = () => (typeof MudaeCardEffects !== 'undefined' ? MudaeCardEffects : null);
  /* links http:// não carregam num site https: tenta a versão segura */
  const photoUrl = src => (typeof src === 'string' ? src.trim().replace(/^http:\/\//i, 'https://') : '');

  function cardData(c) {
    const CE = cardFx();
    const op = typeof getOpStatus === 'function' ? getOpStatus(c) : { any: false, maxed: false };
    const roletas = typeof normalizeCharacterGenders === 'function' ? normalizeCharacterGenders(c.genders) : [];
    return {
      ...CE.DEFAULT_VISUAL, ...CE.readConfig(c.cardStyle).config,
      name: c.name || '', series: c.series && c.series !== '—' ? c.series : '', img: photoUrl(c.photo),
      kakera: Number(c.kakera) || 0, keys: Number(c.keys) || 0, op: op.maxed ? 'max' : op.any ? 'some' : 'none', roletas,
    };
  }

  function cardHost(c) {
    const CE = cardFx();
    if (CE && CE.createCardHost) {
      const host = CE.createCardHost(cardData(c));
      host.title = 'Clique para ver a carta em 3D';
      host.addEventListener('click', ev => {
        if (host.closest('.wa-bench-card.pickable')) return; // no banco, o clique serve para trocar
        ev.stopPropagation();
        CE.openViewer(cardData(c), { title: c.name, desc: c.series && c.series !== '—' ? c.series : '' });
      });
      return host;
    }
    const el = document.createElement('div');
    el.className = 'wa-card-fallback';
    el.innerHTML = `<span>${esc(c.name)}</span>`;
    return el;
  }

  /* Diz por que a foto de uma carta não aparece (sem foto ou link que não abre aqui) */
  function describePhoto(src) {
    if (src.startsWith('data:')) return `arquivo enviado pelo tracker, ${Math.round(src.length / 1024)} KB`;
    try { return `link de ${new URL(src).host}`; } catch (err) { return 'link inválido'; }
  }
  function checkPhoto(f, wrap, mine) {
    const note = (short, long) => {
      const el = document.createElement('div');
      el.className = 'wa-photo-note';
      el.textContent = short;
      el.title = long;
      wrap.appendChild(el);
      addLog(`⚠️ ${esc(long)}`, 'fx');
      console.warn('[Waifu Arena]', long, f.char && f.char.photo ? String(f.char.photo).slice(0, 200) : '(sem foto)');
    };
    const src = photoUrl(f.char && f.char.photo);
    if (!src) return note('SEM FOTO', mine ? `${f.name} não tem foto no seu tracker.` : `${f.name} não tem foto no tracker do rival. Ele precisa adicionar a foto lá.`);
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => note('FOTO NÃO CARREGOU', `A foto de ${f.name} não abriu neste navegador (${describePhoto(src)}).${mine ? '' : ' O link pode ter expirado ou só funcionar para o rival.'}`);
    img.src = src;
  }

  /* ============================================================
     PREPARAÇÃO (time de 3)
     ============================================================ */
  const setup = { slots: [], current: 0 };   // slots: [{ id, skills }]

  function fillCharacters() {
    const list = characters();
    $.empty.hidden = list.length >= RULES.teamSize;
    // mantém os slots válidos; completa com os de maior kakera
    const ids = setup.slots.map(s => s.id).filter(id => findChar(id));
    setup.slots = [...new Set(ids)].map(id => ({ id, skills: setup.slots.find(s => s.id === id).skills }));
    for (const c of list) {
      if (setup.slots.length >= RULES.teamSize) break;
      if (!setup.slots.some(s => String(s.id) === String(c.id))) setup.slots.push({ id: c.id, skills: savedSkills(c) });
    }
    setup.current = Math.min(setup.current, Math.max(0, setup.slots.length - 1));
    $.char.innerHTML = list.map(c => `<option value="${esc(c.id)}">${esc(c.name)} · ◈ ${Number(c.kakera) || 0}</option>`).join('');
    renderSetup();
  }

  function renderSetup() {
    const cur = setup.slots[setup.current];
    $.team.innerHTML = Array.from({ length: RULES.teamSize }, (_, i) => {
      const s = setup.slots[i];
      const c = s && findChar(s.id);
      const ok = s && skillTotal(s.skills) === RULES.points;
      return `<button type="button" class="wa-slot${i === setup.current ? ' active' : ''}${ok ? '' : ' warn'}" data-slot="${i}">
        <span class="wa-slot-n">${i + 1}</span>
        <span class="wa-slot-body"><b>${c ? esc(c.name) : 'Vazio'}</b><small>${s ? `${skillTotal(s.skills)}/${RULES.points} pontos` : 'escolha uma carta'}</small></span>
      </button>`;
    }).join('');
    $.slotN.textContent = setup.current + 1;
    if (cur) $.char.value = cur.id;
    const c = cur && findChar(cur.id);
    $.skillOf.textContent = c ? c.name.toUpperCase() : '';
    const skills = cur ? cur.skills : defaultSkills();
    for (const [k] of SKILLS) $.skills.querySelector(`[data-skill-val="${k}"]`).textContent = skills[k];
    const total = skillTotal(skills);
    $.points.textContent = `${total}/${RULES.points}`;
    $.points.classList.toggle('ok', total === RULES.points);
    if (c) {
      const f = makeFighter(c, skills, 'host', 0);
      $.preview.innerHTML = `<span>Na luta:</span> <b>${f.atk}</b>⚔️ <b>${f.def}</b>🛡️ <b>${f.study}</b>📔 <b>${f.hp}</b>💗 <b>${f.lewdPower}</b>🍓`;
    } else $.preview.innerHTML = '';
    refreshStart();
  }

  const teamReady = () => setup.slots.length === RULES.teamSize && setup.slots.every(s => findChar(s.id) && skillTotal(s.skills) === RULES.points);

  async function saveTeamSkills() {
    for (const s of setup.slots) {
      const idx = state.characters.findIndex(ch => String(ch.id) === String(s.id));
      if (idx === -1) continue;
      const updated = { ...state.characters[idx], arenaSkills: { ...s.skills } };
      state.characters[idx] = updated;
      try { await Database.updateCharacter(updated); } catch (err) { console.error('Erro ao salvar os pontos do $sk:', err); }
    }
  }

  /* ============================================================
     TABULEIRO
     ============================================================ */
  const view = { hosts: { host: [], guest: [] }, active: { host: 0, guest: 0 } };
  const rowOf = s => (s === B.me ? $.me : $.opp);

  function rowHTML(s) {
    const mine = s === B.me;
    const tag = mine ? 'VOCÊ' : B.mode === 'online' ? 'RIVAL ONLINE' : `BOT · ${DIFFICULTIES[B.difficulty].label.toUpperCase()}`;
    return `
      <div class="wa-card-slot"></div>
      <div class="wa-info">
        <div class="wa-name"><span class="wa-name-txt"></span> <span class="wa-tag ${mine ? 'me' : 'opp'}">${tag}</span> <span class="wa-team-count"></span></div>
        <div class="wa-lp"><span class="wa-lp-label">💗</span><div class="wa-lp-bar"><i></i></div><b class="wa-lp-val"></b></div>
        <div class="wa-stats"></div>
        <div class="wa-flags"></div>
        <div class="wa-items"></div>
      </div>
      <div class="wa-bench"></div>`;
  }

  function mountBoard() {
    $.opp.innerHTML = rowHTML(other(B.me));
    $.me.innerHTML = rowHTML(B.me);
    $.log.innerHTML = '';
    $.end.hidden = true;
    $.overlay.hidden = true;
    $.pickOpp.textContent = '?';
    $.pickMe.textContent = '?';
    $.wait.textContent = '';
    for (const s of SIDES) {
      view.hosts[s] = B.teams[s].cards.map(f => {
        const wrap = document.createElement('div');
        wrap.className = 'wa-cardwrap';
        wrap.appendChild(cardHost(f.char));
        checkPhoto(f, wrap, s === B.me);
        return wrap;
      });
      view.active[s] = B.teams[s].active;
    }
    renderBoard();
  }

  const FLAG_LABELS = {
    horn: '🦏 Ogro no próximo ⚔️', tanuki: '🦝 +15 no próximo ⚔️', clone: '👥 +50% no próximo ⚔️', sharingan: '👁️ Sharingan',
    doll: '🧸 Doll', figleaf: '🍃 Fig Leaf', saitama: '💪 +1⚔️/turno', stalker: '🕵️ Stalker', succubus: '😈 Succubus', tentacle: '🐙 Tentacle',
    doubleStudy: '📚 2 estudos no próximo 📔', lewdDouble: '👗 🍓 em dobro',
  };
  const lpLevel = pct => (pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low');

  function renderSide(s) {
    const row = rowOf(s);
    const T = B.teams[s];
    const act = view.active[s];
    const f = T.cards[act];
    // carta da frente
    const slot = row.querySelector('.wa-card-slot');
    if (slot.firstChild !== view.hosts[s][act]) { slot.innerHTML = ''; slot.appendChild(view.hosts[s][act]); }
    row.classList.toggle('ko', f.ko);
    row.querySelector('.wa-name-txt').textContent = f.name;
    row.querySelector('.wa-team-count').textContent = `· time ${alive(T).length}/${T.cards.length}`;
    const pct = Math.max(0, Math.min(100, (f.hp / f.hpMax) * 100));
    const bar = row.querySelector('.wa-lp-bar i');
    bar.style.width = pct + '%';
    bar.dataset.level = lpLevel(pct);
    row.querySelector('.wa-lp-val').textContent = `${f.hp} / ${f.hpMax}`;
    const dyn = f.fx.dynamax ? ' <span class="wa-dyn">DYNAMAX ×1,5</span>' : '';
    row.querySelector('.wa-stats').innerHTML =
      `<span title="Ataque">⚔️ <b>${f.atk}</b></span><span title="Defesa">🛡️ <b>${f.def}</b></span><span title="Estudo">📔 <b>${f.study}</b></span><span title="Força do lewd">🍓 <b>${f.lewdPower}</b></span>${dyn}`;
    const flags = Object.entries(FLAG_LABELS).filter(([k]) => f.fx[k]).map(([, t]) => `<span>${t}</span>`);
    if (f.fx.future) flags.push(`<span>🔮 +${f.fx.future}📔 no próximo item</span>`);
    row.querySelector('.wa-flags').innerHTML = flags.join('');
    row.querySelector('.wa-items').innerHTML = itemsHTML(f);
    // banco
    const bench = row.querySelector('.wa-bench');
    bench.innerHTML = '';
    T.cards.forEach((c, i) => {
      if (i === act) return;
      const el = document.createElement('div');
      const canPick = s === B.me && switchMode && !c.ko;
      el.className = `wa-bench-card${c.ko ? ' ko' : ''}${canPick ? ' pickable' : ''}`;
      el.dataset.idx = i;
      const p = Math.max(0, Math.min(100, (c.hp / c.hpMax) * 100));
      el.appendChild(view.hosts[s][i]);
      el.insertAdjacentHTML('beforeend', `
        <div class="wa-bench-info">
          <b>${esc(c.name)}</b>
          <div class="wa-lp-bar mini"><i style="width:${p}%" data-level="${lpLevel(p)}"></i></div>
          <span>${c.ko ? 'NOCAUTEADA' : `${c.hp}/${c.hpMax}💗 · ⚔️${c.atk} 🛡️${c.def} 📔${c.study}`}</span>
          ${c.items.length ? `<span class="wa-bench-items" title="${esc(c.items.join(', '))}">📦 ${c.items.length} ${c.items.length > 1 ? 'itens' : 'item'}</span>` : ''}
        </div>`);
      bench.appendChild(el);
    });
  }

  function itemsHTML(f) {
    if (!f.items.length) return '<em>Sem itens</em>';
    return f.items.map(n => {
      const it = ITEM_BY_NAME[n];
      const tip = it ? [itemSummary(it), it.note].filter(Boolean).join(' · ') : 'Item especial';
      return `<span title="${esc(tip)}">${esc(n)}</span>`;
    }).join('');
  }

  function renderBoard() {
    renderSide(B.me);
    renderSide(other(B.me));
    $.turn.textContent = `TURNO ${B.turn + 1}`;
    const T = B.teams[B.me];
    const canSwitch = alive(T).some(c => c.idx !== T.active);
    $.actions.querySelector('[data-act="switch"]').disabled = !canSwitch;
    $.actions.classList.toggle('switching', switchMode);
  }

  function addLog(html, kind = '', s = null) {
    const li = document.createElement('li');
    li.className = `wa-log-${kind}${s ? (s === B.me ? ' me' : ' opp') : ''}`;
    li.innerHTML = html;
    $.log.prepend(li);
  }

  /* número/rótulo que sobe em cima de uma carta (na frente ou no banco) */
  function popOn(s, idx, text, kind) {
    const wrap = view.hosts[s] && view.hosts[s][idx];
    const box = wrap && (wrap.closest('.wa-card-slot, .wa-bench-card') || wrap);
    if (!box) return;
    const el = document.createElement('span');
    el.className = `wa-pop wa-pop-${kind}`;
    el.textContent = text;
    el.style.left = `${30 + Math.random() * 40}%`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function animAttack(ev) {
    const src = rowOf(ev.side).querySelector('.wa-card-slot');
    const tgt = rowOf(ev.tside).querySelector('.wa-card-slot');
    src.classList.remove('lunge'); void src.offsetWidth; src.classList.add('lunge');
    setTimeout(() => {
      tgt.classList.remove('hit'); void tgt.offsetWidth; tgt.classList.add('hit');
      popOn(ev.tside, ev.tidx, `−${ev.dmg}`, 'dmg');
    }, 260);
  }

  /* ---------- Pacotes (o que os dois veem) ---------- */
  function ingestState(st) {
    if (!st) return;
    for (const s of SIDES) {
      if (!st[s]) continue;
      const T = B.teams[s];
      T.active = Number(st[s].active) || 0;
      st[s].cards.forEach((d, i) => { if (T.cards[i]) Object.assign(T.cards[i], d, { name: T.cards[i].name, side: s, idx: i }); });
    }
  }

  const safeHtml = html => esc(html).replace(/&lt;(\/?)b&gt;/g, '<$1b>');

  async function replay(pkg) {
    busy = true;
    $.wait.textContent = '';
    $.actions.classList.add('locked');
    if (pkg.picks) {
      $.pickMe.textContent = actionIco(pkg.picks[B.me]);
      $.pickMe.classList.add('show');
      await sleep(250);
      $.pickOpp.textContent = actionIco(pkg.picks[other(B.me)]);
      $.pickOpp.classList.add('show');
      await sleep(450);
    }
    for (const ev of pkg.events || []) {
      const html = B.role === 'guest' ? safeHtml(ev.html || '') : ev.html;
      if (ev.e === 'log') addLog(html, ev.kind, ev.side);
      if (ev.e === 'pop') popOn(ev.side, ev.idx, String(ev.text), ev.kind);
      if (ev.e === 'atk') animAttack(ev);
      if (ev.e === 'sw') { await sleep(350); view.active[ev.side] = ev.to; renderSide(ev.side); }
      if (ev.e === 'ko') { view.hosts[ev.side][ev.idx].classList.add('ko-flash'); }
    }
    if (pkg.turn !== undefined) B.turn = pkg.turn;
    ingestState(pkg.state);
    for (const s of SIDES) view.active[s] = B.teams[s].active;
    renderBoard();
    if (pkg.picks) {
      await sleep(650);
      $.pickMe.classList.remove('show');
      $.pickOpp.classList.remove('show');
      $.pickMe.textContent = '?';
      $.pickOpp.textContent = '?';
    }
    if (pkg.result) endBattle(pkg.result === 'draw' ? 'draw' : pkg.result === B.me ? 'win' : 'lose');
    busy = false;
    $.actions.classList.remove('locked');
  }

  /* ---------- Minhas decisões (ação, carta da frente, item) ---------- */
  function askMe(req) {
    return new Promise(resolve => {
      pendingMine = { req, resolve };
      $.wait.textContent = '';
      if (req.kind === 'action') {
        switchMode = false;
        $.actions.classList.add('waiting-me');
        renderBoard();
      } else {
        showOverlay(req);
      }
    });
  }

  function answerMine(value) {
    if (!pendingMine) return;
    const { req, resolve } = pendingMine;
    pendingMine = null;
    switchMode = false;
    $.actions.classList.remove('waiting-me');
    $.overlay.hidden = true;
    if (req.kind === 'action') {
      $.pickMe.textContent = actionIco(value);
      $.pickMe.classList.add('show');
      if ($.pickOpp.textContent === '?') $.pickOpp.textContent = B.mode === 'online' ? '⏳' : '…';
    }
    if (B.mode === 'online') {
      $.wait.textContent = 'Aguardando o rival…';
      if (req.kind === 'action' && B.role === 'host') NET().sendTo(B.guestPeer, { t: 'duel-picked' });
    }
    renderBoard();
    resolve(value);
  }

  function cardChoiceHTML(c, i, extra = '') {
    return `<button type="button" class="wa-choice" data-choice="${i}" ${c.ko ? 'disabled' : ''}>
      <b>${esc(c.name)}</b>
      <span>${c.ko ? 'NOCAUTEADA' : `${c.hp}/${c.hpMax}💗 · ⚔️${c.atk} 🛡️${c.def} 📔${c.study}`}</span>${extra}
    </button>`;
  }

  function showOverlay(req) {
    const T = B.teams[B.me];
    let html = '';
    if (req.kind === 'lead' || req.kind === 'replace') {
      const title = req.kind === 'lead' ? 'Quem começa na frente?' : `${esc(T.cards[T.active].name)} foi nocauteada. Quem entra?`;
      html = `<div class="wa-ov-box"><h3>${title}</h3>
        <div class="wa-choices">${T.cards.map((c, i) => (req.kind === 'replace' && i === T.active ? '' : cardChoiceHTML(c, i))).join('')}</div></div>`;
    }
    if (req.kind === 'item') {
      const items = req.items.map(n => ITEM_BY_NAME[n]).filter(Boolean);
      html = `<div class="wa-ov-box wide"><h3>📔 ${items.length > 1 ? `Escolha 1 de ${items.length} itens` : 'Item encontrado'}</h3>
        <p class="wa-ov-sub">Depois escolha qual carta do time recebe o item. Combinações só valem com os itens na mesma carta.</p>
        <div class="wa-offers">${items.map((it, i) => `
          <button type="button" class="wa-offer${i === 0 ? ' sel' : ''}" data-item="${i}">
            <b>${esc(it.name)}</b><span>${itemSummary(it) || '—'}</span>${it.note ? `<small>${esc(it.note)}</small>` : ''}
          </button>`).join('')}</div>
        <p class="wa-ov-label">PARA QUAL CARTA?</p>
        <div class="wa-choices">${T.cards.map((c, i) => cardChoiceHTML(c, i, i === T.active ? '<em>NA FRENTE</em>' : '<em>NO BANCO</em>')).join('')}</div></div>`;
    }
    $.overlay.innerHTML = html;
    $.overlay.hidden = false;
    $.overlay.dataset.kind = req.kind;
    $.overlay.dataset.pickItem = '0';
  }

  /* ---------- Quem decide o quê ---------- */
  let reqSeq = 0;
  const remotePending = new Map();

  function decide(s, req) {
    if (s === B.me) return askMe(req);
    if (B.mode === 'bot') return sleep(250).then(() => botDecide(B, s, req));
    // online: pede ao convidado
    return new Promise(resolve => {
      const id = ++reqSeq;
      remotePending.set(id, { req, resolve });
      NET().sendTo(B.guestPeer, { t: 'duel-req', id, req });
    });
  }

  function validInput(req, v, s) {
    const T = B.teams[s];
    const okIdx = i => Number.isInteger(i) && T.cards[i] && !T.cards[i].ko;
    if (req.kind === 'action') {
      if (ACTIONS[v]) return v;
      const m = /^switch:(\d)$/.exec(String(v));
      if (m && okIdx(Number(m[1])) && Number(m[1]) !== T.active) return v;
      return 'protect';
    }
    if (req.kind === 'lead' || req.kind === 'replace') return okIdx(Number(v)) ? Number(v) : alive(T)[0].idx;
    if (req.kind === 'item') {
      const item = Number(v && v.item), target = Number(v && v.target);
      return { item: Number.isInteger(item) && item >= 0 && item < req.items.length ? item : 0, target: okIdx(target) ? target : T.active };
    }
    return v;
  }

  /* envia o pacote ao convidado (online) e mostra aqui */
  async function publish(pkg) {
    pkg.state = serState(B);
    pkg.turn = B.turn;
    if (B.mode === 'online') NET().sendTo(B.guestPeer, { t: 'duel-pkg', pkg });
    await replay(pkg);
  }

  /* ---------- Laço do duelo (bot local ou anfitrião online) ---------- */
  async function runDuel(D) {
    const live = () => B === D && !D.over;
    const events = [];
    D.events = events;

    // quem começa na frente
    const leads = await Promise.all(SIDES.map(s => decide(s, { kind: 'lead' })));
    if (!live()) return;
    SIDES.forEach((s, k) => { D.teams[s].active = validInput({ kind: 'lead' }, leads[k], s); });
    events.length = 0;
    D.log(`${front(D, 'host').name} e ${front(D, 'guest').name} entram na frente!`, 'turn');
    await publish({ events: events.splice(0) });

    while (live()) {
      const acts = await Promise.all(SIDES.map(s => decide(s, { kind: 'action' })));
      if (!live()) return;
      const picks = { host: validInput({ kind: 'action' }, acts[0], 'host'), guest: validInput({ kind: 'action' }, acts[1], 'guest') };
      const offers = resolveTurn(D, picks);
      let result = checkKOs(D);
      await publish({ events: events.splice(0), picks });
      if (result) { D.over = true; return publish({ events: [], result }); }

      // itens (cada lado escolhe os seus, ao mesmo tempo)
      if (offers.host.length || offers.guest.length) {
        await Promise.all(SIDES.map(async s => {
          for (const names of offers[s]) {
            const choice = await decide(s, { kind: 'item', items: names });
            if (!live()) return;
            applyItemChoice(D, s, names, validInput({ kind: 'item', items: names }, choice, s));
          }
        }));
        if (!live()) return;
      }

      benchHeal(D);
      result = checkKOs(D);
      await publish({ events: events.splice(0) });
      if (result) { D.over = true; return publish({ events: [], result }); }

      // carta da frente nocauteada: o dono escolhe quem entra
      const need = SIDES.filter(s => front(D, s).ko);
      if (need.length) {
        const reps = await Promise.all(need.map(s => decide(s, { kind: 'replace' })));
        if (!live()) return;
        need.forEach((s, k) => {
          const to = validInput({ kind: 'replace' }, reps[k], s);
          const T = D.teams[s];
          const from = T.active;
          T.active = to;
          D.ev({ e: 'sw', side: s, from, to });
          D.log(`<b>${T.cards[to].name}</b> entra na frente.`, 'switch', T.cards[to]);
        });
        await publish({ events: events.splice(0) });
      }
    }
  }

  function newDuel({ mode, me, hostTeam, guestTeam, diff = 'normal', guestPeer = null }) {
    const hpBot = mode === 'bot' ? DIFFICULTIES[diff].hp : 1;
    const D = {
      mode, role: me === 'host' ? 'host' : 'guest', me, difficulty: diff, guestPeer, turn: 0, over: false, events: [],
      teams: {
        host: { active: 0, cards: hostTeam.map((m, i) => makeFighter(m.char, m.skills, 'host', i)) },
        guest: { active: 0, cards: guestTeam.map((m, i) => makeFighter(m.char, m.skills, 'guest', i, hpBot)) },
      },
    };
    const sideOf = f => (f ? f.side : null);
    D.ev = e => D.events.push(e);
    D.log = (html, kind, f) => D.events.push({ e: 'log', html, kind, side: sideOf(f) });
    D.pop = (f, text, kind) => D.events.push({ e: 'pop', side: f.side, idx: f.idx, text, kind });
    return D;
  }

  function botTeam(myIds) {
    const pool = characters().filter(c => !myIds.includes(String(c.id)));
    const team = [];
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    for (const c of shuffled) { if (team.length >= RULES.teamSize) break; team.push(c); }
    const mine = myIds.map(findChar).filter(Boolean);
    let k = 0;
    while (team.length < RULES.teamSize && mine.length) { const c = mine[k++ % mine.length]; team.push({ ...c, name: `Sombra de ${c.name}` }); }
    const keys = SKILLS.map(([key]) => key);
    const PRESETS = [[2, 1, 0, 2, 0], [1, 1, 1, 1, 1], [2, 0, 1, 1, 1], [1, 2, 0, 2, 0], [3, 0, 0, 2, 0], [1, 1, 2, 1, 0]];
    return team.map(c => {
      let skills;
      if (difficulty === 'easy') { skills = Object.fromEntries(keys.map(x => [x, 0])); for (let i = 0; i < RULES.points; i++) skills[pick(keys)]++; }
      else { const p = pick(PRESETS); skills = Object.fromEntries(keys.map((x, i) => [x, p[i]])); }
      return { char: c, skills };
    });
  }

  function enterBoard(intro) {
    $.setup.hidden = true;
    $.board.hidden = false;
    mountBoard();
    addLog(intro, 'turn');
    $.board.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function endBattle(result) {
    if (!B) return;
    B.over = true;
    pendingMine = null;
    $.overlay.hidden = true;
    $.wait.textContent = '';
    const t = {
      win: ['VITÓRIA', `Seu time venceu em ${B.turn} turnos!`],
      lose: ['DERROTA', `O time rival venceu em ${B.turn} turnos.`],
      draw: ['EMPATE', 'Os dois times caíram ao mesmo tempo.'],
      lost: ['CONEXÃO PERDIDA', 'O rival saiu da sala.'],
    }[result];
    addLog(`<b>${t[0]}</b> — ${esc(t[1])}`, 'end');
    $.end.className = `wa-end ${result === 'lost' ? 'draw' : result}`;
    $.end.innerHTML = `<div class="wa-end-box"><h2>${t[0]}</h2><p>${esc(t[1])}</p>
      <div class="wa-end-actions"><button type="button" class="btn-add" data-end="again">REVANCHE</button><button type="button" class="pill cyan" data-end="back">VOLTAR</button></div></div>`;
    $.end.hidden = false;
  }

  function showSetup() {
    B = null;
    pendingMine = null;
    $.board.hidden = true;
    $.setup.hidden = false;
    fillCharacters();
    onlineStatus();
  }

  async function startBattle() {
    if (!teamReady()) return;
    await saveTeamSkills();
    const myTeam = setup.slots.map(s => ({ char: findChar(s.id), skills: { ...s.skills } }));
    if (mode === 'online') return readyOnline(myTeam);
    B = newDuel({ mode: 'bot', me: 'host', hostTeam: myTeam, guestTeam: botTeam(setup.slots.map(s => String(s.id))), diff: difficulty });
    enterBoard(`<b>Duelo!</b> Seu time contra o time do bot (${DIFFICULTIES[difficulty].label}). Nocauteie as ${RULES.teamSize} cartas do rival para vencer.`);
    runDuel(B);
  }

  /* ============================================================
     ONLINE (sala do waifuarena.js)
     ============================================================ */
  const NET = () => window.WaifuArenaNet || null;
  let mode = 'bot';
  let waiting = false;
  let rival = { ready: false, name: '' };
  let lastReady = null;                 // meu time (para a revanche)
  const lobby = { host: null, guest: null };

  const cleanText = (s, n = 60) => String(s == null ? '' : s).replace(/[<>&"]/g, '').slice(0, n);
  function cardPayload(c) {
    return { id: c.id, name: c.name, series: c.series, photo: c.photo, kakera: c.kakera, keys: c.keys, opLevels: c.opLevels, genders: c.genders, cardStyle: c.cardStyle };
  }
  function cleanPayload(p) {
    if (!p || typeof p !== 'object') return null;
    return {
      id: cleanText(p.id, 40), name: cleanText(p.name) || 'Carta', series: cleanText(p.series),
      photo: typeof p.photo === 'string' ? p.photo : '', kakera: Number(p.kakera) || 0, keys: Number(p.keys) || 0,
      opLevels: p.opLevels && typeof p.opLevels === 'object' ? p.opLevels : {}, genders: Array.isArray(p.genders) ? p.genders : [],
      cardStyle: p.cardStyle && typeof p.cardStyle === 'object' ? p.cardStyle : null,
    };
  }
  function cleanSkills(s) {
    if (!s || typeof s !== 'object') return null;
    const out = Object.fromEntries(SKILLS.map(([k]) => [k, Number(s[k])]));
    const ok = Object.values(out).every(v => Number.isInteger(v) && v >= 0) && skillTotal(out) === RULES.points;
    return ok ? out : null;
  }
  function cleanTeam(team) {
    if (!Array.isArray(team) || team.length !== RULES.teamSize) return null;
    const out = team.map(m => ({ char: cleanPayload(m && m.char), skills: cleanSkills(m && m.skills) }));
    return out.every(m => m.char && m.skills) ? out : null;
  }

  function inRoom() {
    const net = NET();
    return !!(net && net.role() && net.players().length >= 2);
  }

  function refreshStart() {
    const base = teamReady();
    if (mode === 'bot') {
      $.start.textContent = 'INICIAR DUELO';
      $.start.disabled = !base;
    } else {
      $.start.textContent = waiting ? 'AGUARDANDO O RIVAL…' : 'ESTOU PRONTO';
      $.start.disabled = !base || waiting || !inRoom();
    }
  }

  function onlineStatus() {
    if (!$) return;
    $.online.hidden = mode !== 'online';
    if (mode !== 'online') return refreshStart();
    const net = NET();
    let text;
    if (!net || !net.role()) text = 'Crie ou entre numa sala no painel <b>SALA</b>, mais abaixo, e chame outro jogador.';
    else if (net.players().length < 2) text = 'Sala aberta. Aguardando outro jogador entrar…';
    else {
      const r = rival.ready ? `<b>${esc(rival.name || 'O rival')}</b> está pronto ✔` : 'O rival ainda está montando o time.';
      text = `${waiting ? 'Você está pronto. ' : 'Monte seu time e clique em <b>ESTOU PRONTO</b>. '}${r}`;
    }
    $.online.innerHTML = text;
    refreshStart();
  }

  function setMode(m) {
    mode = m;
    $.mode.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    $.diffField.hidden = m !== 'bot';
    if (m === 'bot' && waiting) cancelReady();
    onlineStatus();
  }

  function readyOnline(team) {
    lastReady = team.map(m => ({ char: cardPayload(m.char), skills: m.skills }));
    sendReady();
  }

  function sendReady() {
    const net = NET();
    if (!lastReady || !inRoom()) return onlineStatus();
    waiting = true;
    if (net.role() === 'host') {
      lobby.host = { team: lastReady, name: net.name() };
      hostLobbyChanged();
    } else {
      net.sendToHost({ t: 'duel-ready', team: lastReady });
    }
    onlineStatus();
  }

  function cancelReady() {
    waiting = false;
    const net = NET();
    if (net && net.role() === 'host') { lobby.host = null; hostLobbyChanged(); }
    else if (net && net.role()) net.sendToHost({ t: 'duel-unready' });
  }

  function hostLobbyChanged() {
    const net = NET();
    net.broadcast({ t: 'duel-lobby', hostReady: !!lobby.host, hostName: net.name() });
    rival = { ready: !!lobby.guest, name: lobby.guest ? lobby.guest.name : '' };
    onlineStatus();
    if (lobby.host && lobby.guest && !(B && !B.over)) hostStartDuel();
  }

  function hostStartDuel() {
    const net = NET();
    const h = lobby.host, g = lobby.guest;
    lobby.host = lobby.guest = null;
    waiting = false;
    rival = { ready: false, name: '' };
    B = newDuel({ mode: 'online', me: 'host', hostTeam: h.team.map(m => ({ char: cleanPayload(m.char), skills: m.skills })), guestTeam: g.team, guestPeer: g.peer });
    net.sendTo(g.peer, {
      t: 'duel-start',
      teams: { host: B.teams.host.cards.map(f => f.char), guest: B.teams.guest.cards.map(f => f.char) },
      state: serState(B),
    });
    enterBoard(`<b>Duelo online!</b> Seu time contra o time de ${esc(g.name)}. As escolhas são reveladas juntas.`);
    runDuel(B);
  }

  function guestStartDuel(msg) {
    const teams = msg.teams || {};
    const hc = Array.isArray(teams.host) ? teams.host.map(cleanPayload) : [];
    const gc = Array.isArray(teams.guest) ? teams.guest.map(cleanPayload) : [];
    if (hc.length !== RULES.teamSize || gc.length !== RULES.teamSize || hc.some(c => !c) || gc.some(c => !c)) return;
    waiting = false;
    rival = { ready: false, name: '' };
    B = newDuel({ mode: 'online', me: 'guest', hostTeam: hc.map(char => ({ char, skills: {} })), guestTeam: gc.map(char => ({ char, skills: {} })) });
    ingestState(msg.state);
    enterBoard('<b>Duelo online!</b> Seu time contra o time do anfitrião. As escolhas são reveladas juntas.');
  }

  /* fila de pacotes no convidado (repetidos em ordem) */
  let guestQueue = Promise.resolve();

  function quitOnline() {
    const net = NET();
    if (B.role === 'host') net.sendTo(B.guestPeer, { t: 'duel-quit' });
    else net.sendToHost({ t: 'duel-quit' });
    endBattle('lose');
    addLog('Você desistiu.', 'end');
  }

  function onNet(msg, meta) {
    const net = NET();
    const role = net && net.role();
    switch (msg.t) {
      case 'net-players': onlineStatus(); break;
      case 'net-left':
        waiting = false;
        rival = { ready: false, name: '' };
        lobby.host = lobby.guest = null;
        if (B && B.mode === 'online' && !B.over) endBattle('lost');
        onlineStatus();
        break;
      case 'net-drop':
        if (lobby.guest && lobby.guest.peer === meta.from) { lobby.guest = null; hostLobbyChanged(); }
        if (B && B.mode === 'online' && B.role === 'host' && !B.over && B.guestPeer === meta.from) endBattle('lost');
        break;
      // ---- no anfitrião ----
      case 'duel-ready': {
        if (role !== 'host') break;
        const busyNow = (B && B.mode === 'online' && !B.over) || (lobby.guest && lobby.guest.peer !== meta.from);
        if (busyNow) { net.sendTo(meta.from, { t: 'duel-busy' }); break; }
        const team = cleanTeam(msg.team);
        if (!team) break;
        lobby.guest = { team, peer: meta.from, name: meta.name };
        hostLobbyChanged();
        break;
      }
      case 'duel-unready':
        if (role === 'host' && lobby.guest && lobby.guest.peer === meta.from) { lobby.guest = null; hostLobbyChanged(); }
        break;
      case 'duel-input': {
        if (role !== 'host' || !B || B.role !== 'host' || meta.from !== B.guestPeer) break;
        const p = remotePending.get(msg.id);
        if (!p) break;
        remotePending.delete(msg.id);
        if (p.req.kind === 'action' && !B.over) { $.pickOpp.textContent = '✔'; }
        p.resolve(validInput(p.req, msg.value, 'guest'));
        break;
      }
      // ---- no convidado ----
      case 'duel-lobby':
        if (role !== 'guest') break;
        rival = { ready: !!msg.hostReady, name: cleanText(msg.hostName) };
        onlineStatus();
        break;
      case 'duel-busy':
        waiting = false;
        onlineStatus();
        $.online.innerHTML = 'O anfitrião já está num duelo com outro jogador. Tente de novo quando acabar.';
        break;
      case 'duel-start':
        if (role === 'guest') guestStartDuel(msg);
        break;
      case 'duel-pkg':
        if (role === 'guest' && B && B.role === 'guest') { const pkg = msg.pkg || {}; guestQueue = guestQueue.then(() => replay(pkg)); }
        break;
      case 'duel-req':
        if (role === 'guest' && B && B.role === 'guest' && !B.over) {
          const req = msg.req || {};
          guestQueue = guestQueue.then(() => {
            if (!B || B.over) return;
            askMe(req).then(value => net.sendToHost({ t: 'duel-input', id: msg.id, value }));
          });
        }
        break;
      case 'duel-picked':
        if (role === 'guest' && B && !B.over && !busy) $.pickOpp.textContent = '✔';
        break;
      // ---- nos dois ----
      case 'duel-quit':
        if (B && B.mode === 'online' && !B.over) { addLog('O rival desistiu.', 'end'); endBattle('win'); }
        break;
    }
  }

  /* ============================================================
     MONTAGEM
     ============================================================ */
  function init() {
    const head = document.querySelector('#view-arena .page-head');
    if (!head || document.getElementById('waBattle')) return;
    head.insertAdjacentHTML('afterend', SECTION_HTML);

    const byId = id => document.getElementById(id);
    $ = {
      setup: byId('waSetup'), char: byId('waChar'), diff: byId('waDiff'), diffDesc: byId('waDiffDesc'), skills: byId('waSkills'),
      points: byId('waPoints'), preview: byId('waPreview'), start: byId('waStart'), empty: byId('waEmpty'),
      team: byId('waTeam'), slotN: byId('waSlotN'), skillOf: byId('waSkillOf'),
      board: byId('waBoard'), opp: byId('waOpp'), me: byId('waMe'), turn: byId('waTurn'), pickOpp: byId('waPickOpp'), pickMe: byId('waPickMe'),
      wait: byId('waWait'), actions: byId('waActions'), overlay: byId('waOverlay'), end: byId('waEnd'), log: byId('waLog'), quit: byId('waQuit'),
      mode: byId('waMode'), online: byId('waOnline'), diffField: byId('waDiffField'),
    };

    // preparação
    $.mode.addEventListener('click', ev => { const b = ev.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    $.diff.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-diff]');
      if (!btn) return;
      difficulty = btn.dataset.diff;
      $.diff.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('active', b === btn));
      $.diffDesc.textContent = DIFFICULTIES[difficulty].desc;
    });
    $.team.addEventListener('click', ev => {
      const b = ev.target.closest('[data-slot]');
      if (!b) return;
      setup.current = Number(b.dataset.slot);
      if (!setup.slots[setup.current]) {   // slot vazio: pega a primeira carta livre
        const free = characters().find(c => !setup.slots.some(s => String(s.id) === String(c.id)));
        if (free) setup.slots[setup.current] = { id: free.id, skills: savedSkills(free) };
      }
      renderSetup();
    });
    $.char.addEventListener('change', () => {
      if (waiting) cancelReady();
      const id = $.char.value;
      const c = findChar(id);
      if (!c) return;
      const other = setup.slots.findIndex((s, i) => i !== setup.current && String(s.id) === String(id));
      if (other !== -1) [setup.slots[other], setup.slots[setup.current]] = [setup.slots[setup.current], setup.slots[other]]; // já estava no time: troca de lugar
      else setup.slots[setup.current] = { id: c.id, skills: savedSkills(c) };
      renderSetup();
      onlineStatus();
    });
    $.skills.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-step]');
      const cur = setup.slots[setup.current];
      if (!btn || !cur) return;
      if (waiting) cancelReady();
      const k = btn.dataset.skill, step = Number(btn.dataset.step);
      const next = cur.skills[k] + step;
      if (next < 0 || (step > 0 && skillTotal(cur.skills) >= RULES.points)) return;
      cur.skills[k] = next;
      renderSetup();
      onlineStatus();
    });
    $.start.addEventListener('click', startBattle);

    // tabuleiro
    $.actions.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-act]');
      if (!btn || btn.disabled || !pendingMine || pendingMine.req.kind !== 'action' || busy) return;
      if (btn.dataset.act === 'switch') { switchMode = !switchMode; renderBoard(); return; }
      answerMine(btn.dataset.act);
    });
    $.me.addEventListener('click', ev => {
      const card = ev.target.closest('.wa-bench-card.pickable');
      if (!card || !pendingMine || pendingMine.req.kind !== 'action') return;
      ev.stopPropagation();
      answerMine(`switch:${card.dataset.idx}`);
    }, true);
    $.overlay.addEventListener('click', ev => {
      if (!pendingMine) return;
      const kind = pendingMine.req.kind;
      const offer = ev.target.closest('.wa-offer[data-item]');
      if (offer && kind === 'item') {
        $.overlay.dataset.pickItem = offer.dataset.item;
        $.overlay.querySelectorAll('[data-item]').forEach(o => o.classList.toggle('sel', o === offer));
        return;
      }
      const choice = ev.target.closest('[data-choice]');
      if (!choice || choice.disabled) return;
      const idx = Number(choice.dataset.choice);
      if (kind === 'item') answerMine({ item: Number($.overlay.dataset.pickItem) || 0, target: idx });
      else answerMine(idx);
    });
    $.end.addEventListener('click', ev => {
      const act = ev.target.closest('[data-end]')?.dataset.end;
      const wasOnline = B && B.mode === 'online';
      if (act === 'again') {
        if (wasOnline) { showSetup(); sendReady(); }
        else startBattle();
      }
      if (act === 'back') showSetup();
    });
    $.quit.addEventListener('click', () => {
      if (B && B.mode === 'online' && !B.over) quitOnline();
      else if (B && !B.over) { endBattle('lose'); addLog('Você desistiu.', 'end'); }
      else showSetup();
    });

    if (NET()) NET().on(onNet);
    // a lista de personagens só existe depois que o tracker carrega: atualiza ao abrir a aba
    document.querySelectorAll('.tab-btn[data-view="arena"]').forEach(btn => btn.addEventListener('click', () => { if (!B) fillCharacters(); }));
    setTimeout(() => { if (!B) fillCharacters(); }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // exposto para testes
  window.WaifuArenaBattle = { RULES, ITEMS, makeFighter, resolveTurn, checkKOs, benchHeal, botDecide, newDuel, applyItemChoice, front };
})();
