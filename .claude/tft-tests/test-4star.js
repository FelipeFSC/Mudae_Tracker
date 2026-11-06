// Todo campeão e unidade da Horuja em 4★ luta sem NaN (Vida, dano, cura). Uso: node test-4star.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
let bad = 0, n = 0;
const names = [...E.D.champions.map(c => c.name), "R-080T", "T-43X", "Drone Mech", "Tropa Mech", "Tibbers"];
for (const name of names) {
  for (const star of [1, 2, 3, 4]) {
    n++;
    const f = E.simulate({ units: [{ c: E.CH_BY_NAME[name].id, star, x: 3, y: 0, items: ["WarmogsArmor"], fullMana: true }] },
      { units: [{ c: E.CH_BY_NAME.Poppy.id, star: 4, x: 3, y: 0, items: [] }, { c: E.CH_BY_NAME.Jinx.id, star: 2, x: 2, y: 3, items: [] }] }, 9);
    const nums = f.meta.flatMap(m => [m.stats.hp, m.stat.p, m.stat.m, m.stat.t, m.stat.heal, m.stat.shield]);
    const lastHp = f.frames[f.frames.length - 1].u.map(x => x[3]);
    if (nums.some(v => !Number.isFinite(v)) || lastHp.some(v => !Number.isFinite(v))) { bad++; console.log(`  FAIL ${name} ${star}★`); }
  }
}
console.log(`${n - bad} ok, ${bad} falhas`);
process.exit(bad ? 1 : 0);
