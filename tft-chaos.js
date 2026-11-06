/* ============================================================
   TFT-CHAOS.JS — rodadas do Modo Caos (Desafio da Horuja)
   ------------------------------------------------------------
   Base: as 30 rodadas oficiais da Cyber City (Tocker's Trials, Set 14).
   A Riot não publicou o Modo Caos, então estrelas extras, unidades a mais
   e prêmios ampliados são nossos, seguindo a descrição de quem jogou:
   lendária 3★ quase obrigatória, times de 4★ no fim, recompensas enormes.
   Atributos de campeões e itens continuam sendo os oficiais.

   Formato: [nome do campeão, estrelas, itens, quantidade].
   Unidades oficiais da Cyber City (15.14): Drone Mech, Tropa Mech (os "Lacaios"), Tibbers e
   T-43X (o "T-Rex" da Nitro). Itens fora do nosso jogo viram o equivalente mais próximo.
   ============================================================ */
const TFT_CHAOS_ROUNDS = [
  // Estágio 1: pega ritmo, já com pressão
  { name: 'Drones', units: [['Drone Mech', 1, [], 2]], reward: { gold: 4, unit: [2], comps: 2 } },
  { name: 'Mais Drones', units: [['Drone Mech', 1, [], 3]], reward: { gold: 3, unit: [3], comps: 2, dup: 'lesser' } },
  { name: 'Drones e Kog\'Maw', units: [['Drone Mech', 1, [], 4], ["Kog'Maw", 1, []]], reward: { gold: 10, unit: [3], comps: 2, reforger: 1 } },
  { name: 'Matilha', units: [['Nidalee', 1, ['Bloodthirster']], ['Kindred', 1, [], 3]], reward: { gold: 9, dup: 'lesser', comps: 1 } },
  { name: 'Chefe: Shaco', boss: true, units: [['Shaco', 3, ['InfinityEdge']], ['Shaco', 2, ['InfinityEdge'], 2]], reward: { gold: 18, anvil: 'item', comps: 2 } },
  { name: "Kog'Maw e Skarner", units: [["Kog'Maw", 2, ['Deathblade', 'RunaansHurricane']], ['Skarner', 2, [], 4]], reward: { gold: 11, comps: 1 } },
  { name: 'Divinicorp', units: [['Gragas', 2, ['WarmogsArmor']], ['Rhaast', 2, ['SteraksGage']], ['Morgana', 3, ['BlueBuff']]], reward: { gold: 11, comps: 1 } },
  { name: 'Dr. Mundo', units: [['Dr. Mundo', 3, ['RedBuff'], 2]], reward: { gold: 11, comps: 1 } },
  { name: 'Jhin e Jax', units: [['Jhin', 2, []], ['Jax', 3, ['BrambleVest', 'DragonsClaw'], 2]], reward: { gold: 11, comps: 1 } },
  { name: 'Chefe: Rengar', boss: true, units: [['Rengar', 3, ['InfinityEdge', 'Deathblade', 'UnstableConcoction']], ['Rengar', 2, ['Deathblade'], 2]], reward: { gold: 22, anvil: 'item', comps: 2, dup: 'full' } },
  // Estágio 2: já pede composição montada
  { name: 'Transgressores', units: [['Darius', 3, ['SpectralGauntlet']], ['Draven', 3, ['RedBuff', 'HextechGunblade', 'Deathblade']], ['Shaco', 2, [], 2]], reward: { gold: 14, comps: 1 } },
  { name: 'Veigar', units: [['Tropa Mech', 1, [], 5], ['Veigar', 3, ['Leviathan', 'ArchangelsStaff', 'BlueBuff']]], reward: { gold: 14, comps: 1 } },
  { name: 'Coroas', units: [['Mordekaiser', 3, ['Crownguard', 'Crownguard'], 3], ['Fiddlesticks', 2, ['Crownguard', 'Crownguard'], 2]], reward: { gold: 14, comps: 1 } },
  { name: 'Vi e Jinx', units: [['Vi', 3, ['SteraksGage'], 4], ['Jinx', 3, ['InfinityEdge', 'RedBuff', 'RunaansHurricane']]], reward: { gold: 14, comps: 1, reforger: 1 } },
  { name: "Chefe: Cho'Gath", boss: true, units: [["Cho'Gath", 3, ['WarmogsArmor', 'WarmogsArmor']], ["Cho'Gath", 3, ['WarmogsArmor', 'SteraksGage', 'ArchangelsStaff']], ['Vi', 2, [], 3]], reward: { gold: 30, reforger: 1, anvil: 'item', comps: 2, dup: 'full' } },
  { name: 'Braum e cartas', units: [['Braum', 3, ['WarmogsArmor', 'WarmogsArmor', 'GargoyleStoneplate']], ['Twisted Fate', 3, ['GuinsoosRageblade', 'GuinsoosRageblade'], 2], ['Darius', 3, [], 2]], reward: { gold: 16, comps: 1 } },
  { name: 'Zac', units: [['Zac', 3, ['FrozenHeart', 'FrozenHeart', 'Quicksilver'], 2], ['Vi', 3, [], 2]], reward: { gold: 16, comps: 1 } },
  { name: 'Shacos', units: [['Shaco', 3, [], 5], ['Shaco', 3, ['RapidFireCannon', 'RapidFireCannon', 'MadredsBloodrazor']]], reward: { gold: 16, comps: 1 } },
  { name: 'Varus', units: [['Varus', 3, ['SpearOfShojin', 'SpearOfShojin', 'RabadonsDeathcap']], ['Sejuani', 3, ['FrozenHeart', 'BrambleVest']], ['Jax', 3, []], ['Rengar', 3, ['Deathblade']]], reward: { gold: 40, dup: 'full', anvil: 'item' } },
  { name: 'Chefe: Divinicorp', boss: true, units: [['Morgana', 3, ['BlueBuff']], ['Senna', 3, ['Deathblade']], ['Gragas', 3, ['WarmogsArmor', 'IonicSpark']], ['Rhaast', 3, ['SteraksGage', 'SpectralGauntlet']], ['Vex', 3, ['RabadonsDeathcap', 'BlueBuff']], ['Annie', 2, []]], reward: { gold: 40, reforger: 1, anvil: 'item', dup: 'full', comps: 2 } },
  // Estágio 3: fim brutal
  { name: 'Zeris', units: [['Zeri', 3, ['StatikkShiv', 'StatikkShiv', 'StatikkShiv'], 5], ['Vi', 3, ['SteraksGage'], 3]], reward: { gold: 22, anvil: 'item' } },
  { name: 'Tibbers', units: [['Tibbers', 4, ['GargoyleStoneplate', 'NightHarvester', 'WarmogsArmor']], ['Tibbers', 3, [], 2], ['Annie', 3, ['SpearOfShojin', 'SpearOfShojin', 'SpearOfShojin'], 4]], reward: { gold: 22, anvil: 'item' } },
  { name: 'Zeds', units: [['Zed', 3, ['UnstableConcoction', 'UnstableConcoction', 'UnstableConcoction'], 6], ['Galio', 3, ['WarmogsArmor']]], reward: { gold: 22, anvil: 'item' } },
  { name: 'Elite', units: [['Brand', 3, ['SpearOfShojin', 'JeweledGauntlet']], ['Jinx', 3, ['StatikkShiv', 'LastWhisper']], ['Samira', 3, ['InfinityEdge', 'SpearOfShojin']], ['Neeko', 3, ['WarmogsArmor', 'FrozenHeart']], ['Ekko', 3, ['WarmogsArmor', 'FrozenHeart']], ['Leona', 3, ['GargoyleStoneplate']]], reward: { gold: 26, anvil: 'item', reforger: 1 } },
  { name: 'Chefe: Garen', boss: true, units: [['Garen', 3, ['GargoyleStoneplate', 'GargoyleStoneplate', 'TitansResolve']], ['Darius', 3, ['SteraksGage'], 2], ['Miss Fortune', 3, ['InfinityEdge', 'SpearOfShojin'], 2], ['Braum', 3, ['WarmogsArmor']]], reward: { gold: 50, dup: 'full', reforger: 1, anvil: 'item', comps: 2 } },
  // Últimos 5 níveis: extremamente difíceis; 4★ aparecem de verdade
  { name: 'Transgressores de elite', units: [['Twisted Fate', 4, ['ArchangelsStaff', 'JeweledGauntlet', 'GuinsoosRageblade'], 2], ['Miss Fortune', 4, ['SpearOfShojin', 'SpearOfShojin'], 2], ['Darius', 3, ['IonicSpark', 'SpectralGauntlet'], 2], ['Braum', 4, ['GargoyleStoneplate', 'WarmogsArmor']]], reward: { gold: 30, item: ['ThiefsGloves'], anvil: 'item', dup: 'full' } },
  { name: 'T-Rex', units: [['T-43X', 4, [], 3], ['Sejuani', 4, ['WarmogsArmor', 'GargoyleStoneplate']], ['Zeri', 4, ['StatikkShiv', 'GuinsoosRageblade', 'InfinityEdge']]], reward: { gold: 60, dup: 'full', anvil: 'item' } },
  { name: 'Urgots', units: [['Urgot', 2, ['MadredsBloodrazor', 'Deathblade', 'UnstableConcoction'], 7], ["Cho'Gath", 3, ['WarmogsArmor', 'SteraksGage', 'ArchangelsStaff'], 2]], reward: { gold: 80, anvil: 'item', dup: 'full', reforger: 1 } },
  { name: 'Guardiões', units: [['Xayah', 4, ['Deathblade', 'GuinsoosRageblade', 'InfinityEdge']], ['Aphelios', 4, ['Deathblade', 'GuinsoosRageblade', 'InfinityEdge']], ['Leona', 4, ['Redemption', 'Redemption'], 3], ['Jarvan IV', 4, ['Redemption', 'Redemption'], 3], ['Jhin', 4, ['InfinityEdge', 'Deathblade', 'GuinsoosRageblade']]], reward: { gold: 70, anvil: 'item', reforger: 1 } },
  { name: 'Chefe final: Esmeralda', boss: true, final: true, units: [['Morgana', 4, ['BlueBuff', 'RabadonsDeathcap', 'JeweledGauntlet']], ['Kobuko', 4, ['Bloodthirster', 'WarmogsArmor', 'GargoyleStoneplate']], ['Ziggs', 4, ['SpearOfShojin', 'RabadonsDeathcap']], ['Veigar', 4, ['Leviathan', 'ArchangelsStaff']], ['Poppy', 4, ['WarmogsArmor', 'FrozenHeart']], ['Aurora', 4, ['RabadonsDeathcap', 'SpearOfShojin']], ['Viego', 4, ['Bloodthirster', 'InfinityEdge']], ['Garen', 4, ['GargoyleStoneplate', 'TitansResolve']], ['Zed', 4, ['InfinityEdge', 'Deathblade']]], reward: { gold: 0 } },
];
if (typeof module !== 'undefined') module.exports = TFT_CHAOS_ROUNDS;
