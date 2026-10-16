/* ============================================================
   WAIFUARENA.JS — Waifu Arena: teste de conexão online (v0)
   ------------------------------------------------------------
   Primeiro passo do simulador da Waifuarena: só testa se dois (ou
   mais) jogadores conseguem se conectar pela internet usando apenas
   o site (GitHub Pages), sem servidor próprio.

   Como funciona:
   - Conexão direta entre navegadores (WebRTC) via biblioteca PeerJS.
     O servidor público gratuito do PeerJS só é usado para os
     navegadores se encontrarem; a conversa em si é direta.
   - Quem cria a sala é o ANFITRIÃO e recebe um código de 6 letras.
     Os outros entram digitando o código. Tudo passa pelo anfitrião,
     que repassa as mensagens para todos (até 8 jogadores).

   A tela é montada por este arquivo (como o OrbeSolver faz) e o
   script.js a descobre pelo id "view-arena".
   ============================================================ */
(() => {
  'use strict';

  const PEERJS_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const ID_PREFIX = 'mudae-tracker-arena-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I
  const MAX_PLAYERS = 8;
  const NAME_KEY = 'mudaeTracker_arenaName';

  /* ---------- Tela ---------- */
  const VIEW_HTML = `
  <section id="view-arena" class="view arena-view" aria-label="Waifu Arena">
    <div class="page-head">
      <h1 class="pink-title"><span class="page-icon">⚔</span> WAIFU ARENA <span class="arena-beta">EM TESTE</span></h1>
      <p class="subtitle">Isto ainda <b>não é o jogo final</b>: é um protótipo da batalha, contra o bot ou online numa sala.</p>
    </div>

    <div class="arena-grid">
      <div class="panel">
        <div class="panel-title"><span class="bar pink"></span> SALA</div>

        <div class="arena-status" id="arenaStatus" data-state="idle">Desconectado</div>

        <div class="field">
          <label for="arenaName">SEU NOME</label>
          <input type="text" id="arenaName" maxlength="24" placeholder="Seu nome na sala" />
        </div>

        <div id="arenaLobby">
          <button type="button" class="pill pink arena-wide" id="arenaCreate">CRIAR SALA</button>
          <div class="arena-or"><span>ou</span></div>
          <div class="field">
            <label for="arenaCode">CÓDIGO DA SALA</label>
            <div class="arena-join">
              <input type="text" id="arenaCode" maxlength="6" placeholder="EX.: K7M2QX" autocomplete="off" spellcheck="false" />
              <button type="button" class="pill cyan" id="arenaJoin">ENTRAR</button>
            </div>
          </div>
        </div>

        <div id="arenaRoom" hidden>
          <div class="arena-code-box">
            <span class="arena-code-label">CÓDIGO DA SALA</span>
            <span class="arena-code" id="arenaRoomCode">------</span>
            <button type="button" class="pill cyan" id="arenaCopy">COPIAR</button>
          </div>
          <p class="arena-hint" id="arenaRoomHint"></p>
          <button type="button" class="pill red arena-wide" id="arenaLeave">SAIR DA SALA</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title"><span class="bar cyan"></span> JOGADORES <span class="arena-count" id="arenaCount">0/${MAX_PLAYERS}</span></div>
        <ul class="arena-players" id="arenaPlayers">
          <li class="arena-empty">Ninguém na sala ainda.</li>
        </ul>
      </div>
    </div>
  </section>`;

  /* ---------- Estado ---------- */
  const S = {
    peer: null,
    role: null,          // 'host' | 'guest'
    code: null,
    name: '',
    conns: new Map(),    // anfitrião: peerId → { conn, name }
    hostConn: null,      // convidado: conexão com o anfitrião
    players: [],         // [{ name, host }]
  };

  let $ = null;

  /* ---------- Utilitários ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  const cleanName = n => String(n || '').trim().slice(0, 24) || 'Jogador';

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

  function setStatus(text, state) {
    $.status.textContent = text;
    $.status.dataset.state = state;
  }

  function setInRoom(inRoom) {
    $.lobby.hidden = inRoom;
    $.room.hidden = !inRoom;
    $.name.disabled = inRoom;
    if (!inRoom) {
      $.players.innerHTML = '<li class="arena-empty">Ninguém na sala ainda.</li>';
      $.count.textContent = `0/${MAX_PLAYERS}`;
    }
  }

  function setBusy(busy) {
    $.create.disabled = busy;
    $.join.disabled = busy;
  }

  /* ---------- Canal para outros módulos (batalha online) ----------
     Mensagens "duel-*" são repassadas para quem se inscrever com
     WaifuArenaNet.on(fn). Também avisa mudanças na sala:
     "net-players" (lista mudou), "net-drop" (jogador saiu, só no
     anfitrião) e "net-left" (você saiu ou a sala acabou). */
  const listeners = new Set();
  function emit(msg, meta = {}) {
    for (const fn of listeners) {
      try { fn(msg, meta); } catch (err) { console.error('WaifuArenaNet:', err); }
    }
  }
  window.WaifuArenaNet = {
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    role: () => S.role,
    name: () => S.name,
    players: () => S.players.slice(),
    sendToHost(msg) { if (S.hostConn && S.hostConn.open) S.hostConn.send(msg); },
    sendTo(peerId, msg) { const e = S.conns.get(peerId); if (e && e.conn.open) e.conn.send(msg); },
    broadcast(msg) { broadcast(msg); },
  };

  function renderPlayers(list) {
    S.players = list;
    setTimeout(() => emit({ t: 'net-players' }), 0);
    $.count.textContent = `${list.length}/${MAX_PLAYERS}`;
    $.players.innerHTML = list.map(p =>
      `<li class="${p.name === S.name ? 'me' : ''}"><span class="arena-dot"></span>${esc(p.name)}${p.host ? ' <span class="arena-tag">ANFITRIÃO</span>' : ''}${p.name === S.name ? ' <span class="arena-tag you">VOCÊ</span>' : ''}</li>`
    ).join('');
  }


  /* ---------- Anfitrião ---------- */
  function hostPlayers() {
    return [{ name: S.name, host: true }, ...[...S.conns.values()].filter(p => p.name).map(p => ({ name: p.name, host: false }))];
  }

  function broadcast(msg) {
    for (const { conn } of S.conns.values()) if (conn.open) conn.send(msg);
  }

  function hostUpdatePlayers() {
    const list = hostPlayers();
    renderPlayers(list);
    broadcast({ t: 'players', list });
  }

  /* nome único na sala: "Ana", "Ana (2)"… */
  function uniqueName(wanted) {
    const taken = new Set(hostPlayers().map(p => p.name));
    if (!taken.has(wanted)) return wanted;
    let i = 2;
    while (taken.has(`${wanted} (${i})`)) i++;
    return `${wanted} (${i})`;
  }

  function onHostConnection(conn) {
    if (S.conns.size >= MAX_PLAYERS - 1) {
      conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); });
      return;
    }
    S.conns.set(conn.peer, { conn, name: null });

    conn.on('data', msg => {
      const entry = S.conns.get(conn.peer);
      if (!entry || !msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        entry.name = uniqueName(cleanName(msg.name));
        conn.send({ t: 'welcome', name: entry.name, code: S.code });
        hostUpdatePlayers();
      }
      if (typeof msg.t === 'string' && msg.t.startsWith('duel-') && entry.name) emit(msg, { from: conn.peer, name: entry.name });
    });

    const drop = () => {
      const entry = S.conns.get(conn.peer);
      if (!entry) return;
      S.conns.delete(conn.peer);
      emit({ t: 'net-drop' }, { from: conn.peer, name: entry.name });
      hostUpdatePlayers();
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  async function createRoom(attempt = 0) {
    S.name = cleanName($.name.value);
    setBusy(true);
    setStatus('Criando sala…', 'busy');
    try { await loadPeerJs(); } catch (err) { setBusy(false); return setStatus(err.message, 'error'); }

    const code = newCode();
    const peer = new window.Peer(ID_PREFIX + code);
    S.peer = peer;

    peer.on('open', () => {
      Object.assign(S, { role: 'host', code });
      setBusy(false);
      setInRoom(true);
      $.roomCode.textContent = code;
      $.roomHint.textContent = 'Mande este código para quem vai jogar com você. Mantenha esta aba aberta: você é o anfitrião da sala.';
      setStatus('Sala criada · aguardando jogadores', 'ok');
      hostUpdatePlayers();
    });
    peer.on('connection', onHostConnection);
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && attempt < 3) { // código já em uso: tenta outro
        peer.destroy();
        return createRoom(attempt + 1);
      }
      setBusy(false);
      setStatus(`Erro: ${errorText(err)}`, 'error');
    });
    peer.on('disconnected', () => {
      if (S.role === 'host') setStatus('Sem contato com o servidor de encontro. Quem já está na sala continua conectado; novos jogadores não conseguem entrar.', 'warn');
    });
  }

  /* ---------- Convidado ---------- */
  async function joinRoom() {
    const code = $.code.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return setStatus('Digite o código de 6 letras da sala.', 'error');
    S.name = cleanName($.name.value);
    setBusy(true);
    setStatus(`Entrando na sala ${code}…`, 'busy');
    try { await loadPeerJs(); } catch (err) { setBusy(false); return setStatus(err.message, 'error'); }

    const peer = new window.Peer();
    S.peer = peer;
    let opened = false;

    peer.on('open', () => {
      const conn = peer.connect(ID_PREFIX + code, { reliable: true });
      S.hostConn = conn;
      const timeout = setTimeout(() => {
        if (!opened) { setStatus('Não deu para conectar. Confira o código ou se o anfitrião está com a sala aberta.', 'error'); leaveRoom(true); }
      }, 15000);

      conn.on('open', () => {
        opened = true;
        clearTimeout(timeout);
        conn.send({ t: 'hello', name: S.name });
      });
      conn.on('data', msg => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'welcome') {
          Object.assign(S, { role: 'guest', code: msg.code, name: msg.name });
          setBusy(false);
          setInRoom(true);
          $.roomCode.textContent = msg.code;
          $.roomHint.textContent = 'Você entrou na sala. Se o anfitrião fechar a aba, a sala acaba.';
          setStatus(`Conectado à sala ${msg.code}`, 'ok');
        }
        if (msg.t === 'players') renderPlayers(msg.list);
        if (msg.t === 'full') { setStatus('A sala está cheia (8 jogadores).', 'error'); leaveRoom(true); }
        if (typeof msg.t === 'string' && msg.t.startsWith('duel-')) emit(msg, { from: 'host' });
      });
      conn.on('close', () => {
        if (S.role === 'guest') { setStatus('Sala encerrada', 'warn'); leaveRoom(true); }
      });
    });
    peer.on('error', err => {
      setBusy(false);
      setStatus(err.type === 'peer-unavailable' ? 'Sala não encontrada. Confira o código.' : `Erro: ${errorText(err)}`, 'error');
      leaveRoom(true);
    });
  }

  /* ---------- Comum ---------- */
  function errorText(err) {
    const map = {
      'browser-incompatible': 'este navegador não suporta conexão direta (WebRTC).',
      'network': 'sem conexão com o servidor de encontro.',
      'server-error': 'servidor de encontro indisponível. Tente de novo em instantes.',
      'socket-error': 'falha de conexão com o servidor de encontro.',
      'unavailable-id': 'código já em uso, tente de novo.',
    };
    return map[err && err.type] || (err && err.message) || 'falha desconhecida.';
  }

  function leaveRoom(silent = false) {
    const wasIn = !!S.role;
    S.role = null;
    for (const { conn } of S.conns.values()) try { conn.close(); } catch (err) { /* ignora */ }
    S.conns.clear();
    if (S.hostConn) try { S.hostConn.close(); } catch (err) { /* ignora */ }
    S.hostConn = null;
    if (S.peer) try { S.peer.destroy(); } catch (err) { /* ignora */ }
    S.peer = null;
    S.code = null;
    S.players = [];
    setBusy(false);
    setInRoom(false);
    if (wasIn) emit({ t: 'net-left' });
    if (!silent) setStatus('Desconectado', 'idle');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(S.code || '');
      $.copy.textContent = 'COPIADO!';
    } catch (err) {
      $.copy.textContent = 'COPIE À MÃO';
    }
    setTimeout(() => { $.copy.textContent = 'COPIAR'; }, 1500);
  }

  /* ---------- Montagem ---------- */
  function init() {
    const app = document.getElementById('app');
    if (!app || document.getElementById('view-arena')) return;
    app.insertAdjacentHTML('beforeend', VIEW_HTML);

    const byId = id => document.getElementById(id);
    $ = {
      status: byId('arenaStatus'), name: byId('arenaName'), lobby: byId('arenaLobby'), room: byId('arenaRoom'),
      create: byId('arenaCreate'), code: byId('arenaCode'), join: byId('arenaJoin'),
      roomCode: byId('arenaRoomCode'), roomHint: byId('arenaRoomHint'), copy: byId('arenaCopy'), leave: byId('arenaLeave'),
      players: byId('arenaPlayers'), count: byId('arenaCount'),
    };

    try { $.name.value = localStorage.getItem(NAME_KEY) || ''; } catch (err) { /* sem armazenamento */ }
    $.name.addEventListener('change', () => { try { localStorage.setItem(NAME_KEY, $.name.value.trim()); } catch (err) { /* ignora */ } });
    $.code.addEventListener('input', () => { $.code.value = $.code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $.code.addEventListener('keydown', ev => { if (ev.key === 'Enter') joinRoom(); });
    $.create.addEventListener('click', () => createRoom());
    $.join.addEventListener('click', joinRoom);
    $.leave.addEventListener('click', () => leaveRoom());
    $.copy.addEventListener('click', copyCode);

    // fecha a conexão direitinho ao sair da página
    window.addEventListener('beforeunload', () => leaveRoom(true));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
