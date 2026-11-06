// Testes de applyCollection. Uso: node test-coll.js <raiz do projeto>
const E = require(process.argv[2] + "/tft-engine.js");
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const ids = E.D.champions.map(c => c.id);
const ch = (i, k = i) => ({ name: "Char" + i, series: "S", photo: "", kakera: k });
const names = s => Object.values(s).map(x => x.name.toLowerCase());
const unique = a => new Set(a).size === a.length;
const roster = n => Array.from({ length: n }, (_, i) => ch(i, 1000 - i));

const b = E.buildSkins([roster(60)], 1);
ok("sem coleção devolve igual", JSON.stringify(E.applyCollection(b, {})) === JSON.stringify(b));
ok("coleção nula devolve igual", JSON.stringify(E.applyCollection(b, null)) === JSON.stringify(b));
{
    const before = JSON.stringify(b);
    E.applyCollection(b, { [ids[0]]: { name: "X" } });
    ok("não altera o sorteio original", JSON.stringify(b) === before);
}
const out = E.applyCollection(b, { Morgana: { name: "Naruto", photo: "", series: "", kakera: 1 } });
ok("vínculo entra no campeão certo", out.Morgana.name === "Naruto");
ok("os outros seguem do sorteio", ids.filter(i => i !== "Morgana").every(i => out[i].name === b[i].name));

const victim = ids.find(i => i !== "Morgana");
const dupName = b[victim].name;
const o2 = E.applyCollection(b, { Morgana: { name: dupName, photo: "", series: "", kakera: 1 } });
ok("personagem do sorteio não repete", unique(names(o2)) && o2.Morgana.name === dupName && o2[victim].name !== dupName, `${victim}=${o2[victim].name}`);
ok("foto deslocada vai para o campeão afetado", o2[victim].name === b.Morgana.name);

const same = E.applyCollection(b, { Morgana: { name: b.Morgana.name, photo: "", series: "", kakera: 1 } });
ok("vincular o que já estava lá não remove outros", Object.keys(same).length === 60 && unique(names(same)));
ok("maiúsculas contam como o mesmo nome", unique(names(E.applyCollection(b, { Morgana: { name: dupName.toUpperCase() } }))));
ok("campeão ou vínculo inválido é ignorado", JSON.stringify(E.applyCollection(b, { NaoExiste: { name: "Z" }, Jax: null, Poppy: {} })) === JSON.stringify(b));
ok("dois vínculos com o mesmo nome: só o primeiro", names(E.applyCollection(b, { Morgana: { name: "Mesmo" }, Jax: { name: "mesmo" } })).filter(n => n === "mesmo").length === 1);

const all = Object.fromEntries(ids.map((id, i) => [id, { name: "Pin" + i, photo: "", series: "", kakera: i }]));
const o60 = E.applyCollection(b, all);
ok("vincular os 60", Object.keys(o60).length === 60 && ids.every((id, i) => o60[id].name === "Pin" + i));
const reversed = E.applyCollection(b, Object.fromEntries(ids.map((id, i) => [id, ch(59 - i)])));
ok("60 vínculos com os mesmos personagens do sorteio", Object.keys(reversed).length === 60 && unique(names(reversed)));

{
    let dup = 0, lost = 0, wrong = 0, runs = 0;
    for (const size of [0, 1, 5, 20, 59, 60, 120]) for (const pinN of [0, 1, 2, 10, 30, 59, 60]) for (let seed = 1; seed <= 25; seed++) {
        runs++;
        const base = E.buildSkins([roster(size)], seed);
        const rng = E.makeRng(seed * 7);
        const chosen = ids.slice().sort(() => rng() - .5).slice(0, pinN);
        const chars = roster(Math.max(size, 80)).sort(() => rng() - .5).slice(0, pinN);
        const pins = Object.fromEntries(chosen.map((id, i) => [id, chars[i]]));
        const o = E.applyCollection(base, pins);
        if (!unique(names(o))) dup++;
        if (chosen.some(id => o[id].name !== pins[id].name)) wrong++;
        // Quando há foto suficiente, nenhum campeão fica sem personagem.
        if (Object.keys(base).length === 60 && Object.keys(o).length < 60) lost++;
    }
    ok(`sem repetição em ${runs} combinações`, dup === 0, `repetidos ${dup}`);
    ok("vínculo sempre respeitado", wrong === 0, `errados ${wrong}`);
    ok("nenhum campeão perde foto à toa", lost === 0, `perdas ${lost}`);
}
{
    const shared = E.buildSkins([roster(60)], 5);
    const before = JSON.stringify(shared);
    const host = E.applyCollection(shared, { Morgana: { name: "Naruto" } });
    const guest = E.applyCollection(shared, { Morgana: { name: "Goku" } });
    ok("cada jogador vê a própria coleção", host.Morgana.name === "Naruto" && guest.Morgana.name === "Goku" && JSON.stringify(shared) === before);
}
console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
