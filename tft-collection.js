/* ============================================================
   TFT-COLLECTION.JS — tela "Montar coleção" do Mudae TFT
   ------------------------------------------------------------
   O jogador vincula um personagem do tracker a um campeão. Os
   vínculos ficam em config.tftCollection, por perfil e no backup:
   { idDoCampeao: idDoPersonagem }. Na partida, tft.js passa pins()
   para TFTEngine.applyCollection, só na tela deste jogador.
   ============================================================ */
const TFTCollection = (() => {
  'use strict';

  const E = TFTEngine;
  const IMG_BASE = 'https://ddragon.leagueoflegends.com/cdn/img/champion';
  const MAX_CHARS_SHOWN = 300;

  // Código da imagem do LoL quando ele difere do id do campeão no TFT.
  const LOL_IMAGE_ID = { NidaleeCougar: 'Nidalee', Jarvan: 'JarvanIV', LeBlanc: 'Leblanc', Rhaast: 'Kayn' };
  const NOT_IN_LOL = new Set(['Kobuko']); // sem foto no LoL: usa o ícone do TFT

  const ROLE_LABEL = {
    ADTank: 'Tanque físico', APTank: 'Tanque mágico',
    ADFighter: 'Lutador físico', APFighter: 'Lutador mágico',
    ADCarry: 'Atacante físico', APCarry: 'Atacante mágico',
    ADCaster: 'Conjurador físico', APCaster: 'Conjurador mágico', APCasterHighMana: 'Conjurador mágico',
    ADReaper: 'Assassino físico', APReaper: 'Assassino mágico',
  };

  const byId = id => document.getElementById(id);
  const nameKey = name => String(name).toLowerCase();

  let deps = null;                // { esc, safePhoto, asset } vindos de tft.js
  let characters = [];
  let charById = new Map();
  let links = {};                 // { idDoCampeao: idDoPersonagem }
  let openChamp = null;
  let filter = { search: '', trait: '', onlyFree: false };
  let saveChain = Promise.resolve();

  /* ---------- Fotos ---------- */
  function champImage(champ, kind) {
    if (NOT_IN_LOL.has(champ.id)) return deps.asset(champ.icon);
    return `${IMG_BASE}/${kind}/${LOL_IMAGE_ID[champ.id] || champ.id}_0.jpg`;
  }

  function champImg(champ, kind, cls) {
    const { esc, asset } = deps;
    return `<img class="${cls}" src="${esc(champImage(champ, kind))}" data-fb="${esc(asset(champ.icon))}" alt="${esc(champ.name)}" draggable="false">`;
  }

  function charThumb(character) {
    const { esc, safePhoto } = deps;
    const photo = safePhoto(character.photo);
    if (!photo) return `<span class="coll-thumb coll-thumb-empty">${esc(String(character.name).charAt(0).toUpperCase())}</span>`;
    return `<img class="coll-thumb" src="${esc(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false">`;
  }

  /* ---------- Dados ---------- */
  const seriesOf = c => (c.series && c.series !== '—' ? String(c.series) : '');
  const linkedChar = champId => charById.get(links[champId]) || null;
  const linkCount = () => Object.keys(links).length;

  // Quem já usa este nome: o mesmo nome conta como o mesmo personagem.
  function usedNames() {
    const used = new Map();
    for (const [champId, charId] of Object.entries(links)) {
      const c = charById.get(charId);
      if (c) used.set(nameKey(c.name), champId);
    }
    return used;
  }

  // Tira vínculos de personagem apagado, campeão que saiu ou nome repetido.
  function cleanLinks(stored) {
    const clean = {};
    const seen = new Set();
    for (const [champId, charId] of Object.entries(stored && typeof stored === 'object' ? stored : {})) {
      const c = charById.get(charId);
      if (!E.CH[champId] || !c || seen.has(nameKey(c.name))) continue;
      seen.add(nameKey(c.name));
      clean[champId] = charId;
    }
    return clean;
  }

  async function load() {
    try {
      await Database.init();
      const [all, config] = await Promise.all([Database.getAllCharacters(), Database.getConfig()]);
      characters = all.filter(c => c && c.name)
        .sort((a, b) => (Number(b.kakera) || 0) - (Number(a.kakera) || 0));
      charById = new Map(characters.map(c => [c.id, c]));
      const stored = (config && config.tftCollection) || {};
      links = cleanLinks(stored);
      if (Object.keys(links).length !== Object.keys(stored).length) persist();
    } catch (err) {
      console.warn('[Mudae TFT] coleção:', err);
      status('Não deu para ler a coleção. Os campeões seguem sorteados.');
    }
    updateLobbyButton();
  }

  // Relê a config para mudar só este campo, um salvamento de cada vez.
  function persist() {
    const snapshot = { ...links };
    saveChain = saveChain.then(async () => {
      const config = (await Database.getConfig()) || {};
      await Database.saveConfig({ ...config, tftCollection: snapshot });
    }).catch(err => {
      console.warn('[Mudae TFT] coleção:', err);
      status('Não deu para salvar a coleção neste navegador.');
    });
    return saveChain;
  }

  /* Personagens vinculados, no formato das skins da partida. */
  function pins() {
    const out = {};
    for (const champId of Object.keys(links)) {
      const c = linkedChar(champId);
      if (!c) continue;
      out[champId] = {
        name: String(c.name).slice(0, 60),
        series: seriesOf(c).slice(0, 60),
        photo: deps.safePhoto(c.photo),
        kakera: Number(c.kakera) || 0,
      };
    }
    return out;
  }

  /* ---------- Tela: campeões ---------- */
  const status = text => { byId('collStatus').textContent = text; };

  function updateLobbyButton() {
    const count = linkCount();
    byId('btnCollection').textContent = count ? `MONTAR COLEÇÃO (${count}/${E.D.champions.length})` : 'MONTAR COLEÇÃO';
  }

  function renderSummary() {
    const count = linkCount();
    byId('collCount').textContent = `${count} de ${E.D.champions.length} campeões vinculados`;
    byId('collClear').disabled = count === 0;
    updateLobbyButton();
  }

  function renderTraits() {
    const { esc, asset } = deps;
    const names = [...new Set(E.D.champions.flatMap(c => c.traits))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    byId('collTraits').innerHTML = names.map(name => `<button type="button" class="coll-trait ${filter.trait === name ? 'on' : ''}" data-trait="${esc(name)}" aria-pressed="${filter.trait === name}"><img src="${esc(asset(E.TRAITS[name].icon))}" alt="" draggable="false">${esc(name)}</button>`).join('');
  }

  function champCard(champ) {
    const { esc, asset } = deps;
    const c = linkedChar(champ.id);
    const traitIcons = champ.traits.map(name => `<img src="${esc(asset(E.TRAITS[name].icon))}" alt="" title="${esc(name)}" draggable="false">`).join('');
    return `<button type="button" class="coll-card cost${champ.cost} ${c ? 'linked' : ''}" data-champ="${esc(champ.id)}" title="${esc(`${champ.name} · ${ROLE_LABEL[champ.role] || champ.role} · ${champ.traits.join(', ')}`)}">
      <span class="coll-card-img">
        ${champImg(champ, 'loading', 'coll-art')}
        <span class="coll-card-traits">${traitIcons}</span>
        ${c ? charThumb(c) : ''}
      </span>
      <b class="coll-card-name">${esc(champ.name)}</b>
      ${c ? `<span class="coll-link">${esc(c.name)}</span>` : ''}
    </button>`;
  }

  function renderChampions() {
    const search = filter.search.trim().toLowerCase();
    const match = champ => (!search || champ.name.toLowerCase().includes(search))
      && (!filter.trait || champ.traits.includes(filter.trait))
      && (!filter.onlyFree || !links[champ.id]);
    const groups = [1, 2, 3, 4, 5].map(cost => {
      const champs = E.D.champions.filter(c => c.cost === cost && match(c))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      if (!champs.length) return '';
      return `<section class="coll-group"><h2 class="cost${cost}" title="Custo ${cost}"><i class="coin"></i>${cost}</h2><div class="coll-grid">${champs.map(champCard).join('')}</div></section>`;
    }).join('');
    byId('collGroups').innerHTML = groups;
    byId('collEmpty').hidden = Boolean(groups);
    renderSummary();
  }

  /* ---------- Painel do campeão ---------- */
  function renderChampPanel(champ) {
    const { esc } = deps;
    const c = linkedChar(champ.id);
    const stat = (label, value, cls) => `<div><dt>${label}</dt><dd class="${cls}">${esc(value)}</dd></div>`;
    const ability = E.abilityText(champ.name, 1);
    byId('collChamp').innerHTML = `
      <div class="coll-champ-art cost${champ.cost}">${champImg(champ, 'splash', 'coll-splash')}</div>
      <h2 id="collChampName">${esc(champ.name)} <small>Custo ${champ.cost}</small></h2>
      <p class="coll-champ-role">${esc(ROLE_LABEL[champ.role] || champ.role)} · ${champ.range <= 2 ? '⚔ Corpo a corpo' : '🏹 À distância'}</p>
      <p class="coll-champ-traits">${champ.traits.map(esc).join(' · ')}</p>
      <dl class="coll-stats">
        ${stat('Vida', champ.hp, 's-hp')}
        ${stat('Ataque', champ.ad, 's-ad')}
        ${stat('Vel. de ataque', champ.as, 's-as')}
        ${stat('Armadura', champ.armor, 's-arm')}
        ${stat('Res. mágica', champ.mr, 's-mr')}
        ${stat('Alcance', champ.range, '')}
        ${stat('Mana', `${champ.mana0} / ${champ.mana}`, 's-mana')}
      </dl>
      <p class="coll-ability"><b>${esc(champ.abilityName)}</b>${ability ? ` ${esc(ability)}` : ''}</p>
      ${c ? `<div class="coll-current">${charThumb(c)}<span>Vinculado a <b>${esc(c.name)}</b></span><button type="button" class="btn small" id="collUnlink">REMOVER</button></div>` : '<p class="coll-current coll-current-free">Sem vínculo: este campeão é sorteado em cada partida.</p>'}`;
  }

  function renderCharList(champ) {
    const { esc } = deps;
    const search = byId('collCharSearch').value.trim().toLowerCase();
    const claim = byId('collCharClaim').value;
    const category = byId('collCharCategory').value;
    const gender = byId('collCharGender').value;
    const used = usedNames();
    const list = characters.filter(c => {
      const isClaimed = c.claimed !== false;
      return (!search || String(c.name).toLowerCase().includes(search) || seriesOf(c).toLowerCase().includes(search))
        && (!claim || (claim === 'claimed') === isClaimed)
        && (!category || c.category === category)
        && (!gender || (c.genders || []).includes(gender));
    });
    const shown = list.slice(0, MAX_CHARS_SHOWN);
    const countEl = byId('collCharCount');
    if (!characters.length) countEl.textContent = 'Nenhum personagem neste perfil do tracker.';
    else if (list.length > shown.length) countEl.textContent = `Mostrando ${shown.length} de ${list.length}. Use os filtros para encontrar os outros.`;
    else countEl.textContent = `${list.length} ${list.length === 1 ? 'personagem' : 'personagens'}`;

    byId('collChars').innerHTML = shown.map(c => {
      const owner = used.get(nameKey(c.name));
      const mine = owner === champ.id;
      const taken = owner && !mine;
      const note = mine ? 'Vinculado aqui' : taken ? `Em uso: ${E.CH[owner].name}` : `${(Number(c.kakera) || 0).toLocaleString('pt-BR')} kakera`;
      return `<button type="button" class="coll-char ${mine ? 'mine' : ''} ${taken ? 'taken' : ''}" data-char="${esc(c.id)}" ${taken || mine ? 'disabled' : ''}>
        ${charThumb(c)}
        <span class="coll-char-text"><b>${esc(c.name)}</b><small>${esc(seriesOf(c) || 'Sem série')}</small><small class="coll-char-note">${esc(note)}</small></span>
      </button>`;
    }).join('');
  }

  function openPanel(champId) {
    const champ = E.CH[champId];
    if (!champ) return;
    openChamp = champId;
    for (const id of ['collCharSearch', 'collCharClaim', 'collCharCategory', 'collCharGender']) byId(id).value = '';
    renderChampPanel(champ);
    renderCharList(champ);
    byId('collModal').hidden = false;
    byId('collChars').scrollTop = 0;
    byId('collCharSearch').focus({ preventScroll: true });
  }

  function closePanel() {
    openChamp = null;
    byId('collModal').hidden = true;
  }

  /* ---------- Ações ---------- */
  function linkCharacter(charId) {
    const c = charById.get(charId);
    if (!c || !openChamp) return;
    const owner = usedNames().get(nameKey(c.name));
    if (owner && owner !== openChamp) return; // nunca repete personagem
    links[openChamp] = charId;
    persist();
    status(`${E.CH[openChamp].name} agora é ${c.name}.`);
    closePanel();
    renderChampions();
  }

  function unlinkOpen() {
    if (!openChamp) return;
    const champ = E.CH[openChamp];
    delete links[openChamp];
    persist();
    status(`${champ.name} voltou a ser sorteado.`);
    renderChampPanel(champ);
    renderCharList(champ);
    renderChampions();
  }

  function clearAll() {
    if (!linkCount() || !confirm('Remover todos os vínculos da coleção deste perfil?')) return;
    links = {};
    persist();
    status('Coleção limpa: todos os campeões voltam ao sorteio.');
    renderChampions();
  }

  function openScreen() {
    byId('lobby').hidden = true;
    byId('collection').hidden = false;
    status('');
    renderTraits();
    renderChampions();
    byId('collection').scrollTop = 0;
  }

  function closeScreen() {
    closePanel();
    byId('collection').hidden = true;
    byId('lobby').hidden = false;
  }

  function bindEvents() {
    byId('btnCollection').addEventListener('click', openScreen);
    byId('collBack').addEventListener('click', closeScreen);
    byId('collClear').addEventListener('click', clearAll);
    byId('collClose').addEventListener('click', closePanel);
    byId('collSearch').addEventListener('input', ev => { filter.search = ev.target.value; renderChampions(); });
    byId('collOnlyFree').addEventListener('change', ev => { filter.onlyFree = ev.target.checked; renderChampions(); });
    byId('collTraits').addEventListener('click', ev => {
      const btn = ev.target.closest('[data-trait]');
      if (!btn) return;
      filter.trait = filter.trait === btn.dataset.trait ? '' : btn.dataset.trait;
      renderTraits();
      renderChampions();
    });
    byId('collGroups').addEventListener('click', ev => {
      const card = ev.target.closest('[data-champ]');
      if (card) openPanel(card.dataset.champ);
    });
    byId('collModal').addEventListener('click', ev => {
      if (ev.target.id === 'collModal') closePanel();
      if (ev.target.id === 'collUnlink') unlinkOpen();
      const item = ev.target.closest('[data-char]');
      if (item && !item.disabled) linkCharacter(Number(item.dataset.char));
    });
    for (const id of ['collCharSearch', 'collCharClaim', 'collCharCategory', 'collCharGender']) {
      byId(id).addEventListener('input', () => { if (openChamp) renderCharList(E.CH[openChamp]); });
    }
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && openChamp) closePanel();
    });
  }

  function init(helpers) {
    deps = helpers;
    bindEvents();
    return load();
  }

  return { init, pins };
})();
