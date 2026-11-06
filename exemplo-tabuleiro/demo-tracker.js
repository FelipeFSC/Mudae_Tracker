/* ============================================================
   DEMO-TRACKER.JS — substitui o tracker nesta pasta de testes
   ------------------------------------------------------------
   O jogo (waifuarena*.js) lê os personagens de `state.characters`,
   salva os pontos do $sk com `Database.updateCharacter` e usa
   `getOpStatus` / `normalizeCharacterGenders` do script.js.
   Aqui eles viram personagens de exemplo, e o que o jogo salva
   (pontos do $sk e classe) fica no localStorage deste navegador.
   ============================================================ */
const DEMO_STORE = 'mudae-tabuleiro-exemplo';
const DEMO_IMG = 'https://mudae.net/uploads/4391568/zheTgyS~ATclaje.png';

/* kakera de raridades diferentes, para ver as molduras; op: 'none' | 'some' | 'max' */
const DEMO_CHARACTERS = [
  { id: 'd1', name: "Jeanne d'Arc (Alter)", series: 'Fate/Grand Order', kakera: 2500, keys: 13, op: 'max', genders: ['wa', 'wg'] },
  { id: 'd2', name: 'Jeanne Caos',          series: 'Fate/Grand Order', kakera: 1600, keys: 10, op: 'max', genders: ['wa'] },
  { id: 'd3', name: 'Jeanne Escura',        series: 'Fate/Grand Order', kakera: 1100, keys: 7,  op: 'some', genders: ['wa'] },
  { id: 'd4', name: 'Jeanne Vermelha',      series: 'Fate/Grand Order', kakera: 820,  keys: 5,  op: 'some', genders: ['wg'] },
  { id: 'd5', name: 'Jeanne Laranja',       series: 'Fate/Grand Order', kakera: 560,  keys: 3,  op: 'none', genders: ['wa'] },
  { id: 'd6', name: 'Jeanne Amarela',       series: 'Fate/Grand Order', kakera: 400,  keys: 2,  op: 'none', genders: ['wa'] },
  { id: 'd7', name: 'Jeanne Verde',         series: 'Fate/Grand Order', kakera: 300,  keys: 1,  op: 'none', genders: ['wg'] },
  { id: 'd8', name: 'Jeanne Azul',          series: 'Fate/Grand Order', kakera: 160,  keys: 0,  op: 'none', genders: ['wa'] },
].map(c => ({ photo: DEMO_IMG, claimed: true, opLevels: {}, cardStyle: null, ...c }));

function loadDemoSaved() {
  try { return JSON.parse(localStorage.getItem(DEMO_STORE) || '{}') || {}; } catch (err) { return {}; }
}

/* o que o jogo salvou (pontos do $sk e classe) volta por cima dos personagens de exemplo */
const state = {
  characters: DEMO_CHARACTERS.map(c => ({ ...c, ...(loadDemoSaved()[c.id] || {}) })),
  config: {},
};

const Database = {
  async updateCharacter(c) {
    const saved = loadDemoSaved();
    saved[c.id] = { arenaSkills: c.arenaSkills, arenaClass: c.arenaClass };
    try { localStorage.setItem(DEMO_STORE, JSON.stringify(saved)); } catch (err) { /* sem armazenamento: vale só nesta aba */ }
    return c;
  },
};

function getOpStatus(c) {
  return { any: c.op === 'some' || c.op === 'max', maxed: c.op === 'max' };
}

function normalizeCharacterGenders(value) {
  return Array.isArray(value) ? value.filter(g => ['wa', 'wg', 'ha', 'hg'].includes(g)) : [];
}

/* No tracker, o script.js mostra a aba ativa; aqui a Arena é a única tela.
   setTimeout: roda depois do init() do waifuarena.js, que cria a #view-arena */
document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
  const view = document.getElementById('view-arena');
  if (view) view.classList.add('active');
  const reset = document.getElementById('demoReset');
  if (reset) reset.addEventListener('click', () => {
    if (!confirm('Apagar os pontos do $sk e as classes salvos neste exemplo?')) return;
    try { localStorage.removeItem(DEMO_STORE); } catch (err) { /* ignora */ }
    location.reload();
  });
}));
