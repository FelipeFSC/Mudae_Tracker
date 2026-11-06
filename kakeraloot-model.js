/* ============================================================
   KAKERALOOT — MODELO E LEITOR DO $lk
   ------------------------------------------------------------
   Só cálculo: não toca no DOM, para poder ser testado em Node.
   A tela fica em kakeraloot.js.

   Constantes e fórmulas: "Empirical Estimation of Kakeraloot
   Reward Spawn Rates in Mudae" (colblitz, seção 5.1)
   https://colblitz.com/mudae/kloots-paper-20260908

   Ao longo do arquivo:
   - "unidades" é a quantidade que entra na fórmula de queda. Só a
     Disablelist e o bku diferem do número mostrado no $lk.
   - "acerto" é uma recompensa sorteada numa loot; a quantidade
     pode dobrar o que esse acerto rende.
   ============================================================ */
const KakeraLootModel = (() => {
    const SIMS = 2000;
    const BATCH_SIZE = 12000;         // máximo do Mudae por compra ($kl 12000)
    const RTCD_CAP_HOURS = 15;
    const WISHPROTECT_MAX_LEVEL = 4022; // a partir daqui a chance para em 1/499

    // Acima disto a simulação avança em blocos, em vez de acerto a acerto.
    const EXACT_HITS_LIMIT = 1000;
    const BLOCK_STEPS = 40;
    const FLAT_EXACT_HITS = 50;
    const KAKERA_EXACT_HITS = 1500;

    const DISABLE_FACTORS = { 1: 15, 2: 3 }; // mode 1: 15 chars; mode 2: 3 $wa

    /* k = Infinity com alpha = 0 significa taxa sem queda. */
    const REWARDS = [
        { key: "disable", field: "disable", label: "Disablelist", icon: "🚫", b: 1 / 27, k: 200, alpha: 1, cumulative: true },
        { key: "permanent", field: "permanent", label: "Rolls permanentes", icon: "➕", b: 1 / 600, k: 6, alpha: 1, cumulative: true, unit: "rolls" },
        { key: "wishlist", field: "wishlist", label: "Slots de wishlist", icon: "📜", b: 1 / 300, k: 6, alpha: 1, cumulative: true, unit: "slots" },
        { key: "starBranches", field: "starBranches", label: "Star branches", icon: "🌟", b: 1 / 350, k: 18, alpha: 3.5, cumulative: true, unit: "branches" },
        { key: "rtHours", field: "rtHours", label: "Redução do $rt", icon: "⏱", b: 0.00364265, k: 9998.44, alpha: 1600.66, cap: RTCD_CAP_HOURS, unit: "h", unreliable: true },
        { key: "wishprotect", field: "wishprotect", label: "Wishprotect", icon: "🛡", b: 1 / 8, k: Infinity, alpha: 0, cumulative: true, unit: "níveis" },
        { key: "bku", field: "bku", label: "Reset do $bku", icon: "🔄", b: 1 / 2000, k: Infinity, alpha: 0, cumulative: true, unit: "%", displayFactor: 2 },
        { key: "rolls", field: "stack", label: "Rolls empilhados", icon: "🎲", special: "rolls", unit: "rolls" },
        { key: "kakera", field: "balance", label: "Kakera", icon: "💎", b: 1 / 6, k: Infinity, alpha: 0, special: "kakera", unit: "kakera" },
        { key: "mudapins", field: "mudapins", label: "Mudapins", icon: "📍", b: 1 / 10, k: Infinity, alpha: 0, unit: "pins" }
    ];
    const REWARD_BY_KEY = Object.fromEntries(REWARDS.map(r => [r.key, r]));

    /* Kakera por acerto com $klvalue 1000, sem a dobra da quantidade. O writeup
       traz as faixas, mas as frações somam 99,5 %, então são normalizadas. O
       resultado é ajustado para a média medida (331). */
    const KAKERA_MEAN_PER_HIT = 331;
    const KAKERA_TIERS = (() => {
        const raw = [
            { weight: 0.80, lo: 100, hi: 220 },
            { weight: 0.175, lo: 600, hi: 1049 },
            { weight: 0.02, lo: 2500, hi: 3000 },
            { weight: 0.00002, lo: 42069, hi: 42069 }
        ];
        const totalWeight = raw.reduce((sum, t) => sum + t.weight, 0);
        const rawMean = raw.reduce((sum, t) => sum + (t.weight / totalWeight) * (t.lo + t.hi) / 2, 0);
        const scale = KAKERA_MEAN_PER_HIT / rawMean;
        let acc = 0;
        return raw.map(t => {
            const weight = t.weight / totalWeight;
            acc += weight;
            return { weight, upTo: acc, lo: t.lo * scale, hi: t.hi * scale };
        });
    })();
    // E[A²] de um acerto, para a variância quando a soma vira aproximação normal.
    const KAKERA_SECOND_MOMENT = KAKERA_TIERS.reduce((sum, t) => {
        const span = t.hi - t.lo;
        const mean = (t.lo + t.hi) / 2;
        return sum + t.weight * (mean * mean + span * span / 12);
    }, 0);

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const doubleChance = qty => clamp(Number(qty) || 0, 0, 100) / 100;

    /* ---------- Sorteio com semente: os números não mudam a cada render ---------- */
    function hashSeed(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function createRng(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function normal(rng) {
        const u = 1 - rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    }

    /* ---------- Taxas ---------- */

    // Quality é um re-roll condicional: p = b + (1 − b)·b·q/100.
    function qualityRate(b, quality) {
        return b + (1 - b) * b * clamp(Number(quality) || 0, 0, 100) / 100;
    }

    function rateAt(reward, units, quality) {
        if (reward.cap !== undefined && units >= reward.cap) return 0;
        const base = qualityRate(reward.b, quality);
        if (!reward.alpha) return base;
        return base * Math.pow(1 + units / reward.k, -reward.alpha);
    }

    function spawnRate(key, units, quality) {
        return rateAt(REWARD_BY_KEY[key], units, quality);
    }

    /* ---------- Média e meta (fórmula fechada) ---------- */

    // Ganho esperado em unidades, partindo de units0 e abrindo n loots.
    function expectedGain(key, units0, n, quality, qty) {
        const reward = REWARD_BY_KEY[key];
        if (n <= 0) return 0;
        const r = (1 + doubleChance(qty)) * qualityRate(reward.b, quality);
        if (!reward.alpha) return r * n;
        const { k, alpha } = reward;
        const a1 = alpha + 1;
        const end = k * (Math.pow(Math.pow(1 + units0 / k, a1) + a1 * r * n / k, 1 / a1) - 1);
        const capped = reward.cap !== undefined ? Math.min(end, Math.max(units0, reward.cap)) : end;
        return Math.max(0, capped - units0);
    }

    // Loots até o ganho esperado alcançar `gain` unidades. Infinity se passar do teto.
    function lootsForGain(key, units0, gain, quality, qty) {
        const reward = REWARD_BY_KEY[key];
        if (gain <= 0) return 0;
        if (reward.cap !== undefined && units0 + gain > reward.cap) return Infinity;
        const r = (1 + doubleChance(qty)) * qualityRate(reward.b, quality);
        if (!reward.alpha) return gain / r;
        const { k, alpha } = reward;
        const a1 = alpha + 1;
        return k / (a1 * r) * (Math.pow(1 + (units0 + gain) / k, a1) - Math.pow(1 + units0 / k, a1));
    }

    /* ---------- Simulação de um tipo com taxa decrescente ou plana ---------- */

    // Quantos acertos acontecem em n loots com taxa fixa.
    function drawFlatHits(n, p, rng) {
        const mean = n * p;
        if (mean > FLAT_EXACT_HITS && n * (1 - p) > FLAT_EXACT_HITS) {
            const hits = Math.round(mean + Math.sqrt(mean * (1 - p)) * normal(rng));
            return clamp(hits, 0, n);
        }
        const logMiss = Math.log1p(-p);
        let left = n;
        let hits = 0;
        while (true) {
            left -= Math.ceil(Math.log(1 - rng()) / logMiss);
            if (left < 0) return hits;
            hits++;
        }
    }

    // Quantos desses acertos vieram dobrados.
    function drawDoubles(hits, dbl, rng) {
        if (dbl <= 0 || hits === 0) return 0;
        if (dbl >= 1) return hits;
        if (hits > FLAT_EXACT_HITS) {
            const d = Math.round(hits * dbl + Math.sqrt(hits * dbl * (1 - dbl)) * normal(rng));
            return clamp(d, 0, hits);
        }
        let doubles = 0;
        for (let i = 0; i < hits; i++) if (rng() < dbl) doubles++;
        return doubles;
    }

    // Acerto a acerto: sorteia a espera até o próximo acerto com a taxa do momento.
    function simulateDecliningExact(reward, units0, n, quality, dbl, rng) {
        let units = units0;
        let left = n;
        while (true) {
            const rate = rateAt(reward, units, quality);
            if (rate <= 0) break;
            left -= rate >= 1 ? 1 : Math.ceil(Math.log(1 - rng()) / Math.log1p(-rate));
            if (left < 0) break;
            units += rng() < dbl ? 2 : 1;
            if (reward.cap !== undefined && units >= reward.cap) {
                units = reward.cap;
                break;
            }
        }
        return units - units0;
    }

    // Para muitos acertos: em cada bloco, a taxa fica fixa no ponto médio e o
    // ganho é sorteado por aproximação normal.
    function buildBlockGrid(reward, units0, n, quality, qty) {
        const total = expectedGain(reward.key, units0, n, quality, qty);
        const steps = [];
        let previous = 0;
        for (let j = 1; j <= BLOCK_STEPS; j++) {
            const at = j === BLOCK_STEPS ? n : lootsForGain(reward.key, units0, total * j / BLOCK_STEPS, quality, qty);
            steps.push(at - previous);
            previous = at;
        }
        return steps;
    }

    function simulateDecliningBlocks(reward, units0, quality, dbl, steps, rng) {
        const m = 1 + dbl;
        const secondMoment = 1 + 3 * dbl; // E[M²], com M = 1 ou 2
        let units = units0;
        for (const dn of steps) {
            const predicted = units + 0.5 * rateAt(reward, units, quality) * dn * m;
            const lambda = rateAt(reward, predicted, quality) * dn;
            units = Math.max(units, units + lambda * m + Math.sqrt(lambda * secondMoment) * normal(rng));
        }
        return units - units0;
    }

    // Devolve os ganhos simulados, em unidades.
    function simulateGains(reward, units0, n, quality, qty, seedText) {
        const rng = createRng(hashSeed(seedText));
        const dbl = doubleChance(qty);
        const gains = new Float64Array(SIMS);
        if (!reward.alpha) {
            const p = qualityRate(reward.b, quality);
            for (let i = 0; i < SIMS; i++) {
                const hits = drawFlatHits(n, p, rng);
                gains[i] = hits + drawDoubles(hits, dbl, rng);
            }
            return gains;
        }
        const expectedHits = expectedGain(reward.key, units0, n, quality, qty) / (1 + dbl);
        if (expectedHits <= EXACT_HITS_LIMIT) {
            for (let i = 0; i < SIMS; i++) gains[i] = simulateDecliningExact(reward, units0, n, quality, dbl, rng);
            return gains;
        }
        const steps = buildBlockGrid(reward, units0, n, quality, qty);
        for (let i = 0; i < SIMS; i++) gains[i] = simulateDecliningBlocks(reward, units0, quality, dbl, steps, rng);
        return gains;
    }

    function percentileSorted(sorted, fraction) {
        const pos = (sorted.length - 1) * fraction;
        const lo = Math.floor(pos);
        const hi = Math.min(sorted.length - 1, lo + 1);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    }

    function summarize(values, scale = 1) {
        const sorted = Float64Array.from(values).sort();
        let sum = 0;
        let any = 0;
        for (const v of sorted) {
            sum += v;
            if (v > 0) any++;
        }
        return {
            mean: sum / sorted.length * scale,
            p5: percentileSorted(sorted, 0.05) * scale,
            median: percentileSorted(sorted, 0.5) * scale,
            p95: percentileSorted(sorted, 0.95) * scale,
            pAny: any / sorted.length
        };
    }

    function emptyForecast() {
        return { mean: 0, p5: 0, median: 0, p95: 0, pAny: 0 };
    }

    /* ---------- Rolls empilhados ---------- */

    // Chances das faixas (1 / 0,7 / 0,4), fixadas no total de loots da compra.
    function rollTierAt(lootsSoFar) {
        const w = 1 / (1 + lootsSoFar / 5000);
        if (lootsSoFar < 500) return [{ v: 1, p: 1 }];
        if (lootsSoFar < 1000) return [{ v: 1, p: w }, { v: 0.7, p: 1 - w }];
        return [{ v: 1, p: w }, { v: 0.7, p: (1 - w) * w }, { v: 0.4, p: (1 - w) * (1 - w) }];
    }

    function rollsPerLootStats(lootsSoFar, qty) {
        const dbl = doubleChance(qty);
        const tiers = rollTierAt(lootsSoFar);
        const ev = tiers.reduce((sum, t) => sum + t.p * t.v, 0);
        const ev2 = tiers.reduce((sum, t) => sum + t.p * t.v * t.v, 0);
        const mean = ev * (1 + dbl);
        return { mean, variance: ev2 * (1 + 3 * dbl) - mean * mean };
    }

    function forecastRolls(loots0, n, qty, seedText) {
        if (n <= 0) return emptyForecast();
        if (n <= 200) {
            // Compra pequena: sorteia loot a loot, com a faixa fixa do início.
            const rng = createRng(hashSeed(seedText));
            const dbl = doubleChance(qty);
            const tiers = rollTierAt(loots0);
            const gains = new Float64Array(SIMS);
            for (let i = 0; i < SIMS; i++) {
                let total = 0;
                for (let j = 0; j < n; j++) {
                    let u = rng();
                    let value = tiers[tiers.length - 1].v;
                    for (const t of tiers) {
                        if (u < t.p) { value = t.v; break; }
                        u -= t.p;
                    }
                    total += rng() < dbl ? value * 2 : value;
                }
                gains[i] = total;
            }
            return { ...summarize(gains), pAny: 1 };
        }
        // Compra grande: soma de muitas loots, em lotes de 12.000.
        let mean = 0;
        let variance = 0;
        for (let done = 0; done < n; done += BATCH_SIZE) {
            const size = Math.min(BATCH_SIZE, n - done);
            const stats = rollsPerLootStats(loots0 + done, qty);
            mean += stats.mean * size;
            variance += stats.variance * size;
        }
        const sd = Math.sqrt(variance);
        return { mean, median: mean, p5: Math.max(0, mean - 1.645 * sd), p95: mean + 1.645 * sd, pAny: 1 };
    }

    function lootsForRolls(loots0, gain, qty) {
        if (gain <= 0) return 0;
        let left = gain;
        let loots = 0;
        while (loots < 1e12) {
            const perLoot = rollsPerLootStats(loots0 + loots, qty).mean;
            const batchGain = perLoot * BATCH_SIZE;
            if (batchGain >= left) return loots + left / perLoot;
            left -= batchGain;
            loots += BATCH_SIZE;
        }
        return Infinity;
    }

    /* ---------- Kakera ---------- */

    function kakeraPerLoot(quality, qty, klvalue) {
        const p = qualityRate(REWARD_BY_KEY.kakera.b, quality);
        return p * (1 + doubleChance(qty)) * KAKERA_MEAN_PER_HIT * (klvalue / 1000);
    }

    function drawKakeraHit(rng) {
        const u = rng();
        for (const t of KAKERA_TIERS) {
            if (u < t.upTo) return t.lo + (t.hi - t.lo) * rng();
        }
        return KAKERA_TIERS[0].lo;
    }

    function forecastKakera(n, quality, qty, klvalue, seedText) {
        if (n <= 0) return emptyForecast();
        const rng = createRng(hashSeed(seedText));
        const p = qualityRate(REWARD_BY_KEY.kakera.b, quality);
        const dbl = doubleChance(qty);
        const secondMoment = KAKERA_SECOND_MOMENT * (1 + 3 * dbl);
        const meanPerHit = KAKERA_MEAN_PER_HIT * (1 + dbl);
        const variancePerHit = secondMoment - meanPerHit * meanPerHit;
        const gains = new Float64Array(SIMS);
        for (let i = 0; i < SIMS; i++) {
            const hits = drawFlatHits(n, p, rng);
            if (hits <= KAKERA_EXACT_HITS) {
                let total = 0;
                for (let h = 0; h < hits; h++) total += drawKakeraHit(rng) * (rng() < dbl ? 2 : 1);
                gains[i] = total;
            } else {
                gains[i] = Math.max(0, hits * meanPerHit + Math.sqrt(hits * variancePerHit) * normal(rng));
            }
        }
        return summarize(gains, klvalue / 1000);
    }

    /* ---------- Previsão, meta e sorte em valores de exibição ---------- */

    function displayFactor(key, dlMode) {
        if (key === "disable") return DISABLE_FACTORS[dlMode] || DISABLE_FACTORS[1];
        return REWARD_BY_KEY[key].displayFactor || 1;
    }

    /* opts = { current, loots, quality, quantity, klvalue, dlMode } */
    function forecast(key, n, opts) {
        const reward = REWARD_BY_KEY[key];
        const seed = `${key}|${n}|${opts.current}|${opts.loots}|${opts.quality}|${opts.quantity}|${opts.klvalue}|${opts.dlMode}`;
        if (n <= 0) return emptyForecast();
        if (reward.special === "rolls") return forecastRolls(opts.loots, n, opts.quantity, seed);
        if (reward.special === "kakera") return forecastKakera(n, opts.quality, opts.quantity, opts.klvalue, seed);
        const factor = displayFactor(key, opts.dlMode);
        const units0 = opts.current / factor;
        if (reward.cap !== undefined && units0 >= reward.cap) return emptyForecast();
        return summarize(simulateGains(reward, units0, n, opts.quality, opts.quantity, seed), factor);
    }

    // Loots para ganhar `target` (no valor exibido). Infinity = inalcançável.
    function lootsForTarget(key, target, opts) {
        const reward = REWARD_BY_KEY[key];
        if (!(target > 0)) return null;
        if (reward.special === "rolls") return lootsForRolls(opts.loots, target, opts.quantity);
        if (reward.special === "kakera") return target / kakeraPerLoot(opts.quality, opts.quantity, opts.klvalue);
        const factor = displayFactor(key, opts.dlMode);
        return lootsForGain(key, opts.current / factor, target / factor, opts.quality, opts.quantity);
    }

    // Chance por loot agora: "1 em X" (acerto), ou o rendimento médio por loot.
    function perLootInfo(key, opts) {
        const reward = REWARD_BY_KEY[key];
        if (reward.special === "rolls") return { perLoot: rollsPerLootStats(opts.loots, opts.quantity).mean };
        if (reward.special === "kakera") return { perLoot: kakeraPerLoot(opts.quality, opts.quantity, opts.klvalue) };
        const rate = rateAt(reward, opts.current / displayFactor(key, opts.dlMode), opts.quality);
        return { oneIn: rate > 0 ? 1 / rate : Infinity };
    }

    /* Percentil do seu total contra simulações do zero até o seu total de loots,
       supondo Q/Q sempre no nível atual. Só faz sentido em tipos acumulados. */
    function luck(key, opts) {
        const reward = REWARD_BY_KEY[key];
        if (!reward.cumulative || !(opts.loots > 0)) return null;
        const seed = `luck|${key}|${opts.loots}|${opts.quality}|${opts.quantity}`;
        const factor = displayFactor(key, opts.dlMode);
        const observedUnits = opts.current / factor;
        const gains = Float64Array.from(simulateGains(reward, 0, opts.loots, opts.quality, opts.quantity, seed)).sort();
        let below = 0;
        let equal = 0;
        for (const g of gains) {
            if (g < observedUnits) below++;
            else if (g === observedUnits) equal++;
        }
        const stats = summarize(gains, factor);
        return {
            percentile: (below + equal / 2) / gains.length * 100,
            expected: stats.mean,
            p5: stats.p5,
            p95: stats.p95,
            lowData: stats.mean / factor < 3
        };
    }

    /* ---------- Custos ---------- */

    // Nível L custa 2000 + 200·(L−1). Do nível 0 ao 100: 1.190.000.
    function qualityQuantityCost(fromLevel, toLevel) {
        const cumulative = level => {
            const l = clamp(Math.floor(Number(level) || 0), 0, 100);
            return 2000 * l + 100 * l * (l - 1);
        };
        return Math.max(0, cumulative(toLevel) - cumulative(fromLevel));
    }

    /* ---------- Leitor do $lk ---------- */

    // Separador seguido de exatamente 3 dígitos é de milhar: 5,000 / 5.000.
    function parseNumber(text) {
        let s = String(text).trim().replace(/\s/g, "");
        if (/^[+-]?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
        else s = s.replace(",", ".");
        const value = Number(s);
        return Number.isFinite(value) ? value : null;
    }

    const NUMBER_RE = /[+-]?\d+(?:[.,]\d+)*/;

    function firstNumber(text) {
        const match = String(text).match(NUMBER_RE);
        return match ? Math.abs(parseNumber(match[0])) : null;
    }

    // Procura pelo emoji antes das palavras: o nome dele não muda com o idioma.
    const EMOJI_FIELDS = [
        [/rollstack/, "stack"],
        [/mudapin/, "mudapins"],
        [/addroll|permaroll/, "permanent"],
        [/wlslot|wishslot/, "wishlist"],
        [/wishprotect|^l?wp$/, "wishprotect"],
        [/disablemore|ldisable/, "disable"],
        [/rtcd|^lrt$/, "rtHours"],
        [/bku/, "bku"],
        [/starwish|swb/, "starBranches"],
        [/kakera/, "balance"]
    ];

    const KEYWORD_FIELDS = [
        [/disable|limroul|desativ/i, "disable"],
        [/perman/i, "permanent"],
        [/stack|empilhad|acumulad/i, "stack"],
        [/mudapin/i, "mudapins"],
        [/wishlist|lista de desejos/i, "wishlist"],
        [/protected wish|wish\s*protect|protegid|prote[cç][aã]o/i, "wishprotect"],
        [/\bbku\b/i, "bku"],
        [/\$rt\b|cooldown|recarga/i, "rtHours"],
        [/star\s*branch|\$sw\b|galho|ramo/i, "starBranches"]
    ];

    function parseDisable(rawLine) {
        const limits = rawLine.match(/([+-]?\d+(?:[.,]\d+)*)\s*\$wa/i);
        if (limits) return { value: Math.abs(parseNumber(limits[1])), mode: 2 };
        const characters = rawLine.match(/([+-]?\d+(?:[.,]\d+)*)\s*(?:characters?|chars?|personagens?)/i);
        if (characters) return { value: Math.abs(parseNumber(characters[1])), mode: 1 };
        const fallback = firstNumber(rawLine.replace(/\$\w+/g, " "));
        return fallback === null ? null : { value: fallback, mode: 0 };
    }

    function emptyFields() {
        return {
            username: "", loots: 0, kakeracLoots: 0, quality: 0, quantity: 0, balance: 0,
            stack: 0, mudapins: 0, disable: 0, permanent: 0, wishlist: 0,
            starBranches: 0, rtHours: 0, wishprotect: 0, bku: 0
        };
    }

    /* Linha ausente vale 0: o Mudae só lista o que você já tem. */
    function parseLk(text) {
        const fields = emptyFields();
        const found = new Set();
        const ignored = [];
        let dlMode = 0;

        const set = (field, value) => {
            if (value === null || value === undefined) return false;
            fields[field] = value;
            found.add(field);
            return true;
        };

        for (const rawLine of String(text || "").split(/\r?\n/)) {
            // <:nome:123> vira :nome:, e os ** do Discord somem.
            const line = rawLine
                .replace(/<a?:(\w+):\d+>/g, ":$1:")
                .replace(/\*\*|__|`/g, "")
                .trim();
            if (!line) continue;

            const header = line.match(/^(.+?)\s*[-–—]\s*kakeraloots?\b/i);
            if (header) {
                fields.username = header[1].trim();
                continue;
            }

            const emojis = [...line.matchAll(/:([a-z0-9_]+):/gi)].map(m => m[1].toLowerCase());
            // Sem emoji e sem comando, para o número não vir de "$us" etc.
            const bare = line.replace(/:[a-z0-9_]+:/gi, " ").replace(/\$\w+/g, " ");
            const number = firstNumber(bare);

            if (/kakera\s*c\b/i.test(line) && number !== null) { set("kakeracLoots", number); continue; }
            if (/\$kl\b|\$kakeraloot|\bkl usage\b/i.test(line) && number !== null) { set("loots", number); continue; }
            if (/quantity|quantidade/i.test(line) && number !== null) { set("quantity", clamp(number, 0, 100)); continue; }
            if (/quality|qualidade/i.test(line) && number !== null) { set("quality", clamp(number, 0, 100)); continue; }

            let field = null;
            for (const name of emojis) {
                const hit = EMOJI_FIELDS.find(([re]) => re.test(name));
                if (hit) { field = hit[1]; break; }
            }
            if (!field) {
                const hit = KEYWORD_FIELDS.find(([re]) => re.test(line));
                if (hit) field = hit[1];
            }
            // Saldo colado sem o emoji: a linha tem só o número.
            if (!field && /^\d+(?:[.,]\d+)*$/.test(line)) field = "balance";

            if (field === "disable") {
                const parsed = parseDisable(line);
                if (parsed) {
                    set("disable", parsed.value);
                    if (parsed.mode) dlMode = parsed.mode;
                    continue;
                }
            } else if (field && number !== null) {
                set(field, number);
                continue;
            }
            ignored.push(line);
        }

        return { fields, found: [...found], ignored, dlMode };
    }

    return {
        REWARDS,
        SIMS,
        BATCH_SIZE,
        RTCD_CAP_HOURS,
        WISHPROTECT_MAX_LEVEL,
        KAKERA_MEAN_PER_HIT,
        emptyFields,
        qualityRate,
        spawnRate,
        expectedGain,
        lootsForGain,
        displayFactor,
        forecast,
        lootsForTarget,
        perLootInfo,
        luck,
        kakeraPerLoot,
        rollsPerLootStats,
        qualityQuantityCost,
        parseNumber,
        parseLk
    };
})();

if (typeof window !== "undefined") window.KakeraLootModel = KakeraLootModel;
if (typeof module !== "undefined" && module.exports) module.exports = KakeraLootModel;
