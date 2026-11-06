// Testes das regras da etapa 1. Uso: node test-rules.js <raiz do projeto> <pasta baseline>
const [root, baseDir] = process.argv.slice(2);
const E = require(root + "/tft-engine.js");
const B = require(baseDir + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const G = E.GEO;
const idOf = name => E.D.champions.find(c => c.name === name).id;

/* Posição absoluta -> entrada do motor. Lado 0: c=x, r=3-y. Lado 1: c=6-x, r=4+y. */
const a = (name, c, r, opts = {}) => ({ c: idOf(name), star: opts.star || 1, x: c, y: 3 - r, items: [], fullMana: !!opts.mana });
const b = (name, c, r, opts = {}) => ({ c: idOf(name), star: opts.star || 1, x: 6 - c, y: r - 4, items: [], fullMana: !!opts.mana });

/* Roda a luta e coleta, até o tempo pedido, quem levou dano e stun depois do 1º conjurar. */
function fight(teamA, teamB, seed = 7, until = 3) {
    const f = E.simulate({ units: teamA }, { units: teamB }, seed);
    const dmg = new Map(), stun = new Map(), fx = [], casts = [];
    let firstCast = null;
    for (const fr of f.frames) {
        if (fr.t > until) break;
        for (const ev of fr.e) {
            if (ev[0] === "c") { casts.push({ t: fr.t, id: ev[1] }); if (firstCast === null) firstCast = fr.t; }
            if (ev[0] === "fx") fx.push({ t: fr.t, ev });
            if (ev[0] === "d") dmg.set(ev[1], (dmg.get(ev[1]) || 0) + ev[2]);
            if (ev[0] === "st") stun.set(ev[1], { t: fr.t, sec: ev[2] });
        }
    }
    return { f, dmg, stun, fx, casts, firstCast };
}
/* ids: unidades são numeradas na ordem: time A, depois time B, a partir de 1 */
const cellIds = (teamA, teamB) => teamA.length;

console.log("\n# Geometria");
const key = cells => cells.map(([c, r]) => c + "," + r).join(" ");
ok("linha horizontal", key(G.hexLine(0, 3, 3, 3, 3)) === "1,3 2,3 3,3", key(G.hexLine(0, 3, 3, 3, 3)));
ok("linha para além do alvo", key(G.hexLine(1, 2, 3, 2, 4)) === "2,2 3,2 4,2 5,2");
ok("linha para na borda", G.hexLine(5, 3, 6, 3, 14).length === 1);
ok("linha vertical não pula casas", (() => { const l = G.hexLine(3, 0, 3, 4, 4); return l.length === 4 && l.every(([c, r], i) => r === i + 1); })(), key(G.hexLine(3, 0, 3, 4, 4)));
{
    // Na borda o caminho pode precisar pular uma casa de fora do tabuleiro, nunca mais que isso.
    let jumps = 0, big = 0;
    for (let c1 = 0; c1 < 7; c1++) for (let r1 = 0; r1 < 8; r1++) for (let c2 = 0; c2 < 7; c2++) for (let r2 = 0; r2 < 8; r2++) {
        if (c1 === c2 && r1 === r2) continue;
        let px = c1, py = r1;
        for (const [c, r] of G.hexLine(c1, r1, c2, r2, 14)) { const d = G.hexDist(px, py, c, r); if (d === 2) jumps++; if (d > 2) big++; px = c; py = r; }
    }
    ok("casas da linha são contínuas (só pula fora do tabuleiro)", big === 0, `${jumps} pulos de 1 casa, ${big} maiores`);
    ok("borda lateral não zera a linha", G.hexLine(6, 1, 6, 3, 14).some(([c, r]) => c === 6 && r === 3), key(G.hexLine(6, 1, 6, 3, 14)));
}
ok("a linha sempre passa pelo alvo", (() => {
    for (let c1 = 0; c1 < 7; c1++) for (let r1 = 0; r1 < 8; r1++) for (let c2 = 0; c2 < 7; c2++) for (let r2 = 0; r2 < 8; r2++) {
        if (c1 === c2 && r1 === r2) continue;
        if (!G.hexLine(c1, r1, c2, r2, 14).some(([c, r]) => c === c2 && r === r2)) return false;
    }
    return true;
})());
ok("cone inclui a frente", G.inCone(3, 2, 3, 4, 3, 4, 3));
ok("cone exclui atrás", !G.inCone(3, 2, 3, 4, 3, 0, 3));
ok("cone exclui além do alcance", !G.inCone(3, 0, 3, 2, 3, 6, 3));
ok("+ pega fileira e coluna", G.inPlus(3, 3, 3, 7) && G.inPlus(3, 3, 0, 3) && !G.inPlus(3, 3, 2, 4));

console.log("\n# Stun");
{
    // Alistar colado em dois inimigos: só o alvo é atordoado.
    const A = [a("Alistar", 3, 3, { mana: true })], Bt = [b("Jax", 3, 4), b("Poppy", 4, 4), b("Sylas", 2, 4)];
    const r = fight(A, Bt);
    ok("Alistar atordoa só um", r.stun.size === 1, [...r.stun.keys()].join());
    ok("com 2 s", [...r.stun.values()][0]?.sec === 2);
}
{
    const A = [a("Leona", 3, 3, { mana: true })], Bt = [b("Jax", 3, 4), b("Poppy", 4, 4), b("Sylas", 2, 4)];
    const r = fight(A, Bt);
    ok("Leona: dano no grupo", [2, 3, 4].filter(i => r.dmg.has(i)).length >= 2, `${[...r.dmg.keys()]}`);
    ok("Leona: stun só no centro", r.stun.size === 1, [...r.stun.keys()].join());
    const start = r.f.frames.find(fr => fr.e.some(e => e[0] === "c")).t;
    ok("Leona: mira e atinge no mesmo instante", r.stun.size === 1 && [...r.stun.values()][0].t - start < 0.2);
}
{
    const A = [a("Sejuani", 3, 3, { mana: true })], Bt = [b("Jax", 3, 4), b("Poppy", 4, 4), b("Sylas", 2, 4)];
    const r = fight(A, Bt, 7, 4);
    const start = r.casts[0].t;
    ok("Sejuani atordoa todos", r.stun.size === 3, [...r.stun.keys()].join());
    ok("Sejuani só depois de 2 s", [...r.stun.values()].every(v => v.t - start >= 1.9 && v.t - start <= 2.2), [...r.stun.values()].map(v => (v.t - start).toFixed(2)).join());
    ok("evento avisa o atraso", r.fx[0].ev[6] === 2, JSON.stringify(r.fx[0].ev));
}
{
    const A = [a("Galio", 3, 3, { mana: true })], Bt = [b("Jax", 3, 4)];
    const r = fight(A, Bt, 7, 4.5);
    const start = r.casts[0].t;
    const st = [...r.stun.values()][0];
    ok("Galio: redemoinho depois de 3 s", st && st.t - start >= 2.9 && st.t - start <= 3.2, st && (st.t - start).toFixed(2));
    const f = E.simulate({ units: A }, { units: Bt }, 7);
    const hpLater = f.frames.find(x => x.t >= start + 2.5).u.find(u => u[0] === 1)[3];
    ok("Galio segue vivo com durabilidade", hpLater > 0);
    const dmgDuring = (() => { const noDur = E.simulate({ units: [a("Jax", 3, 3)] }, { units: Bt }, 7); return noDur.frames.length > 0; })();
    ok("simulação sem Galio funciona", dmgDuring);
}

console.log("\n# Linha");
{
    // Draven em (3,0), inimigos em linha e um fora dela.
    const A = [a("Draven", 3, 0, { mana: true })];
    const Bt = [b("Jax", 3, 4), b("Poppy", 3, 6), b("Sylas", 6, 5)];
    const line = G.hexLine(3, 0, 3, 4, 14).map(x => x.join());
    const onLine = Bt.map((u, i) => ({ i: i + 2, cell: i === 0 ? "3,4" : i === 1 ? "3,6" : "6,5" })).filter(x => line.includes(x.cell));
    const r = fight(A, Bt, 7, 1.2);
    ok("Draven acerta quem está na linha", onLine.every(x => r.dmg.has(x.i)), `linha ${line.join(" ")} | dano ${[...r.dmg.keys()]}`);
    ok("Draven não acerta fora da linha", !r.dmg.has(4), `${[...r.dmg.keys()]}`);
    ok("Draven tem ida e volta", r.fx.length === 2 && r.fx[1].ev[6] === 0.5, JSON.stringify(r.fx.map(x => x.ev[6])));
}
{
    const A = [a("Mordekaiser", 3, 3, { mana: true })];
    const Bt = [b("Jax", 3, 4), b("Poppy", 3, 5), b("Sylas", 4, 4), b("Vi", 3, 6)];
    const r = fight(A, Bt, 7, 1);
    ok("Mordekaiser atordoa só a linha de 2 casas", r.stun.size >= 1 && r.stun.size <= 2 && !r.stun.has(5), [...r.stun.keys()].join());
    ok("Mordekaiser não acerta além de 2 casas", !r.dmg.has(5), [...r.dmg.keys()].join());
}
{
    const A = [a("Seraphine", 3, 1, { mana: true })];
    const Bt = [b("Jax", 3, 4), b("Poppy", 2, 5)];
    const r = fight(A, Bt, 7, .4);
    ok("onda da Seraphine atravessa", r.dmg.has(2) && r.dmg.has(3), [...r.dmg.keys()].join());
    ok("cada inimigo reduz o dano", r.dmg.get(3) < r.dmg.get(2) * 0.85, `${r.dmg.get(2)} > ${r.dmg.get(3)}`);
}
{
    const A = [a("Senna", 3, 1, { mana: true })];
    const near = fight(A, [b("Jax", 3, 4), b("Poppy", 3, 6)], 7, .3);
    ok("raio da Senna vai 2 casas além", near.dmg.has(3));
    const far = fight(A, [b("Jax", 3, 4), b("Poppy", 2, 7)], 7, .3);
    ok("e não mais que isso", !far.dmg.has(3), [...far.dmg.keys()].join());
}
{
    const A = [a("Garen", 3, 3, { mana: true })];
    const r = fight(A, [b("Jax", 3, 4), b("Jinx", 2, 5), b("Sylas", 6, 7)], 7, .5);
    ok("Garen: alvo e onda", r.dmg.has(2) && r.dmg.has(3));
    ok("Garen: não acerta fora da onda", !r.dmg.has(4));
}
{
    const A = [a("Vex", 3, 1, { mana: true })];
    const r = fight(A, [b("Jinx", 3, 4), b("Senna", 2, 4), b("Aphelios", 6, 7)], 7, 1);
    ok("Vex: explosão em volta do alvo", r.dmg.has(2) && r.dmg.has(3));
    ok("Vex: longe não leva", !r.dmg.has(4));
}

console.log("\n# Cone");
{
    const A = [a("Cho'Gath", 3, 3, { mana: true })];
    const r = fight(A, [b("Jax", 3, 4), b("Poppy", 2, 5), b("Vi", 3, 7)], 7, .3);
    ok("Cho'Gath acerta no leque", r.dmg.has(2) && r.dmg.has(3), [...r.dmg.keys()].join());
    ok("Cho'Gath não passa do alcance", !r.dmg.has(4));
}
{
    const unit = E.simulate({ units: [a("Graves", 3, 3)] }, { units: [b("Jax", 3, 5), b("Poppy", 4, 5)] }, 7);
    let attacks = 0, casts = 0;
    for (const fr of unit.frames) if (fr.t < 8) for (const ev of fr.e) { if (ev[0] === "a" && ev[1] === 1) attacks++; if (ev[0] === "c" && ev[1] === 1) casts++; }
    ok("Graves conjura a cada 2 ataques", casts > 0 && Math.abs(attacks / casts - 2) <= 0.6, `${attacks} ataques, ${casts} conjurações`);
}

console.log("\n# Maior grupo e projéteis");
{
    // Gragas: um inimigo perto e isolado, três juntos dentro de 3 casas.
    const A = [a("Gragas", 3, 3, { mana: true })];
    const Bt = [b("Jax", 1, 4), b("Poppy", 4, 6), b("Sylas", 5, 6), b("Vi", 4, 5)];
    const r = fight(A, Bt, 7, .9);
    const ev = r.fx[0].ev;
    ok("Gragas mira o grupo, não o mais perto", ev[3] !== 2, `alvo ${ev[3]}`);
    ok("barril acerta o grupo", [3, 4, 5].every(i => r.dmg.has(i)), [...r.dmg.keys()].join());
    ok("barril não acerta o isolado", !r.dmg.has(2));
    ok("dano só quando chega", ev[6] > 0.2, `viagem ${ev[6]}s`);
    const earliest = r.f.frames.find(fr => fr.e.some(e => e[0] === "d")).t;
    ok("nenhum dano antes do tempo de viagem", earliest >= r.casts[0].t + ev[6] - 0.1, `${earliest} x ${r.casts[0].t}+${ev[6]}`);
}
{
    const A = [a("Poppy", 3, 3, { mana: true })];
    const r = fight(A, [b("Jax", 3, 4), b("Sylas", 3, 6)], 7, 1);
    ok("Poppy mira o mais distante", r.fx[0].ev[3] === 3, r.fx[0].ev[3]);
    const none = fight(A, [b("Jax", 3, 4), b("Sylas", 3, 7)], 7, 1);
    ok("Poppy respeita 4 casas", none.fx[0].ev[3] === 3 && G.hexDist(3, 3, 3, 7) === 4);
}
{
    const A = [a("Twisted Fate", 3, 1, { mana: true })];
    const r = fight(A, [b("Jax", 3, 4), b("Poppy", 4, 5), b("Sylas", 6, 7)], 7, 1);
    ok("Twisted Fate: 2 cartas", r.fx.length === 2 && r.dmg.has(2) && r.dmg.has(3), [...r.dmg.keys()].join());
    ok("carta não acerta o terceiro", !r.dmg.has(4));
}
{
    const A = [a("Ziggs", 3, 1, { mana: true })];
    const solo = fight(A, [b("Jax", 3, 4)], 7, 1);
    const pair = fight(A, [b("Jax", 3, 4), b("Poppy", 3, 5)], 7, 1);
    ok("Ziggs dobra num alvo único", solo.dmg.get(2) > pair.dmg.get(2) * 1.6, `${solo.dmg.get(2)} x ${pair.dmg.get(2)}`);
}
{
    const A = [a("Kindred", 3, 1, { mana: true, star: 3 })];
    const r = fight(A, [b("Poppy", 3, 4), b("Jax", 3, 5)], 7, 1);
    ok("Kindred: lobo acerta o alvo", r.dmg.has(2));
}
{
    const A = [a("Aphelios", 3, 1, { mana: true })];
    const r = fight(A, [b("Jax", 3, 4), b("Poppy", 3, 5), b("Sylas", 4, 4)], 7, .6);
    ok("Aphelios: explosão no grupo", [2, 3, 4].every(i => r.dmg.has(i)), [...r.dmg.keys()].join());
}

console.log("\n# Lado invertido");
{
    // A mesma cena pelo outro lado: Draven no time B acerta a linha e não o de fora.
    const L = G.hexLine(3, 5, 3, 3, 14);
    const f = E.simulate({ units: [a("Jinx", L[1][0], L[1][1]), a("Senna", L[3][0], L[3][1]), a("Vayne", 0, 2)] }, { units: [b("Draven", 3, 5, { mana: true })] }, 7);
    const d = new Set();
    for (const fr of f.frames) { if (fr.t > 1.2) break; for (const ev of fr.e) if (ev[0] === "d") d.add(ev[1]); }
    ok("Draven do outro lado acerta a linha", d.has(1) && d.has(2), [...d].join());
    ok("e não acerta fora", !d.has(3));
}

console.log("\n# Etapas seguintes não mudam");
{
    const CHANGED = require('./changed-traits.js');
    const others = E.D.champions.filter(c => !E.ABILITIES[c.name].steps);
    const stable = others.filter(c => !c.traits.some(t => CHANGED.has(t)));
    ok("39 campeões sem mudança de regra", others.length === 39, others.length);
    ok("specs iguais ao motor antigo", others.every(c => JSON.stringify(E.ABILITIES[c.name]) === JSON.stringify(B.ABILITIES?.[c.name]) || !B.ABILITIES), B.ABILITIES ? "comparado" : "motor antigo não exporta; ver lutas abaixo");
    let same = 0, total = 0;
    for (let seed = 1; seed <= 200; seed++) {
        const rng = E.makeRng(seed);
        const pick = () => stable[Math.floor(rng() * stable.length)].id;
        const team = n => Array.from({ length: n }, (_, i) => ({ c: pick(), star: 1 + Math.floor(rng() * 2), x: i, y: Math.floor(rng() * 4), items: [] }));
        const A = team(5), Bt = team(5);
        const clean = f => JSON.stringify({ w: f.winner, s: f.survivors, d: f.duration, m: f.meta.map(x => x.stat), u: f.frames.map(fr => fr.u) });
        total++;
        if (clean(E.simulate({ units: A }, { units: Bt }, seed)) === clean(B.simulate({ units: A }, { units: Bt }, seed))) same++;
    }
    ok("lutas só com esses campeões são idênticas", same === total, `${same}/${total}`);
}

console.log("\n# Mesma semente, mesma luta");
{
    const stage = E.D.champions.filter(c => E.ABILITIES[c.name].steps);
    const team = (seed) => { const rng = E.makeRng(seed); return Array.from({ length: 6 }, (_, i) => ({ c: stage[Math.floor(rng() * stage.length)].id, star: 2, x: i, y: 1, items: [] })); };
    let same = true;
    for (let s = 1; s <= 30; s++) if (JSON.stringify(E.simulate({ units: team(s) }, { units: team(s + 99) }, s)) !== JSON.stringify(E.simulate({ units: team(s) }, { units: team(s + 99) }, s))) same = false;
    ok("repetível", same);
}

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
