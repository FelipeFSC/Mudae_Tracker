/* ============================================================
   TFT.JS — tela e conexão do Mudae TFT (protótipo)
   ------------------------------------------------------------
   Conexão igual à da Waifu Arena: WebRTC via PeerJS, sala com código
   de 6 letras, sem servidor próprio. Cabem de 2 a 8 jogadores, todos
   ligados ao anfitrião: ele roda o motor (tft-engine.js) e os
   convidados enviam ações e desenham o estado.
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
  const DATA_PHOTO_BUDGET = 1500000;   // fotos salvas no tracker que cada mensagem pode carregar
  const MAX_PLAYERS = 8;
  const MIN_PLAYERS = 2;
  const COUNTDOWN_SECONDS = 3;
  const HEARTBEAT_LIMIT = 15000;
  const SUMMARY_SECONDS = 6;   // tempo para ver os gráficos antes da próxima rodada

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
    peer: null, conn: null, code: null,       // conn: só o convidado (ligação com o anfitrião)
    guests: new Map(),                         // anfitrião: peerId → { conn, name, ready, roster, lastSeen, idx }
    hostReady: false, inMatch: false, countdown: null, room: null, scout: null,
    playing: null, timerLoop: null, preview: {}, snap: new Map(), lastFight: null, summaryAuto: false,
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
  /* limita as fotos salvas no próprio tracker: as de link quase não pesam */
  function withinPhotoBudget(list) {
    let used = 0;
    return list.map(c => {
      if (!c.photo || !c.photo.startsWith('data:')) return c;
      used += c.photo.length;
      return used > DATA_PHOTO_BUDGET ? { ...c, photo: '' } : c;
    });
  }
  function cleanRoster(list) {
    if (!Array.isArray(list)) return [];
    return withinPhotoBudget(list.slice(0, MAX_ROSTER).filter(c => c && typeof c === 'object' && c.name).map(rosterPayload));
  }
  async function loadRoster() {
    const info = byId('rosterInfo');
    try {
      await Database.init();
      const all = await Database.getAllCharacters();
      const claimed = all.filter(c => c.claimed !== false && c.name);
      L.roster = withinPhotoBudget(claimed.sort(() => Math.random() - 0.5).slice(0, MAX_ROSTER).map(rosterPayload));
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
    for (const g of L.guests.values()) try { g.conn.close(); } catch (err) { /* ignora */ }
    if (L.peer) try { L.peer.destroy(); } catch (err) { /* ignora */ }
    clearInterval(L.heartbeat);
    cancelCountdown();
    L.guests.clear();
    L.conn = null;
    L.peer = null;
    L.code = null;
    L.room = null;
    L.hostReady = false;
    L.inMatch = false;
  }

  /* ---------- Sala: anfitrião ---------- */
  function hostList() {
    return [
      { name: L.hostName, ready: L.hostReady, host: true },
      ...[...L.guests.values()].filter(g => g.name).map(g => ({ name: g.name, ready: g.ready, host: false })),
    ];
  }
  /* nome único na sala: "Ana", "Ana (2)"… */
  function uniqueName(wanted) {
    const taken = new Set(hostList().map(p => p.name));
    if (!taken.has(wanted)) return wanted;
    let i = 2;
    while (taken.has(`${wanted} (${i})`)) i++;
    return `${wanted} (${i})`;
  }
  const sendAllGuests = msg => { for (const g of L.guests.values()) if (g.name && g.conn.open) g.conn.send(msg); };

  function publishRoom() {
    const room = { code: L.code, players: hostList(), count: L.countdown ? L.countdown.left : null };
    sendAllGuests({ t: 'tft-room', room });
    L.room = room;
    renderRoom();
  }

  /* todos prontos: 3 segundos e começa. Qualquer mudança na sala cancela. */
  function roomChanged() {
    const list = hostList();
    const allReady = list.length >= MIN_PLAYERS && list.every(p => p.ready);
    if (L.inMatch) return;
    if (!allReady) cancelCountdown();
    else if (!L.countdown) startCountdown();
    publishRoom();
  }
  function startCountdown() {
    L.countdown = { left: COUNTDOWN_SECONDS, timer: setInterval(() => {
      L.countdown.left--;
      if (L.countdown.left <= 0) { cancelCountdown(); startRoomGame(); return; }
      publishRoom();
    }, 1000) };
  }
  function cancelCountdown() {
    if (L.countdown) clearInterval(L.countdown.timer);
    L.countdown = null;
  }

  async function createRoom(attempt = 0) {
    lobbyStatus('Criando sala…');
    try { await loadPeerJs(); } catch (err) { return lobbyStatus(err.message); }
    L.hostName = myName();
    const code = newCode();
    const peer = new window.Peer(ID_PREFIX + code);
    L.peer = peer;
    peer.on('open', () => {
      L.code = code;
      L.mode = 'host';
      lobbyStatus('');
      startHeartbeat();
      publishRoom();
    });
    peer.on('connection', onGuestConnection);
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && attempt < 3) { peer.destroy(); return createRoom(attempt + 1); }
      // convidado que falhou ao conectar não derruba a sala
      if (L.mode === 'host' && err.type === 'peer-unavailable') return;
      lobbyStatus(`Erro de conexão: ${err.type || err.message}`);
    });
    peer.on('disconnected', () => {
      if (L.mode === 'host' && !L.inMatch) lobbyStatus('Sem contato com o servidor de encontro: novos jogadores não conseguem entrar.');
    });
  }

  function onGuestConnection(conn) {
    if (L.inMatch || L.guests.size >= MAX_PLAYERS - 1 || L.countdown) {
      const reason = L.inMatch ? 'A partida desta sala já começou.' : L.countdown ? 'A partida está para começar. Tente de novo em instantes.' : `A sala já tem ${MAX_PLAYERS} jogadores.`;
      conn.on('open', () => { conn.send({ t: 'tft-full', reason }); setTimeout(() => conn.close(), 300); });
      return;
    }
    L.guests.set(conn.peer, { conn, name: null, ready: false, roster: [], lastSeen: Date.now(), idx: null });
    conn.on('data', msg => onHostMessage(conn.peer, msg));
    conn.on('close', () => onGuestGone(conn.peer, 'conexão fechada'));
    conn.on('error', err => onGuestGone(conn.peer, `erro: ${err && (err.type || err.message)}`));
  }

  function onHostMessage(id, msg) {
    const guest = L.guests.get(id);
    if (!guest || !msg || typeof msg !== 'object') return;
    guest.lastSeen = Date.now();
    if (msg.t === 'tft-hello' && !guest.name) {
      guest.name = uniqueName(cleanName(msg.name));
      guest.roster = cleanRoster(msg.roster);
      guest.conn.send({ t: 'tft-welcome', name: guest.name });
      roomChanged();
    }
    if (msg.t === 'tft-ready' && guest.name && !L.inMatch) {
      guest.ready = !!msg.ready;
      roomChanged();
    }
    if (msg.t === 'tft-act' && L.g && guest.idx != null) hostAct(guest.idx, msg.a);
  }

  function onGuestGone(id, reason) {
    const guest = L.guests.get(id);
    if (!guest) return;
    console.warn('[Mudae TFT]', guest.name, 'saiu:', reason);
    L.guests.delete(id);
    if (L.inMatch && L.g && guest.idx != null) {
      E.dropPlayer(L.g, guest.idx);
      if (L.g.phase === 'end') stopLoop();
      broadcastState();
      if (L.g.phase === 'end') finishMatch();
      else if (allDecided()) advance();
      return;
    }
    if (guest.name) roomChanged();
  }

  /* ---------- Sala: convidado ---------- */
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
        if (!opened) { closeNet(); L.mode = null; lobbyStatus('Não deu para conectar. Confira o código ou se a sala está aberta.'); }
      }, 15000);
      conn.on('open', () => {
        opened = true;
        clearTimeout(timeout);
        lobbyStatus('Conectado. Entrando na sala…');
        conn.send({ t: 'tft-hello', name, roster: L.roster });
        startHeartbeat();
      });
      conn.on('data', onGuestMessage);
      conn.on('close', onHostGone);
    });
    peer.on('error', err => {
      lobbyStatus(err.type === 'peer-unavailable' ? 'Sala não encontrada. Confira o código.' : `Erro de conexão: ${err.type || err.message}`);
      closeNet();
      L.mode = null;
    });
  }

  function onGuestMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    L.lastSeen = Date.now();
    if (msg.t === 'tft-full') { const reason = msg.reason; closeNet(); L.mode = null; lobbyStatus(reason || 'Não deu para entrar na sala.'); }
    if (msg.t === 'tft-welcome') { L.myRoomName = msg.name; lobbyStatus(''); }
    if (msg.t === 'tft-room') {
      L.room = msg.room;
      L.code = msg.room.code;
      renderRoom();
    }
    if (msg.t === 'tft-start') {
      L.skins = E.applyCollection(msg.skins || {}, TFTCollection.pins());
      L.viewer = msg.viewer;
      L.inMatch = true;
      openGame();
    }
    if (msg.t === 'tft-state') applyState(msg.st, msg.left, msg.total);
    if (msg.t === 'tft-combat') startPlayback(msg.view, msg.flip, msg.spectate);
    if (msg.t === 'tft-err') toast(msg.text);
  }

  function onHostGone() {
    if (L.mode !== 'guest' || !L.conn) return;
    const midMatch = L.inMatch && L.st && L.st.phase !== 'end';
    const onGame = !byId('game').hidden;
    closeNet();
    if (onGame) {
      L.mode = 'gone';
      if (midMatch) showEnd('A conexão caiu', 'O anfitrião saiu e a partida acabou.');
      else if (byId('endScreen').hidden) leaveGame();
      else { const back = byId('btnBackRoom'); if (back) back.remove(); }
    } else {
      L.mode = null;
      renderRoom();
      lobbyStatus('O anfitrião fechou a sala.');
    }
  }

  /* sinal de presença: fechar a aba de repente demora a derrubar o WebRTC */
  function startHeartbeat() {
    clearInterval(L.heartbeat);
    L.lastSeen = Date.now();
    L.heartbeat = setInterval(() => {
      const now = Date.now();
      if (L.mode === 'host') {
        for (const [id, g] of [...L.guests]) {
          if (g.conn.open) g.conn.send({ t: 'tft-ping' });
          if (now - g.lastSeen > HEARTBEAT_LIMIT) onGuestGone(id, `sem sinal há ${Math.round((now - g.lastSeen) / 1000)}s`);
        }
      } else if (L.conn) {
        if (L.conn.open) L.conn.send({ t: 'tft-ping' });
        if (now - L.lastSeen > HEARTBEAT_LIMIT) onHostGone();
      }
    }, 2000);
  }

  /* desenha a sala de espera */
  function renderRoom() {
    const box = byId('lobbyBox');
    const room = L.room;
    const inRoom = !!room && (L.mode === 'host' || L.mode === 'guest');
    box.classList.toggle('in-room', inRoom);
    byId('roomBox').hidden = !inRoom;
    if (!inRoom) return;
    byId('roomCode').textContent = room.code;
    byId('roomCount').textContent = `${room.players.length}/${MAX_PLAYERS}`;
    const me = L.mode === 'host' ? L.hostName : L.myRoomName;
    byId('roomPlayers').innerHTML = room.players.map(p => `<li class="${p.ready ? 'ready' : ''}">
      <b>${esc(p.name)}</b>
      ${p.host ? '<span class="room-tag">ANFITRIÃO</span>' : ''}${p.name === me ? '<span class="room-tag you">VOCÊ</span>' : ''}
      <em>${p.ready ? '✓ Pronto' : 'Aguardando'}</em>
    </li>`).join('');
    const mine = room.players.find(p => p.name === me);
    const ready = !!(mine && mine.ready);
    const btn = byId('btnRoomReady');
    btn.textContent = ready ? 'CANCELAR PRONTO' : 'ESTOU PRONTO';
    btn.classList.toggle('on', ready);
    const timer = byId('roomTimer');
    timer.hidden = room.count == null;
    if (room.count != null) timer.textContent = `A partida começa em ${room.count}…`;
    const waitingFor = room.players.filter(p => !p.ready).length;
    byId('roomHint').textContent = room.players.length < MIN_PLAYERS
      ? 'Mande o código para os outros jogadores. A partida precisa de pelo menos 2.'
      : room.count != null ? 'Quem cancelar o pronto interrompe a contagem.'
      : waitingFor ? `Falta ${waitingFor} jogador${waitingFor > 1 ? 'es' : ''} ficar pronto. Cabem até ${MAX_PLAYERS}.` : '';
  }

  function toggleRoomReady() {
    if (L.mode === 'host') {
      L.hostReady = !L.hostReady;
      roomChanged();
    } else if (L.conn && L.conn.open && L.room) {
      const mine = L.room.players.find(p => p.name === L.myRoomName);
      L.conn.send({ t: 'tft-ready', ready: !(mine && mine.ready) });
    }
  }

  const sendGame = act => {
    if (L.mode === 'guest') { if (L.conn && L.conn.open) L.conn.send({ t: 'tft-act', a: act }); }
    else hostAct(0, act);
  };

  /* ---------- Anfitrião: fluxo do jogo ---------- */
  function startBotGame() {
    const seed = Math.floor(Math.random() * 4294967296);
    L.skins = E.applyCollection(E.buildSkins([L.roster], seed), TFTCollection.pins());
    L.mode = 'bot';
    beginMatch([myName(), 'Bot Kakera'], [false, true], seed);
  }

  function startChaosGame() {
    const seed = Math.floor(Math.random() * 4294967296);
    L.skins = E.applyCollection(E.buildSkins([L.roster], seed), TFTCollection.pins());
    L.mode = 'bot';
    L.viewer = 0;
    L.scout = null;
    L.g = E.createChaosGame({ name: myName(), seed, skins: L.skins });
    openGame();
    E.nextRound(L.g);
    enterPhase();
    stopLoop();
    L.timerLoop = setInterval(hostTick, 200);
  }

  function startRoomGame() {
    const seed = Math.floor(Math.random() * 4294967296);
    const guests = [...L.guests.values()].filter(g => g.name);
    guests.forEach((g, i) => { g.idx = i + 1; });
    const skins = E.buildSkins([L.roster, ...guests.map(g => g.roster)], seed);
    // as fotos vão para cada convidado: limita o peso da mensagem de início
    const kept = withinPhotoBudget(Object.entries(skins).map(([id, s]) => ({ ...s, id })));
    const shared = Object.fromEntries(kept.map(({ id, ...s }) => [id, s]));
    // cada um aplica a própria coleção: os convidados recebem só o sorteio
    L.skins = E.applyCollection(shared, TFTCollection.pins());
    L.inMatch = true;
    guests.forEach(g => { if (g.conn.open) g.conn.send({ t: 'tft-start', skins: shared, viewer: g.idx }); });
    beginMatch([L.hostName, ...guests.map(g => g.name)], [], seed);
  }

  function beginMatch(names, bots, seed) {
    L.viewer = 0;
    L.scout = null;
    L.g = E.createGame({ names, seed, bots, skins: L.skins });
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
      setDeadline(g.mode === 'chaos' ? 86400 : E.RULES.planSeconds); // no caos não há cronômetro
      runBots();
    } else if (g.phase === 'carousel') {
      setDeadline(E.RULES.carouselSeconds);
      runBots();
    }
    broadcastState();
    if (allDecided()) advance();
  }

  function setDeadline(sec) {
    L.deadline = Date.now() + sec * 1000;
    L.totalTime = sec;
  }

  function runBots() {
    const g = L.g;
    g.players.forEach((p, i) => {
      if (!p.bot || !p.alive) return;
      if (g.phase === 'carousel') E.botCarousel(g, i);
      else E.botPlan(g, i);
    });
  }

  function allDecided() {
    const g = L.g;
    if (!g) return false;
    const alive = g.players.filter(p => p.alive);
    if (g.phase === 'plan') return alive.every(p => p.ready);
    if (g.phase === 'carousel') return alive.every(p => p.picked);
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
      // cada um recebe só o próprio combate; quem saiu da partida acompanha o primeiro
      for (const guest of L.guests.values()) {
        if (guest.idx == null || !guest.conn.open) continue;
        const v = E.viewFor(g, guest.idx);
        if (v) guest.conn.send({ t: 'tft-combat', view: v.view, flip: v.flip, spectate: v.spectate });
      }
      setDeadline(Math.max(...combat.fights.map(f => f.duration)) + SUMMARY_SECONDS);
      broadcastState();
      const mine = E.viewFor(g, 0);
      if (mine) startPlayback(mine.view, mine.flip, mine.spectate);
    } else if (g.phase === 'combat') {
      E.finishCombat(g);
      if (g.phase === 'end') {
        stopLoop();
        broadcastState();
        finishMatch();
        return;
      }
      enterPhase();
    }
  }

  /* fim da partida: a sala continua aberta e volta a esperar todos ficarem prontos */
  function finishMatch() {
    if (L.mode !== 'host') return;
    L.inMatch = false;
    L.hostReady = false;
    for (const g of L.guests.values()) { g.ready = false; g.idx = null; }
    publishRoom();
  }

  function hostTick() {
    if (!L.g || L.g.phase === 'end') return;
    if (Date.now() >= L.deadline) advance();
    else if (allDecided()) advance();
  }

  function hostAct(who, action) {
    const g = L.g;
    if (!g || !action || typeof action !== 'object') return;
    const err = E.act(g, who, action);
    if (err) {
      if (who === 0) toast(err);
      else for (const guest of L.guests.values()) if (guest.idx === who && guest.conn.open) guest.conn.send({ t: 'tft-err', text: err });
    }
    broadcastState();
  }

  function broadcastState() {
    const g = L.g;
    const left = Math.max(0, (L.deadline - Date.now()) / 1000);
    for (const guest of L.guests.values()) {
      if (guest.idx != null && guest.conn.open) guest.conn.send({ t: 'tft-state', st: E.publicState(g, guest.idx), left, total: L.totalTime });
    }
    applyState(E.publicState(g, 0), left, L.totalTime);
  }

  /* quem aparece como "o rival" na tela: o que você escolheu na lista, ou o próximo duelo */
  function pickRival(st) {
    const others = st.players.filter(p => p.i !== st.viewer);
    const scouted = L.scout != null ? others.find(p => p.i === L.scout) : null;
    if (scouted) return scouted;
    if (st.opponent) return st.players[st.opponent.i];
    return others.find(p => p.alive) || others[0];
  }

  function applyState(st, left, total) {
    const prevRound = L.st && L.st.round && L.st.round.label;
    const prevPhase = L.st && L.st.phase;
    const wasAlive = !L.st || L.st.you.alive;
    if (st.round && st.round.label !== prevRound) L.scout = null;
    st.rival = pickRival(st);
    L.st = st;
    L.deadline = Date.now() + (left || 0) * 1000;
    L.totalTime = total || 1;
    // terminou o combate: volta a mostrar o campo de planejamento
    if (st.phase !== 'combat' && L.playing) stopPlayback();
    if (prevPhase === 'combat' && st.phase !== 'combat') {
      if (L.summaryAuto) hideSummary();
      showResult(st.you.lastResult);
    }
    render();
    showUnitChanges(st);
    if (st.round && st.round.label !== prevRound && st.round.type !== 'carousel' && st.you.alive) announceRound(st);
    if (wasAlive && !st.you.alive && st.phase !== 'end') {
      showBanner(`Você terminou em ${st.you.placement}º. Pode acompanhar a partida ou sair.`, 'bad');
    }
    if (st.phase === 'end') showMatchEnd(st);
  }

  function showMatchEnd(st) {
    const place = st.you.placement;
    const title = st.winner === -1 && place === 1 ? 'Empate!' : place === 1 ? 'Vitória!' : st.players.length === 2 ? 'Derrota' : `${place}º lugar`;
    showEnd(title, `Fim na rodada ${st.round.label}.`, st.players);
  }

  /* ---------- Abrir / sair ---------- */
  function openGame() {
    byId('lobby').hidden = true;
    byId('game').hidden = false;
    byId('endScreen').hidden = true;
    if (!L.timerStarted) { L.timerStarted = true; requestAnimationFrame(updateTimer); }
  }

  function resetMatchView() {
    stopLoop();
    stopPlayback();
    hideSummary();
    Object.assign(L, { g: null, st: null, snap: new Map(), lastFight: null, scout: null });
    byId('btnLastFight').hidden = true;
    byId('game').hidden = true;
    byId('endScreen').hidden = true;
    byId('carousel').hidden = true;
    byId('lobby').hidden = false;
    lobbyStatus('');
  }

  function leaveGame() {
    closeNet();
    L.mode = null;
    resetMatchView();
    renderRoom();
  }

  /* volta à sala de espera, sem desconectar */
  function backToRoom() {
    if (L.mode === 'guest') L.inMatch = false;
    resetMatchView();
    renderRoom();
  }

  function showEnd(title, text, standings) {
    const el = byId('endScreen');
    const inRoom = L.mode === 'host' || L.mode === 'guest';
    const table = standings ? `<ol class="standings">${standings.slice().sort((a, b) => a.placement - b.placement).map(p => `
      <li class="${p.i === L.st.viewer ? 'me' : ''}"><b>${p.placement}º</b><span>${esc(p.name)}${p.left ? ' <em>(saiu)</em>' : ''}</span><i>${p.hp}</i></li>`).join('')}</ol>` : '';
    el.hidden = false;
    el.innerHTML = `<div class="end-box"><h2>${esc(title)}</h2><p>${esc(text)}</p>${table}
      <div class="end-actions">
        ${L.mode === 'bot' ? '<button class="btn primary" id="btnAgain">JOGAR DE NOVO</button>' : ''}
        ${standings && inRoom ? '<button class="btn primary" id="btnBackRoom">VOLTAR À SALA</button>' : ''}
        <button class="btn" id="btnEndLeave">${inRoom ? 'SAIR DA SALA' : 'VOLTAR'}</button>
      </div></div>`;
    byId('btnEndLeave').addEventListener('click', leaveGame);
    const again = byId('btnAgain');
    if (again) again.addEventListener('click', L.g && L.g.mode === 'chaos' ? startChaosGame : startBotGame);
    const back = byId('btnBackRoom');
    if (back) back.addEventListener('click', backToRoom);
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
  /* ícone de trait; aceso quando a trait já está no seu campo */
  const traitChips = (c, showNames = true) => {
    const mine = new Set(L.st ? L.st.you.traits.map(t => t.name) : []);
    return champOf(c).traits.map(name => `<i class="trait-chip ${mine.has(name) ? 'have' : ''}" data-tip="trait:${esc(name)}"><img src="${esc(asset(E.TRAITS[name].icon))}" alt="" draggable="false">${showNames ? `<span>${esc(name)}</span>` : ''}</i>`).join('');
  };
  const isMelee = range => range <= 2;
  /* traits na peça; douradas quando a trait está ativa no seu campo */
  const unitTraits = (c, mine = true) => {
    const active = new Set(mine && L.st ? L.st.you.traits.filter(t => t.active).map(t => t.name) : []);
    return `<div class="unit-traits">${champOf(c).traits.map(name => `<i class="${active.has(name) ? 'on' : ''}"><img src="${esc(asset(E.TRAITS[name].icon))}" alt="${esc(name)}" draggable="false"></i>`).join('')}</div>`;
  };
  const attrStrip = s => `<div class="attr-strip"><b class="s-ad">${s.ad}</b><b class="s-ap">${s.ap}</b></div>`;
  const ownStats = u => L.preview[u.uid] || E.previewUnit(u.c, u.star, u.items);

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
    return `<div class="unit mine cost${ch.cost} star${u.star}" style="${hexStyle(dc, dr)}" data-uid="${u.uid}" ${opts.drag ? `data-drag="${opts.drag}"` : ''} data-drop="${opts.drop}" data-tip="own:${u.uid}">
      <div class="hexpic">${portrait(u.c)}</div>
      ${stars(u.star)}${unitTraits(u.c)}${attrStrip(ownStats(u))}
      <div class="unit-items">${u.items.map(i => itemIcon(i)).join('')}</div>
    </div>`;
  }

  /* ---------- Render geral ---------- */
  function render() {
    const st = L.st;
    if (!st) return;
    L.preview = E.previewBoard(st.you.board, st.you.chrome);
    renderHeader(st);
    renderTraits(st);
    renderItems(st);
    renderAugments(st);
    if (!L.playing) renderBoard(st);
    renderBench(st);
    renderShop(st);
    renderCarousel(st);
    renderLog(st);
    renderPlayerList(st);
    byId('game').classList.toggle('spectating', !st.you.alive);
  }

  /* todos os jogadores por Vida; clicar escolhe de quem ver as traits */
  function renderPlayerList(st) {
    const list = st.players.slice().sort((a, b) => (b.alive - a.alive) || (b.hp - a.hp) || ((a.placement || 0) - (b.placement || 0)));
    byId('playerList').innerHTML = list.map(p => {
      const me = p.i === st.viewer;
      const next = st.opponent && st.opponent.i === p.i;
      return `<button type="button" class="player-row ${me ? 'me' : ''} ${p.alive ? '' : 'out'} ${!me && st.rival && st.rival.i === p.i ? 'scouted' : ''}" ${me ? 'disabled' : `data-scout="${p.i}"`} title="${me ? 'Você' : `Ver as traits de ${esc(p.name)}`}">
        <span class="player-name">${next ? '<i class="next-mark" title="Próximo duelo">⚔</i>' : ''}${esc(p.name)}</span>
        <em>${p.alive ? p.hp : `${p.placement}º`}</em>
        <span class="player-hp"><i style="width:${Math.max(0, p.hp)}%"></i></span>
      </button>`;
    }).join('');
  }

  function chipHtml(p, own) {
    const pct = L.st && L.st.mode === 'chaos' ? Math.max(0, (p.hp / (own ? 3 : 30)) * 100) : Math.max(0, p.hp);
    const streak = p.streak ? `<span class="streak ${p.streak > 0 ? 'hot' : 'cold'}">${p.streak > 0 ? '🔥' : '❄'} ${Math.abs(p.streak)}</span>` : '';
    return `<div class="chip-top"><b>${esc(p.name)}</b>${streak}<span class="chip-meta">Nv ${p.level} · ${p.gold}g${p.ready ? ' · PRONTO' : ''}</span></div>
      <div class="hp-bar ${own ? 'own' : ''}"><i style="width:${pct}%"></i><span>${p.hp}</span></div>`;
  }

  const ROUND_ICON = { pvp: '⚔', pve: '🐾', carousel: '🎁', chaos: '🦉', boss: '💀' };
  function renderHeader(st) {
    byId('chipYou').innerHTML = chipHtml(st.you, true);
    byId('chipRival').innerHTML = chipHtml(st.rival, false);
    const r = st.round;
    if (!r) return;
    const phaseName = { plan: 'Planejamento', carousel: 'Carrossel', combat: 'Combate', end: 'Fim' }[st.phase] || '';
    byId('roundLabel').textContent = st.mode === 'chaos'
      ? `Caos ${r.label} · ${st.chaos.roundName} · ${st.chaos.lives} vidas · ${st.chaos.score.toLocaleString('pt-BR')} pts`
      : `Rodada ${r.label} · ${phaseName}`;
    const count = st.mode === 'chaos' ? 10 : r.stage === 1 ? 4 : 7;
    let track = '';
    for (let n = 1; n <= count; n++) {
      const idx = st.mode === 'chaos' ? (r.stage - 1) * 10 + (n - 1) : r.stage === 1 ? n - 1 : 4 + (r.stage - 2) * 7 + (n - 1);
      const info = E.roundInfo(idx, st.mode);
      track += `<span class="pip ${n === r.n ? 'now' : n < r.n ? 'done' : ''}" title="${info.label}">${ROUND_ICON[info.type]}</span>`;
    }
    byId('roundTrack').innerHTML = track;
  }

  function updateTimer() {
    if (!byId('game').hidden && L.st) {
      const left = Math.max(0, L.deadline - Date.now()) / 1000;
      byId('timerBar').style.width = `${Math.min(100, (left / (L.totalTime || 1)) * 100)}%`;
      const btn = byId('btnReady');
      if (L.st.phase === 'plan') btn.textContent = L.st.mode === 'chaos' ? 'LUTAR!' : `${L.st.you.ready ? 'AGUARDANDO' : 'PRONTO'} · ${Math.ceil(left)}s`;
      if (L.st.phase === 'carousel') btn.textContent = `ESCOLHA · ${Math.ceil(left)}s`;
      if (L.st.phase === 'combat') btn.textContent = 'EM COMBATE';
    }
    requestAnimationFrame(updateTimer);
  }

  /* ---------- Aumentos ---------- */
  const TIER_NAME = { 1: 'Prata', 2: 'Ouro', 3: 'Prismático' };
  const augIcon = (id, extra = '') => {
    const a = E.AUG[id];
    return `<img class="aug-icon tier${a.tier}" src="${esc(asset(a.icon))}" alt="" draggable="false" ${extra}>`;
  };
  function renderAugments(st) {
    const list = byId('augList');
    const owned = st.you.augments || [];
    list.innerHTML = owned.length
      ? owned.map(id => `<span class="aug-chip tier${E.AUG[id].tier}" data-tip="aug:${esc(id)}">${augIcon(id)}<small>${esc(E.AUG[id].name)}</small></span>`).join('')
      : `<p class="empty">Escolhas em ${st.mode === 'chaos' ? '1-5, 2-5 e 3-5' : '2-1, 3-2 e 4-2'}.</p>`;
    const box = byId('augPick');
    const offer = st.you.offer;
    const choice = st.you.choices && st.you.choices[0];
    if (!offer && !choice) L.augHidden = false;
    const open = !L.augHidden && (offer || choice);
    box.hidden = !open;
    byId('augReopen').hidden = !(L.augHidden && (offer || choice));
    if (!open) return;
    if (offer) {
      box.innerHTML = `<div class="aug-box"><h2>Escolha um aumento <small class="tier${offer.tier}">${TIER_NAME[offer.tier]}</small></h2>
        <div class="aug-cards">${offer.opts.map((id, i) => {
          const a = E.AUG[id];
          return `<div class="aug-card tier${a.tier}"><button type="button" class="aug-pick-btn" data-augment="${i}">${augIcon(id)}<b>${esc(a.name)}</b><span>${esc(a.desc)}</span></button>
            <button type="button" class="btn small" data-aug-reroll="${i}" ${offer.rerolled[i] ? 'disabled' : ''}>ATUALIZAR</button></div>`;
        }).join('')}</div>
        <button class="link-btn" data-aug-hide>Ver o tabuleiro antes de decidir</button></div>`;
    } else {
      box.innerHTML = `<div class="aug-box"><h2>${esc(choice.title)}</h2>
        <div class="aug-cards">${choice.opts.map((id, i) => `<button type="button" class="aug-card aug-pick-btn" data-choose="${i}"><span class="item">${E.ITEMS[id] ? `<img src="${esc(asset(E.ITEMS[id].icon))}" alt="">` : ''}</span><b>${esc(E.ITEMS[id].name)}</b></button>`).join('')}</div>
        <button class="link-btn" data-aug-hide>Ver o tabuleiro antes de decidir</button></div>`;
    }
  }

  function renderTraits(st) {
    byId('traitList').innerHTML = traitListHtml(st.you.traits, 'Coloque unidades em campo para ativar traits.');
    byId('rivalTraitsTitle').textContent = `TRAITS DE ${st.rival.name.toUpperCase()}`;
    byId('rivalTraits').innerHTML = traitListHtml(st.rival.traits, 'Nenhuma unidade em campo.', 'rival');
  }
  /* cor da faixa como no TFT: bronze, prata, ouro e, na última de 4 ou mais, prismática */
  function tierClass(tiers, count) {
    let idx = -1;
    tiers.forEach((n, i) => { if (count >= n) idx = i; });
    if (idx < 0) return 'tier-off';
    if (tiers.length === 1) return 'tier-gold';
    if (tiers.length >= 4 && idx === tiers.length - 1) return 'tier-prism';
    const pos = idx / (tiers.length - (tiers.length >= 4 ? 2 : 1));
    return pos >= 1 ? 'tier-gold' : pos >= 0.5 ? 'tier-silver' : 'tier-bronze';
  }
  function traitListHtml(list, emptyText, owner = 'you') {
    return list.length ? list.map(t => {
      // próxima faixa a alcançar, como o "2/4" do TFT
      const next = t.tiers.find(n => n > t.count);
      const current = t.tiers.filter(n => n <= t.count).pop();
      return `
      <div class="trait ${t.active ? 'on' : ''} ${tierClass(t.tiers, t.count)}" data-tip="trait:${esc(t.name)}:${t.count}:${owner}">
        <span class="trait-hex"><img src="${esc(asset(E.TRAITS[t.name].icon))}" alt="" draggable="false"></span>
        <b>${esc(t.name)}</b>
        <em>${t.count}${next ? `/${next}` : ''}</em>
        <span class="trait-steps">${t.tiers.map(n => `<i class="${n === current ? 'cur' : n < t.count ? 'hit' : ''}">${n}</i>`).join('<u>›</u>')}</span>
      </div>`;
    }).join('') : `<p class="empty">${esc(emptyText)}</p>`;
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
    const foeNote = st.mode === 'chaos' ? `Próximo desafio: ${esc(st.chaos.roundName)}` : !st.you.alive ? 'Você está acompanhando a partida' : st.opponent ? `Próximo duelo: ${st.opponent.ghost ? 'Fantasma de ' : ''}${esc(st.players[st.opponent.i].name)}. Tabuleiro oculto até o combate` : 'Tabuleiros dos outros jogadores ocultos até o combate';
    html += `<div class="foe-note">${foeNote}</div>`;
    board.innerHTML = html;
  }

  function renderBench(st) {
    byId('bench').innerHTML = st.you.bench.map((u, i) => (u
      ? `<div class="bench-slot" data-drop="b:${i}"><div class="unit bench-unit cost${champOf(u.c).cost} star${u.star} mine" data-uid="${u.uid}" data-drag="b:${i}" data-drop="b:${i}" data-tip="own:${u.uid}">
          <div class="hexpic">${portrait(u.c)}</div>${stars(u.star)}${unitTraits(u.c)}${attrStrip(ownStats(u))}<div class="unit-items">${u.items.map(id => itemIcon(id)).join('')}</div></div></div>`
      : `<div class="bench-slot" data-drop="b:${i}"></div>`)).join('');
  }

  function renderShop(st) {
    const you = st.you;
    byId('goldBox').innerHTML = `<i class="coin"></i><b>${you.gold}</b>`;
    const interest = Math.min(5, Math.floor(you.gold / 10));
    byId('interestBox').innerHTML = `Juros <b>+${interest}</b>`;
    const fielded = Object.keys(you.board).length;
    byId('fieldCount').innerHTML = `Em campo <b>${fielded}/${you.level}</b>`;
    // barra de XP em blocos, como no TFT (muitos blocos viram uma barra contínua)
    const segs = you.xpNext ? Math.min(12, Math.ceil(you.xpNext / 2)) : 1;
    const filled = you.xpNext ? (you.xp / you.xpNext) * segs : segs;
    byId('levelBox').innerHTML = `<div class="level-top"><b>Nv. ${you.level}</b><span>${you.xpNext ? `${you.xp}/${you.xpNext}` : 'Máx.'}</span></div>
      <div class="xp-bar">${Array.from({ length: segs }, (_, i) => `<i><u style="width:${Math.max(0, Math.min(1, filled - i)) * 100}%"></u></i>`).join('')}</div>`;
    byId('oddsBox').innerHTML = E.RULES.odds[you.level].map((v, i) => `<span class="odd cost${i + 1} ${v ? '' : 'zero'}"><i class="odd-mark m${i + 1}"></i>${v}%</span>`).join('');
    byId('btnXp').innerHTML = `<b>Comprar EXP</b><small><i class="coin"></i>${E.RULES.xpCost}</small><em>⏫</em>`;
    byId('btnReroll').innerHTML = `<b>Atualizar</b><small><i class="coin"></i>${E.RULES.rerollCost}</small><em>⟳</em>`;
    byId('btnXp').disabled = you.gold < E.RULES.xpCost || you.level >= E.RULES.maxLevel;
    byId('btnReroll').disabled = you.gold < E.RULES.rerollCost;
    byId('btnLock').textContent = you.locked ? '🔒' : '🔓';
    byId('btnLock').title = you.locked ? 'Loja travada: não atualiza na próxima rodada. Clique para destravar.' : 'Travar a loja: mantém estas cartas na próxima rodada.';
    byId('btnLock').setAttribute('aria-label', byId('btnLock').title);
    byId('btnLock').classList.toggle('on', you.locked);
    byId('btnReady').disabled = st.phase !== 'plan';
    byId('btnReady').classList.toggle('on', you.ready);
    const owned = [...you.bench.filter(Boolean), ...Object.values(you.board)];
    byId('shop').innerHTML = (you.shop || []).map((c, i) => {
      if (!c) return '<div class="shop-card empty-card"></div>';
      const ch = champOf(c);
      const cant = you.gold < ch.cost;
      // quantas cópias já tem: a próxima compra evolui?
      const ones = owned.filter(u => u.c === c && u.star === 1).length;
      const twos = owned.filter(u => u.c === c && u.star === 2).length;
      const evolves = ones === 2;
      const copyTag = evolves
        ? `<span class="copy-tag evolve">EVOLUI ${twos === 2 ? '★★★' : '★★'}</span>`
        : ones === 1 ? '<span class="copy-tag">2/3</span>' : '';
      return `<button type="button" class="shop-card cost${ch.cost} ${cant ? 'cant' : ''} ${evolves ? 'evolves' : ''}" data-buy="${i}" data-tip="unit:${esc(c)}:1:">
        ${portrait(c)}
        <span class="shop-traits">${traitChips(c)}</span>
        ${copyTag}
        <span class="shop-foot"><b>${esc(displayName(c))}</b><span class="shop-cost"><i class="coin"></i>${ch.cost}</span></span>
      </button>`;
    }).join('');
  }

  function renderCarousel(st) {
    const el = byId('carousel');
    const opts = st.you.carousel;
    if (st.phase !== 'carousel' || !opts) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<div class="carousel-box"><h2>🎁 Carrossel</h2><p>${st.you.picked ? 'Aguardando os outros jogadores…' : 'Escolha uma unidade com um componente.'}</p>
      <div class="carousel-opts">${opts.map((o, i) => {
        const ch = champOf(o.c);
        return `<button type="button" class="carousel-opt cost${ch.cost} ${o.taken ? 'taken' : ''}" data-pick="${i}" ${st.you.picked ? 'disabled' : ''} data-tip="unit:${esc(o.c)}:1:">
          ${portrait(o.c)}
          <span class="carousel-name">${esc(displayName(o.c))}</span>
          <span class="carousel-traits">${traitChips(o.c)}</span>
          <span class="carousel-item">${itemIcon(o.item)} ${esc(E.ITEMS[o.item].name)}</span>
        </button>`;
      }).join('')}</div></div>`;
  }

  function renderLog(st) {
    byId('logList').innerHTML = st.log.slice().reverse().map(t => `<li>${esc(t)}</li>`).join('') || '<li class="empty">Nenhum combate ainda.</li>';
  }

  function announceRound(st) {
    const r = st.round;
    const foe = st.opponent ? `${st.opponent.ghost ? 'Fantasma de ' : ''}${st.players[st.opponent.i].name}` : '';
    const type = st.mode === 'chaos' ? st.chaos.roundName : r.type === 'pvp' ? `Duelo contra ${foe}` : 'Monstros: rende itens e ouro';
    showBanner(`${r.label} · ${type}`, 'info');
  }
  function showResult(res) {
    if (!res) return;
    const lootTxt = res.loot ? [res.loot.gold ? `+${res.loot.gold}g` : '', ...res.loot.items.map(i => E.ITEMS[i].name)].filter(Boolean).join(' · ') : '';
    const main = res.res === 'win' ? 'Vitória' : res.res === 'draw' ? `Empate · −${res.dmg} de Vida` : `Derrota · −${res.dmg} de Vida`;
    showBanner(lootTxt ? `${main} · Saque: ${lootTxt}` : main, res.res === 'win' ? 'good' : 'bad');
  }
  const bannerQueue = [];
  let bannerBusy = false;
  function showBanner(text, kind) {
    bannerQueue.push({ text, kind });
    if (!bannerBusy) nextBanner();
  }
  function nextBanner() {
    const el = byId('banner');
    const item = bannerQueue.shift();
    if (!item) { bannerBusy = false; el.hidden = true; return; }
    bannerBusy = true;
    el.textContent = item.text;
    el.className = `banner ${item.kind}`;
    el.hidden = false;
    setTimeout(nextBanner, item.kind === 'info' ? 1500 : 2600);
  }

  /* ---------- Evolução e itens: mostra o que mudou na unidade ---------- */
  const DELTA_KEYS = [['hp', 'Vida', 's-hp'], ['ad', 'DA', 's-ad'], ['ap', 'PH', 's-ap'], ['armor', 'Arm', 's-arm'], ['mr', 'RM', 's-mr'], ['as', 'VA', 's-as'], ['crit', 'Crít', 's-as']];
  function popOver(el, text, cls, step) {
    const r = el.getBoundingClientRect();
    const p = document.createElement('span');
    p.className = `stat-pop ${cls}`;
    p.textContent = text;
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + 4 - step * 15}px`;
    p.style.animationDelay = `${step * 60}ms`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1700);
  }
  function showUnitChanges(st) {
    const units = [...st.you.bench.filter(Boolean), ...Object.values(st.you.board)];
    const next = new Map();
    for (const u of units) {
      const key = `${u.star}|${u.items.join('+')}`;
      next.set(u.uid, key);
      const before = L.snap.get(u.uid);
      if (!before || before.key === key) continue;
      const el = document.querySelector(`[data-uid="${u.uid}"]`);
      if (!el) continue;
      if (u.star > before.star) {
        el.classList.add('evolving');
        showBanner(`${'★'.repeat(u.star)} ${displayName(u.c)} evoluiu!`, 'evolve');
      }
      // comparação sem traits: mostra só o efeito da evolução ou do item
      const was = E.previewUnit(u.c, before.star, before.items);
      const now = E.previewUnit(u.c, u.star, u.items);
      let step = 0;
      for (const [k, label, cls] of DELTA_KEYS) {
        const d = Math.round((now[k] - was[k]) * 100) / 100;
        if (!d) continue;
        popOver(el, `${d > 0 ? '+' : ''}${d}${k === 'crit' ? '%' : ''} ${label}`, `${cls} ${d < 0 ? 'loss' : ''}`, step++);
      }
    }
    L.snap = new Map(units.map(u => [u.uid, { key: next.get(u.uid), star: u.star, items: u.items.slice() }]));
  }

  /* ---------- Reprodução do combate ---------- */
  function startPlayback(view, flip, spectate = false) {
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
        el.className = `unit fight cost${champOf(m.champ).cost} star${m.star} ${mine ? 'mine' : 'enemy'}`;
        el.style.cssText = hexStyle(dc, dr);
        el.innerHTML = `<div class="bars"><i class="hp"></i><i class="sh"></i><b class="mp"></b></div><div class="hexpic">${portrait(m.champ)}</div>${stars(m.star)}${unitTraits(m.champ, mine)}${attrStrip(m.stats)}<div class="unit-items">${(m.items || []).map(i => itemIcon(i)).join('')}</div>`;
        el.dataset.tip = `meta:${m.id}`;
      } else {
        const d = E.CREEPS[m.creep];
        const [dc, dr] = place(row[2], row[1]);
        el.className = `unit fight creep ${mine ? 'mine' : 'enemy'}`;
        el.style.cssText = hexStyle(dc, dr);
        el.dataset.tip = `meta:${m.id}`;
        el.innerHTML = `<div class="bars"><i class="hp"></i><i class="sh"></i><b class="mp"></b></div><div class="hexpic creep-face">${d.icon}</div>`;
      }
      board.appendChild(el);
      els.set(row[0], el);
    }

    const pb = { view, flip, els, metas, mySide, start: performance.now(), frame: -1, raf: 0, ended: false };
    L.playing = pb;
    TFTFx.begin(board, { flip, els, metas });
    L.lastFight = { view, mySide, spectate };
    hideSummary();
    renderEnemyPanel(pb);
    const step = now => {
      if (L.playing !== pb) return;
      const idx = Math.min(view.frames.length - 1, Math.floor((now - pb.start) / 100));
      while (pb.frame < idx) { pb.frame++; applyFrame(pb, view.frames[pb.frame]); }
      if (!pb.ended && pb.frame === view.frames.length - 1) {
        pb.ended = true;
        if (L.fxTest) { L.fxTest.onEnd(); pb.raf = requestAnimationFrame(step); return; }
        byId('btnLastFight').hidden = false;
        L.summaryAuto = true;
        renderSummary();
      }
      pb.raf = requestAnimationFrame(step);
    };
    pb.raf = requestAnimationFrame(step);
    // aba em segundo plano não anima: ainda assim o combate termina pelo relógio do anfitrião
  }

  function stopPlayback() {
    TFTFx.end();
    if (L.playing) cancelAnimationFrame(L.playing.raf);
    L.playing = null;
    byId('enemyPanel').hidden = true;
    byId('matchPanel').hidden = false;
  }

  /* ---------- Atributos do rival durante o combate ---------- */
  const metaName = m => (m.champ ? displayName(m.champ) : E.CREEPS[m.creep].name);
  const metaThumb = m => (m.champ ? `<span class="thumb cost${champOf(m.champ).cost}">${portrait(m.champ)}</span>` : `<span class="thumb creep-thumb">${E.CREEPS[m.creep].icon}</span>`);
  function renderEnemyPanel(pb) {
    const foes = pb.view.meta.filter(m => m.side !== pb.mySide);
    const title = pb.view.names[1 - pb.mySide];
    byId('enemyPanel').innerHTML = `<h2>${esc(title).toUpperCase()}</h2>
      ${foes.map(m => `<div class="foe-row" data-tip="meta:${m.id}">
        ${metaThumb(m)}
        <div class="foe-info">
          <b>${esc(metaName(m))}${m.champ ? ` ${stars(m.star)}` : ''}</b>
          ${m.champ ? `<span class="foe-icons">${traitChips(m.champ, false)}</span>` : ''}
          <span><b class="s-hp" data-l="Vd">${m.stats.hp}</b><b class="s-ad" data-l="DA">${m.stats.ad}</b><b class="s-ap" data-l="PH">${m.stats.ap}</b><b class="s-arm" data-l="Ar">${m.stats.armor}</b><b class="s-mr" data-l="RM">${m.stats.mr}</b><b class="s-as" data-l="VA">${m.stats.as}</b></span>
        </div></div>`).join('')}`;
    byId('enemyPanel').hidden = false;
    byId('matchPanel').hidden = true;
  }

  /* ---------- Gráficos do fim da luta ----------
     Uma barra por unidade, um painel (e uma escala) por medida. As cores
     passaram no validador de paleta contra o fundo --panel. */
  const CHARTS = [
    { key: 'dmg', title: 'Dano causado', series: [['p', 'Físico', 'c-phys'], ['m', 'Mágico', 'c-magic'], ['t', 'Verdadeiro', 'c-true']], fmt: v => Math.round(v).toLocaleString('pt-BR') },
    { key: 'def', title: 'Defesa: dano evitado e cura', series: [['reduced', 'Reduzido', 'c-reduced'], ['shield', 'Escudo', 'c-shield'], ['heal', 'Cura', 'c-heal']], fmt: v => Math.round(v).toLocaleString('pt-BR') },
    { key: 'cc', title: 'Controle de grupo: atordoamento', series: [['cc', 'Atordoamento', 'c-cc']], fmt: v => `${v.toFixed(1).replace('.', ',')}s`, empty: 'Ninguém atordoou nesta luta.' },
  ];
  const chartTotal = (m, c) => c.series.reduce((t, [k]) => t + (m.stat[k] || 0), 0);

  function chartPanel(c, view, mySide) {
    const max = Math.max(1, ...view.meta.map(m => chartTotal(m, c)));
    const any = view.meta.some(m => chartTotal(m, c) > 0);
    const rows = list => list.slice().sort((a, b) => chartTotal(b, c) - chartTotal(a, c)).map(m => {
      const total = chartTotal(m, c);
      const segs = c.series.map(([k, , cls]) => (m.stat[k] > 0 ? `<i class="${cls}" style="flex:${m.stat[k]} 0 0"></i>` : '')).join('');
      return `<div class="chart-row" data-tip="chart:${m.id}:${c.key}">
        ${metaThumb(m)}
        <span class="chart-name">${esc(metaName(m))}</span>
        <span class="chart-track"><span class="chart-bar" style="width:${(total / max) * 100}%">${segs}</span></span>
        <span class="chart-val">${total > 0 ? c.fmt(total) : '—'}</span>
      </div>`;
    }).join('');
    const mine = view.meta.filter(m => m.side === mySide);
    const foes = view.meta.filter(m => m.side !== mySide);
    const foeTitle = view.names[1 - mySide];
    return `<section class="chart" aria-label="${esc(c.title)}">
      <h3>${esc(c.title)}</h3>
      ${c.series.length > 1 ? `<div class="chart-legend">${c.series.map(([, label, cls]) => `<span><i class="${cls}"></i>${esc(label)}</span>`).join('')}</div>` : ''}
      ${any ? `<h4>${esc(view.names[mySide])}</h4>${rows(mine)}<h4>${esc(foeTitle)}</h4>${rows(foes)}` : `<p class="chart-empty">${esc(c.empty || 'Sem dados nesta luta.')}</p>`}
    </section>`;
  }

  function renderSummary() {
    const f = L.lastFight;
    if (!f) return;
    const { view, mySide, spectate } = f;
    const title = view.winner === -1 ? 'Empate' : spectate ? `${view.names[view.winner]} venceu` : view.winner === mySide ? 'Vitória' : 'Derrota';
    const loot = view.loot;
    const lootHtml = loot ? `<div class="summary-loot"><b>Saque:</b>${loot.gold ? `<span class="loot-gold">+${loot.gold}g</span>` : ''}${loot.items.map(id => `<span class="loot-item">${itemIcon(id)}${esc(E.ITEMS[id].name)}</span>`).join('')}</div>` : '';
    const el = byId('summary');
    el.innerHTML = `<div class="summary-head">
        <h2>${title}</h2>
        <span class="summary-meta">${view.duration.toFixed(1).replace('.', ',')}s de luta${view.winner !== -1 ? ` · ${view.survivors} ${view.survivors === 1 ? 'unidade viva' : 'unidades vivas'}` : ''}</span>
        <button class="btn small" data-close-summary>FECHAR</button>
      </div>
      ${lootHtml}
      <div class="charts">${CHARTS.map(c => chartPanel(c, view, mySide)).join('')}</div>`;
    el.hidden = false;
  }
  function hideSummary() { byId('summary').hidden = true; }

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
    const highFx = TFTFx.isOn();
    if (highFx) TFTFx.event(ev);
    if (kind === 'x') { if (pb.metas.get(id).creep) floatText(el, '✦ saque', 'lootfx'); }
    else if (kind === 'd') floatText(el, String(a), `dmg-${b}${c ? ' crit' : ''}`);
    else if (kind === 'h') floatText(el, `+${a}`, 'heal');
    else if (kind === 'g') floatText(el, '+1g', 'goldfx');
    else if (kind === 'c') { el.classList.remove('casting'); void el.offsetWidth; el.classList.add('casting'); }
    else if (kind === 'a') {
      const to = pb.els.get(a);
      if (to && !highFx) shot(el, to, b);
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

  function nearestOwnHex(px, py, under) {
    if (L.playing || !under.closest('.board-wrap')) return null;
    const b = byId('board').getBoundingClientRect();
    let best = null, bd = Infinity;
    for (let dr = 0; dr < 4; dr++) {
      for (let dc = 0; dc < 7; dc++) {
        const p = hexPos(dc, dr);
        const cx = b.left + (b.width * (p.left + 100 / BOARD_W / 2)) / 100;
        const cy = b.bottom - (b.height * (p.bottom + (1.1547 / BOARD_H) * 50)) / 100;
        const d = Math.hypot(px - cx, py - cy);
        if (d < bd) { bd = d; best = { x: dc, y: 3 - dr }; }
      }
    }
    return best;
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
    if (drop && drop.dataset.drop === 'sell') return sendGame({ a: 'sell', uid });
    const to = drop ? parseSpot(drop.dataset.drop) : nearestOwnHex(ev.clientX, ev.clientY, under);
    if (to) sendGame({ a: 'move', from: parseSpot(src), to });
  }

  /* ---------- Dicas ---------- */
  /* atributos com a cor de cada um; base = sem itens nem traits, para mostrar o ganho */
  function statsBlock(s, base) {
    const row = (label, k, cls, suffix = '') => {
      const d = base ? Math.round((s[k] - base[k]) * 100) / 100 : 0;
      return `<span>${label} <b class="${cls}">${s[k]}${suffix}</b>${d ? `<em class="${d > 0 ? 'gain' : 'loss'}">${d > 0 ? '+' : ''}${d}</em>` : ''}</span>`;
    };
    return `<div class="tip-stats">${row('Vida', 'hp', 's-hp')}${row('DA', 'ad', 's-ad')}${row('PH', 'ap', 's-ap')}${row('Arm', 'armor', 's-arm')}${row('RM', 'mr', 's-mr')}${row('VA', 'as', 's-as')}${row('Crít', 'crit', 's-as', '%')}${row('Alcance', 'range', '')}${s.maxMana ? `<span>Mana <b class="s-mana">${s.mana}/${s.maxMana}</b></span>` : ''}</div>`;
  }
  /* DA e PH sempre com a própria cor, também nos textos */
  const colorStats = html => html
    .replace(/(\d+%? )?\bDA\b/g, m => `<b class="s-ad">${m}</b>`)
    .replace(/(\d+ )?\bPH\b/g, m => `<b class="s-ap">${m}</b>`);

  function unitTip(c, star, items, cur, base, extra = '') {
    const ch = champOf(c);
    const s = skinOf(c);
    return `<h4>${esc(displayName(c))} ${stars(star)}</h4>
      ${s ? `<p class="tip-sub">${esc(s.series)}${s.series ? ' · ' : ''}${Number(s.kakera).toLocaleString('pt-BR')} kakera · kit: ${esc(ch.name)}</p>` : ''}
      <p class="tip-line">Custo ${ch.cost} · ${isMelee(ch.range) ? '⚔ Corpo a corpo' : '🏹 À distância'}</p>
      <div class="tip-traits">${traitChips(c)}</div>
      ${statsBlock(cur, base)}
      <p><b>${esc(ch.abilityName)}:</b> ${colorStats(esc(E.abilityText(ch.name, star)))}</p>
      ${items.length ? `<p class="tip-line">${items.map(i => esc(E.ITEMS[i] ? E.ITEMS[i].name : i)).join(' · ')}</p>` : ''}${extra}`;
  }
  function traitTip(name, countText, owner) {
    const t = E.TRAITS[name];
    const entry = L.st.you.traits.find(x => x.name === name);
    const isRival = owner === 'rival';
    const count = countText !== undefined && countText !== '' ? Number(countText) : entry ? entry.count : 0;
    const tiers = E.traitTiers(name);
    const current = tiers.filter(x => x.min <= count).pop();
    const onBoard = new Set(Object.values(L.st.you.board).map(u => u.c));
    const onBench = new Set(L.st.you.bench.filter(Boolean).map(u => u.c));
    const champs = E.D.champions.filter(c => c.traits.includes(name));
    return `<div class="trait-tip-head ${tierClass(t.tiers.map(x => x.min), count)}">
        <span class="trait-hex"><img src="${esc(asset(t.icon))}" alt=""></span>
        <h4>${esc(name)}</h4><em>${count} ${isRival ? 'do rival' : 'em campo'}</em>
      </div>
      <p>${colorStats(esc(E.TRAIT_TEXT[name] || ''))}</p>
      <ol class="tier-list">${tiers.map(x => `<li class="${x === current ? 'cur' : count >= x.min ? 'hit' : ''}"><b>(${x.min})</b><span>${colorStats(esc(x.text))}</span></li>`).join('')}</ol>
      <div class="trait-champs">${champs.map(c => {
        const state = isRival ? '' : onBoard.has(c.id) ? 'field' : onBench.has(c.id) ? 'bench' : '';
        return `<span class="trait-champ cost${c.cost} ${state}"><span class="thumb">${portrait(c.id)}</span><small>${esc(displayName(c.id))}</small><i>${c.cost}g</i></span>`;
      }).join('')}</div>
      ${isRival ? '<p class="tip-sub">As unidades do rival ficam ocultas até o combate.</p>' : '<p class="tip-sub">Contorno aceso: em campo. Tracejado: no banco.</p>'}`;
  }
  function metaById(id) {
    const f = (L.playing && L.playing.view) || (L.lastFight && L.lastFight.view);
    return f ? f.meta.find(m => m.id === id) : null;
  }
  /* receita em imagens: componente + componente = item */
  function recipeHtml(a, b, result) {
    const img = id => `<img src="${esc(asset(E.ITEMS[id].icon))}" alt="${esc(E.ITEMS[id].name)}">`;
    return `<span class="recipe">${img(a)}<i>+</i>${img(b)}<i>=</i>${img(result)}</span>`;
  }
  function tipFor(key) {
    const [kind, a, b, c] = key.split(':');
    if (kind === 'aug') {
      const aug = E.AUG[a];
      return aug ? `<h4>${esc(aug.name)}</h4><p class="tip-sub">${TIER_NAME[aug.tier]}</p><p>${esc(aug.desc)}</p>` : '';
    }
    if (kind === 'item') {
      const it = E.ITEMS[a];
      if (!it) return '';
      const fx = it.fx;
      const line = [
        fx.AD ? `+${Math.round(fx.AD * 100)}% DA` : '', fx.AP ? `+${fx.AP} PH` : '', fx.AS ? `+${fx.AS}% VA` : '', fx.Armor ? `+${fx.Armor} Arm` : '',
        fx.MagicResist ? `+${fx.MagicResist} RM` : '', fx.Health ? `+${fx.Health} Vida` : '', fx.CritChance ? `+${fx.CritChance}% Crít.` : '', fx.ManaRegen ? `+${fx.ManaRegen} Mana/s` : '',
      ].filter(Boolean).join(' · ');
      let recipes = '';
      if (it.from) {
        recipes = `<div class="tip-recipes single">${recipeHtml(it.from[0], it.from[1], it.id)}</div>`;
      } else if (!it.special) {
        recipes = `<div class="tip-recipes">${E.D.items.filter(x => x.from && x.from.includes(a)).map(x => {
          const other = x.from[0] === a ? x.from[1] : x.from[0];
          return recipeHtml(a, other, x.id);
        }).join('')}</div>`;
      }
      return `<h4>${esc(it.name)}</h4>${line ? `<p class="tip-line">${colorStats(esc(line))}</p>` : ''}${E.ITEM_TEXT[a] || it.text ? `<p>${colorStats(esc(E.ITEM_TEXT[a] || it.text))}</p>` : ''}${recipes}`;
    }
    if (kind === 'info') {
      const you = L.st.you;
      if (a === 'interest') {
        const now = Math.min(5, Math.floor(you.gold / 10));
        return `<h4>Juros: +${now} na próxima rodada</h4><p>+1 de ouro a cada 10 guardados, até +5.${now < 5 ? ` Faltam ${(now + 1) * 10 - you.gold} para +${now + 1}.` : ''}</p>`;
      }
      if (a === 'odds') return `<h4>Chance na loja no nível ${you.level}</h4><p>Probabilidade de cada carta ser de custo 1 a 5. Sobe conforme o nível.</p>`;
      if (a === 'xp') return `<h4>Nível ${you.level}</h4><p>${you.xpNext ? `Faltam ${you.xpNext - you.xp} de XP para o nível ${you.level + 1}. ` : ''}Você ganha ${E.RULES.roundXp} de XP por rodada, e o nível define quantas unidades ficam em campo.</p>`;
      return '';
    }
    if (kind === 'trait') {
      const t = E.TRAITS[a];
      if (!t) return '';
      return traitTip(a, b, c);
    }
    if (kind === 'unit') {
      const ch = champOf(a);
      if (!ch) return '';
      const star = Number(b) || 1;
      const items = c ? c.split('+').filter(Boolean) : [];
      return unitTip(a, star, items, E.previewUnit(a, star, items), null);
    }
    if (kind === 'own') {
      const u = findMine(Number(a));
      if (!u) return '';
      const owned = [...L.st.you.bench.filter(Boolean), ...Object.values(L.st.you.board)];
      const copies = owned.filter(x => x.c === u.c && x.star === u.star).length;
      const next = u.star < 3 ? `<p class="tip-sub">Evolução: ${copies}/3 cópias de ${stars(u.star)} para ${stars(u.star + 1)}</p>` : '';
      return unitTip(u.c, u.star, u.items, ownStats(u), E.previewUnit(u.c, u.star, []), next);
    }
    if (kind === 'meta') {
      const m = metaById(Number(a));
      if (!m) return '';
      if (m.champ) return unitTip(m.champ, m.star, m.items, m.stats, E.previewUnit(m.champ, m.star, []));
      return `<h4>${E.CREEPS[m.creep].icon} ${esc(E.CREEPS[m.creep].name)}</h4><p class="tip-line">${isMelee(m.stats.range) ? '⚔ Corpo a corpo' : '🏹 À distância'}</p>${statsBlock(m.stats)}`;
    }
    if (kind === 'chart') {
      const m = metaById(Number(a));
      const chart = CHARTS.find(x => x.key === b);
      if (!m || !chart) return '';
      return `<h4>${esc(metaName(m))}</h4><div class="tip-breakdown">${chart.series.map(([k, label, cls]) => `<span><i class="${cls}"></i>${esc(label)}<b>${chart.fmt(m.stat[k] || 0)}</b></span>`).join('')}</div>${b === 'dmg' ? `<p class="tip-sub">${m.stat.kills} abate(s)</p>` : ''}`;
    }
    return '';
  }
  function showTip(el, x, y) {
    const html = tipFor(el.dataset.tip);
    if (!html) return;
    const tip = byId('tip');
    tip.innerHTML = html;
    tip.classList.toggle('wide', el.dataset.tip.startsWith('trait:'));
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
      <h3>Peças</h3>
      <p>Os ícones nas peças são as traits, douradas quando ativas. Corpo a corpo, à distância e os atributos aparecem na dica ao passar o mouse. Na peça, <b class="s-ad">laranja</b> é Dano de Ataque (DA) e <b class="s-ap">roxo</b> é Poder de Habilidade (PH).</p>
      <h3>Economia</h3>
      <p>Renda de 5g por rodada, juros de 1g a cada 10g (até 5g), +1g por vitória em duelo e sequência (2-4: +1g, 5: +2g, 6+: +3g). Atualizar custa ${R.rerollCost}g e ${R.xpGain} XP custam ${R.xpCost}g. Atalhos: <b>D</b> atualiza, <b>F</b> compra XP.</p>
      <h3>Chance da loja por nível</h3>
      <table class="odds"><tr><th>Nv</th><th>1g</th><th>2g</th><th>3g</th><th>4g</th><th>5g</th></tr>${rows}</table>
      <h3>O que muda neste protótipo</h3>
      <ul>
        <li><b>Skins:</b> cada waifu assume os números de um campeão da season. A kakera define o custo, e a dica mostra qual é o kit.</li>
        <li><b>Sala:</b> de 2 a 8 jogadores. Os duelos são sorteados a cada rodada; com número ímpar, quem sobra enfrenta o fantasma do time de outro jogador. O fantasma não sofre dano. O carrossel é individual, com 4 opções.</li>
        <li><b>Habilidades:</b> usam os valores oficiais em um modelo comum, sem as animações e os detalhes de cada uma.</li>
        <li><b>Traits:</b> as marcadas com "(adaptado)" na dica foram simplificadas.</li>
        <li><b>Monstros:</b> todo evento dá ao menos um componente. Do 1-4 em diante, também um Removedor Magnético.</li>
        <li><b>Rival:</b> as traits ficam sempre visíveis. O tabuleiro fica oculto no planejamento e aparece, com os atributos, durante o combate.</li>
        <li><b>Fora por enquanto:</b> augments, hacks, emblemas e a Espátula.</li>
      </ul>`;
  }

  /* ---------- Eventos ---------- */
  function initEvents() {
    byId('seasonName').textContent = E.D.season.toUpperCase();
    byId('rulesSeason').textContent = E.D.season;
    byId('rulesBody').innerHTML = rulesHtml();
    try { byId('nameInput').value = localStorage.getItem(NAME_KEY) || ''; } catch (err) { /* sem armazenamento */ }

    TFTFx.init();
    const qualityEl = byId('qualitySelect');
    const fpsEl = byId('fpsToggle');
    qualityEl.value = TFTFx.getQuality();
    fpsEl.checked = TFTFx.showsFps();
    byId('fpsToggleBox').hidden = qualityEl.value !== 'high';
    qualityEl.addEventListener('change', () => {
      TFTFx.setQuality(qualityEl.value);
      byId('fpsToggleBox').hidden = qualityEl.value !== 'high';
    });
    fpsEl.addEventListener('change', () => TFTFx.setFps(fpsEl.checked));

    byId('btnBot').addEventListener('click', startBotGame);
    byId('btnChaos').addEventListener('click', startChaosGame);
    byId('btnCreate').addEventListener('click', () => createRoom());
    byId('btnJoin').addEventListener('click', joinRoom);
    byId('codeInput').addEventListener('input', ev => { ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    byId('codeInput').addEventListener('keydown', ev => { if (ev.key === 'Enter') joinRoom(); });
    byId('btnCopy').addEventListener('click', async ev => {
      try { await navigator.clipboard.writeText(L.code || ''); ev.target.textContent = 'COPIADO!'; }
      catch (err) { ev.target.textContent = 'COPIE À MÃO'; }
      setTimeout(() => { ev.target.textContent = 'COPIAR'; }, 1500);
    });
    byId('btnCancelRoom').addEventListener('click', leaveGame);
    byId('btnRoomReady').addEventListener('click', toggleRoomReady);

    byId('btnXp').addEventListener('click', () => sendGame({ a: 'xp' }));
    byId('btnReroll').addEventListener('click', () => sendGame({ a: 'reroll' }));
    byId('btnLock').addEventListener('click', () => sendGame({ a: 'lock' }));
    byId('btnReady').addEventListener('click', () => sendGame({ a: 'ready' }));
    byId('btnLastFight').addEventListener('click', () => { L.summaryAuto = false; renderSummary(); });
    byId('btnQuit').addEventListener('click', () => { if (confirm(L.mode === 'host' ? 'Você é o anfitrião: sair encerra a partida para todos. Continuar?' : 'Sair abandona a partida. Continuar?')) leaveGame(); });

    document.addEventListener('click', ev => {
      if (ev.target.closest('[data-open-rules]')) byId('rulesModal').hidden = false;
      if (ev.target.closest('[data-close-rules]') || ev.target.id === 'rulesModal') byId('rulesModal').hidden = true;
      if (ev.target.closest('[data-close-summary]')) hideSummary();
      const scout = ev.target.closest('[data-scout]');
      if (scout) {
        L.scout = Number(scout.dataset.scout);
        L.st.rival = pickRival(L.st);
        render();
        return;
      }
      const augBtn = ev.target.closest('[data-augment]');
      if (augBtn) { sendGame({ a: 'augment', i: Number(augBtn.dataset.augment) }); hideTip(); return; }
      const augRoll = ev.target.closest('[data-aug-reroll]');
      if (augRoll && !augRoll.disabled) { sendGame({ a: 'augReroll', i: Number(augRoll.dataset.augReroll) }); return; }
      const chooseBtn = ev.target.closest('[data-choose]');
      if (chooseBtn) { sendGame({ a: 'choose', i: Number(chooseBtn.dataset.choose) }); return; }
      if (ev.target.closest('[data-aug-hide]')) { L.augHidden = true; if (L.st) renderAugments(L.st); return; }
      if (ev.target.closest('#augReopen')) { L.augHidden = false; if (L.st) renderAugments(L.st); return; }
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
      if (key === 'escape') hideSummary();
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

  /* ---------- Vitrine de golpes: tft.html?fxtest ----------
     Roda o golpe real no motor contra unidades de teste, sem precisar jogar. */
  function openFxTest() {
    const champs = E.D.champions.slice().sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'pt-BR'));
    const bar = document.createElement('div');
    bar.className = 'fxtest-bar';
    bar.innerHTML = `<a class="back-link" href="tft.html">← Sair da vitrine</a>
      <select id="fxChamp" aria-label="Campeão">${[1, 2, 3, 4, 5].map(cost => `<optgroup label="Custo ${cost}">${champs.filter(c => c.cost === cost).map(c => `<option value="${esc(c.id)}">${E.ABILITIES[c.name].steps ? '★ ' : ''}${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}</select>
      <button class="btn small" id="fxAgain">REPETIR</button>
      <label class="fx-check"><input type="checkbox" id="fxAuto"> Passar por todos</label>
      <label class="fx-check"><input type="checkbox" id="fxStress"> Estresse</label>
      <select id="fxQuality" aria-label="Qualidade"><option value="high">Alto</option><option value="low">Baixo</option></select>
      <span class="fxtest-hint">★ = golpe novo nesta etapa</span>`;
    document.body.appendChild(bar);
    document.body.classList.add('fxtest');
    byId('lobby').hidden = true;
    byId('game').hidden = false;
    L.skins = {};
    TFTFx.setQuality('high', false);
    TFTFx.setFps(true, false);

    const dummy = (name, x, y, extra = {}) => ({ c: E.CH_BY_NAME[name].id, star: 2, x, y, items: [], ...extra });
    const scene = champ => E.simulate(
      { units: [{ c: champ, star: 2, x: 3, y: 1, items: [], fullMana: true }] },
      { units: [dummy('Alistar', 3, 0), dummy('Sejuani', 2, 1), dummy('Braum', 4, 1), dummy('Poppy', 3, 2), dummy('Galio', 1, 2), dummy('Leona', 5, 2)] },
      Math.floor(Math.random() * 1e9),
    );
    const stress = () => {
      const pool = E.D.champions.filter(c => E.ABILITIES[c.name].steps);
      const pick = () => pool[Math.floor(Math.random() * pool.length)].id;
      const team = () => Array.from({ length: 9 }, (_, i) => ({ c: pick(), star: 2, x: i % 7, y: i < 7 ? 2 : 1, items: [], fullMana: true }));
      return E.simulate({ units: team() }, { units: team() }, Math.floor(Math.random() * 1e9));
    };
    let index = 0;
    const play = () => {
      const isStress = byId('fxStress').checked;
      const view = isStress ? stress() : scene(byId('fxChamp').value);
      const cut = isStress ? 14 : 7;
      startPlayback({ ...view, names: ['Vitrine', 'Teste'], frames: view.frames.filter(f => f.t <= cut) }, false, false);
    };
    L.fxTest = {
      onEnd() {
        setTimeout(() => {
          if (byId('fxAuto').checked && !byId('fxStress').checked) {
            index = (byId('fxChamp').selectedIndex + 1) % byId('fxChamp').options.length;
            byId('fxChamp').selectedIndex = index;
          }
          if (byId('fxAuto').checked || byId('fxStress').checked) play();
        }, 700);
      },
    };
    byId('fxAgain').addEventListener('click', play);
    byId('fxChamp').addEventListener('change', play);
    byId('fxStress').addEventListener('change', play);
    byId('fxQuality').addEventListener('change', ev => { TFTFx.setQuality(ev.target.value, false); play(); });
    play();
  }

  initEvents();
  loadRoster();
  TFTCollection.init({ esc, safePhoto, asset });
  if (new URLSearchParams(location.search).has('fxtest')) openFxTest();
})();
