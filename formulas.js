// Fórmulas centrais do Mudae Tracker.
// Spawn: p(per roll) = peso efetivo / pool; acumulado = 1 - (1-p)^rolls.

const silverBadge = [0, 0.25, 0.50, 0.75, 1.00];
const sapphireBadge = [0, 1, 2, 3, 4];
const rubyWishBonus = [0, 0, 0.50, 0.50, 0.50];
const WISHLIST_CATEGORIES = ["favoritos", "estrelas"];

// LVL 0..6 + MAX automático.
const wishlistNeighborBonus = [0, 0.15, 0.30, 0.45, 0.60, 0.75, 1.00, 1.15];
const shopS1SelfPercent = [0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00];

const STARWISH_TOWER_BONUS = [0, .50, .25, .20, .16, .13, .10, .08, .06, .05, .04, .03, .03, .02, .02, .02, .01];

function clamp(v, min, max) { return Math.min(Math.max(Number(v) || 0, min), max); }

function towerPerk2Bonus(towerNumber) {
    if (towerNumber < STARWISH_TOWER_BONUS.length) return STARWISH_TOWER_BONUS[towerNumber] || 0;
    return 0.01;
}

function towerPerk3Reduction(towerNumber) {
    if (towerNumber === 1) return { WA: 200, HA: 200, WG: 140, HG: 140 };
    // Wiki detalhada atual: a partir da segunda, redução menor.
    return { WA: 140, HA: 140, WG: 70, HG: 70 };
}


const TOWER_FLOOR_DETAILS = {
    1: {
        category: "wish",
        label: "Wishlist",
        summary: "+2 espaços de wishlist",
        effect: "Adiciona 2 espaços à sua wishlist.",
        details: ["O bônus é recebido novamente em cada torre construída."],
        notes: "Aumenta a quantidade de personagens que podem permanecer desejados simultaneamente.",
        interactions: ["Wishlist", "Starwish", "Organização dos personagens desejados"]
    },
    2: {
        category: "spawn",
        label: "Spawn",
        summary: "Aumenta o spawn da starwish",
        effect: "Aumenta a chance de spawn da sua starwish.",
        details: ["Na primeira torre, o bônus é de +50%.", "Em torres seguintes, o bônus é recebido novamente com valores progressivamente menores."],
        notes: "Aplica-se somente ao personagem marcado como starwish. Os demais bônus de wish continuam sendo somados normalmente.",
        interactions: ["Starwish", "Tutorial", "Silver", "Ruby II", "$boostwish", "OP 1 e Shop 1"]
    },
    3: {
        category: "spawn",
        label: "Limroul",
        summary: "Reduz os limites do $limroul",
        effect: "Reduz o tamanho dos pools usados nas rolagens.",
        details: ["Gamemode 2 — primeira torre: −200 $wa, −200 $ha, −140 $wg e −140 $hg.", "Gamemode 1: adiciona espaço à disablelist e reduz os limites correspondentes."],
        notes: "Um pool menor aumenta a chance individual de cada personagem habilitado aparecer.",
        interactions: ["Gamemode 2", "$limroul", "Probabilidade diária", "Categorias WA/HA/WG/HG"]
    },
    4: {
        category: "keys",
        label: "Chaves",
        summary: "Chance de receber uma segunda chave",
        effect: "Adiciona chance de receber uma segunda chave ao obter uma chave em um personagem desejado.",
        details: ["Na primeira torre, a chance adicional é de +10%.", "O valor pode mudar nas torres posteriores."],
        notes: "O personagem precisa estar na wishlist para o efeito deste andar ser considerado.",
        interactions: ["Wishlist", "Chaves", "Gold Keys", "OP 4", "Shop 4"]
    },
    5: {
        category: "sphere",
        label: "$oh e esferas",
        summary: "Revela botões adicionais no $oh",
        effect: "Revela botões aleatórios adicionais ao usar $oh.",
        details: ["Na primeira torre, revela 2 botões adicionais.", "Nas torres seguintes, o efeito continua evoluindo; após atingir o limite de botões, passa a oferecer chance de dobrar esferas de botão."],
        notes: "O retorno depende de usar o $oh e aproveitar os botões revelados.",
        interactions: ["$oh", "Esferas", "Botões de kakera", "Shop 9"]
    },
    6: {
        category: "sphere",
        label: "Esferas",
        summary: "Esferas extras em ações recorrentes",
        effect: "Adiciona esferas a diferentes fontes de recompensa.",
        details: ["1ª torre: +30 esferas ao reivindicar um personagem.", "2ª torre: +30 esferas com $dk.", "3ª torre: +20 esferas com Bronze IV.", "4ª torre: +10 esferas com $rolls.", "Torres posteriores adicionam valores menores a essas fontes."],
        notes: "A fonte beneficiada depende do número da torre atual.",
        interactions: ["Claims", "$dk", "Bronze IV", "$rolls"]
    },
    7: {
        category: "kakera",
        label: "Poder de kakera",
        summary: "Aumenta o poder máximo de kakera",
        effect: "Aumenta o limite máximo do poder usado para reagir a botões de kakera.",
        details: ["Na primeira torre, o aumento é de +10%.", "O bônus permite ultrapassar o limite normal de 100% de poder máximo."],
        notes: "Aumenta a quantidade de reações que podem ser realizadas antes de esgotar o poder.",
        interactions: ["Kakera Power", "Reações", "Andar 8", "Gold"]
    },
    8: {
        category: "kakera",
        label: "Custo de reação",
        summary: "Reduz o custo de poder das reações",
        effect: "Reduz o consumo de poder ao reagir a botões de kakera.",
        details: ["Na primeira torre, a redução é de 4%.", "Em torres seguintes, a redução pode atingir seu limite; depois disso, o andar passa a fornecer bônus de kakera vermelha e arco-íris."],
        notes: "Combina diretamente com o aumento de poder máximo do andar 7.",
        interactions: ["Kakera Power", "Reações", "Andar 7", "Gold"]
    },
    9: {
        category: "keys",
        label: "Gold Keys",
        summary: "Aumenta o teto do bônus de Gold Keys",
        effect: "Aumenta o bônus máximo temporário obtido com Gold Keys.",
        details: ["Na primeira torre, adiciona +500 kakera ao teto do bônus por 3 horas.", "O estado atual pode ser consultado com $bku."],
        notes: "O valor adicional diminui em grupos de torres posteriores.",
        interactions: ["Gold Keys", "$bku", "Valor dos personagens"]
    },
    10: {
        category: "kakera",
        label: "Light Kakera",
        summary: "Light Kakera fornece kakera adicional",
        effect: "Cada Light Kakera fornece uma kakera aleatória adicional.",
        details: ["Normalmente, Light Kakera gera 3–4 recompensas; com um andar 10, passa a gerar 4–5.", "O efeito pode ser recebido por várias torres até o limite previsto."],
        notes: "Em torres posteriores, o benefício muda para redução de raridade das recompensas de Chaos Kakera.",
        interactions: ["Light Kakera", "Chaos Kakera", "Botões especiais"]
    },
    11: {
        category: "rolls",
        label: "Rolls",
        summary: "+1 roll por hora",
        effect: "Adiciona 1 roll a cada reset horário.",
        details: ["O bônus é recebido novamente nas torres seguintes até o limite definido pelo sistema.", "Após esse estágio, o andar passa a fortalecer os bônus de Bronze IV e Silver IV."],
        notes: "Mais rolls aumentam diretamente as oportunidades diárias de encontrar personagens desejados.",
        interactions: ["Rolls por hora", "Probabilidade diária", "Bronze IV", "Silver IV"]
    },
    12: {
        category: "utility",
        label: "Comandos e Chaos",
        summary: "Desbloqueia comandos de cor",
        effect: "Desbloqueia comandos de personalização nas primeiras torres.",
        details: ["1ª torre: desbloqueia $colormm e $colorpr.", "2ª torre: desbloqueia $colorll e $colorsl.", "Nas torres posteriores, adiciona kakera às recompensas de Chaos Kakera."],
        notes: "O efeito depende inteiramente do número da torre atual.",
        interactions: ["Comandos de cor", "Chaos Kakera", "Personalização"]
    }
};

function getTowerFloorDetails(towerNumber, floorNumber) {
    const tn = Math.max(1, Number(towerNumber) || 1);
    const base = TOWER_FLOOR_DETAILS[floorNumber] || {
        category: "utility", label: "Buff", summary: "", effect: "", details: [], notes: "", interactions: []
    };
    const currentEffects = {
        1: "+2 espaços de wishlist nesta torre.",
        2: `Bônus desta torre: +${Math.round(towerPerk2Bonus(tn) * 100)}% de spawn para a starwish.`,
        3: (() => { const r = towerPerk3Reduction(tn); return `Efeito desta torre no GM2: −${r.WA} $wa, −${r.HA} $ha, −${r.WG} $wg e −${r.HG} $hg.`; })(),
        4: `Chance adicional desta torre: +${tn <= 2 ? 10 : 5}%.`,
        5: tn === 1 ? "Efeito desta torre: revela 2 botões no $oh." : tn <= 8 ? "Efeito desta torre: revela +1 botão no $oh." : "Efeito desta torre: +0,5% de chance de dobrar esferas de botão.",
        6: tn === 1 ? "Efeito desta torre: +30 esferas ao claim." : tn === 2 ? "Efeito desta torre: +30 esferas no $dk." : tn === 3 ? "Efeito desta torre: +20 esferas com Bronze IV." : tn === 4 ? "Efeito desta torre: +10 esferas com $rolls." : `Efeito desta torre: +${tn <= 9 ? 2 : 1} esfera(s) em claim, $dk, Bronze IV e $rolls.`,
        7: `Efeito desta torre: +${tn === 1 ? 10 : tn <= 75 ? 5 : 1}% de poder máximo de kakera.`,
        8: tn === 1 ? "Efeito desta torre: −4% no custo de poder." : tn <= 4 ? "Efeito desta torre: −2% no custo de poder." : "Efeito desta torre: +250 kakera em botões vermelhos e arco-íris.",
        9: `Efeito desta torre: +${tn <= 11 ? 500 : tn <= 21 ? 100 : 50} no teto de Gold Keys por 3 horas.`,
        10: tn <= 10 ? "Efeito desta torre: +1 kakera aleatória na Light Kakera." : "Efeito desta torre: −1% na raridade das recompensas de Chaos Kakera.",
        11: tn <= 10 ? "Efeito desta torre: +1 roll por hora." : `Efeito desta torre: +${tn >= 50 ? 50 : tn >= 30 ? 40 : 30}% em Bronze IV e Silver IV.`,
        12: tn === 1 ? "Efeito desta torre: desbloqueia $colormm e $colorpr." : tn === 2 ? "Efeito desta torre: desbloqueia $colorll e $colorsl." : `Efeito desta torre: +${tn <= 10 ? 165 : 3} kakera em Chaos Kakera.`
    };
    return { ...base, towerNumber: tn, currentEffect: currentEffects[floorNumber] || "" };
}

function getTowerFloorDescription(towerNumber, floorNumber) {
    const d = getTowerFloorDetails(towerNumber, floorNumber);
    return d.currentEffect || d.summary || d.effect || "";
}

function getKakeraTowerStats(config) {
    const stats = {
        towerCount: 0,
        wishlistSlotsBonus: 0,
        starwishChanceBonus: 0,
        limroulReduction: { WA: 0, HA: 0, WG: 0, HG: 0 },
        extraKeyChance: 0,
        revealedOhButtons: 0,
        sphereButtonDoubleChance: 0,
        claimSphereBonus: 0,
        dkSphereBonus: 0,
        bronzeSphereBonus: 0,
        rollsSphereBonus: 0,
        maxKakeraPowerBonus: 0,
        kakeraPowerCostReduction: 0,
        redRainbowFlatBonus: 0,
        goldKeyCapBonus: 0,
        lightKakeraExtra: 0,
        chaosRarityReduction: 0,
        extraRollsPerHour: 0,
        bronzeSilverKakeraBonus: 0,
        chaosKakeraFlatBonus: 0,
        unlockedColorCommands: []
    };
    const towers = Array.isArray(config.kakeraTowers) ? config.kakeraTowers : [];
    stats.towerCount = towers.length;
    towers.forEach((tower, ti) => {
        const tn = ti + 1;
        if (!Array.isArray(tower.floors)) return;
        tower.floors.forEach((bought, fi) => {
            if (!bought) return;
            switch (fi + 1) {
                case 1: stats.wishlistSlotsBonus += 2; break;
                case 2: stats.starwishChanceBonus += towerPerk2Bonus(tn); break;
                case 3: {
                    const red = towerPerk3Reduction(tn);
                    Object.keys(red).forEach(k => stats.limroulReduction[k] += red[k]);
                    break;
                }
                case 4: stats.extraKeyChance += tn <= 2 ? .10 : .05; break;
                case 5:
                    if (tn === 1) stats.revealedOhButtons += 2;
                    else if (tn <= 8) stats.revealedOhButtons += 1;
                    else stats.sphereButtonDoubleChance += .005;
                    break;
                case 6:
                    if (tn === 1) stats.claimSphereBonus += 30;
                    else if (tn === 2) stats.dkSphereBonus += 30;
                    else if (tn === 3) stats.bronzeSphereBonus += 20;
                    else if (tn === 4) stats.rollsSphereBonus += 10;
                    else {
                        const add = tn <= 9 ? 2 : 1;
                        stats.claimSphereBonus += add; stats.dkSphereBonus += add;
                        stats.bronzeSphereBonus += add; stats.rollsSphereBonus += add;
                    }
                    break;
                case 7: stats.maxKakeraPowerBonus += tn === 1 ? .10 : (tn <= 75 ? .05 : .01); break;
                case 8:
                    if (tn === 1) stats.kakeraPowerCostReduction += .04;
                    else if (tn <= 4) stats.kakeraPowerCostReduction += .02;
                    else stats.redRainbowFlatBonus += 250;
                    break;
                case 9: stats.goldKeyCapBonus += tn <= 11 ? 500 : (tn <= 21 ? 100 : 50); break;
                case 10:
                    if (tn <= 10) stats.lightKakeraExtra += 1;
                    else stats.chaosRarityReduction += .01;
                    break;
                case 11:
                    if (tn <= 10) stats.extraRollsPerHour += 1;
                    else stats.bronzeSilverKakeraBonus += tn >= 50 ? .50 : (tn >= 30 ? .40 : .30);
                    break;
                case 12:
                    if (tn === 1) stats.unlockedColorCommands.push("$colormm", "$colorpr");
                    else if (tn === 2) stats.unlockedColorCommands.push("$colorll", "$colorsl");
                    else stats.chaosKakeraFlatBonus += tn <= 10 ? 165 : 3;
                    break;
            }
        });
    });
    return stats;
}

function getBoostWishBonuses(rollsInvested) {
    const n = Math.max(0, Math.floor(Number(rollsInvested) || 0));
    let wish = 0, star = 0;
    for (let i = 1; i <= n; i++) {
        wish += i <= 5 ? .20 : i <= 15 ? .15 : i <= 100 ? .10 : i <= 200 ? .05 : .01;
        star += i <= 100 ? .10 : i <= 200 ? .05 : .01;
    }
    return { wish, star };
}

function effectiveRollsPerHour(config) {
    const tower = getKakeraTowerStats(config);
    const base = Number(config.rollsPerHour) || 0;
    const sapphire = Number(sapphireBadge[clamp(config.levelSafira, 0, 4)] || 0);
    const rubyIV = Number(config.levelRuby) >= 4 ? 2 : 0;
    const invested = Math.max(0, Number(config.boostWishRolls) || 0);
    return Math.max(0, base + sapphire + rubyIV + tower.extraRollsPerHour - invested);
}

function effectivePools(config) {
    const t = getKakeraTowerStats(config);
    const legacyAnime = Number(config.totalWaHa) || 0;
    const legacyGame = Number(config.totalWgHg) || 0;
    return {
        WA: Math.max(1, (Number(config.poolWA) || legacyAnime || 1) - t.limroulReduction.WA),
        HA: Math.max(1, (Number(config.poolHA) || legacyAnime || 1) - t.limroulReduction.HA),
        WG: Math.max(1, (Number(config.poolWG) || legacyGame || 1) - t.limroulReduction.WG),
        HG: Math.max(1, (Number(config.poolHG) || legacyGame || 1) - t.limroulReduction.HG)
    };
}

function isAnimeGender(g) { return g === "wa" || g === "ha"; }
function isGameGender(g) { return g === "wg" || g === "hg"; }
function poolKey(g) { return String(g || "").toUpperCase(); }

// Comportamento preservado a pedido do usuário: filtros visuais podem orientar o pool,
// e personagens de múltiplas roletas usam o menor pool disponível.
function choosePoolForCharacter(config, person) {
    const pools = effectivePools(config);
    const genders = person && Array.isArray(person.genders) ? person.genders : [];
    let selected = [];
    try {
        if (typeof charFilters !== "undefined" && charFilters?.genders?.size) {
            selected = [...charFilters.genders].filter(g => genders.includes(g));
        }
    } catch (_) { selected = []; }
    const source = selected.length ? selected : genders;
    const candidates = source.map(g => pools[poolKey(g)]).filter(Number.isFinite);
    if (candidates.length) return Math.min(...candidates);
    const hasAnime = genders.some(isAnimeGender), hasGame = genders.some(isGameGender);
    if (hasAnime && !hasGame) return Math.min(pools.WA, pools.HA);
    if (hasGame && !hasAnime) return Math.min(pools.WG, pools.HG);
    return Math.min(pools.WA, pools.HA, pools.WG, pools.HG);
}

function getOrderedWishlist(characters) {
    return (Array.isArray(characters) ? characters : [])
        .filter(c => c && WISHLIST_CATEGORIES.includes(c.category))
        .slice().sort((a,b)=>(Number(a.wishlistPosition)||0)-(Number(b.wishlistPosition)||0));
}

function isCharacterFullyOptimized(person) {
    const levels = person?.opLevels || {};
    return [1,2,3,4,5].every(i => Number(levels[`p${i}`] || 0) >= 6) &&
           [6,7,8,9,10].every(i => Number(levels[`p${i}`] || 0) >= 1);
}
function opLevelValue(person, perkId, table) {
    let lvl = clamp(person?.opLevels?.[perkId], 0, table.length - 1);
    if (/^p[1-5]$/.test(perkId) && isCharacterFullyOptimized(person)) lvl = table.length - 1;
    return table[lvl] || 0;
}

// Circularidade preservada a pedido do usuário.
function wishlistAdjacentOpBonus(person, characters) {
    if (!person || !WISHLIST_CATEGORIES.includes(person.category)) return 0;
    const ordered = getOrderedWishlist(characters), n = ordered.length;
    if (n <= 1) return 0;
    const idx = ordered.findIndex(c => c.id === person.id);
    if (idx < 0) return 0;
    const prev = ordered[(idx - 1 + n) % n], next = ordered[(idx + 1) % n];
    const val = c => opLevelValue(c, "p1", wishlistNeighborBonus);
    return (prev?.id === next?.id ? val(prev) : val(prev) + val(next));
}

// Alias para compatibilidade: o bônus é sempre originado pelos OPs adjacentes, nunca pelo próprio OP.
function wishlistNeighborChanceBonus(person, characters) {
    return wishlistAdjacentOpBonus(person, characters);
}

function ownShopS1Bonus(config, person) {
    const shopLevel = clamp(config?.shopLevels?.s1, 0, 10);
    const perkLevel = clamp(person?.opLevels?.p1, 0, 6);

    // O Shop 1 não concede bônus sozinho. Ele compartilha com o próprio
    // personagem uma fração do bônus que esse personagem já possui no Perk 1.
    if (shopLevel <= 0 || perkLevel <= 0) return 0;

    const ownPerk1Bonus = opLevelValue(person, "p1", wishlistNeighborBonus);
    return ownPerk1Bonus * shopS1SelfPercent[shopLevel];
}

function getCharacterBuffMultiplier(config, person, characters) {
    if (!WISHLIST_CATEGORIES.includes(person?.category)) return 1;
    let bonus = 0;
    bonus += silverBadge[clamp(config.levelPrata, 0, 4)] || 0;
    bonus += rubyWishBonus[clamp(config.levelRuby, 0, 4)] || 0;
    if (config.useSlashCommands) bonus += .10;
    const bw = getBoostWishBonuses(config.boostWishRolls);
    bonus += bw.wish;
    if (person.category === "estrelas") {
        const tower = getKakeraTowerStats(config);
        bonus += tower.starwishChanceBonus;
        if (Number(config.tutorialPage) >= 10) bonus += .50;
        if (Number(config.tutorialPage) >= 16) bonus += .50;
        bonus += bw.star;
    }
    bonus += wishlistAdjacentOpBonus(person, characters);
    bonus += ownShopS1Bonus(config, person);
    return Math.max(0, 1 + bonus);
}

function getTotalBuffPercent(config, person, characters) {
    return (getCharacterBuffMultiplier(config, person, characters) - 1) * 100;
}

function getDailyRolls(config, days=1) {
    return effectiveRollsPerHour(config) * (Number(config.gameplayHour) || 0) * Math.max(0, Number(days) || 0);
}

function probabilityForCharacter(config, person, days, characters, withBuff=true) {
    const pool = choosePoolForCharacter(config, person);
    const rolls = getDailyRolls(config, days);
    if (pool <= 0 || rolls <= 0) return 0;
    let weight = withBuff ? getCharacterBuffMultiplier(config, person, characters) : 1;
    // Ajuste aproximado para personagens reivindicados; 1 mantém peso igual.
    const rarity = Math.max(1, Number(config.personalRare) || 1);
    if (person?.claimed !== false) weight /= rarity;
    const p = Math.min(1, Math.max(0, weight / pool));
    return (1 - Math.pow(1 - p, rolls)) * 100;
}

function baseCalcChance(config, person, days) { return probabilityForCharacter(config, person, days, [], false); }
function buffsCalcChance(config, person, days, characters) { return probabilityForCharacter(config, person, days, characters, true); }

function getProbabilityBreakdown(config, person, characters) {
    const tower = getKakeraTowerStats(config), bw = getBoostWishBonuses(config.boostWishRolls);
    return {
        pool: choosePoolForCharacter(config, person),
        rollsPerHour: effectiveRollsPerHour(config),
        rollsPerDay: getDailyRolls(config, 1),
        silver: silverBadge[clamp(config.levelPrata,0,4)] || 0,
        ruby: rubyWishBonus[clamp(config.levelRuby,0,4)] || 0,
        slash: config.useSlashCommands ? .10 : 0,
        boostWish: bw.wish,
        starwishTower: person?.category === "estrelas" ? tower.starwishChanceBonus : 0,
        tutorial: person?.category === "estrelas" ? (Number(config.tutorialPage)>=16?1:Number(config.tutorialPage)>=10?.5:0) : 0,
        boostStarwish: person?.category === "estrelas" ? bw.star : 0,
        opAdjacent: wishlistAdjacentOpBonus(person, characters),
        // Compatibilidade temporária com componentes antigos.
        opNeighbors: wishlistAdjacentOpBonus(person, characters),
        ownPerk1: opLevelValue(person, "p1", wishlistNeighborBonus),
        shop1Share: shopS1SelfPercent[clamp(config?.shopLevels?.s1, 0, 10)] || 0,
        shop1Self: ownShopS1Bonus(config, person),
        multiplier: getCharacterBuffMultiplier(config, person, characters)
    };
}
