// Exercita a coleção do TFT no Edge headless (perfil temporário). Uso: node drive-coll.js <raiz> <saída>
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const [root, out] = process.argv.slice(2);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".json": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${extra !== "" ? `  (${extra})` : ""}`); };
const server = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"));
    fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream" }); res.end(d); } });
});

function connect(wsUrl, errors) {
    return new Promise(resolve => {
        const ws = new WebSocket(wsUrl);
        let id = 0; const waits = new Map();
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
            if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
            if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value || a.description).join(" "));
        };
        const send = (method, params = {}) => new Promise(r => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
        const ev = async expr => {
            const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
            if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
            return r.result.result.value;
        };
        ws.onopen = async () => { await send("Runtime.enable"); await send("Page.enable"); resolve({ send, ev, ws }); };
    });
}

// Personagens de teste: harém, wishlist e um com HTML no nome.
const SEED = `(async()=>{
  await Database.init();
  const cur = await Database.getAllCharacters();
  for (const c of cur) await Database.deleteCharacter(c.id);
  const rows = [];
  for (let i=1;i<=70;i++) rows.push({name:'Hero'+i,series:i%2?'Serie A':'Serie B',kakera:2000-i,claimed:true,category:'comuns',genders:[i%2?'wa':'ha'],photo:''});
  for (let i=1;i<=5;i++) rows.push({name:'Wish'+i,series:'Serie W',kakera:50+i,claimed:false,category:i%2?'favoritos':'estrelas',genders:['wg'],photo:''});
  rows.push({name:'<img src=x onerror="window.__xss=1">',series:'<b>x</b>',kakera:1,claimed:true,category:'comuns',genders:['hg'],photo:''});
  for (const r of rows) await Database.addCharacter(r);
  return rows.length;
})()`;

(async () => {
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}/`;
    const port = 9700 + Math.floor(Math.random() * 200);
    const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${path.join(out, "edge-coll")}`, `--remote-debugging-port=${port}`, "--window-size=1500,1000", "about:blank"], { stdio: "ignore" });
    let targets;
    for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch { } await sleep(200); }
    const errors = [];
    const A = await connect(targets.find(t => t.type === "page").webSocketDebuggerUrl, errors);
    const { ev, send } = A;
    const shot = async (p, name) => { const r = await p.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); fs.writeFileSync(path.join(out, name), Buffer.from(r.result.data, "base64")); };
    const go = async p => { await p.send("Page.navigate", { url: base + "tft.html" }); await sleep(1500); };
    const click = (p, sel) => p.ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("input",{bubbles:true}));})()`);
    const openCard = id => click(A, `[data-champ="${id}"]`);
    const pickByName = async name => {
        await setVal("#collCharSearch", name); await sleep(50);
        return ev(`(()=>{const b=[...document.querySelectorAll('#collChars .coll-char')].find(x=>x.querySelector('b').textContent===${JSON.stringify(name)});if(!b)return 'nao-achou';if(b.disabled)return 'bloqueado:'+b.querySelector('.coll-char-note').textContent;b.click();return 'ok';})()`);
    };
    const linked = id => ev(`(()=>{const c=document.querySelector('[data-champ="${id}"] .coll-link');return c?c.textContent.trim():null})()`);

    await go(A);
    console.log("personagens de teste:", await ev(SEED));
    await go(A);

    console.log("\n# Tela");
    ok("botão no lobby", (await ev(`document.getElementById('btnCollection').textContent`)) === "MONTAR COLEÇÃO");
    await click(A, "#btnCollection"); await sleep(400);
    ok("lobby some e a tela abre", await ev(`document.getElementById('lobby').hidden && !document.getElementById('collection').hidden`));
    ok("60 campeões", await ev(`document.querySelectorAll('.coll-card').length`) === 60);
    ok("5 grupos de custo", await ev(`document.querySelectorAll('.coll-group').length`) === 5);
    const groups = await ev(`[...document.querySelectorAll('.coll-group h2')].map(h=>h.textContent.trim().replace(/\\s+/g,' '))`);
    ok("quantidade por custo", groups.join("|") === "1|2|3|4|5", groups.join(" | "));
    ok("foto do LoL, não do TFT", (await ev(`document.querySelector('[data-champ="Jax"] img').src`)).includes("ddragon.leagueoflegends.com/cdn/img/champion/loading/Jax_0.jpg"));
    ok("exceção do Jarvan", (await ev(`document.querySelector('[data-champ="Jarvan"] img').src`)).includes("JarvanIV_0"));
    ok("Rhaast usa Kayn", (await ev(`document.querySelector('[data-champ="Rhaast"] img').src`)).includes("Kayn_0"));
    ok("Kobuko usa o ícone do TFT", (await ev(`document.querySelector('[data-champ="Kobuko"] img').src`)).includes("communitydragon"));

    console.log("\n# Filtros de campeão");
    await setVal("#collSearch", "morg"); await sleep(50);
    ok("busca por nome", await ev(`[...document.querySelectorAll('.coll-card')].map(c=>c.dataset.champ).join()`) === "Morgana");
    await setVal("#collSearch", "zzzz"); await sleep(50);
    ok("sem resultado avisa", await ev(`!document.getElementById('collEmpty').hidden`));
    await setVal("#collSearch", ""); await sleep(50);
    const trait = "Bastião";
    await click(A, `[data-trait="${trait}"]`); await sleep(50);
    const tn = await ev(`document.querySelectorAll('.coll-card').length`);
    const expected = await ev(`TFTEngine.D.champions.filter(c=>c.traits.includes(${JSON.stringify(trait)})).length`);
    ok("filtro de classe", tn === expected && tn < 60, `${tn}`);
    await click(A, `[data-trait="${trait}"]`); await sleep(50);
    ok("clicar de novo limpa a classe", await ev(`document.querySelectorAll('.coll-card').length`) === 60);

    console.log("\n# Vincular");
    await openCard("Morgana"); await sleep(250);
    ok("painel abre com as especificações", await ev(`!document.getElementById('collModal').hidden && /Vida/.test(document.getElementById('collChamp').textContent) && /Mana/.test(document.getElementById('collChamp').textContent)`));
    ok("arte completa só no painel", (await ev(`document.querySelector('.coll-splash').src`)).includes("/splash/Morgana_0.jpg"));
    ok("card sem texto extra, com ícones das classes", await ev(`(()=>{const c=document.querySelector('[data-champ="Jax"]');return c.querySelectorAll('.coll-card-traits img').length===2&&c.querySelector('.coll-card-name').textContent==='Jax'})()`));
    ok("lista traz todos do tracker", (await ev(`document.getElementById('collCharCount').textContent`)).startsWith("76"), await ev(`document.getElementById('collCharCount').textContent`));
    await shot(A, "c1-painel.png");
    await setVal("#collCharClaim", "unclaimed"); await sleep(50);
    ok("filtro: não reivindicados", await ev(`document.querySelectorAll('#collChars .coll-char').length`) === 5);
    await setVal("#collCharCategory", "estrelas"); await sleep(50);
    ok("filtro: categoria", await ev(`document.querySelectorAll('#collChars .coll-char').length`) === 2);
    await setVal("#collCharClaim", ""); await setVal("#collCharCategory", "");
    await setVal("#collCharGender", "hg"); await sleep(50);
    ok("filtro: roleta", await ev(`document.querySelectorAll('#collChars .coll-char').length`) === 1);
    await setVal("#collCharGender", "");
    await setVal("#collCharSearch", "serie b"); await sleep(50);
    ok("busca por série", await ev(`document.querySelectorAll('#collChars .coll-char').length`) === 35);
    ok("wishlist pode ser vinculada", await pickByName("Wish1") === "ok");
    await sleep(250);
    ok("card mostra o personagem", await linked("Morgana") === "Wish1", await linked("Morgana"));
    ok("contador no lobby", (await ev(`document.getElementById('btnCollection').textContent`)) === "MONTAR COLEÇÃO (1/60)");

    console.log("\n# Sem repetição");
    await openCard("Jax"); await sleep(150);
    const blocked = await pickByName("Wish1");
    ok("personagem em uso fica bloqueado", blocked === "bloqueado:Em uso: Morgana", blocked);
    await click(A, "#collClose");
    ok("HTML no nome não executa", await ev(`(async()=>{document.querySelector('[data-champ="Poppy"]').click();await new Promise(r=>setTimeout(r,200));const safe=window.__xss===undefined&&!document.querySelector('#collChars .coll-char b img');document.getElementById('collClose').click();return safe;})()`));
    await click(A, '[data-champ="Morgana"]'); await sleep(150);
    await click(A, "#collUnlink"); await sleep(250);
    ok("remover libera o personagem", await ev(`!document.querySelector('[data-champ="Morgana"].linked') && !document.querySelector('[data-champ="Morgana"] .coll-link')`));
    await pickByName("Wish1");
    await sleep(250);
    ok("revincular depois de remover", await linked("Morgana") === "Wish1");

    console.log("\n# Persistência, perfis e backup");
    await sleep(300);
    await go(A);
    ok("sobrevive ao recarregar", (await ev(`document.getElementById('btnCollection').textContent`)) === "MONTAR COLEÇÃO (1/60)");
    ok("backup inclui a coleção", (await ev(`Database.exportAllData().then(d=>Object.keys(d.config.tftCollection).join())`)) === "Morgana");
    ok("outros campos da config continuam", await ev(`(async()=>{const c=await Database.getConfig();await Database.saveConfig({...c,marcaTeste:1});return true})()`));
    await click(A, "#btnCollection"); await sleep(250);
    await openCard("Jax"); await sleep(150); await pickByName("Hero1"); await sleep(300);
    ok("salvar a coleção preserva a config", await ev(`Database.getConfig().then(c=>c.marcaTeste===1&&Object.keys(c.tftCollection).length===2)`));
    const profile1 = await ev(`Database.getActiveProfileId()`);
    const newProfile = await ev(`Database.createProfile('KL').then(p=>p.id??p)`);
    await ev(`Database.setActiveProfile(${JSON.stringify(newProfile)})`);
    await go(A);
    ok("perfil novo sem vínculos", (await ev(`document.getElementById('btnCollection').textContent`)) === "MONTAR COLEÇÃO");
    await ev(`Database.setActiveProfile(${JSON.stringify(profile1)})`);
    await go(A);
    ok("perfil antigo mantém os vínculos", (await ev(`document.getElementById('btnCollection').textContent`)) === "MONTAR COLEÇÃO (2/60)");
    await ev(`(async()=>{const all=await Database.getAllCharacters();const c=all.find(x=>x.name==='Hero1');await Database.deleteCharacter(c.id);})()`);
    await go(A); await sleep(300);
    ok("personagem apagado solta o vínculo", (await ev(`document.getElementById('btnCollection').textContent`)) === "MONTAR COLEÇÃO (1/60)");
    ok("o vínculo apagado some do banco", (await ev(`Database.getConfig().then(c=>Object.keys(c.tftCollection).join())`)) === "Morgana");
    await ev(`Database.addCharacter({name:'Hero1',series:'Serie A',kakera:1999,claimed:true,category:'comuns',genders:['wa'],photo:''})`);

    console.log("\n# Limpar");
    await click(A, "#btnCollection"); await sleep(250);
    await ev(`window.confirm=()=>true`);
    await click(A, "#collClear"); await sleep(300);
    ok("limpar remove todos", await ev(`document.querySelectorAll('.coll-card.linked').length`) === 0);
    await click(A, "#collBack"); await sleep(100);
    ok("voltar reabre o lobby", await ev(`!document.getElementById('lobby').hidden && document.getElementById('collection').hidden`));

    // Vincula todos os de custo 1: no início da partida a loja só tem custo 1.
    const pinCost1 = prefix => `(async()=>{
      const all=await Database.getAllCharacters();
      const map={};const ids=TFTEngine.D.champions.filter(c=>c.cost===1).map(c=>c.id);
      let free=all.filter(c=>c.name.startsWith(${JSON.stringify(prefix)}));
      ids.forEach((id,i)=>{map[id]=free[i].id});
      const c=await Database.getConfig();await Database.saveConfig({...c,tftCollection:map});return Object.keys(map).length;})()`;
    const shopNames = p => p.ev(`[...document.querySelectorAll('.shop-card b')].map(b=>b.textContent)`);
    const waitShop = async p => {
        for (let i = 0; i < 300; i++) {
            const n = await shopNames(p);
            if (n.length >= 5) return n;
            // pula o carrossel de início, quando houver
            await p.ev(`(()=>{const b=document.querySelector('[data-pick]:not([disabled])');if(b)b.click();})()`);
            await sleep(500);
        }
        return [];
    };

    console.log("\n# Partida contra o bot");
    await ev(`(async()=>{const all=await Database.getAllCharacters();for(const n of ['Aa1','Aa2','Aa3','Aa4','Aa5','Aa6','Aa7','Aa8','Aa9','Aa10','Aa11','Aa12','Aa13','Bb1','Bb2','Bb3','Bb4','Bb5','Bb6','Bb7','Bb8','Bb9','Bb10','Bb11','Bb12','Bb13'])await Database.addCharacter({name:n,series:'T',kakera:1,claimed:false,category:'favoritos',genders:['wa'],photo:''});})()`);
    await ev(pinCost1("Aa"));
    await go(A);
    await ev(`document.getElementById('nameInput').value='Tester'`);
    await click(A, "#btnBot");
    const botShop = await waitShop(A);
    ok("loja mostra os vinculados", botShop.length === 5 && botShop.every(n => /^Aa\d+$/.test(n)), botShop.join(", "));
    await shot(A, "c2-partida.png");
    const botNames = await ev(`[...document.querySelectorAll('#game img.pic')].length`);
    ok("partida renderiza as fotos", botNames > 0, botNames);
    ok("sem erros até aqui", errors.length === 0, errors.slice(0, 3).join(" | "));
    await ev(`window.confirm=()=>true`);
    await click(A, "#btnQuit"); await sleep(400);

    console.log("\n# Sala com dois jogadores");
    let roomTested = false;
    try {
        await go(A);                         // A carrega com a coleção "Aa"
        await ev(`document.getElementById('nameInput').value='Anfitriao'`);
        await click(A, "#btnCreate");
        let code = "";
        for (let i = 0; i < 40; i++) { code = await ev(`document.getElementById('roomCode').textContent`); if (/^[A-Z0-9]{6}$/.test(code) && !(await ev(`document.getElementById('roomBox').hidden`))) break; await sleep(500); }
        if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("sala não abriu: " + await ev(`document.getElementById('lobbyStatus').textContent`));
        await ev(pinCost1("Bb"));            // o banco muda para o que B vai ler
        const created = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
        const B = await connect(created.webSocketDebuggerUrl, errors);
        await go(B);
        await B.ev(`document.getElementById('nameInput').value='Convidado'`);
        await B.ev(`document.getElementById('codeInput').value=${JSON.stringify(code)}`);
        await click(B, "#btnJoin");
        for (let i = 0; i < 40; i++) { if (await B.ev(`!document.getElementById('roomBox').hidden && document.querySelectorAll('#roomPlayers li').length>=2`)) break; await sleep(500); }
        await click(B, "#btnRoomReady"); await sleep(400);
        await click(A, "#btnRoomReady");
        const [sa, sb] = await Promise.all([waitShop(A), waitShop(B)]);
        roomTested = true;
        ok("anfitrião vê a coleção dele", sa.length === 5 && sa.every(n => /^Aa\d+$/.test(n)), sa.join(", "));
        ok("convidado vê a coleção dele", sb.length === 5 && sb.every(n => /^Bb\d+$/.test(n)), sb.join(", "));
        // Sincronia: ambos veem as mesmas peças; o custo 1 da posição i é o mesmo campeão.
        const costA = await A.ev(`[...document.querySelectorAll('.shop-card')].map(c=>c.dataset.tip)`);
        ok("cada um tem a própria loja no jogo", costA.length === 5);
        const goldBefore = await B.ev(`document.getElementById('goldBox').textContent`);
        await B.ev(`(()=>{const c=document.querySelector('[data-buy]:not(.cant)');if(c)c.click();})()`);
        await sleep(1200);
        const goldAfter = await B.ev(`document.getElementById('goldBox').textContent`);
        ok("ação do convidado sincroniza com o anfitrião", goldBefore !== goldAfter, `${goldBefore} → ${goldAfter}`);
        await shot(B, "c3-convidado.png");
    } catch (e) {
        console.log("  AVISO sala não testada:", e.message);
    }

    console.log("\n# Tela estreita");
    await go(A);
    await click(A, "#btnCollection"); await sleep(300);
    const desktop = await ev(`(()=>{const c=document.getElementById('collection');return {sw:c.scrollWidth,cw:c.clientWidth}})()`);
    ok("sem rolagem lateral em 1500 px", desktop.sw <= desktop.cw, JSON.stringify(desktop));
    const tile = await ev(`(()=>{const r=document.querySelector('.coll-card-img').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}})()`);
    ok("foto quadrada", Math.abs(tile.w - tile.h) <= 1, JSON.stringify(tile));
    await ev(`document.querySelector('.coll-group:nth-child(2)').scrollIntoView()`);
    await ev(`document.getElementById('collection').scrollTop=0`);
    let imgs = {};
    for (let i = 0; i < 40; i++) {
        imgs = await ev(`(()=>{const v=[...document.querySelectorAll('.coll-art')].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0});return {visiveis:v.length,ok:v.filter(i=>i.complete&&i.naturalWidth>0).length}})()`);
        if (imgs.visiveis && imgs.ok === imgs.visiveis) break;
        await sleep(500);
    }
    ok("fotos visíveis carregam", imgs.visiveis > 0 && imgs.ok === imgs.visiveis, JSON.stringify(imgs));
    await sleep(300);
    await shot(A, "c4-desktop.png");
    await ev(`window.__all=[...document.querySelectorAll('.coll-art')].forEach(i=>{i.loading='eager'})`);
    let total = {};
    for (let i = 0; i < 60; i++) {
        total = await ev(`(()=>{const v=[...document.querySelectorAll('.coll-art')];return {total:v.length,ok:v.filter(i=>i.complete&&i.naturalWidth>0).length,falhas:v.filter(i=>i.complete&&!i.naturalWidth).map(i=>i.alt)}})()`);
        if (total.ok + total.falhas.length === total.total) break;
        await sleep(500);
    }
    ok("os 60 abrem", total.ok === 60, JSON.stringify(total));
    await ev(`document.getElementById('collOnlyFree').checked=false;document.getElementById('collection').style.height='auto'`);
    await sleep(500);
    await shot(A, "c6-todos.png");
    await ev(`document.getElementById('collection').style.height=''`);
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(500);
    const narrow = await ev(`(()=>{const c=document.getElementById('collection');return {sw:c.scrollWidth,cw:c.clientWidth}})()`);
    ok("sem rolagem lateral em 390 px", narrow.sw <= narrow.cw, JSON.stringify(narrow));
    await openCard("Morgana"); await sleep(300);
    const panel = await ev(`(()=>{const p=document.querySelector('.coll-panel');return {sw:p.scrollWidth,cw:p.clientWidth}})()`);
    ok("painel cabe em 390 px", panel.sw <= panel.cw, JSON.stringify(panel));
    const stack = await ev(`(()=>{const a=document.querySelector('.coll-champ').getBoundingClientRect(),b=document.querySelector('.coll-picker').getBoundingClientRect();return {champFim:Math.round(a.bottom),listaInicio:Math.round(b.top)}})()`);
    ok("lista não cobre o campeão em 390 px", stack.listaInicio >= stack.champFim, JSON.stringify(stack));
    await shot(A, "c5-celular-painel.png");

    console.log("\n# Console");
    ok("sem erros no console", errors.length === 0, errors.slice(0, 5).join(" | "));
    ok("sala testada", roomTested);
    console.log(`\n${pass} ok, ${fail} falhas`);
    edge.kill(); server.close();
    await sleep(400);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error("ERRO:", e); process.exit(2); });
