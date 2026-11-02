/* ============================================================
   TFT.JS — tela e conexão do Mudae TFT (protótipo)
   ------------------------------------------------------------
   Conexão igual à da Waifu Arena: WebRTC via PeerJS, sala com código
   de 6 letras, sem servidor próprio. O anfitrião roda o motor
   (tft-engine.js); o convidado envia ações e desenha o estado.
   ============================================================ */
(() => {
  'use strict';

  const E = TFTEngine;
  const PEERJS_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const ID_PREFIX = 'mudae-tracker-tft-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I
  const NAME_KEY = 'mudaeTracker_arenaName';             // mesmo nome da Waifu Arena
  const ASSET_BASE = 'https://raw.communitydragon.org/latest/game/';
  const MAX_ROSTER = 120;
  const MAX_DATA_PHOTO = 60000;
  const HEARTBEAT_LIMIT = 15000;

  const byId = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const asset = path => (path ? ASSET_BASE + path : '');
  const cleanName = n => String(n || '').trim().slice(0, 24) || 'Jogador';
  const safePhoto = src => {
    const s = typeof src === 'string' ? src.trim().replace(/^http:\/\//i, 'https://') : '';
    return /^(https:\/\/|data:image\/)/i.test(s) ? s : '';
  };

  const L = {
    roster: [], mode: null,            // 'bot' | 'host' | 'guest'
    g: null, st: null, skins: {},       // g só existe no anfitrião
    viewer: 0, deadline: 0, totalTime: 1,
    peer: null, conn: null, code: null, rivalRoster: [], rivalName: '',
    playing: null, timerLoop: null,
  };

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(text) {
    const el = byId('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------- Personagens do tracker ---------- */
  function rosterPayload(c) {
    let photo = safePhoto(c.photo);
    if (photo.startsWith('data:') && photo.length > MAX_DATA_PHOTO) photo = '';
    return { name: String(c.name || '').slice(0, 60), series: c.series && c.series !== '—' ? String(c.series).slice(0, 60) : '', photo, kakera: Number(c.kakera) || 0 };
  }
  function cleanRoster(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_ROSTER).filter(c => c && typeof c === 'object' && c.name).map(rosterPayload);
  }
  async function loadRoster() {
    const info = byId('rosterInfo');
    try {
      await Database.init();
      const all = await Database.getAllCharacters();
      const claimed = all.filter(c => c.claimed !== false && c.name);
      L.roster = claimed.sort(() => Math.random() - 0.5).slice(0, MAX_ROSTER).map(rosterPayload);
      info.textContent = claimed.length
        ? `${claimed.length} personagens no perfil ativo. Até 60 entram em cada partida.`
        : 'Nenhum personagem no perfil ativo: quem faltar aparece como o campeão original.';
    } catch (err) {
      console.warn('[Mudae TFT]', err);
      info.textContent = 'Não deu para ler o tracker: as unidades aparecem como os campeões originais.';
    }
  }

  /* ---------- Rede ---------- */
  let peerJsPromise = null;
  function loadPeerJs() {
    if (window.Peer) return Promise.resolve();
    if (!peerJsPromise) {
      peerJsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PEERJS_SRC;
        s.onload = resolve;
        s.onerror = () => { peerJsPromise = null; reject(new Error('Não deu para carregar o PeerJS (sem internet?).')); };
        document.head.appendChild(s);
      });
    }
    return peerJsPromise;
  }

  const lobbyStatus = text => { byId('lobbyStatus').textContent = text; };
  const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  const myName = () => {
    const n = cleanName(byId('nameInput').value);
    try { localStorage.setItem(NAME_KEY, n); } catch (err) { /* sem armazenamento */ }
    return n;
  };

  function closeNet() {
    if (L.conn) try { L.conn.close(); } catch (err) { /* ignora */ }
    if (L.peer) try { L.peer.destroy(); } catch (err) { /* ignora */ }
    L.conn = null;
    L.peer = null;
    L.code = null;
  }

  async function createRoom(attempt = 0) {
    lobbyStatus('Criando sala…');
    try { await loadPeerJs(); } catch (err) { return lobbyStatus(err.message); }
    const code = newCode();
    const peer = new window.Peer(ID_PREFIX + code);
    L.peer = peer;
    peer.on('open', () => {
      L.code = code;
      L.mode = 'host';
      byId('roomCode').textContent = code;
      byId('roomBox').hidden = false;
      lobbyStatus('Mande o código para o outro jogador. Mantenha esta aba aberta.');
    });
    peer.on('connection', conn => {
      if (L.conn) { conn.on('open', () => { conn.send({ t: 'tft-full' }); setTimeout(() => conn.close(), 300); }); return; }
      L.conn = conn;
      conn.on('data', msg => onHostMessage(msg));
      conn.on('close', onRivalGone);
      conn.on('error', onRivalGone);
    });
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && attempt < 3) { peer.destroy(); return createRoom(attempt + 1); }
      lobbyStatus(`Erro de conexão: ${err.type || err.message}`);
    });
  }

  function onHostMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    L.lastSeen = Date.now();
    if (msg.t === 'tft-hello') {
      L.rivalName = cleanName(msg.name);
      L.rivalRoster = cleanRoster(msg.roster);
      startHeartbeat();
      startHostGame(false);
    }
    if (msg.t === 'tft-act' && L.g) hostAct(1, msg.a);
  }

  async function joinRoom() {
    const code = byId('codeInput').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return lobbyStatus('Digite o código de 6 letras da sala.');
    lobbyStatus(`Entrando na sala ${code}…`);
    try { await loadPeerJs(); } catch (err) { return lobbyStatus(err.message); }
    const name = myName();
    const peer = new window.Peer();
    L.peer = peer;
    L.mode = 'guest';
    peer.on('open', () => {
      const conn = peer.connect(ID_PREFIX + code, { reliable: true });
      L.conn = conn;
      let opened = false;
      const timeout = setTimeout(() => {
        if (!opened) { closeNet(); lobbyStatus('Não deu para conectar. Confira o código ou se a sala está aberta.'); }
      }, 15000);
      conn.on('open', () => {
        opened = true;
        clearTimeout(timeout);
        lobbyStatus('Conectado. Preparando a partida…');
        conn.send({ t: 'tft-hello', name, roster: L.roster });
      });
      conn.on('data', onGuestMessage);
      conn.on('close', onRivalGone);
    });
    peer.on('error', err => {
      lobbyStatus(err.type === 'peer-unavailable' ? 'Sala não encontrada. Confira o código.' : `Erro de conexão: ${err.type || err.message}`);
      closeNet();
    });
  }

  function onGuestMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    L.lastSeen = Date.now();
    if (msg.t === 'tft-full') { closeNet(); lobbyStatus('A sala já tem dois jogadores.'); }
    if (msg.t === 'tft-start') { L.skins = msg.skins || {}; L.viewer = 1; startHeartbeat(); openGame(); }
    if (msg.t === 'tft-state') applyState(msg.st, msg.left, msg.total);
    if (msg.t === 'tft-combat') startPlayback(msg.view, msg.flip);
    if (msg.t === 'tft-err') toast(msg.text);
  }

  function onRivalGone() {
    if (!L.conn && L.mode !== 'guest') return;
    if (L.st && L.st.phase === 'end') return;
    if (byId('game').hidden) { closeNet(); lobbyStatus('A conexão com o outro jogador caiu.'); byId('roomBox').hidden = true; return; }
    stopLoop();
    showEnd('A conexão caiu', 'O outro jogador saiu da partida.', false);
  }

  /* sinal de presença: fechar a aba de repente demora a derrubar o WebRTC */
  function startHeartbeat() {
    clearInterval(L.heartbeat);
    L.lastSeen = Date.now();
    L.heartbeat = setInterval(() => {
      if (!L.conn) return clearInterval(L.heartbeat);
      if (L.conn.open) L.conn.send({ t: 'tft-ping' });
      if (Date.now() - L.lastSeen > HEARTBEAT_LIMIT) { clearInterval(L.heartbeat); onRivalGone(); }
    }, 2000);
  }

  const sendGame = act => {
    if (L.mode === 'guest') { if (L.conn && L.conn.open) L.conn.send({ t: 'tft-act', a: act }); }
    else hostAct(0, act);
  };

  /* ---------- Anfitrião: fluxo do jogo ---------- */
  function startHostGame(vsBot) {
    const seed = Math.floor(Math.random() * 4294967296);
    const name = myName();
    const rosters = vsBot ? [L.roster] : [L.roster, L.rivalRoster];
    L.skins = E.buildSkins(rosters, seed);
    L.mode = vsBot ? 'bot' : 'host';
    L.viewer = 0;
    L.g = E.createGame({ names: [name, vsBot ? 'Bot Kakera' : L.rivalName], seed, bots: [false, vsBot], skins: L.skins });
    if (!vsBot) L.conn.send({ t: 'tft-start', skins: L.skins });
    openGame();
    E.nextRound(L.g);
    enterPhase();
    stopLoop();
    L.timerLoop = setInterval(hostTick, 200);
  }

  const stopLoop = () => { clearInterval(L.timerLoop); L.timerLoop = null; };

  function enterPhase() {
    const g = L.g;
    if (g.phase === 'plan') {
      setDeadline(E.RULES.planSeconds);
      runBot();
    } else if (g.phase === 'carousel') {
      setDeadline(E.RULES.carouselSeconds);
      runBot();
    }
    broadcastState();
    if (bothDecided()) advance();
  }

  function setDeadline(sec) {
    L.deadline = Date.now() + sec * 1000;
    L.totalTime = sec;
  }

  function runBot() {
    const g = L.g;
    if (!g.players[1].bot) return;
    if (g.phase === 'carousel') E.botCarousel(g, 1);
    else E.botPlan(g, 1);
  }

  function bothDecided() {
    const g = L.g;
    if (g.phase === 'plan') return g.players.every(p => p.ready);
    if (g.phase === 'carousel') return g.players.every(p => p.picked);
    return false;
  }

  function advance() {
    const g = L.g;
    if (g.phase === 'carousel') {
      E.endCarousel(g);
      E.nextRound(g);
      enterPhase();
    } else if (g.phase === 'plan') {
      const combat = E.startCombat(g);
      const view = combat.views[0];
      // no PvP o convidado é o lado 1; contra monstros cada um tem o seu combate
      if (L.mode === 'host') L.conn.send({ t: 'tft-combat', view: combat.views[1], flip: combat.kind === 'pvp' });
      setDeadline(Math.max(...combat.views.map(v => v.duration)) + 2.2);
      broadcastState();
      startPlayback(view, false);
    } else if (g.phase === 'combat') {
      E.finishCombat(g);
      if (g.phase === 'end') { broadcastState(); stopLoop(); return; }
      enterPhase();
    }
  }

  function hostTick() {
    if (!L.g || L.g.phase === 'end') return;
    if (Date.now() >= L.deadline) advance();
    else if (bothDecided()) advance();
  }

  function hostAct(who, action) {
    const g = L.g;
    if (!g || !action || typeof action !== 'object') return;
    const err = E.act(g, who, action);
    if (err) {
      if (who === L.viewer) toast(err);
      else if (L.conn && L.conn.open) L.conn.send({ t: 'tft-err', text: err });
    }
    broadcastState();
  }

  function broadcastState() {
    const g = L.g;
    const left = Math.max(0, (L.deadline - Date.now()) / 1000);
    if (L.mode === 'host' && L.conn && L.conn.open) L.conn.send({ t: 'tft-state', st: E.publicState(g, 1), left, total: L.totalTime });
    applyState(E.publicState(g, 0), left, L.totalTime);
  }

  function applyState(st, left, total) {
    const prevRound = L.st && L.st.round && L.st.round.label;
    const prevPhase = L.st && L.st.phase;
    L.st = st;
    L.deadline = Date.now() + (left || 0) * 1000;
    L.totalTime = total || 1;
    // terminou o combate: volta a mostrar o campo de planejamento
    if (st.phase !== 'combat' && L.playing) stopPlayback();
    if (prevPhase === 'combat' && st.phase !== 'combat') showResult(st.you.lastResult);
    render();
    if (st.round && st.round.label !== prevRound && st.round.type !== 'carousel') announceRound(st.round);
    if (st.phase === 'end') {
      const won = st.winner === st.viewer;
      showEnd(st.winner === -1 ? 'Empate!' : won ? 'Vitória!' : 'Derrota', `${st.you.name} ${st.you.hp} × ${st.rival.hp} ${st.rival.name}, na rodada ${st.round.label}.`, L.mode !== 'guest');
    }
  }

  /* ---------- Abrir / sair ---------- */
  function openGame() {
    byId('lobby').hidden = true;
    byId('game').hidden = false;
    byId('endScreen').hidden = true;
    if (!L.timerStarted) { L.timerStarted = true; requestAnimationFrame(updateTimer); }
  }

  function leaveGame() {
    stopLoop();
    stopPlayback();
    closeNet();
    Object.assign(L, { g: null, st: null, mode: null, rivalRoster: [], rivalName: '' });
    byId('game').hidden = true;
    byId('endScreen').hidden = true;
    byId('lobby').hidden = false;
    byId('roomBox').hidden = true;
    byId('carousel').hidden = true;
    lobbyStatus('');
  }

  function showEnd(title, text, canRematch) {
    const el = byId('endScreen');
    el.hidden = false;
    el.innerHTML = `<div class="end-box"><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="end-actions">
        ${canRematch ? '<button class="btn primary" id="btnAgain">JOGAR DE NOVO</button>' : ''}
        <button class="btn" id="btnEndLeave">VOLTAR</button>
      </div></div>`;
    byId('btnEndLeave').addEventListener('click', leaveGame);
    const again = byId('btnAgain');
    if (again) {
      again.addEventListener('click', () => {
        if (L.mode === 'host' && !(L.conn && L.conn.open)) return toast('O outro jogador já saiu da sala.');
        startHostGame(L.mode === 'bot');
      });
    }
  }

  /* ---------- Desenho de peças ---------- */
  const champOf = c => E.CH[c];
  const skinOf = c => L.skins[c] || null;
  const displayName = c => { const s = skinOf(c); return s ? s.name : champOf(c).name; };

  function portrait(c) {
    const s = skinOf(c);
    const photo = s && safePhoto(s.photo);
    const fallback = asset(champOf(c).icon);
    return `<img class="pic" src="${esc(photo || fallback)}" data-fb="${esc(fallback)}" alt="${esc(displayName(c))}" referrerpolicy="no-referrer" draggable="false">`;
  }
  const itemIcon = (id, attrs = '') => {
    const it = E.ITEMS[id];
    return `<span class="item" data-tip="item:${esc(id)}" ${attrs}><img src="${esc(asset(it.icon))}" alt="${esc(it.name)}" draggable="false"></span>`;
  };
  const stars = n => `<span class="stars s${n}">${'★'.repeat(n)}</span>`;

  /* posição das casas: x/y em % do campo */
  const BOARD_W = 7.5;
  const BOARD_H = 7 * 0.866 + 1.1547;
  const hexPos = (dc, dr) => ({
    left: ((dc + (dr & 1 ? 0.5 : 0)) / BOARD_W) * 100,
    bottom: ((dr * 0.866) / BOARD_H) * 100,
  });
  const hexStyle = (dc, dr) => { const p = hexPos(dc, dr); return `left:${p.left}%;bottom:${p.bottom}%`; };

  function unitHtml(u, dc, dr, opts = {}) {
    const ch = champOf(u.c);
    const attrs = opts.mine
      ? `data-uid="${u.uid}" ${opts.drag ? `data-drag="${opts.drag}"` : ''} ${opts.drop ? `data-drop="${opts.drop}"` : ''}`
      : '';
    return `<div class="unit cost${ch.cost} ${opts.mine ? 'mine' : 'enemy'}" style="${hexStyle(dc, dr)}" ${attrs} data-tip="unit:${esc(u.c)}:${u.star}:${esc((u.items || []).join('+'))}">
      <div class="hexpic">${portrait(u.c)}</div>
      ${stars(u.star)}
      <div class="unit-items">${(u.items || []).map(i => itemIcon(i)).join('')}</div>
    </div>`;
  }

  /* ---------- Render geral ---------- */
  function render() {
    const st = L.st;
    if (!st) return;
    renderHeader(st);
    renderTraits(st);
    renderItems(st);
    if (!L.playing) renderBoard(st);
    renderBench(st);
    renderShop(st);
    renderCarousel(st);
    renderLog(st);
  }

  function chipHtml(p, own) {
    const pct = Math.max(0, p.hp);
    const streak = p.streak ? `<span class="streak ${p.streak > 0 ? 'hot' : 'cold'}">${p.streak > 0 ? '🔥' : '❄'} ${Math.abs(p.streak)}</span>` : '';
    return `<div class="chip-top"><b>${esc(p.name)}</b>${streak}<span class="chip-meta">Nv ${p.level} · ${p.gold}g${p.ready ? ' · PRONTO' : ''}</span></div>
      <div class="hp-bar ${own ? 'own' : ''}"><i style="width:${pct}%"></i><span>${p.hp}</span></div>`;
  }

  const ROUND_ICON = { pvp: '⚔', pve: '🐾', carousel: '🎁' };
  function renderHeader(st) {
    byId('chipYou').innerHTML = chipHtml(st.you, true);
    byId('chipRival').innerHTML = chipHtml(st.rival, false);
    const r = st.round;
    if (!r) return;
    const phaseName = { plan: 'Planejamento', carousel: 'Carrossel', combat: 'Combate', end: 'Fim' }[st.phase] || '';
    byId('roundLabel').textContent = `Rodada ${r.label} · ${phaseName}`;
    const count = r.stage === 1 ? 4 : 7;
    let track = '';
    for (let n = 1; n <= count; n++) {
      const idx = r.stage === 1 ? n - 1 : 4 + (r.stage - 2) * 7 + (n - 1);
      const info = E.roundInfo(idx);
      track += `<span class="pip ${n === r.n ? 'now' : n < r.n ? 'done' : ''}" title="${info.label}">${ROUND_ICON[info.type]}</span>`;
    }
    byId('roundTrack').innerHTML = track;
  }

  function updateTimer() {
    if (!byId('game').hidden && L.st) {
      const left = Math.max(0, L.deadline - Date.now()) / 1000;
      byId('timerBar').style.width = `${Math.min(100, (left / (L.totalTime || 1)) * 100)}%`;
      const btn = byId('btnReady');
      if (L.st.phase === 'plan') btn.textContent = `${L.st.you.ready ? 'AGUARDANDO' : 'PRONTO'} · ${Math.ceil(left)}s`;
      if (L.st.phase === 'carousel') btn.textContent = `ESCOLHA · ${Math.ceil(left)}s`;
      if (L.st.phase === 'combat') btn.textContent = 'EM COMBATE';
    }
    requestAnimationFrame(updateTimer);
  }

  function renderTraits(st) {
    const list = st.you.traits;
    byId('traitList').innerHTML = list.length ? list.map(t => `
      <div class="trait ${t.active ? 'on' : ''}" data-tip="trait:${esc(t.name)}">
        <img src="${esc(asset(E.TRAITS[t.name].icon))}" alt="" draggable="false">
        <b>${esc(t.name)}</b>
        <span>${t.tiers.map(n => `<i class="${t.count >= n ? 'hit' : ''}">${n}</i>`).join('')}</span>
        <em>${t.count}</em>
      </div>`).join('') : '<p class="empty">Coloque unidades em campo para ativar traits.</p>';
  }

  function renderItems(st) {
    byId('itemBench').innerHTML = st.you.items.length
      ? st.you.items.map((id, i) => itemIcon(id, `data-drag="i:${i}"`)).join('')
      : '<p class="empty">Arraste um item até uma unidade.</p>';
  }

  function renderBoard(st) {
    const canEdit = st.phase === 'plan' || st.phase === 'carousel';
    const board = byId('board');
    let html = '';
    const painted = st.you.traits.some(t => t.name === 'Demônio Urbano' && t.active);
    for (let dr = 0; dr < 8; dr++) {
      for (let dc = 0; dc < 7; dc++) {
        const own = dr < 4;
        const x = dc, y = 3 - dr;
        const paint = own && painted && E.RULES.paintedHexes.includes(`${x},${y}`);
        html += `<div class="cell ${own ? 'own' : 'foe'} ${paint ? 'paint' : ''}" style="${hexStyle(dc, dr)}" ${own ? `data-drop="h:${x},${y}"` : ''}></div>`;
      }
    }
    for (const [key, u] of Object.entries(st.you.board)) {
      const [x, y] = key.split(',').map(Number);
      html += unitHtml(u, x, 3 - y, { mine: true, drag: canEdit ? `h:${x},${y}` : '', drop: `h:${x},${y}` });
    }
    for (const [key, u] of Object.entries(st.rival.board)) {
      const [x, y] = key.split(',').map(Number);
      html += unitHtml(u, 6 - x, 4 + y, { mine: false });
    }
    board.innerHTML = html;
  }

  function renderBench(st) {
    byId('bench').innerHTML = st.you.bench.map((u, i) => (u
      ? `<div class="bench-slot" data-drop="b:${i}"><div class="unit bench-unit cost${champOf(u.c).cost} mine" data-uid="${u.uid}" data-drag="b:${i}" data-drop="b:${i}" data-tip="unit:${esc(u.c)}:${u.star}:${esc(u.items.join('+'))}">
          <div class="hexpic">${portrait(u.c)}</div>${stars(u.star)}<div class="unit-items">${u.items.map(id => itemIcon(id)).join('')}</div></div></div>`
      : `<div class="bench-slot" data-drop="b:${i}"></div>`)).join('');
  }

  function renderShop(st) {
    const you = st.you;
    byId('goldBox').innerHTML = `<b>${you.gold}</b> ouro`;
    const pct = you.xpNext ? (you.xp / you.xpNext) * 100 : 100;
    const fielded = Object.keys(you.board).length;
    byId('levelBox').innerHTML = `<span>Nível <b>${you.level}</b> · ${fielded}/${you.level} em campo</span>
      <div class="xp-bar"><i style="width:${pct}%"></i></div><small>${you.xpNext ? `${you.xp}/${you.xpNext} XP` : 'nível máximo'}</small>`;
    byId('btnXp').textContent = `XP +${E.RULES.xpGain} · ${E.RULES.xpCost}g`;
    byId('btnReroll').textContent = `ATUALIZAR · ${E.RULES.rerollCost}g`;
    byId('btnXp').disabled = you.gold < E.RULES.xpCost || you.level >= E.RULES.maxLevel;
    byId('btnReroll').disabled = you.gold < E.RULES.rerollCost;
    byId('btnLock').textContent = you.locked ? '🔒 TRAVADA' : '🔓 TRAVAR';
    byId('btnLock').classList.toggle('on', you.locked);
    byId('btnReady').disabled = st.phase !== 'plan';
    byId('btnReady').classList.toggle('on', you.ready);
    byId('shop').innerHTML = (you.shop || []).map((c, i) => {
      if (!c) return '<div class="shop-card empty-card"></div>';
      const ch = champOf(c);
      const s = skinOf(c);
      const cant = you.gold < ch.cost;
      return `<button type="button" class="shop-card cost${ch.cost} ${cant ? 'cant' : ''}" data-buy="${i}" data-tip="unit:${esc(c)}:1:">
        ${portrait(c)}
        <span class="shop-traits">${ch.traits.map(t => `<i>${esc(t)}</i>`).join('')}</span>
        <span class="shop-name"><b>${esc(displayName(c))}</b>${s && s.series ? `<small>${esc(s.series)}</small>` : ''}</span>
        <span class="shop-cost">${ch.cost}g</span>
      </button>`;
    }).join('');
  }

  function renderCarousel(st) {
    const el = byId('carousel');
    const opts = st.you.carousel;
    if (st.phase !== 'carousel' || !opts) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<div class="carousel-box"><h2>🎁 Carrossel</h2><p>${st.you.picked ? 'Aguardando o rival…' : 'Escolha uma unidade com um componente.'}</p>
      <div class="carousel-opts">${opts.map((o, i) => {
        const ch = champOf(o.c);
        return `<button type="button" class="carousel-opt cost${ch.cost} ${o.taken ? 'taken' : ''}" data-pick="${i}" ${st.you.picked ? 'disabled' : ''} data-tip="unit:${esc(o.c)}:1:">
          ${portrait(o.c)}
          <span class="carousel-name">${esc(displayName(o.c))}</span>
          <span class="carousel-item">${itemIcon(o.item)} ${esc(E.ITEMS[o.item].name)}</span>
        </button>`;
      }).join('')}</div></div>`;
  }

  function renderLog(st) {
    byId('logList').innerHTML = st.log.slice().reverse().map(t => `<li>${esc(t)}</li>`).join('') || '<li class="empty">Nenhum combate ainda.</li>';
  }

  function announceRound(r) {
    const type = { pvp: 'Duelo contra o rival', pve: 'Monstros: rende itens e ouro' }[r.type];
    showBanner(`${r.label} · ${type}`, 'info');
  }
  function showResult(res) {
    if (!res) return;
    const lootTxt = res.loot ? [res.loot.gold ? `+${res.loot.gold}g` : '', ...res.loot.items.map(i => E.ITEMS[i].name)].filter(Boolean).join(' · ') : '';
    const main = res.res === 'win' ? 'Vitória' : res.res === 'draw' ? `Empate · −${res.dmg} de Vida` : `Derrota · −${res.dmg} de Vida`;
    showBanner(lootTxt ? `${main} · ${lootTxt}` : main, res.res === 'win' ? 'good' : 'bad');
  }
  let bannerTimer = null;
  function showBanner(text, kind) {
    const el = byId('banner');
    el.textContent = text;
    el.className = `banner ${kind}`;
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /* ---------- Reprodução do combate ---------- */
  function startPlayback(view, flip) {
    stopPlayback();
    const board = byId('board');
    const mySide = flip ? 1 : 0;
    const metas = new Map(view.meta.map(m => [m.id, m]));
    const els = new Map();
    let cells = '';
    for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 7; dc++) cells += `<div class="cell ${dr < 4 ? 'own' : 'foe'} fighting" style="${hexStyle(dc, dr)}"></div>`;
    board.innerHTML = cells;
    const place = (r, c) => (flip ? [6 - c, 7 - r] : [c, r]);

    for (const row of view.frames[0].u) {
      const m = metas.get(row[0]);
      const el = document.createElement('div');
      const mine = m.side === mySide;
      if (m.champ) {
        const [dc, dr] = place(row[2], row[1]);
        el.className = `unit fight cost${champOf(m.champ).cost} ${mine ? 'mine' : 'enemy'}`;
        el.style.cssText = hexStyle(dc, dr);
        el.innerHTML = `<div class="bars"><i class="hp"></i><i class="sh"></i><b class="mp"></b></div><div class="hexpic">${portrait(m.champ)}</div>${stars(m.star)}<div class="unit-items">${(m.items || []).map(i => itemIcon(i)).join('')}</div>`;
        el.dataset.tip = `unit:${m.champ}:${m.star}:${(m.items || []).join('+')}`;
      } else {
        const d = E.CREEPS[m.creep];
        const [dc, dr] = place(row[2], row[1]);
        el.className = `unit fight creep ${mine ? 'mine' : 'enemy'}`;
        el.style.cssText = hexStyle(dc, dr);
        el.title = d.name;
        el.innerHTML = `<div class="bars"><i class="hp"></i><i class="sh"></i><b class="mp"></b></div><div class="hexpic creep-face">${d.icon}</div>`;
      }
      board.appendChild(el);
      els.set(row[0], el);
    }

    const pb = { view, flip, els, metas, start: performance.now(), frame: -1, raf: 0, seen: new Set() };
    L.playing = pb;
    const step = now => {
      if (L.playing !== pb) return;
      const idx = Math.min(view.frames.length - 1, Math.floor((now - pb.start) / 100));
      while (pb.frame < idx) { pb.frame++; applyFrame(pb, view.frames[pb.frame]); }
      pb.raf = requestAnimationFrame(step);
    };
    pb.raf = requestAnimationFrame(step);
    // aba em segundo plano não anima: ainda assim o combate termina pelo relógio do anfitrião
  }

  function stopPlayback() {
    if (L.playing) cancelAnimationFrame(L.playing.raf);
    L.playing = null;
  }

  function applyFrame(pb, f) {
    const alive = new Set();
    for (const row of f.u) {
      const [id, c, r, hp, sh, mana, stunned, maxHp] = row;
      alive.add(id);
      const el = pb.els.get(id);
      const m = pb.metas.get(id);
      if (!el) continue;
      const [dc, dr] = pb.flip ? [6 - c, 7 - r] : [c, r];
      const key = `${dc},${dr}`;
      if (el.dataset.at !== key) {
        el.dataset.at = key;
        const p = hexPos(dc, dr);
        el.style.left = `${p.left}%`;
        el.style.bottom = `${p.bottom}%`;
      }
      const total = Math.max(maxHp, hp + sh);
      el.querySelector('.hp').style.width = `${(hp / total) * 100}%`;
      const shEl = el.querySelector('.sh');
      shEl.style.left = `${(hp / total) * 100}%`;
      shEl.style.width = `${(sh / total) * 100}%`;
      el.querySelector('.mp').style.width = m.maxMana ? `${Math.min(100, (mana / m.maxMana) * 100)}%` : '0%';
      el.classList.toggle('stunned', !!stunned);
    }
    for (const [id, el] of pb.els) {
      if (!alive.has(id) && !el.classList.contains('dead')) el.classList.add('dead');
    }
    for (const ev of f.e) playEvent(pb, ev);
  }

  function playEvent(pb, ev) {
    const [kind, id, a, b, c] = ev;
    const el = pb.els.get(id);
    if (!el) return;
    if (kind === 'd') floatText(el, String(a), `dmg-${b}${c ? ' crit' : ''}`);
    else if (kind === 'h') floatText(el, `+${a}`, 'heal');
    else if (kind === 'g') floatText(el, '+1g', 'goldfx');
    else if (kind === 'c') { el.classList.remove('casting'); void el.offsetWidth; el.classList.add('casting'); }
    else if (kind === 'a') {
      const to = pb.els.get(a);
      if (to) shot(el, to, b);
    } else if (kind === 'sh') { el.classList.remove('shielded'); void el.offsetWidth; el.classList.add('shielded'); }
  }

  function floatText(el, text, cls) {
    const board = byId('board');
    if (board.querySelectorAll('.float').length > 40) return;
    const f = document.createElement('span');
    f.className = `float ${cls}`;
    f.textContent = text;
    f.style.left = `calc(${el.style.left} + ${3 + Math.random() * 7}%)`;
    f.style.bottom = `calc(${el.style.bottom} + 11%)`;
    board.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }

  function shot(from, to, kind) {
    const board = byId('board');
    if (board.querySelectorAll('.shot').length > 30) return;
    const s = document.createElement('i');
    s.className = `shot ${kind || ''}`;
    s.style.left = `calc(${from.style.left} + 6%)`;
    s.style.bottom = `calc(${from.style.bottom} + 7%)`;
    board.appendChild(s);
    requestAnimationFrame(() => {
      s.style.left = `calc(${to.style.left} + 6%)`;
      s.style.bottom = `calc(${to.style.bottom} + 7%)`;
    });
    setTimeout(() => s.remove(), 220);
  }

  /* ---------- Arrastar e soltar (mouse e toque) ---------- */
  const DRAG = { src: null, el: null, ghost: null, x: 0, y: 0, moved: false };

  const parseSpot = text => {
    if (!text) return null;
    const [k, v] = text.split(':');
    if (k === 'b') return { b: Number(v) };
    if (k === 'h') { const [x, y] = v.split(',').map(Number); return { x, y }; }
    return null;
  };

  function onPointerDown(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    const el = ev.target.closest('[data-drag]');
    if (!el) return;
    Object.assign(DRAG, { src: el.dataset.drag, el, x: ev.clientX, y: ev.clientY, moved: false });
  }

  function onPointerMove(ev) {
    if (!DRAG.src) return;
    if (!DRAG.moved && Math.hypot(ev.clientX - DRAG.x, ev.clientY - DRAG.y) < 6) return;
    if (!DRAG.moved) {
      DRAG.moved = true;
      hideTip();
      const r = DRAG.el.getBoundingClientRect();
      const g = DRAG.el.cloneNode(true);
      g.classList.add('ghost');
      g.style.cssText = `width:${r.width}px;height:${r.height}px`;
      document.body.appendChild(g);
      DRAG.ghost = g;
      DRAG.el.classList.add('drag-src');
      document.body.classList.add('dragging');
      if (!DRAG.src.startsWith('i:')) {
        const uid = Number(DRAG.el.dataset.uid);
        const u = findMine(uid);
        const hint = byId('sellHint');
        if (u) { hint.textContent = `Soltar aqui para VENDER por ${E.sellPrice(u)}g`; hint.hidden = false; }
      }
    }
    DRAG.ghost.style.transform = `translate(${ev.clientX - DRAG.ghost.offsetWidth / 2}px, ${ev.clientY - DRAG.ghost.offsetHeight / 2}px)`;
  }

  function findMine(uid) {
    const you = L.st && L.st.you;
    if (!you) return null;
    return [...you.bench.filter(Boolean), ...Object.values(you.board)].find(u => u.uid === uid) || null;
  }

  function endDrag() {
    if (DRAG.ghost) DRAG.ghost.remove();
    if (DRAG.el) DRAG.el.classList.remove('drag-src');
    document.body.classList.remove('dragging');
    byId('sellHint').hidden = true;
    Object.assign(DRAG, { src: null, el: null, ghost: null, moved: false });
  }

  function onPointerUp(ev) {
    if (!DRAG.src) return;
    const src = DRAG.src;
    const moved = DRAG.moved;
    const uid = DRAG.el ? Number(DRAG.el.dataset.uid) : 0;
    if (DRAG.ghost) DRAG.ghost.style.display = 'none';
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    endDrag();
    if (!moved || !under) return;
    if (src.startsWith('i:')) {
      const target = under.closest('[data-uid]');
      if (target) sendGame({ a: 'equip', item: Number(src.slice(2)), uid: Number(target.dataset.uid) });
      return;
    }
    const drop = under.closest('[data-drop]');
    if (!drop) return;
    if (drop.dataset.drop === 'sell') return sendGame({ a: 'sell', uid });
    const to = parseSpot(drop.dataset.drop);
    if (to) sendGame({ a: 'move', from: parseSpot(src), to });
  }

  /* ---------- Dicas ---------- */
  function statsLine(ch, star) {
    const hp = Math.round(ch.hp * Math.pow(1.8, star - 1));
    const ad = Math.round(ch.ad * Math.pow(1.5, star - 1));
    return `<div class="tip-stats"><span>Vida <b>${hp}</b></span><span>DA <b>${ad}</b></span><span>VA <b>${ch.as.toFixed(2)}</b></span><span>Arm <b>${ch.armor}</b></span><span>RM <b>${ch.mr}</b></span><span>Alcance <b>${ch.range}</b></span><span>Mana <b>${ch.mana0}/${Math.max(ch.mana, ch.mana0)}</b></span></div>`;
  }
  function tipFor(key) {
    const [kind, a, b, c] = key.split(':');
    if (kind === 'item') {
      const it = E.ITEMS[a];
      if (!it) return '';
      const fx = it.fx;
      const line = [
        fx.AD ? `+${Math.round(fx.AD * 100)}% DA` : '', fx.AP ? `+${fx.AP} PH` : '', fx.AS ? `+${fx.AS}% VA` : '', fx.Armor ? `+${fx.Armor} Arm` : '',
        fx.MagicResist ? `+${fx.MagicResist} RM` : '', fx.Health ? `+${fx.Health} Vida` : '', fx.CritChance ? `+${fx.CritChance}% Crít.` : '', fx.ManaRegen ? `+${fx.ManaRegen} Mana/s` : '',
      ].filter(Boolean).join(' · ');
      let recipes = '';
      if (!it.from) {
        recipes = `<div class="tip-recipes">${E.D.items.filter(x => x.from && x.from.includes(a)).map(x => {
          const other = x.from[0] === a ? x.from[1] : x.from[0];
          return `<span><img src="${esc(asset(E.ITEMS[other].icon))}" alt="">→ ${esc(x.name)}</span>`;
        }).join('')}</div>`;
      }
      return `<h4>${esc(it.name)}</h4>${line ? `<p class="tip-line">${esc(line)}</p>` : ''}${E.ITEM_TEXT[a] ? `<p>${esc(E.ITEM_TEXT[a])}</p>` : ''}${recipes}`;
    }
    if (kind === 'trait') {
      const t = E.TRAITS[a];
      if (!t) return '';
      return `<h4>${esc(a)}</h4><p>${esc(E.TRAIT_TEXT[a] || '')}</p><p class="tip-line">Ativa com ${t.tiers.map(x => x.min).join(' / ')} unidades diferentes.</p>`;
    }
    if (kind === 'unit') {
      const ch = champOf(a);
      if (!ch) return '';
      const star = Number(b) || 1;
      const s = skinOf(a);
      const items = c ? c.split('+').filter(Boolean) : [];
      return `<h4>${esc(displayName(a))} ${stars(star)}</h4>
        ${s ? `<p class="tip-sub">${esc(s.series)}${s.series ? ' · ' : ''}${Number(s.kakera).toLocaleString('pt-BR')} kakera · kit: ${esc(ch.name)}</p>` : ''}
        <p class="tip-line">Custo ${ch.cost} · ${ch.traits.map(esc).join(' · ')}</p>
        ${statsLine(ch, star)}
        <p><b>${esc(ch.abilityName)}:</b> ${esc(E.abilityText(ch.name, star))}</p>
        ${items.length ? `<p class="tip-line">${items.map(i => esc(E.ITEMS[i] ? E.ITEMS[i].name : i)).join(' · ')}</p>` : ''}`;
    }
    return '';
  }
  function showTip(el, x, y) {
    const html = tipFor(el.dataset.tip);
    if (!html) return;
    const tip = byId('tip');
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, x + 14))}px`;
    tip.style.top = `${Math.max(8, Math.min(window.innerHeight - r.height - 8, y - r.height - 10))}px`;
  }
  const hideTip = () => { byId('tip').hidden = true; };

  /* ---------- Regras ---------- */
  function rulesHtml() {
    const R = E.RULES;
    const rows = Object.entries(R.odds).map(([lv, o]) => `<tr><th>${lv}</th>${o.map(v => `<td>${v}%</td>`).join('')}</tr>`).join('');
    return `
      <h3>Como joga</h3>
      <p>Compre unidades na loja, posicione no campo e deixe o combate acontecer. Três cópias iguais viram 2★, e três 2★ viram 3★. O limite em campo é o seu nível. Quem chega a 0 de Vida perde.</p>
      <h3>Rodadas</h3>
      <p>Estágio 1: carrossel e monstros. Do 2 em diante: três duelos, carrossel, dois duelos e monstros. Perder custa ${R.stageDamage.slice(2).join('/')} de dano por estágio, mais 1 por unidade inimiga viva.</p>
      <h3>Economia</h3>
      <p>Renda de 5g por rodada, juros de 1g a cada 10g (até 5g), +1g por vitória em duelo e sequência (2-4: +1g, 5: +2g, 6+: +3g). Atualizar custa ${R.rerollCost}g e ${R.xpGain} XP custam ${R.xpCost}g. Atalhos: <b>D</b> atualiza, <b>F</b> compra XP.</p>
      <h3>Chance da loja por nível</h3>
      <table class="odds"><tr><th>Nv</th><th>1g</th><th>2g</th><th>3g</th><th>4g</th><th>5g</th></tr>${rows}</table>
      <h3>O que muda neste protótipo</h3>
      <ul>
        <li><b>Skins:</b> cada waifu assume os números de um campeão da season. A kakera define o custo, e a dica mostra qual é o kit.</li>
        <li><b>1v1:</b> os duelos são sempre contra o mesmo rival, e o carrossel é individual, com 4 opções.</li>
        <li><b>Habilidades:</b> usam os valores oficiais em um modelo comum, sem as animações e os detalhes de cada uma.</li>
        <li><b>Traits:</b> as marcadas com "(adaptado)" na dica foram simplificadas.</li>
        <li><b>Fora por enquanto:</b> augments, hacks, emblemas e a Espátula.</li>
      </ul>`;
  }

  /* ---------- Eventos ---------- */
  function initEvents() {
    byId('seasonName').textContent = E.D.season.toUpperCase();
    byId('rulesSeason').textContent = E.D.season;
    byId('rulesBody').innerHTML = rulesHtml();
    try { byId('nameInput').value = localStorage.getItem(NAME_KEY) || ''; } catch (err) { /* sem armazenamento */ }

    byId('btnBot').addEventListener('click', () => startHostGame(true));
    byId('btnCreate').addEventListener('click', () => createRoom());
    byId('btnJoin').addEventListener('click', joinRoom);
    byId('codeInput').addEventListener('input', ev => { ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    byId('codeInput').addEventListener('keydown', ev => { if (ev.key === 'Enter') joinRoom(); });
    byId('btnCopy').addEventListener('click', async ev => {
      try { await navigator.clipboard.writeText(L.code || ''); ev.target.textContent = 'COPIADO!'; }
      catch (err) { ev.target.textContent = 'COPIE À MÃO'; }
      setTimeout(() => { ev.target.textContent = 'COPIAR'; }, 1500);
    });
    byId('btnCancelRoom').addEventListener('click', () => { closeNet(); L.mode = null; byId('roomBox').hidden = true; lobbyStatus(''); });

    byId('btnXp').addEventListener('click', () => sendGame({ a: 'xp' }));
    byId('btnReroll').addEventListener('click', () => sendGame({ a: 'reroll' }));
    byId('btnLock').addEventListener('click', () => sendGame({ a: 'lock' }));
    byId('btnReady').addEventListener('click', () => sendGame({ a: 'ready' }));
    byId('btnQuit').addEventListener('click', () => { if (confirm('Sair abandona a partida. Continuar?')) leaveGame(); });

    document.addEventListener('click', ev => {
      if (ev.target.closest('[data-open-rules]')) byId('rulesModal').hidden = false;
      if (ev.target.closest('[data-close-rules]') || ev.target.id === 'rulesModal') byId('rulesModal').hidden = true;
      const buy = ev.target.closest('[data-buy]');
      if (buy) { sendGame({ a: 'buy', slot: Number(buy.dataset.buy) }); hideTip(); return; }
      const pickBtn = ev.target.closest('[data-pick]');
      if (pickBtn && !pickBtn.disabled) { sendGame({ a: 'pick', i: Number(pickBtn.dataset.pick) }); return; }
      // toque: dica ao tocar; mouse já recebe ao passar por cima
      const tipEl = ev.target.closest('[data-tip]');
      if (tipEl) showTip(tipEl, ev.clientX, ev.clientY); else hideTip();
    });

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', endDrag);

    document.addEventListener('pointerover', ev => {
      if (ev.pointerType !== 'mouse' || DRAG.moved) return;
      const el = ev.target.closest('[data-tip]');
      if (el) showTip(el, ev.clientX, ev.clientY); else hideTip();
    });

    document.addEventListener('keydown', ev => {
      if (byId('game').hidden || /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
      const key = ev.key.toLowerCase();
      if (key === 'd') sendGame({ a: 'reroll' });
      if (key === 'f') sendGame({ a: 'xp' });
    });

    // imagem que não abre: usa o ícone do campeão ou some
    document.addEventListener('error', ev => {
      const img = ev.target;
      if (img.tagName !== 'IMG') return;
      if (img.dataset.fb && img.src !== img.dataset.fb) { img.src = img.dataset.fb; return; }
      img.style.visibility = 'hidden';
    }, true);

    window.addEventListener('beforeunload', closeNet);
  }

  initEvents();
  loadRoster();
})();
