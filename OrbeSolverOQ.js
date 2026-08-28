/* ============================================================
   ORBESOLVER OQ — Ouro Quest ($OQ)
   ------------------------------------------------------------
   Solver local/offline para o minigame Ouro Quest do Mudae.

   Regras centrais:
   - grade 5×5;
   - exatamente 4 posições-alvo (roxas);
   - 7 cliques pagos;
   - roxas são cliques gratuitos;
   - pistas 0..4 contam alvos na vizinhança de Moore;
   - após a 3ª roxa, a 4ª posição torna-se vermelha;
   - todos os 12.650 mundos (C(25,4)) são enumerados localmente.

   Política:
   - abertura usa as referências históricas pré-calculadas fornecidas
     na especificação (WR: casa 8; EV: casa 7);
   - estados pequenos são resolvidos por programação dinâmica exata;
   - estados grandes usam explicitamente a Heurística Adaptativa.
   ============================================================ */
(() => {
    "use strict";

    /* ========================================================
       CONSTANTES E METADADOS
       ======================================================== */
    const GRID_SIZE = 5;
    const CELL_COUNT = 25;
    const PURPLE_COUNT = 4;
    const MAX_PAID_CLICKS = 7;
    const EXPECTED_WORLD_COUNT = 12650;
    const EPS = 1e-12;
    const EXACT_WORLD_LIMIT = 55;
    const EXACT_NODE_LIMIT = 30000;
    const EXACT_TIME_LIMIT_MS = 220;

    const SYMBOL = Object.freeze({
        UNKNOWN: "?",
        PURPLE: "P",
        BLUE: "B",
        CYAN: "T",
        GREEN: "G",
        YELLOW: "Y",
        ORANGE: "O",
        RED: "R"
    });

    const CLUE_TO_SYMBOL = Object.freeze([SYMBOL.BLUE, SYMBOL.CYAN, SYMBOL.GREEN, SYMBOL.YELLOW, SYMBOL.ORANGE]);
    const SYMBOL_TO_CLUE = Object.freeze({ B: 0, T: 1, G: 2, Y: 3, O: 4 });
    const NUMERIC_SYMBOLS = new Set([SYMBOL.BLUE, SYMBOL.CYAN, SYMBOL.GREEN, SYMBOL.YELLOW, SYMBOL.ORANGE]);

    const ORB_VALUES = Object.freeze({
        B: 10,
        T: 20,
        G: 35,
        Y: 55,
        O: 90,
        P: 5,
        R: 150
    });

    const RESULT_META = Object.freeze({
        P: { name: "Roxa", short: "P", clue: null, value: 5, css: "purple" },
        B: { name: "Azul", short: "B", clue: 0, value: 10, css: "blue" },
        T: { name: "Ciano / Teal", short: "T", clue: 1, value: 20, css: "cyan" },
        G: { name: "Verde", short: "G", clue: 2, value: 35, css: "green" },
        Y: { name: "Amarela", short: "Y", clue: 3, value: 55, css: "yellow" },
        O: { name: "Laranja", short: "O", clue: 4, value: 90, css: "orange" },
        R: { name: "Vermelha", short: "R", clue: null, value: 150, css: "red" }
    });
    const RESULT_ORDER = [SYMBOL.PURPLE, SYMBOL.BLUE, SYMBOL.CYAN, SYMBOL.GREEN, SYMBOL.YELLOW, SYMBOL.ORANGE];
    const PALETTE_ORDER = [SYMBOL.PURPLE, SYMBOL.BLUE, SYMBOL.CYAN, SYMBOL.GREEN, SYMBOL.YELLOW, SYMBOL.ORANGE, SYMBOL.RED];

    // Referências históricas fornecidas na especificação. Não são números
    // produzidos pela heurística; aparecem na UI sempre marcados como "ref.".
    const POLICY_BOOKS = Object.freeze({
        WR: Object.freeze({
            action: 7, // casa 8
            winRate: 0.9905,
            expectedValue: 352.2,
            label: "Abertura histórica de referência"
        }),
        EV: Object.freeze({
            action: 6, // casa 7
            winRate: 0.9812,
            expectedValue: 355.9,
            label: "Abertura histórica de referência"
        })
    });

    /* ========================================================
       UTILITÁRIOS
       ======================================================== */
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const formatPct = value => Number.isFinite(value) ? `${(value * 100).toFixed(value >= 0.995 ? 1 : 2).replace(".", ",")}%` : "—";
    const formatNumber = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
    const popcount32 = value => {
        let x = value >>> 0;
        x -= (x >>> 1) & 0x55555555;
        x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
        return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
    };
    const hasBit = (mask, cell) => ((mask >>> cell) & 1) === 1;
    const cellBit = cell => (1 << cell) >>> 0;
    const isNumeric = symbol => NUMERIC_SYMBOLS.has(symbol);
    const countObserved = observations => observations.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    const isInitialState = observations => countObserved(observations) === 0;
    const humanCell = cell => cell + 1;

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function resultLabel(symbol) {
        const meta = RESULT_META[symbol];
        if (!meta) return "Desconhecida";
        if (meta.clue == null) return meta.name;
        return `${meta.name} — ${meta.clue}`;
    }

    /* ========================================================
       VIZINHANÇA DE MOORE
       ======================================================== */
    function buildNeighbors() {
        const lists = [];
        const masks = new Uint32Array(CELL_COUNT);
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            const row = Math.floor(cell / GRID_SIZE);
            const col = cell % GRID_SIZE;
            const list = [];
            let mask = 0;
            for (let dr = -1; dr <= 1; dr += 1) {
                for (let dc = -1; dc <= 1; dc += 1) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = row + dr;
                    const nc = col + dc;
                    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
                    const index = nr * GRID_SIZE + nc;
                    list.push(index);
                    mask |= cellBit(index);
                }
            }
            lists.push(Object.freeze(list));
            masks[cell] = mask >>> 0;
        }
        return Object.freeze({ lists: Object.freeze(lists), masks });
    }

    const NEIGHBORS = buildNeighbors();

    /* Oito simetrias do quadrado. A DP usa a forma canônica do estado
       para compartilhar resultados equivalentes por rotação/reflexão. */
    function buildSymmetryMaps() {
        const maps = [];
        const transforms = [
            (r,c) => [r,c],
            (r,c) => [c, GRID_SIZE-1-r],
            (r,c) => [GRID_SIZE-1-r, GRID_SIZE-1-c],
            (r,c) => [GRID_SIZE-1-c, r],
            (r,c) => [r, GRID_SIZE-1-c],
            (r,c) => [GRID_SIZE-1-c, GRID_SIZE-1-r],
            (r,c) => [GRID_SIZE-1-r, c],
            (r,c) => [c, r]
        ];
        for (const transform of transforms) {
            const map = new Uint8Array(CELL_COUNT);
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                const r = Math.floor(cell / GRID_SIZE), c = cell % GRID_SIZE;
                const [nr,nc] = transform(r,c);
                map[cell] = nr * GRID_SIZE + nc;
            }
            maps.push(map);
        }
        return Object.freeze(maps);
    }

    const SYMMETRY_MAPS = buildSymmetryMaps();

    function transformObservationKey(observations, map) {
        const chars = new Array(CELL_COUNT).fill(".");
        for (let cell = 0; cell < CELL_COUNT; cell += 1) chars[map[cell]] = observations[cell] || ".";
        return chars.join("");
    }

    function canonicalObservationKey(observations) {
        let best = null;
        for (const map of SYMMETRY_MAPS) {
            const key = transformObservationKey(observations, map);
            if (best == null || key < best) best = key;
        }
        return best;
    }

    function equivalentActionRepresentatives(observations) {
        const identityKey = observations.map(value => value || ".").join("");
        const stabilizers = SYMMETRY_MAPS.filter(map => transformObservationKey(observations, map) === identityKey);
        const seen = new Set();
        const result = [];
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (observations[cell] || seen.has(cell)) continue;
            const orbit = new Set(stabilizers.map(map => map[cell]));
            for (const mapped of orbit) seen.add(mapped);
            result.push(Math.min(...orbit));
        }
        result.sort((a,b) => a-b);
        return result;
    }

    /* ========================================================
       GERAÇÃO DOS 12.650 MUNDOS
       ======================================================== */
    function generateWorlds() {
        const masks = new Uint32Array(EXPECTED_WORLD_COUNT);
        let cursor = 0;
        for (let a = 0; a < 22; a += 1) {
            for (let b = a + 1; b < 23; b += 1) {
                for (let c = b + 1; c < 24; c += 1) {
                    for (let d = c + 1; d < 25; d += 1) {
                        masks[cursor++] = (cellBit(a) | cellBit(b) | cellBit(c) | cellBit(d)) >>> 0;
                    }
                }
            }
        }
        if (cursor !== EXPECTED_WORLD_COUNT) throw new Error(`Enumeração inválida: ${cursor} mundos.`);
        return masks;
    }

    function precomputeWorldOutcomes(worldMasks) {
        const outcomes = new Int8Array(worldMasks.length * CELL_COUNT);
        for (let world = 0; world < worldMasks.length; world += 1) {
            const mask = worldMasks[world];
            const offset = world * CELL_COUNT;
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                outcomes[offset + cell] = hasBit(mask, cell)
                    ? 5 // 5 representa alvo/roxa internamente
                    : popcount32((mask & NEIGHBORS.masks[cell]) >>> 0);
            }
        }
        return outcomes;
    }

    function createEngine() {
        const masks = generateWorlds();
        const outcomes = precomputeWorldOutcomes(masks);
        const allIndices = new Uint16Array(masks.length);
        for (let i = 0; i < allIndices.length; i += 1) allIndices[i] = i;
        return Object.freeze({ masks, outcomes, allIndices, count: masks.length });
    }

    /* ========================================================
       NORMALIZAÇÃO E FILTRAGEM DE EVIDÊNCIAS
       ======================================================== */
    function normalizeObservation(value) {
        if (value == null || value === "" || value === SYMBOL.UNKNOWN) return null;
        const symbol = String(value).trim().toUpperCase();
        return Object.prototype.hasOwnProperty.call(RESULT_META, symbol) ? symbol : null;
    }

    function worldMatchesState(engine, worldIndex, observations) {
        const mask = engine.masks[worldIndex];
        const offset = worldIndex * CELL_COUNT;
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            const symbol = observations[cell];
            if (!symbol) continue;
            if (symbol === SYMBOL.PURPLE || symbol === SYMBOL.RED) {
                if (!hasBit(mask, cell)) return false;
                continue;
            }
            const clue = SYMBOL_TO_CLUE[symbol];
            if (clue == null || hasBit(mask, cell) || engine.outcomes[offset + cell] !== clue) return false;
        }
        return true;
    }

    function filterValidWorlds(engine, observations, sourceIndices = null) {
        const source = sourceIndices || engine.allIndices;
        const valid = [];
        for (let i = 0; i < source.length; i += 1) {
            const worldIndex = source[i];
            if (worldMatchesState(engine, worldIndex, observations)) valid.push(worldIndex);
        }
        return Uint16Array.from(valid);
    }

    /* ========================================================
       PROBABILIDADES E ENTROPIA
       ======================================================== */
    function calculateEntropy(probabilities) {
        let entropy = 0;
        for (const probability of probabilities) {
            if (probability > EPS) entropy -= probability * Math.log2(probability);
        }
        return entropy;
    }

    function calculatePaidClicks(observations) {
        let paid = 0;
        for (const symbol of observations) if (symbol === SYMBOL.RED || isNumeric(symbol)) paid += 1;
        return paid;
    }

    function calculatePurpleFound(observations) {
        let count = 0;
        for (const symbol of observations) if (symbol === SYMBOL.PURPLE) count += 1;
        return count;
    }

    function calculatePointsReceived(observations) {
        let points = 0;
        for (const symbol of observations) if (symbol) points += ORB_VALUES[symbol] || 0;
        return points;
    }

    function calculatePhase(observations) {
        const q = calculatePaidClicks(observations);
        const t = calculatePurpleFound(observations);
        const hasRed = observations.includes(SYMBOL.RED);
        if (t < 3 && q >= MAX_PAID_CLICKS) return "DERROTA";
        if (t < 3 && q < MAX_PAID_CLICKS) return "PROCURANDO";
        if (t >= 3 && !hasRed && q < MAX_PAID_CLICKS) return "VERMELHA DISPONÍVEL";
        if (t >= 3 && hasRed && q < MAX_PAID_CLICKS) return "COLETA DE PONTOS";
        return "FINALIZADO";
    }

    function calculateCellDistribution(engine, validWorlds, cell) {
        const counts = new Uint32Array(6); // 0..4 pistas; 5 alvo
        for (let i = 0; i < validWorlds.length; i += 1) {
            const worldIndex = validWorlds[i];
            counts[engine.outcomes[worldIndex * CELL_COUNT + cell]] += 1;
        }
        const denom = validWorlds.length || 1;
        const probabilities = new Float64Array(6);
        for (let i = 0; i < 6; i += 1) probabilities[i] = counts[i] / denom;
        return { counts, probabilities, entropy: calculateEntropy(probabilities) };
    }

    function findRemainingTargetCandidates(engine, validWorlds, observations) {
        const knownTargetMask = observations.reduce((mask, symbol, cell) => {
            return symbol === SYMBOL.PURPLE || symbol === SYMBOL.RED ? (mask | cellBit(cell)) >>> 0 : mask;
        }, 0);
        let unionMask = 0;
        for (let i = 0; i < validWorlds.length; i += 1) unionMask |= engine.masks[validWorlds[i]] & ~knownTargetMask;
        const candidates = [];
        for (let cell = 0; cell < CELL_COUNT; cell += 1) if (hasBit(unionMask >>> 0, cell)) candidates.push(cell);
        return candidates;
    }

    function analyzeState(engine, observations, sourceIndices = null) {
        const validWorlds = filterValidWorlds(engine, observations, sourceIndices);
        const q = calculatePaidClicks(observations);
        const t = calculatePurpleFound(observations);
        const phase = calculatePhase(observations);
        const distributions = new Array(CELL_COUNT);
        const purpleProbabilities = new Float64Array(CELL_COUNT);
        const entropies = new Float64Array(CELL_COUNT);

        if (validWorlds.length > 0) {
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                const distribution = calculateCellDistribution(engine, validWorlds, cell);
                distributions[cell] = distribution;
                purpleProbabilities[cell] = distribution.probabilities[5];
                entropies[cell] = distribution.entropy;
            }
        } else {
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                distributions[cell] = { counts: new Uint32Array(6), probabilities: new Float64Array(6), entropy: 0 };
            }
        }

        return {
            validWorlds,
            worldCount: validWorlds.length,
            impossible: validWorlds.length === 0,
            q,
            t,
            paidRemaining: Math.max(0, MAX_PAID_CLICKS - q),
            phase,
            pointsReceived: calculatePointsReceived(observations),
            distributions,
            purpleProbabilities,
            entropies,
            remainingTargetCandidates: validWorlds.length ? findRemainingTargetCandidates(engine, validWorlds, observations) : []
        };
    }

    /* ========================================================
       COLETA DETERMINÍSTICA APÓS CONHECER AS 4 POSIÇÕES-ALVO
       ======================================================== */
    function calculateKnownClueValues(engine, validWorlds, observations) {
        if (!validWorlds.length) return [];
        const firstWorld = validWorlds[0];
        const firstMask = engine.masks[firstWorld];
        for (let i = 1; i < validWorlds.length; i += 1) if (engine.masks[validWorlds[i]] !== firstMask) return [];
        const result = [];
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (observations[cell] || hasBit(firstMask, cell)) continue;
            const clue = engine.outcomes[firstWorld * CELL_COUNT + cell];
            const symbol = CLUE_TO_SYMBOL[clue];
            result.push({ cell, clue, symbol, value: ORB_VALUES[symbol] });
        }
        result.sort((a, b) => b.value - a.value || a.cell - b.cell);
        return result;
    }

    function calculateTerminalBonus(engine, worldIndices, observations, q) {
        if (!worldIndices.length || q > 6) return 0;
        const clueSlots = Math.max(0, 6 - q); // a vermelha consome um dos cliques restantes
        let total = 0;
        for (let i = 0; i < worldIndices.length; i += 1) {
            const worldIndex = worldIndices[i];
            const mask = engine.masks[worldIndex];
            const values = [];
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                if (observations[cell] || hasBit(mask, cell)) continue;
                const clue = engine.outcomes[worldIndex * CELL_COUNT + cell];
                values.push(ORB_VALUES[CLUE_TO_SYMBOL[clue]]);
            }
            values.sort((a, b) => b - a);
            let bonus = ORB_VALUES.R;
            for (let j = 0; j < Math.min(clueSlots, values.length); j += 1) bonus += values[j];
            total += bonus;
        }
        return total / worldIndices.length;
    }

    /* ========================================================
       PARTIÇÃO DE MUNDOS PARA BUSCA
       ======================================================== */
    function partitionWorlds(engine, worldIndices, cell) {
        const buckets = [[], [], [], [], [], []];
        for (let i = 0; i < worldIndices.length; i += 1) {
            const worldIndex = worldIndices[i];
            buckets[engine.outcomes[worldIndex * CELL_COUNT + cell]].push(worldIndex);
        }
        return buckets;
    }

    function stateKey(observations, q, t, mode) {
        return `${mode}|${q}|${t}|${canonicalObservationKey(observations)}`;
    }

    class ExactAbort extends Error {}

    function createExactContext() {
        return {
            started: performance.now(),
            nodes: 0,
            wrMemo: new Map(),
            evMemo: new Map(),
            check() {
                this.nodes += 1;
                if (this.nodes > EXACT_NODE_LIMIT || performance.now() - this.started > EXACT_TIME_LIMIT_MS) throw new ExactAbort("Limite seguro da busca exata atingido.");
            }
        };
    }

    function solveWinRateValue(engine, worldIndices, observations, q, t, ctx) {
        if (t >= 3 && q <= 6) return 1;
        if (q >= MAX_PAID_CLICKS && t < 3) return 0;
        ctx.check();
        const key = stateKey(observations, q, t, "WR");
        const cached = ctx.wrMemo.get(key);
        if (cached != null) return cached;

        let best = 0;
        for (const cell of equivalentActionRepresentatives(observations)) {
            const buckets = partitionWorlds(engine, worldIndices, cell);
            let value = 0;
            for (let outcome = 0; outcome < 6; outcome += 1) {
                const bucket = buckets[outcome];
                if (!bucket.length) continue;
                const probability = bucket.length / worldIndices.length;
                const nextObs = observations.slice();
                if (outcome === 5) {
                    nextObs[cell] = SYMBOL.PURPLE;
                    value += probability * solveWinRateValue(engine, bucket, nextObs, q, t + 1, ctx);
                } else {
                    nextObs[cell] = CLUE_TO_SYMBOL[outcome];
                    value += probability * solveWinRateValue(engine, bucket, nextObs, q + 1, t, ctx);
                }
            }
            if (value > best) best = value;
            if (best >= 1 - EPS) break;
        }
        ctx.wrMemo.set(key, best);
        return best;
    }

    function evaluateWinRateAction(engine, worldIndices, observations, q, t, cell, ctx) {
        const buckets = partitionWorlds(engine, worldIndices, cell);
        let value = 0;
        for (let outcome = 0; outcome < 6; outcome += 1) {
            const bucket = buckets[outcome];
            if (!bucket.length) continue;
            const probability = bucket.length / worldIndices.length;
            const nextObs = observations.slice();
            if (outcome === 5) {
                nextObs[cell] = SYMBOL.PURPLE;
                value += probability * solveWinRateValue(engine, bucket, nextObs, q, t + 1, ctx);
            } else {
                nextObs[cell] = CLUE_TO_SYMBOL[outcome];
                value += probability * solveWinRateValue(engine, bucket, nextObs, q + 1, t, ctx);
            }
        }
        return value;
    }

    function solveWinRate(engine, analysis, observations) {
        const ctx = createExactContext();
        let best = null;
        for (const cell of equivalentActionRepresentatives(observations)) {
            const value = evaluateWinRateAction(engine, analysis.validWorlds, observations, analysis.q, analysis.t, cell, ctx);
            const candidate = {
                cell,
                winRate: value,
                purpleProbability: analysis.purpleProbabilities[cell],
                entropy: analysis.entropies[cell]
            };
            if (!best || value > best.winRate + EPS || (
                Math.abs(value - best.winRate) <= EPS && (
                    candidate.purpleProbability > best.purpleProbability + EPS ||
                    (Math.abs(candidate.purpleProbability - best.purpleProbability) <= EPS && (
                        candidate.entropy > best.entropy + EPS ||
                        (Math.abs(candidate.entropy - best.entropy) <= EPS && cell < best.cell)
                    ))
                )
            )) best = candidate;
        }
        if (best) best.states = ctx.nodes;
        return best;
    }

    function solveExpectedValueValue(engine, worldIndices, observations, q, t, ctx) {
        if (t >= 3) return calculateTerminalBonus(engine, worldIndices, observations, q);
        if (q >= MAX_PAID_CLICKS) return 0;
        ctx.check();
        const key = stateKey(observations, q, t, "EV");
        const cached = ctx.evMemo.get(key);
        if (cached != null) return cached;

        let best = -Infinity;
        for (const cell of equivalentActionRepresentatives(observations)) {
            const value = evaluateExpectedValueAction(engine, worldIndices, observations, q, t, cell, ctx);
            if (value > best) best = value;
        }
        if (!Number.isFinite(best)) best = 0;
        ctx.evMemo.set(key, best);
        return best;
    }

    function evaluateExpectedValueAction(engine, worldIndices, observations, q, t, cell, ctx) {
        const buckets = partitionWorlds(engine, worldIndices, cell);
        let value = 0;
        for (let outcome = 0; outcome < 6; outcome += 1) {
            const bucket = buckets[outcome];
            if (!bucket.length) continue;
            const probability = bucket.length / worldIndices.length;
            const nextObs = observations.slice();
            if (outcome === 5) {
                nextObs[cell] = SYMBOL.PURPLE;
                value += probability * (ORB_VALUES.P + solveExpectedValueValue(engine, bucket, nextObs, q, t + 1, ctx));
            } else {
                const symbol = CLUE_TO_SYMBOL[outcome];
                nextObs[cell] = symbol;
                value += probability * (ORB_VALUES[symbol] + solveExpectedValueValue(engine, bucket, nextObs, q + 1, t, ctx));
            }
        }
        return value;
    }

    function solveExpectedValue(engine, analysis, observations) {
        const ctx = createExactContext();
        let best = null;
        for (const cell of equivalentActionRepresentatives(observations)) {
            const value = evaluateExpectedValueAction(engine, analysis.validWorlds, observations, analysis.q, analysis.t, cell, ctx);
            const candidate = {
                cell,
                expectedValue: value,
                purpleProbability: analysis.purpleProbabilities[cell],
                entropy: analysis.entropies[cell],
                winRate: null
            };
            if (!best || value > best.expectedValue + EPS) {
                best = candidate;
                continue;
            }
            if (Math.abs(value - best.expectedValue) <= EPS) {
                if (candidate.winRate == null) candidate.winRate = evaluateWinRateAction(engine, analysis.validWorlds, observations, analysis.q, analysis.t, candidate.cell, ctx);
                if (best.winRate == null) best.winRate = evaluateWinRateAction(engine, analysis.validWorlds, observations, analysis.q, analysis.t, best.cell, ctx);
                if (candidate.winRate > best.winRate + EPS || (
                    Math.abs(candidate.winRate - best.winRate) <= EPS && (
                        candidate.purpleProbability > best.purpleProbability + EPS ||
                        (Math.abs(candidate.purpleProbability - best.purpleProbability) <= EPS && (
                            candidate.entropy > best.entropy + EPS ||
                            (Math.abs(candidate.entropy - best.entropy) <= EPS && cell < best.cell)
                        ))
                    )
                )) best = candidate;
            }
        }
        if (best) {
            if (best.winRate == null) best.winRate = evaluateWinRateAction(engine, analysis.validWorlds, observations, analysis.q, analysis.t, best.cell, ctx);
            best.states = ctx.nodes;
        }
        return best;
    }

    /* ========================================================
       HEURÍSTICA ADAPTATIVA
       ======================================================== */
    function chooseByPurpleThenEntropy(analysis, observations) {
        let best = null;
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (observations[cell]) continue;
            const candidate = { cell, p: analysis.purpleProbabilities[cell], h: analysis.entropies[cell] };
            if (!best || candidate.p > best.p + EPS || (
                Math.abs(candidate.p - best.p) <= EPS && (candidate.h > best.h + EPS || (Math.abs(candidate.h - best.h) <= EPS && cell < best.cell))
            )) best = candidate;
        }
        return best;
    }

    function chooseByEntropyThenPurple(analysis, observations) {
        let best = null;
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (observations[cell]) continue;
            const candidate = { cell, p: analysis.purpleProbabilities[cell], h: analysis.entropies[cell] };
            if (!best || candidate.h > best.h + EPS || (
                Math.abs(candidate.h - best.h) <= EPS && (candidate.p > best.p + EPS || (Math.abs(candidate.p - best.p) <= EPS && cell < best.cell))
            )) best = candidate;
        }
        return best;
    }

    function recommendHeuristicMove(analysis, observations) {
        const candidates = [];
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (observations[cell]) continue;
            candidates.push({ cell, p: analysis.purpleProbabilities[cell], h: analysis.entropies[cell] });
        }
        if (!candidates.length) return null;

        const guaranteed = candidates.filter(item => item.p >= 0.9999).sort((a, b) => a.cell - b.cell)[0];
        if (guaranteed) return { ...guaranteed, reason: "Roxa garantida — clique gratuito" };

        if (analysis.paidRemaining <= 1) {
            const best = chooseByPurpleThenEntropy(analysis, observations);
            return { ...best, reason: "Maior probabilidade de roxa — último clique pago" };
        }

        const pBest = chooseByPurpleThenEntropy(analysis, observations);
        const theta = 0.06 * (1 + analysis.paidRemaining);
        if (pBest && pBest.p > theta) return { ...pBest, reason: "Maior probabilidade de roxa" };

        const infoBest = chooseByEntropyThenPurple(analysis, observations);
        return { ...infoBest, reason: "Maior ganho de informação" };
    }

    function getRecommendedMove(engine, analysis, observations, mode) {
        if (!analysis || analysis.impossible) return { strategy: "Nenhuma", reason: "Estado impossível ou entrada incorreta", cell: -1 };
        if (analysis.phase === "DERROTA") return { strategy: "Finalizado", reason: "Os 7 cliques pagos terminaram antes de localizar 3 roxas.", cell: -1 };
        if (analysis.phase === "FINALIZADO") return { strategy: "Finalizado", reason: "Não existem mais cliques pagos disponíveis.", cell: -1 };

        if (analysis.phase === "VERMELHA DISPONÍVEL") {
            if (analysis.remainingTargetCandidates.length === 1) {
                const cell = analysis.remainingTargetCandidates[0];
                return {
                    strategy: "Dedução exata",
                    reason: "Vermelha deduzida — quarta posição-alvo determinada matematicamente",
                    cell,
                    purpleProbability: 1,
                    entropy: 0,
                    expectedImmediate: ORB_VALUES.R,
                    redDeduced: true
                };
            }
            return {
                strategy: "Aguardando Discord",
                reason: "A quarta roxa virou vermelha. Marque no tabuleiro a posição vermelha exibida pelo Discord.",
                cell: -1
            };
        }

        if (analysis.phase === "COLETA DE PONTOS") {
            const known = calculateKnownClueValues(engine, analysis.validWorlds, observations);
            if (!known.length) return { strategy: "Coleta determinística", reason: "Nenhuma recompensa adicional determinística disponível.", cell: -1 };
            const best = known[0];
            return {
                strategy: "Coleta determinística",
                reason: "Coleta de maior valor",
                cell: best.cell,
                knownSymbol: best.symbol,
                expectedImmediate: best.value,
                purpleProbability: 0,
                entropy: 0
            };
        }

        // Abertura: segue a estratégia inicial pré-calculada da especificação,
        // mas é explicitamente exibida como referência histórica, não como
        // número calculado pela heurística local.
        if (isInitialState(observations)) {
            const book = POLICY_BOOKS[mode];
            return {
                strategy: "Heurística adaptativa",
                reason: book.label,
                cell: book.action,
                purpleProbability: analysis.purpleProbabilities[book.action],
                entropy: analysis.entropies[book.action],
                referenceWinRate: book.winRate,
                referenceEV: book.expectedValue,
                historicalReference: true
            };
        }

        // A busca exata é restrita a estados pequenos. Estados maiores usam a
        // heurística adaptativa para manter a UI responsiva e não fingir exatidão.
        if (analysis.validWorlds.length <= EXACT_WORLD_LIMIT) {
            try {
                const started = performance.now();
                if (mode === "WR") {
                    const exact = solveWinRate(engine, analysis, observations);
                    if (exact) return {
                        strategy: "Estratégia exata · DP local",
                        reason: "Maior chance de vitória calculada por programação dinâmica",
                        cell: exact.cell,
                        purpleProbability: exact.purpleProbability,
                        entropy: exact.entropy,
                        exactWinRate: exact.winRate,
                        states: exact.states,
                        calculationMs: performance.now() - started
                    };
                } else {
                    const exact = solveExpectedValue(engine, analysis, observations);
                    if (exact) return {
                        strategy: "Estratégia exata · DP local",
                        reason: "Maior valor esperado calculado por programação dinâmica",
                        cell: exact.cell,
                        purpleProbability: exact.purpleProbability,
                        entropy: exact.entropy,
                        exactEV: exact.expectedValue,
                        exactWinRate: exact.winRate,
                        states: exact.states,
                        calculationMs: performance.now() - started
                    };
                }
            } catch (error) {
                if (!(error instanceof ExactAbort)) throw error;
            }
        }

        const heuristic = recommendHeuristicMove(analysis, observations);
        return heuristic ? {
            strategy: "Heurística adaptativa",
            reason: heuristic.reason,
            cell: heuristic.cell,
            purpleProbability: heuristic.p,
            entropy: heuristic.h
        } : { strategy: "Nenhuma", reason: "Sem jogadas disponíveis.", cell: -1 };
    }

    /* ========================================================
       SERIALIZAÇÃO, UNDO E REDO
       ======================================================== */
    function validateGameState(observations) {
        const purpleCount = calculatePurpleFound(observations);
        const redCount = observations.filter(symbol => symbol === SYMBOL.RED).length;
        const paid = calculatePaidClicks(observations);
        if (purpleCount > 3) return { valid: false, message: "O OQ possui somente três roxas clicáveis antes da transformação da quarta." };
        if (redCount > 1) return { valid: false, message: "O estado pode conter no máximo uma esfera vermelha." };
        if (redCount === 1 && purpleCount < 3) return { valid: false, message: "A vermelha só pode ser informada depois de encontrar três roxas." };
        if (paid > MAX_PAID_CLICKS) return { valid: false, message: "O estado possui mais de sete resultados pagos." };
        return { valid: true, message: "" };
    }

    class OQStateManager {
        constructor() {
            this.observations = new Array(CELL_COUNT).fill(null);
            this.mode = "WR";
            this.undoStack = [];
            this.redoStack = [];
        }
        snapshot() {
            return { observations: this.observations.slice(), mode: this.mode };
        }
        restore(snapshot) {
            this.observations = snapshot.observations.slice();
            this.mode = snapshot.mode === "EV" ? "EV" : "WR";
        }
        pushUndo() {
            this.undoStack.push(this.snapshot());
            if (this.undoStack.length > 80) this.undoStack.shift();
            this.redoStack = [];
        }
        setObservation(cell, symbol) {
            const normalized = normalizeObservation(symbol);
            if (this.observations[cell] === normalized) return false;
            this.pushUndo();
            this.observations[cell] = normalized;
            return true;
        }
        setMode(mode) {
            const normalized = mode === "EV" ? "EV" : "WR";
            if (this.mode === normalized) return false;
            this.pushUndo();
            this.mode = normalized;
            return true;
        }
        undo() {
            const previous = this.undoStack.pop();
            if (!previous) return false;
            this.redoStack.push(this.snapshot());
            this.restore(previous);
            return true;
        }
        redo() {
            const next = this.redoStack.pop();
            if (!next) return false;
            this.undoStack.push(this.snapshot());
            this.restore(next);
            return true;
        }
        reset() {
            this.pushUndo();
            this.observations.fill(null);
        }
    }

    /* ========================================================
       HTML DO MÓDULO
       ======================================================== */
    const MODULE_HTML = `
        <div id="orbeOqScreen" class="oq-screen" hidden>
            <div class="page-head split oq-head">
                <div>
                    <h1><span class="page-icon">◉</span> $OQ SOLVER</h1>
                    <p class="subtitle">Encontre 3 das 4 esferas roxas em até 7 cliques pagos.</p>
                </div>
                <div class="oq-head-actions">
                    <button type="button" id="oqBackToHub" class="pill purple">← SOLVERS</button>
                    <button type="button" id="oqHowBtn" class="pill cyan">? COMO FUNCIONA</button>
                </div>
            </div>

            <div id="oqDiagnostic" class="oq-diagnostic" role="status" aria-live="polite">
                <span class="oq-loader"></span> Inicializando os 12.650 mundos possíveis...
            </div>

            <div class="oq-mode-row" role="group" aria-label="Modo de otimização do OQ">
                <button type="button" class="oq-mode-btn active" data-oq-mode="WR"><strong>WR</strong><span>CHANCE DE VITÓRIA</span></button>
                <button type="button" class="oq-mode-btn" data-oq-mode="EV"><strong>EV</strong><span>PONTOS ESPERADOS</span></button>
            </div>

            <div id="oqStatus" class="oq-status-grid"></div>

            <div class="oq-layout">
                <div class="oq-main-column">
                    <div class="panel oq-board-panel">
                        <div class="panel-title"><span class="bar purple"></span>TABULEIRO 5×5</div>
                        <div class="oq-toolbar">
                            <button type="button" id="oqUndoBtn" class="pill purple">↶ DESFAZER</button>
                            <button type="button" id="oqRedoBtn" class="pill purple">↷ REFAZER</button>
                            <button type="button" id="oqResetBtn" class="pill red">↻ REINICIAR</button>
                            <button type="button" id="oqProbBtn" class="pill cyan active">% PROBABILIDADES</button>
                        </div>
                        <div id="oqBoard" class="oq-board" role="grid" aria-label="Tabuleiro Ouro Quest 5 por 5"></div>
                        <p id="oqBoardHint" class="oq-hint">Clique em uma casa e informe o resultado mostrado pelo Mudae.</p>
                    </div>
                </div>

                <div class="oq-side-column">
                    <div class="panel oq-rec-panel">
                        <div class="panel-title"><span class="bar yellow"></span>RECOMENDAÇÃO</div>
                        <div id="oqCalcStatus" class="oq-calc-status"></div>
                        <div id="oqRecommendation" class="oq-recommendation"></div>
                    </div>

                    <div class="panel oq-detail-panel">
                        <div class="panel-title"><span class="bar cyan"></span>DETALHE DA CASA</div>
                        <div id="oqCellDetail" class="oq-cell-detail">Passe o mouse, foque ou toque em uma casa para ver a distribuição completa.</div>
                    </div>
                </div>
            </div>

            <div class="panel oq-legend-panel">
                <div class="panel-title"><span class="bar yellow"></span>RESULTADOS E PONTOS</div>
                <div class="oq-legend">
                    ${PALETTE_ORDER.map(symbol => `<div class="oq-legend-item oq-result-${RESULT_META[symbol].css}"><span class="oq-legend-symbol">${symbol}</span><span>${resultLabel(symbol)}</span><strong>${ORB_VALUES[symbol]} pts</strong></div>`).join("")}
                </div>
            </div>

            <details id="oqMathPanel" class="panel oq-math-panel">
                <summary><span class="bar cyan"></span> ENTENDA O CÁLCULO</summary>
                <div class="oq-math-content">
                    <h3>1. Quatro posições-alvo</h3>
                    <p>Cada mundo contém exatamente quatro roxas. São enumeradas todas as combinações: <code>C(25,4) = 12.650</code>.</p>
                    <pre>Σ xᵢ = 4
xᵢ = 1 quando a casa i pertence às quatro posições-alvo</pre>

                    <h3>2. Significado das pistas</h3>
                    <p>Uma pista usa a vizinhança de Moore: horizontal, vertical e diagonal, até oito casas ao redor.</p>
                    <pre>Azul = 0 · Ciano = 1 · Verde = 2 · Amarela = 3 · Laranja = 4</pre>
                    <p>Uma pista numérica nunca é roxa. Roxa e vermelha exigem que a casa pertença ao conjunto das quatro posições-alvo.</p>

                    <h3>3. Mundos válidos e probabilidade</h3>
                    <pre>W(S) = { M : Oₘ(c) = o_c para toda observação em S }
P(roxa em c | S) = mundos válidos com c roxa / |W(S)|</pre>
                    <p>No estado inicial todas as 25 casas possuem exatamente <strong>4/25 = 16%</strong> de chance de roxa.</p>

                    <h3>4. Entropia</h3>
                    <pre>H(c) = -Σ P(o_c|S) · log₂ P(o_c|S)</pre>
                    <p>A entropia mede quanto de informação se espera obter ao clicar em uma casa.</p>

                    <h3>5. WR e EV</h3>
                    <p><strong>WR</strong> prioriza a chance de localizar três roxas antes de esgotar os cliques pagos. <strong>EV</strong> prioriza o total esperado de pontos, incluindo a vermelha e a coleta final.</p>
                    <p>As roxas são gratuitas. Pistas e a vermelha consomem um clique pago.</p>

                    <h3>6. Estratégia exata x heurística</h3>
                    <p>Estados suficientemente pequenos são resolvidos por programação dinâmica exata. Estados maiores usam a <strong>Heurística adaptativa</strong>, claramente identificada na recomendação, para evitar travamentos no navegador.</p>
                </div>
            </details>

            <div id="oqModal" class="oq-modal-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="oqModalTitle">
                <div class="oq-modal">
                    <div class="oq-modal-head">
                        <div><h2 id="oqModalTitle">Resultado da casa</h2><p id="oqModalSubtitle"></p></div>
                        <button type="button" id="oqModalClose" class="oq-modal-close" aria-label="Fechar">✕</button>
                    </div>
                    <div id="oqModalBody" class="oq-modal-body"></div>
                    <div id="oqModalActions" class="oq-modal-actions"></div>
                </div>
            </div>
        </div>`;

    /* ========================================================
       CSS ESCOPADO DO OQ
       ======================================================== */
    const MODULE_CSS = `
        /* ===== Base tipográfica: mesma escala visual do $OC ===== */
        .oq-screen[hidden]{display:none!important}
        .oq-screen{padding-bottom:42px;font-size:14px}
        .oq-screen .page-head h1{font-size:26px}
        .oq-screen .page-head .subtitle{font-size:15px;line-height:1.55}
        .oq-screen .panel-title{font-size:15px}
        .oq-screen .pill{font-size:13px}
        .oq-head{align-items:flex-start}
        .oq-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}

        .oq-diagnostic{display:flex;align-items:center;gap:8px;min-height:34px;margin:-8px 0 16px;padding:8px 12px;border:1px solid rgba(169,107,255,.28);border-radius:7px;background:rgba(169,107,255,.055);color:var(--muted);font-size:13px}
        .oq-diagnostic.ok{border-color:rgba(60,207,117,.38);background:rgba(60,207,117,.055);color:#87f4ad}
        .oq-diagnostic.error{border-color:rgba(240,68,85,.46);background:rgba(240,68,85,.065);color:#ff8793}
        .oq-loader{display:inline-block;width:10px;height:10px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:oqSpin .7s linear infinite;flex:0 0 auto}
        @keyframes oqSpin{to{transform:rotate(360deg)}}

        /* ===== Modos WR / EV ===== */
        .oq-mode-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 16px}
        .oq-mode-btn{min-height:58px;border:1px solid rgba(169,107,255,.30);border-radius:9px;background:rgba(255,255,255,.018);color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;transition:.14s ease}
        .oq-mode-btn strong{font:800 21px var(--mono);color:#cdb0ff}
        .oq-mode-btn span{font:700 13px var(--mono);letter-spacing:.7px}
        .oq-mode-btn:hover,.oq-mode-btn:focus-visible{border-color:var(--purple);box-shadow:0 0 18px rgba(169,107,255,.13);outline:none;transform:translateY(-1px)}
        .oq-mode-btn.active{border-color:var(--purple);background:rgba(169,107,255,.10);box-shadow:0 0 18px rgba(169,107,255,.14);color:#f1e9ff}

        /* ===== Status ===== */
        .oq-status-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:0 0 16px}
        .oq-stat-card{min-width:0;padding:9px;border:1px solid var(--border-soft);background:rgba(255,255,255,.016);border-radius:7px}
        .oq-stat-label{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.35px;margin-bottom:4px}
        .oq-stat-value{display:block;color:var(--text);font-size:13px;font-weight:800;overflow-wrap:anywhere}
        .oq-stat-value.purple{color:#c89cff}.oq-stat-value.gold{color:var(--yellow)}.oq-stat-value.green{color:var(--green)}
        .oq-stat-sub{display:block;margin-top:4px;font-size:9px;color:#7f899f;line-height:1.35}

        /* ===== Layout ===== */
        .oq-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr);gap:16px;align-items:start}
        .oq-main-column,.oq-side-column{min-width:0}
        .oq-side-column{display:grid;gap:16px}
        .oq-board-panel{position:relative;overflow:visible}
        .oq-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
        .oq-toolbar .pill{min-height:40px}
        .oq-toolbar .pill.active{border-color:var(--cyan);color:#9cf7ff;box-shadow:0 0 12px rgba(39,203,209,.14)}

        /* ===== Board — mesma linguagem visual do $OC ===== */
        .oq-board{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;max-width:620px;margin:0 auto}
        .oq-cell{position:relative;aspect-ratio:1;min-width:0;border:1px solid rgba(148,163,184,.22);border-radius:10px;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012));color:var(--text);cursor:pointer;font-family:var(--mono);transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease,background .14s ease;overflow:visible;isolation:isolate;padding:0}
        .oq-cell:hover,.oq-cell:focus-visible{transform:translateY(-2px);border-color:rgba(34,211,238,.55);box-shadow:0 0 18px rgba(34,211,238,.13);outline:none;z-index:20}
        .oq-cell.recommended{border-color:var(--yellow);box-shadow:0 0 0 1px rgba(245,197,24,.35),0 0 24px rgba(245,197,24,.23);animation:oqRecommend 1.8s ease-in-out infinite}
        .oq-cell.recommended::after{content:"◎";position:absolute;top:5px;right:6px;color:var(--yellow);font:900 13px var(--mono);z-index:4}
        @keyframes oqRecommend{0%,100%{box-shadow:0 0 0 1px rgba(245,197,24,.28),0 0 16px rgba(245,197,24,.14)}50%{box-shadow:0 0 0 1px rgba(245,197,24,.5),0 0 29px rgba(245,197,24,.29)}}
        .oq-cell-number{position:absolute;left:6px;bottom:5px;font-size:10px;font-weight:800;color:var(--muted);z-index:3}
        .oq-cell-symbol{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:27px;font-weight:800;line-height:1;text-shadow:0 0 10px currentColor;pointer-events:none}
        .oq-cell-name{position:absolute;left:8px;right:8px;top:calc(50% + 20px);font-size:9px;font-weight:700;letter-spacing:.2px;color:var(--muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
        .oq-cell-prob{position:absolute;right:6px;bottom:5px;font-size:10px;font-weight:800;color:#c89cff;z-index:3}
        .oq-cell.red-candidate:not(.observed){border-color:rgba(240,68,85,.62);box-shadow:inset 0 0 0 1px rgba(240,68,85,.10)}
        .oq-cell.red-candidate:not(.observed)::before{content:"R?";position:absolute;right:6px;top:5px;font-size:10px;font-weight:900;color:#ff8793;z-index:3}
        .oq-cell.guaranteed{border-color:var(--purple);box-shadow:0 0 18px rgba(169,107,255,.12)}
        .oq-cell.guaranteed::before{content:"100% P";position:absolute;left:6px;top:5px;font-size:9px;font-weight:800;color:#e0caff;z-index:3}
        .oq-cell.impossible-purple .oq-cell-prob{color:#677086}
        .oq-cell.observed .oq-cell-name{color:currentColor}
        .oq-cell[data-symbol="P"]{background:radial-gradient(circle at 50% 40%,rgba(169,107,255,.40),rgba(112,67,180,.12) 65%,rgba(8,10,18,.7));border-color:rgba(169,107,255,.75);color:#cba7ff}
        .oq-cell[data-symbol="B"]{background:radial-gradient(circle at 50% 40%,rgba(102,135,255,.34),rgba(51,85,204,.11) 65%,rgba(8,10,18,.7));border-color:rgba(102,135,255,.65);color:#76a2ff}
        .oq-cell[data-symbol="T"]{background:radial-gradient(circle at 50% 40%,rgba(46,215,208,.34),rgba(42,157,157,.10) 65%,rgba(8,10,18,.7));border-color:rgba(46,215,208,.66);color:#74edf1}
        .oq-cell[data-symbol="G"]{background:radial-gradient(circle at 50% 40%,rgba(69,223,135,.33),rgba(58,156,58,.10) 65%,rgba(8,10,18,.7));border-color:rgba(69,223,135,.63);color:#86efa9}
        .oq-cell[data-symbol="Y"]{background:radial-gradient(circle at 50% 40%,rgba(255,216,74,.34),rgba(201,168,0,.10) 65%,rgba(8,10,18,.7));border-color:rgba(255,216,74,.65);color:#ffe36d}
        .oq-cell[data-symbol="O"]{background:radial-gradient(circle at 50% 40%,rgba(255,140,50,.38),rgba(232,119,34,.11) 65%,rgba(8,10,18,.7));border-color:rgba(255,140,50,.68);color:#ffad6d}
        .oq-cell[data-symbol="R"]{background:radial-gradient(circle at 50% 40%,rgba(255,73,103,.40),rgba(204,51,51,.12) 65%,rgba(8,10,18,.7));border-color:rgba(255,73,103,.75);color:#ff8793}
        .oq-hint{text-align:center;margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.5}

        /* ===== Recomendação / detalhes ===== */
        .oq-recommendation{min-height:104px;padding:14px;border:1px solid rgba(245,197,24,.25);border-radius:9px;background:linear-gradient(145deg,rgba(245,197,24,.075),rgba(245,197,24,.02))}
        .oq-rec-main{display:flex;align-items:center;gap:11px;margin-bottom:10px}
        .oq-rec-cell{width:58px;height:58px;border-radius:9px;border:1px solid var(--yellow);display:grid;place-items:center;color:var(--yellow);font-size:28px;font-weight:800;background:rgba(245,197,24,.07);box-shadow:0 0 16px rgba(245,197,24,.14)}
        .oq-rec-copy h3{margin:0 0 4px;font-size:15px}.oq-rec-copy p{margin:0;font-size:12px;color:var(--muted)}
        .oq-rec-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
        .oq-rec-metric{border-top:1px solid rgba(245,197,24,.14);padding-top:7px}
        .oq-rec-metric span{display:block;font-size:9px;color:var(--muted);text-transform:uppercase}
        .oq-rec-metric strong{display:block;margin-top:3px;font-size:12px;color:var(--text)}
        .oq-rec-reason{margin-top:10px;padding:9px;border-left:2px solid var(--purple);background:rgba(169,107,255,.055);font-size:12px;line-height:1.55;color:#c9d0df}
        .oq-calc-status{min-height:20px;display:flex;align-items:center;gap:7px;color:var(--muted);font-size:11px;margin-bottom:8px}.oq-calc-status.active{color:#c8a7ff}
        .oq-cell-detail{font-size:12px;line-height:1.55;color:#b7c0d2}
        .oq-detail-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.oq-detail-head strong{font-size:14px;color:var(--text)}
        .oq-detail-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
        .oq-detail-row{display:flex;justify-content:space-between;gap:7px;border:1px solid var(--border-soft);border-radius:7px;padding:7px 8px;font-size:10px;font-weight:700}
        .oq-detail-footer{margin-top:9px;font-size:10px;color:#9ca6ba}

        /* ===== Legenda — mesmo padrão do $OC ===== */
        .oq-legend-panel{margin-top:16px}
        .oq-legend{display:grid;gap:6px}
        .oq-legend-item{display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:8px;font-size:11px;color:var(--muted)}
        .oq-legend-item strong{color:var(--text)}
        .oq-legend-symbol{width:23px;height:23px;display:grid;place-items:center;border:1px solid currentColor;border-radius:6px;font-weight:800;font-size:11px}
        .oq-result-purple{color:#cba7ff!important}.oq-result-blue{color:#76a2ff!important}.oq-result-cyan{color:#74edf1!important}.oq-result-green{color:#86efa9!important}.oq-result-yellow{color:#ffe36d!important}.oq-result-orange{color:#ffad6d!important}.oq-result-red{color:#ff8793!important}

        /* ===== Explicação matemática ===== */
        .oq-math-panel{margin-top:16px}
        .oq-math-panel summary{cursor:pointer;color:var(--cyan);font-size:13px;font-weight:800;letter-spacing:.5px;list-style:none;display:flex;align-items:center;gap:8px}
        .oq-math-panel summary::-webkit-details-marker{display:none}
        .oq-math-content{margin-top:16px;color:var(--muted);font-family:var(--sans);font-size:14px;line-height:1.7}
        .oq-math-content h3{color:var(--text);font-size:13px;margin:18px 0 6px}
        .oq-math-content pre{white-space:pre-wrap;padding:12px;border:1px solid var(--border);background:rgba(0,0,0,.22);border-radius:7px;color:#c9d5eb;font-size:12px;line-height:1.6}

        /* ===== Modal / paleta ===== */
        .oq-modal-overlay{position:fixed;inset:0;z-index:1200;background:rgba(3,6,12,.78);backdrop-filter:blur(5px);display:grid;place-items:center;padding:18px}
        .oq-modal-overlay[hidden]{display:none!important}
        .oq-modal{width:min(590px,100%);max-height:min(86vh,760px);overflow:auto;border:1px solid rgba(169,107,255,.46);border-radius:12px;background:linear-gradient(160deg,#171c28,#0d111a 72%);box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 28px rgba(169,107,255,.12);padding:17px}
        .oq-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:13px}.oq-modal-head h2{margin:0 0 4px;font-size:19px}.oq-modal-head p{margin:0;font-size:12px;color:var(--muted)}
        .oq-modal-close{width:34px;height:34px;border-radius:7px;border:1px solid rgba(240,68,85,.4);background:rgba(240,68,85,.07);color:#ff8793;cursor:pointer;font-size:18px}
        .oq-modal-close:hover,.oq-modal-close:focus-visible{border-color:#f04455;box-shadow:0 0 12px rgba(240,68,85,.18);outline:none}
        .oq-palette{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .oq-palette-btn{min-height:56px;border-radius:9px;border:1px solid var(--border);background:#111722;display:flex;align-items:center;gap:10px;padding:9px 11px;color:var(--text);cursor:pointer;text-align:left}
        .oq-palette-btn .sym{width:34px;height:34px;border:1px solid currentColor;border-radius:7px;display:grid;place-items:center;font-size:14px;font-weight:900}
        .oq-palette-btn .copy{display:flex;flex-direction:column;gap:3px}.oq-palette-btn .copy strong{font-size:11px}.oq-palette-btn .copy span{font-size:10px;color:currentColor;opacity:.78}
        .oq-palette-btn:hover,.oq-palette-btn:focus-visible{box-shadow:0 0 13px color-mix(in srgb,currentColor 22%,transparent);outline:none}.oq-palette-btn:disabled{opacity:.25;cursor:not-allowed;box-shadow:none}.oq-palette-unknown{color:#aab3c5}
        .oq-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:13px}.oq-modal-note{font-size:12px;line-height:1.55;color:#aab3c5}.oq-modal-error{margin-top:8px;color:#ff8793;font-size:11px;font-weight:700}

        @media(max-width:1050px){.oq-status-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.oq-layout{grid-template-columns:1fr}.oq-side-column{grid-template-columns:repeat(2,minmax(0,1fr))}.oq-board{max-width:620px}}
        @media(max-width:720px){.oq-head{gap:10px}.oq-head-actions{justify-content:flex-start}.oq-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.oq-mode-row{grid-template-columns:1fr}.oq-side-column{grid-template-columns:1fr}.oq-board{gap:5px}.oq-cell{border-radius:7px}.oq-cell-symbol{font-size:22px}.oq-cell-number,.oq-cell-prob{font-size:9px}.oq-cell-name{font-size:8px;top:calc(50% + 17px)}.oq-toolbar .pill{flex:1 1 calc(50% - 8px)}.oq-palette{grid-template-columns:1fr}.oq-rec-grid{grid-template-columns:1fr}}
        @media(max-width:420px){.oq-cell-name{display:none}.oq-cell-symbol{font-size:20px}.oq-stat-value{font-size:12px}.oq-head-actions{width:100%}.oq-head-actions>.pill{width:100%}}
        @media(prefers-reduced-motion:reduce){.oq-loader,.oq-cell.recommended{animation:none!important}.oq-cell,.oq-mode-btn{transition:none!important}}
    `;

    /* ========================================================
       APLICAÇÃO / RENDERER
       ======================================================== */
    class OQApp {
        constructor() {
            this.engine = null;
            this.state = new OQStateManager();
            this.analysis = null;
            this.recommendation = null;
            this.initialized = false;
            this.initializing = false;
            this.showProbabilities = true;
            this.calculationToken = 0;
            this.selectedCell = null;
            this.modalMode = null;
            this.bindElements();
            this.bindEvents();
            this.renderSkeleton();
        }

        bindElements() {
            const byId = id => document.getElementById(id);
            this.el = {
                screen: byId("orbeOqScreen"), back: byId("oqBackToHub"), how: byId("oqHowBtn"), diagnostic: byId("oqDiagnostic"),
                status: byId("oqStatus"), board: byId("oqBoard"), boardHint: byId("oqBoardHint"), undo: byId("oqUndoBtn"), redo: byId("oqRedoBtn"),
                reset: byId("oqResetBtn"), prob: byId("oqProbBtn"),
                calc: byId("oqCalcStatus"), recommendation: byId("oqRecommendation"), detail: byId("oqCellDetail"), math: byId("oqMathPanel"),
                modal: byId("oqModal"), modalTitle: byId("oqModalTitle"), modalSubtitle: byId("oqModalSubtitle"), modalBody: byId("oqModalBody"), modalActions: byId("oqModalActions"), modalClose: byId("oqModalClose")
            };
            this.modeButtons = [...document.querySelectorAll("[data-oq-mode]")];
        }

        bindEvents() {
            this.el.back.addEventListener("click", () => globalThis.OrbeSolver?.showHub?.());
            this.el.how.addEventListener("click", () => {
                this.el.math.open = true;
                this.el.math.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
            });
            this.modeButtons.forEach(button => button.addEventListener("click", () => this.switchMode(button.dataset.oqMode)));
            this.el.board.addEventListener("click", event => {
                const cellButton = event.target.closest(".oq-cell");
                if (!cellButton) return;
                this.openPalette(Number(cellButton.dataset.cell));
            });
            this.el.board.addEventListener("mouseover", event => {
                const cellButton = event.target.closest(".oq-cell");
                if (cellButton) this.renderCellDetail(Number(cellButton.dataset.cell));
            });
            this.el.board.addEventListener("focusin", event => {
                const cellButton = event.target.closest(".oq-cell");
                if (cellButton) this.renderCellDetail(Number(cellButton.dataset.cell));
            });
            this.el.undo.addEventListener("click", () => { if (this.state.undo()) this.refresh("undo"); });
            this.el.redo.addEventListener("click", () => { if (this.state.redo()) this.refresh("redo"); });
            this.el.reset.addEventListener("click", () => this.requestReset());
            this.el.prob.addEventListener("click", () => { this.showProbabilities = !this.showProbabilities; this.el.prob.classList.toggle("active", this.showProbabilities); this.renderBoard(); });
            this.el.modalClose.addEventListener("click", () => this.closeModal());
            this.el.modal.addEventListener("click", event => { if (event.target === this.el.modal) this.closeModal(); });
            document.addEventListener("keydown", event => { if (event.key === "Escape" && !this.el.modal.hidden) this.closeModal(); });
        }

        renderSkeleton() {
            this.el.board.innerHTML = Array.from({ length: CELL_COUNT }, (_, cell) => `
                <button type="button" class="oq-cell" data-cell="${cell}" role="gridcell" aria-label="Casa ${cell + 1}, desconhecida">
                    <span class="oq-cell-number">${cell + 1}</span>
                    <span class="oq-cell-symbol">?</span>
                    <span class="oq-cell-name">DESCONHECIDA</span>
                    <span class="oq-cell-prob">P: —</span>
                </button>`).join("");
            this.el.recommendation.innerHTML = `<div class="oq-rec-reason">Inicialize o solver para receber uma recomendação.</div>`;
        }

        async ensureInitialized() {
            if (this.initialized || this.initializing) return;
            this.initializing = true;
            this.el.diagnostic.className = "oq-diagnostic";
            this.el.diagnostic.innerHTML = `<span class="oq-loader"></span> Gerando localmente as 12.650 combinações de quatro roxas...`;
            await new Promise(resolve => setTimeout(resolve, 0));
            const started = performance.now();
            this.engine = createEngine();
            const generationMs = performance.now() - started;
            const tests = runSelfTests({ engine: this.engine, log: true });
            if (!tests.passed) {
                this.el.diagnostic.className = "oq-diagnostic error";
                this.el.diagnostic.textContent = `Falha nos testes do OQ: ${tests.failures.join(" · ")}`;
            } else {
                this.el.diagnostic.className = "oq-diagnostic ok";
                this.el.diagnostic.textContent = `${this.engine.count.toLocaleString("pt-BR")} mundos gerados e validados localmente em ${formatNumber(generationMs, 1)} ms.`;
            }
            this.initialized = true;
            this.initializing = false;
            this.refresh("init");
        }

        async activate() {
            const hub = document.getElementById("orbeHub");
            const oc = document.getElementById("orbeOcScreen");
            if (hub) hub.hidden = true;
            if (oc) oc.hidden = true;
            this.el.screen.hidden = false;
            await this.ensureInitialized();
            if (this.initialized) this.renderAll();
        }

        deactivate() {
            this.calculationToken += 1;
            this.closeModal(false);
            this.el.screen.hidden = true;
        }

        switchMode(mode) {
            if (!this.initialized) return;
            const normalized = mode === "EV" ? "EV" : "WR";
            if (!this.state.setMode(normalized)) return;
            this.modeButtons.forEach(button => button.classList.toggle("active", button.dataset.oqMode === normalized));
            this.refresh("mode");
        }

        refresh(reason = "state") {
            if (!this.initialized) return;
            this.calculationToken += 1;
            const previousWorlds = reason === "observation" && this.analysis && !this.analysis.impossible ? this.analysis.validWorlds : null;
            this.analysis = analyzeState(this.engine, this.state.observations, previousWorlds);
            this.recommendation = null;
            this.renderAll();
            this.requestRecommendation();
        }

        requestRecommendation() {
            const token = ++this.calculationToken;
            if (!this.analysis || this.analysis.impossible) {
                this.el.calc.textContent = "";
                this.recommendation = getRecommendedMove(this.engine, this.analysis, this.state.observations, this.state.mode);
                this.renderRecommendation();
                return;
            }
            const mayExact = this.analysis.phase === "PROCURANDO" && !isInitialState(this.state.observations) && this.analysis.validWorlds.length <= EXACT_WORLD_LIMIT;
            this.el.calc.className = `oq-calc-status${mayExact ? " active" : ""}`;
            this.el.calc.innerHTML = mayExact ? `<span class="oq-loader"></span> Calculando estratégia exata em estado reduzido...` : "";
            setTimeout(() => {
                if (token !== this.calculationToken) return;
                const started = performance.now();
                this.recommendation = getRecommendedMove(this.engine, this.analysis, this.state.observations, this.state.mode);
                if (token !== this.calculationToken) return;
                const elapsed = performance.now() - started;
                if (this.recommendation && this.recommendation.calculationMs == null) this.recommendation.calculationMs = elapsed;
                this.el.calc.className = "oq-calc-status";
                this.el.calc.textContent = "";
                this.renderRecommendation();
                this.renderStatus();
                this.renderBoard();
            }, 0);
        }

        renderAll() {
            this.modeButtons.forEach(button => button.classList.toggle("active", button.dataset.oqMode === this.state.mode));
            this.renderStatus();
            this.renderBoard();
            this.renderRecommendation();
            this.renderCellDetail(this.selectedCell ?? 0);
            this.el.undo.disabled = this.state.undoStack.length === 0;
            this.el.redo.disabled = this.state.redoStack.length === 0;
            this.el.boardHint.textContent = this.getBoardHint();
        }

        getBoardHint() {
            if (!this.analysis) return "Inicializando...";
            if (this.analysis.impossible) return "Estado impossível ou entrada incorreta. Desfaça ou edite uma observação.";
            if (this.analysis.phase === "VERMELHA DISPONÍVEL") return this.analysis.remainingTargetCandidates.length === 1
                ? `A quarta posição-alvo foi deduzida: casa ${humanCell(this.analysis.remainingTargetCandidates[0])}. Marque-a como vermelha.`
                : "A quarta roxa virou vermelha. Marque a posição vermelha mostrada pelo Discord.";
            if (this.analysis.phase === "COLETA DE PONTOS") return "As quatro posições-alvo são conhecidas. O solver agora prioriza as melhores recompensas restantes.";
            if (this.analysis.phase === "DERROTA") return "Os sete cliques pagos foram consumidos antes de encontrar três roxas.";
            if (this.analysis.phase === "FINALIZADO") return "Partida finalizada.";
            return "Clique em uma casa e informe a cor/esfera revelada pelo Mudae.";
        }

        renderStatus() {
            if (!this.analysis) return;
            const rec = this.recommendation;
            const wrValue = rec?.exactWinRate != null ? formatPct(rec.exactWinRate) : rec?.referenceWinRate != null ? `${formatPct(rec.referenceWinRate)} ref.` : "—";
            const evValue = rec?.exactEV != null ? `${formatNumber(rec.exactEV, 1)} pts` : rec?.referenceEV != null ? `${formatNumber(rec.referenceEV, 1)} ref.` : "—";
            const calcType = rec?.strategy || (this.analysis.impossible ? "Sem cálculo" : "Calculando...");
            const cards = [
                ["CLIQUES RESTANTES", `${this.analysis.paidRemaining} / 7`, "gold", `pagos usados: ${this.analysis.q}`],
                ["ROXAS ENCONTRADAS", `${Math.min(this.analysis.t, 3)} / 3`, "purple", "roxas não gastam clique"],
                ["MUNDOS POSSÍVEIS", this.analysis.worldCount.toLocaleString("pt-BR"), "", this.analysis.impossible ? "estado impossível" : "de 12.650"],
                ["CHANCE DE VITÓRIA", wrValue, "green", rec?.referenceWinRate != null ? "referência histórica" : rec?.exactWinRate != null ? "DP exata" : "não estimada"],
                ["PONTOS ESPERADOS", evValue, "gold", rec?.referenceEV != null ? "referência histórica" : rec?.exactEV != null ? "DP exata" : `recebidos: ${this.analysis.pointsReceived}`],
                ["FASE ATUAL", this.analysis.phase, "purple", this.state.mode === "WR" ? "modo WR" : "modo EV"],
                ["TIPO DE CÁLCULO", calcType, "", rec?.states ? `${rec.states.toLocaleString("pt-BR")} estados` : rec?.calculationMs != null ? `${formatNumber(rec.calculationMs, 1)} ms` : ""]
            ];
            this.el.status.innerHTML = cards.map(([label, value, cls, sub]) => `<div class="oq-stat-card"><span class="oq-stat-label">${label}</span><span class="oq-stat-value ${cls}">${escapeHtml(value)}</span><span class="oq-stat-sub">${escapeHtml(sub)}</span></div>`).join("");
        }

        renderBoard() {
            if (!this.analysis) return;
            const recommended = this.recommendation?.cell ?? -1;
            const redCandidateSet = this.analysis.phase === "VERMELHA DISPONÍVEL" ? new Set(this.analysis.remainingTargetCandidates) : null;
            const cells = [...this.el.board.querySelectorAll(".oq-cell")];
            cells.forEach((button, cell) => {
                const observation = this.state.observations[cell];
                const p = this.analysis.purpleProbabilities[cell] || 0;
                const entropy = this.analysis.entropies[cell] || 0;
                const dist = this.analysis.distributions[cell]?.probabilities || new Float64Array(6);
                const meta = observation ? RESULT_META[observation] : null;
                button.className = "oq-cell";
                button.dataset.symbol = observation || "";
                if (observation) button.classList.add("observed");
                if (recommended === cell) button.classList.add("recommended");
                if (!observation && p >= 0.9999) button.classList.add("guaranteed");
                if (!observation && p <= EPS) button.classList.add("impossible-purple");
                if (redCandidateSet?.has(cell)) button.classList.add("red-candidate");
                button.querySelector(".oq-cell-symbol").textContent = observation || "?";
                button.querySelector(".oq-cell-name").textContent = meta ? meta.name.toUpperCase() : redCandidateSet?.has(cell) ? "CANDIDATA VERMELHA" : "DESCONHECIDA";
                button.querySelector(".oq-cell-prob").textContent = this.showProbabilities ? `P: ${formatPct(p)}` : "";
                const aria = observation
                    ? `Casa ${cell + 1}, ${resultLabel(observation)}, clique para editar o resultado.`
                    : `Casa ${cell + 1}, chance de roxa ${formatPct(p)}, entropia ${formatNumber(entropy, 3)} bits${recommended === cell ? ", recomendação atual" : ""}.`;
                button.setAttribute("aria-label", aria);
                button.title = `${aria}\nP: ${formatPct(dist[5])} · Azul: ${formatPct(dist[0])} · Ciano: ${formatPct(dist[1])} · Verde: ${formatPct(dist[2])} · Amarela: ${formatPct(dist[3])} · Laranja: ${formatPct(dist[4])}`;
            });
        }

        renderRecommendation() {
            const rec = this.recommendation;
            if (!rec) {
                this.el.recommendation.innerHTML = `<div class="oq-rec-reason">Calculando recomendação...</div>`;
                return;
            }
            if (rec.cell == null || rec.cell < 0) {
                this.el.recommendation.innerHTML = `<div class="oq-rec-reason">${escapeHtml(rec.reason)}</div><div class="oq-rec-grid"><div class="oq-rec-metric"><span>ESTRATÉGIA</span><strong>${escapeHtml(rec.strategy)}</strong></div><div class="oq-rec-metric"><span>MODO</span><strong>${this.state.mode}</strong></div></div>`;
                return;
            }
            const p = rec.purpleProbability ?? this.analysis?.purpleProbabilities[rec.cell] ?? 0;
            const entropy = rec.entropy ?? this.analysis?.entropies[rec.cell] ?? 0;
            const known = rec.knownSymbol ? `${resultLabel(rec.knownSymbol)} · ${ORB_VALUES[rec.knownSymbol]} pts` : rec.redDeduced ? "Vermelha · 150 pts" : "Resultado ainda desconhecido";
            const extraMetric = rec.exactWinRate != null
                ? ["CHANCE EXATA", formatPct(rec.exactWinRate)]
                : rec.exactEV != null
                    ? ["EV EXATO", `${formatNumber(rec.exactEV, 2)} pts`]
                    : rec.referenceWinRate != null
                        ? ["WR HISTÓRICA", `${formatPct(rec.referenceWinRate)} ref.`]
                        : ["CUSTO SE ROXA", "GRÁTIS"];
            this.el.recommendation.innerHTML = `
                <div class="oq-rec-main"><div class="oq-rec-cell">${rec.cell + 1}</div><div class="oq-rec-copy"><h3>Melhor jogada: casa ${rec.cell + 1}</h3><p>${escapeHtml(known)}</p></div></div>
                <div class="oq-rec-grid">
                    <div class="oq-rec-metric"><span>PROB. DE ROXA</span><strong>${formatPct(p)}</strong></div>
                    <div class="oq-rec-metric"><span>ENTROPIA</span><strong>${formatNumber(entropy, 3)} bits</strong></div>
                    <div class="oq-rec-metric"><span>${extraMetric[0]}</span><strong>${extraMetric[1]}</strong></div>
                    <div class="oq-rec-metric"><span>ESTRATÉGIA</span><strong>${escapeHtml(rec.strategy)}</strong></div>
                </div>
                <div class="oq-rec-reason"><strong>Motivo:</strong> ${escapeHtml(rec.reason)}${rec.historicalReference ? "<br><small>Os números de WR/EV exibidos como ‘ref.’ são estatísticas históricas fornecidas na especificação, não resultados inventados pela heurística.</small>" : ""}</div>`;
        }

        renderCellDetail(cell) {
            if (!this.analysis || cell == null || cell < 0 || cell >= CELL_COUNT) return;
            this.selectedCell = cell;
            const observation = this.state.observations[cell];
            const dist = this.analysis.distributions[cell]?.probabilities || new Float64Array(6);
            const entropy = this.analysis.entropies[cell] || 0;
            const rows = [
                ["Roxa", dist[5], "purple"], ["Azul · 0", dist[0], "blue"], ["Ciano · 1", dist[1], "cyan"],
                ["Verde · 2", dist[2], "green"], ["Amarela · 3", dist[3], "yellow"], ["Laranja · 4", dist[4], "orange"]
            ];
            this.el.detail.innerHTML = `
                <div class="oq-detail-head"><strong>Casa ${cell + 1}</strong><span>${observation ? resultLabel(observation) : "Desconhecida"}</span></div>
                <div class="oq-detail-list">${rows.map(([name, p, cls]) => `<div class="oq-detail-row oq-result-${cls}"><span>${name}</span><strong>${formatPct(p)}</strong></div>`).join("")}</div>
                <div class="oq-detail-footer">Entropia: ${formatNumber(entropy, 3)} bits · Mundos válidos: ${this.analysis.worldCount.toLocaleString("pt-BR")}</div>`;
        }

        openPalette(cell) {
            if (!this.initialized || !this.analysis) return;
            const current = this.state.observations[cell];
            if (!current && (this.analysis.phase === "DERROTA" || this.analysis.phase === "FINALIZADO" || this.analysis.impossible)) return;
            this.selectedCell = cell;
            this.modalMode = "palette";
            this.el.modalTitle.textContent = current ? `Editar casa ${cell + 1}` : `Resultado da casa ${cell + 1}`;
            this.el.modalSubtitle.textContent = current ? "Escolha explicitamente o novo resultado ou volte para Desconhecida." : "Selecione o resultado mostrado pelo Mudae.";
            const dist = this.analysis.distributions[cell]?.probabilities || new Float64Array(6);
            const qAtLimit = this.analysis.q >= MAX_PAID_CLICKS;
            const phase = this.analysis.phase;
            const buttons = [];
            buttons.push(`<button type="button" class="oq-palette-btn oq-palette-unknown" data-result="?" ${current ? "" : "disabled"}><span class="sym">?</span><span class="copy"><strong>DESCONHECIDA</strong><span>remover resultado</span></span></button>`);
            for (const symbol of PALETTE_ORDER) {
                const meta = RESULT_META[symbol];
                let possible = false;
                let probability = 0;
                if (symbol === SYMBOL.PURPLE) {
                    probability = dist[5];
                    possible = probability > EPS && phase === "PROCURANDO" && !qAtLimit;
                } else if (symbol === SYMBOL.RED) {
                    probability = dist[5];
                    possible = probability > EPS && (phase === "VERMELHA DISPONÍVEL" || current === SYMBOL.RED) && this.analysis.q < MAX_PAID_CLICKS;
                } else {
                    probability = dist[meta.clue];
                    possible = probability > EPS && !qAtLimit && phase !== "VERMELHA DISPONÍVEL";
                    if (phase === "COLETA DE PONTOS") possible = probability > EPS && !qAtLimit;
                }
                if (current === symbol) possible = true;
                buttons.push(`<button type="button" class="oq-palette-btn oq-result-${meta.css}" data-result="${symbol}" ${possible ? "" : "disabled"}><span class="sym">${symbol}</span><span class="copy"><strong>${resultLabel(symbol).toUpperCase()}</strong><span>${symbol === SYMBOL.RED ? "alvo final · " : symbol === SYMBOL.PURPLE ? "clique gratuito · " : ""}${formatPct(probability)} · ${ORB_VALUES[symbol]} pts</span></span></button>`);
            }
            this.el.modalBody.innerHTML = `<div class="oq-palette">${buttons.join("")}</div>`;
            this.el.modalActions.innerHTML = "";
            this.el.modalBody.querySelectorAll("[data-result]").forEach(button => button.addEventListener("click", () => {
                const result = button.dataset.result;
                this.applyObservation(cell, result === SYMBOL.UNKNOWN ? null : result);
            }));
            this.showModal();
        }

        applyObservation(cell, symbol) {
            const normalized = normalizeObservation(symbol);
            if (!this.state.setObservation(cell, normalized)) { this.closeModal(); return; }
            const semantic = validateGameState(this.state.observations);
            const nextAnalysis = semantic.valid ? analyzeState(this.engine, this.state.observations) : { impossible: true };
            if (!semantic.valid || nextAnalysis.impossible) {
                this.state.undo();
                this.el.modalSubtitle.textContent = semantic.valid ? "Estado impossível ou entrada incorreta." : semantic.message;
                const error = document.createElement("div");
                error.className = "oq-modal-error";
                error.textContent = "Esse resultado elimina todos os 12.650 mundos possíveis. Confira a casa/cor informada.";
                this.el.modalBody.prepend(error);
                return;
            }
            this.closeModal();
            this.refresh("observation");
        }

        async requestReset() {
            if (!this.state.observations.some(Boolean)) return;
            this.modalMode = "confirm-reset";
            this.el.modalTitle.textContent = "Limpar tabuleiro?";
            this.el.modalSubtitle.textContent = "Há resultados preenchidos. Esta ação pode ser desfeita depois.";
            this.el.modalBody.innerHTML = `<p class="oq-modal-note">Todos os resultados atuais serão removidos e o solver voltará ao estado inicial.</p>`;
            this.el.modalActions.innerHTML = `<button type="button" class="pill purple" data-action="cancel">CANCELAR</button><button type="button" class="pill red" data-action="confirm">LIMPAR TABULEIRO</button>`;
            this.el.modalActions.querySelector('[data-action="cancel"]').addEventListener("click", () => this.closeModal());
            this.el.modalActions.querySelector('[data-action="confirm"]').addEventListener("click", () => { this.state.reset(); this.closeModal(); this.refresh("reset"); });
            this.showModal();
        }

        showModal() {
            this.el.modal.hidden = false;
            requestAnimationFrame(() => this.el.modal.querySelector("button:not(:disabled),textarea")?.focus());
        }

        closeModal(returnFocus = true) {
            if (this.el.modal.hidden) return;
            this.el.modal.hidden = true;
            this.modalMode = null;
            if (returnFocus && this.selectedCell != null) this.el.board.querySelector(`[data-cell="${this.selectedCell}"]`)?.focus();
        }
    }

    /* ========================================================
       TESTES DE REGRESSÃO DO OQ
       ======================================================== */
    function runSelfTests({ engine = null, log = true } = {}) {
        const localEngine = engine || createEngine();
        const failures = [];
        const tests = [];
        const test = (name, condition, detail = "") => {
            tests.push({ name, passed: Boolean(condition), detail });
            if (!condition) failures.push(`${name}${detail ? ` (${detail})` : ""}`);
        };
        const empty = new Array(CELL_COUNT).fill(null);
        const initial = analyzeState(localEngine, empty);

        test("1. Existem exatamente 12.650 mundos", localEngine.count === EXPECTED_WORLD_COUNT, String(localEngine.count));
        test("2. Cada mundo contém exatamente quatro roxas", [...localEngine.masks].every(mask => popcount32(mask) === 4));
        test("3. Não existem mundos duplicados", new Set([...localEngine.masks]).size === EXPECTED_WORLD_COUNT);
        test("4. Vizinhança de Moore possui 3/5/8 vizinhos em canto/borda/interior", NEIGHBORS.lists[0].length === 3 && NEIGHBORS.lists[2].length === 5 && NEIGHBORS.lists[12].length === 8);
        test("5. P(roxa) inicial em toda casa = 16%", [...initial.purpleProbabilities].every(p => Math.abs(p - 4/25) < 1e-12));
        test("4. Estado inicial possui 7 cliques pagos", initial.paidRemaining === 7 && initial.q === 0);
        test("5. Estado inicial possui 0/3 roxas", initial.t === 0);

        const clueChecks = [SYMBOL.BLUE, SYMBOL.CYAN, SYMBOL.GREEN, SYMBOL.YELLOW];
        for (const symbol of clueChecks) {
            const obs = empty.slice(); obs[12] = symbol;
            const analysis = analyzeState(localEngine, obs);
            const expected = SYMBOL_TO_CLUE[symbol];
            test(`Pista ${symbol} aceita exatamente ${expected} roxas vizinhas`, analysis.worldCount > 0 && [...analysis.validWorlds].every(w => localEngine.outcomes[w*CELL_COUNT+12] === expected));
        }
        const cornerOrange = empty.slice(); cornerOrange[0] = SYMBOL.ORANGE;
        test("6. Um canto nunca pode revelar laranja", analyzeState(localEngine, cornerOrange).impossible);

        const purpleObs = empty.slice(); purpleObs[0] = SYMBOL.PURPLE;
        test("7. Marcar roxa não reduz cliques restantes", analyzeState(localEngine, purpleObs).paidRemaining === 7);
        const clueObs = empty.slice(); clueObs[12] = SYMBOL.BLUE;
        test("8. Marcar pista numérica reduz um clique", analyzeState(localEngine, clueObs).paidRemaining === 6);
        const redObs = empty.slice(); redObs[0] = SYMBOL.RED;
        test("9. Marcar vermelha reduz um clique", analyzeState(localEngine, redObs).paidRemaining === 6);

        const threePurple = empty.slice(); threePurple[0] = SYMBOL.PURPLE; threePurple[1] = SYMBOL.PURPLE; threePurple[2] = SYMBOL.PURPLE;
        test("10. Três roxas mudam a fase para Vermelha disponível", analyzeState(localEngine, threePurple).phase === "VERMELHA DISPONÍVEL");

        const sevenPaid = empty.slice();
        // Sete azuis em casas espaçadas podem ser incompatíveis; fase é testada diretamente pela contagem.
        [0,2,4,10,14,20,24].forEach(cell => sevenPaid[cell] = SYMBOL.BLUE);
        test("11. Sete cliques pagos com menos de 3 roxas geram derrota", calculatePhase(sevenPaid) === "DERROTA");
        test("12. Estado contraditório gera zero mundos", analyzeState(localEngine, cornerOrange).worldCount === 0);

        const manager = new OQStateManager();
        manager.setObservation(5, SYMBOL.CYAN);
        const beforeUndo = manager.snapshot();
        manager.setObservation(6, SYMBOL.PURPLE);
        const undoOk = manager.undo() && manager.observations[5] === beforeUndo.observations[5] && manager.observations[6] == null;
        const redoOk = manager.redo() && manager.observations[6] === SYMBOL.PURPLE;
        test("13. Desfazer restaura o estado anterior", undoOk);
        test("14. Refazer restaura o estado desfeito", redoOk);

        const wrOpen = getRecommendedMove(localEngine, initial, empty, "WR");
        const evOpen = getRecommendedMove(localEngine, initial, empty, "EV");
        test("15. Alternar WR/EV recalcula a abertura (8 no WR, 7 no EV)", wrOpen.cell === 7 && evOpen.cell === 6);

        const targetsKnown = empty.slice(); targetsKnown[0] = SYMBOL.PURPLE; targetsKnown[1] = SYMBOL.PURPLE; targetsKnown[2] = SYMBOL.PURPLE; targetsKnown[3] = SYMBOL.RED;
        const knownAnalysis = analyzeState(localEngine, targetsKnown);
        const deterministic = knownAnalysis.worldCount === 1 && calculateKnownClueValues(localEngine, knownAnalysis.validWorlds, targetsKnown).length > 0;
        test("16. Com quatro posições-alvo conhecidas, as demais cores são determinísticas", deterministic);

        let sumsOk = true;
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            const sum = initial.distributions[cell].probabilities.reduce((acc, p) => acc + p, 0);
            if (Math.abs(sum - 1) > 1e-12) sumsOk = false;
        }
        test("17. Probabilidades de cada casa somam aproximadamente 100%", sumsOk);

        const invalidRed = empty.slice(); invalidRed[0] = SYMBOL.RED;
        test("18. Vermelha antes da terceira roxa é rejeitada semanticamente", !validateGameState(invalidRed).valid);
        test("19. DP possui oito mapas de simetria válidos", SYMMETRY_MAPS.length === 8 && SYMMETRY_MAPS.every(map => new Set(map).size === 25));

        const passed = failures.length === 0;
        if (log && typeof console !== "undefined") {
            if (passed) console.info("Todos os testes do Ouro Quest foram aprovados.");
            else {
                console.error("Falhas nos testes do Ouro Quest:");
                failures.forEach(item => console.error(`- ${item}`));
            }
        }
        return { passed, tests, failures };
    }

    /* ========================================================
       MOUNT / API PÚBLICA
       ======================================================== */
    let appInstance = null;

    function injectModule() {
        if (typeof document === "undefined") return;
        if (!document.getElementById("oq-solver-style")) {
            const style = document.createElement("style");
            style.id = "oq-solver-style";
            style.textContent = MODULE_CSS;
            document.head.appendChild(style);
        }
        const orbeView = document.getElementById("view-orbe");
        if (orbeView && !document.getElementById("orbeOqScreen")) orbeView.insertAdjacentHTML("beforeend", MODULE_HTML);
        if (document.getElementById("orbeOqScreen") && !appInstance) appInstance = new OQApp();
    }

    const publicApi = {
        async activate() { injectModule(); await appInstance?.activate(); },
        deactivate() { appInstance?.deactivate(); },
        runSelfTests,
        generateWorlds,
        createEngine,
        analyzeState,
        calculateEntropy,
        calculatePaidClicks,
        calculatePhase,
        recommendHeuristicMove,
        getRecommendedMove,
        solveWinRate,
        solveExpectedValue,
        validateGameState,
        get app() { return appInstance; },
        constants: Object.freeze({ GRID_SIZE, CELL_COUNT, PURPLE_COUNT, MAX_PAID_CLICKS, EXPECTED_WORLD_COUNT, ORB_VALUES, POLICY_BOOKS })
    };

    globalThis.OrbeSolverOQ = publicApi;

    if (typeof document !== "undefined") {
        if (document.getElementById("view-orbe")) injectModule();
        else document.addEventListener("DOMContentLoaded", injectModule, { once: true });
    }
})();
