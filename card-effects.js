/* ============================================================
   CARD-EFFECTS.JS — Cartas com efeitos (v1.0)
   ------------------------------------------------------------
   Um arquivo, três partes:

   1. NÚCLEO (compartilhado): raridades por kakera, chaves, opções,
      regras de desbloqueio, desenho da carta e visualizador 3D.

   2. TRACKER (index.html): interruptor "CARTAS" ao lado de EFEITOS.
      Ligado, cada personagem vira a carta nova (desenhada em Shadow
      DOM, para o CSS novo não colidir com o style.css), ganha o botão
      ✦ para editar os efeitos e o clique abre o 3D novo. Desligado,
      o tracker continua exatamente como antes.

   3. EDITOR (card-effects.html): a tela de edição. O tracker a abre
      num iframe (?embed=1) e conversa com ela por postMessage:
        editor → tracker  { type: "mce:ready" }
        tracker → editor  { type: "mce:init", character, config }
        editor → tracker  { type: "mce:save", config } | { type: "mce:cancel" }

   A config visual de cada personagem fica em character.cardStyle
   (salva no IndexedDB junto com o personagem e incluída no backup).
   ============================================================ */
const MudaeCardEffects = (() => {
  'use strict';

  /* ============================================================
     1. NÚCLEO
     ============================================================ */
  const CSS_HREF = 'card-effects.css?v=2';
  const KAKERA_DIR = 'kakerasImg';
  const BACK_IMG = 'Mudae.png';

  const fmtNum = v => Number(v).toLocaleString('pt-BR');
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  /* Variáveis animadas do CSS (o reflexo volta suave ao tirar o mouse).
     Registradas por JS porque @property não vale dentro de Shadow DOM. */
  function registerProps() {
    if (!window.CSS || !CSS.registerProperty) return;
    [['--o', '<number>', '0', true], ['--mx', '<percentage>', '50%', true],
     ['--my', '<percentage>', '50%', true], ['--ang', '<angle>', '0deg', false]]
      .forEach(([name, syntax, initialValue, inherits]) => {
        try { CSS.registerProperty({ name, syntax, initialValue, inherits }); } catch (err) { /* já registrada */ }
      });
  }

  /* ---------- Raridades pela cor da kakera (ícone: kakerasImg/<n>.png) ---------- */
  const TIERS = [
    { n: 1,  key: 'purple',  label: 'Purple',  pt: 'Roxa',      min: 0,    color: '#a855f7', text: '#d8b4fe' },
    { n: 2,  key: 'light',   label: 'Light',   pt: 'Clara',     min: 101,  color: '#e5e7eb', text: '#f1f5f9' },
    { n: 3,  key: 'blue',    label: 'Blue',    pt: 'Azul',      min: 151,  color: '#818cf8', text: '#a5b4fc' },
    { n: 4,  key: 'teal',    label: 'Teal',    pt: 'Ciano',     min: 201,  color: '#22d3ee', text: '#67e8f9' },
    { n: 5,  key: 'green',   label: 'Green',   pt: 'Verde',     min: 276,  color: '#4ade80', text: '#86efac' },
    { n: 6,  key: 'yellow',  label: 'Yellow',  pt: 'Amarela',   min: 376,  color: '#facc15', text: '#fde047' },
    { n: 7,  key: 'orange',  label: 'Orange',  pt: 'Laranja',   min: 501,  color: '#fb923c', text: '#fdba74' },
    { n: 8,  key: 'red',     label: 'Red',     pt: 'Vermelha',  min: 701,  color: '#f87171', text: '#fca5a5' },
    { n: 9,  key: 'dark',    label: 'Dark',    pt: 'Escura',    min: 1000, color: '#6b6385', text: '#c4bcdb',
      border: 'linear-gradient(135deg, #8f88a8, #1b1726 35%, #a39cbd 55%, #0d0b14 75%, #4a4560)' },
    { n: 10, key: 'chaos',   label: 'Chaos',   pt: 'Caos',      min: 1500, color: '#a855f7', text: '#c084fc',
      border: 'linear-gradient(135deg, #c084fc, #2a1640 30%, #4ade80 50%, #0b0b12 70%, #a855f7)' },
    { n: 11, key: 'rainbow', label: 'Rainbow', pt: 'Arco-íris', min: 2000, color: '#f9a8d4', text: '#fff',
      border: 'linear-gradient(135deg, #ff9ad5, #ffe28a, #9fffbd, #8fd9ff, #d39fff, #ff9ad5, #ffe28a)' },
  ];
  const getTier = k => [...TIERS].reverse().find(t => k >= t.min) || TIERS[0];
  const kakeraIcon = t => `${KAKERA_DIR}/${t.n}.png`;
  function tierRange(t) {
    const next = TIERS[TIERS.indexOf(t) + 1];
    return next ? `${fmtNum(t.min)} – ${fmtNum(next.min - 1)}` : `${fmtNum(t.min)}+`;
  }

  /* ---------- Chaves no padrão do Mudae: 1–2 bronze, 3–5 prata, 6–9 ouro, 10+ caos ---------- */
  const keyTier = n => n >= 10 ? 'chaos' : n >= 6 ? 'gold' : n >= 3 ? 'silver' : n >= 1 ? 'bronze' : 'none';
  const KEY_TIER_INFO = {
    none:   ['Sem chave', '0'],
    bronze: ['Bronze', '1 – 2'],
    silver: ['Prata', '3 – 5'],
    gold:   ['Ouro', '6 – 9'],
    chaos:  ['Caos', '10+'],
  };
  const KEY_SVG = '<svg class="kicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l4.5 4.5L12 11 7.5 6.5z"/><path d="M12 11v11M12 16h3.5M12 19.5h2.5"/></svg>';

  /* ---------- Opções ---------- */
  const FOILS = [['none', 'Nenhum'], ['stripes', 'Listras'], ['cosmos', 'Cosmos'], ['sheen', 'Brilho diagonal'], ['rainbow', 'Arco-íris'], ['gold', 'Ouro'],
    ['cracked', 'Gelo rachado'], ['prism', 'Prisma'], ['radiant', 'Raios'], ['sunpillar', 'Vertical'], ['scales', 'Escamas'], ['silver', 'Prata']];
  const FILTERS = [['none', 'Normal'], ['bw', 'P&B'], ['sepia', 'Sépia'], ['gold', 'Dourado'], ['duotone', 'Duotone'], ['tint', 'Tingido'],
    ['cold', 'Frio'], ['vivid', 'Saturado'], ['soft', 'Suave'], ['film', 'Filme']];
  const TEXTURES = [['none', 'Nenhuma'], ['etched', 'Gravada'], ['stained', 'Vitral'], ['halftone', 'Retícula'], ['grain', 'Granulado'], ['scan', 'Scanlines']];
  const ANIMS = [['none', 'Nenhuma'], ['sakura', 'Sakura'], ['flames', 'Chamas'], ['rain', 'Chuva'], ['neon', 'Moldura neon'], ['backlight', 'Contraluz'], ['stars', 'Estrelas'], ['glitch', 'Glitch']];
  const XFX = [['none', 'Nenhum'], ['senbon', 'Senbonzakura'], ['reiatsu', 'Reiatsu'], ['lightning', 'Relâmpago'], ['snow', 'Neve'], ['water', 'Subaquático'], ['aurora', 'Aurora'],
    ['embers', 'Brasas'], ['fog', 'Névoa'], ['rays', 'Raios de luz'], ['heat', 'Distorção de calor'], ['sweep', 'Varredura de brilho'], ['fireflies', 'Vagalumes']];
  const FONTS = [['cinzel', 'Clássica'], ['bangers', 'Mangá'], ['orbitron', 'Futurista'], ['pixel', 'Pixel'], ['system', 'Simples']];
  const BORDER_STYLES = [['rarity', 'Cor da raridade'], ['metal', 'Metálica'], ['holo', 'Holográfica'], ['solid', 'Sólida'], ['rainbow', 'Arco-íris']];
  const PANELS = [['dark', 'Escuro'], ['light', 'Claro']];
  const OPS = [['none', 'Sem OP'], ['some', 'Com OP'], ['max', 'OP máximo']];
  const SWATCHES = [['#c9ced6', 'Prata'], ['#d4a83a', 'Ouro'], ['#f472b6', 'Rosa'], ['#8b5cf6', 'Roxo'], ['#38bdf8', 'Azul'], ['#34d399', 'Verde'], ['#e8542d', 'Vermelho'], ['#111111', 'Preto'], ['#f5f5f5', 'Branco']];
  const TINTS = [['#9b59b6', 'Roxo'], ['#ec2f9c', 'Rosa'], ['#3f8ee0', 'Azul'], ['#22d3ee', 'Ciano'], ['#f59e0b', 'Âmbar'], ['#e8542d', 'Vermelho']];
  const NAME_COLORS = [['#ffffff', 'Branco'], ['#ffe9a8', 'Dourado'], ['#ff9df6', 'Rosa'], ['#7ff9ff', 'Ciano'], ['#3a2f25', 'Marrom']];
  const ROLETAS = ['wa', 'wg', 'ha', 'hg'];

  /* Config visual padrão de toda carta */
  const DEFAULT_VISUAL = {
    borderColor: '#c9ced6', borderStyle: 'rarity', bw: 2,
    foil: 'none', fxi: 1, glit: false, glare: 1,
    filter: 'none', tint: '#ec2f9c', soft: false, apy: 15, az: 1,
    texture: 'none', anim: 'none', xfx: 'none',
    font: 'cinzel', nameColor: '#ffffff', panel: 'dark',
  };
  const VISUAL_KEYS = Object.keys(DEFAULT_VISUAL);
  const CHAR_KEYS = ['name', 'series', 'img', 'kakera', 'keys', 'op', 'roletas'];

  /* Modelos prontos: só o visual muda */
  const PRESETS = [
    ['Padrão',    {}],
    ['Sakura',    { borderColor: '#f472b6', borderStyle: 'metal', anim: 'sakura' }],
    ['Cinema',    { borderColor: '#111111', borderStyle: 'solid', filter: 'film', texture: 'grain' }],
    ['Ouro',      { borderColor: '#d4a83a', borderStyle: 'holo', foil: 'gold', glit: true, filter: 'gold' }],
    ['Arco-íris', { borderStyle: 'rainbow', foil: 'rainbow', glit: true }],
    ['Neon',      { borderColor: '#111111', borderStyle: 'solid', anim: 'neon', font: 'orbitron', nameColor: '#ff9df6' }],
    ['Vitral',    { borderColor: '#c8961e', borderStyle: 'metal', foil: 'cracked', texture: 'stained', filter: 'vivid' }],
    ['Aquarela',  { borderColor: '#efe6d2', borderStyle: 'solid', filter: 'soft', soft: true, panel: 'light', nameColor: '#3a2f25' }],
    ['Chuva',     { borderColor: '#475569', borderStyle: 'metal', filter: 'cold', anim: 'rain' }],
    ['Chamas',    { borderColor: '#e8542d', borderStyle: 'metal', anim: 'flames' }],
    ['Galáxia',   { borderColor: '#5b3fa8', borderStyle: 'holo', foil: 'cosmos', anim: 'stars', filter: 'tint', tint: '#9b59b6' }],
    ['Mangá',     { borderColor: '#111111', borderStyle: 'solid', filter: 'bw', texture: 'halftone', font: 'bangers' }],
    ['Glitch',    { borderColor: '#ff00e6', borderStyle: 'holo', anim: 'glitch', texture: 'scan', font: 'orbitron', nameColor: '#7ff9ff' }],
    ['Contraluz', { borderColor: '#d4a83a', borderStyle: 'metal', foil: 'gold', anim: 'backlight' }],
    ['Senbonzakura', { borderColor: '#ec4899', borderStyle: 'holo', xfx: 'senbon' }],
    ['Reiatsu',   { borderColor: '#38bdf8', foil: 'sheen', xfx: 'reiatsu', font: 'orbitron', nameColor: '#bae6fd' }],
    ['Tempestade', { borderColor: '#334155', borderStyle: 'metal', xfx: 'lightning', anim: 'rain' }],
    ['Inverno',   { borderColor: '#bae6fd', borderStyle: 'holo', glit: true, xfx: 'snow' }],
    ['Oceano',    { borderColor: '#0d9488', borderStyle: 'metal', xfx: 'water' }],
    ['Noite boreal', { borderColor: '#34d399', borderStyle: 'holo', xfx: 'aurora', anim: 'stars' }],
    ['Floresta',  { borderColor: '#84cc16', borderStyle: 'metal', xfx: 'fireflies', texture: 'grain' }],
    ['Divino',    { borderColor: '#d4a83a', borderStyle: 'holo', foil: 'gold', glit: true, xfx: 'rays', nameColor: '#ffe9a8' }],
  ];

  /* ============================================================
     REGRAS DE DESBLOQUEIO
     - Moldura: cor e estilo com 1+ chave (sem chave: só "Cor da raridade" e espessura)
     - Foil por kakera: Prata 400+, Ouro 600+, Gelo/Prisma/Raios 800+, todos (e glitter) 1000+
     - Ilustração: livre
     - Textura 3+ chaves, Animação 6+, Efeitos especiais 10+, Texto 1+
     O valor padrão de cada campo é sempre permitido.
     ============================================================ */
  const KEY_REQ = { borderColor: 1, borderStyle: 1, texture: 3, anim: 6, xfx: 10, font: 1, nameColor: 1, panel: 1 };
  const FOIL_MIN = { silver: 400, gold: 600, cracked: 800, prism: 800, radiant: 800 }; // os demais: 1000
  const foilMin = f => FOIL_MIN[f] ?? 1000;
  const GLIT_MIN = 1000;
  const chavesTxt = n => `${n} chave${n > 1 ? 's' : ''}`;

  /* Motivo do bloqueio da opção v no campo k para a carta s (null = liberado) */
  function optionLock(k, v, s) {
    if (v === DEFAULT_VISUAL[k]) return null;
    if (k in KEY_REQ && s.keys < KEY_REQ[k]) return `Libera com ${chavesTxt(KEY_REQ[k])}`;
    if (k === 'foil' && s.kakera < foilMin(v)) return `Libera com ${fmtNum(foilMin(v))} kakera`;
    if (k === 'glit' && s.kakera < GLIT_MIN) return `Libera com ${fmtNum(GLIT_MIN)} kakera`;
    return null;
  }

  /* O que a carta mostra de fato: escolha bloqueada volta ao padrão (a escolha fica guardada) */
  function effective(s) {
    const e = { ...s };
    for (const k of VISUAL_KEYS) if (optionLock(k, s[k], s)) e[k] = DEFAULT_VISUAL[k];
    return e;
  }

  /* Regra mostrada no título de cada seção do editor */
  const SECTION_RULES = {
    'Moldura':           { text: 'Cor e estilo com 1+ chave', ok: s => s.keys >= 1 },
    'Foil holográfico':  { text: 'Prata 400+ · Ouro 600+ · Gelo, Prisma e Raios 800+ · todos 1.000+ ◈', ok: s => s.kakera >= 1000 },
    'Textura':           { text: '3+ chaves',  ok: s => s.keys >= 3 },
    'Animação':          { text: '6+ chaves',  ok: s => s.keys >= 6 },
    'Efeitos especiais': { text: '10+ chaves', ok: s => s.keys >= 10 },
    'Texto':             { text: '1+ chave',   ok: s => s.keys >= 1 },
  };

  /* ---------- Validação de config (colar config e dados vindos do banco) ---------- */
  const ENUMS = { borderStyle: BORDER_STYLES, foil: FOILS, filter: FILTERS, texture: TEXTURES, anim: ANIMS, xfx: XFX, font: FONTS, panel: PANELS };
  const RANGES = { bw: [0, 6], fxi: [0, 1.5], glare: [0, 1.5], apy: [0, 100], az: [1, 1.8] };
  const HEX = /^#[0-9a-f]{6}$/i;

  function isValidField(k, v) {
    const d = DEFAULT_VISUAL[k];
    if (ENUMS[k]) return ENUMS[k].some(([o]) => o === v);
    if (RANGES[k]) return typeof v === 'number' && Number.isFinite(v) && v >= RANGES[k][0] && v <= RANGES[k][1];
    if (typeof d === 'boolean') return typeof v === 'boolean';
    if (HEX.test(d)) return typeof v === 'string' && HEX.test(v);
    return false;
  }

  /* Separa um objeto qualquer em campos visuais válidos, inválidos e dados de personagem */
  function readConfig(raw) {
    const config = {}, ignored = [], charSkipped = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { config, ignored, charSkipped };
    for (const [k, v] of Object.entries(raw)) {
      if (CHAR_KEYS.includes(k)) { charSkipped.push(k); continue; }
      if (!VISUAL_KEYS.includes(k) || !isValidField(k, v)) { ignored.push(k); continue; }
      config[k] = v;
    }
    return { config, ignored, charSkipped };
  }

  const visualConfig = s => Object.fromEntries(VISUAL_KEYS.map(k => [k, s[k]]));

  /* ---------- Cores ---------- */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const mix = (hex, to, t) => {
    const a = hexToRgb(hex), b = hexToRgb(to);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const rgba = (hex, a) => `rgba(${hexToRgb(hex).join(',')},${a})`;
  const metalBorder = c => `linear-gradient(135deg, ${mix(c, '#ffffff', .55)}, ${c} 35%, ${mix(c, '#ffffff', .7)} 55%, ${mix(c, '#000000', .3)} 75%, ${mix(c, '#ffffff', .4)})`;

  function borderCSS(s) {
    const c = s.borderColor;
    if (s.borderStyle === 'rarity') { const t = getTier(s.kakera); return t.border || metalBorder(t.color); }
    if (s.borderStyle === 'solid') return c;
    if (s.borderStyle === 'rainbow') return 'linear-gradient(135deg,#ff9ad5,#ffe28a,#9fffbd,#8fd9ff,#d39fff,#ff9ad5,#ffe28a)';
    if (s.borderStyle === 'holo') return `linear-gradient(115deg, ${c}, ${mix(c, '#ffffff', .8)} 20%, ${c} 35%, ${mix(c, '#000000', .35)} 50%, ${c} 65%, ${mix(c, '#ffffff', .8)} 80%, ${c})`;
    return metalBorder(c);
  }

  /* ---------- Desenho da carta (recebe a config já efetiva) ---------- */
  function cardInnerHTML(s) {
    const tier = getTier(s.kakera);
    const op = s.op === 'none' ? '' : `<div class="op-badge op-${s.op === 'max' ? 'max' : 'some'}" title="${s.op === 'max' ? 'Todos os perks do $op no máximo' : 'Tem perks do $op'}"><span>◈</span></div>`;
    return `<div class="card-inner">
    <div class="frame"><div class="content"><div class="fx frame-fx"></div>
      <div class="top">${op}<div class="tl-kak" title="${tier.label} · ${tier.pt}"><img src="${kakeraIcon(tier)}" alt=""><span class="kak-val">${fmtNum(s.kakera)}</span></div></div>
      <div class="art"><div class="art-img">${s.img ? `<img class="art-photo" src="${esc(s.img)}" referrerpolicy="no-referrer" alt="" draggable="false">` : ''}</div><div class="fx art-fx"></div></div>
      <div class="tl-sign">
        <div class="tl-id"><span class="tl-name">${esc(s.name)}</span><span class="tl-series">${esc(s.series)}</span></div>
        <div class="tl-keys key-${keyTier(s.keys)}">${KEY_SVG}<span>${fmtNum(s.keys)}</span></div>
      </div>
      <div class="meta"><span class="chips">${(s.roletas || []).map(r => `<span class="chip">$${r}</span>`).join('')}</span></div>
    </div></div>
    <div class="fx card-fx"></div><div class="xfx"></div><div class="anim"></div><div class="fx sparkle"></div><div class="glare"></div>
  </div>`;
  }

  function cardClass(s) {
    return ['card', 'L-full', 'L-harem', 'ed-card', `t-${getTier(s.kakera).key}`,
      s.foil !== 'none' ? `fx-${s.foil} on-card` : '', s.glit ? 'glit' : '',
      `af-${s.filter}`, `tx-${s.texture}`, `an-${s.anim}`, s.xfx !== 'none' ? `v-x-${s.xfx}` : '', `nf-${s.font}`, `bs-${s.borderStyle}`, `pn-${s.panel}`,
      s.soft ? 'soft-edges' : '', s.bw <= .05 ? 'no-border' : '', s.img ? '' : 'no-img'].filter(Boolean).join(' ');
  }

  function cardStyle(s) {
    const tier = getTier(s.kakera);
    const glow = s.borderStyle === 'rarity' ? rgba(tier.color, .45) : s.borderStyle === 'rainbow' ? 'rgba(255,170,240,.4)' : rgba(s.borderColor, .45);
    const img = s.img ? `url("${String(s.img).replace(/["\\\n]/g, '')}")` : 'none';
    return `--rc:${tier.color};--rc-text:${tier.text};--border:${borderCSS(s)};--bw:${s.bw}cqw;--fxi:${s.fxi};--gl:${s.glare};--tint:${s.tint};--apy:${s.apy}%;--az:${s.az};--nc:${s.nameColor};--glow:${glow};--img:${img}`;
  }

  /* Desenha a carta em el, aplicando as regras de desbloqueio */
  function paintCard(el, s) {
    const e = effective(s);
    el.className = cardClass(e);
    el.style.cssText = cardStyle(e);
    el.innerHTML = cardInnerHTML(e);
    return e;
  }

  /* Inclinação + reflexo ao passar o mouse */
  function attachTilt(card) {
    card.addEventListener('pointermove', ev => {
      const r = card.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width, py = (ev.clientY - r.top) / r.height;
      card.classList.add('hovering');
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      const inner = card.querySelector('.card-inner');
      if (inner) inner.style.transform = `rotateX(${(.5 - py) * 22}deg) rotateY(${(px - .5) * 22}deg) scale(1.03)`;
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('hovering');
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
      const inner = card.querySelector('.card-inner');
      if (inner) inner.style.transform = '';
    });
  }

  /* Filtro SVG do efeito "Distorção de calor": precisa estar no mesmo Shadow DOM da carta */
  const HEAT_SVG = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="heat"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves="2" seed="3"><animate attributeName="baseFrequency" dur="6s" values="0.012 0.04;0.018 0.065;0.012 0.04" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="10"/></filter></svg>';

  /* Carta isolada em Shadow DOM (usada no tracker) */
  function createCardHost(s) {
    const host = document.createElement('div');
    host.className = 'mce-host';
    const root = host.attachShadow({ mode: 'open' });
    // fica invisível até o card-effects.css carregar (ele mesmo libera com :host { visibility: visible })
    root.innerHTML = `<style>:host { visibility: hidden; }</style><link rel="stylesheet" href="${CSS_HREF}">${HEAT_SVG}<div class="mce-card-wrap"><div></div></div>`;
    const card = root.querySelector('.mce-card-wrap > div');
    paintCard(card, s);
    attachTilt(card);
    return host;
  }

  /* ---------- Verso da carta ---------- */
  const BACK_HTML = `<div class="cb"><div class="cb-inner">
  <div class="cb-pattern"></div>
  <span class="cb-corner tl"></span><span class="cb-corner tr"></span><span class="cb-corner bl"></span><span class="cb-corner br"></span>
  <div class="cb-medal"><img src="${BACK_IMG}" alt="Mudae"></div>
  <div class="cb-logo">MUDAE<small>TRADING CARD GAME</small></div>
  <div class="cb-div"><img src="${KAKERA_DIR}/11.png" alt=""></div>
</div><div class="glare"></div></div>`;

  /* ---------- Visualizador 3D (Shadow DOM sobre a página inteira) ---------- */
  const VIEWER_HTML = `<div id="viewer" hidden>
  <div class="v-backdrop"></div>
  <div class="v-stage" id="vstage">
    <div class="v-floor" id="vfloor"></div>
    <div class="v-card"><div class="v-rot" id="vrot"></div></div>
  </div>
  <div class="v-info"><h3 id="vtitle"></h3><p id="vdesc"></p></div>
  <div class="v-controls">
    <button data-act="flip">Virar</button>
    <button data-act="auto">Auto-giro</button>
    <button data-act="reset">Resetar</button>
  </div>
  <button class="v-close" title="Fechar (Esc)">✕</button>
  <div class="v-hint">Arraste para girar · roda do mouse para zoom · F vira · Esc fecha</div>
</div>`;

  const label = (list, v) => (list.find(([k]) => k === v) || [, v])[1];
  const describe = e => `Foil: ${label(FOILS, e.foil)} · Filtro: ${label(FILTERS, e.filter)} · Textura: ${label(TEXTURES, e.texture)} · Animação: ${label(ANIMS, e.anim)} · Efeito: ${label(XFX, e.xfx)}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let viewerState = null;
  const isViewerOpen = () => !!viewerState;

  function openViewer(s, info = {}) {
    closeViewer();
    const host = document.createElement('div');
    host.className = 'mce-viewer-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<link rel="stylesheet" href="${CSS_HREF}">${HEAT_SVG}${VIEWER_HTML}`;
    document.body.appendChild(host);

    const $ = sel => root.querySelector(sel);
    const viewer = $('#viewer'), stage = $('#vstage'), rot = $('#vrot'), floor = $('#vfloor'), autoBtn = $('[data-act="auto"]');

    const front = document.createElement('div');
    const e = paintCard(front, s);
    $('#vtitle').textContent = info.title || 'Sua carta';
    $('#vdesc').textContent = info.desc || describe(e);
    const edges = Array.from({ length: 9 }, (_, k) => `<div class="edge" style="transform:translateZ(${(-1.4 + k * .35).toFixed(2)}px)"></div>`).join('');
    rot.innerHTML = `${edges}<div class="face front"></div><div class="face back">${BACK_HTML}</div>`;
    rot.querySelector('.front').appendChild(front);
    const back = rot.querySelector('.cb');

    // só mostra quando o CSS da carta carregou (evita piscar sem estilo)
    const show = () => { viewer.hidden = false; };
    root.querySelector('link').addEventListener('load', show);
    root.querySelector('link').addEventListener('error', show);
    setTimeout(show, 500);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const V = { rx: 10, ry: -200, vx: 0, vy: 0, hx: 0, hy: 0, thx: 0, thy: 0, zoom: 1, flip: 0, auto: false, drag: null, raf: 0 };

    function loop() {
      if (!V.drag) {
        if (V.flip !== null) {
          V.ry += (V.flip - V.ry) * .09;
          if (Math.abs(V.flip - V.ry) < .05) { V.ry = V.flip; V.flip = null; }
        } else {
          V.ry += V.vy; V.vy *= .95;
          if (V.auto) V.ry += .55;
        }
        V.rx += V.vx; V.vx *= .9;
        V.rx += (0 - V.rx) * .05;
      }
      V.hx += (V.thx - V.hx) * .08;
      V.hy += (V.thy - V.hy) * .08;
      const RX = V.rx + V.hx, RY = V.ry + V.hy;
      rot.style.transform = `scale(${V.zoom}) rotateX(${RX}deg) rotateY(${RY}deg)`;
      // A luz é fixa: conforme a carta gira, o reflexo "anda" pela superfície
      const sy = Math.sin(RY * Math.PI / 180), sx = Math.sin(RX * Math.PI / 180);
      const facingFront = Math.cos(RY * Math.PI / 180) * Math.cos(RX * Math.PI / 180) >= 0;
      const mx = clamp(50 + (facingFront ? sy : -sy) * 85, 0, 100), my = clamp(50 - sx * 85, 0, 100);
      for (const el of [front, back]) {
        el.style.setProperty('--mx', mx.toFixed(1) + '%');
        el.style.setProperty('--my', my.toFixed(1) + '%');
        el.style.setProperty('--o', 1);
      }
      const w = Math.abs(Math.cos(RY * Math.PI / 180));
      floor.style.transform = `translateX(-50%) scale(${(.35 + w * .65) * V.zoom}, ${V.zoom})`;
      V.raf = requestAnimationFrame(loop);
    }

    const flip = () => { V.vy = 0; V.flip = Math.round(V.ry / 180) * 180 + 180; };

    stage.addEventListener('pointerdown', ev => {
      V.drag = { x: ev.clientX, y: ev.clientY, moved: 0, onCard: !!ev.target.closest('.v-card') };
      V.flip = null; V.thx = V.thy = 0;
      stage.setPointerCapture(ev.pointerId);
      stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', ev => {
      if (V.drag) {
        const dx = ev.clientX - V.drag.x, dy = ev.clientY - V.drag.y;
        V.drag.x = ev.clientX; V.drag.y = ev.clientY; V.drag.moved += Math.abs(dx) + Math.abs(dy);
        V.ry += dx * .5; V.vy = dx * .5;
        V.rx = clamp(V.rx - dy * .4, -70, 70); V.vx = -dy * .25;
      } else {
        V.thy = (ev.clientX / innerWidth - .5) * 28;
        V.thx = -(ev.clientY / innerHeight - .5) * 22;
      }
    });
    const endDrag = () => {
      if (!V.drag) return;
      const clickedOutside = V.drag.moved < 5 && !V.drag.onCard;
      V.drag = null;
      stage.classList.remove('dragging');
      if (clickedOutside) close();
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', () => { if (!V.drag) V.thx = V.thy = 0; });
    stage.addEventListener('wheel', ev => { ev.preventDefault(); V.zoom = clamp(V.zoom - ev.deltaY * .0012, .6, 1.8); }, { passive: false });

    $('.v-close').addEventListener('click', close);
    $('.v-controls').addEventListener('click', ev => {
      const act = ev.target.closest('button')?.dataset.act;
      if (act === 'flip') flip();
      if (act === 'reset') { V.vy = 0; V.auto = false; V.zoom = 1; V.flip = Math.round(V.ry / 360) * 360; }
      if (act === 'auto') { V.auto = !V.auto; V.flip = null; }
      autoBtn.classList.toggle('on', V.auto);
    });

    function onKey(ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
      if (ev.key === 'f' || ev.key === 'F') flip();
    }
    window.addEventListener('keydown', onKey, true);

    function close() {
      if (!viewerState) return;
      cancelAnimationFrame(V.raf);
      window.removeEventListener('keydown', onKey, true);
      host.remove();
      document.body.style.overflow = prevOverflow;
      viewerState = null;
      if (typeof info.onClose === 'function') info.onClose();
    }

    viewerState = { close };
    V.raf = requestAnimationFrame(loop);
  }

  function closeViewer() {
    if (viewerState) viewerState.close();
  }

  /* ============================================================
     2. TRACKER (index.html)
     ============================================================ */
  function initTracker() {
    const charGroupsEl = document.getElementById('charGroups');
    if (!charGroupsEl || typeof renderCharCard !== 'function') return;
    registerProps();

    const isOn = () => state.config.cardStyleEnabled === true;
    const findCharacter = id => state.characters.find(ch => String(ch.id) === String(id));

    /* Personagem do tracker → dados da carta + config visual salva */
    function cardDataFor(c) {
      const op = typeof getOpStatus === 'function' ? getOpStatus(c) : { any: false, maxed: false };
      const roletas = typeof normalizeCharacterGenders === 'function' ? normalizeCharacterGenders(c.genders) : (c.genders || []);
      return {
        ...DEFAULT_VISUAL,
        ...readConfig(c.cardStyle).config,
        name: c.name || '',
        series: c.series && c.series !== '—' ? c.series : '',
        img: c.photo || '',
        kakera: Number(c.kakera) || 0,
        keys: Number(c.keys) || 0,
        op: op.maxed ? 'max' : op.any ? 'some' : 'none',
        roletas,
      };
    }

    /* ---------- Interruptor "CARTAS" ao lado de EFEITOS ---------- */
    const effectsControl = document.getElementById('effectsControl');
    let toggle = null;
    if (effectsControl) {
      const control = document.createElement('label');
      control.className = 'grid-details-control';
      control.id = 'cardStyleControl';
      control.title = 'Troca os cards pelo novo estilo de carta, com efeitos configuráveis por personagem (botão ✦)';
      control.innerHTML = `<span class="grid-details-label">CARTAS</span>
        <input type="checkbox" id="cardStyleToggle" />
        <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>`;
      effectsControl.after(control);
      toggle = control.querySelector('input');
      toggle.addEventListener('change', () => {
        state.config.cardStyleEnabled = toggle.checked;
        // CARTAS e INFORMAÇÕES não aparecem juntos: ligar as cartas desliga as informações
        if (toggle.checked) state.config.gridDetailsEnabled = false;
        renderCharacters();
        if (typeof scheduleSaveConfig === 'function') scheduleSaveConfig();
      });
    }

    /* Ligar INFORMAÇÕES desliga as cartas. Roda na fase de captura, antes do
       listener do script.js, para a renderização dele já sair no modo clássico. */
    const detailsToggle = document.getElementById('gridDetailsToggle');
    if (detailsToggle) {
      detailsToggle.addEventListener('change', () => {
        if (detailsToggle.checked && isOn()) state.config.cardStyleEnabled = false;
      }, { capture: true });
    }

    /* applyViewMode é chamado a cada renderização: sincroniza o modo novo junto */
    const originalApplyViewMode = applyViewMode;
    window.applyViewMode = function () {
      // config antiga com os dois ligados: as cartas têm prioridade
      if (isOn() && state.config.gridDetailsEnabled !== false) state.config.gridDetailsEnabled = false;
      originalApplyViewMode.apply(this, arguments);
      charGroupsEl.classList.toggle('mce-on', isOn());
      if (toggle) {
        toggle.checked = isOn();
        toggle.setAttribute('aria-checked', String(isOn()));
      }
    };

    /* ---------- Cada card ganha a carta nova + botão ✦ ---------- */
    const originalRenderCharCard = renderCharCard;
    window.renderCharCard = function (c) {
      const card = originalRenderCharCard.apply(this, arguments);
      if (isOn()) decorate(card, c);
      return card;
    };

    function decorate(card, c) {
      card.classList.add('mce-tcg');
      const host = createCardHost(cardDataFor(c));
      card.prepend(host);
      const actions = card.querySelector('.char-actions');
      // no modo de seleção (LIMPAR HAREM) as ações viram um checkbox: sem botão ✦
      // e o clique na carta continua marcando/desmarcando (tratado pelo script.js)
      if (!actions || actions.querySelector('.char-select-check')) return;
      // Clique/toque na carta abre o 3D novo direto. Sem isso, na grade compacta
      // em telas de toque o script.js usaria o toque só para mostrar os botões.
      host.addEventListener('click', ev => {
        ev.stopPropagation();
        const current = findCharacter(c.id) || c;
        openViewer(cardDataFor(current), { title: current.name, desc: current.series && current.series !== '—' ? current.series : '' });
      });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn mce-fx-btn';
      btn.title = 'Efeitos da carta';
      btn.textContent = '✦';
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        openEditor(c.id);
      });
      actions.insertBefore(btn, actions.querySelector('.edit-btn'));
    }

    /* ---------- 3D: no modo novo, o clique abre o visualizador novo ---------- */
    const originalOpenCardInspect = openCardInspect;
    window.openCardInspect = function (card) {
      if (isOn() && card && card.classList.contains('mce-tcg')) {
        const c = findCharacter(card.dataset.charId);
        if (c) {
          openViewer(cardDataFor(c), { title: c.name, desc: c.series && c.series !== '—' ? c.series : '' });
          return;
        }
      }
      return originalOpenCardInspect.apply(this, arguments);
    };

    /* ---------- Editor num iframe ---------- */
    let editing = null;

    function openEditor(id) {
      const c = findCharacter(id);
      if (!c || editing) return;
      const overlay = document.createElement('div');
      overlay.className = 'mce-editor-overlay';
      overlay.innerHTML = `<div class="mce-editor-frame" role="dialog" aria-modal="true" aria-label="Efeitos da carta de ${esc(c.name)}">
        <iframe src="card-effects.html?embed=1&v=1" title="Efeitos da carta"></iframe>
      </div>`;
      overlay.addEventListener('click', ev => { if (ev.target === overlay) closeEditor(); });
      document.body.appendChild(overlay);
      editing = { id: c.id, overlay, iframe: overlay.querySelector('iframe'), prevOverflow: document.body.style.overflow };
      document.body.style.overflow = 'hidden';
    }

    function closeEditor() {
      if (!editing) return;
      editing.overlay.remove();
      document.body.style.overflow = editing.prevOverflow;
      editing = null;
    }

    async function saveEditor(rawConfig) {
      const id = editing.id;
      const idx = state.characters.findIndex(ch => String(ch.id) === String(id));
      if (idx === -1) return closeEditor();
      const updated = { ...state.characters[idx], cardStyle: { ...DEFAULT_VISUAL, ...readConfig(rawConfig).config } };
      try {
        await Database.updateCharacter(updated);
        state.characters[idx] = updated;
        closeEditor();
        renderCharacters();
      } catch (err) {
        console.error('Erro ao salvar os efeitos da carta:', err);
        editing.iframe.contentWindow?.postMessage({ type: 'mce:save-error' }, '*');
      }
    }

    window.addEventListener('message', ev => {
      if (!editing || ev.source !== editing.iframe.contentWindow) return;
      const msg = ev.data || {};
      if (msg.type === 'mce:ready') {
        const c = findCharacter(editing.id);
        if (!c) return closeEditor();
        const data = cardDataFor(c);
        editing.iframe.contentWindow.postMessage({
          type: 'mce:init',
          character: Object.fromEntries(CHAR_KEYS.map(k => [k, data[k]])),
          config: visualConfig(data),
        }, '*');
      }
      if (msg.type === 'mce:save') saveEditor(msg.config);
      if (msg.type === 'mce:cancel') closeEditor();
    });

    document.addEventListener('keydown', ev => {
      if (editing && ev.key === 'Escape') closeEditor();
    });

    // a lista pode já ter sido desenhada antes deste arquivo carregar
    if (isOn()) renderCharacters();
  }

  /* ============================================================
     3. EDITOR (card-effects.html)
     ============================================================ */
  function initEditor() {
    registerProps();
    const embedded = new URLSearchParams(location.search).has('embed');
    document.body.classList.toggle('embedded', embedded);

    const STORE_KEY = 'mudae-card-editor';
    const DEMO_CHARACTER = {
      name: 'Lady', series: 'Devil May Cry 3', img: 'https://mudae.net/uploads/4576460/Zm6ZUF8~NjZDTlk.png',
      kakera: 940, keys: 12, op: 'max', roletas: ['wa', 'wg'],
    };

    /* estado = dados do personagem + config visual (a escolha do usuário, sem aplicar regras) */
    let state = { ...DEMO_CHARACTER, ...DEFAULT_VISUAL };
    let ready = !embedded;

    function loadStandalone() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (saved && typeof saved === 'object') {
          const chars = Object.fromEntries(CHAR_KEYS.filter(k => k in saved).map(k => [k, saved[k]]));
          state = { ...DEMO_CHARACTER, ...chars, ...DEFAULT_VISUAL, ...readConfig(saved).config };
        }
      } catch (err) { /* sem armazenamento: segue com o padrão */ }
    }
    function save() {
      if (embedded) return; // no tracker quem salva é o botão Salvar
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) { /* ignora */ }
    }
    if (!embedded) loadStandalone();

    /* ---------- Carta da prévia ---------- */
    const cardEl = document.getElementById('card');
    function renderCard() { paintCard(cardEl, state); }
    attachTilt(cardEl);
    const open3d = () => openViewer(state, { title: 'Sua carta' });
    cardEl.addEventListener('click', open3d);
    cardEl.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open3d(); } });

    /* ---------- Painel ---------- */
    const characterSection = embedded
      ? { title: 'Personagem', fields: [
          { type: 'info', id: 'charInfo', label: 'Nome' },
          { type: 'info', id: 'rarInfo', label: 'Raridade' },
          { type: 'info', id: 'keyInfo', label: 'Chaves' },
          { type: 'info', id: 'opInfo', label: '$op' },
          { type: 'info', id: 'roletaInfo', label: 'Roletas' },
        ] }
      : { title: 'Dados do personagem', fields: [
          { k: 'name', type: 'text', label: 'Nome' },
          { k: 'series', type: 'text', label: 'Série' },
          { k: 'img', type: 'text', label: 'URL da imagem' },
          { k: 'kakera', type: 'number', label: 'Kakera', min: 0, max: 99999 },
          { type: 'info', id: 'rarInfo', label: 'Raridade' },
          { k: 'keys', type: 'number', label: 'Chaves', min: 0, max: 9999 },
          { type: 'info', id: 'keyInfo', label: 'Nível da chave' },
          { k: 'op', type: 'chips', label: '$op', options: OPS },
          { k: 'roletas', type: 'multi', label: 'Roletas', options: ROLETAS.map(r => [r, '$' + r]) },
        ] };

    const SCHEMA = [
      { title: 'Modelos prontos', presets: true },
      characterSection,
      { title: 'Moldura', fields: [
        { k: 'borderColor', type: 'color', label: 'Cor', swatches: SWATCHES },
        { k: 'borderStyle', type: 'chips', label: 'Estilo', options: BORDER_STYLES },
        { k: 'bw', type: 'range', label: 'Espessura', min: 0, max: 6, step: .1, fmt: v => v <= .05 ? 'sem' : v.toFixed(1) },
      ] },
      { title: 'Foil holográfico', fields: [
        { k: 'foil', type: 'chips', options: FOILS },
        { k: 'fxi', type: 'range', label: 'Intensidade', min: 0, max: 1.5, step: .05, fmt: v => Math.round(v * 100) + '%' },
        { k: 'glit', type: 'check', label: 'Glitter' },
        { k: 'glare', type: 'range', label: 'Reflexo da luz', min: 0, max: 1.5, step: .05, fmt: v => Math.round(v * 100) + '%' },
      ] },
      { title: 'Ilustração', fields: [
        { k: 'filter', type: 'chips', options: FILTERS },
        { k: 'tint', type: 'color', label: 'Cor do filtro', swatches: TINTS },
        { k: 'soft', type: 'check', label: 'Bordas esfumadas' },
        { k: 'apy', type: 'range', label: 'Enquadramento', min: 0, max: 100, step: 1, fmt: v => v + '%' },
        { k: 'az', type: 'range', label: 'Zoom', min: 1, max: 1.8, step: .02, fmt: v => v.toFixed(2) + '×' },
      ] },
      { title: 'Textura', fields: [{ k: 'texture', type: 'chips', options: TEXTURES }] },
      { title: 'Animação', fields: [{ k: 'anim', type: 'chips', options: ANIMS }] },
      { title: 'Efeitos especiais', fields: [{ k: 'xfx', type: 'chips', options: XFX }] },
      { title: 'Texto', fields: [
        { k: 'font', type: 'chips', label: 'Fonte do nome', options: FONTS },
        { k: 'nameColor', type: 'color', label: 'Cor do nome', swatches: NAME_COLORS },
        { k: 'panel', type: 'chips', label: 'Rodapé', options: PANELS },
      ] },
    ];

    const panel = document.getElementById('panel');

    function fieldHTML(f) {
      let ctl = '';
      if (f.type === 'text') ctl = `<input type="text" data-k="${f.k}" spellcheck="false">`;
      if (f.type === 'number') ctl = `<input type="number" data-k="${f.k}" min="${f.min}" max="${f.max}">`;
      if (f.type === 'check') ctl = `<div class="chips-row"><button type="button" class="opt" data-k="${f.k}" data-toggle></button></div>`;
      if (f.type === 'chips') ctl = `<div class="chips-row">${f.options.map(([v, t]) => `<button type="button" class="opt" data-k="${f.k}" data-v="${v}">${t}</button>`).join('')}</div>`;
      if (f.type === 'multi') ctl = `<div class="chips-row">${f.options.map(([v, t]) => `<button type="button" class="opt" data-k="${f.k}" data-m="${v}">${t}</button>`).join('')}</div>`;
      if (f.type === 'color') ctl = `<div class="chips-row">${f.swatches.map(([c, t]) => `<button type="button" class="swatch" title="${t}" data-name="${t}" style="background:${c}" data-k="${f.k}" data-v="${c}"></button>`).join('')}<input type="color" data-k="${f.k}" title="Outra cor"></div>`;
      if (f.type === 'info') ctl = `<div class="info-line" id="${f.id}"></div>`;
      if (f.type === 'range') ctl = `<div class="range-wrap"><input type="range" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}"><output data-out="${f.k}"></output></div>`;
      return `<div class="field${f.label ? '' : ' full'}">${f.label ? `<label>${f.label}</label>` : ''}${ctl}</div>`;
    }

    panel.innerHTML = SCHEMA.map(sec => `<section class="sec"><h3>${sec.title}${SECTION_RULES[sec.title] ? `<span class="sec-rule" data-rule="${sec.title}"></span>` : ''}</h3>${sec.presets
      ? `<div class="field full"><div class="chips-row">${PRESETS.map(([n], i) => `<button type="button" class="opt" data-preset="${i}">${n}</button>`).join('')}</div></div>`
      : sec.fields.map(fieldHTML).join('')}</section>`).join('');

    const FIELD_BY_KEY = Object.fromEntries(SCHEMA.flatMap(s => s.fields || []).filter(f => f.k).map(f => [f.k, f]));

    /* Opção que um controle representa (para checar o bloqueio dela) */
    function controlValue(el) {
      if ('toggle' in el.dataset) return true;
      if (el.dataset.v !== undefined) return el.dataset.v;
      if (el.type === 'color') return '#000001'; // qualquer cor fora do padrão
      return null;
    }
    const setInfo = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

    function syncPanel() {
      const eff = effective(state);
      panel.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k, v = eff[k];
        const probe = controlValue(el);
        const lock = probe === null || !VISUAL_KEYS.includes(k) ? null : optionLock(k, probe, state);
        el.disabled = !!lock;
        if (el.matches('button')) {
          let on;
          if ('toggle' in el.dataset) { on = !!v; el.textContent = on ? 'Ligado' : 'Desligado'; }
          else if (el.dataset.m) on = v.includes(el.dataset.m);
          else on = String(v).toLowerCase() === el.dataset.v.toLowerCase();
          el.classList.toggle('on', on);
          if (el.matches('.opt')) el.title = lock || '';
          else el.title = lock ? `${el.dataset.name} · ${lock}` : el.dataset.name;
        } else {
          if (el.type === 'color') el.title = lock || 'Outra cor';
          if (el !== document.activeElement) el.value = v;
        }
      });
      panel.querySelectorAll('[data-out]').forEach(o => {
        const f = FIELD_BY_KEY[o.dataset.out];
        o.textContent = f.fmt ? f.fmt(state[f.k]) : state[f.k];
      });
      // título de cada seção com a regra (liberada ou não)
      panel.querySelectorAll('[data-rule]').forEach(chip => {
        const rule = SECTION_RULES[chip.dataset.rule], ok = rule.ok(state);
        chip.className = 'sec-rule ' + (ok ? 'ok' : 'locked');
        chip.textContent = (ok ? '✓ ' : '🔒 ') + rule.text;
      });
      // modelos prontos que usam algo bloqueado ficam desativados
      panel.querySelectorAll('[data-preset]').forEach(btn => {
        const lock = Object.entries(PRESETS[+btn.dataset.preset][1]).map(([k, v]) => optionLock(k, v, state)).find(Boolean);
        btn.disabled = !!lock;
        btn.title = lock ? `Precisa: ${lock.replace('Libera com ', '')}` : '';
      });
      // informações calculadas (não editáveis)
      const tier = getTier(state.kakera);
      setInfo('rarInfo', `<img src="${kakeraIcon(tier)}" alt=""><b style="color:${tier.text}">${tier.n}. ${tier.label} · ${tier.pt}</b><span>${fmtNum(state.kakera)} ◈ · faixa ${tierRange(tier)}</span>`);
      const kt = keyTier(state.keys), [ktName, ktRange] = KEY_TIER_INFO[kt];
      setInfo('keyInfo', `<span class="key-chip key-${kt}">${KEY_SVG}${embedded ? fmtNum(state.keys) + ' · ' : ''}${ktName}</span><span>${ktRange} chaves</span>`);
      setInfo('charInfo', `<div class="char-head"><b>${esc(state.name)}</b><span>${esc(state.series || '—')}</span></div>`);
      setInfo('opInfo', `<span class="op-chip ${state.op}">◈ ${label(OPS, state.op)}</span>`);
      setInfo('roletaInfo', state.roletas.length ? state.roletas.map(r => `<span class="chip">$${r}</span>`).join(' ') : '<span>Sem roleta</span>');
    }

    function commit() { save(); renderCard(); syncPanel(); }

    panel.addEventListener('click', ev => {
      const preset = ev.target.closest('[data-preset]');
      if (preset) {
        Object.assign(state, DEFAULT_VISUAL, PRESETS[+preset.dataset.preset][1]);
        return commit();
      }
      const b = ev.target.closest('button[data-k]');
      if (!b) return;
      const k = b.dataset.k;
      if ('toggle' in b.dataset) state[k] = !state[k];
      else if (b.dataset.m) {
        const set = new Set(state[k]);
        set.has(b.dataset.m) ? set.delete(b.dataset.m) : set.add(b.dataset.m);
        state[k] = ROLETAS.filter(r => set.has(r));
      } else state[k] = b.dataset.v;
      commit();
    });

    panel.addEventListener('input', ev => {
      const el = ev.target, k = el.dataset.k;
      if (!k) return;
      let v = el.value;
      if (el.type === 'number' || el.type === 'range') {
        v = Number(v);
        if (!Number.isFinite(v)) return;
        if (el.type === 'number') v = Math.max(0, Math.round(v));
      }
      state[k] = v;
      commit();
    });
    panel.addEventListener('focusout', syncPanel);

    /* ---------- Avisos ---------- */
    const toastEl = document.getElementById('toast');
    function toast(msg, isError = false) {
      toastEl.textContent = msg;
      toastEl.classList.toggle('error', isError);
      toastEl.classList.add('show');
      clearTimeout(toast.t);
      toast.t = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    /* ---------- Colar config ---------- */
    const pasteModal = document.getElementById('pasteModal');
    const pasteText = document.getElementById('pasteText');
    const pasteError = document.getElementById('pasteError');

    function showPasteError(msg) {
      pasteError.textContent = msg;
      pasteError.hidden = false;
    }
    async function openPaste() {
      pasteText.value = '';
      pasteError.hidden = true;
      pasteModal.hidden = false;
      pasteText.focus();
      // Se o navegador permitir, já traz o que estiver copiado
      try {
        const clip = (await navigator.clipboard.readText()).trim();
        if (clip.startsWith('{') && !pasteText.value) pasteText.value = clip;
      } catch (err) { /* sem permissão: o usuário cola com Ctrl+V */ }
    }
    const closePaste = () => { pasteModal.hidden = true; };

    function applyPaste() {
      let raw;
      try { raw = JSON.parse(pasteText.value); }
      catch (err) { return showPasteError('Isso não é um JSON válido. Confira se copiou a config inteira, de { até }.'); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return showPasteError('A config precisa ser um objeto, entre { e }.');
      const { config, ignored, charSkipped } = readConfig(raw);
      const applied = Object.keys(config);
      if (!applied.length) {
        return showPasteError(charSkipped.length
          ? 'Esse JSON só tem dados do personagem. A config da carta não inclui nome, kakera, chaves etc.'
          : 'Nenhum campo de visual reconhecido nesse JSON.');
      }
      state = { ...state, ...config };
      commit();
      closePaste();
      const notes = [];
      const blocked = applied.filter(k => optionLock(k, state[k], state));
      if (blocked.length) notes.push(`bloqueado pelas regras: ${blocked.join(', ')}`);
      if (ignored.length) notes.push(`ignorado: ${ignored.join(', ')}`);
      if (charSkipped.length) notes.push('dados do personagem mantidos');
      toast(notes.length ? `Config aplicada (${notes.join(' · ')})` : 'Config aplicada');
    }

    pasteModal.addEventListener('click', ev => {
      if (ev.target === pasteModal) return closePaste();
      const act = ev.target.closest('[data-paste]')?.dataset.paste;
      if (act === 'cancel') closePaste();
      if (act === 'apply') applyPaste();
    });
    pasteModal.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { ev.stopPropagation(); closePaste(); }
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) applyPaste();
    });

    /* ---------- Botões ---------- */
    const pick = list => list[Math.floor(Math.random() * list.length)][0];
    const randColor = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const post = msg => window.parent.postMessage(msg, '*');

    document.querySelector('.actions').addEventListener('click', async ev => {
      const act = ev.target.closest('button')?.dataset.act;
      if (!act || !ready) return;
      if (act === 'save') post({ type: 'mce:save', config: visualConfig(state) });
      if (act === 'cancel') post({ type: 'mce:cancel' });
      if (act === '3d') open3d();
      if (act === 'reset') { Object.assign(state, DEFAULT_VISUAL); commit(); toast('Visual da carta resetado'); }
      if (act === 'random') {
        // sorteia só entre as opções liberadas para este personagem
        const ok = (k, list) => list.filter(([v]) => !optionLock(k, v, state));
        const maybe = (k, list, chance) => Math.random() < chance ? pick(ok(k, list)) : DEFAULT_VISUAL[k];
        Object.assign(state, {
          borderColor: optionLock('borderColor', '#000001', state) ? DEFAULT_VISUAL.borderColor : (Math.random() < .5 ? pick(SWATCHES) : randColor()),
          borderStyle: pick(ok('borderStyle', BORDER_STYLES)), bw: +(Math.random() * 5).toFixed(1),
          foil: pick(ok('foil', FOILS)), fxi: 1, glit: !optionLock('glit', true, state) && Math.random() < .4, glare: 1,
          filter: maybe('filter', FILTERS, .5), tint: pick(TINTS), soft: false,
          texture: maybe('texture', TEXTURES, .4), anim: maybe('anim', ANIMS, .5), xfx: maybe('xfx', XFX, .5),
          font: pick(ok('font', FONTS)), nameColor: '#ffffff', panel: 'dark',
        });
        commit();
      }
      if (act === 'paste') openPaste();
      if (act === 'copy') {
        const json = JSON.stringify(visualConfig(effective(state)), null, 2);
        try { await navigator.clipboard.writeText(json); toast('Configuração copiada'); }
        catch (err) {
          const ta = Object.assign(document.createElement('textarea'), { value: json });
          document.body.appendChild(ta); ta.select();
          const copied = document.execCommand('copy'); ta.remove();
          toast(copied ? 'Configuração copiada' : 'Não deu para copiar', !copied);
        }
      }
    });

    /* Esc fecha o editor (no tracker), a menos que o 3D ou o "colar" esteja aberto */
    window.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || !embedded || isViewerOpen() || !pasteModal.hidden) return;
      post({ type: 'mce:cancel' });
    });

    /* ---------- Conversa com o tracker ---------- */
    if (embedded) {
      window.addEventListener('message', ev => {
        if (ev.source !== window.parent) return;
        const msg = ev.data || {};
        if (msg.type === 'mce:init') {
          const ch = msg.character || {};
          state = {
            name: String(ch.name || ''), series: String(ch.series || ''), img: String(ch.img || ''),
            kakera: Number(ch.kakera) || 0, keys: Number(ch.keys) || 0,
            op: ['none', 'some', 'max'].includes(ch.op) ? ch.op : 'none',
            roletas: Array.isArray(ch.roletas) ? ROLETAS.filter(r => ch.roletas.includes(r)) : [],
            ...DEFAULT_VISUAL,
            ...readConfig(msg.config).config,
          };
          ready = true;
          commit();
        }
        if (msg.type === 'mce:save-error') toast('Não deu para salvar. Tente de novo.', true);
      });
      post({ type: 'mce:ready' });
    }

    renderCard();
    syncPanel();
  }

  /* ---------- Inicialização automática ---------- */
  function boot() {
    if (document.body && document.body.dataset.page === 'card-editor') initEditor();
    else initTracker();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { TIERS, getTier, keyTier, DEFAULT_VISUAL, effective, optionLock, readConfig, createCardHost, openViewer, closeViewer };
})();
