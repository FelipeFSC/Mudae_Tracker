// Mede o custo de partidas de 8 bots no motor real. Só leitura. Uso: node tft-load.js <raiz>
const E = require(process.argv[2] + "/tft-engine.js");
const size = o => Buffer.byteLength(JSON.stringify(o));
const all = [];
for (const seed of [11, 222, 3333]) {
    const names = Array.from({ length: 8 }, (_, i) => "P" + i);
    const g = E.createGame({ names, seed, bots: names.map(() => true), skins: {} });
    let safety = 0;
    E.nextRound(g);
    while (g.phase !== "end" && safety++ < 200) {
        if (g.phase === "carousel") {
            E.endCarousel(g);
            if (g.phase === "carousel") E.nextRound(g);
            continue;
        }
        if (g.phase !== "plan") { E.nextRound(g); continue; }
        g.players.forEach((p, i) => { if (p.alive) E.botPlan(g, i); });
        const stateKB = Math.max(...g.players.map((_, i) => size(E.publicState(g, i)))) / 1024;
        const t0 = performance.now();
        const c = E.startCombat(g);
        const simMs = performance.now() - t0;
        let totalKB = 0, maxFightKB = 0, maxFrames = 0, maxEv = 0, peakEv = 0, maxUnits = 0, dur = 0;
        for (const f of c.fights) {
            const k = size(f) / 1024;
            const ev = f.frames.reduce((s, fr) => s + fr.e.length, 0);
            totalKB += k;
            maxFightKB = Math.max(maxFightKB, k);
            maxFrames = Math.max(maxFrames, f.frames.length);
            maxEv = Math.max(maxEv, ev);
            peakEv = Math.max(peakEv, ...f.frames.map(fr => fr.e.length));
            maxUnits = Math.max(maxUnits, f.frames[0].u.length);
            dur = Math.max(dur, f.duration);
        }
        all.push({ seed, round: g.roundIdx, alive: g.players.filter(p => p.alive).length, fights: c.fights.length, simMs: +simMs.toFixed(1), fightKB: +maxFightKB.toFixed(1), hostKB: +totalKB.toFixed(1), stateKB: +stateKB.toFixed(1), units: maxUnits, events: maxEv, peakEv100ms: peakEv, dur: +dur.toFixed(1) });
        E.finishCombat(g);
        if (g.phase !== "end") E.nextRound(g);
    }
    console.log(`seed ${seed}: fase ${g.phase}, combates ${all.filter(r => r.seed === seed).length}`);
}
const max = k => Math.max(...all.map(r => r[k]));
console.table(all.filter(r => r.seed === 11).slice(-6));
console.log("PIOR CASO:", { simMs: max("simMs"), fightKB: max("fightKB"), hostKB_rodada: max("hostKB"), stateKB: max("stateKB"), unidades: max("units"), eventosLuta: max("events"), picoEventos100ms: max("peakEv100ms"), duracaoS: max("dur") });
