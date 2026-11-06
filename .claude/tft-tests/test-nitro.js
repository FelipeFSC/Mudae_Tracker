// Nitro da Season 14: robô R-080T / T-43X, Cromo e laser. Uso: node test-nitro.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const id = n => E.CH_BY_NAME[n].id;
const newGame = (mode) => { const g = mode === "chaos" ? E.createChaosGame({ name: "A", seed: 5 }) : E.createGame({ names: ["A", "B"], seed: 5, bots: [false, true] }); E.nextRound(g); return g; };
const put = (g, p, name, x, y, star = 1) => { const u = { uid: g.nextUid++, c: id(name), star, items: [] }; p.board[`${x},${y}`] = u; return u; };
const mechOf = p => Object.values(p.board).find(u => u.summon);

console.log("Robô no tabuleiro");
{
  const g = newGame(); const p = g.players[0];
  for (const k of Object.keys(p.board)) delete p.board[k];
  put(g, p, "Kindred", 0, 3); put(g, p, "Nidalee", 1, 0);
  E.act(g, 0, { a: "lock" }); E.act(g, 0, { a: "lock" });
  ok("2 Nitro: sem robô", !mechOf(p));
  put(g, p, "Shyvana", 2, 0);
  E.act(g, 0, { a: "lock" }); E.act(g, 0, { a: "lock" });
  const m = mechOf(p);
  ok("3 Nitro: R-080T aparece", m && m.c === "R-080T", m && m.c);
  ok("robô não ocupa vaga do time", E.publicState(g, 0) && Object.values(p.board).filter(u => !u.summon).length === 3);
  ok("robô não pode ser vendido", E.act(g, 0, { a: "sell", uid: m.uid }) === "O robô não pode ser vendido.");
  const key = Object.keys(p.board).find(k => p.board[k] === m);
  const [x, y] = key.split(",").map(Number);
  ok("robô não vai para o banco", E.act(g, 0, { a: "move", from: { x, y }, to: { b: 0 } }) === "O robô fica no tabuleiro.");
  ok("robô muda de casa", !E.act(g, 0, { a: "move", from: { x, y }, to: { x: 6, y: 3 } }) && p.board["6,3"] === m);
  p.items.push("BFSword");
  ok("robô recebe item", !E.act(g, 0, { a: "equip", uid: m.uid, item: p.items.indexOf("BFSword") }) && m.items.includes("BFSword"));
  const shy = Object.entries(p.board).find(([, u]) => u.c === id("Shyvana"));
  delete p.board[shy[0]];
  E.act(g, 0, { a: "lock" });
  ok("trait desliga: robô some e devolve o item", !mechOf(p) && p.items.includes("BFSword"));
}

console.log("Cromo");
{
  const g = newGame(); const p = g.players[0];
  for (const k of Object.keys(p.board)) delete p.board[k];
  put(g, p, "Kindred", 0, 3, 2); put(g, p, "Kindred", 1, 3, 1); put(g, p, "Nidalee", 2, 0, 1); put(g, p, "Elise", 3, 0, 3);
  p.chrome = 0;
  E.startCombat(g); E.finishCombat(g);
  // Kindred único (maior estrela 2 = 3), Nidalee 1★ = 2, Elise 3★ = 6
  ok("Cromo por Nitro único e estrela: 3 + 2 + 6", p.chrome === 11, p.chrome);
  p.chrome = 199; E.act(g, 0, { a: "lock" }); E.act(g, 0, { a: "lock" });
  ok("199 de Cromo ainda é R-080T", mechOf(p) && mechOf(p).c === "R-080T");
  p.chrome = 200; E.act(g, 0, { a: "lock" });
  ok("200 de Cromo vira T-43X", mechOf(p) && mechOf(p).c === "T-43X");
}
{
  const g = newGame("chaos"); const p = g.players[0];
  for (const k of Object.keys(p.board)) delete p.board[k];
  put(g, p, "Kindred", 0, 3, 1); put(g, p, "Nidalee", 1, 3, 1); put(g, p, "Shyvana", 2, 0, 2);
  p.chrome = 0;
  E.startCombat(g); E.finishCombat(g);
  ok("Horuja: tabela 4/6/10/14 (4 + 4 + 6)", p.chrome === 14, p.chrome);
}

console.log("Combate");
{
  const mech = (chrome, laser = false, stage = 3) => ({ c: "R-080T", star: 1, x: 3, y: 0, items: [], summon: true, chrome, laser, stage, fullMana: true });
  const foes = { units: [["Poppy", 3, 0], ["Jax", 2, 0], ["Vi", 4, 0], ["Zyra", 3, 3]].map(([c, x, y]) => ({ c: id(c), star: 1, x, y, items: [] })) };
  let start = null, stuns = 0, hitIds = new Set(), laserEv = false;
  const f = E.simulate({ units: [mech(100)] }, foes, 3, (t, units) => { if (!start) start = { ...units[0] }; });
  const v = E.TRAITS.Nitro.tiers[0];
  ok("Cromo vira Vida do robô", Math.abs(start.maxHp - (500 + 100 * v.HealthPerScrap)) < 1e-6, start.maxHp);
  ok("Cromo vira PH do robô", Math.abs(start.ap - (100 + 100 * v.APPerScrap)) < 1e-6, start.ap);
  const first = f.frames.find(fr => fr.e.some(e => e[0] === "c" && e[1] === 1));
  for (const fr of f.frames.filter(fr => fr.t <= (first ? first.t + 0.6 : 0))) for (const e of fr.e) { if (e[0] === "st") stuns++; if (e[0] === "d" && e[1] !== 1) hitIds.add(e[1]); }
  ok("granadas atingem 3 inimigos e atordoam", hitIds.size >= 3 && stuns >= 3, `${hitIds.size} alvos, ${stuns} atordoamentos`);
  const g2 = E.simulate({ units: [mech(0, true)] }, foes, 3);
  laserEv = g2.frames.some(fr => fr.e.some(e => e[0] === "a" && e[3] === "laser"));
  ok("4 Nitro: laser gigante", laserEv);
  const g3 = E.simulate({ units: [mech(0, false)] }, foes, 3);
  ok("3 Nitro: sem laser", !g3.frames.some(fr => fr.e.some(e => e[0] === "a" && e[3] === "laser")));
  let t43 = null;
  E.simulate({ units: [{ ...mech(250), c: "T-43X" }] }, foes, 3, (t, units) => { if (!t43) t43 = { ...units[0] }; });
  ok("T-43X usa atributos próprios (800 de Vida base)", Math.abs(t43.maxHp - (800 + 250 * v.HealthPerScrap)) < 1e-6, t43.maxHp);
}

console.log("Nitro não dá mais bônus ao campeão mais forte");
{
  const units = [["Kindred", 0, 3], ["Nidalee", 1, 3], ["Shyvana", 2, 0]].map(([c, x, y]) => ({ c: id(c), star: 2, x, y, items: [] }));
  const a = E.simulate({ units, chrome: 150 }, { units: [{ c: id("Jax"), star: 1, x: 3, y: 0, items: [] }] }, 3).meta;
  const b = E.simulate({ units, chrome: 0 }, { units: [{ c: id("Jax"), star: 1, x: 3, y: 0, items: [] }] }, 3).meta;
  ok("Cromo não altera os Nitro", JSON.stringify(a.map(m => m.stats)) === JSON.stringify(b.map(m => m.stats)));
}

console.log(`${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
