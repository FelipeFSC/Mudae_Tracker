// Liga os aumentos ao motor. Aplicado uma vez; aborta sem gravar se algo não bater.
const fs = require("fs");
const file = process.argv[2];
let s = fs.readFileSync(file, "utf8");
const swap = (from, to) => {
    const n = s.split(from).length - 1;
    if (n !== 1) throw new Error(`esperava 1, achei ${n}: ${from.slice(0, 80)}`);
    s = s.replace(from, () => to);
};

/* ---------- Dados, Emblemas e consumíveis ---------- */
swap(`  const REMOVER = 'MagneticRemover';`, `  const AUG_DATA = typeof TFT_AUGMENTS_DATA !== 'undefined' ? TFT_AUGMENTS_DATA : require('./tft-augments-data.js');
  const AUG_IMPL = typeof TFT_AUG_IMPL !== 'undefined' ? TFT_AUG_IMPL : require('./tft-augments.js');
  const REMOVER = 'MagneticRemover';`);
swap(`  /* ---------- Habilidades ----------`, `  /* ---------- Emblemas e consumíveis dos aumentos ---------- */
  const CONSUMABLE_ICON = 'assets/maps/tft/icons/items/hexcore/tft_consumable_itemremover.png';
  const emblemId = trait => \`Emblem_\${trait}\`;
  for (const t of D.traits) ITEMS[emblemId(t.name)] = { id: emblemId(t.name), name: \`Emblema de \${t.name}\`, from: null, special: true, emblem: t.name, icon: t.icon, fx: {} };
  const CONSUMABLES = {
    LesserDuplicator: { name: 'Duplicador de Campeão Inferior', maxCost: 3 },
    ChampionDuplicator: { name: 'Duplicador de Campeão', maxCost: 5 },
    Reforger: { name: 'Reforjador' },
    Recombobulator: { name: 'Recombobulador de Bolso', maxCost: 2 },
  };
  for (const [id, c] of Object.entries(CONSUMABLES)) ITEMS[id] = { id, name: c.name, from: null, special: true, use: id, icon: CONSUMABLE_ICON, fx: {} };

  /* ---------- Habilidades ----------`);

/* ---------- Traços contam Emblemas ---------- */
swap(`  function activeTier(name, count) {`, `  /* como traitCounts, mas somando Emblemas (cada Emblema conta mesmo em cópia repetida) */
  const emblemsOf = u => (u.items || u.itemIds || []).filter(i => ITEMS[i] && ITEMS[i].emblem).map(i => ITEMS[i].emblem);
  function traitCountsOf(units, champOf = u => u.c) {
    const counts = traitCounts(units.map(champOf));
    for (const u of units) for (const t of emblemsOf(u)) if (!CH[champOf(u)].traits.includes(t)) counts[t] = (counts[t] || 0) + 1;
    return counts;
  }
  function activeTier(name, count) {`);
swap(`  function traitSummary(p) {
    const counts = traitCounts(Object.values(p.board).map(u => u.c));`, `  function traitSummary(p) {
    const counts = traitCountsOf(Object.values(p.board));`);
swap(`if (lose && lose.alive && traitCounts(Object.values(lose.board).map(u => u.c))['Cifra'] >= 3)`, `if (lose && lose.alive && traitCountsOf(Object.values(lose.board))['Cifra'] >= 3)`);
swap(`      const counts = traitCounts(Object.values(p.board).map(u => u.c));
      if (activeTier('Nitro'`, `      const counts = traitCountsOf(Object.values(p.board));
      if (activeTier('Nitro'`);
swap(`    const counts = traitCounts(champs.map(u => u.champ));`, `    const counts = traitCountsOf(champs, u => u.champ);`);

/* ---------- Jogador ---------- */
swap(`      alive: true, left: false, placement: null, recent: [],`, `      alive: true, left: false, placement: null, recent: [],
      augments: [], augState: {}, offer: null, choices: [], freeRerolls: 0, shopOff: 0, lockedRounds: 0, boughtThisRound: 0, boughtLast: 0, lastInterest: 0, wins: 0, combats: 0,`);
swap(`      combat: null, pairs: null, pending: null, winner: null, log: [],
    };`, `      combat: null, pairs: null, pending: null, winner: null, log: [], augTiers: null,
    };`);

/* ---------- Biblioteca dos aumentos ---------- */
swap(`  /* ---------- Ações do jogador ---------- */`, `  /* ============================================================
     AUMENTOS
     Dados em tft-augments-data.js, efeitos em tft-augments.js.
     Só entra em oferta quem tem implementação.
     ============================================================ */
  const AUG = Object.fromEntries(AUG_DATA.map(a => [a.id, a]));
  const AUG_PRISMATIC_NO_ICON = new Set(['TFT14_Augment_BlackMarket_ScopedWeapons', 'TFT14_Augment_BlackMarketTitanicStrength', 'TFT14_Augment_BlackMarketUnstableEvolution', 'TFT14_Augment_LifeLongLearningBlackMarket', 'TFT6_Augment_CyberneticImplants3', 'TFT9_Augment_Commander_Ascension', 'TFT9_Augment_Commander_FinalAscension', 'TFT9_Augment_HedgeFund', 'TFT6_Augment_GachaAddict', 'TFT6_Augment_HighEndShopping', 'TFT6_Augment_BinaryAirdrop']);
  for (const a of AUG_DATA) if (!a.tier) a.tier = AUG_PRISMATIC_NO_ICON.has(a.id) ? 3 : 2;

  // Efeitos que dependem de números ou sistemas que não temos ficam de fora, sem inventar.
  const AUG_BLOCKED = new Set(['TFT_Augment_StarryNight', 'TFT_Augment_StarryNightPlus', 'TFT9_Augment_DravenSpoilsOfWar', 'TFT9_Augment_DravenSpoilsOfWar2', 'TFT9_Augment_DravenSpoilsOfWar3', 'TFT9_Augment_CustomerIsAlwaysRight']);
  const nameToChamp = n => CH_BY_NAME[n] || CH_BY_NAME[{ Jarvan: 'Jarvan IV' }[n]] || null;
  const nameToItem = n => D.items.find(i => i.name === n) || null;
  /* Insígnia/Tiara/Coroa: o que concede vem da própria descrição. */
  function parseGrant(desc) {
    const text = desc.replace(/^Recebe\\s+/, '').replace(/\\.$/, '');
    const out = [];
    for (const raw of text.split(/,\\s*|\\s+e\\s+(?=uma?\\s|Luvas|Emblema)/)) {
      const part = raw.replace(/^(?:uma?|um)\\s+/, '').trim();
      const em = part.match(/^Emblema de (.+)$/);
      if (em) { if (!TRAITS[em[1]]) return null; out.push({ emblem: em[1] }); continue; }
      const champ = nameToChamp(part);
      if (champ) { out.push({ champ: champ.id }); continue; }
      const item = nameToItem(part);
      if (item) { out.push({ item: item.id }); continue; }
      return null;
    }
    return out;
  }
  const AUG_FX = {};
  for (const a of AUG_DATA) {
    if (AUG_BLOCKED.has(a.id)) continue;
    if (AUG_IMPL[a.id]) { AUG_FX[a.id] = AUG_IMPL[a.id]; continue; }
    if (/^TFT14_Augment_.*(Crest|Circlet|Crown)$/.test(a.id)) {
      const grants = parseGrant(a.desc);
      if (grants) AUG_FX[a.id] = { now(p) { grants.forEach(g => { if (g.emblem) p.emblem(g.emblem); else if (g.champ) p.champ(g.champ); else p.item(g.item); }); } };
    }
  }
  const augImplemented = id => Boolean(AUG_FX[id]);

  let HOOK_G = null;
  function augApi(g, p, id) {
    const state = () => (p.augState[id] = p.augState[id] || {});
    const pool = cost => D.champions.filter(c => c.cost === cost && g.pool[c.id] > 0);
    const give = (champ, star = 1) => {
      if (!champ) return null;
      const need = star === 1 ? 1 : star === 2 ? 3 : 9;
      g.pool[champ] = Math.max(0, g.pool[champ] - need);
      if (star === 1) {
        if (!addUnit(g, p, champ)) { p.gold += CH[champ].cost; g.pool[champ] += need; return null; }
        return champ;
      }
      const b = firstFreeBench(p);
      if (b < 0) { p.gold += CH[champ].cost * need; g.pool[champ] += need; return null; }
      p.bench[b] = { uid: g.nextUid++, c: champ, star, items: [] };
      tryStarUp(p, champ, star);
      return champ;
    };
    const emblemTraits = () => AUG_DATA.filter(a => /Crest$/.test(a.id) && a.id.startsWith('TFT14')).map(a => (a.desc.match(/Emblema de (.+?)\\./) || [])[1]).filter(t => TRAITS[t]);
    const api = {
      gold(n) { p.gold = Math.max(0, p.gold + n); },
      xp(n) { const before = p.level; gainXp(p, n); for (let l = before + 1; l <= p.level; l++) runHook(g, p, 'level', l); },
      comps(n) { for (let i = 0; i < n; i++) p.items.push(randPick(g, COMPONENTS)); },
      compsSame(n) { const c = randPick(g, COMPONENTS); for (let i = 0; i < n; i++) p.items.push(c); },
      item(i) { p.items.push(i); },
      fullItem() { p.items.push(randPick(g, FULL_ITEMS)); },
      unit(cost, star = 1) { const list = pool(cost); return list.length ? give(randPick(g, list).id, star) : null; },
      champ(c, star = 1) { return give(c, star); },
      champName(n) { const c = nameToChamp(n); return c ? give(c.id) : null; },
      allOfCost(cost) { pool(cost).forEach(c => give(c.id)); },
      unitOfTrait(t, cost) { for (let c = cost; c >= 1; c--) { const list = pool(c).filter(x => x.traits.includes(t)); if (list.length) return give(randPick(g, list).id); } return null; },
      emblem(t) { const trait = t || randPick(g, emblemTraits()); p.items.push(emblemId(trait)); return trait; },
      rerolls(n) { p.freeRerolls += n; },
      removers(n) { for (let i = 0; i < n; i++) p.items.push(REMOVER); },
      reforger(n) { for (let i = 0; i < n; i++) p.items.push('Reforger'); },
      recombobulator() { p.items.push('Recombobulator'); },
      dup(kind, n) { for (let i = 0; i < n; i++) p.items.push(kind === 'lesser' ? 'LesserDuplicator' : 'ChampionDuplicator'); },
      anvil(kind) {
        const list = kind === 'comp' ? COMPONENTS : FULL_ITEMS;
        const opts = [];
        while (opts.length < 4) { const x = randPick(g, list); if (!opts.includes(x)) opts.push(x); }
        p.choices.push({ title: kind === 'comp' ? 'Bigorna de Componentes' : 'Bigorna de Item Completo', opts });
      },
      state,
      count(k, n) { const s = state(); s[k] = (s[k] || 0) + n; return s[k]; },
      setLevel(l) { if (p.level < l) { const before = p.level; p.level = l; p.xp = 0; for (let x = before + 1; x <= l; x++) runHook(g, p, 'level', x); } },
      setStreak(n) { p.streak = n; },
      randomAugment(tier) { const list = augPool(g, p, tier); if (list.length) pickAugment(g, p, randPick(g, list)); },
      healPlayer(n, raiseMax) { if (playerMods(g, p).noPlayerHeal) return; p.hp = raiseMax ? p.hp + n : Math.min(p.maxHp || RULES.startHp, p.hp + n); if (raiseMax) p.maxHp = (p.maxHp || RULES.startHp) + n; },
      damagePlayer(n) { p.hp = Math.max(1, p.hp - n); },
      setPlayerHp(n) { p.hp = n; p.maxHp = n; },
      goldNow: () => p.gold,
      lastInterest: () => p.lastInterest,
      boughtLastRound: () => p.boughtLast,
      roundIdx: () => g.roundIdx,
      stageNow: () => roundInfo(Math.max(0, g.roundIdx)).stage,
      playersOut: () => g.players.filter(x => !x.alive).length,
      noBenchItems: () => !p.items.some(i => !ITEMS[i] || !ITEMS[i].special),
      benchEmpty: () => !p.bench.some(Boolean),
      benchFull: () => p.bench.every(Boolean),
      lockActions(n) { p.lockedRounds = n; },
      disableShop(n) { p.shopOff = n; p.shop = p.shop.map(() => null); },
      sellAll() { for (const u of allUnits(p).slice()) { p.gold += sellPrice(u); p.items.push(...u.items); g.pool[u.c] += copiesValue(u.star); removeUnit(p, u.uid); } },
      removeAll() { for (const u of allUnits(p).slice()) { p.items.push(...u.items); g.pool[u.c] += copiesValue(u.star); removeUnit(p, u.uid); } },
      recombobulateBoard() { for (const u of Object.values(p.board)) { const list = pool(Math.min(5, CH[u.c].cost + 1)); if (list.length) { g.pool[u.c] += copiesValue(u.star); u.c = randPick(g, list).id; g.pool[u.c] = Math.max(0, g.pool[u.c] - copiesValue(u.star)); } } },
      pandoraBench(n) { p.bench.forEach((u, i) => { if (!u || i < p.bench.length - n) return; const list = pool(CH[u.c].cost); if (list.length) { g.pool[u.c] += copiesValue(u.star); u.c = randPick(g, list).id; g.pool[u.c] = Math.max(0, g.pool[u.c] - copiesValue(u.star)); } }); },
      pandoraItems() { p.items = p.items.map(i => (COMPONENTS.includes(i) ? randPick(g, COMPONENTS) : FULL_ITEMS.includes(i) ? randPick(g, FULL_ITEMS) : i)); },
      permAll(perm) { allUnits(p).forEach(u => addPerm(u, perm)); },
      randomPerm(f, opts) { if (p.lastStarUp) addPerm(p.lastStarUp, randPick(g, opts)); },
      shopOfCost(cost) { const list = pool(cost); p.shop = p.shop.map(() => (list.length ? randPick(g, list).id : null)); },
      stealFromShop(limit) { const i = p.shop.findIndex(c => c && CH[c].cost <= limit); if (i >= 0) { const c = p.shop[i]; p.shop[i] = null; give(c); } },
      upgradeBought(c) { for (let i = 0; i < 2; i++) give(c); },
      traitOnBoard(t) { return Object.values(p.board).filter(u => CH[u.c].traits.includes(t)).length; },
    };
    return api;
  }
  function addPerm(u, perm) {
    u.perm = u.perm || {};
    for (const [k, v] of Object.entries(perm)) u.perm[k] = (u.perm[k] || 0) + v;
  }
  function runHook(g, p, hook, ...args) {
    for (const id of p.augments.slice()) {
      const fx = AUG_FX[id];
      if (fx && fx[hook]) fx[hook](augApi(g, p, id), AUG[id].fx, ...args);
    }
  }
  function playerMods(g, p) {
    const m = {};
    for (const id of p.augments) {
      const fx = AUG_FX[id];
      if (fx && fx.mods) fx.mods(m, AUG[id].fx, p.augState[id] || {}, g);
    }
    return m;
  }
  function augPool(g, p, tier, list = 'normal') {
    return AUG_DATA.filter(a => a[list] && a.tier === tier && augImplemented(a.id) && !p.augments.includes(a.id)).map(a => a.id);
  }
  function pickAugment(g, p, id) {
    p.augments.push(id);
    p.augState[id] = p.augState[id] || { pickedRound: g.roundIdx };
    const fx = AUG_FX[id];
    if (fx && fx.now) fx.now(augApi(g, p, id), AUG[id].fx);
  }
  const AUG_ROUNDS = { '2-1': 0, '3-2': 1, '4-2': 2 };
  // Sequências de tier iguais para todos na partida, como no TFT. Pesos aproximados: a Riot não publica.
  function rollTiers(g) {
    const pickTier = () => { const r = rand(g); return r < 0.4 ? 1 : r < 0.8 ? 2 : 3; };
    return [pickTier(), pickTier(), pickTier()];
  }
  function makeOffer(g, p, tier, list = 'normal') {
    if (playerMods(g, p).noAugments) return;
    let t = tier;
    if (p.augState.tierUpArmed) { t = Math.min(3, t + 1); p.augState.tierUpArmed = false; }
    if (playerMods(g, p).nextAugmentTierUp && !p.augState.tierUpUsed) { t = Math.min(3, t + 1); p.augState.tierUpUsed = true; }
    const avail = augPool(g, p, t, list);
    const opts = [];
    while (opts.length < 3 && opts.length < avail.length) { const x = randPick(g, avail); if (!opts.includes(x)) opts.push(x); }
    if (opts.length) p.offer = { tier: t, list, opts, rerolled: opts.map(() => false) };
  }
  /* quem não decidiu a tempo recebe a primeira opção */
  function settleChoices(g, p) {
    if (p.offer) { const id = p.offer.opts[0]; p.offer = null; pickAugment(g, p, id); }
    while (p.choices.length) { const c = p.choices.shift(); p.items.push(c.opts[0]); }
  }

  /* ---------- Ações do jogador ---------- */`);

/* ---------- Ações ---------- */
swap(`    if (!p.alive) return 'Você foi eliminado.';
    const planning = g.phase === 'plan' || g.phase === 'carousel';
`, `    if (!p.alive) return 'Você foi eliminado.';
    const planning = g.phase === 'plan' || g.phase === 'carousel';
    HOOK_G = g;
    if (p.lockedRounds > 0 && !['ready', 'augment', 'augReroll', 'choose', 'lock'].includes(a.a)) return 'Ação bloqueada pelo aumento Ociosidade.';
`);
swap(`        if (!champ) return 'Espaço vazio.';
        const cost = CH[champ].cost;
        if (p.gold < cost) return 'Ouro insuficiente.';`, `        if (!champ) return 'Espaço vazio.';
        const cost = CH[champ].cost;
        if (p.shopOff > 0) return 'Loja desabilitada por um aumento.';
        if (p.gold < cost) return 'Ouro insuficiente.';`);
swap(`        p.gold -= cost;
        g.pool[champ]--;
        p.shop[i] = null;
        return null;`, `        p.gold -= cost;
        g.pool[champ]--;
        p.shop[i] = null;
        p.boughtThisRound++;
        runHook(g, p, 'bought', champ, cost);
        return null;`);
swap(`      case 'reroll':
        if (p.gold < RULES.rerollCost) return 'Ouro insuficiente.';
        p.gold -= RULES.rerollCost;
        refreshShop(g, p);
        return null;`, `      case 'reroll': {
        if (p.shopOff > 0) return 'Loja desabilitada por um aumento.';
        const mods = playerMods(g, p);
        const paid = !mods.freeShop && p.freeRerolls <= 0;
        if (paid && p.gold < RULES.rerollCost) return 'Ouro insuficiente.';
        if (paid) { p.gold -= RULES.rerollCost; if (mods.xpOnGoldReroll) augApi(g, p, null).xp(mods.xpOnGoldReroll); }
        else if (!mods.freeShop) p.freeRerolls--;
        if (mods.rerollRefund && rand(g) < mods.rerollRefund) p.freeRerolls++;
        refreshShop(g, p);
        return null;
      }`);
swap(`        if (p.level >= RULES.maxLevel) return 'Nível máximo.';
        if (p.gold < RULES.xpCost) return 'Ouro insuficiente.';
        p.gold -= RULES.xpCost;
        gainXp(p, RULES.xpGain);
        return null;`, `        if (p.level >= RULES.maxLevel) return 'Nível máximo.';
        {
          const mods = playerMods(g, p);
          if (mods.noBuyXp) return 'Um aumento impede comprar EXP.';
          if (mods.xpWithHealth) {
            if (p.hp <= mods.xpWithHealth) return 'Vida insuficiente.';
            p.hp -= mods.xpWithHealth;
          } else {
            const xpCost = Math.max(0, RULES.xpCost + (mods.xpCostDelta || 0));
            if (p.gold < xpCost) return 'Ouro insuficiente.';
            p.gold -= xpCost;
          }
          augApi(g, p, null).xp(RULES.xpGain + (mods.xpBuyBonus || 0));
        }
        return null;`);
swap(`        if (validBench(a.from) && validHex(a.to) && !other && boardCount(p) >= p.level) return \`Limite de \${p.level} em campo: suba de nível.\`;`, `        const fieldLimit = p.level + (playerMods(g, p).teamBonus || 0);
        if (validBench(a.from) && validHex(a.to) && !other && boardCount(p) >= fieldLimit) return \`Limite de \${fieldLimit} em campo: suba de nível.\`;`);
swap(`        p.gold += sellPrice(target);
        p.items.push(...target.items);
        g.pool[target.c] += copiesValue(target.star);
        return null;`, `        p.gold += sellPrice(target);
        if (playerMods(g, p).salvageOnSell) {
          for (const it of target.items) { const def = ITEMS[it]; if (def.from) p.items.push(...def.from); else p.items.push(it); }
        } else {
          p.items.push(...target.items);
        }
        g.pool[target.c] += copiesValue(target.star);
        return null;`);
swap(`          p.items.splice(a.item, 1);
          p.items.push(...u.items);
          u.items = [];
          return null;
        }
        const comp = COMPONENTS.includes(id);`, `          p.items.splice(a.item, 1);
          p.items.push(...u.items);
          u.items = [];
          return null;
        }
        if (ITEMS[id].use) {
          const use = ITEMS[id].use;
          const limit = CONSUMABLES[use].maxCost;
          if (limit && CH[u.c].cost > limit) return \`Só funciona até custo \${limit}.\`;
          if (use === 'Reforger') {
            if (!u.items.length) return 'Esta unidade não tem itens.';
            u.items = u.items.map(x => (ITEMS[x].emblem ? x : randPick(g, COMPONENTS.includes(x) ? COMPONENTS : FULL_ITEMS)));
          } else if (use === 'Recombobulator') {
            const list = D.champions.filter(c => c.cost === CH[u.c].cost + 1 && g.pool[c.id] > 0);
            if (!list.length) return 'Sem campeões disponíveis.';
            g.pool[u.c] += copiesValue(u.star);
            u.c = randPick(g, list).id;
            g.pool[u.c] = Math.max(0, g.pool[u.c] - copiesValue(u.star));
          } else {
            if (g.pool[u.c] <= 0) return 'Sem cópias no pool.';
            if (!addUnit(g, p, u.c)) return 'Banco cheio.';
            g.pool[u.c]--;
          }
          p.items.splice(a.item, 1);
          return null;
        }
        if (ITEMS[id].emblem && (CH[u.c].traits.includes(ITEMS[id].emblem) || u.items.includes(id))) return 'Esta unidade já tem essa característica.';
        const comp = COMPONENTS.includes(id);`);
swap(`          u.items[idx] = full.id;
`, `          u.items[idx] = full.id;
          runHook(g, p, 'crafted', full.id);
`);
swap(`          if (u.items.length >= RULES.maxItems) return 'Sem espaço de item.';`, `          if (u.items.length >= (playerMods(g, p).maxItems || RULES.maxItems)) return 'Sem espaço de item.';`);
swap(`      case 'ready':
        if (g.phase === 'plan') p.ready = !p.ready;
        return null;`, `      case 'ready':
        if (g.phase === 'plan') p.ready = !p.ready;
        return null;
      case 'augment': {
        if (!p.offer) return 'Sem aumento para escolher.';
        const id = p.offer.opts[a.i];
        if (!id) return 'Opção inválida.';
        p.offer = null;
        pickAugment(g, p, id);
        return null;
      }
      case 'augReroll': {
        const o = p.offer;
        if (!o || !o.opts[a.i] || o.rerolled[a.i]) return 'Sem atualização disponível.';
        const avail = augPool(g, p, o.tier, o.list).filter(x => !o.opts.includes(x));
        if (!avail.length) return 'Sem outras opções.';
        o.opts[a.i] = randPick(g, avail);
        o.rerolled[a.i] = true;
        return null;
      }
      case 'choose': {
        const c = p.choices[0];
        if (!c || !c.opts[a.i]) return 'Opção inválida.';
        p.items.push(c.opts[a.i]);
        p.choices.shift();
        return null;
      }`);

/* ---------- Estrela sobe ---------- */
swap(`    keep.u.star = star + 1;`, `    keep.u.star = star + 1;
    p.lastStarUp = keep.u;
    if (HOOK_G) runHook(HOOK_G, p, 'starUp');`);

/* ---------- Rodada ---------- */
swap(`  function nextRound(g) {
    g.roundIdx++;`, `  function nextRound(g) {
    HOOK_G = g;
    g.roundIdx++;
    if (!g.augTiers) g.augTiers = rollTiers(g);`);
swap(`      p.gold += passive + Math.min(5, Math.floor(p.gold / 10)) + streakGold(p.streak);
      gainXp(p, RULES.roundXp);
      if (!p.locked) refreshShop(g, p);
    }`, `      const mods = playerMods(g, p);
      const cap = mods.interestCap != null ? mods.interestCap : 5;
      p.lastInterest = Math.min(cap, Math.floor(p.gold / 10));
      p.gold += passive + p.lastInterest + streakGold(p.streak);
      augApi(g, p, null).xp(RULES.roundXp);
      p.boughtLast = p.boughtThisRound;
      p.boughtThisRound = 0;
      if (p.lockedRounds > 0) p.lockedRounds--;
      if (p.shopOff > 0) { p.shopOff--; p.shop = p.shop.map(() => null); }
      else if (!p.locked) refreshShop(g, p);
      runHook(g, p, 'round', info);
      if (info.n === 1 && info.stage >= 2) runHook(g, p, 'stage', info);
      if (AUG_ROUNDS[info.label] != null && !g.noAugmentRounds) makeOffer(g, p, g.augTiers[AUG_ROUNDS[info.label]]);
    }`);
swap(`  function refreshShop(g, p) { p.shop = p.shop.map(() => rollShopSlot(g, p.level)); }`, `  function refreshShop(g, p) {
    const lv = Math.min(RULES.maxLevel, p.level + (playerMods(g, p).shopLevelDelta || 0));
    p.shop = p.shop.map(() => rollShopSlot(g, lv));
  }`);
swap(`    while (boardCount(p) < p.level) {
      const b = p.bench.findIndex(Boolean);`, `    while (boardCount(p) < p.level + (HOOK_G ? playerMods(HOOK_G, p).teamBonus || 0 : 0)) {
      const b = p.bench.findIndex(Boolean);`);
swap(`    const info = roundInfo(g.roundIdx);
    alivePlayers(g).forEach(autoField);`, `    const info = roundInfo(g.roundIdx);
    HOOK_G = g;
    alivePlayers(g).forEach(p => settleChoices(g, p));
    alivePlayers(g).forEach(autoField);`);
swap(`  const teamFromPlayer = p => ({
    units: Object.entries(p.board).map(([key, u]) => { const [x, y] = key.split(',').map(Number); return { ...u, x, y }; }),
    chrome: p.chrome,
  });`, `  const teamFromPlayer = p => ({
    units: Object.entries(p.board).map(([key, u]) => { const [x, y] = key.split(',').map(Number); return { ...u, x, y }; }),
    chrome: p.chrome,
    augs: (p.augments || []).map(id => ({ id, state: p.augState[id] || {} })),
    level: p.level,
    stage: HOOK_G ? roundInfo(Math.max(0, HOOK_G.roundIdx)).stage : 1,
    roundIdx: HOOK_G ? HOOK_G.roundIdx : 0,
    benchRight: p.bench.map(Boolean),
    mods: HOOK_G ? playerMods(HOOK_G, p) : {},
  });`);

/* ---------- Fim de combate ---------- */
swap(`        const loseTo = (p, d) => { if (p && p.alive) { p.hp -= d; p.streak`, `        const loseTo = (p, raw) => { const m = p ? playerMods(g, p) : {}; const d = m.lossDamage != null ? m.lossDamage : Math.round(raw * (m.playerDamageMul || 1)); if (p && p.alive) { p.hp -= d; p.streak`);
swap(`    g.combat = null;
    settleDeaths(g);
    if (g.phase !== 'end') nextRound(g);`, `    // Aumentos: ganhos permanentes e efeitos de fim de combate
    for (const f of c.fights) {
      [[f.a, 0], [f.b, 1]].forEach(([idx, side]) => {
        if (idx == null) return;
        const p = g.players[idx];
        if (!p || !p.alive) return;
        for (const gain of (f.permGains || []).filter(x => x.side === side)) {
          const unit = allUnits(p).find(u => u.uid === gain.uid);
          if (unit) addPerm(unit, gain.perm);
        }
        p.gold += (f.augGold || [0, 0])[side];
        p.combats++;
        const won = f.winner === side;
        if (won) p.wins++;
        runHook(g, p, 'after', { pvp: c.kind === 'pvp', won, lost: f.winner !== side && f.winner !== -1, survivors: won ? f.survivors : 0, allyDeaths: (f.deaths || [0, 0])[side] });
      });
    }
    // Reservas Finais: a primeira eliminação é cancelada
    for (const p of alivePlayers(g)) {
      const fr = playerMods(g, p).finalReserves;
      if (fr && p.hp <= 0 && !p.augState.usedFinalReserves) {
        p.augState.usedFinalReserves = true;
        p.hp = 1;
        augApi(g, p, null).xp(fr.XP + Math.max(0, p.gold - fr.Gold));
        p.gold = fr.Gold;
      }
    }
    g.combat = null;
    settleDeaths(g);
    if (g.phase !== 'end') nextRound(g);`);

/* ---------- Unidade: ganhos permanentes ---------- */
swap(`    if (raw.fullMana) u.mana = u.maxMana;
`, `    if (raw.fullMana) u.mana = u.maxMana;
    u.uid = raw.uid;
    u.cost = ch.cost;
`);
swap(`    u.maxHp = (ch.hp * hpMul + hpFlat) * (1 + hpPct);
`, `    u.maxHp = (ch.hp * hpMul + hpFlat) * (1 + hpPct);
    const perm = raw.perm;
    if (perm) {
      u.maxHp = (u.maxHp + (perm.hp || 0)) * (1 + (perm.hpPct || 0));
      u.adPct += perm.ad || 0;
      u.ap += perm.ap || 0;
      u.asBonus += perm.as || 0;
      u.dura += perm.dura || 0;
    }
    const emblemTraits = emblemsOf({ itemIds: ids }).filter(t => !ch.traits.includes(t));
    if (emblemTraits.length) u.traits = [...ch.traits, ...emblemTraits];
`);
swap(`    Object.assign(u, { creep: k.key, maxHp: d.hp, baseAd: d.ad, adPct: 0, asBase: d.as, armor: d.armor, mr: d.mr, range: d.range, items: [] });`, `    Object.assign(u, { creep: k.key, maxHp: d.hp, baseAd: d.ad, adPct: 0, asBase: d.as, armor: d.armor, mr: d.mr, range: d.range, items: [], lx: x, ly: y });`);

/* ---------- Combate: ganchos ---------- */
swap(`      if (src.debuffUntil > t) amp *= 0.9;`, `      if (src.debuffUntil > t) amp *= 0.9;
      const srcHooks = src.side != null ? augHooks[src.side] : null;
      if (srcHooks) for (const fn of srcHooks.damageMul) amp += fn(src);`);
swap(`      events.push(['d', tgt.id, Math.round(dealt), type, crit ? 1 : 0]);
`, `      events.push(['d', tgt.id, Math.round(dealt), type, crit ? 1 : 0]);
      if (srcHooks && !o.noProc) {
        for (const fn of srcHooks.dealt) fn(src, tgt, dealt, o);
        if (crit) for (const fn of srcHooks.critHit) fn(src, tgt);
        if (crit && o.ability) for (const fn of srcHooks.abilityCrit) fn(src, tgt);
      }
`);
swap(`hit(tgt, x, 100, 'm', { noProc: true }));`, `hit(tgt, x, 100 * (tgt.brambleMul || 1), 'm', { noProc: true }));`);
swap(`      if (src && src.soul) { heal(src, src.maxHp * 0.25); src.amp += 0.1; }
    }`, `      if (src && src.soul) { heal(src, src.maxHp * 0.25); src.amp += 0.1; }
      const own = augHooks[u.side], foe = augHooks[1 - u.side];
      if (own) own.allyDeath.forEach(fn => fn(u, src));
      if (foe) foe.enemyDeath.forEach(fn => fn(u, src));
      if (foe && src && src.side === foe.side) foe.kill.forEach(fn => fn(src, u));
    }`);
swap(`      const pct = u.hp / u.maxHp;
      const once = (key, limit, fn) =>`, `      const pct = u.hp / u.maxHp;
      const hk = augHooks[u.side];
      if (hk) hk.hpBelow.forEach((h, i) => { const k = 'aug' + i; if (pct <= h.pct && !u.once[k]) { u.once[k] = true; h.fn(u); } });
      const once = (key, limit, fn) =>`);
swap(`      if (spec.channel) u.castUntil = t + spec.channel;`, `      if (augHooks[u.side]) augHooks[u.side].cast.forEach(fn => fn(u));
      if (spec.channel) u.castUntil = t + spec.channel;`);
swap(`      if (u.chakram && u.chakram.left > 0 && tgt.alive) {`, `      if (augHooks[u.side]) augHooks[u.side].attackHit.forEach(fn => fn(u, tgt));
      if (u.manaOnAttack) u.mana += u.manaOnAttack;
      if (u.chakram && u.chakram.left > 0 && tgt.alive) {`);
swap(`        if (u.burnUntil > t) applyTrue(u, u.maxHp * 0.01, null);`, `        if (u.burnUntil > t) applyTrue(u, u.maxHp * (u.burnPct || 0.01) * (u.burnMul || 1), null);`);

swap(`    /* início: escudos e efeitos instantâneos */`, `    /* ---------- Aumentos: montagem do combate ---------- */
    function buildAugments(team, side) {
      const hooks = { side, damageMul: [], dealt: [], critHit: [], abilityCrit: [], allyDeath: [], enemyDeath: [], kill: [], hpBelow: [], cast: [], attackHit: [], end: [], timers: [] };
      augHooks[side] = hooks;
      const mine = units.filter(u => u.side === side && u.champ);
      const others = () => alive(1 - side);
      const c = {
        units: mine, level: team.level || 1, stage: team.stage || 1, state: {}, pickedRounds: 0,
        alive: () => alive(side), enemies: others,
        enemiesNear: u => others().sort((a, b) => dist(u, a) - dist(u, b)),
        dist, now: () => t,
        after(sec, fn) { hooks.timers.push({ at: sec, fn }); },
        every(sec, fn) { hooks.timers.push({ at: sec, every: sec, fn }); },
        onKill: fn => hooks.kill.push(fn),
        onEnemyDeath: fn => hooks.enemyDeath.push(fn),
        onAllyDeath: fn => hooks.allyDeath.push(fn),
        onCast: fn => hooks.cast.push(fn),
        onAttackHit: fn => hooks.attackHit.push(fn),
        onDealt: fn => hooks.dealt.push(fn),
        onCritHit: fn => hooks.critHit.push(fn),
        onAbilityCrit: fn => hooks.abilityCrit.push(fn),
        onDamageMul: fn => hooks.damageMul.push(fn),
        onHpBelow: (pct, fn) => hooks.hpBelow.push({ pct, fn }),
        onEnd: fn => hooks.end.push(fn),
        sample(list, n) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); },
        chance: p => rng() < p,
        heal, stun: (u, sec) => stun(u, sec, null),
        shield: (u, v, d) => addShield(u, v, d),
        startShield: (u, v, d) => addShield(u, v, d),
        trueHit: (src, tgt, v) => hit(src, tgt, v, 't', { noProc: true }),
        magicHit: (src, tgt, v) => hit(src, tgt, v, 'm', { noProc: true, ability: true }),
        physicalHit: (src, tgt, v) => hit(src, tgt, v, 'p', { noProc: true }),
        gold: n => { augGold[side] += n; },
        perm: (u, perm) => { if (u.uid != null) permGains.push({ side, uid: u.uid, perm }); },
        activeTraits() { const counts = traitCountsOf(mine, u => u.champ); return Object.entries(counts).filter(([n, k]) => k > 1 && activeTier(n, k)).length; },
        bronzeTraits() { const counts = traitCountsOf(mine, u => u.champ); return Object.entries(counts).filter(([n, k]) => { const tiers = TRAITS[n] ? TRAITS[n].tiers : []; return tiers.length && k >= tiers[0].min && (tiers.length === 1 || k < tiers[1].min); }).length; },
        benchRightOccupied: n => (team.benchRight || []).slice(-n).filter(Boolean).length,
      };
      for (const a of team.augs) {
        const fx = AUG_FX[a.id];
        if (!fx || !fx.combat) continue;
        c.state = a.state;
        c.pickedRounds = Math.max(0, (team.roundIdx || 0) - (a.state.pickedRound || 0));
        fx.combat(c, AUG[a.id].fx);
      }
      if (team.mods && team.mods.burnBonus) others().forEach(e => { e.burnMul = 1 + team.mods.burnBonus; });
      for (const u of mine) {
        u.ad = u.baseAd * (1 + (u.adPct || 0));
        u.hp = u.maxHp * (u.startHpPct || 1);
        u.start = statsOf(u);
      }
    }
    [teamA, teamB].forEach((team, side) => { if (team.augs && team.augs.length) buildAugments(team, side); });

    /* início: escudos e efeitos instantâneos */`);
swap(`    const goldDrops = [0, 0];`, `    const goldDrops = [0, 0];
    const augHooks = [null, null];
    const augGold = [0, 0];
    const permGains = [];`);
swap(`      if (tick % 20 === 0) everySecond(tick / 20);
`, `      if (tick % 20 === 0) everySecond(tick / 20);
      for (const hk of augHooks) {
        if (!hk) continue;
        for (const timer of hk.timers) {
          if (timer.at > t) continue;
          timer.fn();
          timer.at = timer.every ? timer.at + timer.every : Infinity;
        }
      }
`);
swap(`    const a0 = alive(0).length, a1 = alive(1).length;
`, `    const a0 = alive(0).length, a1 = alive(1).length;
    augHooks.forEach((hk, side) => { if (hk) hk.end.forEach(fn => fn(alive(side))); });
`);
swap(`      winner, survivors: winner === 0 ? a0 : winner === 1 ? a1 : 0, duration: t, goldDrops, frames,`, `      winner, survivors: winner === 0 ? a0 : winner === 1 ? a1 : 0, duration: t, goldDrops, frames, permGains, augGold,
      deaths: [units.filter(u => u.side === 0 && !u.alive).length, units.filter(u => u.side === 1 && !u.alive).length],`);

/* ---------- Bots e estado ---------- */
swap(`  function botPlan(g, who) {
    const p = g.players[who];`, `  function botPlan(g, who) {
    const p = g.players[who];
    HOOK_G = g;
    settleChoices(g, p);`);
swap(`        bench: me.bench, board: me.board, items: me.items, shop: me.shop, locked: me.locked, carousel: me.carousel, chrome: me.chrome,`, `        bench: me.bench, board: me.board, items: me.items, shop: me.shop, locked: me.locked, carousel: me.carousel, chrome: me.chrome,
        augments: me.augments, offer: me.offer, choices: me.choices, freeRerolls: me.freeRerolls,`);
swap(`    D, CH, CH_BY_NAME, TRAITS, ITEMS, COMPONENTS, RULES, CREEPS, TRAIT_TEXT, ITEM_TEXT, ABILITIES, GEO,`, `    D, CH, CH_BY_NAME, TRAITS, ITEMS, COMPONENTS, RULES, CREEPS, TRAIT_TEXT, ITEM_TEXT, ABILITIES, GEO, AUG, AUG_FX, augImplemented, pickAugment, makeOffer, settleChoices,`);

fs.writeFileSync(file, s);
console.log("motor ligado aos aumentos");
