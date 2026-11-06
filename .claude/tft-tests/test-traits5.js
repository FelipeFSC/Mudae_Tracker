// Deus das Redes (Mods), Vírus (Bloblets), Mata-almas (holograma). Uso: node test-traits5.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const id = n => E.CH_BY_NAME[n].id;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const U = (n, x, y, o = {}) => ({ c: id(n), star: o.star || 1, x, y, items: o.items || [], traitMod: o.mod, fullMana: !!o.mana });
const game = () => { const g = E.createGame({ names: ["A", "B"], seed: 7, bots: [false, true] }); E.nextRound(g); const p = g.players[0]; for (const k of Object.keys(p.board)) delete p.board[k]; p.items = []; p.choices = []; return [g, p]; };
const put = (g, p, n, x, y, star = 1) => { const u = { uid: g.nextUid++, c: id(n), star, items: [] }; p.board[`${x},${y}`] = u; return u; };

console.log("Deus das Redes");
{
  const [g, p] = game();
  put(g, p, "Garen", 3, 0);
  // força combates entre jogadores
  let arsenals = 0, rounds = 0;
  for (let i = 0; i < 40 && g.phase !== "end" && arsenals < 2; i++) {
    const info = E.roundInfo(g.roundIdx, g.mode);
    E.settleChoices && 0;
    const before = p.choices.length;
    E.startCombat(g); E.finishCombat(g);
    if (info.type === "pvp") rounds++;
    const opened = p.choices.filter(c => c.title === "Arsenal de Mods de Trait").length;
    if (opened > arsenals) {
      arsenals = opened;
      ok(`Arsenal ${arsenals} depois de ${rounds} combates entre jogadores`, arsenals === 1 ? rounds === 2 : rounds === 5, rounds);
      const c = p.choices.find(x => x.title === "Arsenal de Mods de Trait");
      if (arsenals === 1) ok("Arsenal oferece 3 Mods", c && c.opts.length === 3 && c.opts.every(o => E.ITEMS[o].use === "TraitMod"), c && c.opts.join());
      p.choices = [];
    }
    void before;
  }
}
{
  const [g, p] = game();
  const vi = put(g, p, "Vi", 0, 0);
  p.items.push("Mod_Brutamontes");
  ok("Mod entra no campeão", !E.act(g, 0, { a: "equip", uid: vi.uid, item: 0 }) && vi.traitMod === "Brutamontes");
  p.items.push("Mod_Dizimador");
  ok("só 1 Mod por campeão", E.act(g, 0, { a: "equip", uid: vi.uid, item: 0 }) === "Este campeão já tem um Mod.");
  // combate: Vi com Mod de Brutamontes se beneficia mas não conta
  const first = units => { let s = null; E.simulate({ units }, { units: [U("Poppy", 3, 0)] }, 3, (t, us) => { if (!s) s = us.filter(u => u.side === 0).map(u => ({ ...u })); }); return s; };
  const a = first([U("Vi", 0, 0, { mod: "Brutamontes" }), U("Darius", 1, 0), U("Alistar", 2, 0)]);
  const b = first([U("Vi", 0, 0), U("Darius", 1, 0), U("Alistar", 2, 0)]);
  const viA = a.find(u => u.champ === id("Vi")), viB = b.find(u => u.champ === id("Vi"));
  ok("Vi com Mod recebe o bônus de Brutamontes", viA.maxHp > viB.maxHp * 1.15, `${Math.round(viB.maxHp)} -> ${Math.round(viA.maxHp)}`);
  const one = first([U("Vi", 0, 0, { mod: "Brutamontes" }), U("Darius", 1, 0)]);
  const two = first([U("Vi", 0, 0), U("Darius", 1, 0)]);
  // Vi (Mod) + Darius: Brutamontes conta só 1 e fica desligado, igual a sem Mod
  ok("o Mod não conta para a trait", near(one.find(u => u.champ === id("Darius")).maxHp, two.find(u => u.champ === id("Darius")).maxHp), one.find(u => u.champ === id("Darius")).maxHp);
}

console.log("Vírus");
{
  const [g, p] = game();
  put(g, p, "Zac", 3, 0);
  p.gold = 200;
  let seen = 0, tries = 0;
  while (tries++ < 300) { E.act(g, 0, { a: "reroll" }); if (p.shopBlob >= 0) seen++; p.gold = 200; }
  ok("Bloblet aparece em ~20% das atualizações", seen > 30 && seen < 100, `${seen}/300`);
  while (p.shopBlob < 0) { E.act(g, 0, { a: "reroll" }); p.gold = 200; }
  const slot = p.shopBlob, under = p.shop[slot];
  ok("comprar Bloblet custa 1 e revela a vaga", !E.act(g, 0, { a: "buy", slot }) && p.gold === 199 && p.blobs === 1 && p.shop[slot] === under);
  let zac = null;
  E.simulate({ units: [U("Zac", 3, 0)], blobs: 10 }, { units: [U("Poppy", 3, 0)] }, 3, (t, us) => { if (!zac) zac = { ...us[0] }; });
  let zac0 = null;
  E.simulate({ units: [U("Zac", 3, 0)] }, { units: [U("Poppy", 3, 0)] }, 3, (t, us) => { if (!zac0) zac0 = { ...us[0] }; });
  ok("10 Bloblets: +15% de Vida e +10 de PH no Zac", near(zac.maxHp, zac0.maxHp * 1.15, 1e-6) && near(zac.ap - zac0.ap, 10), `${zac0.maxHp}->${zac.maxHp}, PH ${zac0.ap}->${zac.ap}`);
}
{
  const [g, p] = game();
  put(g, p, "Jax", 3, 0);
  p.gold = 200;
  let seen = 0;
  for (let i = 0; i < 100; i++) { E.act(g, 0, { a: "reroll" }); if (p.shopBlob >= 0) seen++; p.gold = 200; }
  ok("sem Zac em campo, sem Bloblet", seen === 0, seen);
}

console.log("Mata-almas");
{
  // Viego mata um custo 4 e um custo 1: guarda o custo 4
  const f = E.simulate({ units: [U("Viego", 3, 0, { star: 3, items: ["Deathblade", "Deathblade", "Deathblade"] })] }, { units: [U("Zed", 3, 0), U("Vi", 2, 0)] }, 3);
  const sk = f.soulKill && f.soulKill[0];
  ok("guarda o inimigo de maior custo abatido", sk && sk.c === id("Zed"), sk && E.CH[sk.c].name);
  let holo = null;
  E.simulate({ units: [U("Viego", 3, 0, { star: 2 })], soulCopy: { c: id("Zed"), star: 2 } }, { units: [U("Poppy", 3, 0)] }, 3, (t, us) => { if (!holo) holo = us.find(u => u.holo); });
  ok("holograma entra com 1350 de Vida (Viego 2★)", holo && holo.maxHp === 1350, holo && holo.maxHp);
  ok("holograma causa 40% do dano", holo && near(holo.holoMul, 0.4), holo && holo.holoMul);
}

console.log(`${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
