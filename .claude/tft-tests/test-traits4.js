// Traits que mudam habilidades: Ciberchefão, A.M.P., Transgressor (Rei do Crime). Uso: node test-traits4.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const id = n => E.CH_BY_NAME[n].id;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const U = (n, x, y, o = {}) => ({ c: id(n), star: o.star || 1, x, y, items: o.items || [], fullMana: !!o.mana, kingpin: !!o.kingpin });
function first(A, B) { let got = null; E.simulate({ units: A }, { units: B }, 3, (t, us) => { if (!got) got = us.map(u => ({ ...u })); }); return got; }
const dummies = () => [U("Poppy", 3, 0, { star: 3 }), U("Jax", 2, 0, { star: 3 }), U("Vi", 4, 0, { star: 3 }), U("Alistar", 3, 1, { star: 3 })];
const damagedIds = (f, until) => { const s = new Set(); for (const fr of f.frames) { if (fr.t > until) break; for (const e of fr.e) if (e[0] === "d") s.add(e[1]); } return s; };

console.log("Ciberchefão");
{
  const one = first([U("Veigar", 3, 3), U("Kindred", 0, 3)], dummies());
  const two = first([U("Veigar", 3, 3, { star: 2 }), U("Poppy", 0, 0)], dummies());
  ok("1 Ciberchefão: sem forma final", !one.find(u => u.champ === id("Veigar")).cyberboss);
  const v2 = two.find(u => u.champ === id("Veigar")), p2 = two.find(u => u.champ === id("Poppy") && u.side === 0);
  ok("2: o mais forte vira forma final", v2.cyberboss && !p2.cyberboss);
  ok("2: só o mais forte recebe +20 de PH", near(v2.ap, 120) && near(p2.ap, 100), `${v2.ap}/${p2.ap}`);
  const four = first([U("Veigar", 3, 3, { star: 2 }), U("Poppy", 0, 0), U("Ziggs", 1, 3), U("Kobuko", 2, 0)], dummies());
  const mine = four.filter(u => u.side === 0);
  ok("4: todos viram forma final", mine.every(u => u.cyberboss));
  ok("4: o mais forte (Veigar 2★) recebe +40 de PH", near(mine.find(u => u.champ === id("Veigar")).ap, 140) && mine.filter(u => u.ap === 100).length === 3, mine.map(u => u.ap).join("/"));
  // Veigar sem forma final não atinge os adjacentes
  const solo = E.simulate({ units: [U("Veigar", 3, 3, { mana: true })] }, { units: [U("Poppy", 3, 0), U("Jax", 2, 0), U("Vi", 4, 0)] }, 3);
  const boss = E.simulate({ units: [U("Veigar", 3, 3, { mana: true, star: 2 }), U("Poppy", 0, 3)] }, { units: [U("Poppy", 3, 0), U("Jax", 2, 0), U("Vi", 4, 0)] }, 3);
  const firstCast = f => f.frames.find(fr => fr.e.some(e => e[0] === "c" && e[1] === 1));
  const hitAt = (f) => { const c = firstCast(f); if (!c) return 0; const ids = new Set(); for (const fr of f.frames.filter(x => x.t >= c.t && x.t <= c.t + 0.6)) for (const e of fr.e) if (e[0] === "d" && e[1] > 1 && e[1] !== 2) ids.add(e[1]); return ids.size; };
  ok("Veigar comum: só o alvo", hitAt(solo) <= 1, hitAt(solo));
  ok("Veigar forma final: atinge em volta", hitAt(boss) >= 2, hitAt(boss));
}

console.log("A.M.P.");
{
  const amp = (n) => [U("Samira", 3, 0), U("Nidalee", 2, 0), U("Yuumi", 4, 3), U("Naafiri", 1, 0), U("Annie", 5, 3)].slice(0, n);
  const st = first(amp(5), dummies()).filter(u => u.side === 0);
  ok("5 A.M.P.: Amp 5", st.every(u => u.ampLevel === 5), st.map(u => u.ampLevel).join());
  const y = st.find(u => u.champ === id("Yuumi"));
  ok("Yuumi: +3 de Mana/s por Amp (15)", near(y.manaRegen, 15), y.manaRegen);
  const n = st.find(u => u.champ === id("Naafiri"));
  ok("Naafiri: 15% de Omnivamp passivo", near(n.vamp, 0.15), n.vamp);
  // Nidalee: 2 + Amp alvos extras
  const nid = E.simulate({ units: [U("Nidalee", 3, 0, { mana: true }), U("Samira", 0, 3)] }, { units: dummies() }, 3);
  const c = nid.frames.find(fr => fr.e.some(e => e[0] === "c" && e[1] === 1));
  const hit = new Set(); for (const fr of nid.frames.filter(x => c && x.t >= c.t && x.t <= c.t + 0.5)) for (const e of fr.e) if (e[0] === "d" && e[1] > 2) hit.add(e[1]);
  ok("Nidalee com 2 A.M.P. (Amp 1): alvo + 3 próximos", hit.size >= 4, hit.size);
}

console.log("Transgressor: Rei do Crime");
{
  const g = E.createGame({ names: ["A", "B"], seed: 5, bots: [false, true] }); E.nextRound(g);
  const p = g.players[0];
  for (const k of Object.keys(p.board)) delete p.board[k];
  p.items = [];
  ["Darius", "Shaco", "Twisted Fate"].forEach((n, i) => { p.board[`${i},0`] = { uid: g.nextUid++, c: id(n), star: 1, items: [] }; });
  E.act(g, 0, { a: "lock" });
  ok("3 Transgressores: 1 chapéu", p.items.filter(i => i === "Kingpin").length === 1, p.items.join());
  const vi = { uid: g.nextUid++, c: id("Vi"), star: 1, items: [] }; p.board["5,0"] = vi;
  ok("chapéu só em Transgressor", E.act(g, 0, { a: "equip", uid: vi.uid, item: p.items.indexOf("Kingpin") }) === "Só funciona em um campeão Transgressor.");
  const dar = Object.values(p.board).find(u => u.c === id("Darius"));
  ok("chapéu entra no Darius", !E.act(g, 0, { a: "equip", uid: dar.uid, item: p.items.indexOf("Kingpin") }) && dar.kingpin);
  E.act(g, 0, { a: "sell", uid: dar.uid });
  ok("vender o Rei do Crime devolve o chapéu", p.items.includes("Kingpin"), p.items.join());
  // combate: Braum Rei do Crime ganha resistências
  const b = first([U("Braum", 3, 0, { kingpin: true }), U("Darius", 2, 0), U("Shaco", 4, 0)], dummies()).find(u => u.champ === id("Braum") && u.side === 0);
  const b0 = first([U("Braum", 3, 0), U("Darius", 2, 0), U("Shaco", 4, 0)], dummies()).find(u => u.champ === id("Braum") && u.side === 0);
  ok("Braum Rei do Crime: +30 de Armadura", near(b.armor - b0.armor, 30), b.armor - b0.armor);
  ok("sem 3 Transgressores, chapéu não vale", !first([U("Braum", 3, 0, { kingpin: true })], dummies())[0].kingpin);
  // Darius Rei do Crime atinge mais longe
  // alvo colado no Darius e um segundo inimigo a 2 casas dele, mas longe do alvo
  const G = E.GEO, dc = 3, dr = 3, main = U("Jax", 3, 0, { star: 3 });
  let spot = null;
  for (let x = 0; x < 7 && !spot; x++) for (let y = 0; y < 4 && !spot; y++) {
    const c = 6 - x, r = 4 + y;
    if (G.hexDist(dc, dr, c, r) === 2 && G.hexDist(6 - 3, 4, c, r) > 1) spot = [x, y];
  }
  const far = [main, U("Poppy", spot[0], spot[1], { star: 3 })];
  // só o Darius age: aliados e inimigos ficam atordoados pela sonda
  const freeze = (tt, us) => us.forEach(u => { if (u.champ !== id("Darius")) u.stunUntil = 99; });
  const withHat = E.simulate({ units: [U("Darius", 3, 0, { mana: true, kingpin: true }), U("Shaco", 0, 3), U("Twisted Fate", 6, 3)] }, { units: far }, 3, freeze);
  const noHat = E.simulate({ units: [U("Darius", 3, 0, { mana: true }), U("Shaco", 0, 3), U("Twisted Fate", 6, 3)] }, { units: far }, 3, freeze);
  ok("Darius Rei do Crime atinge inimigos a 2 casas", damagedIds(withHat, 1.5).size > damagedIds(noHat, 1.5).size, `${damagedIds(withHat, 1.5).size} x ${damagedIds(noHat, 1.5).size}`);
}

console.log(`${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
