// Gera tft-augments-data.js a partir do CommunityDragon 15.14 (último patch da Season 14).
// Uso: node gen-augments.js <raiz> [lista.txt] [pt_br.json local]
// Não editar o arquivo gerado à mão: as implementações ficam em tft-augments.js.
const fs = require("fs"), path = require("path");
const [root, listFile, local] = process.argv.slice(2);
const clean = s => String(s || "")
    .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")
    .replace(/%i:[^%]+%/g, "").replace(/\{\{[^}]*\}\}/g, "").replace(/\s+/g, " ").trim();
const round = v => (typeof v === "number" ? +v.toFixed(3) : v);
function resolve(desc, fx) {
    const lower = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k.toLowerCase(), v]));
    return clean(desc).replace(/@([^@]+)@/g, (all, expr) => {
        const m = expr.match(/^([A-Za-z0-9_.:]+?)(?:\*(\d+(?:\.\d+)?))?$/);
        if (!m) return "?";
        const name = m[1].split(/[.:]/).pop().toLowerCase();
        const value = lower[name];
        if (typeof value !== "number") return "?";
        return String(round(value * (m[2] ? Number(m[2]) : 1)));
    });
}
// tier pelos tags do próprio aumento (prata/ouro/prismático); confere com o sufixo do ícone em todos os casos com sufixo
const TIER_TAG = { "{d11fd6d5}": 1, "{ce1fd21c}": 2, "{cf1fd3af}": 3 };
function tierOf(a) {
    const tags = (a.tags || []).filter(t => TIER_TAG[t]);
    if (tags.length === 1) return TIER_TAG[tags[0]];
    const file = String(a.icon || "").split("/").pop().replace(/.tft_setd+/i, "");
    const m = file.match(/[-_](i{1,3}|[123]).(?:tex|png)$/i) || file.match(/(i{1,3}).(?:tex|png)$/i);
    return m ? { i: 1, ii: 2, iii: 3, 1: 1, 2: 2, 3: 3 }[m[1].toLowerCase()] : 0;
}
(async () => {
    const d = JSON.parse(local ? fs.readFileSync(local, "utf8") : await (await fetch("https://raw.communitydragon.org/15.14/cdragon/tft/pt_br.json")).text());
    const byApi = new Map(d.items.map(i => [i.apiName, i]));
    const main = d.setData.find(s => s.mutator === "TFTSet14"), pve = d.setData.find(s => s.mutator === "TFTSet14_PVEMODE");
    const pveSet = new Set(pve.augments);
    const out = [];
    for (const id of new Set([...main.augments, ...pve.augments])) {
        const a = byApi.get(id);
        if (!a) continue;
        const fx = {};
        for (const [k, v] of Object.entries(a.effects || {})) if (!k.startsWith("{") && typeof v === "number") fx[k] = round(v);
        out.push({
            id, name: a.name, tier: tierOf(a), desc: resolve(a.desc, a.effects || {}), fx,
            // ícones da Season 14 só existem na pasta do patch 15.14
            icon: "https://raw.communitydragon.org/15.14/game/" + String(a.icon || "").toLowerCase().replace(/\.tex$/, ".png"),
            normal: main.augments.includes(id), horuja: pveSet.has(id),
        });
    }
    out.sort((x, y) => x.id.localeCompare(y.id));
    const header = "/* Gerado por .claude/tft-tests/gen-augments.js a partir do CommunityDragon 15.14 (Season 14). Não editar à mão. */\n";
    fs.writeFileSync(path.join(root, "tft-augments-data.js"), `${header}const TFT_AUGMENTS_DATA = ${JSON.stringify(out)};\nif (typeof module !== 'undefined') module.exports = TFT_AUGMENTS_DATA;\n`);
    if (listFile) fs.writeFileSync(listFile, out.map(a => `${a.id} | ${a.name} | T${a.tier}${a.horuja ? " H" : ""} | ${a.desc} | ${JSON.stringify(a.fx)}`).join("\n"));
    const count = k => out.filter(k).length;
    console.log("total", out.length, "| normal", count(a => a.normal), "| horuja", count(a => a.horuja), "| prata", count(a => a.tier === 1), "ouro", count(a => a.tier === 2), "prismático", count(a => a.tier === 3), "sem tier", count(a => !a.tier));
    console.log("sem tier:", out.filter(a => !a.tier).map(a => a.id).join(", "));
    console.log("descrições com ?:", count(a => a.desc.includes("?")));
    console.log("tamanho:", fs.statSync(path.join(root, "tft-augments-data.js")).size);
})();
