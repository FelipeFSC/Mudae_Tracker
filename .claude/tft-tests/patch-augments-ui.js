// Tela de escolha de aumentos. Aplicado uma vez; aborta se algo não bater.
const fs = require("fs"), path = require("path");
const root = process.argv[2];
const edit = (name, changes) => {
    const file = path.join(root, name);
    let s = fs.readFileSync(file, "utf8");
    for (const [from, to] of changes) {
        if (s.split(from).length !== 2) throw new Error(`${name}: não achei ${from.slice(0, 70)}`);
        s = s.replace(from, () => to);
    }
    fs.writeFileSync(file, s);
};
edit("tft.js", [
    [`    renderItems(st);
    if (!L.playing) renderBoard(st);`, `    renderItems(st);
    renderAugments(st);
    if (!L.playing) renderBoard(st);`],
    [`  function renderTraits(st) {`, `  /* ---------- Aumentos ---------- */
  const TIER_NAME = { 1: 'Prata', 2: 'Ouro', 3: 'Prismático' };
  const augIcon = (id, extra = '') => {
    const a = E.AUG[id];
    return \`<img class="aug-icon tier\${a.tier}" src="\${esc(asset(a.icon))}" alt="" draggable="false" \${extra}>\`;
  };
  function renderAugments(st) {
    const list = byId('augList');
    const owned = st.you.augments || [];
    list.innerHTML = owned.length
      ? owned.map(id => \`<span class="aug-chip tier\${E.AUG[id].tier}" data-tip="aug:\${esc(id)}">\${augIcon(id)}<small>\${esc(E.AUG[id].name)}</small></span>\`).join('')
      : '<p class="empty">Escolhas em 2-1, 3-2 e 4-2.</p>';
    const box = byId('augPick');
    const offer = st.you.offer;
    const choice = st.you.choices && st.you.choices[0];
    const open = !L.augHidden && (offer || choice);
    box.hidden = !open;
    byId('augReopen').hidden = !(L.augHidden && (offer || choice));
    if (!open) return;
    if (offer) {
      box.innerHTML = \`<div class="aug-box"><h2>Escolha um aumento <small class="tier\${offer.tier}">\${TIER_NAME[offer.tier]}</small></h2>
        <div class="aug-cards">\${offer.opts.map((id, i) => {
          const a = E.AUG[id];
          return \`<div class="aug-card tier\${a.tier}"><button type="button" class="aug-pick-btn" data-augment="\${i}">\${augIcon(id)}<b>\${esc(a.name)}</b><span>\${esc(a.desc)}</span></button>
            <button type="button" class="btn small" data-aug-reroll="\${i}" \${offer.rerolled[i] ? 'disabled' : ''}>ATUALIZAR</button></div>\`;
        }).join('')}</div>
        <button class="link-btn" data-aug-hide>Ver o tabuleiro antes de decidir</button></div>\`;
    } else {
      box.innerHTML = \`<div class="aug-box"><h2>\${esc(choice.title)}</h2>
        <div class="aug-cards">\${choice.opts.map((id, i) => \`<button type="button" class="aug-card aug-pick-btn" data-choose="\${i}"><span class="item">\${E.ITEMS[id] ? \`<img src="\${esc(asset(E.ITEMS[id].icon))}" alt="">\` : ''}</span><b>\${esc(E.ITEMS[id].name)}</b></button>\`).join('')}</div>
        <button class="link-btn" data-aug-hide>Ver o tabuleiro antes de decidir</button></div>\`;
    }
  }

  function renderTraits(st) {`],
    [`      const buy = ev.target.closest('[data-buy]');`, `      const augBtn = ev.target.closest('[data-augment]');
      if (augBtn) { sendGame({ a: 'augment', i: Number(augBtn.dataset.augment) }); hideTip(); return; }
      const augRoll = ev.target.closest('[data-aug-reroll]');
      if (augRoll && !augRoll.disabled) { sendGame({ a: 'augReroll', i: Number(augRoll.dataset.augReroll) }); return; }
      const chooseBtn = ev.target.closest('[data-choose]');
      if (chooseBtn) { sendGame({ a: 'choose', i: Number(chooseBtn.dataset.choose) }); return; }
      if (ev.target.closest('[data-aug-hide]')) { L.augHidden = true; if (L.st) renderAugments(L.st); return; }
      if (ev.target.closest('#augReopen')) { L.augHidden = false; if (L.st) renderAugments(L.st); return; }
      const buy = ev.target.closest('[data-buy]');`],
    [`    if (kind === 'item') {`, `    if (kind === 'aug') {
      const a = E.AUG[parts[1]];
      return a ? \`<h4>\${esc(a.name)}</h4><p class="tip-sub">\${TIER_NAME[a.tier]}</p><p>\${esc(a.desc)}</p>\` : '';
    }
    if (kind === 'item') {`],
]);
edit("tft.html", [
    [`      <div id="itemBench" class="item-bench"></div>`, `      <div id="itemBench" class="item-bench"></div>
      <h2>AUMENTOS</h2>
      <div id="augList" class="aug-list"></div>
      <button class="link-btn" id="augReopen" hidden>Decidir aumento</button>`],
    [`  <div class="banner" id="banner" hidden></div>`, `  <div class="aug-pick" id="augPick" hidden></div>
  <div class="banner" id="banner" hidden></div>`],
    [`<script src="tft-engine.js?v=8"></script>`, `<script src="tft-augments-data.js?v=1"></script>
<script src="tft-augments.js?v=1"></script>
<script src="tft-engine.js?v=9"></script>`],
    [`tft-collection.js, tft-fx.js e o link`, `tft-collection.js, tft-fx.js, tft-augments.js, tft-augments-data.js e o link`],
    [`<link rel="stylesheet" href="tft.css?v=13">`, `<link rel="stylesheet" href="tft.css?v=14">`],
    [`<script src="tft.js?v=12"></script>`, `<script src="tft.js?v=13"></script>`],
]);
edit("tft.css", [
    [`/* ============ QUALIDADE E EFEITOS ============ */`, `/* ============ AUMENTOS ============ */
.aug-list { display: flex; flex-direction: column; gap: 4px; }
.aug-chip { display: flex; align-items: center; gap: 6px; padding: 3px 5px; border: 1px solid var(--border); border-radius: 6px; font-size: 11px; }
.aug-icon { width: 26px; height: 26px; flex: none; }
.aug-pick { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 16px; background: rgba(5, 7, 15, .72); }
.aug-box { width: min(880px, 100%); max-height: 90dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; align-items: center; padding: 18px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; }
.aug-box h2 { margin: 0; font-family: Orbitron, sans-serif; font-size: 18px; }
.aug-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; width: 100%; }
.aug-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; color: var(--text); }
.aug-card.tier1, .aug-chip.tier1 { border-color: #c0c8d6; }
.aug-card.tier2, .aug-chip.tier2 { border-color: var(--gold); }
.aug-card.tier3, .aug-chip.tier3 { border-color: var(--pink); }
.aug-box h2 small.tier1 { color: #c0c8d6; } .aug-box h2 small.tier2 { color: var(--gold); } .aug-box h2 small.tier3 { color: var(--pink); }
.aug-pick-btn { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; padding: 6px; background: none; border: 0; color: inherit; font: inherit; text-align: center; cursor: pointer; }
.aug-pick-btn:hover { filter: brightness(1.2); }
.aug-pick-btn .aug-icon { width: 58px; height: 58px; }
.aug-pick-btn b { font-size: 14px; }
.aug-pick-btn > span:not(.item) { color: var(--muted); font-size: 12px; line-height: 1.45; }

/* ============ QUALIDADE E EFEITOS ============ */`],
]);
console.log("tela de aumentos ligada");
