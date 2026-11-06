// Testa o Modo Caos e mede a dificuldade. Uso: node test-chaos.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const R = E.CHAOS_ROUNDS;
const allOf = p => [...p.bench.filter(Boolean), ...Object.values(p.board)];

console.log("# Dados");
ok("30 rodadas", R.length === 30);
ok("6 chefes", R.filter(r => r.boss).length === 6, R.filter(r => r.boss).map(r => r.name).join(", "));
const bad = [];
for (const r of R) for (const [n, s, items] of r.units || []) { if (!E.CH_BY_NAME[n]) bad.push(n); for (const i of items) if (!E.ITEMS[i]) bad.push(i); }
ok("todo campeão e item existem", bad.length === 0, [...new Set(bad)].join());
ok("último tem Morgana 4★ e todo o time 4★", R[29].units.every(u => u[1] === 4) && R[29].units.some(u => u[0] === "Morgana"));
for (let i = 0; i < 30; i++) { const t = E.chaosTeam(i); const seen = new Set(t.units.map(u => `${u.x},${u.y}`)); if (seen.size !== t.units.length) ok(`rodada ${i + 1} sem unidades na mesma casa`, false); }

console.log("\n# Regras");
{
    const g = E.createChaosGame({ name: "A", seed: 1 });
    E.nextRound(g);
    const p = g.players[0];
    ok("começa com 3 vidas e 3 de ouro", p.hp === 3 && p.gold === 3 && g.phase === "plan");
    ok("rótulo 1-1", E.publicState(g, 0).round.label === "1-1");
    ok("Removedor Dourado", p.items.includes("MagneticRemover"));
    p.bench = p.bench.map(() => null);
    let rounds = 0;
    while (g.phase !== "end" && rounds < 40) { E.startCombat(g); E.finishCombat(g); rounds++; }
    ok("sem time: perde as 3 vidas e acaba", g.phase === "end" && p.hp === 0 && rounds === 3 && !g.chaosWon, rounds);
}
{
    const g = E.createChaosGame({ name: "A", seed: 2 });
    E.nextRound(g);
    const p = g.players[0];
    p.board["3,0"] = { uid: 1, c: E.CH_BY_NAME.Garen.id, star: 3, items: ["GargoyleStoneplate", "WarmogsArmor", "Bloodthirster"] };
    const gold = p.gold;
    E.startCombat(g); E.finishCombat(g);
    ok("vitória dá prêmio e pontos", p.gold > gold && g.score > 0 && p.hp === 3, `ouro ${gold}->${p.gold}, ${g.score} pts`);
    ok("avança a rodada", E.publicState(g, 0).round.label === "1-2");
    for (let i = 0; i < 3; i++) { E.startCombat(g); E.finishCombat(g); }
    ok("oferta em 1-5 usa a lista da Horuja", p.offer && p.offer.opts.every(id => E.AUG[id].horuja), p.offer && p.offer.opts.join());
    ok("oferta é ouro", p.offer.tier === 2);
}

console.log("\n# Removedor infinito");
{
    const g = E.createChaosGame({ name: "A", seed: 3 });
    E.nextRound(g);
    const p = g.players[0];
    for (const id of ["TFT9_Augment_BlindingSpeed", "TFT6_Augment_Recombobulator"]) { ok(`${id} implementado`, E.augImplemented(id)); E.pickAugment(g, p, id); }
    p.board["3,0"] = { uid: 900, c: E.CH_BY_NAME.Garen.id, star: 3, items: ["GargoyleStoneplate", "WarmogsArmor", "Bloodthirster"] };
    for (let i = 0; i < 25 && g.phase !== "end"; i++) { E.settleChoices(g, p); E.startCombat(g); E.finishCombat(g); }
    const n = p.items.filter(x => x === "MagneticRemover").length;
    ok("só existe 1 Removedor em toda a partida", n === 1, n);
    const u = allOf(p).find(x => x.uid === 900); const idx = p.items.indexOf("MagneticRemover");
    if (g.phase !== "end") ok("usar não consome", !E.act(g, 0, { a: "equip", uid: u.uid, item: idx }) && p.items.includes("MagneticRemover") && u.items.length === 0);
    const normal = E.createGame({ names: ["A", "B"], seed: 3, bots: [true, true] });
    E.nextRound(normal);
    E.pickAugment(normal, normal.players[0], "TFT9_Augment_BlindingSpeed");
    ok("no jogo normal o aumento segue dando Removedor", normal.players[0].items.includes("MagneticRemover"));
}

console.log("\n# Luvas do Ladrão");
{
    const team = { units: [{ c: E.CH_BY_NAME.Garen.id, star: 1, items: ["ThiefsGloves"], x: 3, y: 0, uid: 1 }] };
    const foe = { units: [{ c: E.CH_BY_NAME.Jinx.id, star: 1, items: ["InfinityEdge"], x: 3, y: 0, uid: 2 }] };
    let shown = true, distinct = true, plain = true; const seen = new Set();
    for (let s = 1; s <= 200; s++) {
        const m = E.simulate(team, foe, s).meta;
        const a = m.find(u => u.side === 0).items, b = m.find(u => u.side === 1).items;
        if (a.length !== 3 || a[0] !== "ThiefsGloves" || !a.slice(1).every(i => E.ITEMS[i])) shown = false;
        if (a[1] === a[2]) distinct = false;
        if (b.length !== 1 || b[0] !== "InfinityEdge") plain = false;
        seen.add(a[1]);
    }
    ok("o combate informa as Luvas e os 2 itens sorteados", shown);
    ok("os 2 itens nunca são iguais (200 lutas)", distinct);
    ok("o sorteio varia entre as lutas", seen.size > 10, seen.size);
    ok("quem não tem Luvas mostra só os próprios itens", plain);
}

console.log("\n# Dificuldade: quem vence cada rodada (20 lutas)");
const build = (specs) => specs.map(([n, star, items, x, y]) => ({ c: E.CH_BY_NAME[n].id, star, items, x, y, uid: null }));
// time forte de fim de jogo: lendárias 3★ e itens completos
const legend = build([
    ["Garen", 3, ["GargoyleStoneplate", "WarmogsArmor", "Bloodthirster"], 3, 0],
    ["Renekton", 3, ["SteraksGage", "Bloodthirster", "TitansResolve"], 2, 0],
    ["Viego", 3, ["InfinityEdge", "Bloodthirster", "SteraksGage"], 4, 0],
    ["Zac", 3, ["WarmogsArmor", "GargoyleStoneplate", "FrozenHeart"], 1, 0],
    ["Urgot", 3, ["GuinsoosRageblade", "InfinityEdge", "LastWhisper"], 3, 3],
    ["Samira", 3, ["InfinityEdge", "Deathblade", "LastWhisper"], 2, 3],
    ["Aurora", 3, ["RabadonsDeathcap", "SpearOfShojin", "JeweledGauntlet"], 4, 3],
    ["Kobuko", 3, ["WarmogsArmor", "SteraksGage", "Bloodthirster"], 5, 0],
    ["Brand", 3, ["RabadonsDeathcap", "SpearOfShojin", "BlueBuff"], 1, 3],
    ["Annie", 3, ["RabadonsDeathcap", "ArchangelsStaff", "JeweledGauntlet"], 5, 3],
]);
// time mediano: 2★ de custo 4, sem lendárias
const mid = build([
    ["Leona", 2, ["WarmogsArmor", "GargoyleStoneplate"], 3, 0],
    ["Sejuani", 2, ["SteraksGage", "WarmogsArmor"], 2, 0],
    ["Darius", 2, ["Bloodthirster"], 4, 0],
    ["Jarvan IV", 2, ["SteraksGage"], 1, 0],
    ["Jinx", 2, ["InfinityEdge", "Deathblade"], 3, 3],
    ["Xayah", 2, ["InfinityEdge", "LastWhisper"], 2, 3],
    ["Brand", 2, ["RabadonsDeathcap", "SpearOfShojin"], 4, 3],
    ["Vex", 2, ["RabadonsDeathcap"], 5, 3],
    ["Zeri", 2, ["GuinsoosRageblade"], 1, 3],
]);
const rate = (team, idx, n = 20) => { let w = 0; for (let s = 1; s <= n; s++) if (E.simulate({ units: team }, E.chaosTeam(idx), s * 977 + idx).winner === 0) w++; return Math.round(w / n * 100); };
const lines = [];
const legendWin = [], midWin = [];
for (let i = 0; i < 30; i++) {
    const a = rate(legend, i), b = rate(mid, i);
    legendWin.push(a); midWin.push(b);
    lines.push(`  ${String(i + 1).padStart(2)} ${R[i].name.padEnd(28)} lendárias 3★ ${String(a).padStart(3)}%   mediano ${String(b).padStart(3)}%`);
}
console.log(lines.join("\n"));
const avg = l => l.reduce((a, b) => a + b, 0) / l.length;
ok("últimos 5: mediano quase sempre perde", avg(midWin.slice(25)) <= 25, `${avg(midWin.slice(25)).toFixed(0)}%`);
ok("rodadas 26-29 vencíveis com lendárias", avg(legendWin.slice(25, 29)) >= 30, `${avg(legendWin.slice(25, 29)).toFixed(0)}%`);
ok("o último é vencível com lendárias", legendWin[29] > 0, `${legendWin[29]}%`);
ok("o último é o mais difícil", legendWin[29] <= Math.min(...legendWin.slice(25, 29)), `${legendWin[29]}% x ${legendWin.slice(25, 29)}`);
console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
