/* ============================================================
   WAIFUARENA-BATTLE.JS — Batalha local da Waifu Arena (protótipo)
   ------------------------------------------------------------
   Uma carta do seu harém contra um bot, por turnos, seguindo as
   regras da Waifuarena do Mudae (ver WAIFUARENA.md):
   - 4 reações por turno (⚔️ atacar, 🛡️ proteger, 📔 estudar, 🍓 lewd),
     escolhidas ao mesmo tempo e reveladas juntas;
   - 🛡️ reduz em 2 o dano recebido; 🍓 tira 1 de 🛡️, 📔 e 💗 do rival;
   - 📔 encontra itens (mais estudo = itens melhores), com os efeitos e
     combinações da tabela da wiki;
   - pontos do $sk (5) distribuídos entre os 5 atributos;
   - dificuldade como o $difficulty (Difícil = +20% de vida do bot).

   O que a wiki NÃO diz (o que cada atributo faz e a fórmula de dano)
   está em RULES, marcado como PROVISÓRIO, para ajustar depois dos
   testes no Discord.
   ============================================================ */
(() => {
  'use strict';

  /* ============================================================
     REGRAS (o que é PROVISÓRIO está marcado)
     ============================================================ */
  const RULES = {
    points: 5,                 // pontos do $sk (fórum da wiki: 5)
    protect: 2,                // 🛡️ reduz o dano em 2 (wiki)
    lewd: 1,                   // 🍓 tira 1 de 🛡️, 📔 e 💗 (wiki)
    // PROVISÓRIO: atributos base e o que cada ponto do $sk dá
    base: { atk: 3, def: 1, study: 1, hp: 20 },
    perPoint: { yandere: ['atk', 2], tsundere: ['def', 1], kuudere: ['study', 2], dandere: ['hp', 4] },
    deredereLewdEvery: 2,      // PROVISÓRIO: +1 de força do 🍓 a cada 2 pontos de Deredere
    // PROVISÓRIO: dano = ⚔️ do atacante − 🛡️ do alvo (mínimo 1); se o alvo protegeu, −2
    minDamage: 1,
    maxTurns: 80,
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
    study:   { ico: '📔', label: 'ESTUDAR',  hint: 'Encontra um item' },
    lewd:    { ico: '🍓', label: 'LEWD',     hint: `−${RULES.lewd} 🛡️ 📔 💗 do rival` },
  };

  /* ============================================================
     ITENS (tabela da wiki)
     [nome, ⚔️, 🛡️, 📔, 💗, efeito, descrição do efeito]
     Itens que só nascem de combinações (Hew DNA, Hewtwo, Bento,
     Bandage, Pro Lewd) não entram no sorteio.
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

  /* ============================================================
     MOTOR DA BATALHA
     ============================================================ */
  const rand = n => Math.floor(Math.random() * n);
  const chance = p => Math.random() < p;
  const pick = list => list[rand(list.length)];

  function makeFighter(c, skills, isBot, hpMult = 1) {
    const s = { yandere: 0, tsundere: 0, kuudere: 0, dandere: 0, deredere: 0, ...skills };
    const f = {
      char: c, name: c.name, bot: isBot, skills: s,
      atk: RULES.base.atk, def: RULES.base.def, study: RULES.base.study, hp: RULES.base.hp,
      lewdPower: RULES.lewd + Math.floor(s.deredere / RULES.deredereLewdEvery),
      items: [], combos: new Set(),
      fx: { horn: false, future: 0, freeItem: 0, bandage: false, doll: false, lewdHp: 0, lewdDouble: false, dynamax: 0, clone: false,
            figleaf: false, lewdItem: false, doubleStudy: false, saitama: false, sharingan: false, stalker: false, succubus: false,
            tentacle: false, lewdStudy: 0, tanuki: false, bento: 0, microwave: false },
      protecting: false,
    };
    for (const [skill, [stat, per]] of Object.entries(RULES.perPoint)) f[stat] += s[skill] * per;
    f.hp = Math.max(1, Math.round(f.hp * hpMult));
    f.hpMax = f.hp;
    return f;
  }

  const has = (f, name) => f.items.includes(name);
  const clamp0 = f => { f.def = Math.max(0, f.def); f.study = Math.max(0, f.study); f.hp = Math.max(0, f.hp); };

  function addHp(f, n) {
    f.hp += n;
    if (f.hp > f.hpMax) f.hpMax = f.hp; // itens de 💗 também aumentam a vida máxima
  }

  /* Sorteio do item: mais 📔 libera itens de valor maior */
  function rollItem(f) {
    const bonus = f.fx.future;
    f.fx.future = 0;
    const max = 6 + (f.study + bonus) * 1.5;
    let pool = ITEMS.filter(i => i.value <= max);
    const good = pool.filter(i => i.value >= max * 0.35);
    if (good.length >= 6) pool = good;
    const total = pool.reduce((t, i) => t + i.value, 0);
    let r = Math.random() * total;
    for (const i of pool) { r -= i.value; if (r <= 0) return i; }
    return pool[pool.length - 1];
  }

  function giveItem(B, f, item, depth = 0) {
    const foe = f === B.p ? B.b : B.p;
    f.items.push(item.name);
    f.atk += item.atk; f.def += item.def; f.study += item.study;
    if (item.hp) addHp(f, item.hp);
    const parts = [item.atk && `+${item.atk}⚔️`, item.def && `+${item.def}🛡️`, item.study && `+${item.study}📔`, item.hp && `+${item.hp}💗`].filter(Boolean);
    B.log(`${f.name} encontrou <b>${item.name}</b>${parts.length ? ` (${parts.join(' ')})` : ''}${item.note ? ` — ${item.note}` : ''}`, 'item', f);
    B.fxPop(f, `📦 ${item.name}`, 'item');

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
        if (depth < 2) for (let k = 0; k < 3; k++) giveItem(B, f, rollItem(f), depth + 1);
        break;
    }
    checkCombos(B, f);
  }

  /* Combinações da wiki: aplicadas uma vez quando os itens se juntam */
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
      if (f.combos.has(c.id) || !c.need.every(n => has(f, n))) continue;
      f.combos.add(c.id);
      if (c.atk) f.atk += c.atk;
      if (c.lewdHp) f.fx.lewdHp += c.lewdHp;
      B.log(`<b>Combinação!</b> ${f.name} ${c.text}`, 'combo', f);
      B.fxPop(f, '✨ COMBO', 'combo');
    }
  }

  const statIco = st => ({ atk: '⚔️', def: '🛡️', study: '📔', hp: '💗' }[st]);

  /* Efeitos de início de turno (Saitama, Bandage, Bento, Butler/Maid, fóssil) */
  function startOfTurn(B, f) {
    if (f.fx.saitama) f.atk += 1;
    if (f.fx.bandage && chance(0.1)) { addHp(f, 4); B.log(`${f.name} ganhou uma Bandage: +4💗`, 'fx', f); }
    for (let i = 0; i < f.fx.bento; i++) {
      if (chance(0.1)) { const n = f.fx.microwave ? 6 : 4; addHp(f, n); B.log(`${f.name} ganhou um Bento: +${n}💗`, 'fx', f); }
    }
    for (let i = 0; i < f.fx.freeItem; i++) if (chance(0.1)) { B.log(`${f.name} recebeu um item grátis!`, 'fx', f); giveItem(B, f, rollItem(f)); }
    if (has(f, 'Strange Fossil') && !has(f, 'Hew DNA') && f.study >= 25) {
      f.items.push('Hew DNA');
      B.log(`${f.name} extraiu o <b>Hew DNA</b> do Strange Fossil!`, 'combo', f);
    }
    if (has(f, 'Hew DNA') && !has(f, 'Hewtwo') && f.study >= 35) {
      f.items.push('Hewtwo'); f.atk += 20;
      B.log(`${f.name} criou o <b>Hewtwo</b> a partir do Hew DNA! +20⚔️`, 'combo', f);
      B.fxPop(f, '🧬 HEWTWO', 'combo');
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
    B.fxPop(tgt, `🍓 −${hpLoss}`, 'lewd');
    B.log(`${boosted ? src.name : `A succubus de ${src.name}`} usou 🍓 em ${tgt.name}: −${tgt.fx.figleaf ? 0 : malus}🛡️ −${malus + (boosted ? src.fx.lewdStudy : 0)}📔 −${hpLoss}💗`, 'lewd', tgt);
    if (boosted && src.fx.lewdItem && chance(0.25)) giveItem(B, src, rollItem(src));
  }

  /* Dano que src causaria em tgt agora (usado pelo bot, sem gastar bônus) */
  function previewDamage(src, tgt, tgtProtects = false) {
    let a = src.atk * (src.fx.dynamax ? 1.5 : 1);
    if (src.fx.tanuki) a += 15;
    if (src.fx.horn) a += 25;
    if (src.fx.sharingan) a += tgt.def;
    if (src.fx.clone) a *= 1.5;
    const def = tgt.def * (tgt.fx.dynamax ? 1.5 : 1);
    let dmg = Math.max(RULES.minDamage, Math.round(a - def));
    if (tgtProtects) dmg = Math.max(0, dmg - RULES.protect);
    return dmg;
  }

  function attackDamage(B, src, tgt) {
    const dmg = previewDamage(src, tgt, tgt.protecting);
    const bonuses = [src.fx.tanuki && 'Wild Tanuki', src.fx.horn && 'Ogro', src.fx.sharingan && 'Sharingan', src.fx.clone && 'Clone'].filter(Boolean);
    src.fx.tanuki = src.fx.horn = src.fx.sharingan = src.fx.clone = false;
    return { dmg, bonuses };
  }

  /* Resolve um turno: as duas reações são reveladas e aplicadas juntas */
  function resolveTurn(B, aP, aB) {
    const { p, b } = B;
    B.turn++;
    B.log(`<b>Turno ${B.turn}</b>: ${p.name} ${ACTIONS[aP].ico} × ${ACTIONS[aB].ico} ${b.name}`, 'turn');

    startOfTurn(B, p);
    startOfTurn(B, b);

    // 1. proteção
    p.protecting = aP === 'protect';
    b.protecting = aB === 'protect';
    if (p.protecting) B.fxPop(p, '🛡️', 'protect');
    if (b.protecting) B.fxPop(b, '🛡️', 'protect');

    // 2. lewds (inclusive a succubus, que não usa os seus bônus)
    if (aP === 'lewd') doLewd(B, p, b, p.lewdPower, true);
    if (aB === 'lewd') doLewd(B, b, p, b.lewdPower, true);
    if (p.fx.succubus) doLewd(B, p, b, 1, false);
    if (b.fx.succubus) doLewd(B, b, p, 1, false);

    // 3. estudo
    for (const [f, a] of [[p, aP], [b, aB]]) {
      if (a !== 'study') continue;
      const n = f.fx.doubleStudy ? 2 : 1;
      f.fx.doubleStudy = false;
      for (let i = 0; i < n; i++) giveItem(B, f, rollItem(f));
    }

    // 4. ataques (calculados antes de aplicar: são simultâneos)
    const hits = [];
    if (aP === 'attack') hits.push([p, b, attackDamage(B, p, b)]);
    if (aB === 'attack') hits.push([b, p, attackDamage(B, b, p)]);
    for (const [src, tgt, { dmg, bonuses }] of hits) {
      tgt.hp -= dmg;
      if (src.fx.tentacle) tgt.def = Math.max(0, tgt.def - 1);
      B.attackAnim(src, tgt, dmg);
      B.log(`${src.name} atacou ${tgt.name}: <b>−${dmg}💗</b>${bonuses.length ? ` (${bonuses.join(', ')})` : ''}${tgt.protecting ? ' · protegido' : ''}`, 'attack', tgt);
    }

    // 5. golpe fatal: Stalker se sacrifica
    for (const f of [p, b]) {
      if (f.hp <= 0 && f.fx.stalker) {
        f.fx.stalker = false; f.hp = 1;
        B.log(`O Stalker se sacrificou para salvar ${f.name}!`, 'combo', f);
      }
      clamp0(f);
      if (f.fx.dynamax) f.fx.dynamax--;
      f.protecting = false;
    }
  }

  /* ---------- Bot ---------- */
  function botChoice(B) {
    const { p, b, difficulty } = B;
    if (difficulty === 'easy') return pick(Object.keys(ACTIONS));
    const myDmg = previewDamage(b, p);
    const threat = previewDamage(p, b);
    if (difficulty === 'normal') {
      if (chance(0.2)) return pick(Object.keys(ACTIONS));
      if (b.hp <= threat && chance(0.5)) return 'protect';
      if (B.turn < 2 && chance(0.6)) return 'study';
      if (p.def >= b.atk && chance(0.5)) return 'lewd';
      return chance(0.75) ? 'attack' : 'study';
    }
    // difícil
    if (myDmg >= p.hp) return 'attack';
    if (b.lewdPower >= p.hp && !p.fx.doll) return 'lewd';
    if (threat >= b.hp) return chance(0.75) ? 'protect' : 'attack';
    if ((B.turn < 3 || b.study < 6) && b.hp > b.hpMax * 0.5) return 'study';
    if (p.def >= b.atk - 1 && !b.fx.tanuki && !b.fx.horn) return 'lewd';
    if (threat > myDmg + 3 && chance(0.4)) return 'protect';
    return chance(0.8) ? 'attack' : 'study';
  }

  const BOT_SKILLS = [[2, 1, 0, 2, 0], [1, 1, 1, 1, 1], [2, 0, 1, 1, 1], [1, 2, 0, 2, 0], [3, 0, 0, 2, 0], [1, 1, 2, 1, 0]];
  function botSkills(difficulty) {
    const keys = SKILLS.map(([k]) => k);
    if (difficulty === 'easy') {
      const s = Object.fromEntries(keys.map(k => [k, 0]));
      for (let i = 0; i < RULES.points; i++) s[pick(keys)]++;
      return s;
    }
    const preset = pick(BOT_SKILLS);
    return Object.fromEntries(keys.map((k, i) => [k, preset[i]]));
  }

  /* ============================================================
     INTERFACE
     ============================================================ */
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const SECTION_HTML = `
  <div class="wa-battle" id="waBattle">
    <div class="panel wa-setup" id="waSetup">
      <div class="panel-title"><span class="bar yellow"></span> BATALHA LOCAL <span class="arena-beta">PROTÓTIPO</span></div>
      <p class="wa-lead">Escolha uma carta do seu harém, distribua os ${RULES.points} pontos do <b>$sk</b> e enfrente um bot. As regras seguem a Waifuarena do Mudae; o que a wiki não explica está marcado como <b>provisório</b>.</p>

      <div class="wa-setup-grid">
        <div>
          <div class="field">
            <label for="waChar">PERSONAGEM</label>
            <select id="waChar"></select>
          </div>
          <div class="field">
            <label>DIFICULDADE DO BOT</label>
            <div class="wa-diff" id="waDiff">
              ${Object.entries(DIFFICULTIES).map(([k, d]) => `<button type="button" class="gender-btn${k === 'normal' ? ' active' : ''}" data-diff="${k}" title="${d.desc}">${d.label}</button>`).join('')}
            </div>
            <p class="wa-diff-desc" id="waDiffDesc">${DIFFICULTIES.normal.desc}</p>
          </div>
        </div>

        <div>
          <div class="field">
            <label>PONTOS DO $SK <span class="wa-points" id="waPoints"></span></label>
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
        </div>
      </div>

      <div class="wa-preview" id="waPreview"></div>
      <button type="button" class="btn-add wa-start" id="waStart">INICIAR DUELO</button>
      <p class="wa-empty" id="waEmpty" hidden>Você ainda não tem personagens no tracker. Adicione ou importe pela aba PERSONAGENS.</p>
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
        </div>
        <div class="wa-row wa-me" id="waMe"></div>
        <div class="wa-actions" id="waActions">
          ${Object.entries(ACTIONS).map(([k, a]) => `<button type="button" class="wa-act wa-act-${k}" data-act="${k}"><span class="wa-act-ico">${a.ico}</span><b>${a.label}</b><small>${a.hint}</small></button>`).join('')}
        </div>
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
  let B = null;          // batalha atual
  let setupSkills = null;
  let difficulty = 'normal';
  let busy = false;

  const characters = () => (typeof state !== 'undefined' && Array.isArray(state.characters) ? state.characters : [])
    .filter(c => c.claimed !== false)
    .sort((a, b) => (Number(b.kakera) || 0) - (Number(a.kakera) || 0));
  const findChar = id => characters().find(c => String(c.id) === String(id));

  const defaultSkills = () => ({ yandere: 1, tsundere: 1, kuudere: 1, dandere: 1, deredere: 1 });
  const skillTotal = s => Object.values(s).reduce((t, v) => t + v, 0);

  /* ---------- Carta (mesmo visual das cartas com efeitos) ---------- */
  function cardHost(c) {
    // card-effects.js declara MudaeCardEffects com "const" (não fica em window)
    const CE = typeof MudaeCardEffects !== 'undefined' ? MudaeCardEffects : null;
    if (CE && CE.createCardHost) {
      const op = typeof getOpStatus === 'function' ? getOpStatus(c) : { any: false, maxed: false };
      const roletas = typeof normalizeCharacterGenders === 'function' ? normalizeCharacterGenders(c.genders) : [];
      return CE.createCardHost({
        ...CE.DEFAULT_VISUAL, ...CE.readConfig(c.cardStyle).config,
        name: c.name || '', series: c.series && c.series !== '—' ? c.series : '', img: c.photo || '',
        kakera: Number(c.kakera) || 0, keys: Number(c.keys) || 0, op: op.maxed ? 'max' : op.any ? 'some' : 'none', roletas,
      });
    }
    const el = document.createElement('div');
    el.className = 'wa-card-fallback';
    el.style.backgroundImage = c.photo ? `url("${c.photo}")` : 'none';
    el.innerHTML = `<span>${esc(c.name)}</span>`;
    return el;
  }

  /* ---------- Preparação ---------- */
  function fillCharacters() {
    const list = characters();
    $.empty.hidden = list.length > 0;
    $.start.disabled = list.length === 0;
    const current = $.char.value;
    $.char.innerHTML = list.map(c => `<option value="${esc(c.id)}">${esc(c.name)} · ◈ ${Number(c.kakera) || 0}</option>`).join('');
    if (current && findChar(current)) $.char.value = current;
    loadSkills();
  }

  function loadSkills() {
    const c = findChar($.char.value);
    const saved = c && c.arenaSkills;
    setupSkills = saved && skillTotal(saved) === RULES.points ? { ...defaultSkills(), ...saved } : defaultSkills();
    renderSkills();
  }

  function renderSkills() {
    for (const [k] of SKILLS) $.skills.querySelector(`[data-skill-val="${k}"]`).textContent = setupSkills[k];
    const total = skillTotal(setupSkills);
    $.points.textContent = `${total}/${RULES.points}`;
    $.points.classList.toggle('ok', total === RULES.points);
    $.start.disabled = total !== RULES.points || !characters().length;
    // prévia dos atributos com esses pontos
    const c = findChar($.char.value);
    if (!c) { $.preview.innerHTML = ''; return; }
    const f = makeFighter(c, setupSkills, false);
    $.preview.innerHTML = `<span>Na luta:</span> <b>${f.atk}</b>⚔️ <b>${f.def}</b>🛡️ <b>${f.study}</b>📔 <b>${f.hp}</b>💗 <b>${f.lewdPower}</b>🍓`;
  }

  async function saveSkills(c) {
    const idx = state.characters.findIndex(ch => String(ch.id) === String(c.id));
    if (idx === -1) return;
    const updated = { ...state.characters[idx], arenaSkills: { ...setupSkills } };
    state.characters[idx] = updated;
    try { await Database.updateCharacter(updated); } catch (err) { console.error('Erro ao salvar os pontos do $sk:', err); }
  }

  /* ---------- Tabuleiro ---------- */
  function fighterHTML(f, side) {
    return `
      <div class="wa-card-slot" data-side="${side}"></div>
      <div class="wa-info">
        <div class="wa-name">${esc(f.name)} <span class="wa-tag ${side}">${side === 'me' ? 'VOCÊ' : `BOT · ${DIFFICULTIES[B.difficulty].label.toUpperCase()}`}</span></div>
        <div class="wa-lp"><span class="wa-lp-label">💗</span><div class="wa-lp-bar"><i></i></div><b class="wa-lp-val"></b></div>
        <div class="wa-stats"></div>
        <div class="wa-flags"></div>
        <div class="wa-items"></div>
      </div>`;
  }

  function mountBoard() {
    $.opp.innerHTML = fighterHTML(B.b, 'opp');
    $.me.innerHTML = fighterHTML(B.p, 'me');
    $.opp.querySelector('.wa-card-slot').appendChild(cardHost(B.b.char));
    $.me.querySelector('.wa-card-slot').appendChild(cardHost(B.p.char));
    $.log.innerHTML = '';
    $.end.hidden = true;
    $.pickOpp.textContent = '?';
    $.pickMe.textContent = '?';
    updateBoard();
  }

  const FLAG_LABELS = {
    horn: '🦏 Ogro no próximo ⚔️', tanuki: '🦝 +15 no próximo ⚔️', clone: '👥 +50% no próximo ⚔️', sharingan: '👁️ Sharingan',
    doll: '🧸 Doll', figleaf: '🍃 Fig Leaf', saitama: '💪 +1⚔️/turno', stalker: '🕵️ Stalker', succubus: '😈 Succubus', tentacle: '🐙 Tentacle',
    doubleStudy: '📚 2 itens no próximo 📔', lewdDouble: '👗 🍓 em dobro',
  };

  function updateSide(row, f) {
    const pct = Math.max(0, Math.min(100, (f.hp / f.hpMax) * 100));
    const bar = row.querySelector('.wa-lp-bar i');
    bar.style.width = pct + '%';
    bar.dataset.level = pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low';
    row.querySelector('.wa-lp-val').textContent = `${f.hp} / ${f.hpMax}`;
    const dyn = f.fx.dynamax ? ' <span class="wa-dyn">DYNAMAX ×1,5</span>' : '';
    row.querySelector('.wa-stats').innerHTML =
      `<span title="Ataque">⚔️ <b>${f.atk}</b></span><span title="Defesa">🛡️ <b>${f.def}</b></span><span title="Estudo">📔 <b>${f.study}</b></span><span title="Força do lewd">🍓 <b>${f.lewdPower}</b></span>${dyn}`;
    const flags = Object.entries(FLAG_LABELS).filter(([k]) => f.fx[k]).map(([, t]) => `<span>${t}</span>`);
    if (f.fx.future) flags.push(`<span>🔮 +${f.fx.future}📔 no próximo item</span>`);
    row.querySelector('.wa-flags').innerHTML = flags.join('');
    row.querySelector('.wa-items').innerHTML = f.items.length
      ? f.items.map(n => { const it = ITEM_BY_NAME[n]; const tip = it ? [it.atk && `+${it.atk}⚔️`, it.def && `+${it.def}🛡️`, it.study && `+${it.study}📔`, it.hp && `+${it.hp}💗`, it.note].filter(Boolean).join(' · ') : 'Item especial'; return `<span title="${esc(tip)}">${esc(n)}</span>`; }).join('')
      : '<em>Sem itens</em>';
    row.classList.toggle('ko', f.hp <= 0);
  }

  function updateBoard() {
    updateSide($.opp, B.b);
    updateSide($.me, B.p);
    $.turn.textContent = `TURNO ${B.turn + 1}`;
  }

  function addLog(html, kind = '', f = null) {
    const li = document.createElement('li');
    li.className = `wa-log-${kind}${f ? (f === B.p ? ' me' : ' opp') : ''}`;
    li.innerHTML = html;
    $.log.prepend(li);
  }

  /* números/rótulos que sobem em cima da carta */
  function popOver(f, text, kind) {
    const slot = (f === B.p ? $.me : $.opp).querySelector('.wa-card-slot');
    const el = document.createElement('span');
    el.className = `wa-pop wa-pop-${kind}`;
    el.textContent = text;
    el.style.left = `${30 + Math.random() * 40}%`;
    slot.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function animAttack(src, tgt, dmg) {
    const srcSlot = (src === B.p ? $.me : $.opp).querySelector('.wa-card-slot');
    const tgtSlot = (tgt === B.p ? $.me : $.opp).querySelector('.wa-card-slot');
    srcSlot.classList.remove('lunge'); void srcSlot.offsetWidth; srcSlot.classList.add('lunge');
    setTimeout(() => {
      tgtSlot.classList.remove('hit'); void tgtSlot.offsetWidth; tgtSlot.classList.add('hit');
      popOver(tgt, `−${dmg}`, 'dmg');
    }, 260);
  }

  function newBattle(c, skills, diff) {
    const others = characters().filter(o => String(o.id) !== String(c.id));
    const botChar = others.length ? pick(others) : { ...c, name: `Sombra de ${c.name}` };
    B = {
      difficulty: diff, turn: 0, over: false,
      p: makeFighter(c, skills, false),
      b: makeFighter(botChar, botSkills(diff), true, DIFFICULTIES[diff].hp),
      log: addLog, fxPop: popOver, attackAnim: animAttack,
    };
  }

  async function play(action) {
    if (!B || B.over || busy) return;
    busy = true;
    $.actions.classList.add('locked');
    const botAct = botChoice(B);

    // revela as duas escolhas
    $.pickMe.textContent = ACTIONS[action].ico;
    $.pickOpp.textContent = '…';
    $.pickMe.classList.add('show');
    await sleep(350);
    $.pickOpp.textContent = ACTIONS[botAct].ico;
    $.pickOpp.classList.add('show');
    await sleep(450);

    resolveTurn(B, action, botAct);
    updateBoard();
    await sleep(700);
    $.pickMe.classList.remove('show');
    $.pickOpp.classList.remove('show');

    const pDead = B.p.hp <= 0, bDead = B.b.hp <= 0;
    if (pDead || bDead || B.turn >= RULES.maxTurns) endBattle(pDead && bDead ? 'draw' : bDead ? 'win' : pDead ? 'lose' : 'draw');
    busy = false;
    $.actions.classList.remove('locked');
  }

  function endBattle(result) {
    B.over = true;
    const t = { win: ['VITÓRIA', `${B.p.name} venceu em ${B.turn} turnos!`], lose: ['DERROTA', `${B.b.name} venceu em ${B.turn} turnos.`], draw: ['EMPATE', 'As duas cartas caíram ao mesmo tempo.'] }[result];
    addLog(`<b>${t[0]}</b> — ${t[1]}`, 'end');
    $.end.className = `wa-end ${result}`;
    $.end.innerHTML = `<div class="wa-end-box"><h2>${t[0]}</h2><p>${esc(t[1])}</p>
      <div class="wa-end-actions"><button type="button" class="btn-add" data-end="again">REVANCHE</button><button type="button" class="pill cyan" data-end="back">VOLTAR</button></div></div>`;
    $.end.hidden = false;
  }

  function showSetup() {
    B = null;
    $.board.hidden = true;
    $.setup.hidden = false;
    fillCharacters();
  }

  async function startBattle() {
    const c = findChar($.char.value);
    if (!c || skillTotal(setupSkills) !== RULES.points) return;
    await saveSkills(c);
    newBattle(c, setupSkills, difficulty);
    $.setup.hidden = true;
    $.board.hidden = false;
    mountBoard();
    addLog(`<b>Duelo!</b> ${esc(B.p.name)} contra ${esc(B.b.name)} (bot ${DIFFICULTIES[difficulty].label}). Zere o 💗 do rival para vencer.`, 'turn');
    $.board.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Montagem ---------- */
  function init() {
    const head = document.querySelector('#view-arena .page-head');
    if (!head || document.getElementById('waBattle')) return;
    head.insertAdjacentHTML('afterend', SECTION_HTML);

    const byId = id => document.getElementById(id);
    $ = {
      setup: byId('waSetup'), char: byId('waChar'), diff: byId('waDiff'), diffDesc: byId('waDiffDesc'), skills: byId('waSkills'),
      points: byId('waPoints'), preview: byId('waPreview'), start: byId('waStart'), empty: byId('waEmpty'),
      board: byId('waBoard'), opp: byId('waOpp'), me: byId('waMe'), turn: byId('waTurn'), pickOpp: byId('waPickOpp'), pickMe: byId('waPickMe'),
      actions: byId('waActions'), end: byId('waEnd'), log: byId('waLog'), quit: byId('waQuit'),
    };

    $.char.addEventListener('change', loadSkills);
    $.diff.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-diff]');
      if (!btn) return;
      difficulty = btn.dataset.diff;
      $.diff.querySelectorAll('[data-diff]').forEach(b => b.classList.toggle('active', b === btn));
      $.diffDesc.textContent = DIFFICULTIES[difficulty].desc;
    });
    $.skills.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-step]');
      if (!btn) return;
      const k = btn.dataset.skill, step = Number(btn.dataset.step);
      const next = setupSkills[k] + step;
      if (next < 0 || (step > 0 && skillTotal(setupSkills) >= RULES.points)) return;
      setupSkills[k] = next;
      renderSkills();
    });
    $.start.addEventListener('click', startBattle);
    $.actions.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-act]');
      if (btn) play(btn.dataset.act);
    });
    $.end.addEventListener('click', ev => {
      const act = ev.target.closest('[data-end]')?.dataset.end;
      if (act === 'again') startBattle();
      if (act === 'back') showSetup();
    });
    $.quit.addEventListener('click', () => {
      if (B && !B.over) { endBattle('lose'); addLog('Você desistiu.', 'end'); }
      else showSetup();
    });

    // a lista de personagens só existe depois que o tracker carrega: atualiza ao abrir a aba
    document.querySelectorAll('.tab-btn[data-view="arena"]').forEach(btn => btn.addEventListener('click', () => { if (!B) fillCharacters(); }));
    setTimeout(() => { if (!B) fillCharacters(); }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // exposto para testes e para a futura batalha online
  window.WaifuArenaBattle = { RULES, ITEMS, makeFighter, resolveTurn, botChoice, rollItem };
})();
