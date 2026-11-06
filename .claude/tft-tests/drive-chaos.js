// Testa aumentos e Modo Caos no app (Edge com a GPU). Uso: node drive-chaos.js <raiz> <saída>
const http=require("http"),fs=require("fs"),path=require("path"),{spawn}=require("child_process");
const [root,out]=process.argv.slice(2);const EDGE="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".webp":"image/webp",".png":"image/png"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let pass=0,fail=0;const ok=(n,c,x="")=>{c?pass++:fail++;console.log(`  ${c?"ok  ":"FAIL"} ${n}${x!==""?`  (${x})`:""}`)};
const server=http.createServer((q,r)=>{const p=path.join(root,decodeURIComponent(q.url.split("?")[0]));fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end()}else{r.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});r.end(d)}})});
(async()=>{await new Promise(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${server.address().port}/`;const port=9500+Math.floor(Math.random()*150);const dir=path.join(out,"edge-chaos");fs.rmSync(dir,{recursive:true,force:true});
const edge=spawn(EDGE,["--headless=new","--no-first-run",`--user-data-dir=${dir}`,`--remote-debugging-port=${port}`,"--window-size=1920,1080","--ignore-gpu-blocklist","--use-angle=d3d11","about:blank"],{stdio:"ignore"});
let t;for(let i=0;i<60;i++){try{t=await(await fetch(`http://127.0.0.1:${port}/json`)).json();if(t.length)break}catch{}await sleep(200)}
const ws=new WebSocket(t.find(x=>x.type==="page").webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const w=new Map(),errs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id)}if(m.method==="Runtime.exceptionThrown")errs.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")errs.push(m.params.args.map(a=>a.value||a.description).join(" "))};
const send=(me,pa={})=>new Promise(r=>{const i=++id;w.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}))});
const ev=async x=>{const r=await send("Runtime.evaluate",{expression:x,awaitPromise:true,returnByValue:true});if(r.result.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description||"erro");return r.result.result.value};
const shot=async n=>fs.writeFileSync(path.join(out,n),Buffer.from((await send("Page.captureScreenshot",{format:"png"})).result.data,"base64"));
await send("Runtime.enable");await send("Page.enable");
const go=async()=>{await send("Page.navigate",{url:base+"tft.html"});await sleep(1600);await send("Page.bringToFront")};
const onlyAgain=!!process.env.ONLY_AGAIN;
if(!onlyAgain){console.log("# Modo Caos");await go();
ok("botão no lobby",await ev(`!!document.getElementById('btnChaos')`));await shot("h1-lobby.png");
await ev(`document.getElementById('nameInput').value='Teste';document.getElementById('btnChaos').click()`);await sleep(500);
ok("abre a partida",await ev(`!document.getElementById('game').hidden`));
ok("rótulo do caos",(await ev(`document.getElementById('roundLabel').textContent`)).includes("Caos 1-1"),await ev(`document.getElementById('roundLabel').textContent`));
ok("botão LUTAR!",await ev(`document.getElementById('btnReady').textContent`)==="LUTAR!");
ok("sem cronômetro: continua em 1-1 depois de esperar",await(async()=>{await sleep(1500);return ev(`document.getElementById('roundLabel').textContent.includes('1-1')`)})());
await shot("h2-caos.png");
await ev(`(()=>{const b=[...document.querySelectorAll('[data-buy]')].find(x=>!x.classList.contains('cant'));if(b)b.click()})()`);await sleep(250);
await ev(`document.getElementById('btnReady').click()`);
let fought=false;for(let i=0;i<40&&!fought;i++){fought=await ev(`document.querySelectorAll('#board .unit.fight').length>0`);await sleep(150)}
ok("luta começa ao clicar",fought);
let adv=false;for(let i=0;i<120&&!adv;i++){adv=await ev(`/1-2|1-1 .*2 vidas/.test(document.getElementById('roundLabel').textContent)`);await sleep(250)}
ok("rodada resolve sem travar",adv,await ev(`document.getElementById('roundLabel').textContent`));
console.log("\n# Oferta de aumento (1-5) e 4 estrelas");
await go();
await ev(`document.getElementById('nameInput').value='Teste';document.getElementById('btnChaos').click()`);await sleep(400);
// compra o que der e avança rápido com poucos cliques até a escolha ou fim
let saw=false;for(let i=0;i<600&&!saw;i++){saw=await ev(`!document.getElementById('augPick').hidden`);if(saw)break;
 const end=await ev(`!document.getElementById('endScreen').hidden`);if(end)break;
 await ev(`(()=>{if(document.getElementById('btnReady').disabled)return;[...document.querySelectorAll('[data-buy]')].filter(x=>!x.classList.contains('cant')).slice(0,2).forEach(b=>b.click());document.getElementById('btnReady').click()})()`);await sleep(250)}
if(saw){await shot("h3-aumento.png");
 const n=await ev(`document.querySelectorAll('[data-augment]').length`);ok("3 opções",n===3,n);
 const b=await ev(`[...document.querySelectorAll('[data-augment] b')][1].textContent`);
 await ev(`document.querySelector('[data-aug-reroll="1"]').click()`);await sleep(250);ok("atualizar troca",(await ev(`[...document.querySelectorAll('[data-augment] b')][1].textContent`))!==b);
 await ev(`document.querySelector('[data-augment="0"]').click()`);await sleep(250);
 ok("escolha aplica",await ev(`document.getElementById('augPick').hidden&&document.querySelectorAll('#augList .aug-chip').length===1`));await shot("h4-aumentos.png");}
else ok("oferta apareceu antes do fim",false);
}
console.log("\n# Jogar de novo");
await go();
await ev(`document.getElementById('nameInput').value='Teste';document.getElementById('btnChaos').click()`);await sleep(400);
let ended=false,lastLb="",t0=Date.now();for(let i=0;i<2000&&!ended;i++){ended=await ev(`!document.getElementById('endScreen').hidden`);if(ended)break;
 const lb0=await ev(`document.getElementById('roundLabel').textContent`);if(lb0!==lastLb){lastLb=lb0;console.log(`    [${Math.round((Date.now()-t0)/1000)}s] ${lb0}`)}
 if(i%120===119)console.log("    estado",await ev(`JSON.stringify({ready:document.getElementById('btnReady').textContent,dis:document.getElementById('btnReady').disabled,aug:document.getElementById('augPick').hidden,augHtml:document.getElementById('augPick').textContent.slice(0,120),reopen:document.getElementById('augReopen').hidden,fight:document.querySelectorAll('#board .unit.fight').length,banner:document.getElementById('banner').hidden?'':document.getElementById('banner').textContent,hasChoose:!!document.querySelector('[data-choose]'),hasAug:!!document.querySelector('[data-augment]')})`));
 await ev(`(()=>{const a=document.querySelector('#augPick:not([hidden]) [data-augment="0"],#augPick:not([hidden]) [data-choose="0"]');if(a){a.click();return}const r=document.getElementById('btnReady');if(!r.disabled)r.click()})()`);await sleep(250)}
ok("partida do caos termina",ended,await ev(`document.getElementById('roundLabel').textContent`));
if(ended){await ev(`document.getElementById('btnAgain').click()`);await sleep(500);
 const lb=await ev(`document.getElementById('roundLabel').textContent`);
 ok("jogar de novo continua no caos",lb.includes("Caos 1-1"),lb);
 ok("tela final fecha e botão LUTAR! volta",await ev(`document.getElementById('endScreen').hidden&&document.getElementById('btnReady').textContent==='LUTAR!'`));await shot("h5-de-novo.png");}
console.log("\n# Console");ok("sem erros",errs.length===0,errs.slice(0,4).join(" | "));
console.log(`\n${pass} ok, ${fail} falhas`);edge.kill();server.close();await sleep(300);process.exit(fail?1:0)})().catch(e=>{console.error("ERRO",e);process.exit(2)});
