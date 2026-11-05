/* ============================================================
   TFT-AUGMENTS.JS — efeitos dos aumentos do Mudae TFT
   ------------------------------------------------------------
   Os números vêm de tft-augments-data.js (CommunityDragon); aqui fica
   só o que cada aumento faz. Ganchos de cada entrada:
     now(p, f)        ao escolher           round(p, f)   início de rodada
     stage(p, f)      início de estágio     after(p, f, r) fim de combate
     level(p, f, n)   ao subir de nível     combat(c, f)  início de combate
     mods(m, f)       ajustes fixos do jogador (juros, custo de EXP, etc.)
   `f` são os valores oficiais do aumento. Aumento sem entrada aqui fica
   fora das ofertas: nunca inventar efeito para preencher a lista.
   ============================================================ */
const TFT_AUG_IMPL = (() => {
  'use strict';

  const I = {};
  const def = (id, impl) => { I[id] = impl; };
  const same = (ids, impl) => ids.forEach(id => def(id, impl));

  // Atalhos de atributo por unidade em combate.
  const hp = (u, n) => { u.maxHp += n; };
  const hpPct = (u, n) => { u.maxHp *= 1 + n; };
  const adp = (u, n) => { u.adPct = (u.adPct || 0) + n; };
  const as = (u, n) => { u.asBonus += n; };
  const res = (u, n) => { u.armor += n; u.mr += n; };
  const row = {
    back2: u => u.ly >= 2, backRow: u => u.ly === 3,
    front1: u => u.ly === 0, front2: u => u.ly <= 1,
  };
  const items = u => (u.itemIds || []).filter(i => !String(i).startsWith('Emblem_'));
  const uniqueItems = c => new Set(c.units.flatMap(u => items(u))).size;

  /* ---------- Só concedem coisas: ouro, EXP, itens, campeões ---------- */
  const goldOnly = key => ({ now(p, f) { p.gold(f[key]); } });
  same(['TFT_Augment_Placebo', 'TFT_Augment_PlaceboPlus'], {
    now(p, f) { p.gold(f.Gold); },
    combat(c, f) { c.units.forEach(u => as(u, f.AttackSpeed)); },
  });
  def('TFT9_Augment_YoungAndWildAndFree', goldOnly('Gold'));
  def('TFT9_Augment_SilverSpoon', { now(p, f) { p.xp(f.Experience); } });
  def('TFT9_Augment_Commander_RollingForDays', { now(p, f) { p.rerolls(f.Numrolls); } });
  def('TFT9_Augment_Commander_TeamingUp1', { now(p, f) { p.comps(f.NumComponents); for (let i = 0; i < f.NumChamps; i++) p.unit(3); } });
  def('TFT9_Augment_BigGrabBag', { now(p, f) { p.comps(f.NumItems); p.gold(f.Gold); p.reforger(f.NumReforgers); } });
  def('TFT9_Augment_IronAssets', { now(p, f) { p.anvil('comp'); p.gold(f.Gold); } });
  def('TFT9_Augment_OneTwosThree', { now(p, f) { for (let i = 0; i < f.tier1champs; i++) p.unit(1); p.unit(2); p.unit(3); } });
  def('TFT9_Augment_MissedConnections', { now(p) { p.allOfCost(1); } });
  def('TFT6_Augment_OneTwoFive', { now(p, f) { p.comps(f.NumComponents); p.gold(f.Gold); p.unit(5); } });
  def('TFT6_Augment_ItemGrabBag1', { now(p, f) { for (let i = 0; i < f.NumItems; i++) p.fullItem(); } });
  def('TFT7_Augment_BandOfThieves1', { now(p, f) { for (let i = 0; i < f.NumGloves; i++) p.item('ThiefsGloves'); } });
  def('TFT_Augment_DuoQueue', { now(p, f) { for (let i = 0; i < f.NumUnits; i++) p.unit(5); p.compsSame(f.NumComponents); } });
  def('TFT_Augment_TwoTrick', { now(p) { p.unit(2, 2); p.unit(1, 2); p.unit(1, 2); } });
  def('TFT_Augment_HeroicGrabBagPlus', { now(p, f) { p.dup('lesser', f.LesserDuplicatorAmount); p.gold(f.Gold); } });
  def('TFT_Augment_HeroicGrabBagPlusPlus', { now(p, f) { p.dup('lesser', f.LesserDuplicatorAmount); p.gold(f.Gold); } });
  def('TFT10_Augment_HeroicGrabBag', { now(p, f) { p.dup('lesser', f.LesserDuplicatorAmount); p.gold(f.Gold); } });
  def('TFT_Augment_UnlimitedPower', { now(p) { p.item('Leviathan'); p.item('JeweledGauntlet'); p.item('NeedlesslyLargeRod'); p.removers(1); } });
  def('TFT_Augment_OneBuffTwoBuff', { now(p) { p.item('RedBuff'); p.item('BlueBuff'); p.dup('full', 1); } });
  def('TFT_Augment_BranchingOut', { now(p) { p.emblem(); } });
  def('TFT_Augment_BranchingOutPlus', { now(p, f) { p.emblem(); p.reforger(f.NumReforgers); } });
  def('TFT_Augment_SpreadingRoots', { now(p, f) { p.gold(f.Gold); for (let i = 0; i < f.NumOfEmblems; i++) p.emblem(); } });
  def('TFT_Augment_TraitTree', { now(p, f) { p.gold(f.Gold); p.reforger(f.NumReforgers); for (let i = 0; i < f.NumOfEmblems; i++) p.emblem(); } });
  def('TFT_Augment_PocketRecombobulator', { now(p, f) { p.reforger(f.NumReforgers); for (let i = 0; i < f.NumRecombobulator; i++) p.recombobulator(); } });
  def('TFT_Augment_ExclusiveCustomization', { now(p, f) { p.gold(f.Gold); p.anvil('item'); p.removers(f.NumRemovers); } });
  def('TFT_Augment_Buildabud_placeholder', null);
  def('TFT11_Augment_Buildabud', { now(p, f) { p.unit(1, 3); p.gold(f.Gold); } });
  def('TFT9_Augment_ArmyBuilding', {
    now(p) { p.dup('lesser', 1); },
    after(p, f, r) { if (r.pvp && p.count('n', 1) === f.PlayerCombatNum) p.dup('lesser', 1); },
  });
  def('TFT11_Augment_AtWhatCost', { now(p, f) { p.setLevel(f.Level); p.xp(f.XP); p.state().noMoreAugments = true; }, mods(m) { m.noAugments = true; } });

  /* ---------- Destino: outro aumento na hora ---------- */
  const destiny = tier => ({ now(p, f) { p.gold(f.Gold); p.randomAugment(tier); } });
  same(['TFT_Augment_SilverDestiny', 'TFT_Augment_SilverDestinyPlus', 'TFT_Augment_SilverDestinyPlusPlus'], destiny(1));
  same(['TFT_Augment_GoldDestiny', 'TFT_Augment_GoldDestinyPlus'], destiny(2));
  def('TFT_Augment_PrismaticDestiny', destiny(3));
  def('TFT_Augment_PowerUp', { now(p) { p.state().tierUp = true; }, mods(m) { m.nextAugmentTierUp = true; } });

  /* ---------- Economia ---------- */
  def('TFT11_Augment_RainingGold', { now(p, f) { p.gold(f.InstantGold); }, round(p, f) { p.gold(f.RoundGold); } });
  def('TFT11_Augment_RainingGoldPlus', { now(p, f) { p.gold(f.InstantGold); }, round(p, f) { p.gold(f.RoundGold); } });
  def('TFT9_Augment_HedgeFund', { now(p, f) { p.gold(f.Gold); }, mods(m, f) { m.interestCap = f.InterestCap; } });
  def('TFT6_Augment_HyperRoll', { now(p, f) { p.gold(f.InitialGold); }, round(p, f, info) { if (info.type === 'pvp') p.gold(f.Gold); }, mods(m) { m.interestCap = 0; } });
  def('TFT10_Augment_GoingLong', { now(p, f) { p.gold(f.Gold); }, round(p, f) { p.xp(f.XP); }, mods(m) { m.interestCap = 0; } });
  def('TFT_Augment_InvestmentStrategy1', {
    round(p, f) { p.permAll({ hp: f.HealthPerInterest * p.lastInterest() }); },
  });
  def('TFT_Augment_InvestmentStrategy2', {
    now(p, f) { p.gold(f.Gold); },
    round(p, f) { p.permAll({ hp: f.HealthPerInterest * p.lastInterest() }); },
    mods(m, f) { m.interestCap = f.MaxInterest; },
  });
  def('TFT6_Augment_TradeSector', { now(p, f) { p.gold(f.Gold); p.rerolls(f.RerollsNow); }, round(p, f) { p.rerolls(f.RerollCount); } });
  def('TFT_Augment_CalledShot', { now(p, f) { p.gold(f.Gold); p.setStreak(f.Streak); } });
  def('TFT6_Augment_CalculatedLoss', { after(p, f, r) { if (r.lost) { p.gold(f.Gold); p.rerolls(1); } } });
  def('TFT6_Augment_GachaAddict', { mods(m, f) { m.rerollRefund = f.RerollPercent / 100; } });
  def('TFT6_Augment_ThriftShop', { now(p, f) { p.gold(f.Gold); }, mods(m, f) { m.noBuyXp = true; m.xpOnGoldReroll = f.XP; } });
  def('TFT6_Augment_MaxLevel10', { now(p, f) { p.xp(f.InitialXP); }, mods(m, f) { m.xpBuyBonus = f.XP; } });
  def('TFT_Augment_UpwardMobility', { level(p, f) { p.healPlayer(f.Health); p.rerolls(f.Rerolls); }, mods(m) { m.xpCostDelta = -1; } });
  def('TFT9_Augment_HighEndSector', { now(p, f) { p.gold(f.Gold); }, level(p, f, n) { p.rerolls(n + f.BonusRollPerLevel); } });
  def('TFT_Augment_EpicRolldown', { level(p, f, n) { if (n === 8 && !p.state().done) { p.state().done = true; p.rerolls(f.NumRerolls); } } });
  def('TFT7_Augment_LategameSpecialist', { level(p, f, n) { if (n === f.LevelReq && !p.state().done) { p.state().done = true; p.gold(f.Gold); } } });
  def('TFT7_Augment_BirthdayPresents', { level(p, f, n) { p.gold(f.Gold); p.unit(Math.max(1, Math.min(5, n - 4)), 2); } });
  def('TFT_Augment_BirthdayReunion', {
    now(p, f) { p.gold(f.Gold); },
    level(p, f, n) {
      if (n === f.InitialLevelBreakpoint) p.unit(2, 2);
      if (n === f.FirstLevelBreakpoint) p.item('ThiefsGloves');
      if (n === f.SecondLevelBreakpoint) p.unit(5, 2);
    },
  });
  same(['TFT9_Augment_BardPlaybook2', 'TFT9_Augment_Legend_BardPlaybook2'], {
    level(p, f, n) { if ([f.levelreqa, f.levelreqb, f.levelreqc, f.levelreqd].includes(n)) p.anvil('comp'); },
  });
  def('TFT9_Augment_BardPlaybook1', {
    now(p) { p.state().c = p.unit(2); },
    level(p) { const c = p.state().c; if (c) p.champ(c); },
  });
  def('TFT_Augment_ExplosiveGrowth', { now(p, f) { p.xp(f.XP); p.state().left = f.rounds; }, round(p, f) { const s = p.state(); if (s.left > 0) { s.left--; p.xp(f.XP); } } });
  def('TFT_Augment_ExplosiveGrowthPlus', I.TFT_Augment_ExplosiveGrowth);
  def('TFT11_Augment_Epoch', { now(p, f) { p.xp(f.XP); p.rerolls(f.Rerolls); }, stage(p, f) { p.xp(f.XP); p.rerolls(f.Rerolls); } });
  def('TFT11_Augment_EpochPlus', I.TFT11_Augment_Epoch);
  def('TFT_Augment_LateGameScaling', {
    round(p, f, info) { if (info.type === 'pvp') p.xp(f.XPGain); },
    combat(c, f) { c.units.filter(u => u.cost === 5).forEach(u => { hpPct(u, f.BonusHealth); as(u, f.AttackSpeed); }); },
  });
  def('TFT_Augment_PatienceIsAVirtue', {
    now(p, f) { p.rerolls(f.InitialRerolls); },
    round(p, f) { if (p.boughtLastRound() === 0) p.rerolls(f.FreeRerolls); },
  });
  def('TFT_Augment_CraftedCrafting', { crafted(p, f) { p.rerolls(f.Rerolls); } });
  def('TFT_Augment_AnotherOne', { now(p, f) { p.gold(f.Gold); p.state().left = f.NumItems; }, crafted(p, f, id) { const s = p.state(); if (s.left > 0) { s.left--; p.item(id); } } });
  def('TFT_Augment_AnotherOnePlus', { now(p, f) { p.anvil('comp'); p.state().left = f.NumItems; }, crafted: I.TFT_Augment_AnotherOne.crafted });
  def('TFT7_Augment_ThinkFast', { now(p, f) { p.gold(f.Gold); p.state().untilRound = p.roundIdx(); }, mods(m, f, s, g) { if (s.untilRound === g.roundIdx) m.freeShop = true; } });
  def('TFT_Augment_RiggedShopPlus', {
    now(p, f) { p.rerolls(f.Rerolls); p.state().n = 0; p.shopOfCost(3); },
    round(p, f) { const s = p.state(); s.n = (s.n || 0) + 1; if (s.n % f.Numrolls === 0) p.shopOfCost(3); },
  });
  def('TFT_Augment_MaxBuild', { now(p, f) { p.dup('full', 1); p.gold(f.Gold); p.shopOfCost(4); } });
  def('TFT6_Augment_HighEndShopping', { now(p, f) { p.gold(f.Gold); }, mods(m) { m.shopLevelDelta = 1; } });
  def('TFT_Augment_StarryNight', { now(p, f) { p.gold(f.Gold); }, mods(m) { m.starryShop = true; } });
  def('TFT_Augment_StarryNightPlus', I.TFT_Augment_StarryNight);
  def('TFT9_Augment_StarsAreBorn', { now(p, f) { p.gold(f.Gold); p.state().costs = [1, 2]; }, bought(p, f, id, cost) { const s = p.state(); const i = (s.costs || []).indexOf(cost); if (i >= 0) { s.costs.splice(i, 1); p.upgradeBought(id); } } });
  def('TFT11_Augment_Reinfourcement', { now(p, f) { p.gold(f.Gold); p.state().costs = [4]; }, bought: I.TFT9_Augment_StarsAreBorn.bought });
  def('TFT_Augment_FiresalePlus', { now(p, f) { p.gold(f.Gold); }, round(p, f) { p.stealFromShop(f.CostLimit); } });
  def('TFT_Augment_InvestedPlus', {
    now(p, f) { p.gold(f.Gold); },
    after(p, f) { const over = Math.min(p.goldNow(), f.MaxGold) - f.GoldThreshold; if (over > 0) p.rerolls(Math.floor(over / f.GoldPerReroll)); },
  });
  def('TFT_Augment_InvestedPlusPlus', I.TFT_Augment_InvestedPlus);
  def('TFT_Augment_WorthTheWaitGold', { now(p, f) { const s = p.state(); s.c = p.unit(f.UnitTier); }, round(p) { const c = p.state().c; if (c) p.champ(c); } });
  def('TFT_Augment_WorthTheWaitPrismatic', { now(p, f) { const s = p.state(); s.c = p.unit(f.UnitTier); if (s.c) p.champ(s.c); }, round: I.TFT_Augment_WorthTheWaitGold.round });
  def('TFT_Augment_SliceOfLife', { stage(p, f, info) { const cost = Math.min(5, info.stage); if (!p.state().done) { for (let i = 0; i < 2; i++) p.unit(cost); if (cost === 5) p.state().done = true; } } });
  def('TFT_Augment_HardCommit', {
    now(p, f) { const s = p.state(); s.t = p.emblem(); p.gold(f.GoldPerStage); p.unitOfTrait(s.t, Math.min(5, p.stageNow())); },
    stage(p, f, info) { p.gold(f.GoldPerStage); p.unitOfTrait(p.state().t, Math.min(5, info.stage)); },
  });
  def('TFT_Augment_Flexible', {
    now(p, f) { for (let i = 0; i < f.StartingEmblems; i++) p.emblem(); },
    stage(p) { p.emblem(); },
    combat(c, f) { const n = c.units.reduce((t, u) => t + (u.itemIds || []).filter(i => String(i).startsWith('Emblem_')).length, 0); c.units.forEach(u => hp(u, f.HPPerEmblem * n)); },
  });
  def('TFT_Augment_HomeCooking', {
    now(p, f) { p.state().left = f.NumStages; p.gold(f.Gold); p.comps(f.component); p.healPlayer(f.Health); },
    stage(p, f) { const s = p.state(); if (s.left > 0) { s.left--; p.gold(f.Gold); p.comps(f.component); p.healPlayer(f.Health); } },
  });
  def('TFT_Augment_Replication', null);
  def('TFT9_Augment_BuildingACollectionPlusPlus', {
    now(p, f) { p.comps(f.UpfrontItems); p.state().left = f.roundsofbonusitems; },
    round(p) { const s = p.state(); if (s.left > 0) { s.left--; p.comps(1); } },
  });
  def('TFT9_Augment_CustomerIsAlwaysRight', { now(p) { p.comps(1); }, mods(m) { m.compsToAnvil = true; } });
  def('TFT11_Augment_Prizefighter', {
    now(p, f) { p.comps(f.component); },
    after(p, f, r) { if (r.won && p.count('w', 1) % f.WinsNeeded === 0) p.comps(1); },
  });
  def('TFT11_Augment_Slammin', { now(p, f) { p.gold(f.Gold); }, after(p, f, r) { if (r.pvp && p.noBenchItems()) p.xp(f.XP); } });
  def('TFT11_Augment_Slammin_Plus', { now(p, f) { p.gold(f.Gold); p.xp(f.XPNow); }, after: I.TFT11_Augment_Slammin.after });
  def('TFT9_Augment_LearningFromExperience2', { after(p, f, r) { if (r.pvp) p.xp(r.won ? f.winxp : f.lossxp); } });
  def('TFT6_Augment_ClearMind', { after(p, f, r) { if (r.pvp && p.benchEmpty()) p.xp(f.XP); } });
  def('TFT7_Augment_ClutteredMind', { now(p, f) { for (let i = 0; i < f.Units; i++) p.unit(1); }, after(p, f, r) { if (r.pvp && p.benchFull()) p.xp(f.XP); } });
  def('TFT_Augment_Dominance3', { now(p, f) { p.xp(f.Experience); }, after(p, f, r) { if (r.pvp && r.won) p.gold(Math.floor(r.survivors / f.PerSurvivingUnit) * f.Gold); } });
  def('TFT_Augment_AimForTheTop', { after(p, f, r) { if (!r.pvp) return; if (r.lost) p.xp(f.XP); if (r.won) { const w = p.count('w', 1); if (w === 1 || (w - 1) % f.WinsPerComponent === 0) p.comps(1); } } });
  def('TFT9_Augment_RiskyMoves', { now(p, f) { p.damagePlayer(f.Health); }, after(p, f, r) { if (r.pvp && p.count('n', 1) === f.PlayerCombatNum) p.gold(f.Gold); } });
  def('TFT_Augment_ForwardThinking', {
    now(p, f) { const s = p.state(); s.bank = p.goldNow() + f.BaseGold; p.gold(-p.goldNow()); s.n = 0; },
    after(p, f, r) { const s = p.state(); if (r.pvp && s.bank != null && ++s.n === f.rounds) { p.gold(s.bank); s.bank = null; } },
  });
  def('TFT_Augment_Survivor', { now(p, f) { p.gold(f.InitialGold); }, round(p, f) { const s = p.state(); if (!s.done && p.playersOut() >= f.PlayersDead) { s.done = true; p.gold(f.Gold); } } });
  def('TFT_Augment_SpeedyDoubleKill', { now(p) { p.item('GuinsoosRageblade'); }, round(p, f) { const s = p.state(); if (!s.done && p.playersOut() >= 2) { s.done = true; p.gold(f.GoldAmount); } } });
  def('TFT_Augment_GoldenQuest', { round(p, f) { const s = p.state(); if (!s.done && p.goldNow() >= f.goldrequired) { s.done = true; p.unit(5, 2); p.fullItem(); p.fullItem(); } } });
  def('TFT_Augment_TitanicTitan', { now(p, f) { p.healPlayer(f.Heal, true); } });
  def('TFT9_Augment_TiniestTitanPlus', { now(p, f) { p.gold(f.InitialGold); }, after(p, f, r) { if (r.pvp) { p.healPlayer(f.Heal); p.gold(f.Gold); } } });
  def('TFT7_Augment_SacrificialPact', { now(p, f) { p.gold(f.Gold); }, round(p, f, info) { if (info.type === 'pvp') p.healPlayer(f.Heal); }, mods(m, f) { m.xpWithHealth = f.HealthCost; } });
  def('TFT_Augment_NineLives', { now(p, f) { p.setPlayerHp(f.NumberOfLives); }, mods(m, f) { m.lossDamage = f.HealthLoss; m.noPlayerHeal = true; } });
  def('TFT9_Augment_FinalReserves', { mods(m, f) { m.finalReserves = f; } });
  def('TFT7_Augment_AFK', { now(p, f) { p.state().left = f.RoundsToSkip; p.lockActions(f.RoundsToSkip); }, round(p, f) { const s = p.state(); if (s.left > 0 && --s.left === 0) p.gold(f.Gold); } });
  def('TFT_Augment_TimeSkip', { now(p, f) { p.state().left = f.PenaltyTurns; p.disableShop(f.PenaltyTurns); }, round(p, f) { const s = p.state(); if (s.left > 0 && --s.left === 0) p.xp(f.Experience); } });
  def('TFT_Augment_QuietQuitting', { now(p, f) { p.state().left = f.NumRounds; p.disableShop(f.NumRounds); }, after(p, f, r) { const s = p.state(); if (r.pvp && s.left > 0 && --s.left === 0) { p.gold(f.Gold); p.anvil('item'); } } });
  def('TFT_Augment_HeadStart', { now(p, f) { p.sellAll(); for (let i = 0; i < f.NumUnits; i++) p.unit(f.Tier, 2); p.disableShop(f.RoundsToSkip); } });
  def('TFT_Augment_RestartMission', { now(p) { p.removeAll(); p.unit(3, 2); p.unit(3, 2); p.unit(2, 2); p.unit(2, 2); p.unit(1, 2); } });
  def('TFT6_Augment_Recombobulator', { now(p, f) { p.recombobulateBoard(); p.removers(f.NumRemovers); p.rerolls(f.FreeRerolls); } });
  def('TFT7_Augment_PandorasBench', { now(p, f) { p.gold(f.Gold); }, round(p, f) { p.pandoraBench(f.BenchSlots); } });
  same(['TFT6_Augment_PandorasItems', 'TFT9_Augment_PandorasItems2', 'TFT9_Augment_Legend_PandorasItems2'], { now(p, f) { p.comps(f.NumComponents); }, round(p) { p.pandoraItems(); } });
  same(['TFT6_Augment_SalvageBin', 'TFT6_Augment_SalvageBinHR', 'TFT8_Augment_SalvageBinPlus'], {
    now(p) { p.fullItem(); },
    after(p, f, r) { if (r.pvp && p.count('n', 1) === f.NumRounds) p.comps(1); },
    mods(m) { m.salvageOnSell = true; },
  });
  def('TFT_Augment_EyeForAnEye', { after(p, f, r) { const s = p.state(); s.d = (s.d || 0) + r.allyDeaths; while (s.d >= f.AllyDeaths && (s.g || 0) < f.NumComponents) { s.d -= f.AllyDeaths; s.g = (s.g || 0) + 1; p.comps(1); } } });
  def('TFT_Augment_EyeForAnEyePlus', { now(p) { p.comps(1); }, after: I.TFT_Augment_EyeForAnEye.after });
  def('TFT7_Augment_CursedCrown', { combat(c, f) { c.units.forEach(u => { u.dura += f.DurabilityBonus; }); }, mods(m, f) { m.teamBonus = (m.teamBonus || 0) + f.MaxArmySizeIncrease; m.playerDamageMul = 1 + f.PlayerCombatDamageIncrease / 100; } });
  same(['TFT9_Augment_OneHundredDuckSizedHorses', 'TFT9_Augment_OneHundredDuckSizedHorsesPlus'], {
    now(p, f) { p.gold(f.Gold); },
    combat(c, f) { c.units.forEach(u => hpPct(u, -f.HealthReduction)); },
    mods(m, f) { m.teamBonus = (m.teamBonus || 0) + f.TeamSize; m.maxItems = 1; },
  });
  def('TFT_Augment_Trifecta1', { now(p, f) { for (let i = 0; i < f.NumUnits; i++) p.unit(f.Tier); }, combat(c, f) { c.sample(c.units.filter(u => u.cost === 3), f.BuffedNumber).forEach(u => { hp(u, f.Health); as(u, f.AttackSpeed); }); } });
  def('TFT_Augment_Trifecta2', { now(p, f) { for (let i = 0; i < f.NumUnits; i++) p.unit(f.Tier); }, combat(c, f) { c.units.forEach(u => as(u, f.TeamAttackSpeed)); c.sample(c.units.filter(u => u.cost === 3), f.BuffedNumber).forEach(u => { hp(u, f.Health); as(u, f.AttackSpeed); }); } });
  def('TFT_Augment_AuraFarming', null);
  def('TFT_Augment_ChaosEvolution', { starUp(p, f) { p.randomPerm(f, [{ hp: f.Health }, { dura: f.Durability }, { ap: f.AP }, { ad: f.AD }, { as: f.AttackSpeed }]); } });
  def('TFT14_Augment_BlackMarketUnstableEvolution', { starUp(p, f) { p.randomPerm(f, [{ hp: f.BonusHP }, { as: f.BonusAS / 100 }, { ad: f.BonusAD / 100 }, { ap: f.BonusAP }]); } });
  def('TFT14_Augment_LifeLongLearningBlackMarket', {
    round(p, f) { p.permAll({ hpPct: f.BaselineHP }); },
    combat(c, f) { c.onEnd(survivors => survivors.forEach(u => c.perm(u, { ap: f.BonusAP, ad: f.BonusAD }))); },
  });

  /* ---------- Itens simples + bônus de item ---------- */
  const itemBonus = (id, grant, bonus) => ({
    now(p) { grant.forEach(i => p.item(i)); },
    combat(c, f) { c.units.forEach(u => { const n = (u.itemIds || []).filter(x => x === id).length; if (n) bonus(u, f, n, c); }); },
  });
  def('TFT_Augment_BeltOverflow', { now(p, f) { for (let i = 0; i < f.NumItems; i++) p.item('GiantsBelt'); }, combat(c, f) { c.units.forEach(u => hp(u, f.BonusHealth * (u.itemIds || []).filter(x => x === 'GiantsBelt').length)); } });
  def('TFT_Augment_SwordOverflow', { now(p, f) { for (let i = 0; i < f.NumItems; i++) p.item('BFSword'); }, combat(c, f) { c.units.forEach(u => as(u, f.BonusStat * (u.itemIds || []).filter(x => x === 'BFSword').length)); } });
  def('TFT_Augment_WandOverflow', { now(p, f) { for (let i = 0; i < f.NumItems; i++) p.item('NeedlesslyLargeRod'); }, combat(c, f) { c.units.forEach(u => as(u, f.BonusStat * (u.itemIds || []).filter(x => x === 'NeedlesslyLargeRod').length)); } });
  def('TFT_Augment_CrownguardSpirit', { now(p) { p.item('NeedlesslyLargeRod'); p.item('ChainVest'); }, combat(c, f) { c.units.forEach(u => { u.ap += f.AP; u.armor += f.Armor; }); } });
  def('TFT_Augment_GuardbreakerSpirit', { now(p) { p.item('SparringGloves'); }, combat(c, f) { c.units.forEach(u => { u.crit += f.CritChance; }); } });
  def('TFT_Augment_ShojinSpirit', { now(p) { p.item('BFSword'); p.item('TearOfTheGoddess'); }, combat(c, f) { c.units.forEach(u => { adp(u, f.AD); u.mana += f.Mana; }); } });
  def('TFT_Augment_CryMeARiver', { now(p) { p.item('TearOfTheGoddess'); }, combat(c, f) { c.units.forEach(u => { u.manaRegen += f.RegenBonus; }); c.after(f.DelayTime, () => c.units.forEach(u => { u.manaRegen += f.UpgradedRegenBonus - f.RegenBonus; })); } });
  def('TFT_Augment_Pyromaniac', { now(p) { p.item('RedBuff'); }, mods(m, f) { m.burnBonus = f.BurnIncrease; } });
  def('TFT14_Augment_BlackMarketBlueBattery', { now(p) { p.item('BlueBuff'); }, combat(c, f) { c.units.forEach(u => { u.ap += f.BonusAP; }); c.onCast(u => { u.mana += f.ManaRestore; }); } });
  def('TFT7_Augment_BigFriend', { now(p) { p.item('GiantsBelt'); }, combat(c, f) { const big = c.units.filter(u => u.maxHp > f.RequiredHealth); c.units.forEach(u => { if (big.some(b => b !== u && c.dist(b, u) <= 1)) u.dura += f.DamageReductionPercent / 100; }); } });
  def('TFT7_Augment_BigFriend2', I.TFT7_Augment_BigFriend);
  same(['TFT6_Augment_CyberneticImplants3'], { now(p) { p.item('BFSword'); }, combat(c, f) { c.units.filter(u => items(u).length).forEach(u => { hp(u, f.HP); adp(u, f.AD); }); } });
  same(['TFT6_Augment_CyberneticUplink2', 'TFT6_Augment_CyberneticUplink3'], { now(p) { p.item('TearOfTheGoddess'); }, combat(c, f) { c.units.filter(u => items(u).length).forEach(u => { hp(u, f.Health); u.manaRegen += f.ManaRegen; }); } });
  def('TFT9_Augment_CyberneticBulk3', { combat(c, f) { c.units.filter(u => items(u).length).forEach(u => hp(u, f.Health)); } });

  /* ---------- Combate: atributos de equipe ---------- */
  def('TFT_Augment_GiantAndMighty', { combat(c, f) { c.units.forEach(u => { hp(u, f.FlatHealth); hpPct(u, f.PercentHealth); }); } });
  def('TFT11_Augment_TinyButDeadly', { combat(c, f) { c.units.forEach(u => as(u, f.AttackSpeed)); } });
  def('TFT9_Augment_TonsOfStats', { combat(c, f) { c.units.forEach(u => { hp(u, f.Health); adp(u, f.AttackDamage / 100); u.ap += f.AbilityPower; u.armor += f.Armor; u.mr += f.MR; as(u, f.AttackSpeed / 100); u.mana += f.Mana; }); } });
  same(['TFT9_Augment_PumpingUp', 'TFT9_Augment_PumpingUp2', 'TFT9_Augment_PumpingUp3'], { combat(c, f) { const bonus = (f.BaseAS + f.IncreasePerRound * c.pickedRounds) / 100; c.units.forEach(u => as(u, bonus)); } });
  def('TFT_Augment_BodyguardTraining', { combat(c, f) { c.units.forEach(u => res(u, f.BaseResistGained + f.ResistsPerLevel * c.level)); } });
  def('TFT_Augment_EarlyLearning', { after(p, f, r) { if (r.pvp) p.count('n', 1); }, combat(c, f) { const pct = (f.NumADAP + f.IncPerPlayerCombat * (c.state.n || 0)) / 100; c.units.forEach(u => { const m = u.cost === 1 ? 2 : 1; adp(u, pct * m); u.ap += pct * 100 * m; }); } });
  def('TFT9_Augment_KnowYourEnemy', { combat(c, f) { c.units.forEach(u => { u.amp += f.BaseDamageAmp / 100; }); } });
  def('TFT_Augment_Superstars', { now(p, f) { p.rerolls(f.Rerolls); }, combat(c, f) { const bonus = f.BaseBonusDamage + f.BonusDamagePer3Star * c.units.filter(u => u.star >= 3).length; c.units.forEach(u => { u.amp += bonus; }); } });
  same(['TFT_Augment_BronzeForLifeI'], { combat(c, f) { const n = c.bronzeTraits(); c.units.forEach(u => { u.amp += f.DamageAmpBonus * n; }); } });
  def('TFT_Augment_BronzeForLife2', { combat(c, f) { const n = c.bronzeTraits(); c.units.forEach(u => { u.amp += f.DamageAmpBonus * n; res(u, f.Resists * n); }); } });
  def('TFT6_Augment_Diversify1', { combat(c, f) { const n = c.activeTraits(); c.units.forEach(u => { adp(u, f.AD * n); u.ap += f.AP * n; }); } });
  def('TFT_Augment_ItemCollector1', { combat(c, f) { const n = Math.min(uniqueItems(c), f.MaxCap); c.units.forEach(u => { adp(u, f.AD * n); u.ap += f.AP * n; }); } });
  def('TFT_Augment_ItemCollector2', { combat(c, f) { const n = Math.min(uniqueItems(c), f.MaxCap); c.units.forEach(u => { hp(u, f.BaseHP + f.Health * n); adp(u, f.AD * n); u.ap += f.AP * n; }); } });
  def('TFT14_Augment_BlackMarketTitanicStrength', { combat(c, f) { c.units.forEach(u => { adp(u, u.maxHp * f.ADHealthPercent / 100 / Math.max(1, u.baseAd)); u.ap += u.maxHp * f.APHealthPercent / 100; }); } });
  def('TFT10_Augment_LittleBuddies', { combat(c, f) { const n = c.units.filter(u => u.cost <= 2).length; c.units.filter(u => u.cost >= 4).forEach(u => { hp(u, f.Health * n); as(u, f.AttackSpeed * n); }); } });
  def('TFT_Augment_LegionOfThrees', { now(p) { p.emblem(); }, combat(c, f) { c.units.filter(u => u.cost === 3 || (u.itemIds || []).some(i => String(i).startsWith('Emblem_'))).forEach(u => { hp(u, f.HealthAmount); as(u, f.AS); }); } });
  def('TFT_Augment_WeStickTogether', { now(p) { p.state().t = p.emblem(); p.anvil('item'); }, combat(c, f) { c.units.filter(u => u.traits.includes(c.state.t)).forEach(u => as(u, f.ASPercent / 100)); } });
  def('TFT_Augment_FindYourCenter', { combat(c, f) { const u = c.units.find(x => x.lx === 3 && x.ly === 0); if (u) { u.amp += f.BonusDamage; hpPct(u, f.BonusHealth); } } });

  /* ---------- Combate: posição ---------- */
  def('TFT_Augment_Backup', { combat(c, f) { if (c.units.filter(row.back2).length >= f.MinUnits) c.units.forEach(u => as(u, f.AttackSpeed)); } });
  same(['TFT_Augment_GlassCannonI', 'TFT_Augment_GlassCannonII'], { combat(c, f) { c.units.filter(row.backRow).forEach(u => { u.amp += f.DamageAmp; u.startHpPct = f.Health; }); } });
  def('TFT_Augment_HoldTheLine', { combat(c, f) { const n = c.units.filter(row.front1).length; c.units.filter(row.back2).forEach(u => { u.ap += f.AP * n; adp(u, f.AD * n); }); } });
  def('TFT_Augment_Lineup', { combat(c, f) { const n = c.units.filter(row.front2).length; c.units.forEach(u => res(u, f.Resistances * n)); } });
  def('TFT_Augment_Manaflow1', { combat(c, f) { c.units.filter(row.backRow).forEach(u => { u.manaOnAttack = (u.manaOnAttack || 0) + f.ManaPerAttack; }); } });
  def('TFT_Augment_Incoming', { combat(c, f) { c.after(f.DelaySeconds, () => { const l = c.alive().filter(row.back2); l.forEach(u => { u.mana += f.Mana / Math.max(1, l.length); }); }); } });
  def('TFT_Augment_CalculatedEnhancement', { combat(c, f) { c.sample(c.units.filter(row.back2), f.NumUnits).forEach(u => { adp(u, f.BonusAD); u.ap += f.BonusAP; }); } });
  def('TFT14_Augment_BlackMarket_ScopedWeapons', { combat(c, f) { c.units.filter(row.back2).forEach(u => { u.range += f.HexRangeIncrease; as(u, f.AS); }); } });
  def('TFT_Augment_ShareTheSpotlight', { combat(c, f) { c.units.filter(u => u.ly === 3 && (u.lx === 0 || u.lx === 6)).forEach(u => { u.amp += f.DamagePercent; u.vamp += f.OmnivampPercent; u.manaRegen += f.ManaPerSecond; }); } });
  same(['TFT6_Augment_Keepers1', 'TFT6_Augment_Keepers2'], { combat(c, f) { c.units.forEach(u => { const n = c.units.filter(o => o !== u && c.dist(o, u) <= 1).length; if (n) c.startShield(u, f.ShieldHealth * n, f.ShieldDuration); }); } });
  same(['TFT7_Augment_BestFriends1', 'TFT7_Augment_BestFriends2'], { combat(c, f) { c.units.forEach(u => { const adj = c.units.filter(o => o !== u && c.dist(o, u) <= 1); if (adj.length === 1 && c.units.filter(o => o !== adj[0] && c.dist(o, adj[0]) <= 1).length === 1) { as(u, f.AS); res(u, f.Armor); } }); } });
  def('TFT_Augment_BulkyBuddies3', { combat(c, f) { const buddies = c.units.filter(u => c.units.filter(o => o !== u && c.dist(o, u) <= 1).length === 1); buddies.forEach(u => hp(u, f.HealthBonus)); c.onAllyDeath(d => { if (buddies.includes(d)) c.alive().filter(u => buddies.includes(u)).forEach(u => c.shield(u, u.maxHp * f.ShieldAmount, f.ShieldDuration)); }); } });
  def('TFT9_Augment_LongDistanceRelationship2', { combat(c, f) { let a = null, b = null, top = -1; for (const x of c.units) for (const y of c.units) { const d = c.dist(x, y); if (x !== y && d > top) { top = d; a = x; b = y; } } if (a && b) { const sa = { ar: a.armor, mr: a.mr, ad: a.adPct, ap: a.ap }, sb = { ar: b.armor, mr: b.mr, ad: b.adPct, ap: b.ap }; a.armor += sb.ar * f.PercentShare; a.mr += sb.mr * f.PercentShare; a.ap += sb.ap * f.PercentShare; a.baseAd += b.baseAd * f.PercentShare; b.armor += sa.ar * f.PercentShare; b.mr += sa.mr * f.PercentShare; b.ap += sa.ap * f.PercentShare; b.baseAd += a.baseAd * f.PercentShare; } } });
  same(['TFT6_Augment_Twins2', 'TFT6_Augment_Twins3'], { combat(c, f) { const by = {}; c.units.forEach(u => { (by[u.champ] = by[u.champ] || []).push(u); }); Object.values(by).filter(l => l.length === 2).flat().forEach(u => { const v = f.BonusStats; adp(u, v / 100); u.ap *= 1 + v / 100; u.armor *= 1 + v / 100; u.mr *= 1 + v / 100; }); } });

  /* ---------- Combate: no tempo ---------- */
  def('TFT_Augment_ArcaneViktory', { combat(c, f) { const go = () => c.enemies().forEach(e => c.stun(e, f.StunDuration)); c.after(f.FirstStunSeconds, go); c.after(f.SecondStunSeconds, go); } });
  def('TFT_Augment_ClockworkAccelerator', { combat(c, f) { c.every(f.Frequency, () => c.alive().forEach(u => as(u, f.AttackSpeed))); } });
  def('TFT_Augment_Corrosion', { combat(c, f) { c.every(f.Time, () => c.enemies().filter(e => e.ly <= 1).forEach(e => { e.armor = Math.max(0, e.armor - f.ResistLoss); e.mr = Math.max(0, e.mr - f.ResistLoss); })); } });
  same(['TFT_Augment_BlazingSoul', 'TFT_Augment_BlazingSoul2'], { combat(c, f) { const l = c.units.slice().sort((a, b) => b.asBase - a.asBase); let i = 0; const go = () => { const u = l.filter(x => x.alive)[i++]; if (u) { u.ap *= 1 + f.AbilityPower / 100; as(u, f.AttackSpeed); } }; go(); c.every(f.TransferDuration, go); } });
  def('TFT_Augment_BackupDancers', { combat(c, f) { c.every(f.Period, () => { const n = c.benchRightOccupied(f.BenchSlots); c.alive().forEach(u => as(u, f.AttackSpeedPerUnit * n)); }); } });
  def('TFT6_Augment_SecondWind1', { combat(c, f) { c.after(f.Delay, () => c.alive().forEach(u => c.heal(u, (u.maxHp - u.hp) * f.HealPercent / 100))); } });
  def('TFT9_Augment_Commander_Ascension', { combat(c, f) { c.after(f.Delay, () => c.alive().forEach(u => { u.amp += f.DamageAmp / 100; })); } });
  def('TFT9_Augment_Commander_FinalAscension', { combat(c, f) { c.units.forEach(u => { u.amp += f.DamageAmp / 100; }); c.after(f.Delay, () => c.alive().forEach(u => { u.amp += (f.AscendedAmpTOOLTIPONLY - f.DamageAmp) / 100; })); } });
  def('TFT6_Augment_SunfireBoard', { combat(c, f) { c.enemies().forEach(e => { e.burnUntil = f.Duration; e.woundUntil = f.Duration; e.burnPct = (f.TotalBurnPercent / 100) / f.Duration; }); } });
  def('TFT_Augment_Underdogs', { combat(c, f) { c.every(1, () => { if (c.alive().length < c.enemies().length) c.alive().forEach(u => c.heal(u, Math.min(f.HealCap, (u.maxHp - u.hp) * f.MissingHeal / 100))); }); } });
  def('TFT_Augment_PlotArmor', { combat(c, f) { c.units.forEach(u => res(u, f.BaseResists)); c.onHpBelow(f.HealthThreshold, u => res(u, f.EnhancedTotalResists - f.BaseResists)); } });
  def('TFT_Augment_LastSecondSave', { combat(c, f) { c.onHpBelow(f.HealthThreshold, u => c.heal(u, u.maxHp * f.HealPercent)); } });
  def('TFT_Augment_BloodRage', { combat(c, f) { c.onDamageMul(u => { const lost = 1 - u.hp / u.maxHp; const cap = 1 - f.MissingHealthCap / 100; return f.BaseDamageAmp + (f.DamageAmpCap - f.BaseDamageAmp) * Math.min(1, lost / cap); }); } });
  def('TFT_Augment_EvilBeyondMeasure', { combat(c, f) { c.onDealt((src, tgt, dealt) => { if (dealt > 0) c.trueHit(src, tgt, dealt * f.BasePercentTrueDamage * src.star); }); } });
  def('TFT_Augment_Crossfire2', { combat(c, f) { const stacks = new Map(); c.onDealt((src, tgt, dealt) => { if (dealt <= 0) return; const s = Math.min(f.PercentMax, (stacks.get(tgt.id) ?? f.BaseDamage) + f.PercentInc); stacks.set(tgt.id, s); c.trueHit(src, tgt, dealt * s); }); } });
  def('TFT_Augment_AxiomArc3', { now(p) { p.anvil('item'); }, combat(c, f) { c.onKill(k => { k.mana += f.ManaGain; }); } });
  same(['TFT9_Augment_HealingOrbsI', 'TFT9_Augment_HealingOrbsII'], { combat(c, f) { c.onEnemyDeath(d => { const near = c.alive().sort((a, b) => c.dist(a, d) - c.dist(b, d))[0]; if (near) c.heal(near, f.Heal); }); } });
  def('TFT_Augment_NobleSacrifice', { combat(c, f) { let done = false; c.onAllyDeath(d => { if (done) return; done = true; c.alive().forEach(u => { u.armor += f.BaseResists + d.armor * f.SharePerc; u.mr += f.BaseResists + d.mr * f.SharePerc; }); }); } });
  same(['TFT_Augment_ClimbTheLadder1', 'TFT_Augment_ClimbTheLadder2'], { combat(c, f) { c.onAllyDeath(d => c.alive().filter(u => u.traits.some(t => d.traits.includes(t))).forEach(u => { u.adPct += f.BonusAD; u.ad = u.baseAd * (1 + u.adPct); u.ap *= 1 + f.BonusAP / 100; u.armor += f.BonusArmor; u.mr += f.BonusMR; })); } });
  def('TFT10_Augment_GoodForSomethingSilver', { combat(c, f) { c.onAllyDeath(d => { if (!items(d).length && c.chance(f.DropChance)) c.gold(f.Gold); }); } });
  def('TFT_Augment_ChemtechOverdrive', { combat(c, f) { const hexes = c.sample([0, 1, 2, 3, 4, 5, 6], f.NumHexes); c.units.filter(u => u.ly === 1 && hexes.includes(u.lx)).forEach(u => { hp(u, f.Health); as(u, f.AttackSpeed); }); c.onAllyDeath(d => { if (d.ly === 1 && hexes.includes(d.lx)) c.gold(f.Gold); }); } });
  def('TFT_Augment_MirroredMonetization', { now(p, f) { p.gold(f.GoldContained); p.state().left = f.rounds; }, round(p) { const s = p.state(); if (s.left > 0) s.left--; }, combat(c, f) { if (c.state.left > 0) c.onEnemyDeath(() => c.gold(f.PercCost)); } });
  def('TFT9_Augment_RedBuff', { combat(c, f) { c.onAttackHit((u, t) => { t.burnUntil = c.now() + f.Duration; t.woundUntil = c.now() + f.Duration; t.burnPct = Math.max(t.burnPct || 0, (f.BurnPercent / 100) / f.Duration); }); } });
  same(['TFT_Augment_WaterLotus1', 'TFT_Augment_WaterLotus2'], { combat(c, f) { c.units.forEach(u => { u.crit += f.CritChance; u.abilityCrit = true; }); c.onAbilityCrit(u => { u.mana += u.maxMana * (f.ManaOnCrit / 100); }); } });
  def('TFT_Augment_PiercingLotus2', { combat(c, f) { c.units.forEach(u => { u.crit += f.CritChance / 100; u.abilityCrit = true; }); c.onCritHit((u, t) => { t.shredUntil = c.now() + f.Duration; t.shredV = Math.max(t.shredV, f.ShredSunderPerc); t.sunderUntil = c.now() + f.Duration; t.sunderV = Math.max(t.sunderV, f.ShredSunderPerc); }); } });
  def('TFT_Augment_Overheal', { combat(c, f) { const n = new Map(); c.onAttackHit((u, t) => { const k = (n.get(u.id) || 0) + 1; n.set(u.id, k); if (k % f.NumAttacks) return; const d = u.ad * f.BonusDamage; c.physicalHit(u, t, d); const over = Math.max(0, u.hp + d * f.PercentHeal - u.maxHp); c.heal(u, d * f.PercentHeal); if (over > 0) c.shield(u, Math.min(over, f.MaxShield), f.Duration); }); } });
  def('TFT_Augment_TeslaCoil', { combat(c, f) { c.every(f.Frequency, () => c.alive().filter(u => items(u).length >= f.MinItems).forEach(u => { const dmg = f.Stage2Damage + (f.Stage6Damage - f.Stage2Damage) * Math.min(1, Math.max(0, c.stage - 2) / 4); c.sample(c.enemies(), f.NumArcs).forEach(e => c.magicHit(u, e, dmg)); })); } });
  def('TFT_Augment_FoodfightTactics', { combat(c, f) { c.after(f.EndSeconds, () => { c.alive().forEach(u => as(u, f.AttackSpeed)); c.onAttackHit((u, t) => { for (let i = 0; i < f.ProjectileCount; i++) c.magicHit(u, t, f.BaseDamage * u.ap / 100); }); }); } });
  def('TFT6_Augment_LudensEcho3', { combat(c, f) { const m = new Map(); const dmg = () => [f.MagicDamage1, f.MagicDamage2, f.MagicDamage3, f.MagicDamage4][Math.min(3, Math.max(0, c.stage - 2))]; c.onCast(u => { const t = (m.get(u.id) || 0) + u.maxMana; m.set(u.id, t % f.ManaThreshold); if (t >= f.ManaThreshold) { const e = c.enemiesNear(u)[0]; if (e) { c.magicHit(u, e, dmg()); const s = c.enemiesNear(e).find(x => x !== e); if (s) c.magicHit(u, s, dmg()); } } }); } });
  def('TFT_Augment_HowlingGale', { combat(c, f) { let pool = 0; c.onCast(u => { pool += u.maxMana; while (pool >= f.ManaPerWhirlwind) { pool -= f.ManaPerWhirlwind; const e = c.enemies()[0]; if (e) c.enemies().filter(x => c.dist(x, e) <= 2).forEach(x => c.stun(x, f.StunDuration)); } }); } });
  def('TFT_Augment_ThornPlatedArmor', { now(p) { p.item('BrambleVest'); }, combat(c, f) { c.units.forEach(u => { u.brambleMul = 1 + [f.DamageAmp1, f.DamageAmp2, f.DamageAmp3, f.DamageAmp4][Math.min(3, Math.max(0, c.stage - 2))]; }); } });
  def('TFT_Augment_UnleashTheBeast', null);

  /* ---------- Vida por características ---------- */
  def('TFT9_Augment_DravenSpoilsOfWar_placeholder', null);
  same(['TFT9_Augment_DravenSpoilsOfWar', 'TFT9_Augment_DravenSpoilsOfWar2', 'TFT9_Augment_DravenSpoilsOfWar3'], { combat(c, f) { c.onEnemyDeath(() => { if (c.chance(f.LootDropChance)) c.loot(); }); } });

  /* ---------- Específicos de característica, com campeões concedidos ---------- */
  const giveChamps = (...names) => ({ now(p) { names.forEach(n => p.champName(n)); } });
  const withChamps = (names, impl) => ({ ...impl, now(p, f) { names.forEach(n => p.champName(n)); if (impl.now) impl.now(p, f); } });
  def('TFT14_Augment_Divinicorp_Vertical', withChamps(['Rhaast', 'Morgana'], { combat(c, f) { c.after(f.Delay, () => c.alive().filter(u => u.traits.includes('Divinicorp')).forEach(u => { const g = u.maxHp * f.BonusHealthPerc; u.maxHp += g; u.hp += g; as(u, f.BonusAttackSpeed); })); } }));
  def('TFT14_Augment_Marksman_Vertical', withChamps(['Jhin', 'Kindred'], { combat(c, f) { const list = () => c.alive().filter(u => u.traits.includes('Atirador')); c.onAttackHit((u, t) => { if (u.traits.includes('Atirador') && t.alive && t.hp / t.maxHp < f.ExecutionPercent) { c.trueHit(u, t, t.hp + 1); list().forEach(a => as(a, f.ASBonus)); } }); } }));
  def('TFT14_Augment_Strong_Vertical', withChamps(['Vayne', 'Shaco'], { combat(c, f) { c.units.filter(u => u.traits.includes('Dizimador')).forEach(u => { adp(u, f.AttackDamageBonus); }); c.onHpBelow(f.HealthThreshold, u => { if (u.traits.includes('Dizimador')) { u.adPct -= f.AttackDamageBonus; u.ad = u.baseAd * (1 + u.adPct); u.vamp += f.OmnivampBonus; } }); } }));
  def('TFT14_Augment_Bruiser_Vertical', withChamps(['Darius', 'Alistar'], { combat(c, f) { c.onAllyDeath(d => { if (d.traits.includes('Brutamontes')) c.perm(d, { hp: f.HealthBonus }); }); } }));
  def('TFT14_Augment_Techie_Vertical', withChamps(['Veigar', 'Zyra'], { combat(c, f) { const list = c.units.filter(u => u.traits.includes('Tecnológico')); list.forEach(u => { u.ap += f.InitialAbilityPower; }); let n = 0; c.onEnemyDeath(() => { if (++n % f.NumTakedowns === 0) c.alive().filter(u => list.includes(u)).forEach(u => { u.ap += f.AbilityPower; }); }); } }));
  def('TFT14_Augment_Syndicate_KeepYourFriendsClose', withChamps(['Twisted Fate', 'Darius'], { combat(c, f) { const tr = c.units.filter(u => u.traits.includes('Transgressor')); const bosses = tr.filter(u => u.ly === 0); bosses.forEach(u => { const n = c.units.filter(o => o !== u && o.ly === u.ly && c.dist(o, u) <= 1).length; as(u, f.BossAS * n); hp(u, f.BossHealth * n); }); c.units.filter(u => !bosses.includes(u)).forEach(u => hp(u, f.AllyHealth)); } }));
  def('TFT14_Augment_Armorclad_Splash', withChamps(['Illaoi', 'Jax'], { combat(c, f) { c.after(10, () => c.alive().filter(u => u.traits.includes('Bastião')).forEach(u => { as(u, f.AttackSpeedBonus); adp(u, f.ConversionRate / 10); u.ap += f.ConversionRate * 10; u.ad = u.baseAd * (1 + u.adPct); })); } }));
  def('TFT14_Augment_Thirsty_Vertical', withChamps(['Jhin', 'Morgana'], { combat(c, f) { c.units.filter(u => u.traits.includes('Dínamo')).forEach(u => { u.amp += f.DamageAmp; }); } }));
  def('TFT14_Augment_Immortal_Vertical', withChamps(['Graves', 'Alistar'], { now(p, f) { p.gold(f.Gold); }, after(p, f, r) { const s = p.state(); s.n = (s.n || 0) + 1; if (s.n % f.TurnsPerGold === 0) p.gold(f.GoldDropped * p.traitOnBoard('Boi Dourado')); }, mods(m, f) { m.interestCap = f.InterestCap; } }));
  def('TFT14_Augment_Immortal_VerticalPlus', I.TFT14_Augment_Immortal_Vertical);
  def('TFT14_Augment_Cutter_Splash', withChamps(['Graves', 'Rengar'], { combat(c, f) { c.onCritHit(u => { if (u.traits.includes('Carrasco') && c.chance(f.GoldDropChance)) c.gold(1); }); } }));
  def('TFT14_Augment_Nitro_PolishedChrome', withChamps(['Kindred', 'Nidalee'], { starUp(p, f) { const u = p.lastStarUpUnit(); if (u && u.star === 3 && p.champHasTrait(u, 'Nitro')) { p.permUnit(u, { ad: f.BonusAD, ap: f.BonusAP }); p.gold(f.Gold); } } }));
  def('TFT11_Augment_BloodBank', { after(p, f, r) { const s = p.state(); s.d = (s.d || 0) + (r.playerDamage || 0); const n = Math.floor(s.d / f.Damage); if (n) { s.d -= n * f.Damage; p.gold(n * f.Gold); } } });
  def('TFT11_Augment_ScoreboardScrapper', {
    round(p, f) { const top = p.rank() <= f.UpperHalf; p.state().top = top; if (!top) p.permAll({ ad: f.LoserBoost, ap: f.LoserBoost * 100 }); },
    combat(c, f) { if (c.state.top) c.units.forEach(u => hpPct(u, f.WinningStatBoost)); },
  });
  def('TFT_Augment_SpiritLink1', { combat(c, f) { const missing = Math.max(0, 100 - c.playerHp); const pct = f.BaseRegenBonus + (Math.floor(missing / 10) * f.RegenPerMissingHP) / 100; c.every(f.RegenPeriod, () => c.alive().forEach(u => c.heal(u, u.maxHp * pct))); } });
  def('TFT_Augment_TragicalBlade_placeholder', null);

  return I;
})();
if (typeof module !== 'undefined') module.exports = TFT_AUG_IMPL;
