// Testa qualidade, efeitos e vitrine no Edge com a RTX 3060. Uso: node drive-fx.js <raiz> <saída>
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const [root, out] = process.argv.slice(2);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${extra !== "" ? `  (${extra})` : ""}`); };
const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
    fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" }); res.end(d); } });
});
function connect(url, errors) {
    return new Promise(resolve => {
        const ws = new WebSocket(url);
        let id = 0; const waits = new Map();
        ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
            if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
            if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value || a.description).join(" "));
        };
        const send = (method, params = {}) => new Promise(r => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
        const ev = async x => {
            const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true });
            if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
            return r.result.result.value;
        };
        ws.onopen = async () => { await send("Runtime.enable"); await send("Page.enable"); resolve({ send, ev, ws }); };
    });
}
(async () => {
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const port = 9800 + Math.floor(Math.random() * 150);
    const dir = path.join(out, "edge-fx");
    fs.rmSync(dir, { recursive: true, force: true });
    const edge = spawn(EDGE, ["--headless=new", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, "--window-size=1920,1080", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11", "about:blank"], { stdio: "ignore" });
    let targets;
    for (let i = 0; i < 60; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch { } await sleep(200); }
    const errors = [];
    const A = await connect(targets.find(t => t.type === "page").webSocketDebuggerUrl, errors);
    const { ev, send } = A;
    const shot = async (name, p = A) => fs.writeFileSync(path.join(out, name), Buffer.from((await p.send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
    const go = async (q = "", p = A) => { await p.send("Page.navigate", { url: base + "tft.html" + q }); await sleep(1600); };
    const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("change",{bubbles:true}));})()`);

    console.log("\n# Seletor");
    await go();
    await send("Page.bringToFront");
    ok("padrão é Baixo", await ev(`document.getElementById('qualitySelect').value`) === "low");
    ok("FPS só aparece no Alto", await ev(`document.getElementById('fpsToggleBox').hidden`));
    ok("tabela cobre os 21 golpes", await ev(`Object.keys(TFTFx.STEP_FX).length`) === 21);
    ok("cada etapa tem visual", await ev(`Object.entries(TFTEngine.ABILITIES).filter(([,s])=>s.steps).every(([n,s])=>TFTFx.STEP_FX[n]&&TFTFx.STEP_FX[n].length===s.steps.length)`));
    await shot("f1-lobby.png");

    const waitCombat = async (p = A) => {
        for (let i = 0; i < 200; i++) {
            if (await p.ev(`document.querySelectorAll('#board .unit.fight').length > 0`)) return true;
            await p.ev(`(()=>{const b=document.querySelector('[data-pick]:not([disabled])');if(b)b.click();const r=document.getElementById('btnReady');if(r&&!r.disabled)r.click();})()`);
            await sleep(300);
        }
        return false;
    };

    console.log("\n# Baixo");
    await ev(`document.getElementById('nameInput').value='Teste'`);
    await ev(`document.getElementById('btnBot').click()`);
    ok("combate começa", await waitCombat());
    ok("Baixo: nenhum canvas", await ev(`!document.querySelector('.fx-canvas')`));
    let sawShot = false;
    for (let i = 0; i < 40 && !sawShot; i++) { sawShot = await ev(`!!document.querySelector('#board .shot, #board .float')`); await sleep(150); }
    ok("Baixo: visual antigo continua", sawShot);
    await ev(`window.confirm=()=>true;document.getElementById('btnQuit').click()`);

    console.log("\n# Alto na partida");
    await go();
    await setVal("#qualitySelect", "high");
    ok("escolha salva", await ev(`localStorage.getItem('mudaeTft_quality')`) === "high");
    await go();
    ok("volta como Alto", await ev(`document.getElementById('qualitySelect').value`) === "high");
    ok("Alto: FPS disponível", await ev(`!document.getElementById('fpsToggleBox').hidden`));
    await ev(`document.getElementById('fpsToggle').click()`);
    await ev(`document.getElementById('nameInput').value='Teste'`);
    await ev(`document.getElementById('btnBot').click()`);
    ok("combate começa", await waitCombat());
    ok("Alto: canvas sobre o tabuleiro", await ev(`!!document.querySelector('#board .fx-canvas')`));
    ok("Alto: sem bolinha antiga", await ev(`(async()=>{for(let i=0;i<20;i++){if(document.querySelector('#board .shot'))return false;await new Promise(r=>setTimeout(r,150));}return true;})()`));
    ok("contador de FPS visível", await ev(`!document.getElementById('fxFps').hidden`));
    await shot("f2-alto-partida.png");
    await ev(`window.confirm=()=>true;document.getElementById('btnQuit').click()`);
    await sleep(300);
    ok("canvas sai junto com a partida", await ev(`!document.querySelector('.fx-canvas')`));

    console.log("\n# Vitrine: cada campeão");
    await go("?fxtest");
    await send("Page.bringToFront");
    ok("vitrine abre", await ev(`!!document.querySelector('.fxtest-bar') && !!document.querySelector('.fx-canvas')`));
    const size = await ev(`(()=>{const r=document.getElementById('board').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}})()`);
    ok("tabuleiro da vitrine em tamanho real", size.w >= 500 && size.h >= 500, JSON.stringify(size));
    ok("vitrine não muda a escolha salva", await ev(`localStorage.getItem('mudaeTft_quality')`) === "high");
    const names = await ev(`[...document.querySelectorAll('#fxChamp option')].map(o=>o.value)`);
    ok("60 campeões na lista", names.length === 60);
    let errBefore = errors.length, noEvents = [];
    for (const id of names) {
        await setVal("#fxChamp", id);
        await sleep(90);
    }
    ok("os 60 rodam sem erro", errors.length === errBefore, errors.slice(errBefore, errBefore + 3).join(" | "));
    // Prints no meio de cada golpe: o tempo conta a partir da troca de campeão.
    const moments = { Gragas: ["barril", 180], TwistedFate: ["carta", 170], Draven: ["machado", 260], Senna: ["raio", 190], Ziggs: ["bomba", 260], Chogath: ["cone", 200], Leona: ["leona", 240], Seraphine: ["onda", 300], Zyra: ["vinha", 260] };
    for (const [id, [label, ms]] of Object.entries(moments)) {
        await setVal("#fxChamp", id);
        await sleep(ms);
        await shot(`f3-${label}.png`);
    }
    await setVal("#fxChamp", "Sejuani");
    await sleep(1300);
    await shot("f3-aviso.png");
    await sleep(1000);
    await shot("f3-stun.png");

    console.log("\n# Desempenho no modo estresse (RTX 3060, 1080p, sem exibir no monitor)");
    await ev(`document.getElementById('fxStress').click()`);
    const samples = [];
    for (let i = 0; i < 18; i++) { await sleep(1000); const s = await ev(`TFTFx.stats()`); if (s) samples.push(s); }
    await shot("f4-estresse.png");
    const avg = k => samples.reduce((t, s) => t + s[k], 0) / samples.length;
    const max = k => Math.max(...samples.map(s => s[k]));
    console.log("  amostras:", samples.length, "| FPS médio", avg("fps").toFixed(0), "| pior quadro", max("worstMs"), "ms | efeitos média", avg("drawMs").toFixed(2), "ms, pior", max("drawWorstMs"), "ms | efeitos ao mesmo tempo", max("peakFx"), "| partículas", max("peakParticles"));
    ok("o estresse desenhou efeitos de verdade", max("peakFx") >= 20 && avg("drawMs") > 0, `até ${max("peakFx")} efeitos`);
    ok("efeitos abaixo de 8 ms por quadro", avg("drawMs") < 8, `${avg("drawMs").toFixed(2)} ms`);
    ok("60 FPS ou mais em média", avg("fps") >= 58, avg("fps").toFixed(0));
    ok("partículas dentro do limite", max("peakParticles") <= 5000, max("peakParticles"));
    await ev(`document.getElementById('fxStress').click()`);

    console.log("\n# Reduzir movimento");
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await go("?fxtest");
    await send("Page.bringToFront");
    await ev(`document.getElementById('fxStress').click()`);
    const calm = [];
    for (let i = 0; i < 8; i++) { await sleep(1000); const st = await ev(`TFTFx.stats()`); if (st) calm.push(st); }
    ok("sem partículas com a opção ligada", calm.length > 0 && Math.max(...calm.map(x => x.peakParticles)) === 0, Math.max(...calm.map(x => x.peakParticles)));
    ok("golpes continuam visíveis", Math.max(...calm.map(x => x.peakFx)) > 0, Math.max(...calm.map(x => x.peakFx)));
    await send("Emulation.setEmulatedMedia", { features: [] });

    console.log("\n# Navegador sem canvas");
    await go();
    await setVal("#qualitySelect", "high");
    await ev(`HTMLCanvasElement.prototype.getContext = () => null`);
    await ev(`document.getElementById('nameInput').value='Teste'`);
    await ev(`document.getElementById('btnBot').click()`);
    ok("combate começa mesmo sem canvas", await waitCombat());
    ok("volta para o Baixo sem travar", await ev(`TFTFx.getQuality()`) === "low" && await ev(`!document.querySelector('.fx-canvas')`));
    await ev(`window.confirm=()=>true;document.getElementById('btnQuit').click()`);

    console.log("\n# Sala com 2 jogadores, um em cada qualidade");
    try {
        await go();
        await setVal("#qualitySelect", "high");
        await ev(`document.getElementById('nameInput').value='Anfitriao'`);
        await ev(`document.getElementById('btnCreate').click()`);
        let code = "";
        for (let i = 0; i < 40; i++) { code = await ev(`document.getElementById('roomCode').textContent`); if (/^[A-Z0-9]{6}$/.test(code)) break; await sleep(500); }
        if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("sala não abriu: " + await ev(`document.getElementById('lobbyStatus').textContent`));
        const created = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
        const B = await connect(created.webSocketDebuggerUrl, errors);
        await go("", B);
        await B.ev(`localStorage.setItem('mudaeTft_quality','low')`);
        await go("", B);
        await B.ev(`document.getElementById('nameInput').value='Convidado'`);
        await B.ev(`document.getElementById('codeInput').value=${JSON.stringify(code)}`);
        await B.ev(`document.getElementById('btnJoin').click()`);
        for (let i = 0; i < 40; i++) { if (await B.ev(`!document.getElementById('roomBox').hidden && document.querySelectorAll('#roomPlayers li').length>=2`)) break; await sleep(500); }
        await B.ev(`document.getElementById('btnRoomReady').click()`);
        await sleep(400);
        await ev(`document.getElementById('btnRoomReady').click()`);
        await send("Page.bringToFront");
        const [ca, cb] = await Promise.all([waitCombat(A), waitCombat(B)]);
        ok("os dois entram em combate", ca && cb);
        await sleep(600);
        ok("anfitrião em Alto tem canvas", await ev(`!!document.querySelector('#board .fx-canvas')`));
        ok("convidado em Baixo não tem canvas", await B.ev(`!document.querySelector('.fx-canvas')`));
        const unitsA = await ev(`document.querySelectorAll('#board .unit.fight').length`);
        const unitsB = await B.ev(`document.querySelectorAll('#board .unit.fight').length`);
        ok("a mesma luta nas duas telas", unitsA === unitsB && unitsA > 0, `${unitsA} x ${unitsB}`);
    } catch (e) {
        console.log("  AVISO sala não testada:", e.message);
        fail++;
    }

    console.log("\n# Console");
    ok("sem erros no console", errors.length === 0, errors.slice(0, 5).join(" | "));
    console.log(`\n${pass} ok, ${fail} falhas`);
    edge.kill(); server.close();
    await sleep(300);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error("ERRO:", e); process.exit(2); });
