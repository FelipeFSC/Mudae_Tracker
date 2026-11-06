// Testes dos aumentos. Uso: node test-augments.js <raiz>
const root = process.argv[2];
const E = require(root + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const ids = Object.keys(E.AUG);
const impl = ids.filter(E.augImplemented);
const normal = ids.filter(i => E.AUG[i].normal);
console.log(`total ${ids.length} | implementados ${impl.length} | jogo normal ${normal.filter(E.augImplemented).length}/${normal.length} | horuja ${ids.filter(i => E.AUG[i].horuja && E.augImplemented(i)).length}/${ids.filter(i => E.AUG[i].horuja).length}`);
const newGame = (seed = 5) => { const g = E.createGame({ names: ["A", "B"], seed, bots: [true, true] }); E.nextRound(g); return g; };
const fieldUnit = (g, p, name, x = 3, y = 0) => { const c = E.CH_BY_NAME[name].id; const u = { uid: g.nextUid++, c, star: 2, items: [] }; p.board[`${x},${y}`] = u; return u; };

console.log("\n# Cada aumento implementado roda em uma partida");
{
    const errors = [];
    for (const id of impl) {
        try {
            const g = E.createGame({ names: ["A", "B"], seed: id.length * 97 + 11, bots: [true, true] });
            E.nextRound(g);
            const p = g.players[0];
            E.pickAugment(g, p, id);
            let n = 0;
            while (g.phase !== "end" && n++ < 12) {
                if (g.phase === "carousel") { E.endCarousel(g); E.nextRound(g); continue; }
                g.players.forEach((x, i) => { if (x.alive) E.botPlan(g, i); });
                E.startCombat(g);
                JSON.stringify(g.combat);
                E.finishCombat(g);
            }
            if (Number.isNaN(p.gold) || Number.isNaN(p.hp)) errors.push(id + ": NaN");
        } catch (e) { errors.push(`${id}: ${e.message}`); }
    }
    ok("nenhum aumento quebra a partida", errors.length === 0, errors.slice(0, 6).join(" | "));
}

console.log("\n# Números oficiais");
{
    const g = newGame(); const p = g.players[0]; const gold = p.gold;
    E.pickAugment(g, p, "TFT_Augment_PlaceboPlus");
    const fx = E.AUG.TFT_Augment_PlaceboPlus.fx;
    ok(`Placebo+ dá ${fx.Gold} de ouro`, p.gold === gold + fx.Gold, p.gold - gold);
}
{
    const g = newGame(); const p = g.players[0]; const before = p.items.length;
    E.pickAugment(g, p, "TFT_Augment_BeltOverflow");
    const n = E.AUG.TFT_Augment_BeltOverflow.fx.NumItems;
    ok(`Promoção de Cintos: ${n} cintos`, p.items.length === before + n && p.items.filter(i => i === "GiantsBelt").length === n);
}
{
    const g = newGame(); const p = g.players[0];
    E.pickAugment(g, p, "TFT14_Augment_VanguardCrest");
    ok("Insígnia dá Emblema", p.items.includes("Emblem_Vanguarda"), p.items.join());
    const u = fieldUnit(g, p, "Jax");
    const err = E.act(g, 0, { a: "equip", uid: u.uid, item: p.items.indexOf("Emblem_Vanguarda") });
    ok("Emblema equipa", !err && u.items.includes("Emblem_Vanguarda"), err);
    const f = E.simulate({ units: [{ ...u, x: 3, y: 0 }] }, { units: [{ c: E.CH_BY_NAME.Poppy.id, star: 1, x: 3, y: 0, items: [] }] }, 3);
    ok("simula com Emblema", f.frames.length > 0);
    const noEmblem = E.previewUnit ? true : true;
    ok("traço do Emblema conta no campo", (() => { const st = E.publicState(g, 0); return st.you.traits.some(t => t.name === "Vanguarda"); })());
}
{
    const g = newGame(); const p = g.players[0];
    E.pickAugment(g, p, "TFT14_Augment_DynamoCirclet");
    ok("Tiara dá Emblema, campeão e item", p.items.includes("Emblem_Dínamo") && p.items.includes("BFSword") && p.bench.some(u => u && u.c === E.CH_BY_NAME["Miss Fortune"].id));
}
{
    const g = newGame(); const p = g.players[0]; p.gold = 50;
    p.lastInterest = 0;
    E.pickAugment(g, p, "TFT9_Augment_HedgeFund");
    const hg = E.AUG.TFT9_Augment_HedgeFund.fx.Gold;
    ok(`Fundo de Garantia dá ${hg} de ouro`, p.gold === 50 + hg, p.gold - 50);
    g.roundIdx = 3; p.gold = 100; E.nextRound(g);
    ok("juros sobem para 10", p.lastInterest === 10, p.lastInterest);
}
{
    const g = newGame(); const p = g.players[0]; p.gold = 10;
    E.pickAugment(g, p, "TFT6_Augment_HyperRoll");
    g.roundIdx = 3; const before = p.gold; E.nextRound(g);
    ok("Vigarista zera juros", p.lastInterest === 0);
}
{
    const g = newGame(); const p = g.players[0]; p.gold = 10;
    E.pickAugment(g, p, "TFT9_Augment_Commander_RollingForDays");
    const rolls = E.AUG.TFT9_Augment_Commander_RollingForDays.fx.Numrolls;
    ok(`Troca Sem Fim: ${rolls} atualizações grátis`, p.freeRerolls === rolls, p.freeRerolls);
    E.act(g, 0, { a: "reroll" });
    ok("atualização grátis não gasta ouro", p.gold === 10 && p.freeRerolls === rolls - 1);
}
{
    const g = newGame(); const p = g.players[0];
    const u = { ...fieldUnit(g, p, "Jax"), items: ["GiantsBelt"] };
    const team = { units: [{ ...u, x: 3, y: 0 }], augs: [{ id: "TFT9_Augment_CyberneticBulk2", state: {} }], level: 5, stage: 3 };
    const foe = { units: [{ c: E.CH_BY_NAME.Poppy.id, star: 1, x: 3, y: 0, items: [] }] };
    const base = E.simulate({ units: [{ ...u, x: 3, y: 0 }] }, foe, 3).meta[0].stats.hp;
    const buffed = E.simulate(team, foe, 3).meta[0].stats.hp;
    const extra = E.AUG.TFT9_Augment_CyberneticBulk2.fx.Health;
    ok(`Volume Cibernético II: +${extra} de Vida com item`, buffed === base + extra, `${base} -> ${buffed}`);
}
{
    const u = { uid: 1, c: E.CH_BY_NAME.Jinx.id, star: 2, items: [] };
    const foe = { units: [{ c: E.CH_BY_NAME.Poppy.id, star: 3, x: 3, y: 0, items: [] }] };
    const t = aug => ({ units: [{ ...u, x: 3, y: 3 }], augs: [{ id: aug, state: {} }], level: 5, stage: 3 });
    const f = E.simulate(t("TFT_Augment_GlassCannonII"), foe, 3);
    const first = f.frames[0].u.find(x => x[0] === 1);
    const max = f.meta[0].stats.hp;
    const hpPct = E.AUG.TFT_Augment_GlassCannonII.fx.Health;
    ok(`Canhão de Vidro começa com ${Math.round(hpPct * 100)}% de Vida`, Math.abs(first[3] / max - hpPct) < 0.02, `${first[3]}/${max}`);
}
{
    const u = { uid: 1, c: E.CH_BY_NAME.Jax.id, star: 3, items: [] };
    const foe = { units: [{ c: E.CH_BY_NAME.Poppy.id, star: 3, x: 3, y: 0, items: [] }] };
    const fx = E.AUG.TFT9_Augment_Commander_Ascension.fx;
    const amps = [];
    E.simulate({ units: [{ ...u, x: 3, y: 0 }], augs: [{ id: "TFT9_Augment_Commander_Ascension", state: {} }], level: 5, stage: 3 }, foe, 3, (t, units) => { const j = units.find(x => x.side === 0); amps.push([t, j.amp]); });
    const before = amps.filter(([t]) => t < fx.Delay - 0.1).pop(), after = amps.find(([t]) => t >= fx.Delay + 0.06);
    ok(`Ascensão: +${fx.DamageAmp}% de amplificação aos ${fx.Delay}s`, before && after && Math.abs(after[1] - before[1] - fx.DamageAmp / 100) < 1e-9, before && after && (after[1] - before[1]));
}

console.log("\n# Oferta e escolha");
{
    const g = E.createGame({ names: ["A", "B"], seed: 9, bots: [false, false] });
    E.nextRound(g);
    while (E.roundInfo(g.roundIdx).label !== "2-1") { if (g.phase === "carousel") E.endCarousel(g); E.nextRound(g); }
    const p = g.players[0];
    ok("oferta aparece em 2-1", p.offer && p.offer.opts.length === 3, p.offer && p.offer.opts.join());
    ok("3 opções do mesmo tier", p.offer.opts.every(i => E.AUG[i].tier === p.offer.tier));
    ok("só implementados na oferta", p.offer.opts.every(E.augImplemented));
    const before = p.offer.opts[1];
    ok("atualizar troca a opção", !E.act(g, 0, { a: "augReroll", i: 1 }) && p.offer.opts[1] !== before);
    ok("atualizar 2 vezes é recusado", !!E.act(g, 0, { a: "augReroll", i: 1 }));
    const chosen = p.offer.opts[0];
    ok("escolher funciona", !E.act(g, 0, { a: "augment", i: 0 }) && p.augments.includes(chosen) && !p.offer);
    const other = g.players[1];
    E.startCombat(g);
    ok("quem não escolhe recebe uma opção", other.augments.length === 1 && !other.offer);
}

console.log("\n# Sem aumentos, a luta é igual");
{
    const B = require(process.argv[3] || root + "/.claude/tft-tests/baseline-augments/tft-engine.js");
    let same = 0, total = 0;
    for (let seed = 1; seed <= 150; seed++) {
        const rng = E.makeRng(seed);
        const CHANGED = require('./changed-traits.js');
        const all = E.D.champions.filter(c => !c.traits.some(t => CHANGED.has(t)));
        const team = n => Array.from({ length: n }, (_, i) => ({ c: all[Math.floor(rng() * all.length)].id, star: 1 + Math.floor(rng() * 2), x: i, y: Math.floor(rng() * 4), items: [] }));
        const A = team(5), Bt = team(5);
        const clean = f => JSON.stringify({ w: f.winner, s: f.survivors, d: f.duration, m: f.meta.map(x => x.stat), u: f.frames.map(fr => fr.u) });
        total++;
        if (clean(E.simulate({ units: A }, { units: Bt }, seed)) === clean(B.simulate({ units: A }, { units: Bt }, seed))) same++;
    }
    ok("lutas sem aumento idênticas", same === total, `${same}/${total}`);
}

console.log("\n# Partidas de 8 bots");
{
    const names = Array.from({ length: 8 }, (_, i) => "P" + i);
    let picked = 0, rounds = 0;
    for (const seed of [11, 222, 3333]) {
        const g = E.createGame({ names, seed, bots: names.map(() => true) });
        E.nextRound(g);
        let n = 0;
        while (g.phase !== "end" && n++ < 220) {
            if (g.phase === "carousel") { E.endCarousel(g); E.nextRound(g); continue; }
            g.players.forEach((p, i) => { if (p.alive) E.botPlan(g, i); });
            E.startCombat(g);
            E.finishCombat(g);
            rounds++;
        }
        ok(`semente ${seed} termina`, g.phase === "end", `${n} rodadas`);
        picked += g.players.reduce((t, p) => t + p.augments.length, 0);
    }
    ok("bots escolhem aumentos", picked > 0, picked);
}
console.log("\nbloqueados no jogo normal:", normal.filter(i => !E.augImplemented(i)).map(i => E.AUG[i].name).join(", "));
console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
