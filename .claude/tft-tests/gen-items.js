// Regera os itens de tft-data.js com os números do último patch da Season 14 (LoL 15.14).
// O "latest" do CommunityDragon traz os itens básicos de seasons posteriores; por isso a versão fixa.
// Uso: node gen-items.js <raiz> [arquivo pt_br.json local]
const fs = require("fs");
const path = require("path");
const URL = "https://raw.communitydragon.org/15.14/cdragon/tft/pt_br.json";

(async () => {
  const root = process.argv[2] || ".";
  const local = process.argv[3];
  const d = JSON.parse(local ? fs.readFileSync(local, "utf8") : await (await fetch(URL)).text());
  const byApi = new Map(d.items.map(i => [i.apiName, i]));
  const file = path.join(root, "tft-data.js");
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf("const TFT_DATA = ") + "const TFT_DATA = ".length;
  const end = src.indexOf(";\nif (typeof module");
  const data = JSON.parse(src.slice(start, end));
  const round = v => (typeof v === "number" ? Math.round(v * 10000) / 10000 : v);
  const report = [];
  data.items = data.items.map(it => {
    const off = byApi.get("TFT_Item_" + it.id) || byApi.get(it.id);
    if (!off) { report.push(`sem dado oficial: ${it.id}`); return it; }
    const fx = {};
    for (const [k, v] of Object.entries(off.effects || {})) {
      if (k.startsWith("{") || v == null) continue; // campos com nome embaralhado ficam de fora
      fx[k] = round(v);
    }
    const from = (off.composition || []).map(c => c.replace(/^TFT_Item_/, ""));
    if (it.from && from.length && from.join() !== it.from.join()) report.push(`receita diferente: ${it.id} ${it.from} -> ${from}`);
    if (off.name && off.name !== it.name) report.push(`nome: ${it.name} -> ${off.name}`);
    return { ...it, name: off.name || it.name, from: it.from ? (from.length ? from : it.from) : it.from, fx };
  });
  fs.writeFileSync(file, src.slice(0, start) + JSON.stringify(data) + src.slice(end));
  console.log(report.join("\n") || "sem diferenças de nome/receita");
  console.log(`${data.items.length} itens regerados (15.14)`);
})();
