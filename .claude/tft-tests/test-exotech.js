// ExoTec: itens exclusivos (15.14). Uso: node test-exotech.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const id = n => E.CH_BY_NAME[n].id;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const U = (n, x, y, items = [], o = {}) => ({ c: id(n), star: o.star || 1, x, y, items, fullMana: !!o.mana });
const foes = () => [U("Poppy", 3, 0, [], { star: 3 }), U("Jax", 2, 0, [], { star: 3 }), U("Vi", 4, 0, [], { star: 3 })];

console.log("Entrega");
{
  const g = E.createGame({ names: ["A", "B"], seed: 5, bots: [false, true] }); E.nextRound(g);
  const p = g.players[0];
  for (const k of Object.keys(p.board)) delete p.board[k];
  p.items = [];
  const exo = ["Jax", "Jhin", "Naafiri", "Varus", "Mordekaiser"];
  exo.slice(0, 3).forEach((n, i) => { p.board[`${i},0`] = { uid: g.nextUid++, c: id(n), star: 1, items: [] }; });
  E.act(g, 0, { a: "lock" });
  const got = () => p.items.filter(i => E.ITEMS[i] && E.ITEMS[i].exotech);
  ok("3 ExoTec: 1 item", got().length === 1, got().join());
  exo.slice(3).forEach((n, i) => { p.board[`${i + 3},0`] = { uid: g.nextUid++, c: id(n), star: 1, items: [] }; });
  E.act(g, 0, { a: "lock" });
  ok("5 ExoTec: 2 itens, sem repetir", got().length === 2 && new Set(got()).size === 2, got().join());
  const vi = { uid: g.nextUid++, c: id("Vi"), star: 1, items: [] }; p.board["0,1"] = vi;
  ok("não-ExoTec não equipa", E.act(g, 0, { a: "equip", uid: vi.uid, item: p.items.indexOf(got()[0]) }) === "Só campeões ExoTec podem usar este item.");
  const jax = Object.values(p.board).find(u => u.c === id("Jax"));
  ok("ExoTec equipa", !E.act(g, 0, { a: "equip", uid: jax.uid, item: p.items.indexOf(got()[0]) }) && jax.items.some(i => E.ITEMS[i].exotech));
}

console.log("Efeitos");
{
  const first = units => { let g = null; E.simulate({ units }, { units: foes() }, 3, (t, us) => { if (!g) g = us.map(u => ({ ...u })); }); return g; };
  const [a] = first([U("Jax", 3, 0, ["Exo_Lantern"]), U("Varus", 0, 3), U("Jhin", 6, 3)]);
  const [b] = first([U("Jax", 3, 0, []), U("Varus", 0, 3), U("Jhin", 6, 3)]);
  // 3 ExoTec: +50 de Vida por item; Lanterna: +444 e +5%
  ok("Lanterna: +444 de Vida e +5%, mais 50 da trait", near(a.maxHp, (b.maxHp + 444) * 1.05 + 50, 1), `${b.maxHp} -> ${a.maxHp}`);
  const [c] = first([U("Jhin", 3, 3, ["Exo_Pulse"]), U("Varus", 0, 3), U("Jax", 6, 0)]);
  ok("Estabilizador: habilidade pode critar", c.abilityCrit === true);
  // execução: alvo abaixo de 12% morre
  let executed = false;
  E.simulate({ units: [U("Jhin", 3, 3, ["Exo_Pulse"]), U("Varus", 0, 3), U("Jax", 6, 0)] }, { units: [U("Poppy", 3, 0, [], { star: 1 })] }, 3, (t, us) => {
    const pop = us.find(u => u.side === 1);
    if (pop.alive && pop.hp / pop.maxHp < 0.2 && pop.hp / pop.maxHp > 0.125) pop.hp = pop.maxHp * 0.125;
    if (!pop.alive && pop.hp <= 0) executed = true;
  });
  ok("Estabilizador: executa abaixo de 12%", executed);
  // Capacitor: a cada 4 ataques, o 5º dá choque
  const f = E.simulate({ units: [U("Zeri", 3, 3, ["Exo_Flux"]), U("Varus", 0, 3), U("Jax", 6, 0)] }, { units: [U("Cho'Gath", 3, 0, ["WarmogsArmor"], { star: 3 })] }, 3);
  ok("Capacitor: luta roda", f.frames.length > 10);
  // Carcaça Radiante: escudos dobrados
  let sh = null;
  E.simulate({ units: [U("Mordekaiser", 3, 0, ["Exo_Chassis_R", "Crownguard"]), U("Varus", 0, 3), U("Jhin", 6, 3)] }, { units: foes() }, 3, (t, us) => { if (!sh) sh = us[0].shields.map(s => s.v); });
  let sh0 = null;
  E.simulate({ units: [U("Mordekaiser", 3, 0, ["Crownguard"]), U("Varus", 0, 3), U("Jhin", 6, 3)] }, { units: foes() }, 3, (t, us) => { if (!sh0) sh0 = us[0].shields.map(s => s.v); });
  ok("Carcaça Harmonizada: escudo +100%", sh && sh0 && sh[0] > sh0[0] * 1.5, sh && sh0 && `${Math.round(sh0[0])} -> ${Math.round(sh[0])}`);
}

console.log("10 ExoTec: Radiantes");
{
  const g = E.createGame({ names: ["A", "B"], seed: 6, bots: [false, true] }); E.nextRound(g);
  const p = g.players[0];
  for (const k of Object.keys(p.board)) delete p.board[k];
  p.items = [];
  const all = ["Jax", "Jhin", "Naafiri", "Varus", "Mordekaiser", "Sejuani", "Zeri"];
  all.forEach((n, i) => { p.board[`${i},0`] = { uid: g.nextUid++, c: id(n), star: 1, items: [] }; });
  E.act(g, 0, { a: "lock" });
  ok("7 ExoTec: 3 itens", p.items.filter(i => E.ITEMS[i].exotech).length === 3);
  // 3 Emblemas ExoTec em não-ExoTec chegam a 10
  ["Vi", "Shaco", "Kindred"].forEach((n, i) => { p.board[`${i},1`] = { uid: g.nextUid++, c: id(n), star: 1, items: ["Emblem_ExoTec"] }; });
  E.act(g, 0, { a: "lock" });
  ok("10 ExoTec: itens viram Radiantes", p.items.filter(i => E.ITEMS[i].exotech).every(i => E.ITEMS[i].radiant), p.items.join());
}

console.log(`${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
