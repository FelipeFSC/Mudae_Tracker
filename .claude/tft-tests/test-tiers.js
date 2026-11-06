// Detalhes de faixa das traits (Season 14). Uso: node test-tiers.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const id = n => E.CH_BY_NAME[n].id;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const team = (names, star = 1) => names.map((n, i) => ({ c: id(n), star, x: i % 7, y: Math.floor(i / 7), items: [] }));
const foe = { units: [{ c: id("Poppy"), star: 1, x: 3, y: 0, items: [] }] };
function first(units, extra = {}) { let got = null; E.simulate({ units, ...extra }, foe, 3, (t, us) => { if (!got) got = us.filter(u => u.side === 0).map(u => ({ ...u })); }); return got; }

console.log("Bastião (6)");
{
  const bast = ["Galio", "Renekton", "Shyvana", "Illaoi", "Jax", "Sejuani"];
  const a = first(team([...bast, "Jinx"]));
  const b = first(team(["Galio", "Renekton", "Shyvana", "Illaoi", "Jinx"]));
  const jinxA = a.find(u => u.champ === id("Jinx")), jinxB = b.find(u => u.champ === id("Jinx"));
  ok("não-Bastião recebe +25 a mais com 6", near(jinxA.armor - jinxB.armor, 25), jinxA.armor - jinxB.armor);
}

console.log("Boom Bot (6)");
{
  const bots = ["Kog'Maw", "Skarner", "Fiddlesticks", "Cho'Gath", "Urgot", "Jhin"];
  const f = E.simulate({ units: team(bots.slice(0, 5).concat(["Jax"])).map((u, i) => i === 5 ? u : u) }, { units: team(["Poppy", "Jax", "Vi", "Alistar"], 2).map(u => ({ ...u, y: 0 })) }, 3);
  // conta mísseis por instante: com 6 Boom Bots saem pares no mesmo passo
  const six = E.simulate({ units: team(["Kog'Maw", "Skarner", "Fiddlesticks", "Cho'Gath", "Urgot"]).concat([{ c: id("Ziggs"), star: 1, x: 6, y: 1, items: ["Emblem_Boom Bot"] }]) }, { units: team(["Poppy", "Jax", "Vi", "Alistar"], 2) }, 3);
  const pairs = six.frames.some(fr => { const m = fr.e.filter(e => e[0] === "a" && e[3] === "boom"); return m.length >= 2 && m[0][1] === m[1][1]; });
  ok("6 Boom Bots disparam dois mísseis", pairs);
  void f;
}

console.log("Divinicorp");
{
  const [m] = first(team(["Morgana", "Jinx"]));
  const [, jinx] = first(team(["Morgana", "Jinx"]));
  const [, base] = first(team(["Shaco", "Jinx"]));
  ok("Morgana: +9 de PH para não-Divinicorp", near(jinx.ap - base.ap, 9), jinx.ap - base.ap);
  ok("Morgana: Divinicorp recebe o dobro (18)", near(m.ap - 100, 18), m.ap - 100);
  const [, j2] = first(team(["Senna", "Jinx"]));
  ok("Senna: +8% de DA", near(j2.adPct - base.adPct, 0.08), j2.adPct - base.adPct);
  const [, j3] = first(team(["Vex", "Jinx"]));
  ok("Vex: +7% de crítico", near(j3.crit - base.crit, 0.07), j3.crit - base.crit);
  const withEmblem = first([{ c: id("Jinx"), star: 1, x: 0, y: 0, items: ["Emblem_Divinicorp"] }, { c: id("Kindred"), star: 1, x: 1, y: 0, items: [] }]);
  ok("Emblema: +3% de Omnivamp (o portador é Divinicorp: 6%)", near(withEmblem[1].vamp, 0.03) && near(withEmblem[0].vamp, 0.06), `${withEmblem[1].vamp} / ${withEmblem[0].vamp}`);
}

console.log("Dizimador: sobrecura");
{
  // Shaco com Vida cheia e muito Omnivamp; Vayne ferida e atordoada: toda cura dela vem da sobrecura
  const units = [{ c: id("Shaco"), star: 3, x: 3, y: 0, items: ["Bloodthirster", "Bloodthirster", "Deathblade"] }, { c: id("Vayne"), star: 1, x: 6, y: 3, items: [] }];
  let gained = 0, last = null;
  E.simulate({ units }, { units: team(["Poppy", "Jax"], 1).map(u => ({ ...u, y: 0 })) }, 3, (t, us) => {
    const v = us.find(u => u.champ === id("Vayne") && u.side === 0), s = us.find(u => u.champ === id("Shaco") && u.side === 0);
    if (!v || !s) return;
    if (last == null) { v.hp = v.maxHp * 0.3; v.stunUntil = 99; last = v.hp; }
    s.hp = s.maxHp; // mantém o Shaco cheio: toda cura dele vira excesso
    if (v.hp > last) gained += v.hp - last;
    last = v.hp;
  });
  ok("excesso de cura vai para o Dizimador ferido", gained > 0, Math.round(gained));
}

console.log("Boi Dourado");
{
  const g = E.createGame({ names: ["A", "B"], seed: 5, bots: [false, true] }); E.nextRound(g);
  const p = g.players[0];
  for (const k of Object.keys(p.board)) delete p.board[k];
  [["Alistar", 0, 0], ["Graves", 1, 3]].forEach(([n, x, y]) => { p.board[`${x},${y}`] = { uid: g.nextUid++, c: id(n), star: 1, items: [] }; });
  p.gold = 100; p.oxFought = false;
  for (let i = 0; i < 4; i++) E.act(g, 0, { a: "reroll" });
  ok("sem ter lutado, gastar não dá bônus", !p.oxStacks, p.oxStacks);
  p.oxFought = true; p.oxSpent = 0; p.oxProc = false;
  E.act(g, 0, { a: "reroll" }); E.act(g, 0, { a: "reroll" });
  ok("2 atualizações (4 de ouro, contam 8): +1%", p.oxStacks === 1 && p.oxNeed === 15, `${p.oxStacks}, próxima ${p.oxNeed}`);
  E.act(g, 0, { a: "reroll" }); E.act(g, 0, { a: "reroll" });
  ok("só um bônus por rodada", p.oxStacks === 1);
  const A = E.simulate({ units: [{ c: id("Alistar"), star: 1, x: 0, y: 0, items: [] }, { c: id("Graves"), star: 1, x: 1, y: 3, items: [] }], oxStacks: 3 }, foe, 3).meta;
  let amp = null;
  E.simulate({ units: [{ c: id("Alistar"), star: 1, x: 0, y: 0, items: [] }, { c: id("Graves"), star: 1, x: 1, y: 3, items: [] }], oxStacks: 3 }, foe, 3, (t, us) => { if (amp == null) amp = us[0].amp; });
  ok("acúmulos entram na amplificação (12% + 3%)", near(amp, 0.15), amp);
  void A;
}

console.log(`${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
