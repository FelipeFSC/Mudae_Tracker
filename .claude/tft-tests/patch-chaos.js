// Modo Caos no motor e na tela. Aplicado uma vez; aborta se algo não bater.
const fs = require("fs"), path = require("path");
const root = process.argv[2];
const edit = (name, changes) => {
    const file = path.join(root, name);
    let s = fs.readFileSync(file, "utf8");
    for (const [from, to, all] of changes) {
        const n = s.split(from).length - 1;
        if (all ? n === 0 : n !== 1) throw new Error(`${name}: achei ${n}: ${from.slice(0, 70)}`);
        s = s.split(from).join(to);
    }
    fs.writeFileSync(file, s);
};
edit("tft-engine.js", [
    [`  const REMOVER = 'MagneticRemover';`, `  const CHAOS_ROUNDS = typeof TFT_CHAOS_ROUNDS !== 'undefined' ? TFT_CHAOS_ROUNDS : require('./tft-chaos.js');
  const REMOVER = 'MagneticRemover';`],
    [`  function roundInfo(idx) {
`, `  function roundInfo(idx, mode) {
    if (mode === 'chaos') {
      const stage = 1 + Math.floor(idx / 10), n = 1 + idx % 10;
      return { stage, n, label: \`\${stage}-\${n}\`, type: CHAOS_ROUNDS[idx] && CHAOS_ROUNDS[idx].boss ? 'boss' : 'chaos' };
    }
`],
    [`roundInfo(g.roundIdx)`, `roundInfo(g.roundIdx, g.mode)`, true],
    [`stageNow: () => roundInfo(Math.max(0, g.roundIdx)).stage,`, `stageNow: () => roundInfo(Math.max(0, g.roundIdx), g.mode).stage,`],
    [`stage: HOOK_G ? roundInfo(Math.max(0, HOOK_G.roundIdx)).stage : 1,`, `stage: HOOK_G ? roundInfo(Math.max(0, HOOK_G.roundIdx), HOOK_G.mode).stage : 1,`],
    [`    const info = g.roundIdx >= 0 ? roundInfo(g.roundIdx, g.mode) : null;
    const me = g.players[viewer];`, `    const info = g.roundIdx >= 0 ? roundInfo(g.roundIdx, g.mode) : null;
    const me = g.players[viewer];
    const chaos = g.mode === 'chaos' ? { score: g.score, won: !!g.chaosWon, roundName: CHAOS_ROUNDS[Math.max(0, g.roundIdx)].name, lives: me.hp } : null;`],
    [`      phase: g.phase, round: info, viewer, winner: g.winner, log: g.log.slice(-12),`, `      phase: g.phase, round: info, viewer, winner: g.winner, log: g.log.slice(-12), mode: g.mode || null, chaos,`],
    [`  function createGame({ names, seed, bots = [], skins = {} }) {`, `  function createChaosGame({ name, seed, skins = {} }) {
    const g = createGame({ names: [name, 'Horuja'], seed, bots: [false, true], skins });
    g.mode = 'chaos';
    g.score = 0;
    g.noAugmentRounds = true;
    const p = g.players[0];
    p.hp = 3;
    p.maxHp = 3;
    p.gold = 3;
    p.level = 2;
    p.items.push(REMOVER);
    g.players[1].hp = 30;
    g.players[1].maxHp = 30;
    return g;
  }

  /* time inimigo de uma rodada do caos */
  function chaosTeam(idx) {
    const round = CHAOS_ROUNDS[idx];
    const units = [];
    const front = [3, 2, 4, 1, 5, 0, 6], back = [3, 2, 4, 1, 5, 0, 6];
    let f = 0, b = 0;
    const spot = range => {
      if (range <= 2) { const i = f++; return { x: front[i % 7], y: i < 7 ? 0 : 1 }; }
      const i = b++;
      return { x: back[i % 7], y: i < 7 ? 3 : 2 };
    };
    for (const [name, star, items, count = 1] of round.units || []) {
      const ch = CH_BY_NAME[name];
      for (let i = 0; i < count; i++) units.push({ c: ch.id, star, items: items.slice(), uid: null, ...spot(ch.range) });
    }
    const creeps = (round.creeps || []).map(key => { const pos = spot(CREEPS[key].range); return { key, spot: \`\${pos.x},\${pos.y}\` }; });
    return { units, creeps, chrome: 0 };
  }

  function grantReward(g, p, reward) {
    const api = augApi(g, p, null);
    if (reward.gold) api.gold(reward.gold);
    if (reward.comps) api.comps(reward.comps);
    (reward.unit || []).forEach(cost => api.unit(cost));
    (reward.item || []).forEach(id => api.item(id));
    if (reward.dup) api.dup(reward.dup, 1);
    if (reward.reforger) api.reforger(reward.reforger);
    if (reward.anvil) api.anvil(reward.anvil);
    api.rerolls(1);
  }

  const CHAOS_AUGMENT = { '1-5': 2, '2-5': 2, '3-5': 3 };
  function chaosNextRound(g) {
    const p = g.players[0];
    const info = roundInfo(g.roundIdx, 'chaos');
    p.ready = false;
    p.lastResult = null;
    g.players[1].ready = true;
    if (g.roundIdx > 0) {
      const mods = playerMods(g, p);
      p.lastInterest = Math.min(mods.interestCap != null ? mods.interestCap : 5, Math.floor(p.gold / 10));
      p.gold += p.lastInterest;
      augApi(g, p, null).xp(RULES.roundXp);
    }
    p.boughtLast = p.boughtThisRound;
    p.boughtThisRound = 0;
    if (p.lockedRounds > 0) p.lockedRounds--;
    if (p.shopOff > 0) { p.shopOff--; p.shop = p.shop.map(() => null); }
    else if (!p.locked) refreshShop(g, p);
    runHook(g, p, 'round', { ...info, type: 'pvp' });
    if (info.n === 1 && info.stage >= 2) runHook(g, p, 'stage', info);
    if (CHAOS_AUGMENT[info.label] != null) makeOffer(g, p, CHAOS_AUGMENT[info.label], 'horuja');
    g.pairs = null;
    g.combat = null;
    g.phase = 'plan';
    return info;
  }

  function finishChaos(g) {
    const p = g.players[0];
    const c = g.combat;
    const f = c.fights[0];
    const round = CHAOS_ROUNDS[g.roundIdx];
    settleAugments(g, c);
    p.gold += f.goldDrops[0];
    const won = f.winner === 0;
    if (won) {
      grantReward(g, p, round.reward);
      g.score += (round.boss ? 500 : 100) * (1 + Math.floor(g.roundIdx / 10)) + 25 * f.survivors + 25 * p.hp;
      p.lastResult = { res: 'win', dmg: 0 };
      addLog(g, \`\${roundInfo(g.roundIdx, 'chaos').label}: venceu \${round.name}\`);
    } else {
      p.hp -= 1;
      p.lastResult = { res: 'lose', dmg: 1 };
      addLog(g, \`\${roundInfo(g.roundIdx, 'chaos').label}: perdeu para \${round.name} (−1 vida)\`);
    }
    g.combat = null;
    if (p.hp <= 0) {
      g.phase = 'end';
      p.alive = false;
      p.placement = 2;
      g.players[1].placement = 1;
      g.winner = 1;
      return;
    }
    if (g.roundIdx >= CHAOS_ROUNDS.length - 1) {
      g.phase = 'end';
      g.chaosWon = true;
      p.placement = 1;
      g.players[1].placement = 2;
      g.players[1].alive = false;
      g.winner = 0;
      return;
    }
    nextRound(g);
  }

  function createGame({ names, seed, bots = [], skins = {} }) {`],
    [`    g.roundIdx++;
    if (!g.augTiers) g.augTiers = rollTiers(g);`, `    g.roundIdx++;
    if (g.mode === 'chaos') return chaosNextRound(g);
    if (!g.augTiers) g.augTiers = rollTiers(g);`],
    [`    alivePlayers(g).forEach(autoField);
    const seed =`, `    if (g.mode === 'chaos') {
      const p = g.players[0];
      autoField(p);
      const seedC = (g.seed ^ (g.roundIdx * 7919 + 13)) >>> 0;
      const round = CHAOS_ROUNDS[g.roundIdx];
      g.combat = { kind: 'pve', fights: [{ ...simulate(teamFromPlayer(p), chaosTeam(g.roundIdx), seedC), a: 0, b: null, names: [p.name, round.name] }] };
      g.phase = 'combat';
      return g.combat;
    }
    alivePlayers(g).forEach(autoField);
    const seed =`],
    [`  function finishCombat(g) {
`, `  function finishCombat(g) {
    if (g.mode === 'chaos') return finishChaos(g);
`],
    [`    // Aumentos: ganhos permanentes e efeitos de fim de combate
    for (const f of c.fights) {`, `    settleAugments(g, c);
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
    if (g.phase !== 'end') nextRound(g);
  }

  /* Aumentos: ganhos permanentes e efeitos de fim de combate */
  function settleAugments(g, c) {
    for (const f of c.fights) {`],
    [`    }
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
    if (g.phase !== 'end') nextRound(g);
  }

  /* sai da partida:`, `    }
  }

  /* sai da partida:`],
    [`          p.items.splice(a.item, 1);
          p.items.push(...u.items);
          u.items = [];`, `          if (g.mode !== 'chaos') p.items.splice(a.item, 1); // no caos, o Removedor Dourado não acaba
          p.items.push(...u.items);
          u.items = [];`],
    [`    HOOK_G = g;
    settleChoices(g, p);
    const info = roundInfo(g.roundIdx, g.mode);`, `    HOOK_G = g;
    if (g.mode === 'chaos') { p.ready = true; return; }
    settleChoices(g, p);
    const info = roundInfo(g.roundIdx, g.mode);`],
    [`makeRng, roundInfo, buildSkins, applyCollection, createGame,`, `makeRng, roundInfo, buildSkins, applyCollection, createGame, createChaosGame, chaosTeam, CHAOS_ROUNDS,`],
]);
edit("tft.js", [
    [`  function startRoomGame() {`, `  function startChaosGame() {
    const seed = Math.floor(Math.random() * 4294967296);
    L.skins = E.applyCollection(E.buildSkins([L.roster], seed), TFTCollection.pins());
    L.mode = 'bot';
    L.viewer = 0;
    L.scout = null;
    L.g = E.createChaosGame({ name: myName(), seed, skins: L.skins });
    openGame();
    E.nextRound(L.g);
    enterPhase();
    stopLoop();
    L.timerLoop = setInterval(hostTick, 200);
  }

  function startRoomGame() {`],
    [`    if (g.phase === 'plan') {
      setDeadline(E.RULES.planSeconds);`, `    if (g.phase === 'plan') {
      setDeadline(g.mode === 'chaos' ? 86400 : E.RULES.planSeconds); // no caos não há cronômetro`],
    [`    const pct = Math.max(0, p.hp);
`, `    const pct = L.st && L.st.mode === 'chaos' ? Math.max(0, (p.hp / (own ? 3 : 30)) * 100) : Math.max(0, p.hp);
`],
    [`  const ROUND_ICON = { pvp: '⚔', pve: '🐾', carousel: '🎁' };`, `  const ROUND_ICON = { pvp: '⚔', pve: '🐾', carousel: '🎁', chaos: '🦉', boss: '💀' };`],
    [`    byId('roundLabel').textContent = \`Rodada \${r.label} · \${phaseName}\`;
    const count = r.stage === 1 ? 4 : 7;
    let track = '';
    for (let n = 1; n <= count; n++) {
      const idx = r.stage === 1 ? n - 1 : 4 + (r.stage - 2) * 7 + (n - 1);
      const info = E.roundInfo(idx);`, `    byId('roundLabel').textContent = st.mode === 'chaos'
      ? \`Caos \${r.label} · \${st.chaos.roundName} · \${st.chaos.lives} vidas · \${st.chaos.score.toLocaleString('pt-BR')} pts\`
      : \`Rodada \${r.label} · \${phaseName}\`;
    const count = st.mode === 'chaos' ? 10 : r.stage === 1 ? 4 : 7;
    let track = '';
    for (let n = 1; n <= count; n++) {
      const idx = st.mode === 'chaos' ? (r.stage - 1) * 10 + (n - 1) : r.stage === 1 ? n - 1 : 4 + (r.stage - 2) * 7 + (n - 1);
      const info = E.roundInfo(idx, st.mode);`],
    [`      if (L.st.phase === 'plan') btn.textContent = \`\${L.st.you.ready ? 'AGUARDANDO' : 'PRONTO'} · \${Math.ceil(left)}s\`;`, `      if (L.st.phase === 'plan') btn.textContent = L.st.mode === 'chaos' ? 'LUTAR!' : \`\${L.st.you.ready ? 'AGUARDANDO' : 'PRONTO'} · \${Math.ceil(left)}s\`;`],
    [`    byId('btnBot').addEventListener('click', startBotGame);`, `    byId('btnBot').addEventListener('click', startBotGame);
    byId('btnChaos').addEventListener('click', startChaosGame);`],
]);
edit("tft.html", [
    [`    <div class="lobby-actions">
      <button class="btn primary" id="btnBot">JOGAR CONTRA O BOT</button>`, `    <button class="btn chaos-btn" id="btnChaos">🦉 DESAFIO DA HORUJA: MODO CAOS</button>
    <div class="lobby-actions">
      <button class="btn primary" id="btnBot">JOGAR CONTRA O BOT</button>`],
    [`<script src="tft-engine.js?v=9"></script>`, `<script src="tft-chaos.js?v=1"></script>
<script src="tft-engine.js?v=10"></script>`],
    [`tft-augments.js, tft-augments-data.js e o link`, `tft-augments.js, tft-augments-data.js, tft-chaos.js e o link`],
    [`<link rel="stylesheet" href="tft.css?v=14">`, `<link rel="stylesheet" href="tft.css?v=15">`],
    [`<script src="tft.js?v=13"></script>`, `<script src="tft.js?v=14"></script>`],
]);
edit("tft.css", [
    [`/* ============ AUMENTOS ============ */`, `/* ============ MODO CAOS ============ */
.chaos-btn { border-color: var(--green); color: var(--green); font-weight: 800; }
.lobby-box.in-room .chaos-btn { display: none; }
.stars.s4 { color: #34f5a4; text-shadow: 0 0 4px #34f5a4; }
.star4 .stars { font-size: clamp(11px, 1.5cqw, 17px); }
.unit.star4 .hexpic { background: #34f5a4; }

/* ============ AUMENTOS ============ */`],
]);
console.log("caos ligado");
