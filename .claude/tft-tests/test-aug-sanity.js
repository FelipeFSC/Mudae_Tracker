// Cada aumento implementado: escolha + combate sem NaN. Uso: node test-aug-sanity.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
let bad = 0, n = 0;
const id = name => E.CH_BY_NAME[name].id;
for (const a of Object.values(E.AUG)) {
  if (!E.augImplemented(a.id)) continue;
  n++;
  try {
    const g = E.createGame({ names: ["A", "B"], seed: 11, bots: [true, true] }); E.nextRound(g);
    const p = g.players[0];
    E.pickAugment(g, p, a.id);
    const units = [["Jax", 0, 0, ["GiantsBelt"]], ["Jinx", 2, 3, ["BFSword", "Crownguard"]], ["Veigar", 4, 3, []], ["Leona", 3, 0, ["InfinityEdge"]]]
      .map(([c, x, y, items], i) => ({ uid: 900 + i, c: id(c), star: 2, x, y, items }));
    const team = { units, augs: p.augments.map(x => ({ id: x, state: p.augState[x] || {} })), level: 7, stage: 3, playerHp: 60, roundIdx: 10 };
    const foe = { units: [["Poppy", 3, 0], ["Zed", 2, 2], ["Brand", 4, 3]].map(([c, x, y]) => ({ c: id(c), star: 2, x, y, items: [] })) };
    const f = E.simulate(team, foe, 5);
    const nums = JSON.stringify(f.meta.map(m => m.stats)) + JSON.stringify([f.duration, f.augGold]);
    if (/NaN|null/.test(nums) || !Number.isFinite(p.gold)) { bad++; console.log("  FAIL", a.id, a.name, nums.slice(0, 160)); }
  } catch (e) { bad++; console.log("  FAIL", a.id, a.name, e.message); }
}
console.log(`${n - bad} ok, ${bad} falhas (de ${n} implementados)`);
process.exit(bad ? 1 : 0);
