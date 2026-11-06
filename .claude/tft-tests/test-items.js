// Itens com os números e as mecânicas da Season 14 (LoL 15.14). Uso: node test-items.js <raiz>
const root = process.argv[2];
const E = require(root + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const id = n => E.D.champions.find(c => c.name === n).id;
const fx = i => E.ITEMS[i].fx;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

/* luta com sonda: devolve as unidades a cada passo pedido */
function run(A, B, seed = 3, watch) {
  const snaps = [];
  E.simulate({ units: A }, { units: B }, seed, (t, units) => { if (watch) watch(t, units, snaps); });
  return snaps;
}
const unit = (name, items = [], o = {}) => ({ c: id(name), star: o.star || 1, x: o.x ?? 3, y: o.y ?? 0, items, fullMana: !!o.mana });
// primeiro passo: estado inicial já com traits e itens
function first(A, B = [unit("Jax", [], { x: 0, y: 3 })]) {
  let got = null;
  run(A, B, 3, (t, units) => { if (!got) got = units.map(u => ({ ...u, shields: u.shields.map(s => ({ ...s })) })); });
  return got;
}

console.log("Números da 15.14");
ok("Rabadon 50 PH", fx("RabadonsDeathcap").AP === 50);
ok("Warmog 600 Vida e 12%", fx("WarmogsArmor").Health === 600 && near(fx("WarmogsArmor").BonusPercentHP, 0.12));
ok("Sterak 50% em 5s", near(fx("SteraksGage").PercentHealthShield, 0.5) && fx("SteraksGage").ShieldDuration === 5);
ok("nenhum item com regeneração de Mana", E.D.items.every(i => !i.fx.ManaRegen));

console.log("Mana inicial");
{
  const [a] = first([unit("Darius", [])]);
  const [b] = first([unit("Darius", ["TearOfTheGoddess"])]);
  const [c] = first([unit("Darius", ["BlueBuff"])]);
  ok("Lágrima dá +15 de Mana inicial", near(b.mana - a.mana, 15), b.mana - a.mana);
  ok("Efeito Azul dá +30 de Mana inicial e não dá DA/PH extra", near(c.mana - a.mana, 30) && near(c.adPct, fx("BlueBuff").AD), c.adPct);
}

console.log("Gume do Infinito");
{
  const [one] = first([unit("Darius", ["InfinityEdge"])]);
  const [two] = first([unit("Darius", ["InfinityEdge", "InfinityEdge"])]);
  ok("1 Gume libera crítico da habilidade", one.abilityCrit === true);
  ok("2º Gume vira +10% de dano crítico", near(two.critDmg - one.critDmg, 0.1), two.critDmg - one.critDmg);
}

console.log("Elmo Adaptativo");
{
  const [front] = first([unit("Darius", ["AdaptiveHelm"], { y: 0 })]);
  const [back] = first([unit("Darius", ["AdaptiveHelm"], { y: 3 })]);
  const [bare] = first([unit("Darius", [], { y: 3 })]);
  ok("frente: +40 de Armadura", near(front.armor - bare.armor, 40), front.armor - bare.armor);
  ok("trás: +15 de PH (além dos 10 do item)", near(back.ap - bare.ap, 25), back.ap - bare.ap);
}

console.log("Gatilhos por Vida");
{
  // Darius sozinho apanha de vários: cai abaixo de 60% e de 40%
  const foes = [unit("Jinx", ["Deathblade"], { x: 0, y: 3, star: 2 }), unit("Draven", ["Deathblade"], { x: 2, y: 3, star: 2 }), unit("Graves", ["Deathblade"], { x: 4, y: 3, star: 2 })];
  let sterak = [], edge = null;
  run([unit("Darius", ["SteraksGage", "GuardianAngel"], { y: 0 })], foes, 5, (t, units) => {
    const d = units.find(u => u.champ === id("Darius"));
    if (!d.alive) return;
    const s = d.shields.find(x => x.decay);
    if (s) sterak.push({ t, v: s.v });
    if (d.once.edge && !edge) edge = { t, until: d.untargetUntil, as: d.asBonus };
  });
  ok("Sterak cria escudo que decai", sterak.length > 3 && sterak[sterak.length - 1].v < sterak[0].v, sterak.length);
  ok("Sterak some em até 5s", sterak.length && sterak[sterak.length - 1].t - sterak[0].t <= 5.01);
  ok("Limiar da Noite: 1s inalvejável", edge && near(edge.until - edge.t, 1, 0.06), edge && edge.until - edge.t);
}
{
  const foes = [unit("Jinx", ["Deathblade"], { x: 0, y: 3, star: 2 }), unit("Draven", ["Deathblade"], { x: 2, y: 3, star: 2 })];
  let vow = null, before = null;
  run([unit("Darius", ["FrozenHeart"], { y: 0 })], foes, 5, (t, units) => {
    const d = units.find(u => u.champ === id("Darius"));
    if (!before) before = d.armor;
    if (d.once.vow && !vow) vow = { armor: d.armor, shield: d.shields.map(s => s.until - t) };
  });
  ok("Voto: +20 de Armadura com 40% de Vida", vow && near(vow.armor - before, 20), vow && vow.armor - before);
  ok("Voto: escudo de 5s", vow && vow.shield.some(d => near(d, 5, 0.06)));
}

console.log("Mão da Justiça");
{
  const foes = [unit("Jinx", ["Deathblade"], { x: 0, y: 3, star: 2 }), unit("Draven", ["Deathblade"], { x: 2, y: 3, star: 2 })];
  const seen = [];
  run([unit("Darius", ["UnstableConcoction"], { y: 0 })], foes, 5, (t, units) => {
    const d = units.find(u => u.champ === id("Darius"));
    if (d.alive && (!seen.length || seen[seen.length - 1].high !== d.hojHigh)) seen.push({ high: d.hojHigh, ap: d.ap, vamp: d.vamp });
  });
  const hi = seen.find(s => s.high === true), lo = seen.find(s => s.high === false);
  ok("acima de 50%: PH dobrado (+30)", hi && lo && near(hi.ap - lo.ap, 15), hi && lo && hi.ap - lo.ap);
  ok("abaixo de 50%: Omnivamp dobrado", hi && lo && near(lo.vamp - hi.vamp, 0.12), hi && lo && lo.vamp - hi.vamp);
}

console.log("Conjuração");
{
  let after = null;
  run([unit("Darius", ["BlueBuff", "Leviathan"], { mana: true })], [unit("Jax", [], { x: 3, y: 0 })], 3, (t, units) => {
    const d = units.find(u => u.champ === id("Darius"));
    if (!after && d.castUntil > 0) after = { mana: d.mana, nash: d.nashUntil - t };
  });
  ok("Efeito Azul devolve 10 de Mana", after && after.mana >= 10, after && after.mana);
  ok("Nashor: 5s de Vel. de Ataque", after && near(after.nash, 5, 0.06), after && after.nash);
}

console.log("Acúmulos");
{
  // alvo muito resistente e atacante fraco: a luta dura o bastante para acumular
  const wall = [unit("Cho'Gath", ["WarmogsArmor", "WarmogsArmor", "GargoyleStoneplate"], { x: 3, y: 0, star: 3 })];
  let k = null;
  run([unit("Jax", ["RunaansHurricane", "WarmogsArmor"], { y: 0, star: 3 })], wall, 3, (t, units) => {
    const j = units.find(u => u.champ === id("Jax") && u.side === 0);
    if (j.alive) k = (j.adPct - fx("RunaansHurricane").AD) / fx("RunaansHurricane").ADOnAttack;
  });
  ok("Cráquem passa de 15 acúmulos (sem limite)", k > 15.5, k && k.toFixed(1));
  let tt = null, armor0 = null;
  run([unit("Jax", ["TitansResolve", "WarmogsArmor"], { y: 0, star: 3 })], wall, 3, (t, units) => {
    const j = units.find(u => u.champ === id("Jax") && u.side === 0);
    if (armor0 == null) armor0 = j.armor;
    if (j.alive) tt = { n: j.stacks.titan, armor: j.armor - armor0 };
  });
  ok("Determinação: para em 25 e dá +20 de Armadura", tt && tt.n === 25 && near(tt.armor, 20), tt && `${tt.n}, +${tt.armor}`);
}

console.log("Traits ligadas a itens");
{
  const techies = ["Fiddlesticks", "Veigar", "Zyra", "Shyvana", "Seraphine", "Mordekaiser", "Viego", "Brand"];
  const units = first(techies.map((n, i) => unit(n, [], { x: i % 7, y: Math.floor(i / 7) })));
  ok("Tecnológico (8): redução de 18%", units.filter(u => u.side === 0).every(u => near(u.tech.v, 0.18)));
  const execs = ["Rengar", "Varus", "Vex", "Urgot", "Graves"];
  const ex = first(execs.map((n, i) => unit(n, [], { x: i, y: 1 })));
  ok("Carrasco (5): 12% de durabilidade", ex.filter(u => u.side === 0).every(u => near(u.dura, 0.12)), ex[0].dura);
  const [ie] = first([unit("Rengar", ["InfinityEdge"], { y: 1 }), unit("Graves", [], { x: 1, y: 1 })]);
  const [bare] = first([unit("Rengar", [], { y: 1 }), unit("Graves", [], { x: 1, y: 1 })]);
  ok("Carrasco + Gume: o Gume vira dano crítico", near(ie.critDmg - bare.critDmg, 0.1), ie.critDmg - bare.critDmg);
}

console.log(`${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
