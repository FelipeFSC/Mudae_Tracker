// Compara a força dos campeões antes e depois, com lutas iguais nos dois motores.
// Uso: node balance.js <raiz> <baseline>
const [root, baseDir] = process.argv.slice(2);
const NEW = require(root + "/tft-engine.js"), OLD = require(baseDir + "/tft-engine.js");
const champs = NEW.D.champions;
const stage = new Set(champs.filter(c => NEW.ABILITIES[c.name].steps).map(c => c.id));

// Duelo por custo: o campeão em 2 estrelas, em time de 4 aliados aleatórios do mesmo custo, contra 5 do mesmo custo.
function build(rng, cost, focus) {
    const pool = champs.filter(c => c.cost === cost);
    const pick = () => pool[Math.floor(rng() * pool.length)].id;
    const row = (id, i) => ({ c: id, star: 2, x: 1 + i, y: id && NEW.CH[id].range <= 2 ? 0 : 2, items: [] });
    const A = [focus, pick(), pick(), pick(), pick()].map(row);
    const B = [pick(), pick(), pick(), pick(), pick()].map(row);
    return [A, B];
}
const rows = [];
const N = 150;
for (const c of champs) {
    let wn = 0, wo = 0, dn = 0, doo = 0, tn = 0, to = 0;
    for (let s = 1; s <= N; s++) {
        const rng = NEW.makeRng(s * 131 + c.id.length * 7 + c.cost);
        const [A, B] = build(rng, c.cost, c.id);
        const fn = NEW.simulate({ units: A }, { units: B }, s), fo = OLD.simulate({ units: A }, { units: B }, s);
        const total = f => { const m = f.meta.find(x => x.champ === c.id && x.side === 0); return m.stat.p + m.stat.m + m.stat.t; };
        if (fn.winner === 0) wn++; if (fo.winner === 0) wo++;
        dn += total(fn); doo += total(fo);
        tn += fn.duration; to += fo.duration;
    }
    rows.push({ cost: c.cost, name: c.name, etapa: stage.has(c.id) ? "sim" : "", antes: Math.round(wo / N * 100), depois: Math.round(wn / N * 100), dano_antes: Math.round(doo / N), dano_depois: Math.round(dn / N), var: Math.round((dn / doo - 1) * 100), dur_a: +(to / N).toFixed(1), dur_d: +(tn / N).toFixed(1) });
}
const staged = rows.filter(r => r.etapa).sort((a, b) => a.cost - b.cost || (b.depois - b.antes) - (a.depois - a.antes));
console.table(staged);
const others = rows.filter(r => !r.etapa);
const mean = (l, k) => l.reduce((s, r) => s + r[k], 0) / l.length;
console.log("Média dos outros 39 (vitórias do time deles):", mean(others, "antes").toFixed(1), "->", mean(others, "depois").toFixed(1));
console.log("Duração média das lutas:", mean(rows, "dur_a").toFixed(1), "->", mean(rows, "dur_d").toFixed(1));
console.log("Mudança por custo (vitórias, só etapa):");
for (const cost of [1, 2, 3, 4, 5]) { const l = staged.filter(r => r.cost === cost); if (l.length) console.log(`  custo ${cost}: ${mean(l, "antes").toFixed(0)}% -> ${mean(l, "depois").toFixed(0)}%`); }
