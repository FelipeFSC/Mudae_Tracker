/* ============================================================
   TFT-ENGINE.JS — regras e combate do Mudae TFT (protótipo)
   ------------------------------------------------------------
   Sem DOM: só o estado do jogo. O anfitrião é quem roda este motor;
   o convidado manda ações e recebe o estado pronto (tft.js).

   Regras seguem a Season 14 (Cyber City). O que foi adaptado para
   o 1v1 ou simplificado está em TFT_RULES_NOTES e nos textos com
   "(adaptado)" das traits.
   ============================================================ */
const TFTEngine = (() => {
  'use strict';

  const D = typeof TFT_DATA !== 'undefined' ? TFT_DATA : require('./tft-data.js');
  const CH = Object.fromEntries(D.champions.map(c => [c.id, c]));
  const CH_BY_NAME = Object.fromEntries(D.champions.map(c => [c.name, c]));
  const TRAITS = Object.fromEntries(D.traits.map(t => [t.name, t]));
  const ITEMS = Object.fromEntries(D.items.map(i => [i.id, i]));
  const COMPONENTS = D.items.filter(i => !i.from).map(i => i.id);
  const FULL_ITEMS = D.items.filter(i => i.from && i.id !== 'ThiefsGloves').map(i => i.id);
  // consumível: não é componente nem vai para uma unidade
  const AUG_DATA = typeof TFT_AUGMENTS_DATA !== 'undefined' ? TFT_AUGMENTS_DATA : require('./tft-augments-data.js');
  const AUG_IMPL = typeof TFT_AUG_IMPL !== 'undefined' ? TFT_AUG_IMPL : require('./tft-augments.js');
  const CHAOS_ROUNDS = typeof TFT_CHAOS_ROUNDS !== 'undefined' ? TFT_CHAOS_ROUNDS : require('./tft-chaos.js');
  const REMOVER = 'MagneticRemover';
  ITEMS[REMOVER] = { id: REMOVER, name: 'Removedor Magnético', from: null, special: true, icon: 'assets/maps/tft/icons/items/hexcore/tft_consumable_itemremover.png', fx: {} };

  /* ---------- Constantes da season ---------- */
  const RULES = {
    startHp: 100, benchSize: 9, shopSize: 5, maxLevel: 10, maxItems: 3,
    rerollCost: 2, xpCost: 4, xpGain: 4, roundXp: 2,
    planSeconds: 30, carouselSeconds: 15,
    xpToLevel: [0, 2, 2, 6, 10, 20, 36, 48, 76, 84],     // índice = nível atual
    poolSize: { 1: 30, 2: 25, 3: 18, 4: 10, 5: 9 },
    odds: {                                                // chance (%) de custo 1 a 5
      1: [100, 0, 0, 0, 0], 2: [100, 0, 0, 0, 0], 3: [75, 25, 0, 0, 0],
      4: [55, 30, 15, 0, 0], 5: [45, 33, 20, 2, 0], 6: [30, 40, 25, 5, 0],
      7: [19, 30, 40, 10, 1], 8: [17, 24, 32, 24, 3], 9: [15, 18, 25, 30, 12], 10: [5, 10, 20, 40, 25],
    },
    stageDamage: [0, 0, 2, 5, 8, 10, 12, 17],              // índice = estágio (7+ fica em 17)
    passiveGold: { '1-2': 2, '1-3': 2, '1-4': 3, '2-1': 4 }, // demais rodadas: 5
    // casas pintadas do Demônio Urbano (coluna,linha; linha 0 = frente)
    paintedHexes: ['1,1', '2,1', '4,1', '5,1', '0,3', '3,0', '3,2', '6,3'],
  };

  /* ---------- Emblemas e consumíveis dos aumentos ---------- */
  const emblemId = trait => `Emblem_${trait}`;
  for (const t of D.traits) ITEMS[emblemId(t.name)] = { id: emblemId(t.name), name: `Emblema de ${t.name}`, from: null, special: true, emblem: t.name, icon: t.icon, fx: {} };
  const CONSUMABLES = {
    LesserDuplicator: { name: 'Duplicador de Campeão Inferior', maxCost: 3, icon: 'assets/maps/tft/icons/items/hexcore/tft_consumable_championduplicator_iii.png', text: 'Arraste até um campeão de custo 3 ou menos para receber uma cópia dele.' },
    ChampionDuplicator: { name: 'Duplicador de Campeão', maxCost: 5, icon: 'assets/maps/particles/tft/item_icons/consumables/championduplicator_v.png', text: 'Arraste até um campeão para receber uma cópia dele.' },
    Reforger: { name: 'Reforjador', icon: 'assets/maps/tft/icons/items/hexcore/tft_consumable_itemreroller.png', text: 'Arraste até uma unidade para trocar os itens dela por outros do mesmo tipo.' },
    Recombobulator: { name: 'Recombobulador de Bolso', maxCost: 2, icon: 'assets/maps/tft/icons/items/hexcore/tft17_carouselmarket_recombobulator.png', text: 'Arraste até um campeão de custo 1 ou 2 para transformá-lo em um de custo maior, mantendo as estrelas.' },
  };
  for (const [id, c] of Object.entries(CONSUMABLES)) ITEMS[id] = { id, name: c.name, from: null, special: true, use: id, icon: c.icon, text: c.text, fx: {} };

  /* ---------- Habilidades ----------
     Cada campeão usa os números oficiais (por estrela) num modelo único:
     dmg = base × PH/100, ad = razão de Dano de Ataque, type p/m/t (físico,
     mágico, verdadeiro), target cur/far/low, hits = alvos, volley = repetições,
     splash + radius = dano em volta, stun, shield/shieldHp/shieldDur,
     heal/healHp, hpGain, aura (dano por s) + auraDur, buffAS + buffDur,
     sunder/shred (fatia armadura/RM), wound, dot (duração em s). */
  const ABILITIES = {
    'Alistar': { steps: [{ shape: 'target', dmg: [240, 360, 600], type: 'm', stun: 2 }] },
    'Dr. Mundo': { ad: 2, type: 'p', heal: [75, 115, 175], healHp: 0.02 },
    'Jax': { dmg: [110, 165, 250], type: 'm', radius: 1, splash: [110, 165, 250], shield: [350, 425, 525], shieldDur: 4 },
    'Kindred': { steps: [{ shape: 'target', travel: 9, ad: [5.2, 5.2, 5.75], dmg: [20, 30, 45], type: 'p', overkill: true }] },
    "Kog'Maw": { buffAS: 0.8, buffDur: 5, dmg: [9, 14, 20], ad: 0.4, type: 'p' },
    'Morgana': { dmg: [400, 600, 1000], type: 'm', dot: 16 },
    'Nidalee': { dmg: [220, 330, 500], type: 'm', heal: [100, 125, 210] },
    'Poppy': { shield: [425, 500, 600], shieldDur: 3, aim: { far: 4 }, steps: [{ shape: 'area', radius: 1, travel: 9, dmg: [100, 150, 225], armorPct: [1.6, 2.4, 3.6], otherMul: 0.4, type: 'm' }] },
    'Seraphine': { steps: [{ shape: 'line', len: 'edge', dmg: [250, 375, 600], reduce: 0.4, type: 'm' }] },
    'Shaco': { ad: 3, dmg: [40, 60, 90], type: 'p', target: 'low' },
    'Sylas': { dmg: [100, 150, 225], type: 'm', radius: 1, splash: [100, 150, 225], heal: [150, 200, 250] },
    'Vi': { ad: 3, type: 'p', shield: [260, 335, 500], shieldHp: 0.15, shieldDur: 4 },
    'Zyra': { teamAS: 0.01, steps: [{ shape: 'target', travel: 12, dmg: [305, 460, 685], type: 'm', stun: 1 }, { shape: 'nearest', n: 1, travel: 12, dmg: [150, 225, 340], type: 'm' }] },
    'Darius': { ad: 2, type: 'p', radius: 1, splashAd: 1, heal: [200, 220, 260], healHp: 0.06 },
    'Ekko': { dmg: [180, 270, 410], type: 'm', radius: 1, splash: [180, 270, 410], heal: [330, 415, 525] },
    'Graves': { attacksPerCast: 2, attackCone: { len: 2, pellets: 5, ad: 0.33 }, steps: [{ shape: 'cone', len: 3, pellets: 10, ad: [0.4, 0.4, 0.48], dmg: [6, 9, 16], type: 'p' }] },
    'Illaoi': { dmg: [150, 225, 350], type: 'm', radius: 1, splash: [60, 90, 140], heal: [350, 400, 600], shred: 0.3 },
    'Jhin': { ad: 1.64, type: 'p', hits: 4, sunder: 0.2 },
    'LeBlanc': { dmg: [75, 115, 170], type: 'm', volley: 5 },
    'Naafiri': { ad: 2.75, type: 'p' },
    'Rhaast': { ad: 5.25, type: 'p', stun: 1.75, heal: [220, 250, 300], healHp: 0.1 },
    'Shyvana': { hpGain: [210, 285, 360], aura: [18, 27, 40], auraDur: 99 },
    'Skarner': { dmg: [40, 60, 90], type: 'm', radius: 1, splash: [40, 60, 90], shield: [325, 375, 450], shieldDur: 3 },
    'Twisted Fate': { steps: [{ shape: 'target', travel: 11, dmg: [220, 330, 500], type: 'm' }, { shape: 'nearest', n: 1, travel: 11, dmg: [220, 330, 500], type: 'm' }] },
    'Vayne': { ad: 1.6, dmg: [10, 15, 25], type: 't' },
    'Veigar': { dmg: [320, 450, 600], type: 'm', radius: 1, splash: [125, 170, 240] },
    'Braum': { dmg: [100, 150, 240], type: 'm', radius: 1, splash: [100, 150, 240], shield: [375, 400, 450], shieldHp: 0.1, shieldDur: 4 },
    'Draven': { aim: { line: true }, steps: [{ shape: 'line', len: 'edge', ad: [3.7, 3.7, 3.9], dmg: [30, 45, 80], reduce: 0.2, type: 'p' }, { shape: 'line', len: 'edge', delay: 0.5, ad: [2.4, 2.4, 2.5], reduce: 0.2, type: 'p', sameLine: true }] },
    'Elise': { dmg: [54, 81, 125], type: 'm', volley: 4 },
    'Fiddlesticks': { aura: [190, 285, 445], auraDur: 3, auraRadius: 2, auraHeal: 0.15 },
    'Galio': { durable: [0.55, 0.55, 0.6], durableDur: 3, channel: 3, steps: [{ shape: 'line', len: 3, delay: 3, lateAim: 'topDamager', dmg: [150, 225, 335], type: 'm', stun: 1.5, selfHeal: [425, 500, 600] }] },
    'Gragas': { heal: [300, 325, 380], healHp: 0.1, aim: { group: 1, range: 3 }, steps: [{ shape: 'area', radius: 1, travel: 6, dmg: [150, 225, 335], type: 'm', wound: true }] },
    'Jarvan IV': { ad: 2.8, type: 'p', radius: 1, splashAd: 1.4, shield: [300, 350, 400], shieldDur: 4 },
    'Jinx': { ad: 1.4, dmg: [15, 25, 40], type: 'p', volley: 3 },
    'Mordekaiser': { shield: [475, 525, 700], shieldDur: 4, steps: [{ shape: 'line', len: 2, dmg: [200, 300, 500], type: 'm', stun: 1.25 }] },
    'Rengar': { ad: 3, type: 'p', target: 'low', heal: [140, 145, 150] },
    'Senna': { steps: [{ shape: 'line', beyond: 2, ad: [2.8, 2.8, 3], dmg: [20, 30, 45], type: 'p' }] },
    'Varus': { dmg: [200, 300, 480], type: 'm', stun: 1, radius: 1, splash: [100, 150, 240] },
    'Yuumi': { dmg: [100, 150, 235], type: 'm', hits: 3 },
    'Annie': { steps: [{ shape: 'target', travel: 9, dmg: [230, 345, 1200], type: 'm' }, { shape: 'nearest', n: 2, includeMain: true, delay: 0.12, travel: 11, dmg: [42, 63, 300], type: 'm' }] },
    'Aphelios': { aim: { group: 2, range: 'attack' }, chakram: { base: 4, attacks: 8, ad: [0.11, 0.11, 1] }, steps: [{ shape: 'area', radius: 2, travel: 14, ad: [2.2, 2.2, 6], dmg: [20, 30, 100], type: 'p' }] },
    'Brand': { aim: { group: 1, range: 'attack' }, steps: [{ shape: 'area', radius: 1, travel: 8, dmg: [260, 390, 1500], type: 'm' }, { shape: 'nearest', n: 4, delay: 0.15, travel: 8, dmg: [100, 150, 600], type: 'm' }] },
    "Cho'Gath": { hpGain: [70, 100, 500], steps: [{ shape: 'cone', len: 3, dmg: [100, 150, 1500], hpPct: 0.03, type: 'm' }] },
    'Leona': { durable: [0.55, 0.6, 0.9], durableDur: 4, aim: { group: 1, range: 2 }, steps: [{ shape: 'area', radius: 1, dmg: [100, 150, 2000], type: 'm', stunCenter: 2 }] },
    'Miss Fortune': { ad: 0.5, dmg: [8, 12, 100], type: 'p', volley: 10, target: 'rand' },
    'Neeko': { dmg: [80, 120, 1800], type: 'm', radius: 2, splash: [80, 120, 1800], shield: [295, 315, 1500], shieldHp: 0.1, shieldDur: 4 },
    'Sejuani': { steps: [{ shape: 'area', radius: 3, delay: 2, dmg: [120, 180, 1800], type: 'm', stun: [1.75, 2, 8] }] },
    'Vex': { steps: [{ shape: 'line', toTarget: true, dmg: [100, 150, 600], type: 'm' }, { shape: 'area', radius: 1, delay: 0.35, dmg: [190, 285, 1150], other: [100, 150, 600], type: 'm' }] },
    'Xayah': { ad: 2, dmg: [20, 30, 200], type: 'p', hits: 4 },
    'Zed': { ad: 2.7, dmg: [40, 60, 800], type: 'p', target: 'low', hits: 3 },
    'Zeri': { buffAS: 0.9, buffDur: 5, ad: 0.4, type: 'p' },
    'Ziggs': { aim: { plus: true, range: 'attack' }, steps: [{ shape: 'plus', radius: 1, travel: 7, dmg: [265, 400, 1500], far: [130, 200, 900], soloMul: 2, type: 'm' }] },
    'Aurora': { dmg: [280, 420, 5000], type: 'm', hits: 3 },
    'Garen': { shield: [700, 1000, 21337], shieldDur: 1.5, refund: { atMost: 2, mana: 30 }, steps: [{ shape: 'target', ad: [6.5, 6.5, 30], type: 'p' }, { shape: 'line', len: 'edge', delay: 0.15, ad: [2.6, 2.6, 15], type: 'p', skipMain: true }] },
    'Kobuko': { dmg: [300, 450, 13370], type: 'm', stun: 1.5, radius: 1, splash: [150, 225, 1337] },
    'Renekton': { ad: 1, dmg: [310, 465, 1000], type: 'p', radius: 1, splash: [155, 232, 500], hpGain: [400, 650, 10000] },
    'Samira': { ad: 0.9, type: 'p', volley: 8 },
    'Urgot': { buffAS: 0.8, buffDur: 5, dmg: [8, 12, 100], ad: 0.3, type: 'p' },
    'Viego': { dmg: [200, 300, 10000], type: 'm', radius: 2, splash: [90, 135, 10000] },
    'Zac': { dmg: [140, 210, 1000], type: 'm', radius: 2, stun: 1, stunAoe: true, heal: [80, 100, 2000] },
  };

  /* ---------- Textos curtos (dicas da tela) ---------- */
  const TRAIT_TEXT = {
    'Brutamontes': 'Equipe recebe +100 de Vida; Brutamontes recebem % de Vida.',
    'Bastião': 'Equipe recebe Armadura e RM; Bastiões recebem mais, em dobro nos primeiros 10s.',
    'Vanguarda': 'Escudo por % da Vida no início e com 50% de Vida; durabilidade enquanto há escudo.',
    'Dizimador': 'Recebem % de Dano de Ataque e Vampirismo Universal.',
    'Fumegante': 'Equipe +10% de Vel. de Ataque; Fumegantes acumulam mais a cada ataque (até 10x).',
    'Estratégico': 'Duas linhas de trás: amplificação de dano. Duas da frente: durabilidade. Estratégicos recebem o triplo.',
    'Atirador': 'Recebem % de Dano de Ataque, em dobro após 8s.',
    'Boi Dourado': 'Recebem amplificação de dano e têm chance de dar ouro ao abater.',
    'Boom Bot': 'A cada 400 de dano causado, disparam um míssil de dano mágico no inimigo próximo.',
    'Tecnológico': 'Recebem Poder de Habilidade; inimigos atingidos pela habilidade causam 10% menos dano por 3s.',
    'Dínamo': 'A cada 3s a equipe recebe Mana; Dínamos recebem o dobro.',
    'Carrasco': 'Habilidades podem causar crítico; recebem chance e dano crítico.',
    'A.M.P.': 'Recebem Vida e aumentam o dano da habilidade conforme a Amplificação. (adaptado)',
    'Esquadrão Anima': 'Recebem Armadura, RM e amplificação; uma arma dispara a cada 4s causando 6% da Vida máxima do alvo. (adaptado: sem escolha de arma)',
    'ExoTec': 'Recebem Vida e Vel. de Ataque por item equipado, contando 1 item a mais. (adaptado: sem itens ExoTec)',
    'Demônio Urbano': 'Aliados nas casas pintadas recebem Vida, DA e PH; Demônios recebem o dobro. (adaptado: casas fixas)',
    'Transgressor': 'Recebem Vida e amplificação; o mais forte usa o Chapéu e causa +30% com a habilidade. (adaptado)',
    'Divinicorp': 'Cada Divinicorp diferente dá um bônus à equipe (PH, resistências, DA, Vida, crítico, Vel. de Ataque); Divinicorps recebem o dobro.',
    'Ciberchefão': 'O Ciberchefão mais forte recebe % de Vida e PH, e a habilidade atinge +1 inimigo.',
    'Cifra': 'Recebem DA e PH; +1 de ouro ao perder um combate. (adaptado: sem Informação)',
    'Nitro': 'A cada rodada acumula Cromo pelas estrelas dos Nitro; o Nitro mais forte recebe Vida e PH por Cromo. (adaptado: sem R-080T)',
    'Mata-almas': 'Viego cura 25% da Vida e causa +10% de dano a cada abate. (adaptado: sem holograma)',
    'Soberano': 'Renekton atinge o aliado da casa atrás no início (40% da Vida) e recebe parte da Vida e do DA dele.',
    'Deus das Redes': 'Garen recebe +25% de Vida e DA. (adaptado: sem Arsenal)',
    'Vírus': 'Zac recebe +30% de Vida e +30 de PH. (adaptado: sem Pedaços na loja)',
    'Atirador de Elite': 'Causa mais dano a alvos mais distantes.',
  };

  const ITEM_TEXT = {
    RabadonsDeathcap: 'Amplifica o dano.', InfinityEdge: 'A habilidade pode causar crítico.',
    FrozenHeart: 'Início: +20 de Mana. Com 40% de Vida: +15 de Mana e escudo de 20%.', Redemption: 'Regenera 2% da Vida perdida por segundo.',
    ThiefsGloves: 'Equipa 2 itens aleatórios a cada combate e ocupa os 3 espaços.', GuinsoosRageblade: '+7% de Vel. de Ataque acumulada por segundo.',
    IonicSpark: 'Reduz 30% da RM de inimigos a 2 casas; dano quando eles conjuram.', SteraksGage: 'Com 60% de Vida: escudo de 40%.',
    DragonsClaw: 'Cura 2,5% da Vida máxima a cada 2s.', PowerGauntlet: 'Críticos dão +5% de dano por 5s (até 4x).',
    GargoyleStoneplate: '+10 de Armadura e RM por inimigo mirando o usuário.', BrambleVest: 'Sofre 5% menos dano de ataques; ao ser atingido causa 100 em volta (2s).',
    MadredsBloodrazor: '+15% de dano contra tanques.', RedBuff: 'A cada 2s queima e fere um inimigo próximo.',
    UnstableConcoction: '+15% de DA, +15 de PH e 12% de Vampirismo.', GuardianAngel: 'Com 60% de Vida: 1s inalvejável, limpa efeitos e cura 20% da Vida perdida.',
    TitansResolve: 'Acumula 2% de DA e 2 de PH ao atacar ou sofrer dano (até 25x).', RunaansHurricane: 'Ataques acumulam 4% de DA (até 15x); depois, +15% de Vel. de Ataque.',
    Bloodthirster: 'Com 40% de Vida: escudo de 25%.', ArchangelsStaff: '+20 de PH a cada 5s.',
    SpearOfShojin: 'Ataques dão +5 de Mana.', SpectralGauntlet: 'Reduz 30% da Armadura de inimigos a 2 casas; +15 de resistências por 15s.',
    Leviathan: 'Ataques dão +2 de Mana (4 no crítico).', Morellonomicon: 'Ataques e habilidades queimam e ferem.',
    RapidFireCannon: 'Ataques e habilidades queimam e ferem.', Crownguard: 'Início: escudo de 25% por 8s; depois, +25 de PH.',
    AdaptiveHelm: 'Tanques: +30 de resistências. Demais: +10% de DA e +10 de PH.', LastWhisper: 'Dano reduz 30% da Armadura do alvo por 3s.',
    BlueBuff: 'Recebe 10% a mais de DA e PH.', JeweledGauntlet: 'A habilidade pode causar crítico.',
    NightHarvester: '5% de durabilidade; 15% acima de 50% de Vida.', Quicksilver: 'Imune a atordoamento por 18s; +3% de Vel. de Ataque por segundo.',
    Deathblade: 'Amplifica o dano.', WarmogsArmor: 'Recebe 18% de Vida máxima.',
    StatikkShiv: 'Dano reduz 30% da RM do alvo por 5s.', HextechGunblade: 'Cura o aliado mais ferido em 20% do dano causado.',
    MagneticRemover: 'Arraste até uma unidade: todos os itens dela voltam intactos para o banco de itens.',
  };

  /* bônus de cada faixa, com os mesmos valores que applyTraits usa no combate */
  const pct = v => `${Math.round(v * 100)}%`;
  const TRAIT_TIER_TEXT = {
    'Brutamontes': v => `+${pct(v.HealthBonus)} de Vida`,
    'Bastião': v => `+${v.BonusArmor} de Armadura e RM`,
    'Vanguarda': v => `Escudo de ${pct(v.ShieldPercentAmount)} da Vida`,
    'Dizimador': v => `+${pct(v.AttackDamage)} de DA e ${pct(v.Healing)} de Vampirismo`,
    'Fumegante': v => `+${pct(v.AttackSpeed)} de Vel. de Ataque por ataque`,
    'Estratégico': v => `${pct(v.DamageAmp)} de amplificação atrás, ${pct(v.Durability)} de durabilidade na frente`,
    'Atirador': v => `+${pct(v.BonusAD)} de DA`,
    'Boi Dourado': v => `${pct(v.DamageAmp)} de amplificação e ${pct(v.KillDrop)} de chance de ouro`,
    'Boom Bot': v => `Míssil de ${v.MissileDamage} de dano mágico`,
    'Tecnológico': v => `+${v.APBonus} de PH`,
    'Dínamo': v => `+${v.Mana} de Mana a cada 3s`,
    'Carrasco': v => `+${pct(v.CRIT_PERCENT)} de chance e +${pct(v.CRIT_DAMAGE)} de dano crítico`,
    'A.M.P.': v => `+${v.HPAmt} de Vida e +${pct(0.05 * v.SuperchargeAmount)} de dano da habilidade`,
    'Esquadrão Anima': v => `+${v.Resists} de Armadura e RM, ${pct(v.DamageAmp)} de amplificação`,
    'ExoTec': v => `+${v.HealthBonus} de Vida e +${v.ASBonus}% de Vel. de Ataque por item`,
    'Demônio Urbano': v => `+${pct(v.HP)} de Vida, +${v.ADAP}% de DA e +${v.ADAP} de PH`,
    'Transgressor': v => `+${v.MobHealth} de Vida, ${pct(v.DamageAmp)} de amplificação, ${v.NumBosses} Chapéu(s)`,
    'Divinicorp': v => `Bônus de cada Divinicorp × ${Math.round(v.DivinicorpBonus * 100) / 100}`,
    'Ciberchefão': v => `${v.min >= 4 ? 'Todos recebem' : 'O mais forte recebe'} +${pct(num(v.BossPercentHealth || v.BigBossPercentHealth))} de Vida e +${num(v.BossAP || v.BigBossAP)} de PH`,
    'Cifra': v => `+${pct(v.AttackDamage)} de DA e +${v.AbilityPower} de PH`,
    'Nitro': v => `+${v.HealthPerScrap} de Vida e +${v.APPerScrap} de PH por Cromo`,
    'Mata-almas': () => 'Cura 25% da Vida e +10% de dano por abate',
    'Soberano': v => `Recebe ${pct(v.PercentHPGain)} da Vida e ${pct(v.PercentADGain)} do DA do aliado atrás`,
    'Deus das Redes': () => '+25% de Vida e de DA',
    'Vírus': () => '+30% de Vida e +30 de PH',
    'Atirador de Elite': v => `+${v.PercentDamageIncrease}% de dano por casa de distância`,
  };
  const traitTiers = name => TRAITS[name].tiers.map(v => ({ min: v.min, text: TRAIT_TIER_TEXT[name](v) }));

  const TANK_ROLES = new Set(['ADTank', 'APTank']);
  const num = v => Number(v) || 0;
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];

  /* ---------- RNG com semente ---------- */
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Rodadas ---------- */
  function roundInfo(idx, mode) {
    if (mode === 'chaos') {
      const stage = 1 + Math.floor(idx / 10), n = 1 + idx % 10;
      return { stage, n, label: `${stage}-${n}`, type: CHAOS_ROUNDS[idx] && CHAOS_ROUNDS[idx].boss ? 'boss' : 'chaos' };
    }
    if (idx < 4) return { stage: 1, n: idx + 1, label: `1-${idx + 1}`, type: idx === 0 ? 'carousel' : 'pve' };
    const stage = 2 + Math.floor((idx - 4) / 7);
    const n = 1 + (idx - 4) % 7;
    return { stage, n, label: `${stage}-${n}`, type: n === 4 ? 'carousel' : n === 7 ? 'pve' : 'pvp' };
  }

  const stageDamage = stage => RULES.stageDamage[Math.min(stage, 7)];
  const streakGold = s => { const a = Math.abs(s); return a >= 6 ? 3 : a === 5 ? 2 : a >= 2 ? 1 : 0; };

  /* ---------- Waifus como skins dos campeões ----------
     Junta as coleções (alternando entre os jogadores, até 60), ordena por
     kakera e distribui: as mais caras viram os campeões de maior custo. */
  function buildSkins(rosters, seed) {
    const rng = makeRng(seed);
    const shuffle = list => {
      const a = list.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    const queues = rosters.map(shuffle);
    const seen = new Set();
    const chosen = [];
    while (chosen.length < D.champions.length && queues.some(q => q.length)) {
      for (const q of queues) {
        while (q.length) {
          const c = q.pop();
          const key = String(c.name).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          chosen.push(c);
          break;
        }
        if (chosen.length >= D.champions.length) break;
      }
    }
    chosen.sort((a, b) => num(b.kakera) - num(a.kakera));

    const skins = {};
    let start = 0;
    for (const cost of [5, 4, 3, 2, 1]) {
      const champs = shuffle(D.champions.filter(c => c.cost === cost));
      const end = cost === 1 ? chosen.length : Math.min(chosen.length, start + Math.round(chosen.length * champs.length / D.champions.length));
      chosen.slice(start, end).forEach((c, i) => {
        if (champs[i]) skins[champs[i].id] = { name: c.name, series: c.series || '', photo: c.photo || '', kakera: num(c.kakera) };
      });
      start = end;
    }
    return skins;
  }

  /* Coleção do jogador: aplicada só na tela dele, por cima do sorteio.
     Se o sorteio pôs um personagem vinculado em outro campeão, esse campeão
     recebe uma das fotos deslocadas pelos vínculos, para ninguém repetir. Se
     não sobrar foto, ele volta à imagem original. */
  function applyCollection(baseSkins, pins) {
    const lower = s => String(s.name).toLowerCase();
    const pinnedNames = new Set();
    const valid = Object.entries(pins || {}).filter(([id, skin]) => {
      if (!CH[id] || !skin || !skin.name || pinnedNames.has(lower(skin))) return false;
      pinnedNames.add(lower(skin));
      return true;
    });
    const out = { ...baseSkins };
    const pinnedIds = new Set(valid.map(([id]) => id));
    const displaced = valid
      .map(([id]) => baseSkins[id])
      .filter(skin => skin && !pinnedNames.has(lower(skin)));
    for (const [id, skin] of Object.entries(baseSkins)) {
      if (pinnedIds.has(id) || !pinnedNames.has(lower(skin))) continue;
      if (displaced.length) out[id] = displaced.pop();
      else delete out[id];
    }
    for (const [id, skin] of valid) out[id] = skin;
    return out;
  }

  /* ---------- Jogo ---------- */
  function newPlayer(name, bot) {
    return {
      name, bot: !!bot, hp: RULES.startHp, gold: 0, xp: 0, level: 1, streak: 0, ready: false, locked: false,
      shop: Array(RULES.shopSize).fill(null), bench: Array(RULES.benchSize).fill(null), board: {}, items: [],
      chrome: 0, carousel: null, picked: false, lastResult: null,
      alive: true, left: false, placement: null, recent: [],
      augments: [], augState: {}, offer: null, choices: [], freeRerolls: 0, shopOff: 0, lockedRounds: 0, boughtThisRound: 0, boughtLast: 0, lastInterest: 0, wins: 0, combats: 0,
    };
  }

  function createChaosGame({ name, seed, skins = {} }) {
    const g = createGame({ names: [name, 'Horuja'], seed, bots: [false, true], skins });
    g.mode = 'chaos';
    g.score = 0;
    g.noAugmentRounds = true;
    const p = g.players[0];
    p.hp = 3;
    p.maxHp = 3;
    p.gold = 3;
    p.level = 2;
    p.items.push(REMOVER);
    // Com 3 de ouro só dá para comprar uma unidade: 2 campeões iniciais evitam perder a 1-1 de graça.
    const ones = D.champions.filter(c => c.cost === 1);
    for (let i = 0; i < 2; i++) {
      const pick = randPick(g, ones);
      p.bench[i] = { uid: g.nextUid++, c: pick.id, star: 1, items: [] };
      g.pool[pick.id]--;
    }
    g.players[1].hp = 30;
    g.players[1].maxHp = 30;
    return g;
  }

  /* time inimigo de uma rodada do caos */
  function chaosTeam(idx) {
    const round = CHAOS_ROUNDS[idx];
    const units = [];
    const front = [3, 2, 4, 1, 5, 0, 6], back = [3, 2, 4, 1, 5, 0, 6];
    let f = 0, b = 0;
    const spot = range => {
      if (range <= 2) { const i = f++; return { x: front[i % 7], y: i < 7 ? 0 : 1 }; }
      const i = b++;
      return { x: back[i % 7], y: i < 7 ? 3 : 2 };
    };
    for (const [name, star, items, count = 1] of round.units || []) {
      const ch = CH_BY_NAME[name];
      for (let i = 0; i < count; i++) units.push({ c: ch.id, star, items: items.slice(), uid: null, ...spot(ch.range) });
    }
    const creeps = (round.creeps || []).map(key => { const pos = spot(CREEPS[key].range); return { key, spot: `${pos.x},${pos.y}` }; });
    return { units, creeps, chrome: 0 };
  }

  function grantReward(g, p, reward) {
    const api = augApi(g, p, null);
    if (reward.gold) api.gold(reward.gold);
    if (reward.comps) api.comps(reward.comps);
    (reward.unit || []).forEach(cost => api.unit(cost));
    (reward.item || []).forEach(id => api.item(id));
    if (reward.dup) api.dup(reward.dup, 1);
    if (reward.reforger) api.reforger(reward.reforger);
    if (reward.anvil) api.anvil(reward.anvil);
    api.rerolls(1);
  }

  const CHAOS_AUGMENT = { '1-5': 2, '2-5': 2, '3-5': 3 };
  function chaosNextRound(g) {
    const p = g.players[0];
    const info = roundInfo(g.roundIdx, 'chaos');
    p.ready = false;
    p.lastResult = null;
    g.players[1].ready = true;
    if (g.roundIdx > 0) {
      const mods = playerMods(g, p);
      p.lastInterest = Math.min(mods.interestCap != null ? mods.interestCap : 5, Math.floor(p.gold / 10));
      p.gold += p.lastInterest;
      augApi(g, p, null).xp(RULES.roundXp);
    }
    p.boughtLast = p.boughtThisRound;
    p.boughtThisRound = 0;
    if (p.lockedRounds > 0) p.lockedRounds--;
    if (p.shopOff > 0) { p.shopOff--; p.shop = p.shop.map(() => null); }
    else if (!p.locked) refreshShop(g, p);
    runHook(g, p, 'round', { ...info, type: 'pvp' });
    if (info.n === 1 && info.stage >= 2) runHook(g, p, 'stage', info);
    if (CHAOS_AUGMENT[info.label] != null) makeOffer(g, p, CHAOS_AUGMENT[info.label], 'horuja');
    g.pairs = null;
    g.combat = null;
    g.phase = 'plan';
    return info;
  }

  function finishChaos(g) {
    const p = g.players[0];
    const c = g.combat;
    const f = c.fights[0];
    const round = CHAOS_ROUNDS[g.roundIdx];
    settleAugments(g, c);
    p.gold += f.goldDrops[0];
    const won = f.winner === 0;
    if (won) {
      grantReward(g, p, round.reward);
      g.score += (round.boss ? 500 : 100) * (1 + Math.floor(g.roundIdx / 10)) + 25 * f.survivors + 25 * p.hp;
      p.lastResult = { res: 'win', dmg: 0 };
      addLog(g, `${roundInfo(g.roundIdx, 'chaos').label}: venceu ${round.name}`);
    } else {
      p.hp -= 1;
      p.lastResult = { res: 'lose', dmg: 1 };
      addLog(g, `${roundInfo(g.roundIdx, 'chaos').label}: perdeu para ${round.name} (−1 vida)`);
    }
    g.combat = null;
    if (p.hp <= 0) {
      g.phase = 'end';
      p.alive = false;
      p.placement = 2;
      g.players[1].placement = 1;
      g.winner = 1;
      return;
    }
    if (g.roundIdx >= CHAOS_ROUNDS.length - 1) {
      g.phase = 'end';
      g.chaosWon = true;
      p.placement = 1;
      g.players[1].placement = 2;
      g.players[1].alive = false;
      g.winner = 0;
      return;
    }
    nextRound(g);
  }

  function createGame({ names, seed, bots = [], skins = {} }) {
    const pool = {};
    for (const c of D.champions) pool[c.id] = RULES.poolSize[c.cost];
    return {
      seed: seed >>> 0, rngN: 0, nextUid: 1, roundIdx: -1, phase: 'lobby', skins, pool,
      players: names.map((name, i) => newPlayer(name, bots[i])),
      combat: null, pairs: null, pending: null, winner: null, log: [], augTiers: null,
    };
  }

  const rand = g => makeRng((g.seed + (g.rngN++) * 2654435761) >>> 0)();
  const randPick = (g, list) => list[Math.floor(rand(g) * list.length)];
  const addLog = (g, text) => { g.log.push(text); if (g.log.length > 40) g.log.shift(); };

  const allUnits = p => [...p.bench.filter(Boolean), ...Object.values(p.board)];
  const boardCount = p => Object.keys(p.board).length;
  const copiesValue = star => (star === 1 ? 1 : star === 2 ? 3 : 9);
  const sellPrice = u => {
    const cost = CH[u.c].cost;
    return u.star === 1 || cost === 1 ? cost * copiesValue(u.star) : cost * copiesValue(u.star) - 1;
  };

  /* ---------- Traits ativas ---------- */
  function traitCounts(unitChampIds) {
    const counts = {};
    for (const id of new Set(unitChampIds)) for (const t of CH[id].traits) counts[t] = (counts[t] || 0) + 1;
    return counts;
  }
  /* como traitCounts, mas somando Emblemas (cada Emblema conta mesmo em cópia repetida) */
  const emblemsOf = u => (u.items || u.itemIds || []).filter(i => ITEMS[i] && ITEMS[i].emblem).map(i => ITEMS[i].emblem);
  function traitCountsOf(units, champOf = u => u.c) {
    const counts = traitCounts(units.map(champOf));
    for (const u of units) for (const t of emblemsOf(u)) if (!CH[champOf(u)].traits.includes(t)) counts[t] = (counts[t] || 0) + 1;
    return counts;
  }
  function activeTier(name, count) {
    let best = null;
    for (const tier of TRAITS[name].tiers) if (count >= tier.min) best = tier;
    return best;
  }
  function traitSummary(p) {
    const counts = traitCountsOf(Object.values(p.board));
    return Object.entries(counts).map(([name, count]) => ({
      name, count, active: !!activeTier(name, count), tiers: TRAITS[name].tiers.map(t => t.min),
    })).sort((a, b) => (b.active - a.active) || (b.count - a.count) || a.name.localeCompare(b.name));
  }

  /* ---------- Loja ---------- */
  function rollShopSlot(g, level) {
    const odds = RULES.odds[level];
    let roll = rand(g) * 100;
    let cost = 1;
    for (let i = 0; i < 5; i++) { if (roll < odds[i]) { cost = i + 1; break; } roll -= odds[i]; }
    for (let c = cost; c >= 1; c--) {
      const opts = D.champions.filter(x => x.cost === c && g.pool[x.id] > 0);
      if (opts.length) {
        const total = opts.reduce((t, x) => t + g.pool[x.id], 0);
        let r = rand(g) * total;
        for (const x of opts) { r -= g.pool[x.id]; if (r < 0) return x.id; }
        return opts[opts.length - 1].id;
      }
    }
    return null;
  }
  function refreshShop(g, p) {
    const lv = Math.min(RULES.maxLevel, p.level + (playerMods(g, p).shopLevelDelta || 0));
    p.shop = p.shop.map(() => rollShopSlot(g, lv));
  }

  function gainXp(p, amount) {
    if (p.level >= RULES.maxLevel) return;
    p.xp += amount;
    while (p.level < RULES.maxLevel && p.xp >= RULES.xpToLevel[p.level]) {
      p.xp -= RULES.xpToLevel[p.level];
      p.level++;
    }
    if (p.level >= RULES.maxLevel) p.xp = 0;
  }

  function firstFreeBench(p) { return p.bench.findIndex(x => !x); }

  /* três cópias iguais viram uma de estrela maior (fica no lugar da que está em campo) */
  function tryStarUp(p, champ, star) {
    if (star >= 3) return;
    const copies = [];
    p.bench.forEach((u, i) => { if (u && u.c === champ && u.star === star) copies.push({ u, b: i }); });
    for (const [key, u] of Object.entries(p.board)) if (u.c === champ && u.star === star) copies.push({ u, key });
    if (copies.length < 3) return;
    const keep = copies.find(x => x.key) || copies[0];
    const items = [];
    for (const x of copies.slice(0).sort((a, b) => (a === keep ? -1 : b === keep ? 1 : 0)).slice(0, 3)) {
      items.push(...x.u.items);
      if (x !== keep) { if (x.key) delete p.board[x.key]; else p.bench[x.b] = null; }
    }
    // só as cópias usadas saem: a ordem acima põe keep primeiro
    keep.u.star = star + 1;
    p.lastStarUp = keep.u;
    if (HOOK_G) runHook(HOOK_G, p, 'starUp');
    keep.u.items = items.slice(0, RULES.maxItems);
    p.items.push(...items.slice(RULES.maxItems));
    tryStarUp(p, champ, star + 1);
  }

  function addUnit(g, p, champ) {
    const copies = allUnits(p).filter(u => u.c === champ && u.star === 1).length;
    const slot = firstFreeBench(p);
    if (slot < 0 && copies < 2) return false;
    const unit = { uid: g.nextUid++, c: champ, star: 1, items: [] };
    if (slot >= 0) p.bench[slot] = unit;
    else {
      // banco cheio: entra só para fechar a fusão
      const fake = RULES.benchSize;
      p.bench[fake] = unit;
      tryStarUp(p, champ, 1);
      p.bench.length = RULES.benchSize;
      return true;
    }
    tryStarUp(p, champ, 1);
    return true;
  }

  function removeUnit(p, uid) {
    const b = p.bench.findIndex(u => u && u.uid === uid);
    if (b >= 0) { const u = p.bench[b]; p.bench[b] = null; return u; }
    for (const [key, u] of Object.entries(p.board)) if (u.uid === uid) { delete p.board[key]; return u; }
    return null;
  }
  function findUnit(p, uid) { return allUnits(p).find(u => u.uid === uid) || null; }

  const validHex = pos => pos && Number.isInteger(pos.x) && Number.isInteger(pos.y) && pos.x >= 0 && pos.x < 7 && pos.y >= 0 && pos.y < 4;
  const validBench = pos => pos && Number.isInteger(pos.b) && pos.b >= 0 && pos.b < RULES.benchSize;
  const readSpot = (p, pos) => (validBench(pos) ? p.bench[pos.b] : validHex(pos) ? p.board[`${pos.x},${pos.y}`] : null) || null;
  function writeSpot(p, pos, u) {
    if (validBench(pos)) p.bench[pos.b] = u;
    else if (u) p.board[`${pos.x},${pos.y}`] = u;
    else delete p.board[`${pos.x},${pos.y}`];
  }

  /* ============================================================
     AUMENTOS
     Dados em tft-augments-data.js, efeitos em tft-augments.js.
     Só entra em oferta quem tem implementação.
     ============================================================ */
  const AUG = Object.fromEntries(AUG_DATA.map(a => [a.id, a]));
  const AUG_PRISMATIC_NO_ICON = new Set(['TFT14_Augment_BlackMarket_ScopedWeapons', 'TFT14_Augment_BlackMarketTitanicStrength', 'TFT14_Augment_BlackMarketUnstableEvolution', 'TFT14_Augment_LifeLongLearningBlackMarket', 'TFT6_Augment_CyberneticImplants3', 'TFT9_Augment_Commander_Ascension', 'TFT9_Augment_Commander_FinalAscension', 'TFT9_Augment_HedgeFund', 'TFT6_Augment_GachaAddict', 'TFT6_Augment_HighEndShopping', 'TFT6_Augment_BinaryAirdrop']);
  for (const a of AUG_DATA) if (!a.tier) a.tier = AUG_PRISMATIC_NO_ICON.has(a.id) ? 3 : 2;

  // Efeitos que dependem de números ou sistemas que não temos ficam de fora, sem inventar.
  const AUG_BLOCKED = new Set(['TFT_Augment_StarryNight', 'TFT_Augment_StarryNightPlus', 'TFT9_Augment_DravenSpoilsOfWar', 'TFT9_Augment_DravenSpoilsOfWar2', 'TFT9_Augment_DravenSpoilsOfWar3', 'TFT9_Augment_CustomerIsAlwaysRight']);
  const nameToChamp = n => CH_BY_NAME[n] || CH_BY_NAME[{ Jarvan: 'Jarvan IV' }[n]] || null;
  const nameToItem = n => D.items.find(i => i.name === n) || null;
  /* Insígnia/Tiara/Coroa: o que concede vem da própria descrição. */
  function parseGrant(desc) {
    const text = desc.replace(/^Recebe\s+/, '').replace(/\.$/, '');
    const out = [];
    for (const raw of text.split(/,\s*|\s+e\s+(?=uma?\s|Luvas|Emblema)/)) {
      const part = raw.replace(/^(?:uma?|um)\s+/, '').trim();
      const em = part.match(/^Emblema de (.+)$/);
      if (em) { if (!TRAITS[em[1]]) return null; out.push({ emblem: em[1] }); continue; }
      const champ = nameToChamp(part);
      if (champ) { out.push({ champ: champ.id }); continue; }
      const item = nameToItem(part);
      if (item) { out.push({ item: item.id }); continue; }
      return null;
    }
    return out;
  }
  const AUG_FX = {};
  for (const a of AUG_DATA) {
    if (AUG_BLOCKED.has(a.id)) continue;
    if (AUG_IMPL[a.id]) { AUG_FX[a.id] = AUG_IMPL[a.id]; continue; }
    if (/^TFT14_Augment_.*(Crest|Circlet|Crown)$/.test(a.id)) {
      const grants = parseGrant(a.desc);
      if (grants) AUG_FX[a.id] = { now(p) { grants.forEach(g => { if (g.emblem) p.emblem(g.emblem); else if (g.champ) p.champ(g.champ); else p.item(g.item); }); } };
    }
  }
  const augImplemented = id => Boolean(AUG_FX[id]);

  let HOOK_G = null;
  function augApi(g, p, id) {
    const state = () => (p.augState[id] = p.augState[id] || {});
    const pool = cost => D.champions.filter(c => c.cost === cost && g.pool[c.id] > 0);
    const give = (champ, star = 1) => {
      if (!champ) return null;
      const need = star === 1 ? 1 : star === 2 ? 3 : 9;
      g.pool[champ] = Math.max(0, g.pool[champ] - need);
      if (star === 1) {
        if (!addUnit(g, p, champ)) { p.gold += CH[champ].cost; g.pool[champ] += need; return null; }
        return champ;
      }
      const b = firstFreeBench(p);
      if (b < 0) { p.gold += CH[champ].cost * need; g.pool[champ] += need; return null; }
      p.bench[b] = { uid: g.nextUid++, c: champ, star, items: [] };
      tryStarUp(p, champ, star);
      return champ;
    };
    const emblemTraits = () => AUG_DATA.filter(a => /Crest$/.test(a.id) && a.id.startsWith('TFT14')).map(a => (a.desc.match(/Emblema de (.+?)\./) || [])[1]).filter(t => TRAITS[t]);
    const api = {
      gold(n) { p.gold = Math.max(0, p.gold + n); },
      xp(n) { const before = p.level; gainXp(p, n); for (let l = before + 1; l <= p.level; l++) runHook(g, p, 'level', l); },
      comps(n) { for (let i = 0; i < n; i++) p.items.push(randPick(g, COMPONENTS)); },
      compsSame(n) { const c = randPick(g, COMPONENTS); for (let i = 0; i < n; i++) p.items.push(c); },
      item(i) { p.items.push(i); },
      fullItem() { p.items.push(randPick(g, FULL_ITEMS)); },
      unit(cost, star = 1) { const list = pool(cost); return list.length ? give(randPick(g, list).id, star) : null; },
      champ(c, star = 1) { return give(c, star); },
      champName(n) { const c = nameToChamp(n); return c ? give(c.id) : null; },
      allOfCost(cost) { pool(cost).forEach(c => give(c.id)); },
      unitOfTrait(t, cost) { for (let c = cost; c >= 1; c--) { const list = pool(c).filter(x => x.traits.includes(t)); if (list.length) return give(randPick(g, list).id); } return null; },
      emblem(t) { const trait = t || randPick(g, emblemTraits()); p.items.push(emblemId(trait)); return trait; },
      rerolls(n) { p.freeRerolls += n; },
      // no caos já existe um Removedor infinito: concedê-lo não faria sentido
      removers(n) { if (g.mode === 'chaos') return; for (let i = 0; i < n; i++) p.items.push(REMOVER); },
      reforger(n) { for (let i = 0; i < n; i++) p.items.push('Reforger'); },
      recombobulator() { p.items.push('Recombobulator'); },
      dup(kind, n) { for (let i = 0; i < n; i++) p.items.push(kind === 'lesser' ? 'LesserDuplicator' : 'ChampionDuplicator'); },
      anvil(kind) {
        const list = kind === 'comp' ? COMPONENTS : FULL_ITEMS;
        const opts = [];
        while (opts.length < 4) { const x = randPick(g, list); if (!opts.includes(x)) opts.push(x); }
        p.choices.push({ title: kind === 'comp' ? 'Bigorna de Componentes' : 'Bigorna de Item Completo', opts });
      },
      state,
      count(k, n) { const s = state(); s[k] = (s[k] || 0) + n; return s[k]; },
      setLevel(l) { if (p.level < l) { const before = p.level; p.level = l; p.xp = 0; for (let x = before + 1; x <= l; x++) runHook(g, p, 'level', x); } },
      setStreak(n) { p.streak = n; },
      randomAugment(tier) { const list = augPool(g, p, tier); if (list.length) pickAugment(g, p, randPick(g, list)); },
      healPlayer(n, raiseMax) { if (playerMods(g, p).noPlayerHeal) return; p.hp = raiseMax ? p.hp + n : Math.min(p.maxHp || RULES.startHp, p.hp + n); if (raiseMax) p.maxHp = (p.maxHp || RULES.startHp) + n; },
      damagePlayer(n) { p.hp = Math.max(1, p.hp - n); },
      setPlayerHp(n) { p.hp = n; p.maxHp = n; },
      goldNow: () => p.gold,
      lastInterest: () => p.lastInterest,
      boughtLastRound: () => p.boughtLast,
      roundIdx: () => g.roundIdx,
      stageNow: () => roundInfo(Math.max(0, g.roundIdx), g.mode).stage,
      playersOut: () => g.players.filter(x => !x.alive).length,
      noBenchItems: () => !p.items.some(i => !ITEMS[i] || !ITEMS[i].special),
      benchEmpty: () => !p.bench.some(Boolean),
      benchFull: () => p.bench.every(Boolean),
      lockActions(n) { p.lockedRounds = n; },
      disableShop(n) { p.shopOff = n; p.shop = p.shop.map(() => null); },
      sellAll() { for (const u of allUnits(p).slice()) { p.gold += sellPrice(u); p.items.push(...u.items); g.pool[u.c] += copiesValue(u.star); removeUnit(p, u.uid); } },
      removeAll() { for (const u of allUnits(p).slice()) { p.items.push(...u.items); g.pool[u.c] += copiesValue(u.star); removeUnit(p, u.uid); } },
      recombobulateBoard() { for (const u of Object.values(p.board)) { const list = pool(Math.min(5, CH[u.c].cost + 1)); if (list.length) { g.pool[u.c] += copiesValue(u.star); u.c = randPick(g, list).id; g.pool[u.c] = Math.max(0, g.pool[u.c] - copiesValue(u.star)); } } },
      pandoraBench(n) { p.bench.forEach((u, i) => { if (!u || i < p.bench.length - n) return; const list = pool(CH[u.c].cost); if (list.length) { g.pool[u.c] += copiesValue(u.star); u.c = randPick(g, list).id; g.pool[u.c] = Math.max(0, g.pool[u.c] - copiesValue(u.star)); } }); },
      pandoraItems() { p.items = p.items.map(i => (COMPONENTS.includes(i) ? randPick(g, COMPONENTS) : FULL_ITEMS.includes(i) ? randPick(g, FULL_ITEMS) : i)); },
      permAll(perm) { allUnits(p).forEach(u => addPerm(u, perm)); },
      randomPerm(f, opts) { if (p.lastStarUp) addPerm(p.lastStarUp, randPick(g, opts)); },
      shopOfCost(cost) { const list = pool(cost); p.shop = p.shop.map(() => (list.length ? randPick(g, list).id : null)); },
      stealFromShop(limit) { const i = p.shop.findIndex(c => c && CH[c].cost <= limit); if (i >= 0) { const c = p.shop[i]; p.shop[i] = null; give(c); } },
      upgradeBought(c) { for (let i = 0; i < 2; i++) give(c); },
      lastStarUpUnit: () => p.lastStarUp,
      champHasTrait: (u, t) => CH[u.c].traits.includes(t),
      permUnit: (u, perm) => addPerm(u, perm),
      rank: () => 1 + g.players.filter(x => x !== p && x.alive && x.hp > p.hp).length,
      traitOnBoard(t) { return Object.values(p.board).filter(u => CH[u.c].traits.includes(t)).length; },
    };
    return api;
  }
  function addPerm(u, perm) {
    u.perm = u.perm || {};
    for (const [k, v] of Object.entries(perm)) u.perm[k] = (u.perm[k] || 0) + v;
  }
  function runHook(g, p, hook, ...args) {
    for (const id of p.augments.slice()) {
      const fx = AUG_FX[id];
      if (fx && fx[hook]) fx[hook](augApi(g, p, id), AUG[id].fx, ...args);
    }
  }
  function playerMods(g, p) {
    const m = {};
    for (const id of p.augments) {
      const fx = AUG_FX[id];
      if (fx && fx.mods) fx.mods(m, AUG[id].fx, p.augState[id] || {}, g);
    }
    return m;
  }
  function augPool(g, p, tier, list = 'normal') {
    return AUG_DATA.filter(a => a[list] && a.tier === tier && augImplemented(a.id) && !p.augments.includes(a.id)).map(a => a.id);
  }
  function pickAugment(g, p, id) {
    p.augments.push(id);
    p.augState[id] = p.augState[id] || { pickedRound: g.roundIdx };
    const fx = AUG_FX[id];
    if (fx && fx.now) fx.now(augApi(g, p, id), AUG[id].fx);
  }
  const AUG_ROUNDS = { '2-1': 0, '3-2': 1, '4-2': 2 };
  // Sequências de tier iguais para todos na partida, como no TFT. Pesos aproximados: a Riot não publica.
  function rollTiers(g) {
    const pickTier = () => { const r = rand(g); return r < 0.4 ? 1 : r < 0.8 ? 2 : 3; };
    return [pickTier(), pickTier(), pickTier()];
  }
  function makeOffer(g, p, tier, list = 'normal') {
    if (playerMods(g, p).noAugments) return;
    let t = tier;
    if (p.augState.tierUpArmed) { t = Math.min(3, t + 1); p.augState.tierUpArmed = false; }
    if (playerMods(g, p).nextAugmentTierUp && !p.augState.tierUpUsed) { t = Math.min(3, t + 1); p.augState.tierUpUsed = true; }
    const avail = augPool(g, p, t, list);
    const opts = [];
    while (opts.length < 3 && opts.length < avail.length) { const x = randPick(g, avail); if (!opts.includes(x)) opts.push(x); }
    if (opts.length) p.offer = { tier: t, list, opts, rerolled: opts.map(() => false) };
  }
  /* quem não decidiu a tempo recebe a primeira opção */
  function settleChoices(g, p) {
    if (p.offer) { const id = p.offer.opts[0]; p.offer = null; pickAugment(g, p, id); }
    while (p.choices.length) { const c = p.choices.shift(); p.items.push(c.opts[0]); }
  }

  /* ---------- Ações do jogador ---------- */
  function act(g, who, a) {
    const p = g.players[who];
    if (!p || !a || g.phase === 'end' || g.phase === 'lobby') return 'Fora de hora.';
    if (!p.alive) return 'Você foi eliminado.';
    const planning = g.phase === 'plan' || g.phase === 'carousel';
    HOOK_G = g;
    if (p.lockedRounds > 0 && !['ready', 'augment', 'augReroll', 'choose', 'lock'].includes(a.a)) return 'Ação bloqueada pelo aumento Ociosidade.';

    switch (a.a) {
      case 'buy': {
        const i = a.slot;
        const champ = Number.isInteger(i) ? p.shop[i] : null;
        if (!champ) return 'Espaço vazio.';
        const cost = CH[champ].cost;
        if (p.shopOff > 0) return 'Loja desabilitada por um aumento.';
        if (p.gold < cost) return 'Ouro insuficiente.';
        if (g.pool[champ] <= 0) return 'Sem cópias no pool.';
        if (!addUnit(g, p, champ)) return 'Banco cheio.';
        p.gold -= cost;
        g.pool[champ]--;
        p.shop[i] = null;
        p.boughtThisRound++;
        runHook(g, p, 'bought', champ, cost);
        return null;
      }
      case 'reroll': {
        if (p.shopOff > 0) return 'Loja desabilitada por um aumento.';
        const mods = playerMods(g, p);
        const paid = !mods.freeShop && p.freeRerolls <= 0;
        if (paid && p.gold < RULES.rerollCost) return 'Ouro insuficiente.';
        if (paid) { p.gold -= RULES.rerollCost; if (mods.xpOnGoldReroll) augApi(g, p, null).xp(mods.xpOnGoldReroll); }
        else if (!mods.freeShop) p.freeRerolls--;
        if (mods.rerollRefund && rand(g) < mods.rerollRefund) p.freeRerolls++;
        refreshShop(g, p);
        return null;
      }
      case 'xp':
        if (p.level >= RULES.maxLevel) return 'Nível máximo.';
        {
          const mods = playerMods(g, p);
          if (mods.noBuyXp) return 'Um aumento impede comprar EXP.';
          if (mods.xpWithHealth) {
            if (p.hp <= mods.xpWithHealth) return 'Vida insuficiente.';
            p.hp -= mods.xpWithHealth;
          } else {
            const xpCost = Math.max(0, RULES.xpCost + (mods.xpCostDelta || 0));
            if (p.gold < xpCost) return 'Ouro insuficiente.';
            p.gold -= xpCost;
          }
          augApi(g, p, null).xp(RULES.xpGain + (mods.xpBuyBonus || 0));
        }
        return null;
      case 'lock':
        p.locked = !p.locked;
        return null;
      case 'move': {
        const u = readSpot(p, a.from);
        if (!u) return 'Sem unidade.';
        if (!(validBench(a.to) || validHex(a.to))) return 'Destino inválido.';
        if ((validHex(a.from) || validHex(a.to)) && !planning) return 'O combate já começou.';
        const other = readSpot(p, a.to);
        const fieldLimit = p.level + (playerMods(g, p).teamBonus || 0);
        if (validBench(a.from) && validHex(a.to) && !other && boardCount(p) >= fieldLimit) return `Limite de ${fieldLimit} em campo: suba de nível.`;
        writeSpot(p, a.from, other);
        writeSpot(p, a.to, u);
        return null;
      }
      case 'sell': {
        const target = findUnit(p, a.uid);
        if (!target) return 'Sem unidade.';
        if (!planning && !p.bench.includes(target)) return 'O combate já começou.';
        removeUnit(p, a.uid);
        p.gold += sellPrice(target);
        if (playerMods(g, p).salvageOnSell) {
          for (const it of target.items) { const def = ITEMS[it]; if (def.from) p.items.push(...def.from); else p.items.push(it); }
        } else {
          p.items.push(...target.items);
        }
        g.pool[target.c] += copiesValue(target.star);
        return null;
      }
      case 'equip': {
        const u = findUnit(p, a.uid);
        const id = p.items[a.item];
        if (!u || !id) return 'Item inválido.';
        if (id === REMOVER) {
          if (!u.items.length) return 'Esta unidade não tem itens.';
          if (g.mode !== 'chaos') p.items.splice(a.item, 1); // no caos, o Removedor Dourado não acaba
          p.items.push(...u.items);
          u.items = [];
          return null;
        }
        if (ITEMS[id].use) {
          const use = ITEMS[id].use;
          const limit = CONSUMABLES[use].maxCost;
          if (limit && CH[u.c].cost > limit) return `Só funciona até custo ${limit}.`;
          if (use === 'Reforger') {
            if (!u.items.length) return 'Esta unidade não tem itens.';
            u.items = u.items.map(x => (ITEMS[x].emblem ? x : randPick(g, COMPONENTS.includes(x) ? COMPONENTS : FULL_ITEMS)));
          } else if (use === 'Recombobulator') {
            const list = D.champions.filter(c => c.cost === CH[u.c].cost + 1 && g.pool[c.id] > 0);
            if (!list.length) return 'Sem campeões disponíveis.';
            g.pool[u.c] += copiesValue(u.star);
            u.c = randPick(g, list).id;
            g.pool[u.c] = Math.max(0, g.pool[u.c] - copiesValue(u.star));
          } else {
            if (g.pool[u.c] <= 0) return 'Sem cópias no pool.';
            if (!addUnit(g, p, u.c)) return 'Banco cheio.';
            g.pool[u.c]--;
          }
          p.items.splice(a.item, 1);
          return null;
        }
        if (ITEMS[id].emblem && (CH[u.c].traits.includes(ITEMS[id].emblem) || u.items.includes(id))) return 'Esta unidade já tem essa característica.';
        const comp = COMPONENTS.includes(id);
        if (u.items.includes('ThiefsGloves')) return 'Luvas do Ladrão ocupam todos os espaços.';
        if (id === 'ThiefsGloves' && u.items.length) return 'A unidade precisa estar sem itens.';
        const idx = comp ? u.items.findIndex(x => COMPONENTS.includes(x)) : -1;
        if (idx >= 0) {
          const full = D.items.find(i => i.from && ((i.from[0] === id && i.from[1] === u.items[idx]) || (i.from[1] === id && i.from[0] === u.items[idx])));
          if (!full) return 'Combinação inexistente.';
          u.items[idx] = full.id;
          runHook(g, p, 'crafted', full.id);
        } else {
          if (u.items.length >= (playerMods(g, p).maxItems || RULES.maxItems)) return 'Sem espaço de item.';
          u.items.push(id);
        }
        p.items.splice(a.item, 1);
        return null;
      }
      case 'pick': {
        if (g.phase !== 'carousel' || p.picked) return 'Fora de hora.';
        const opt = p.carousel && p.carousel[a.i];
        if (!opt) return 'Opção inválida.';
        takeCarousel(g, p, opt);
        return null;
      }
      case 'ready':
        if (g.phase === 'plan') p.ready = !p.ready;
        return null;
      case 'augment': {
        if (!p.offer) return 'Sem aumento para escolher.';
        const id = p.offer.opts[a.i];
        if (!id) return 'Opção inválida.';
        p.offer = null;
        pickAugment(g, p, id);
        return null;
      }
      case 'augReroll': {
        const o = p.offer;
        if (!o || !o.opts[a.i] || o.rerolled[a.i]) return 'Sem atualização disponível.';
        const avail = augPool(g, p, o.tier, o.list).filter(x => !o.opts.includes(x));
        if (!avail.length) return 'Sem outras opções.';
        o.opts[a.i] = randPick(g, avail);
        o.rerolled[a.i] = true;
        return null;
      }
      case 'choose': {
        const c = p.choices[0];
        if (!c || !c.opts[a.i]) return 'Opção inválida.';
        p.items.push(c.opts[a.i]);
        p.choices.shift();
        return null;
      }
      default:
        return 'Ação desconhecida.';
    }
  }

  function takeCarousel(g, p, opt) {
    p.picked = true;
    p.items.push(opt.item);
    if (g.pool[opt.c] > 0) {
      if (addUnit(g, p, opt.c)) g.pool[opt.c]--;
      else p.gold += CH[opt.c].cost;
    }
    p.carousel = p.carousel.map(o => ({ ...o, taken: o === opt }));
  }

  /* ---------- Fluxo das rodadas ---------- */
  function carouselOptions(g, stage) {
    const costs = stage <= 1 ? [1] : stage === 2 ? [1, 2] : stage === 3 ? [2, 3] : stage === 4 ? [3, 4] : [4, 5];
    const out = [];
    const used = new Set();
    for (let tries = 0; out.length < 4 && tries < 60; tries++) {
      const cost = randPick(g, costs);
      const list = D.champions.filter(c => c.cost === cost && g.pool[c.id] > 0 && !used.has(c.id));
      if (!list.length) continue;
      const c = randPick(g, list);
      used.add(c.id);
      out.push({ c: c.id, item: randPick(g, COMPONENTS) });
    }
    return out;
  }

  const alivePlayers = g => g.players.filter(p => p.alive);

  /* sorteia os duelos da rodada, evitando repetir os últimos rivais.
     Com número ímpar, quem sobra enfrenta o fantasma (cópia) do time de outro jogador. */
  function makePairs(g) {
    const ids = g.players.map((p, i) => (p.alive ? i : -1)).filter(i => i >= 0);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand(g) * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const memory = Math.max(0, Math.min(3, ids.length - 2));
    const recentOf = i => (memory ? g.players[i].recent.slice(-memory) : []);
    const free = ids.slice();
    const pairs = [];
    while (free.length > 1) {
      const a = free.shift();
      let idx = free.findIndex(b => !recentOf(a).includes(b) && !recentOf(b).includes(a));
      if (idx < 0) idx = 0;
      const b = free.splice(idx, 1)[0];
      pairs.push({ a, b, ghost: null });
      g.players[a].recent.push(b);
      g.players[b].recent.push(a);
    }
    if (free.length) {
      const a = free[0];
      const others = ids.filter(i => i !== a);
      const ghost = others.find(i => !recentOf(a).includes(i)) ?? others[0];
      pairs.push({ a, b: null, ghost });
      g.players[a].recent.push(ghost);
    }
    return pairs;
  }

  /* abre a próxima rodada: paga renda, atualiza loja e define a fase */
  function nextRound(g) {
    HOOK_G = g;
    g.roundIdx++;
    if (g.mode === 'chaos') return chaosNextRound(g);
    if (!g.augTiers) g.augTiers = rollTiers(g);
    g.combat = null;
    g.pending = null;
    const info = roundInfo(g.roundIdx, g.mode);
    const alive = alivePlayers(g);
    for (const p of g.players) { p.ready = false; p.lastResult = null; }
    for (const p of alive) {
      if (g.roundIdx === 0) continue;
      const passive = RULES.passiveGold[info.label] != null ? RULES.passiveGold[info.label] : 5;
      const mods = playerMods(g, p);
      const cap = mods.interestCap != null ? mods.interestCap : 5;
      p.lastInterest = Math.min(cap, Math.floor(p.gold / 10));
      p.gold += passive + p.lastInterest + streakGold(p.streak);
      augApi(g, p, null).xp(RULES.roundXp);
      p.boughtLast = p.boughtThisRound;
      p.boughtThisRound = 0;
      if (p.lockedRounds > 0) p.lockedRounds--;
      if (p.shopOff > 0) { p.shopOff--; p.shop = p.shop.map(() => null); }
      else if (!p.locked) refreshShop(g, p);
      runHook(g, p, 'round', info);
      if (info.n === 1 && info.stage >= 2) runHook(g, p, 'stage', info);
      if (AUG_ROUNDS[info.label] != null && !g.noAugmentRounds) makeOffer(g, p, g.augTiers[AUG_ROUNDS[info.label]]);
    }
    g.pairs = info.type === 'pvp' ? makePairs(g) : null;
    if (info.type === 'carousel') {
      g.phase = 'carousel';
      for (const p of alive) { p.carousel = carouselOptions(g, info.stage); p.picked = false; }
    } else {
      g.phase = 'plan';
    }
    return info;
  }

  /* fim do tempo do carrossel: quem não escolheu recebe uma opção qualquer */
  function endCarousel(g) {
    for (const p of alivePlayers(g)) {
      if (!p.picked && p.carousel && p.carousel.length) takeCarousel(g, p, randPick(g, p.carousel));
      p.carousel = null;
    }
  }

  function autoField(p) {
    while (boardCount(p) < p.level + (HOOK_G ? playerMods(HOOK_G, p).teamBonus || 0 : 0)) {
      const b = p.bench.findIndex(Boolean);
      if (b < 0) return;
      let spot = null;
      for (const y of [0, 1, 2, 3]) {
        for (const x of [3, 2, 4, 1, 5, 0, 6]) {
          if (!p.board[`${x},${y}`]) { spot = `${x},${y}`; break; }
        }
        if (spot) break;
      }
      p.board[spot] = p.bench[b];
      p.bench[b] = null;
    }
  }

  /* roda os combates da rodada; o resultado só vale em finishCombat */
  function startCombat(g) {
    const info = roundInfo(g.roundIdx, g.mode);
    HOOK_G = g;
    alivePlayers(g).forEach(p => settleChoices(g, p));
    if (g.mode === 'chaos') {
      const p = g.players[0];
      autoField(p);
      const seedC = (g.seed ^ (g.roundIdx * 7919 + 13)) >>> 0;
      const round = CHAOS_ROUNDS[g.roundIdx];
      g.combat = { kind: 'pve', fights: [{ ...simulate(teamFromPlayer(p), chaosTeam(g.roundIdx), seedC), a: 0, b: null, names: [p.name, round.name] }] };
      g.phase = 'combat';
      return g.combat;
    }
    alivePlayers(g).forEach(autoField);
    const seed = (g.seed ^ (g.roundIdx * 7919 + 13)) >>> 0;
    let fights;
    if (info.type === 'pvp') {
      // alguém pode ter saído durante o planejamento
      const stillValid = g.pairs && g.pairs.every(x => [x.a, x.b, x.ghost].every(i => i == null || g.players[i].alive));
      if (!stillValid) g.pairs = makePairs(g);
      fights = g.pairs.map((x, i) => {
        const A = g.players[x.a];
        const B = g.players[x.b != null ? x.b : x.ghost];
        return {
          ...simulate(teamFromPlayer(A), teamFromPlayer(B), (seed + i * 31) >>> 0),
          a: x.a, b: x.b, names: [A.name, x.b != null ? B.name : `Fantasma de ${B.name}`],
        };
      });
    } else {
      const wave = creepWave(info);
      fights = g.players.map((p, i) => (p.alive ? {
        ...simulate(teamFromPlayer(p), wave, (seed + i) >>> 0),
        a: i, b: null, names: [p.name, 'Monstros'], loot: combatLoot(g, info),
      } : null)).filter(Boolean);
    }
    g.combat = { kind: info.type === 'pvp' ? 'pvp' : 'pve', fights };
    g.phase = 'combat';
    return g.combat;
  }

  /* o combate que cada jogador vê; quem já saiu acompanha o primeiro da rodada */
  function viewFor(g, who) {
    const fights = g.combat ? g.combat.fights : [];
    const own = fights.find(f => f.a === who || f.b === who);
    if (own) return { view: own, flip: own.b === who, spectate: false };
    return fights.length ? { view: fights[0], flip: false, spectate: true } : null;
  }

  function combatLoot(g, info) {
    const loot = { gold: 0, items: [] };
    const comp = () => randPick(g, COMPONENTS);
    loot.items.push(comp());
    if (info.label === '1-3') loot.gold = 2;
    if (info.stage >= 2) loot.gold = 3;
    if (info.stage >= 4) loot.items.push(comp());
    if (info.label === '1-4' || info.stage >= 2) loot.items.push(REMOVER);
    return loot;
  }

  function finishCombat(g) {
    if (g.mode === 'chaos') return finishChaos(g);
    const info = roundInfo(g.roundIdx, g.mode);
    const c = g.combat;
    const dmgFor = survivors => stageDamage(info.stage) + survivors;

    if (c.kind === 'pvp') {
      for (const f of c.fights) {
        const A = g.players[f.a];
        const B = f.b != null ? g.players[f.b] : null;   // sem B: o rival era um fantasma
        const loseTo = (p, raw) => { const m = p ? playerMods(g, p) : {}; const d = m.lossDamage != null ? m.lossDamage : Math.round(raw * (m.playerDamageMul || 1)); if (p && p.alive) { p.hp -= d; p.streak = p.streak < 0 ? p.streak - 1 : -1; p.lastResult = { res: 'lose', dmg: d }; } };
        const winOver = p => { if (p && p.alive) { p.gold += 1; p.streak = p.streak > 0 ? p.streak + 1 : 1; p.lastResult = { res: 'win', dmg: 0 }; } };
        if (f.winner === -1) {
          const d = stageDamage(info.stage);
          for (const p of [A, B]) if (p && p.alive) { p.hp -= d; p.streak = 0; p.lastResult = { res: 'draw', dmg: d }; }
          addLog(g, `${info.label}: ${f.names[0]} empatou com ${f.names[1]}`);
        } else {
          const win = f.winner === 0 ? A : B;
          const lose = f.winner === 0 ? B : A;
          const d = dmgFor(f.survivors);
          winOver(win);
          loseTo(lose, d);
          if (lose && lose.alive && traitCountsOf(Object.values(lose.board))['Cifra'] >= 3) lose.gold += 1;
          addLog(g, `${info.label}: ${f.names[f.winner]} venceu ${f.names[1 - f.winner]}${lose ? ` (−${d})` : ''}`);
        }
        if (A.alive) A.gold += f.goldDrops[0];
        if (B && B.alive) B.gold += f.goldDrops[1];
      }
    } else {
      for (const f of c.fights) {
        const p = g.players[f.a];
        if (!p.alive) continue;
        const loot = f.loot;
        p.gold += loot.gold;
        p.items.push(...loot.items);
        if (f.winner === 0) p.lastResult = { res: 'win', dmg: 0, loot };
        else { const d = dmgFor(f.survivors); p.hp -= d; p.lastResult = { res: 'lose', dmg: d, loot }; }
        p.gold += f.goldDrops[0];
      }
      addLog(g, `${info.label}: monstros`);
    }

    // Cromo do Nitro por estrela em campo (até 200)
    for (const p of alivePlayers(g)) {
      const counts = traitCountsOf(Object.values(p.board));
      if (activeTier('Nitro', counts['Nitro'] || 0)) {
        const stars = Object.values(p.board).filter(u => CH[u.c].traits.includes('Nitro')).reduce((t, u) => t + u.star, 0);
        p.chrome = Math.min(200, p.chrome + stars * 3);
      }
    }

    settleAugments(g, c);
    // Reservas Finais: a primeira eliminação é cancelada
    for (const p of alivePlayers(g)) {
      const fr = playerMods(g, p).finalReserves;
      if (fr && p.hp <= 0 && !p.augState.usedFinalReserves) {
        p.augState.usedFinalReserves = true;
        p.hp = 1;
        augApi(g, p, null).xp(fr.XP + Math.max(0, p.gold - fr.Gold));
        p.gold = fr.Gold;
      }
    }
    g.combat = null;
    settleDeaths(g);
    if (g.phase !== 'end') nextRound(g);
  }

  /* Aumentos: ganhos permanentes e efeitos de fim de combate */
  function settleAugments(g, c) {
    for (const f of c.fights) {
      [[f.a, 0], [f.b, 1]].forEach(([idx, side]) => {
        if (idx == null) return;
        const p = g.players[idx];
        if (!p || !p.alive) return;
        for (const gain of (f.permGains || []).filter(x => x.side === side)) {
          const unit = allUnits(p).find(u => u.uid === gain.uid);
          if (unit) addPerm(unit, gain.perm);
        }
        p.gold += (f.augGold || [0, 0])[side];
        p.combats++;
        const won = f.winner === side;
        if (won) p.wins++;
        runHook(g, p, 'after', { pvp: c.kind === 'pvp', won, lost: f.winner !== side && f.winner !== -1, survivors: won ? f.survivors : 0, allyDeaths: (f.deaths || [0, 0])[side], playerDamage: won && c.kind === 'pvp' ? stageDamage(roundInfo(g.roundIdx, g.mode).stage) + f.survivors : 0 });
      });
    }
  }

  /* sai da partida: as unidades voltam ao pool, como no TFT */
  function eliminate(g, p) {
    for (const u of allUnits(p)) g.pool[u.c] += copiesValue(u.star);
    p.alive = false;
    p.board = {};
    p.bench = Array(RULES.benchSize).fill(null);
    p.items = [];
    p.shop = Array(RULES.shopSize).fill(null);
    p.carousel = null;
    p.ready = false;
    addLog(g, `${p.name} terminou em ${p.placement}º`);
  }

  function endIfDecided(g, remaining) {
    if (remaining.length > 1) return;
    g.phase = 'end';
    g.combat = null;
    if (remaining.length === 1) {
      remaining[0].placement = 1;
      g.winner = g.players.indexOf(remaining[0]);
    }
  }

  /* quem chegou a 0 de Vida na rodada: menos dano sofrido fica mais bem colocado */
  function settleDeaths(g) {
    const alive = alivePlayers(g);
    const dead = alive.filter(p => p.hp <= 0).sort((a, b) => b.hp - a.hp);
    const remaining = alive.filter(p => p.hp > 0);
    dead.forEach((p, i) => { p.placement = remaining.length + i + 1; eliminate(g, p); });
    if (!remaining.length && dead.length) {
      // todos caíram juntos: empate só se a Vida também for igual
      const tied = dead.filter(p => p.hp === dead[0].hp);
      tied.forEach(p => { p.placement = 1; });
      g.winner = tied.length > 1 ? -1 : g.players.indexOf(dead[0]);
    }
    g.players.forEach(p => { p.hp = Math.max(0, p.hp); });
    endIfDecided(g, remaining);
  }

  /* jogador desconectado: conta como eliminado na hora */
  function dropPlayer(g, who) {
    const p = g.players[who];
    if (!p || !p.alive) return;
    p.left = true;
    p.placement = alivePlayers(g).length;
    p.hp = 0;
    eliminate(g, p);
    endIfDecided(g, alivePlayers(g));
    // saiu no planejamento: refaz os duelos, para ninguém esperar um rival que não existe mais
    if (g.phase === 'plan' && g.pairs) g.pairs = makePairs(g);
  }

  /* ---------- Monstros ---------- */
  const CREEPS = {
    drone: { name: 'Drone', icon: '🤖', hp: 250, ad: 25, as: 0.6, armor: 0, mr: 0, range: 1 },
    melee: { name: 'Lacaio', icon: '👾', hp: 500, ad: 40, as: 0.6, armor: 0, mr: 0, range: 1 },
    ranged: { name: 'Lacaio atirador', icon: '👽', hp: 350, ad: 45, as: 0.6, armor: 0, mr: 0, range: 3 },
    krug: { name: 'Krug', icon: '🪨', hp: 900, ad: 70, as: 0.7, armor: 40, mr: 20, range: 1 },
    wolf: { name: 'Lobo', icon: '🐺', hp: 1000, ad: 100, as: 0.9, armor: 25, mr: 25, range: 1 },
    raptor: { name: 'Raptor', icon: '🐦', hp: 1100, ad: 130, as: 1, armor: 30, mr: 30, range: 2 },
    dragon: { name: 'Dragão', icon: '🐉', hp: 11000, ad: 260, as: 0.8, armor: 60, mr: 60, range: 2 },
    herald: { name: 'Arauto', icon: '👁', hp: 19000, ad: 400, as: 0.8, armor: 80, mr: 80, range: 2 },
    baron: { name: 'Barão', icon: '🐛', hp: 30000, ad: 600, as: 0.8, armor: 100, mr: 100, range: 3 },
  };
  function creepWave(info) {
    const wave = { '1-2': ['melee', 'melee'], '1-3': ['melee', 'melee', 'ranged'], '1-4': ['melee', 'melee', 'ranged', 'ranged'] }[info.label]
      || { 2: ['krug', 'krug', 'krug'], 3: ['wolf', 'wolf', 'wolf', 'wolf', 'wolf'], 4: ['raptor', 'raptor', 'raptor', 'raptor', 'raptor', 'raptor'], 5: ['dragon'], 6: ['herald'] }[info.stage]
      || ['baron'];
    const spots = ['3,0', '0,0', '6,0', '1,2', '5,2', '3,3'];
    return { creeps: wave.map((k, i) => ({ key: k, spot: spots[i] })), chrome: 0 };
  }

  /* ============================================================
     COMBATE
     Campo 7x8 em colunas/linhas deslocadas. Lado 0 nas linhas 0-3,
     lado 1 nas 4-7 (espelhado). Passo de 0,05s; guarda quadros a cada
     0,1s para a tela reproduzir.
     ============================================================ */
  const teamFromPlayer = p => ({
    units: Object.entries(p.board).map(([key, u]) => { const [x, y] = key.split(',').map(Number); return { ...u, x, y }; }),
    chrome: p.chrome,
    augs: (p.augments || []).map(id => ({ id, state: p.augState[id] || {} })),
    level: p.level,
    playerHp: p.hp,
    stage: HOOK_G ? roundInfo(Math.max(0, HOOK_G.roundIdx), HOOK_G.mode).stage : 1,
    roundIdx: HOOK_G ? HOOK_G.roundIdx : 0,
    benchRight: p.bench.map(Boolean),
    mods: HOOK_G ? playerMods(HOOK_G, p) : {},
  });

  const DT = 0.05;
  const axial = (c, r) => ({ q: c - (r - (r & 1)) / 2, r });
  function hexDist(c1, r1, c2, r2) {
    const a = axial(c1, r1), b = axial(c2, r2);
    const dq = a.q - b.q, dr = a.r - b.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  }
  function neighbors(c, r) {
    const odd = r & 1;
    const list = [[c - 1, r], [c + 1, r], [c - 1 + odd, r - 1], [c + odd, r - 1], [c - 1 + odd, r + 1], [c + odd, r + 1]];
    return list.filter(([x, y]) => x >= 0 && x < 7 && y >= 0 && y < 8);
  }

  /* ---------- Geometria dos golpes (funções puras, testadas em Node) ---------- */
  const inBoard = (c, r) => c >= 0 && c < 7 && r >= 0 && r < 8;
  const toPixel = (c, r) => ({ x: c + (r & 1 ? 0.5 : 0), y: r * 0.866 });

  /* casas da reta que sai de (c1,r1), passa por (c2,r2) e segue até somar len casas */
  function hexLine(c1, r1, c2, r2, len) {
    const a = axial(c1, r1), b = axial(c2, r2);
    const n = hexDist(c1, r1, c2, r2);
    const cells = [];
    if (!n) return cells;
    const seen = new Set();
    for (let i = 1; i <= len; i++) {
      const f = i / n;
      // ponto do meio: empates de arredondamento sempre caem para o mesmo lado
      const fq = a.q + (b.q - a.q) * f + 1e-6, fr = a.r + (b.r - a.r) * f + 1e-6, fs = -fq - fr;
      let q = Math.round(fq), rr = Math.round(fr), ss = Math.round(fs);
      const dq = Math.abs(q - fq), dr = Math.abs(rr - fr), ds = Math.abs(ss - fs);
      if (dq > dr && dq > ds) q = -rr - ss;
      else if (dr > ds) rr = -q - ss;
      const c = q + (rr - (rr & 1)) / 2;
      // antes do alvo, um desvio para fora é só arredondamento; depois dele, é a borda
      if (!inBoard(c, rr)) { if (i >= n) break; continue; }
      const key = c + ',' + rr;
      if (!seen.has(key)) { seen.add(key); cells.push([c, rr]); }
    }
    return cells;
  }

  /* (c,r) está no leque que sai de src na direção de tgt? */
  function inCone(srcC, srcR, tgtC, tgtR, c, r, len, halfDeg = 46) {
    if (hexDist(srcC, srcR, c, r) > len || (srcC === c && srcR === r)) return false;
    const s0 = toPixel(srcC, srcR), t0 = toPixel(tgtC, tgtR), p = toPixel(c, r);
    const ax = t0.x - s0.x, ay = t0.y - s0.y, bx = p.x - s0.x, by = p.y - s0.y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (!la || !lb) return false;
    return (ax * bx + ay * by) / (la * lb) >= Math.cos(halfDeg * Math.PI / 180);
  }

  /* fileira e coluna inteiras de (c,r): o formato de + do Ziggs */
  const inPlus = (centerC, centerR, c, r) => c === centerC || r === centerR;

  const GEO = { hexDist, hexLine, inCone, inPlus, inBoard };
  const byStar = (v, star) => (Array.isArray(v) ? v[Math.min(star, v.length) - 1] : (v || 0));

  function baseUnit(id, side, c, r) {
    return {
      id, side, c, r, alive: true, star: 1, role: '', spec: null, traits: [], itemIds: [], has: new Set(),
      maxHp: 500, hp: 500, ad: 50, ap: 100, armor: 0, mr: 0, asBase: 0.7, asBonus: 0, crit: 0.25, critDmg: 1.4,
      mana: 0, maxMana: 0, manaRegen: 0, vamp: 0, amp: 0, abilityAmp: 0, abilityCrit: false, dura: 0, range: 1,
      shields: [], atkT: 0, moveT: 0, castUntil: 0, stunUntil: 0, untargetUntil: 0, ccImmuneUntil: 0, target: null,
      sunderUntil: 0, sunderV: 0, shredUntil: 0, shredV: 0, burnUntil: 0, woundUntil: 0, debuffUntil: 0,
      dots: [], aura: null, buffUntil: 0, buffAS: 0, once: {}, stacks: {}, boom: 0, boomTier: null, vanguard: null,
      gargBonus: 0, critStacks: [], icd: {}, extraHits: 0, duraV: 0, duraUntil: 0, dmgBy: null, chakram: null,
      stat: { p: 0, m: 0, t: 0, reduced: 0, shield: 0, heal: 0, cc: 0, taken: 0, kills: 0 },
    };
  }

  function makeChampionUnit(raw, id, side, rng) {
    const ch = CH[raw.c];
    const c = side === 0 ? raw.x : 6 - raw.x;
    const r = side === 0 ? 3 - raw.y : 4 + raw.y;
    const u = baseUnit(id, side, c, r);
    const hpMul = Math.pow(1.8, raw.star - 1);
    const adMul = Math.pow(1.5, raw.star - 1);
    Object.assign(u, {
      champ: raw.c, star: raw.star, role: ch.role, spec: ABILITIES[ch.name], traits: ch.traits, lx: raw.x, ly: raw.y,
      asBase: ch.as, armor: ch.armor, mr: ch.mr, range: ch.range, mana: ch.mana0, maxMana: Math.max(ch.mana, ch.mana0 >= ch.mana ? ch.mana0 : 0),
      items: raw.items.slice(),
    });
    if (ch.mana0 >= ch.mana) u.mana = 0;
    if (raw.fullMana) u.mana = u.maxMana;
    u.uid = raw.uid;
    u.cost = ch.cost;
    let ids = raw.items.slice();
    if (ids.includes('ThiefsGloves')) ids = ids.concat([pick(rng, FULL_ITEMS), pick(rng, FULL_ITEMS)]);
    u.itemIds = ids;
    u.has = new Set(ids);

    let hpFlat = 0, hpPct = 0, adPct = 0;
    for (const itemId of ids) {
      const fx = ITEMS[itemId].fx;
      hpFlat += num(fx.Health);
      hpPct += num(fx.BonusPercentHP) + num(fx.PercentMaxHP);
      adPct += num(fx.AD) + num(fx.AD_NotStatBar);
      u.ap += num(fx.AP) + num(fx.AP_NotStatBar);
      u.asBonus += num(fx.AS) / 100;
      u.armor += num(fx.Armor);
      u.mr += num(fx.MagicResist);
      u.crit += num(fx.CritChance) / 100;
      u.manaRegen += num(fx.ManaRegen);
      u.mana += num(fx.CombatStartMana);
      u.amp += num(fx.BonusDamage);
      u.vamp += num(fx.StatOmnivamp) + num(fx.StatOmnivamp_NotStatBar);
    }
    u.baseAd = ch.ad * adMul;
    u.adPct = adPct;
    u.maxHp = (ch.hp * hpMul + hpFlat) * (1 + hpPct);
    const perm = raw.perm;
    if (perm) {
      u.maxHp = (u.maxHp + (perm.hp || 0)) * (1 + (perm.hpPct || 0));
      u.adPct += perm.ad || 0;
      u.ap += perm.ap || 0;
      u.asBonus += perm.as || 0;
      u.dura += perm.dura || 0;
    }
    const emblemTraits = emblemsOf({ itemIds: ids }).filter(t => !ch.traits.includes(t));
    if (emblemTraits.length) u.traits = [...ch.traits, ...emblemTraits];
    if (u.has.has('InfinityEdge') || u.has.has('JeweledGauntlet')) u.abilityCrit = true;
    if (u.has.has('BlueBuff')) { u.adPct += 0.1; u.ap += 10; }
    if (u.has.has('AdaptiveHelm')) {
      if (TANK_ROLES.has(ch.role)) { u.armor += 30; u.mr += 30; }
      else { u.adPct += 0.1; u.ap += 10; }
    }
    if (u.has.has('NightHarvester')) u.dura += 0.05;
    if (u.has.has('SpectralGauntlet')) { u.armor += 15; u.mr += 15; }
    if (u.has.has('Quicksilver')) u.ccImmuneUntil = 18;
    return u;
  }

  function makeCreep(k, id, side) {
    const d = CREEPS[k.key];
    const [x, y] = k.spot.split(',').map(Number);
    const u = baseUnit(id, side, side === 0 ? x : 6 - x, side === 0 ? 3 - y : 4 + y);
    Object.assign(u, { creep: k.key, maxHp: d.hp, baseAd: d.ad, adPct: 0, asBase: d.as, armor: d.armor, mr: d.mr, range: d.range, items: [], lx: x, ly: y });
    return u;
  }

  /* bônus de traits antes do combate */
  function applyTraits(team, chrome) {
    const champs = team.filter(u => u.champ);
    const counts = traitCountsOf(champs, u => u.champ);
    const shared = {};
    const strongest = list => list.slice().sort((a, b) => (b.star * 10 + CH[b.champ].cost + b.itemIds.length) - (a.star * 10 + CH[a.champ].cost + a.itemIds.length))[0];
    const ofTrait = name => champs.filter(u => u.traits.includes(name));

    for (const [name, count] of Object.entries(counts)) {
      const v = activeTier(name, count);
      if (!v) continue;
      const mine = ofTrait(name);
      switch (name) {
        case 'Brutamontes':
          champs.forEach(u => { u.maxHp += v.TeamwideHealth; });
          mine.forEach(u => { u.maxHp *= 1 + v.HealthBonus; });
          break;
        case 'Bastião':
          champs.forEach(u => { u.armor += v.TeamwideArmor; u.mr += v.TeamwideArmor; });
          mine.forEach(u => { u.armor += v.BonusArmor * 2; u.mr += v.BonusMR * 2; u.bastion = v.BonusArmor; });
          break;
        case 'Vanguarda':
          mine.forEach(u => { u.vanguard = v; });
          break;
        case 'Dizimador':
          mine.forEach(u => { u.adPct += v.AttackDamage; u.vamp += v.Healing; });
          break;
        case 'Fumegante':
          champs.forEach(u => { u.asBonus += v.TeamBonus; });
          mine.forEach(u => { u.smoke = { per: v.AttackSpeed, max: v.MaxStacks }; });
          break;
        case 'Estratégico':
          champs.forEach(u => {
            const mul = u.traits.includes(name) ? 3 : 1;
            if (u.ly >= 2) u.amp += v.DamageAmp * mul; else u.dura += v.Durability * mul;
          });
          break;
        case 'Atirador':
          mine.forEach(u => { u.adPct += v.BonusAD; u.gunner = v; });
          break;
        case 'Boi Dourado':
          mine.forEach(u => { u.amp += v.DamageAmp; u.goldChance = v.KillDrop; });
          break;
        case 'Boom Bot':
          mine.forEach(u => { u.boomTier = v; });
          break;
        case 'Tecnológico':
          mine.forEach(u => { u.ap += v.APBonus; u.tech = true; });
          break;
        case 'Dínamo':
          shared.dynamo = v.Mana;
          break;
        case 'Carrasco':
          mine.forEach(u => { u.abilityCrit = true; u.crit += v.CRIT_PERCENT; u.critDmg += v.CRIT_DAMAGE; });
          break;
        case 'A.M.P.':
          mine.forEach(u => { u.maxHp += v.HPAmt; u.abilityAmp += 0.05 * v.SuperchargeAmount; });
          break;
        case 'Esquadrão Anima':
          mine.forEach(u => { u.armor += v.Resists; u.mr += v.Resists; u.amp += v.DamageAmp; u.anima = true; });
          break;
        case 'ExoTec':
          mine.forEach(u => {
            const n = u.items.length + 1;
            u.maxHp += v.HealthBonus * n;
            u.asBonus += (v.ASBonus * n) / 100;
          });
          break;
        case 'Demônio Urbano':
          champs.forEach(u => {
            if (!RULES.paintedHexes.includes(`${u.lx},${u.ly}`)) return;
            const mul = u.traits.includes(name) ? 2 : 1;
            u.maxHp *= 1 + v.HP * mul;
            u.adPct += (v.ADAP / 100) * mul;
            u.ap += v.ADAP * mul;
          });
          break;
        case 'Transgressor':
          mine.forEach(u => { u.maxHp += v.MobHealth; u.amp += v.DamageAmp; });
          mine.slice().sort((a, b) => b.star - a.star).slice(0, v.NumBosses).forEach(u => { u.abilityAmp += 0.3; });
          break;
        case 'Divinicorp': {
          const has = id => mine.some(u => CH[u.champ].name === id);
          const bonus = v.DivinicorpBonus;
          champs.forEach(u => {
            const mul = bonus * (u.traits.includes(name) ? 2 : 1);
            if (has('Morgana')) u.ap += 8 * mul;
            if (has('Rhaast')) { u.armor += 6 * mul; u.mr += 6 * mul; }
            if (has('Senna')) u.adPct += 0.07 * mul;
            if (has('Gragas')) u.maxHp += 50 * mul;
            if (has('Vex')) u.crit += 0.09 * mul;
            if (has('Renekton')) u.asBonus += 0.05 * mul;
          });
          break;
        }
        case 'Ciberchefão': {
          const bosses = v.min >= 4 ? mine : [strongest(mine)];
          bosses.forEach(u => { u.maxHp *= 1 + num(v.BossPercentHealth || v.BigBossPercentHealth); u.ap += num(v.BossAP || v.BigBossAP); u.extraHits = 1; });
          break;
        }
        case 'Cifra':
          mine.forEach(u => { u.adPct += v.AttackDamage; u.ap += v.AbilityPower; });
          break;
        case 'Nitro': {
          const u = strongest(mine);
          u.maxHp += chrome * v.HealthPerScrap;
          u.ap += chrome * v.APPerScrap;
          break;
        }
        case 'Mata-almas':
          mine.forEach(u => { u.soul = true; });
          break;
        case 'Soberano':
          mine.forEach(u => {
            // o aliado "atrás" fica na linha seguinte
            const behind = champs.find(x => x !== u && x.lx === u.lx && x.ly === u.ly + 1);
            if (!behind) return;
            u.overlord = { victim: behind, dmg: v.HPPercentDamage };
            u.maxHp += behind.maxHp * v.PercentHPGain;
            u.baseAd += behind.baseAd * v.PercentADGain;
          });
          break;
        case 'Deus das Redes':
          mine.forEach(u => { u.maxHp *= 1.25; u.adPct += 0.25; });
          break;
        case 'Vírus':
          mine.forEach(u => { u.maxHp *= 1.3; u.ap += 30; });
          break;
        case 'Atirador de Elite':
          mine.forEach(u => { u.sniper = v.PercentDamageIncrease / 100; });
          break;
        default: break;
      }
    }
    team.forEach(u => {
      u.ad = u.baseAd * (1 + (u.adPct || 0));
      u.hp = u.maxHp;
    });
    return shared;
  }

  /* atributos prontos para a tela (já com itens e, em campo, traits) */
  const statsOf = u => ({
    hp: Math.round(u.maxHp), ad: Math.round(u.ad), ap: Math.round(u.ap), armor: Math.round(u.armor), mr: Math.round(u.mr),
    as: Math.round(u.asBase * (1 + u.asBonus) * 100) / 100, crit: Math.round(u.crit * 100), range: u.range,
    mana: Math.round(u.mana), maxMana: u.maxMana, vamp: Math.round(u.vamp * 100), amp: Math.round(u.amp * 100),
  });
  function previewUnit(c, star, items) {
    const u = makeChampionUnit({ c, star, items, x: 0, y: 0 }, 1, 0, makeRng(1));
    u.ad = u.baseAd * (1 + u.adPct);
    return statsOf(u);
  }
  function previewBoard(board, chrome) {
    const rng = makeRng(1);
    const list = Object.entries(board).map(([key, raw], i) => {
      const [x, y] = key.split(',').map(Number);
      const u = makeChampionUnit({ ...raw, x, y }, i + 1, 0, rng);
      u.uid = raw.uid;
      return u;
    });
    applyTraits(list, chrome || 0);
    return Object.fromEntries(list.map(u => [u.uid, statsOf(u)]));
  }

  function simulate(teamA, teamB, seed) {
    const rng = makeRng(seed);
    const units = [];
    let nextId = 1;
    const shared = [];
    [teamA, teamB].forEach((team, side) => {
      const list = [];
      for (const raw of team.units || []) list.push(makeChampionUnit(raw, nextId++, side, rng));
      for (const k of team.creeps || []) list.push(makeCreep(k, nextId++, side));
      shared[side] = applyTraits(list, team.chrome || 0);
      units.push(...list);
    });

    units.forEach(u => { u.start = statsOf(u); });
    const occ = new Map();
    const cellKey = (c, r) => `${c},${r}`;
    units.forEach(u => occ.set(cellKey(u.c, u.r), u.id));
    const byId = new Map(units.map(u => [u.id, u]));
    const goldDrops = [0, 0];
    const augHooks = [null, null];
    const augGold = [0, 0];
    const permGains = [];
    const queue = [];   // tiros repetidos das habilidades
    const frames = [];
    let events = [];
    let t = 0;

    const alive = side => units.filter(u => u.alive && u.side === side);
    const enemiesOf = u => alive(1 - u.side);
    const dist = (a, b) => hexDist(a.c, a.r, b.c, b.r);
    const targetable = x => x.alive && x.untargetUntil <= t;
    const nearest = (u, list) => {
      let best = null, bd = 99;
      let ties = 1;
      for (const x of list) {
        const d = dist(u, x);
        if (d < bd) { best = x; bd = d; ties = 1; }
        else if (d === bd && rng() < 1 / ++ties) best = x;   // empate: sem preferência de lado
      }
      return best;
    };

    /* primeiro passo do caminho mais curto até ficar ao alcance de tgt, desviando das outras unidades */
    function pathStep(u, tgt) {
      const seen = new Set([cellKey(u.c, u.r)]);
      const queue = [{ c: u.c, r: u.r, first: null }];
      for (let i = 0; i < queue.length; i++) {
        const cur = queue[i];
        const next = neighbors(cur.c, cur.r);
        for (let j = next.length - 1; j > 0; j--) { const k = Math.floor(rng() * (j + 1)); [next[j], next[k]] = [next[k], next[j]]; }
        for (const [x, y] of next) {
          const key = cellKey(x, y);
          if (seen.has(key) || occ.has(key)) continue;
          seen.add(key);
          const first = cur.first || [x, y];
          if (hexDist(x, y, tgt.c, tgt.r) <= u.range) return first;
          queue.push({ c: x, r: y, first });
        }
      }
      return null;
    }

    function addShield(u, amount, dur) { u.shields.push({ v: amount, until: t + dur }); events.push(['sh', u.id]); }
    const shieldTotal = u => u.shields.reduce((s, x) => s + x.v, 0);
    function heal(u, amount) {
      if (!u.alive || amount <= 0) return;
      const real = amount * (u.woundUntil > t ? 0.67 : 1);
      u.stat.heal += Math.min(real, u.maxHp - u.hp);
      u.hp = Math.min(u.maxHp, u.hp + real);
      if (real >= 15) events.push(['h', u.id, Math.round(real)]);
    }
    function stun(u, sec, src) {
      if (!u.alive || u.ccImmuneUntil > t) return;
      if (src) src.stat.cc += Math.max(0, t + sec - Math.max(u.stunUntil, t));
      u.stunUntil = Math.max(u.stunUntil, t + sec);
      events.push(['st', u.id, Math.round(sec * 100) / 100]);
    }

    function kill(u, src) {
      u.alive = false;
      occ.delete(cellKey(u.c, u.r));
      events.push(['x', u.id]);
      if (src) src.stat.kills++;
      if (src && src.goldChance && rng() < src.goldChance) { goldDrops[src.side]++; events.push(['g', src.id]); }
      if (src && src.soul) { heal(src, src.maxHp * 0.25); src.amp += 0.1; }
      const own = augHooks[u.side], foe = augHooks[1 - u.side];
      if (own) own.allyDeath.forEach(fn => fn(u, src));
      if (foe) foe.enemyDeath.forEach(fn => fn(u, src));
      if (foe && src && src.side === foe.side) foe.kill.forEach(fn => fn(src, u));
    }

    function checkThresholds(u) {
      const pct = u.hp / u.maxHp;
      const hk = augHooks[u.side];
      if (hk) hk.hpBelow.forEach((h, i) => { const k = 'aug' + i; if (pct <= h.pct && !u.once[k]) { u.once[k] = true; h.fn(u); } });
      const once = (key, limit, fn) => { if (pct <= limit && !u.once[key]) { u.once[key] = true; fn(); } };
      if (u.vanguard) once('van', 0.5, () => addShield(u, u.maxHp * u.vanguard.ShieldPercentAmount, u.vanguard.ShieldDuration));
      if (u.has.has('SteraksGage')) once('sterak', 0.6, () => addShield(u, u.maxHp * 0.4, 4));
      if (u.has.has('Bloodthirster')) once('blood', 0.4, () => addShield(u, u.maxHp * 0.25, 5));
      if (u.has.has('FrozenHeart')) once('vow', 0.4, () => { addShield(u, u.maxHp * 0.2, 60); u.mana += 15; });
      if (u.has.has('GuardianAngel')) once('edge', 0.6, () => {
        u.untargetUntil = t + 1; u.stunUntil = 0; heal(u, (u.maxHp - u.hp) * 0.2);
      });
    }

    function hit(src, tgt, raw, type, o = {}) {
      if (!tgt.alive || tgt.untargetUntil > t || raw <= 0) return 0;
      let amount = raw;
      let crit = false;
      if ((o.attack || (o.ability && src.abilityCrit)) && !o.noProc && rng() < src.crit) { amount *= src.critDmg; crit = true; }
      let amp = 1 + src.amp + (o.ability ? src.abilityAmp : 0);
      if (src.has.has('MadredsBloodrazor') && TANK_ROLES.has(tgt.role)) amp += 0.15;
      amp += src.critStacks.filter(s => s > t).length * 0.05;
      if (src.sniper) amp += src.sniper * dist(src, tgt);
      if (src.debuffUntil > t) amp *= 0.9;
      const srcHooks = src.side != null ? augHooks[src.side] : null;
      if (srcHooks) for (const fn of srcHooks.damageMul) amp += fn(src);
      if (t > 30) amp *= 1 + (t - 30) * 0.25;   // prorrogação
      amount *= amp;
      let res = 0;
      if (type === 'p') res = Math.max(0, tgt.armor + tgt.gargBonus) * (tgt.sunderUntil > t ? 1 - tgt.sunderV : 1);
      if (type === 'm') res = Math.max(0, tgt.mr + tgt.gargBonus) * (tgt.shredUntil > t ? 1 - tgt.shredV : 1);
      let final = type === 't' ? amount : amount * 100 / (100 + res);
      let dura = tgt.dura + (tgt.duraUntil > t ? tgt.duraV : 0);
      if (tgt.vanguard && tgt.shields.length) dura += tgt.vanguard.min >= 6 ? tgt.vanguard.EnhancedDurability : tgt.vanguard.DamageReductionPct;
      if (tgt.has.has('NightHarvester') && tgt.hp / tgt.maxHp > 0.5) dura += 0.1;
      final *= 1 - Math.min(0.8, dura);
      if (o.attack && tgt.has.has('BrambleVest')) final *= 0.95;

      const dealt = final;
      src.stat[type] += dealt;
      tgt.stat.taken += dealt;
      tgt.stat.reduced += Math.max(0, amount - dealt);
      for (const s of tgt.shields) {
        const take = Math.min(s.v, final);
        s.v -= take;
        final -= take;
        if (final <= 0) break;
      }
      tgt.stat.shield += dealt - final;
      tgt.shields = tgt.shields.filter(s => s.v > 0);
      tgt.hp -= final;
      if (tgt.dmgBy && src.id) tgt.dmgBy.set(src.id, (tgt.dmgBy.get(src.id) || 0) + dealt);
      if (!tgt.casting && !(tgt.spec && tgt.spec.attacksPerCast)) tgt.mana += Math.min(42, raw * 0.01 + dealt * 0.03);
      events.push(['d', tgt.id, Math.round(dealt), type, crit ? 1 : 0]);
      if (srcHooks && !o.noProc) {
        for (const fn of srcHooks.dealt) fn(src, tgt, dealt, o);
        if (crit) for (const fn of srcHooks.critHit) fn(src, tgt);
        if (crit && o.ability) for (const fn of srcHooks.abilityCrit) fn(src, tgt);
      }

      if (src.vamp > 0) heal(src, dealt * src.vamp);
      if (src.has.has('HextechGunblade')) {
        const hurt = alive(src.side).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt) heal(hurt, dealt * 0.2);
      }
      if (crit && src.has.has('PowerGauntlet')) { src.critStacks.push(t + 5); src.critStacks = src.critStacks.slice(-4); }

      if (!o.noProc) {
        if (src.has.has('LastWhisper')) { tgt.sunderUntil = t + 3; tgt.sunderV = Math.max(tgt.sunderV, 0.3); }
        if (src.has.has('StatikkShiv')) { tgt.shredUntil = t + 5; tgt.shredV = Math.max(tgt.shredV, 0.3); }
        if (src.has.has('Morellonomicon') || src.has.has('RapidFireCannon')) { tgt.burnUntil = t + 10; tgt.woundUntil = t + 10; }
        if (o.ability && src.tech) tgt.debuffUntil = t + 3;
        if (o.attack && tgt.has.has('BrambleVest') && (tgt.icd.bramble || 0) <= t) {
          tgt.icd.bramble = t + 2;
          enemiesOf(tgt).filter(x => dist(x, tgt) <= 1).forEach(x => hit(tgt, x, 100 * (tgt.brambleMul || 1), 'm', { noProc: true }));
        }
        if (src.has.has('TitansResolve') && (src.stacks.titan || 0) < 25) { src.stacks.titan = (src.stacks.titan || 0) + 1; src.adPct += 0.02; src.ap += 2; src.ad = src.baseAd * (1 + src.adPct); }
        if (tgt.has.has('TitansResolve') && (tgt.stacks.titan || 0) < 25) { tgt.stacks.titan = (tgt.stacks.titan || 0) + 1; tgt.adPct += 0.02; tgt.ap += 2; tgt.ad = tgt.baseAd * (1 + tgt.adPct); }
        const boomOf = (u, value) => {
          if (!u.boomTier || !u.alive) return;
          u.boom += value;
          while (u.boom >= u.boomTier.DamageDealtThreshold) {
            u.boom -= u.boomTier.DamageDealtThreshold;
            const m = nearest(u, enemiesOf(u));
            if (m) { events.push(['a', u.id, m.id, 'boom']); hit(u, m, u.boomTier.MissileDamage * u.ap / 100, 'm', { noProc: true, ability: true }); }
          }
        };
        boomOf(src, dealt);
        if (tgt.boomTier) boomOf(tgt, dealt * tgt.boomTier.DamageTakenMod);
      }

      if (tgt.hp <= 0) kill(tgt, src); else checkThresholds(tgt);
      return dealt;
    }

    /* ---------- Habilidade ---------- */
    function abilityTarget(u, spec) {
      const en = enemiesOf(u).filter(targetable);
      if (!en.length) return null;
      if (spec.aim) {
        const aimed = aimTarget(u, spec.aim, en);
        if (aimed) return aimed;
      }
      if (spec.target === 'far') return en.slice().sort((a, b) => dist(u, b) - dist(u, a))[0];
      if (spec.target === 'low') return en.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (spec.target === 'rand') return pick(rng, en);
      return u.target && targetable(u.target) ? u.target : nearest(u, en);
    }

    /* onde o golpe mira: maior grupo, formato de +, linha com mais inimigos ou o mais distante */
    function aimTarget(u, aim, en) {
      const reach = aim.range === 'attack' ? u.range : aim.range;
      const inReach = reach ? en.filter(x => dist(u, x) <= reach) : en;
      const pool = inReach.length ? inReach : en;
      const best = score => {
        let top = null, topScore = -1, topDist = 99;
        for (const x of pool) {
          const v = score(x), d = dist(u, x);
          if (v > topScore || (v === topScore && d < topDist)) { top = x; topScore = v; topDist = d; }
        }
        return top;
      };
      if (aim.far) {
        const near = en.filter(x => dist(u, x) <= aim.far);
        return (near.length ? near : en).slice().sort((a, b) => dist(u, b) - dist(u, a) || a.id - b.id)[0];
      }
      if (aim.group) return best(x => en.filter(y => dist(x, y) <= aim.group).length);
      if (aim.plus) return best(x => en.filter(y => inPlus(x.c, x.r, y.c, y.r)).length);
      if (aim.line) {
        return best(x => {
          const cells = new Set(hexLine(u.c, u.r, x.c, x.r, 14).map(([c, r]) => c + ',' + r));
          return en.filter(y => cells.has(y.c + ',' + y.r)).length;
        });
      }
      return null;
    }

    function spellDamage(u, spec) {
      const base = spec.dmg ? spec.dmg[u.star - 1] * u.ap / 100 : 0;
      return base + (spec.ad ? spec.ad * u.ad : 0);
    }

    function spellHit(u, spec, tgt) {
      if (!tgt || !tgt.alive) return;
      const dmg = spellDamage(u, spec);
      if (spec.dot) tgt.dots.push({ dps: dmg / spec.dot, until: t + spec.dot, src: u.id });
      else if (dmg > 0) hit(u, tgt, dmg, spec.type || 'm', { ability: true });
      if (spec.stun && !spec.stunAoe) stun(tgt, spec.stun, u);
      if (spec.sunder) { tgt.sunderUntil = t + 4.4; tgt.sunderV = Math.max(tgt.sunderV, spec.sunder); }
      if (spec.shred) { tgt.shredUntil = t + 30; tgt.shredV = Math.max(tgt.shredV, spec.shred); }
      if (spec.wound) tgt.woundUntil = t + 5;
    }

    const unitAt = (list, c, r) => list.find(x => x.c === c && x.r === r) || null;

    function stepDamage(u, st) {
      return byStar(st.dmg, u.star) * u.ap / 100
        + byStar(st.ad, u.star) * u.ad
        + byStar(st.armorPct, u.star) * u.armor
        + (st.hpPct || 0) * u.maxHp;
    }

    function landOn(u, st, tgt, amount) {
      if (!tgt || !tgt.alive) return 0;
      if (amount > 0) hit(u, tgt, amount, st.type || 'm', { ability: true });
      if (st.stun && tgt.alive) stun(tgt, byStar(st.stun, u.star), u);
      if (st.wound) tgt.woundUntil = t + 5;
      return amount;
    }

    /* executa uma etapa do golpe: sx,sy é de onde saiu; cx,cy é a casa mirada */
    function runStep(u, spec, st, main, sx, sy, cx, cy) {
      const en = enemiesOf(u).filter(targetable);
      const dmg = stepDamage(u, st);
      let count = 0;
      if (st.selfHeal && u.alive) heal(u, byStar(st.selfHeal, u.star) * u.ap / 100);
      if (st.shape === 'target') {
        const tgt = main && main.alive ? main : nearest({ c: cx, r: cy }, en);
        if (tgt) {
          const before = tgt.hp + shieldTotal(tgt);
          landOn(u, st, tgt, dmg);
          count = 1;
          if (st.overkill && !tgt.alive && dmg > before) {
            const next = nearest(tgt, enemiesOf(u).filter(targetable));
            if (next) landOn(u, { ...st, stun: 0 }, next, dmg - before);
          }
        }
      } else if (st.shape === 'nearest') {
        const pool = en.filter(x => st.includeMain || x !== main)
          .sort((a, b) => hexDist(a.c, a.r, cx, cy) - hexDist(b.c, b.r, cx, cy) || a.id - b.id)
          .slice(0, st.n || 1);
        for (const x of pool) { landOn(u, st, x, dmg); count++; }
      } else if (st.shape === 'area') {
        const center = unitAt(en, cx, cy) || (main && main.alive ? main : null);
        for (const x of en.filter(y => hexDist(y.c, y.r, cx, cy) <= (st.radius || 1))) {
          const isCenter = x === center;
          const other = st.other ? byStar(st.other, u.star) * u.ap / 100 : st.otherMul ? dmg * st.otherMul : dmg;
          landOn(u, st, x, isCenter ? dmg : other);
          count++;
        }
        if (st.stunCenter && center && center.alive) stun(center, byStar(st.stunCenter, u.star), u);
      } else if (st.shape === 'line') {
        const reachOfTarget = hexDist(sx, sy, cx, cy);
        const len = st.len === 'edge' ? 14 : st.toTarget ? reachOfTarget : st.beyond ? reachOfTarget + st.beyond : st.len;
        let mul = 1;
        for (const [c, r] of hexLine(sx, sy, cx, cy, len)) {
          const x = unitAt(en, c, r);
          if (!x || (st.skipMain && x === main)) continue;
          landOn(u, st, x, dmg * mul);
          count++;
          if (st.reduce) mul *= 1 - st.reduce;
        }
      } else if (st.shape === 'cone') {
        const victims = en.filter(x => inCone(sx, sy, cx, cy, x.c, x.r, st.len || 2));
        if (main && main.alive && !victims.includes(main)) victims.push(main);
        for (const x of victims) {
          // cada projétil é um tiro: o alvo leva a maioria, quem está no leque leva parte
          const pellets = st.pellets ? (x === main ? st.pellets : Math.ceil(st.pellets / 5)) : 1;
          landOn(u, st, x, dmg * pellets);
          count++;
        }
      } else if (st.shape === 'plus') {
        const hitList = en.filter(x => inPlus(cx, cy, x.c, x.r) && dist(u, x) <= u.range + 1 || hexDist(x.c, x.r, cx, cy) <= (st.radius || 1));
        const solo = hitList.length === 1 ? (st.soloMul || 1) : 1;
        for (const x of hitList) {
          const near = hexDist(x.c, x.r, cx, cy) <= (st.radius || 1);
          landOn(u, st, x, (near ? dmg : byStar(st.far, u.star) * u.ap / 100) * solo);
          count++;
        }
      }
      return count;
    }

    /* golpe com formato: agenda cada etapa e avisa a tela o que vai acontecer */
    function castSteps(u, spec, main) {
      const sx = u.c, sy = u.r, cx = main ? main.c : u.c, cy = main ? main.r : u.r;
      let firstHits = -1;
      let total = 0;
      spec.steps.forEach((st, idx) => {
        const delay = (st.delay || 0) + (st.travel && main ? Math.max(0.1, dist(u, main) / st.travel) : 0);
        const fire = () => {
          if (st.lateAim) {
            // Galio: se vira para quem mais o feriu durante o bloqueio
            if (!u.alive) return;
            const foes = enemiesOf(u).filter(targetable);
            const top = foes.slice().sort((a, b) => ((u.dmgBy && u.dmgBy.get(b.id)) || 0) - ((u.dmgBy && u.dmgBy.get(a.id)) || 0) || dist(u, a) - dist(u, b))[0];
            u.dmgBy = null;
            if (top) {
              events.push(['fx', u.id, idx, top.id, top.c, top.r, 0]);
              runStep(u, spec, st, top, u.c, u.r, top.c, top.r);
            } else if (st.selfHeal) heal(u, byStar(st.selfHeal, u.star) * u.ap / 100);
            return;
          }
          const n = runStep(u, spec, st, main, sx, sy, cx, cy);
          total += n;
          if (firstHits < 0) firstHits = n;
          if (spec.chakram && idx === 0) u.chakram = { n: spec.chakram.base + n, left: spec.chakram.attacks };
          if (spec.refund && idx === spec.steps.length - 1 && total <= spec.refund.atMost + 1 && u.alive) u.mana += spec.refund.mana;
        };
        if (!st.lateAim) events.push(['fx', u.id, idx, main ? main.id : 0, cx, cy, Math.round(delay * 100) / 100]);
        if (delay > 0) queue.push({ at: t + delay, src: u, run: fire });
        else fire();
      });
    }

    function cast(u) {
      const spec = u.spec;
      if (!spec) { u.mana = 0; return; }
      const main = abilityTarget(u, spec);
      u.mana = 0;
      u.castUntil = t + 0.5;
      events.push(['c', u.id, main ? main.id : 0]);

      // Centelha Iônica de inimigos próximos reage à conjuração
      for (const e of enemiesOf(u)) {
        if (e.has.has('IonicSpark') && dist(e, u) <= 2) hit(e, u, u.maxMana * 1.5, 'm', { noProc: true });
      }
      if (!u.alive) return;

      if (augHooks[u.side]) augHooks[u.side].cast.forEach(fn => fn(u));
      if (spec.channel) u.castUntil = t + spec.channel;
      if (spec.durable) {
        u.duraV = byStar(spec.durable, u.star);
        u.duraUntil = t + spec.durableDur;
        if (spec.channel) u.dmgBy = new Map();
      }
      if (spec.teamAS) for (const ally of alive(u.side)) ally.asBonus += spec.teamAS;

      if (spec.shield) addShield(u, spec.shield[u.star - 1] * u.ap / 100 + (spec.shieldHp || 0) * u.maxHp, spec.shieldDur || 4);
      if (spec.heal) heal(u, spec.heal[u.star - 1] * u.ap / 100 + (spec.healHp || 0) * u.maxHp);
      if (spec.hpGain) { const g = spec.hpGain[u.star - 1] * u.ap / 100; u.maxHp += g; u.hp += g; }
      if (spec.aura) u.aura = { dps: spec.aura[u.star - 1] * u.ap / 100, until: t + spec.auraDur, radius: spec.auraRadius || 1, heal: spec.auraHeal || 0 };
      if (spec.buffAS) { u.buffUntil = t + spec.buffDur; u.buffAS = spec.buffAS; }
      if (spec.steps) { castSteps(u, spec, main); return; }
      if (!main) return;

      const hits = (spec.hits || 1) + u.extraHits;
      const victims = [main, ...enemiesOf(u).filter(x => x !== main && targetable(x)).sort((a, b) => dist(main, a) - dist(main, b)).slice(0, hits - 1)];
      for (let i = 0; i < (spec.volley || 1); i++) {
        victims.forEach((v, n) => queue.push({ at: t + i * 0.15 + n * 0.02, src: u, tgt: v, spec }));
      }
      if (spec.radius) {
        const around = enemiesOf(u).filter(x => !victims.includes(x) && dist(main, x) <= spec.radius);
        for (const x of around) {
          if (spec.splash) hit(u, x, spec.splash[u.star - 1] * u.ap / 100, spec.type || 'm', { ability: true });
          if (spec.splashAd) hit(u, x, spec.splashAd * u.ad, spec.type || 'p', { ability: true });
          if (spec.stunAoe) stun(x, spec.stun, u);
          if (spec.wound) x.woundUntil = t + 5;
        }
        if (spec.stunAoe) stun(main, spec.stun, u);
      } else if (spec.stunAoe) stun(main, spec.stun, u);
    }

    function attack(u, tgt) {
      events.push(['a', u.id, tgt.id]);
      const spec = u.spec;
      if (spec && spec.attackCone) {
        // Graves: os projéteis do leque; o alvo leva todos, os outros só um
        const cone = spec.attackCone;
        hit(u, tgt, u.ad * cone.ad * cone.pellets, 'p', { attack: true });
        for (const x of enemiesOf(u).filter(targetable)) {
          if (x !== tgt && inCone(u.c, u.r, tgt.c, tgt.r, x.c, x.r, cone.len)) hit(u, x, u.ad * cone.ad, 'p', { attack: true, noProc: true });
        }
      } else {
        hit(u, tgt, u.ad, 'p', { attack: true });
      }
      if (augHooks[u.side]) augHooks[u.side].attackHit.forEach(fn => fn(u, tgt));
      if (u.manaOnAttack) u.mana += u.manaOnAttack;
      if (u.chakram && u.chakram.left > 0 && tgt.alive) {
        u.chakram.left--;
        hit(u, tgt, byStar(spec.chakram.ad, u.star) * u.ad * u.chakram.n, 'p', { noProc: true, ability: true });
      }
      if (!u.alive) return;
      if (spec && spec.attacksPerCast) u.mana += u.maxMana / spec.attacksPerCast;
      else if (!u.casting) u.mana += 10;
      if (u.has.has('SpearOfShojin')) u.mana += 5;
      if (u.has.has('Leviathan')) u.mana += rng() < u.crit ? 4 : 2;
      if (u.smoke && (u.stacks.smoke || 0) < u.smoke.max) { u.stacks.smoke = (u.stacks.smoke || 0) + 1; u.asBonus += u.smoke.per; }
      if (u.has.has('RunaansHurricane')) {
        const n = (u.stacks.kraken || 0) + 1;
        u.stacks.kraken = n;
        if (n <= 15) { u.adPct += 0.04; u.ad = u.baseAd * (1 + u.adPct); }
        else if (n === 16) u.asBonus += 0.15;
      }
    }

    function everySecond(sec) {
      for (const side of [0, 1]) {
        if (shared[side].dynamo && sec % 3 === 0) {
          for (const u of alive(side)) u.mana += shared[side].dynamo * (u.traits.includes('Dínamo') ? 2 : 1);
        }
        if (sec % 4 === 0) {
          const animas = alive(side).filter(u => u.anima);
          const shooter = animas.length ? pick(rng, animas) : null;
          const m = shooter && nearest(shooter, enemiesOf(shooter).filter(targetable));
          if (m) { events.push(['a', shooter.id, m.id, 'anima']); hit(shooter, m, m.maxHp * 0.06, 'm', { noProc: true }); }
        }
      }
      for (const u of units) {
        if (!u.alive) continue;
        u.mana += u.manaRegen;
        if (u.has.has('GuinsoosRageblade')) u.asBonus += 0.07;
        if (u.has.has('Quicksilver') && sec <= 18) u.asBonus += 0.03;
        if (u.has.has('Redemption')) heal(u, (u.maxHp - u.hp) * 0.02);
        if (u.has.has('DragonsClaw') && sec % 2 === 0) heal(u, u.maxHp * 0.025);
        if (u.has.has('ArchangelsStaff') && sec % 5 === 0) u.ap += 20;
        if (u.has.has('Crownguard') && sec === 8) u.ap += 25;
        if (u.has.has('SpectralGauntlet') && sec === 15) { u.armor -= 15; u.mr -= 15; }
        if (u.bastion && sec === 10) { u.armor -= u.bastion; u.mr -= u.bastion; u.bastion = 0; }
        if (u.gunner && sec === u.gunner.EnhancedTime) { u.adPct += u.gunner.BonusAD; u.ad = u.baseAd * (1 + u.adPct); }
        if (u.gunner && u.gunner.RepeatTime > 0 && sec > u.gunner.EnhancedTime && (sec - u.gunner.EnhancedTime) % u.gunner.RepeatTime === 0) {
          u.adPct += u.gunner.RepeatBonus; u.ad = u.baseAd * (1 + u.adPct);
        }
        if (u.has.has('GargoyleStoneplate')) u.gargBonus = enemiesOf(u).filter(e => e.target === u).length * 10;
        if (u.has.has('RedBuff') && sec % 2 === 0) {
          const e = nearest(u, enemiesOf(u));
          if (e && dist(u, e) <= 2) { e.burnUntil = t + 10; e.woundUntil = t + 10; }
        }
        for (const e of enemiesOf(u)) {
          if (dist(u, e) > 2) continue;
          if (u.has.has('IonicSpark')) { e.shredUntil = t + 1.2; e.shredV = Math.max(e.shredV, 0.3); }
          if (u.has.has('SpectralGauntlet')) { e.sunderUntil = t + 1.2; e.sunderV = Math.max(e.sunderV, 0.3); }
        }
        if (u.aura && u.aura.until > t) {
          for (const e of enemiesOf(u)) {
            if (dist(u, e) <= u.aura.radius) {
              const d = hit(u, e, u.aura.dps, 'm', { ability: true, noProc: true });
              if (u.aura.heal) heal(u, d * u.aura.heal);
            }
          }
          if (!u.alive) continue;
        }
        if (u.burnUntil > t) applyTrue(u, u.maxHp * (u.burnPct || 0.01) * (u.burnMul || 1), null);
        u.dots = u.dots.filter(d => d.until > t);
        for (const d of u.dots) applyTrue(u, d.dps, byId.get(d.src), 'm');
      }
    }
    function applyTrue(u, amount, src, type = 't') {
      if (!u.alive) return;
      hit(src || { amp: 0, abilityAmp: 0, has: new Set(), critStacks: [], vamp: 0, debuffUntil: 0, crit: 0, stat: { p: 0, m: 0, t: 0 } }, u, amount, type, { noProc: true });
    }

    /* ---------- Aumentos: montagem do combate ---------- */
    function buildAugments(team, side) {
      const hooks = { side, damageMul: [], dealt: [], critHit: [], abilityCrit: [], allyDeath: [], enemyDeath: [], kill: [], hpBelow: [], cast: [], attackHit: [], end: [], timers: [] };
      augHooks[side] = hooks;
      const mine = units.filter(u => u.side === side && u.champ);
      const others = () => alive(1 - side);
      const c = {
        units: mine, playerHp: team.playerHp == null ? 100 : team.playerHp, level: team.level || 1, stage: team.stage || 1, state: {}, pickedRounds: 0,
        alive: () => alive(side), enemies: others,
        enemiesNear: u => others().sort((a, b) => dist(u, a) - dist(u, b)),
        dist, now: () => t,
        after(sec, fn) { hooks.timers.push({ at: sec, fn }); },
        every(sec, fn) { hooks.timers.push({ at: sec, every: sec, fn }); },
        onKill: fn => hooks.kill.push(fn),
        onEnemyDeath: fn => hooks.enemyDeath.push(fn),
        onAllyDeath: fn => hooks.allyDeath.push(fn),
        onCast: fn => hooks.cast.push(fn),
        onAttackHit: fn => hooks.attackHit.push(fn),
        onDealt: fn => hooks.dealt.push(fn),
        onCritHit: fn => hooks.critHit.push(fn),
        onAbilityCrit: fn => hooks.abilityCrit.push(fn),
        onDamageMul: fn => hooks.damageMul.push(fn),
        onHpBelow: (pct, fn) => hooks.hpBelow.push({ pct, fn }),
        onEnd: fn => hooks.end.push(fn),
        sample(list, n) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); },
        chance: p => rng() < p,
        heal, stun: (u, sec) => stun(u, sec, null),
        shield: (u, v, d) => addShield(u, v, d),
        startShield: (u, v, d) => addShield(u, v, d),
        trueHit: (src, tgt, v) => hit(src, tgt, v, 't', { noProc: true }),
        magicHit: (src, tgt, v) => hit(src, tgt, v, 'm', { noProc: true, ability: true }),
        physicalHit: (src, tgt, v) => hit(src, tgt, v, 'p', { noProc: true }),
        gold: n => { augGold[side] += n; },
        perm: (u, perm) => { if (u.uid != null) permGains.push({ side, uid: u.uid, perm }); },
        activeTraits() { const counts = traitCountsOf(mine, u => u.champ); return Object.entries(counts).filter(([n, k]) => k > 1 && activeTier(n, k)).length; },
        bronzeTraits() { const counts = traitCountsOf(mine, u => u.champ); return Object.entries(counts).filter(([n, k]) => { const tiers = TRAITS[n] ? TRAITS[n].tiers : []; return tiers.length && k >= tiers[0].min && (tiers.length === 1 || k < tiers[1].min); }).length; },
        benchRightOccupied: n => (team.benchRight || []).slice(-n).filter(Boolean).length,
      };
      for (const a of team.augs) {
        const fx = AUG_FX[a.id];
        if (!fx || !fx.combat) continue;
        c.state = a.state;
        c.pickedRounds = Math.max(0, (team.roundIdx || 0) - (a.state.pickedRound || 0));
        fx.combat(c, AUG[a.id].fx);
      }
      if (team.mods && team.mods.burnBonus) others().forEach(e => { e.burnMul = 1 + team.mods.burnBonus; });
      for (const u of mine) {
        u.ad = u.baseAd * (1 + (u.adPct || 0));
        u.hp = u.maxHp * (u.startHpPct || 1);
        u.start = statsOf(u);
      }
    }
    [teamA, teamB].forEach((team, side) => { if (team.augs && team.augs.length) buildAugments(team, side); });

    /* início: escudos e efeitos instantâneos */
    for (const u of units) {
      if (u.vanguard) addShield(u, u.maxHp * u.vanguard.ShieldPercentAmount, u.vanguard.ShieldDuration);
      if (u.has.has('Crownguard')) addShield(u, u.maxHp * 0.25, 8);
      if (u.overlord && u.overlord.victim.alive) applyTrue(u.overlord.victim, u.overlord.victim.maxHp * u.overlord.dmg, u);
    }

    function snapshot() {
      frames.push({
        t: Math.round(t * 100) / 100,
        u: units.filter(u => u.alive).map(u => [u.id, u.c, u.r, Math.round(u.hp), Math.round(shieldTotal(u)), Math.round(u.mana), u.stunUntil > t ? 1 : 0, Math.round(u.maxHp)]),
        e: events,
      });
      events = [];
    }
    snapshot();

    const MAX_T = 45;
    let tick = 0;
    while (t < MAX_T && alive(0).length && alive(1).length) {
      t += DT;
      tick++;
      for (const u of units) if (u.shields.length) u.shields = u.shields.filter(s => s.until > t && s.v > 0);
      if (tick % 20 === 0) everySecond(tick / 20);
      for (const hk of augHooks) {
        if (!hk) continue;
        for (const timer of hk.timers) {
          if (timer.at > t) continue;
          timer.fn();
          timer.at = timer.every ? timer.at + timer.every : Infinity;
        }
      }

      for (let i = queue.length - 1; i >= 0; i--) {
        const q = queue[i];
        if (q.at > t) continue;
        queue.splice(i, 1);
        if (q.run) { if (alive(1 - q.src.side).length) q.run(); continue; }
        if (q.src.alive) spellHit(q.src, q.spec, q.tgt.alive ? q.tgt : abilityTarget(q.src, q.spec));
      }

      for (const u of units) {
        if (!u.alive || !alive(1 - u.side).length) continue;
        u.casting = u.castUntil > t;
        if (u.stunUntil > t || u.casting) continue;
        if (u.maxMana > 0 && u.mana >= u.maxMana && u.spec) { cast(u); continue; }

        if (!u.target || !targetable(u.target) || dist(u, u.target) > u.range) {
          u.target = nearest(u, enemiesOf(u).filter(targetable)) || null;
        }
        if (!u.target) continue;
        if (dist(u, u.target) <= u.range) {
          u.atkT += DT;
          const speed = Math.min(5, u.asBase * (1 + u.asBonus + (u.buffUntil > t ? u.buffAS : 0)));
          if (u.atkT >= 1 / speed) { u.atkT = 0; attack(u, u.target); }
        } else if (u.moveT <= t) {
          let best = pathStep(u, u.target);
          if (!best) {
            // alvo cercado: procura outro inimigo que dê para alcançar
            for (const e of enemiesOf(u).filter(x => x !== u.target && targetable(x)).sort((a, b) => dist(u, a) - dist(u, b))) {
              best = pathStep(u, e);
              if (best) { u.target = e; break; }
            }
          }
          if (best) {
            occ.delete(cellKey(u.c, u.r));
            u.c = best[0]; u.r = best[1];
            occ.set(cellKey(u.c, u.r), u.id);
            u.moveT = t + 0.45;
          }
        }
      }
      if (tick % 2 === 0) snapshot();
    }
    snapshot();

    const a0 = alive(0).length, a1 = alive(1).length;
    augHooks.forEach((hk, side) => { if (hk) hk.end.forEach(fn => fn(alive(side))); });
    const winner = a0 && !a1 ? 0 : a1 && !a0 ? 1 : -1;
    return {
      winner, survivors: winner === 0 ? a0 : winner === 1 ? a1 : 0, duration: t, goldDrops, frames, permGains, augGold,
      deaths: [units.filter(u => u.side === 0 && !u.alive).length, units.filter(u => u.side === 1 && !u.alive).length],
      meta: units.map(u => ({
        id: u.id, side: u.side, champ: u.champ || null, creep: u.creep || null, star: u.star, maxMana: u.maxMana, items: u.items, stats: u.start,
        stat: Object.fromEntries(Object.entries(u.stat).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      })),
    };
  }

  /* ---------- Bot ---------- */
  function botPlan(g, who) {
    const p = g.players[who];
    HOOK_G = g;
    if (g.mode === 'chaos') { p.ready = true; return; }
    settleChoices(g, p);
    const info = roundInfo(g.roundIdx, g.mode);
    const wantedLevel = Math.min(9, info.stage + 3);
    while (p.level < wantedLevel && p.gold >= RULES.xpCost + 6) { if (act(g, who, { a: 'xp' })) break; }
    const owned = () => new Set(allUnits(p).map(u => u.c));
    for (let round = 0; round < 3; round++) {
      p.shop.forEach((c, i) => {
        if (!c || p.gold < CH[c].cost) return;
        const has = owned().has(c);
        const fieldTraits = traitCounts(allUnits(p).map(u => u.c));
        const synergy = CH[c].traits.some(t => fieldTraits[t]);
        const wide = boardCount(p) + p.bench.filter(Boolean).length < p.level + 2;
        if (has || synergy || wide) act(g, who, { a: 'buy', slot: i });
      });
      if (info.stage >= 3 && p.gold >= 34) act(g, who, { a: 'reroll' }); else break;
    }
    // banco quase cheio: vende o que não é par
    if (p.bench.filter(Boolean).length >= 8) {
      const u = p.bench.filter(Boolean).sort((a, b) => a.star - b.star || CH[a.c].cost - CH[b.c].cost)[0];
      act(g, who, { a: 'sell', uid: u.uid });
    }
    // melhores unidades em campo; quem tem alcance curto vai à frente
    const score = u => u.star * 10 + CH[u.c].cost + u.items.length;
    const all = allUnits(p).sort((a, b) => score(b) - score(a));
    const field = all.slice(0, p.level);
    const rest = all.slice(p.level);
    p.board = {};
    p.bench = Array(RULES.benchSize).fill(null);
    rest.slice(0, RULES.benchSize).forEach((u, i) => { p.bench[i] = u; });
    const front = field.filter(u => CH[u.c].range <= 2);
    const back = field.filter(u => CH[u.c].range > 2);
    const place = (list, rows) => {
      const cols = [3, 0, 6, 1, 5, 2, 4];   // abre pelas pontas: a luta não fica presa no meio
      for (const u of list) {
        for (const y of rows) {
          const x = cols.find(col => !p.board[`${col},${y}`]);
          if (x != null) { p.board[`${x},${y}`] = u; break; }
        }
      }
    };
    place(front, [0, 1, 2, 3]);
    place(back, [3, 2, 1, 0]);
    // itens no carregador principal
    const carrier = () => field.slice().sort((a, b) => score(b) - score(a)).find(u => u.items.length < 3 || u.items.some(i => COMPONENTS.includes(i)));
    for (let i = p.items.length - 1; i >= 0; i--) {
      if (ITEMS[p.items[i]] && ITEMS[p.items[i]].special && !ITEMS[p.items[i]].emblem) continue;
      const c = carrier();
      if (c) act(g, who, { a: 'equip', item: i, uid: c.uid });
    }
    if (g.phase === 'plan') p.ready = true;
  }

  function botCarousel(g, who) {
    const p = g.players[who];
    const opts = p.carousel || [];
    if (opts.length && !p.picked) {
      const best = opts.indexOf(opts.slice().sort((a, b) => CH[b.c].cost - CH[a.c].cost)[0]);
      act(g, who, { a: 'pick', i: best });
    }
  }

  /* ---------- Estado enviado à tela ---------- */
  function publicState(g, viewer) {
    const info = g.roundIdx >= 0 ? roundInfo(g.roundIdx, g.mode) : null;
    const me = g.players[viewer];
    const chaos = g.mode === 'chaos' ? { score: g.score, won: !!g.chaosWon, roundName: CHAOS_ROUNDS[Math.max(0, g.roundIdx)].name, lives: me.hp } : null;
    const pair = g.pairs && me.alive ? g.pairs.find(x => x.a === viewer || x.b === viewer) : null;
    return {
      phase: g.phase, round: info, viewer, winner: g.winner, log: g.log.slice(-12), mode: g.mode || null, chaos,
      you: {
        name: me.name, hp: me.hp, gold: me.gold, level: me.level, xp: me.xp,
        xpNext: me.level >= RULES.maxLevel ? 0 : RULES.xpToLevel[me.level], streak: me.streak, ready: me.ready,
        lastResult: me.lastResult, picked: me.picked, traits: traitSummary(me), alive: me.alive, placement: me.placement,
        bench: me.bench, board: me.board, items: me.items, shop: me.shop, locked: me.locked, carousel: me.carousel, chrome: me.chrome,
        augments: me.augments, offer: me.offer, choices: me.choices, freeRerolls: me.freeRerolls,
      },
      // dos outros só vão as traits: tabuleiro, banco, itens e loja aparecem (as unidades) só no combate
      players: g.players.map((p, i) => ({
        i, name: p.name, hp: p.hp, level: p.level, gold: p.gold, streak: p.streak, ready: p.ready, picked: p.picked,
        alive: p.alive, left: p.left, placement: p.placement, traits: traitSummary(p),
      })),
      opponent: pair ? (pair.b == null ? { i: pair.ghost, ghost: true } : { i: pair.a === viewer ? pair.b : pair.a, ghost: false }) : null,
    };
  }

  /* Texto da habilidade para a dica do campeão */
  function abilityText(champName, star = 1) {
    const s = ABILITIES[champName];
    if (!s) return '';
    const v = arr => (arr ? arr[Math.min(star, arr.length) - 1] : 0);
    const parts = [];
    const typeName = { p: 'físico', m: 'mágico', t: 'verdadeiro' }[s.type || 'm'];
    const amount = [s.dmg ? `${v(s.dmg)} PH` : '', s.ad ? `${Math.round(s.ad * 100)}% DA` : ''].filter(Boolean).join(' + ');
    if (amount) {
      const who = { low: 'no inimigo mais ferido', far: 'no inimigo mais distante', rand: 'em inimigos aleatórios' }[s.target] || 'no alvo';
      parts.push(`Causa ${amount} de dano ${typeName} ${who}${s.dot ? ` ao longo de ${s.dot}s` : ''}`);
    }
    if (s.steps) {
      for (const st of s.steps) {
        const amt = [st.dmg ? `${v(st.dmg)} PH` : '', st.ad ? `${Math.round(v(st.ad) * 100)}% DA` : ''].filter(Boolean).join(' + ');
        const name = { p: 'físico', m: 'mágico', t: 'verdadeiro' }[st.type || 'm'];
        const where = {
          target: 'no alvo', nearest: `em ${st.n > 1 ? `${st.n} inimigos próximos` : 'no inimigo mais próximo'}`,
          area: `em área (raio ${st.radius || 1})`, line: 'em linha', cone: 'em cone', plus: 'em formato de +',
        }[st.shape];
        let text = amt ? `Causa ${amt} de dano ${name} ${where}` : '';
        if (st.pellets) text += ` (${st.pellets} projéteis)`;
        if (st.delay && st.delay >= 1) text = `Depois de ${st.delay}s: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
        if (st.stun) text += `, atordoa por ${v(st.stun)}s`;
        if (st.stunCenter) text += `, atordoa o inimigo do centro por ${v(st.stunCenter)}s`;
        if (st.reduce) text += `, ${Math.round(st.reduce * 100)}% menos a cada inimigo`;
        if (st.selfHeal) text += `, cura ${v(st.selfHeal)} de Vida`;
        if (text) parts.push(text);
      }
      if (s.durable) parts.push(`${Math.round(v(s.durable) * 100)}% de durabilidade por ${s.durableDur}s`);
    }
    if (s.volley) parts.push(`repete ${s.volley}x`);
    if (s.hits) parts.push(`atinge ${s.hits} inimigos`);
    if (s.splash) parts.push(`${v(s.splash)} de dano em volta (raio ${s.radius})`);
    if (s.splashAd) parts.push(`${Math.round(s.splashAd * 100)}% DA em volta`);
    if (s.stun) parts.push(`atordoa ${s.stunAoe ? 'em área ' : ''}por ${s.stun}s`);
    if (s.shield) parts.push(`escudo de ${v(s.shield)}${s.shieldHp ? ` + ${s.shieldHp * 100}% da Vida` : ''}`);
    if (s.heal) parts.push(`cura ${v(s.heal)}${s.healHp ? ` + ${Math.round(s.healHp * 100)}% da Vida` : ''}`);
    if (s.hpGain) parts.push(`+${v(s.hpGain)} de Vida máxima`);
    if (s.aura) parts.push(`aura de ${v(s.aura)} de dano por segundo`);
    if (s.buffAS) parts.push(`+${Math.round(s.buffAS * 100)}% de Vel. de Ataque por ${s.buffDur}s`);
    if (s.sunder) parts.push('reduz Armadura');
    if (s.shred) parts.push('reduz RM');
    if (s.wound) parts.push('fere');
    const txt = parts.join(', ');
    return txt ? `${txt.charAt(0).toUpperCase()}${txt.slice(1)}.` : '';
  }

  return {
    D, CH, CH_BY_NAME, TRAITS, ITEMS, COMPONENTS, RULES, CREEPS, TRAIT_TEXT, ITEM_TEXT, ABILITIES, GEO, AUG, AUG_FX, augImplemented, pickAugment, makeOffer, settleChoices,
    makeRng, roundInfo, buildSkins, applyCollection, createGame, createChaosGame, chaosTeam, CHAOS_ROUNDS, act, nextRound, endCarousel, startCombat, finishCombat, dropPlayer, viewFor, simulate,
    botPlan, botCarousel, publicState, abilityText, sellPrice, activeTier, stageDamage, previewUnit, previewBoard, traitCounts, traitTiers, REMOVER,
  };
})();
if (typeof module !== 'undefined') module.exports = TFTEngine;
