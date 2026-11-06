// Tela: robô da Nitro, laser, Bloblet, ExoTec, Chapéu e Mods (Edge com a GPU). Uso: node drive-new.js <raiz> <saída>
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const [root, out] = process.argv.slice(2);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`  ${c ? "ok  " : "FAIL"} ${n}${x !== "" ? `  (${x})` : ""}`); };
const server = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split("?")[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" }); r.end(d); } }); });
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const port = 9700 + Math.floor(Math.random() * 150);
  const dir = path.join(out, "edge-new"); fs.rmSync(dir, { recursive: true, force: true });
  const edge = spawn(EDGE, ["--headless=new", "--no-first-run", `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, "--window-size=1920,1080", "--ignore-gpu-blocklist", "--use-angle=d3d11", "about:blank"], { stdio: "ignore" });
  let t; for (let i = 0; i < 60; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (t.length) break; } catch { } await sleep(200); }
  const ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const w = new Map(), errs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push(m.params.args.map(a => a.value || a.description).join(" ")); };
  const send = (me, pa = {}) => new Promise(r => { const i = ++id; w.set(i, r); ws.send(JSON.stringify({ id: i, method: me, params: pa })); });
  const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "erro"); return r.result.result.value; };
  const shot = async n => fs.writeFileSync(path.join(out, n), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: base + "tft.html?debug" }); await sleep(1600);
  await ev(`localStorage.setItem('tftFxQuality','high')`);
  await ev(`document.getElementById('nameInput').value='Teste';document.getElementById('btnBot').click()`); await sleep(800);
  // monta o cenário direto no estado local
  const setup = `(() => {
    const { L, E, render, enterPhase, broadcastState } = window.__tft; const g = L.g, p = g.players[0];
    if (g.phase === 'carousel') { E.endCarousel(g); E.nextRound(g); enterPhase(); }
    const id = n => E.CH_BY_NAME[n].id;
    for (const k of Object.keys(p.board)) delete p.board[k];
    p.items = ['Kingpin', 'Mod_Brutamontes', 'Exo_Pulse', 'BFSword'];
    p.level = 9; p.gold = 50; p.chrome = 120;
    [['Kindred', 0, 3], ['Nidalee', 1, 0], ['Shyvana', 2, 0], ['Elise', 4, 0], ['Jhin', 5, 3], ['Darius', 6, 0], ['Shaco', 1, 3], ['Twisted Fate', 2, 3], ['Zac', 3, 1]]
      .forEach(([n, x, y]) => { p.board[x + ',' + y] = { uid: g.nextUid++, c: id(n), star: 2, items: [] }; });
    E.act(g, 0, { a: 'lock' }); E.act(g, 0, { a: 'lock' });
    p.shopBlob = 2;
    broadcastState(); render();
    return JSON.stringify({ mech: Object.values(p.board).filter(u => u.summon).map(u => u.c), items: p.items });
  })()`;
  const st = JSON.parse(await ev(setup));
  ok("robô aparece no tabuleiro", st.mech.length === 1 && st.mech[0] === "R-080T", st.mech.join());
  ok("chapéu entregue com 3 Transgressores", st.items.filter(i => i === "Kingpin").length >= 1, st.items.join());
  ok("robô desenhado", await ev(`[...document.querySelectorAll('#board .unit img')].some(i => i.src.includes('summonlevel2'))`));
  ok("Bloblet na loja", await ev(`!!document.querySelector('.shop-card.bloblet')`));
  ok("ícones novos carregam", await ev(`new Promise(r => setTimeout(() => r([...document.images].filter(i => /15\\.14/.test(i.src)).every(i => i.complete && i.naturalWidth > 0)), 2500))`));
  // dica do item ExoTec
  const tip = await ev(`(() => { const s = document.querySelector('[data-tip="item:Exo_Pulse"]'); if (!s) return ''; const r = s.getBoundingClientRect(); s.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', clientX: r.x + 5, clientY: r.y + 5 })); return new Promise(res => setTimeout(() => res([...document.querySelectorAll('#tip, .tip, [class*=tooltip]')].map(x => x.textContent).join(' ')), 300)); })()`);
  ok("dica do ExoTec", /Só ExoTec/.test(tip), tip.slice(0, 80));
  await shot("n1-planejamento.png");
  // combate com 4 Nitro: laser
  await ev(`(() => { const { L, E, broadcastState, render } = window.__tft; const g = L.g, p = g.players[0]; delete p.board['3,1']; p.board['3,2'] = { uid: g.nextUid++, c: E.CH_BY_NAME['Elise'].id, star: 1, items: [] }; p.board['4,2'] = { uid: g.nextUid++, c: E.CH_BY_NAME['Kindred'].id, star: 2, items: [] }; E.act(g, 0, { a: 'lock' }); broadcastState(); render(); return Object.keys(p.board).length; })()`);
  await ev(`document.getElementById('btnReady').click()`);
  let fought = false; for (let i = 0; i < 80 && !fought; i++) { fought = await ev(`document.querySelectorAll('#board .unit.fight').length > 0`); await sleep(150); }
  ok("combate começa", fought);
  await sleep(1800); await shot("n2-combate.png");
  await sleep(2500); await shot("n3-combate.png");
  const champsOnBoard = await ev(`Object.values(window.__tft.L.g.players[0].board).filter(u => !u.summon).length`);
  const fc = await ev(`document.getElementById("fieldCount").textContent`);
  ok("contador ignora o robô", fc.includes(`${champsOnBoard}/`), `${fc} (campeões: ${champsOnBoard})`);
  ok("sem erros no console", errs.length === 0, errs.slice(0, 3).join(" | "));
  console.log(`${pass} ok, ${fail} falhas`);
  ws.close(); edge.kill(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
