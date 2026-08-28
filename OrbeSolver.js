/* ============================================================
   ORBESOLVER — Hub de solvers + solver local do $oc (Ourochest)
   ------------------------------------------------------------
   Este módulo é autocontido: injeta seu próprio HTML e CSS,
   gera localmente os 16.800 tabuleiros válidos, calcula as
   probabilidades ponderadas, executa Bellman DP em Web Worker,
   oferece simulador, histórico, undo e testes matemáticos.

   Não utiliza API externa, CDN, banco de dados ou dependências.
   ============================================================ */
(() => {
    "use strict";

    /* ========================================================
       CONSTANTS
       ======================================================== */
    const GRID_SIZE = 5;
    const CELL_COUNT = 25;
    const CENTER_INDEX = 12; // (2,2) / L3C3
    const MAX_CLICKS = 5;
    const EXPECTED_BOARD_COUNT = 16800;
    const EPS = 1e-9;

    // Ordem interna otimizada para arrays numéricos.
    const COLOR_CODES = ["B", "T", "G", "Y", "O", "R"];
    const COLOR_INDEX = Object.freeze({ B: 0, T: 1, G: 2, Y: 3, O: 4, R: 5 });
    const UI_COLOR_ORDER = ["R", "O", "Y", "G", "T", "B"];

    const COLOR_META = Object.freeze({
        R: { name: "Vermelha", sp: 150, rgb: [204, 51, 51], icon: "R" },
        O: { name: "Laranja", sp: 90, rgb: [232, 119, 34], icon: "O" },
        Y: { name: "Amarela", sp: 55, rgb: [201, 168, 0], icon: "Y" },
        G: { name: "Verde", sp: 35, rgb: [58, 156, 58], icon: "G" },
        T: { name: "Ciana / Teal", sp: 20, rgb: [42, 157, 157], icon: "T" },
        B: { name: "Azul", sp: 10, rgb: [51, 85, 204], icon: "B" },
        X: { name: "Clique gasto / desconhecido", sp: 0, rgb: [90, 98, 120], icon: "X" }
    });

    const SP_BY_INDEX = new Float64Array([10, 20, 35, 55, 90, 150]);

    // Resultado Bellman exato certificado para o estado inicial.
    // O valor foi obtido pela recorrência completa de 5 cliques.
    const INITIAL_EXACT_POLICY = Object.freeze({
        action: 6, // L2C2 — desempate canônico entre as quatro posições simétricas
        evTotal: 344.7285879629685,
        evImmediate: 35.52083333333333,
        evFuture: 309.2077546296352,
        policy: "bellman",
        precomputed: true
    });

    // V(S,4) e ação ótima após clicar L2C2 no estado inicial.
    // A simetria D4 permite reutilizar os mesmos valores para
    // L2C4, L4C2 e L4C4, transformando apenas a posição recomendada.
    const FIRST_CLICK_EXACT_BRANCHES = Object.freeze({
        R: { action: 1, evTotal: 245.0 },
        O: { action: 7, evTotal: 302.57142857142856 },
        Y: { action: 2, evTotal: 336.9523809523809 },
        G: { action: 9, evTotal: 313.2647058823529 },
        T: { action: 0, evTotal: 300.8811475409836 },
        B: { action: 14, evTotal: 308.7555555555556 }
    });

    const INITIAL_SYMMETRIC_CELLS = new Set([6, 8, 16, 18]);

    /* ========================================================
       COMBINATORICS / COORDINATES
       ======================================================== */
    function toIndex(row, col) {
        return row * GRID_SIZE + col;
    }

    function toRowCol(index) {
        return [Math.floor(index / GRID_SIZE), index % GRID_SIZE];
    }

    function humanCoord(index) {
        const [row, col] = toRowCol(index);
        return `L${row + 1}C${col + 1}`;
    }

    function combinations(items, k) {
        const out = [];
        const buffer = new Array(k);
        function visit(start, depth) {
            if (depth === k) {
                out.push(buffer.slice());
                return;
            }
            const remaining = k - depth;
            for (let i = start; i <= items.length - remaining; i += 1) {
                buffer[depth] = items[i];
                visit(i + 1, depth + 1);
            }
        }
        visit(0, 0);
        return out;
    }

    function nearlyEqual(a, b, tolerance = EPS) {
        return Math.abs(a - b) <= tolerance;
    }

    function formatNumber(value, decimals = 1) {
        if (!Number.isFinite(value)) return "0";
        return value.toLocaleString("pt-BR", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function formatPercent(value, decimals = 2) {
        return `${formatNumber(value * 100, decimals)}%`;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    /* ========================================================
       BOARD GENERATOR
       ======================================================== */
    function classifyRedPosition(index) {
        const [row, col] = toRowCol(index);
        if ((row === 0 || row === 4) && (col === 0 || col === 4)) return "corner";
        if (row === 0 || row === 4 || col === 0 || col === 4) return "edge";
        return "interior";
    }

    function getRelationSets(redIndex) {
        const [rr, rc] = toRowCol(redIndex);
        const adjacent = [];
        const diagonal = [];
        const lineColumn = [];

        for (let index = 0; index < CELL_COUNT; index += 1) {
            if (index === redIndex) continue;
            const [row, col] = toRowCol(index);
            const dl = row - rr;
            const dc = col - rc;
            if (Math.abs(dl) + Math.abs(dc) === 1) adjacent.push(index);
            if (Math.abs(dl) === Math.abs(dc)) diagonal.push(index);
            if (dl === 0 || dc === 0) lineColumn.push(index);
        }
        return { adjacent, diagonal, lineColumn };
    }

    function isAlignedWithRed(index, redIndex) {
        const [row, col] = toRowCol(index);
        const [rr, rc] = toRowCol(redIndex);
        const dl = row - rr;
        const dc = col - rc;
        return dl === 0 || dc === 0 || Math.abs(dl) === Math.abs(dc);
    }

    function generateBoards() {
        const boardRows = [];
        const redPositions = [];
        const weights = [];
        const perRedCounts = new Map();

        for (let red = 0; red < CELL_COUNT; red += 1) {
            if (red === CENTER_INDEX) continue;

            const { adjacent, diagonal, lineColumn } = getRelationSets(red);
            const orangeChoices = combinations(adjacent, 2);
            const yellowChoices = combinations(diagonal, 3);
            let redCount = 0;

            for (const oranges of orangeChoices) {
                const orangeSet = new Set(oranges);
                const greenCandidates = lineColumn.filter(index => !orangeSet.has(index));
                const greenChoices = combinations(greenCandidates, 4);

                for (const yellows of yellowChoices) {
                    const yellowSet = new Set(yellows);
                    for (const greens of greenChoices) {
                        const greenSet = new Set(greens);
                        const board = new Uint8Array(CELL_COUNT);

                        for (let index = 0; index < CELL_COUNT; index += 1) {
                            let code;
                            if (index === red) code = COLOR_INDEX.R;
                            else if (orangeSet.has(index)) code = COLOR_INDEX.O;
                            else if (yellowSet.has(index)) code = COLOR_INDEX.Y;
                            else if (greenSet.has(index)) code = COLOR_INDEX.G;
                            else code = isAlignedWithRed(index, red) ? COLOR_INDEX.T : COLOR_INDEX.B;
                            board[index] = code;
                        }

                        boardRows.push(board);
                        redPositions.push(red);
                        redCount += 1;
                    }
                }
            }

            perRedCounts.set(red, redCount);
        }

        const count = boardRows.length;
        const data = new Uint8Array(count * CELL_COUNT);
        const reds = new Uint8Array(count);
        const weightArray = new Float64Array(count);

        for (let boardIndex = 0; boardIndex < count; boardIndex += 1) {
            data.set(boardRows[boardIndex], boardIndex * CELL_COUNT);
            const red = redPositions[boardIndex];
            reds[boardIndex] = red;
            weightArray[boardIndex] = 1 / (24 * perRedCounts.get(red));
        }

        const allIndices = new Uint16Array(count);
        for (let i = 0; i < count; i += 1) allIndices[i] = i;

        return {
            count,
            data,
            reds,
            weights: weightArray,
            allIndices,
            perRedCounts
        };
    }

    /* ========================================================
       BOARD VALIDATOR
       ======================================================== */
    function validateBoard(engine, boardIndex) {
        const offset = boardIndex * CELL_COUNT;
        const red = engine.reds[boardIndex];
        const counts = new Uint8Array(6);

        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            counts[engine.data[offset + cell]] += 1;
        }

        if (counts[COLOR_INDEX.R] !== 1) return "Quantidade de vermelhas inválida";
        if (counts[COLOR_INDEX.O] !== 2) return "Quantidade de laranjas inválida";
        if (counts[COLOR_INDEX.Y] !== 3) return "Quantidade de amarelas inválida";
        if (counts[COLOR_INDEX.G] !== 4) return "Quantidade de verdes inválida";
        if (red === CENTER_INDEX) return "Vermelha no centro";

        const [rr, rc] = toRowCol(red);
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (cell === red) continue;
            const [row, col] = toRowCol(cell);
            const dl = row - rr;
            const dc = col - rc;
            const code = engine.data[offset + cell];

            if (code === COLOR_INDEX.O && Math.abs(dl) + Math.abs(dc) !== 1) return "Laranja não adjacente";
            if (code === COLOR_INDEX.Y && Math.abs(dl) !== Math.abs(dc)) return "Amarela fora da diagonal";
            if (code === COLOR_INDEX.G && !(dl === 0 || dc === 0)) return "Verde fora da linha/coluna";
            if (code === COLOR_INDEX.T && !(dl === 0 || dc === 0 || Math.abs(dl) === Math.abs(dc))) return "Ciana desalinhada";
            if (code === COLOR_INDEX.B && (dl === 0 || dc === 0 || Math.abs(dl) === Math.abs(dc))) return "Azul alinhada";
        }
        return null;
    }

    /* ========================================================
       PROBABILITY ENGINE
       ======================================================== */
    function observationCode(symbol) {
        if (symbol == null || symbol === "?") return -1;
        if (symbol === "X") return -2;
        return COLOR_INDEX[symbol] ?? -1;
    }

    function filterCompatible(engine, observations, sourceIndices = null) {
        const compatible = [];
        const source = sourceIndices || engine.allIndices;
        boardLoop:
        for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
            const boardIndex = source[sourceIndex];
            const offset = boardIndex * CELL_COUNT;
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                const code = observationCode(observations[cell]);
                if (code >= 0 && engine.data[offset + cell] !== code) continue boardLoop;
            }
            compatible.push(boardIndex);
        }
        return compatible;
    }

    function analyzeState(engine, observations, sourceIndices = null) {
        // Em uma nova revelação podemos filtrar diretamente o conjunto já
        // compatível do estado anterior, evitando varrer 16.800 tabuleiros.
        const compatible = filterCompatible(engine, observations, sourceIndices);
        const probabilities = Array.from({ length: CELL_COUNT }, () => new Float64Array(6));
        const redProbabilities = new Float64Array(CELL_COUNT);
        const immediateEV = new Float64Array(CELL_COUNT);
        let z = 0;

        for (const boardIndex of compatible) {
            const weight = engine.weights[boardIndex];
            z += weight;
            const offset = boardIndex * CELL_COUNT;
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                probabilities[cell][engine.data[offset + cell]] += weight;
            }
            redProbabilities[engine.reds[boardIndex]] += weight;
        }

        if (z > 0) {
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                let ev = 0;
                for (let color = 0; color < 6; color += 1) {
                    probabilities[cell][color] /= z;
                    ev += probabilities[cell][color] * SP_BY_INDEX[color];
                }
                redProbabilities[cell] /= z;
                immediateEV[cell] = ev;
            }
        }

        const candidates = [];
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (redProbabilities[cell] > EPS) candidates.push(cell);
        }

        return {
            compatible,
            rawCount: compatible.length,
            z,
            effectiveCount: EXPECTED_BOARD_COUNT * z,
            probabilities,
            redProbabilities,
            immediateEV,
            candidates,
            impossible: compatible.length === 0 || z <= 0
        };
    }

    function greedyRecommendation(analysis, observations) {
        let bestAction = -1;
        let bestEV = -Infinity;
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (observations[cell] != null) continue;
            const ev = analysis.immediateEV[cell];
            if (ev > bestEV + 1e-12 || (nearlyEqual(ev, bestEV, 1e-12) && cell < bestAction)) {
                bestEV = ev;
                bestAction = cell;
            }
        }
        return bestAction < 0 ? null : {
            action: bestAction,
            evTotal: bestEV,
            evImmediate: bestEV,
            evFuture: 0,
            policy: "greedy",
            precomputed: false
        };
    }

    // Fallback de compatibilidade: se Blob/Web Worker estiver indisponível,
    // estados com até 3 cliques restantes ainda são resolvidos exatamente
    // na thread principal. Em navegadores modernos o caminho normal é Worker.
    function solveBellmanSync(engine, observations, analysis, k, timeLimitMs = 2500) {
        const started = performance.now();
        const deadline = started + timeLimitMs;
        const state = new Int8Array(CELL_COUNT);
        for (let cell = 0; cell < CELL_COUNT; cell += 1) state[cell] = observationCode(observations[cell]);
        const memo = new Map();
        let explored = 0;

        function key(remaining) {
            let out = "";
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                const value = state[cell];
                out += value === -1 ? "." : value === -2 ? "x" : String(value);
            }
            return `${out}|${remaining}`;
        }

        function mass(indices) {
            let z = 0;
            for (let i = 0; i < indices.length; i += 1) z += engine.weights[indices[i]];
            return z;
        }

        function solve(indices, remaining) {
            if (remaining <= 0) return { value: 0, action: -1 };
            if (performance.now() > deadline) throw new Error("BELLMAN_TIMEOUT");
            const cacheKey = key(remaining);
            const cached = memo.get(cacheKey);
            if (cached) return cached;
            explored += 1;
            const z = mass(indices);
            let bestValue = -Infinity;
            let bestAction = -1;

            for (let action = 0; action < CELL_COUNT; action += 1) {
                if (state[action] !== -1) continue;
                const branches = Array.from({ length: 6 }, () => []);
                const branchMass = new Float64Array(6);
                for (let i = 0; i < indices.length; i += 1) {
                    const board = indices[i];
                    const color = engine.data[board * CELL_COUNT + action];
                    branches[color].push(board);
                    branchMass[color] += engine.weights[board];
                }
                let q = 0;
                for (let color = 0; color < 6; color += 1) {
                    if (!(branchMass[color] > 0)) continue;
                    let future = 0;
                    if (remaining > 1) {
                        state[action] = color;
                        future = solve(branches[color], remaining - 1).value;
                        state[action] = -1;
                    }
                    q += (branchMass[color] / z) * (SP_BY_INDEX[color] + future);
                }
                if (q > bestValue + 1e-12 || (nearlyEqual(q, bestValue, 1e-12) && (bestAction < 0 || action < bestAction))) {
                    bestValue = q;
                    bestAction = action;
                }
            }
            const result = { value: bestValue, action: bestAction };
            memo.set(cacheKey, result);
            return result;
        }

        const exact = solve(analysis.compatible, k);
        const evImmediate = exact.action >= 0 ? analysis.immediateEV[exact.action] : 0;
        return {
            action: exact.action,
            evTotal: exact.value,
            evImmediate,
            evFuture: exact.value - evImmediate,
            policy: "bellman",
            precomputed: false,
            calculationMs: performance.now() - started,
            cacheStates: memo.size,
            exploredStates: explored,
            mainThreadFallback: true
        };
    }

    /* ========================================================
       D4 SYMMETRY HELPERS
       ======================================================== */
    const D4_TRANSFORMS = [
        ([r, c]) => [r, c],
        ([r, c]) => [c, 4 - r],
        ([r, c]) => [4 - r, 4 - c],
        ([r, c]) => [4 - c, r],
        ([r, c]) => [r, 4 - c],
        ([r, c]) => [4 - r, c],
        ([r, c]) => [c, r],
        ([r, c]) => [4 - c, 4 - r]
    ];

    function transformIndex(index, transform) {
        const [row, col] = transform(toRowCol(index));
        return toIndex(row, col);
    }

    function getPrecomputedSolution(observations, remainingClicks, analysis) {
        const usedCells = [];
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (observations[cell] != null) usedCells.push(cell);
        }

        if (usedCells.length === 0 && remainingClicks === 5) {
            return { ...INITIAL_EXACT_POLICY, calculationMs: 0, cacheStates: 1 };
        }

        if (usedCells.length === 1 && remainingClicks === 4) {
            const clicked = usedCells[0];
            const symbol = observations[clicked];
            if (!INITIAL_SYMMETRIC_CELLS.has(clicked) || symbol === "X" || !FIRST_CLICK_EXACT_BRANCHES[symbol]) return null;

            const transform = D4_TRANSFORMS.find(fn => transformIndex(6, fn) === clicked);
            if (!transform) return null;
            const branch = FIRST_CLICK_EXACT_BRANCHES[symbol];
            const action = transformIndex(branch.action, transform);
            const evImmediate = analysis.immediateEV[action];
            return {
                action,
                evTotal: branch.evTotal,
                evImmediate,
                evFuture: branch.evTotal - evImmediate,
                policy: "bellman",
                precomputed: true,
                calculationMs: 0,
                cacheStates: 1
            };
        }

        return null;
    }

    /* ========================================================
       STATE MANAGER
       ======================================================== */
    class StateManager {
        constructor() {
            this.mode = "solver";
            this.observations = new Array(CELL_COUNT).fill(null);
            this.history = [];
            this.undoStack = [];
            this.spReceived = 0;
        }

        cloneSnapshot() {
            return {
                mode: this.mode,
                observations: this.observations.slice(),
                history: this.history.map(item => ({
                    ...item,
                    probabilitiesBefore: item.probabilitiesBefore ? item.probabilitiesBefore.slice() : null,
                    candidatesBefore: item.candidatesBefore ? item.candidatesBefore.slice() : null
                })),
                spReceived: this.spReceived
            };
        }

        restoreSnapshot(snapshot) {
            this.mode = snapshot.mode;
            this.observations = snapshot.observations.slice();
            this.history = snapshot.history.map(item => ({
                ...item,
                probabilitiesBefore: item.probabilitiesBefore ? item.probabilitiesBefore.slice() : null,
                candidatesBefore: item.candidatesBefore ? item.candidatesBefore.slice() : null
            }));
            this.spReceived = snapshot.spReceived;
        }

        pushUndo() {
            this.undoStack.push(this.cloneSnapshot());
            if (this.undoStack.length > 30) this.undoStack.shift();
        }

        undo() {
            const snapshot = this.undoStack.pop();
            if (!snapshot) return false;
            this.restoreSnapshot(snapshot);
            return true;
        }

        reset(mode = this.mode) {
            this.mode = mode;
            this.observations = new Array(CELL_COUNT).fill(null);
            this.history = [];
            this.undoStack = [];
            this.spReceived = 0;
        }

        get clicksUsed() {
            let count = 0;
            for (const value of this.observations) if (value != null) count += 1;
            return count;
        }

        get remainingClicks() {
            return Math.max(0, MAX_CLICKS - this.clicksUsed);
        }

    }

    /* ========================================================
       SIMULATOR
       ======================================================== */
    function secureRandomIndex(maxExclusive) {
        if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error("Limite aleatório inválido.");
        if (globalThis.crypto?.getRandomValues) {
            const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
            const buffer = new Uint32Array(1);
            let value;
            do {
                globalThis.crypto.getRandomValues(buffer);
                value = buffer[0];
            } while (value >= limit);
            return value % maxExclusive;
        }
        return Math.floor(Math.random() * maxExclusive);
    }

    function generateRandomValidBoard(randomIndex = secureRandomIndex) {
        const allowedReds = [];
        for (let cell = 0; cell < CELL_COUNT; cell += 1) if (cell !== CENTER_INDEX) allowedReds.push(cell);

        // Ordem probabilística correta: vermelha uniforme primeiro.
        const red = allowedReds[randomIndex(allowedReds.length)];
        const { adjacent, diagonal, lineColumn } = getRelationSets(red);

        const orangeChoices = combinations(adjacent, 2);
        const oranges = orangeChoices[randomIndex(orangeChoices.length)];
        const orangeSet = new Set(oranges);

        const yellowChoices = combinations(diagonal, 3);
        const yellows = yellowChoices[randomIndex(yellowChoices.length)];
        const yellowSet = new Set(yellows);

        const greenCandidates = lineColumn.filter(cell => !orangeSet.has(cell));
        const greenChoices = combinations(greenCandidates, 4);
        const greens = greenChoices[randomIndex(greenChoices.length)];
        const greenSet = new Set(greens);

        const board = new Array(CELL_COUNT);
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            if (cell === red) board[cell] = "R";
            else if (orangeSet.has(cell)) board[cell] = "O";
            else if (yellowSet.has(cell)) board[cell] = "Y";
            else if (greenSet.has(cell)) board[cell] = "G";
            else board[cell] = isAlignedWithRed(cell, red) ? "T" : "B";
        }
        return { board, red, generationPolicy: "hierarchical-uniform" };
    }

    function simulatorShouldReveal(clicksUsed) {
        return clicksUsed >= MAX_CLICKS;
    }

    /* ========================================================
       BELLMAN WEB WORKER
       --------------------------------------------------------
       V(S,k) = max_c Σ_x P(Xc=x|S) × [SP(x)+V(S∪{c=x},k-1)]

       Para evitar travamentos, estados gerais são resolvidos em
       Worker. O estado inicial e os seis ramos da primeira jogada
       canônica usam resultados Bellman exatos pré-calculados.
       ======================================================== */
    function bellmanWorkerBootstrap() {
        "use strict";
        const CELLS = 25;
        const COLORS = 6;
        const SP = new Float64Array([10, 20, 35, 55, 90, 150]);
        let boards = null;
        let weights = null;
        let boardCount = 0;
        let memo = new Map();

        function encodeState(state, k) {
            let key = "";
            for (let i = 0; i < CELLS; i += 1) {
                const v = state[i];
                key += v === -1 ? "." : v === -2 ? "x" : String(v);
            }
            return `${key}|${k}`;
        }

        function filterIndices(state) {
            const out = [];
            boardLoop:
            for (let b = 0; b < boardCount; b += 1) {
                const offset = b * CELLS;
                for (let c = 0; c < CELLS; c += 1) {
                    const obs = state[c];
                    if (obs >= 0 && boards[offset + c] !== obs) continue boardLoop;
                }
                out.push(b);
            }
            return out;
        }

        function totalMass(indices) {
            let z = 0;
            for (let i = 0; i < indices.length; i += 1) z += weights[indices[i]];
            return z;
        }

        function greedy(indices, state) {
            const z = totalMass(indices);
            let bestAction = -1;
            let best = -Infinity;
            for (let action = 0; action < CELLS; action += 1) {
                if (state[action] !== -1) continue;
                const masses = new Float64Array(COLORS);
                for (let i = 0; i < indices.length; i += 1) {
                    const b = indices[i];
                    masses[boards[b * CELLS + action]] += weights[b];
                }
                let ev = 0;
                for (let color = 0; color < COLORS; color += 1) ev += (masses[color] / z) * SP[color];
                if (ev > best + 1e-12 || (Math.abs(ev - best) <= 1e-12 && (bestAction < 0 || action < bestAction))) {
                    best = ev;
                    bestAction = action;
                }
            }
            return { action: bestAction, evTotal: best, evImmediate: best, evFuture: 0 };
        }

        function solveExact(indices, state, k, deadline, stats) {
            if (k <= 0) return { value: 0, action: -1 };
            if (performance.now() > deadline) throw new Error("BELLMAN_TIMEOUT");

            const key = encodeState(state, k);
            const cached = memo.get(key);
            if (cached) {
                stats.hits += 1;
                return cached;
            }
            stats.states += 1;

            const z = totalMass(indices);
            if (!(z > 0)) return { value: 0, action: -1 };

            let bestValue = -Infinity;
            let bestAction = -1;

            for (let action = 0; action < CELLS; action += 1) {
                if (state[action] !== -1) continue;
                if ((stats.states & 63) === 0 && performance.now() > deadline) throw new Error("BELLMAN_TIMEOUT");

                const branchIndices = Array.from({ length: COLORS }, () => []);
                const branchMass = new Float64Array(COLORS);

                for (let i = 0; i < indices.length; i += 1) {
                    const b = indices[i];
                    const color = boards[b * CELLS + action];
                    branchIndices[color].push(b);
                    branchMass[color] += weights[b];
                }

                let q = 0;
                for (let color = 0; color < COLORS; color += 1) {
                    const mass = branchMass[color];
                    if (!(mass > 0)) continue;
                    let future = 0;
                    if (k > 1) {
                        state[action] = color;
                        future = solveExact(branchIndices[color], state, k - 1, deadline, stats).value;
                        state[action] = -1;
                    }
                    q += (mass / z) * (SP[color] + future);
                }

                if (q > bestValue + 1e-12 || (Math.abs(q - bestValue) <= 1e-12 && (bestAction < 0 || action < bestAction))) {
                    bestValue = q;
                    bestAction = action;
                }
            }

            const result = { value: bestValue, action: bestAction };
            memo.set(key, result);
            return result;
        }

        self.onmessage = event => {
            const msg = event.data;
            if (msg.type === "init") {
                boards = new Uint8Array(msg.boards);
                weights = new Float64Array(msg.weights);
                boardCount = msg.boardCount;
                memo = new Map();
                self.postMessage({ type: "ready" });
                return;
            }

            if (msg.type !== "solve" || !boards || !weights) return;
            const started = performance.now();
            const state = new Int8Array(msg.state);
            const indices = filterIndices(state);
            const stats = { states: 0, hits: 0 };
            const deadline = started + Math.max(500, Number(msg.timeLimitMs) || 6000);

            if (!indices.length) {
                self.postMessage({ type: "result", id: msg.id, impossible: true, calculationMs: performance.now() - started });
                return;
            }

            try {
                const exact = solveExact(indices, state, msg.k, deadline, stats);
                const rootGreedy = greedy(indices, state);
                self.postMessage({
                    type: "result",
                    id: msg.id,
                    policy: "bellman",
                    action: exact.action,
                    evTotal: exact.value,
                    evImmediate: rootGreedy.action === exact.action ? rootGreedy.evImmediate : null,
                    calculationMs: performance.now() - started,
                    cacheStates: memo.size,
                    exploredStates: stats.states,
                    cacheHits: stats.hits
                });
            } catch (error) {
                const fallback = greedy(indices, state);
                self.postMessage({
                    type: "result",
                    id: msg.id,
                    policy: "greedy",
                    action: fallback.action,
                    evTotal: fallback.evTotal,
                    evImmediate: fallback.evImmediate,
                    evFuture: 0,
                    calculationMs: performance.now() - started,
                    cacheStates: memo.size,
                    fallbackReason: error?.message === "BELLMAN_TIMEOUT"
                        ? "O limite de tempo da Bellman exata foi atingido."
                        : "A Bellman exata não pôde ser concluída."
                });
            }
        };
    }

    class SolverController {
        constructor(engine) {
            this.engine = engine;
            this.worker = null;
            this.workerUrl = null;
            this.ready = false;
            this.requestId = 0;
            this.pending = null;
            this.createWorker();
        }

        createWorker() {
            this.destroyWorker();
            if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") return;

            const source = `(${bellmanWorkerBootstrap.toString()})();`;
            this.workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
            this.worker = new Worker(this.workerUrl);
            this.ready = false;

            this.worker.onmessage = event => {
                const msg = event.data;
                if (msg.type === "ready") {
                    this.ready = true;
                    return;
                }
                if (msg.type === "result" && this.pending && msg.id === this.pending.id) {
                    const { resolve } = this.pending;
                    this.pending = null;
                    resolve(msg);
                }
            };

            this.worker.onerror = () => {
                if (this.pending) {
                    const { resolve } = this.pending;
                    this.pending = null;
                    resolve({ policy: "greedy", workerFailed: true, fallbackReason: "Falha ao inicializar o Web Worker." });
                }
            };

            // Cópias preservam os arrays usados pela UI na thread principal.
            this.worker.postMessage({
                type: "init",
                boards: this.engine.data.buffer.slice(0),
                weights: this.engine.weights.buffer.slice(0),
                boardCount: this.engine.count
            });
        }

        destroyWorker() {
            if (this.worker) this.worker.terminate();
            if (this.workerUrl) URL.revokeObjectURL(this.workerUrl);
            this.worker = null;
            this.workerUrl = null;
            this.ready = false;
            if (this.pending) {
                this.pending.resolve({ cancelled: true });
                this.pending = null;
            }
        }

        cancel() {
            if (this.pending) this.createWorker();
        }

        async solve(observations, remainingClicks, analysis) {
            if (remainingClicks <= 0 || analysis.impossible) return null;

            const precomputed = getPrecomputedSolution(observations, remainingClicks, analysis);
            if (precomputed) return precomputed;

            const fallback = greedyRecommendation(analysis, observations);
            if (!this.worker) {
                if (remainingClicks <= 3) {
                    try { return solveBellmanSync(this.engine, observations, analysis, remainingClicks); }
                    catch (_) { /* cai no fallback guloso abaixo */ }
                }
                return fallback ? { ...fallback, fallbackReason: "Web Worker indisponível neste navegador." } : null;
            }

            // Se um cálculo antigo estiver em andamento, encerra o Worker para
            // cancelar imediatamente e recria o cache para o novo estado.
            if (this.pending) this.createWorker();

            const id = ++this.requestId;
            const state = new Int8Array(CELL_COUNT);
            for (let cell = 0; cell < CELL_COUNT; cell += 1) state[cell] = observationCode(observations[cell]);

            const timeLimitMs = remainingClicks >= 4 ? 8000 : 6000;
            const responsePromise = new Promise(resolve => {
                this.pending = { id, resolve };
            });

            // A inicialização é assíncrona, mas mensagens postadas em sequência
            // são processadas em ordem pelo Worker, então não é necessário polling.
            this.worker.postMessage({
                type: "solve",
                id,
                state: state.buffer,
                k: remainingClicks,
                timeLimitMs
            }, [state.buffer]);

            const result = await responsePromise;
            if (!result || result.cancelled) return { cancelled: true };
            if (result.workerFailed) {
                if (remainingClicks <= 3) {
                    try { return solveBellmanSync(this.engine, observations, analysis, remainingClicks); }
                    catch (_) { /* cai no fallback guloso abaixo */ }
                }
                return fallback ? { ...fallback, fallbackReason: result.fallbackReason } : null;
            }
            if (result.impossible) return null;

            const action = result.action;
            const evImmediate = action >= 0 ? analysis.immediateEV[action] : 0;
            return {
                action,
                evTotal: result.evTotal,
                evImmediate,
                evFuture: result.policy === "bellman" ? result.evTotal - evImmediate : 0,
                policy: result.policy,
                precomputed: false,
                calculationMs: result.calculationMs,
                cacheStates: result.cacheStates ?? 0,
                exploredStates: result.exploredStates ?? 0,
                cacheHits: result.cacheHits ?? 0,
                fallbackReason: result.fallbackReason || null
            };
        }
    }

    /* ========================================================
       MODULE HTML
       ======================================================== */
    const MODULE_HTML = `
        <section id="view-orbe" class="view orbe-view" aria-label="OrbeSolver">
            <div id="orbeHub" class="orbe-hub">
                <div class="orbe-hub-inner">
                    <div class="orbe-hub-heading">
                        <span class="orbe-hub-kicker">MUDAE · ORBES</span>
                        <h1 id="orbeHubTitle"><span class="page-icon">◉</span> ORBESOLVER</h1>
                        <p class="subtitle">Selecione qual solver de orbes deseja utilizar.</p>
                    </div>
                    <div class="orbe-solver-picker" role="group" aria-label="Selecionar solver de orbes">
                        <button type="button" class="orbe-solver-card is-disabled" disabled aria-disabled="true">
                            <span class="orbe-solver-command">$OH</span>
                        </button>
                        <button type="button" id="orbeOpenOc" class="orbe-solver-card is-available">
                            <span class="orbe-solver-command">$OC</span>
                            <span class="orbe-solver-name">Ourochest</span>
                            <span class="orbe-solver-enter">ABRIR SOLVER →</span>
                        </button>
                        <button type="button" id="orbeOpenOq" class="orbe-solver-card is-available">
                            <span class="orbe-solver-command">$OQ</span>
                            <span class="orbe-solver-name">Ouro Quest</span>
                            <span class="orbe-solver-enter">ABRIR SOLVER →</span>
                        </button>
                    </div>
                </div>
            </div>

            <div id="orbeOcScreen" class="orbe-oc-screen" hidden>
            <div class="page-head split orbe-page-head">
                <div>
                    <h1 id="orbeTitle"><span class="page-icon">◉</span> $OC SOLVER</h1>
                    <p class="subtitle">Solver probabilístico e simulador local do <code>$oc</code> — Ourochest.</p>
                </div>
                <div class="orbe-head-actions">
                    <button type="button" id="orbeBackToHub" class="pill purple">← SOLVERS</button>
                    <div class="orbe-mode-switch" role="group" aria-label="Modo do OrbeSolver">
                        <button type="button" class="orbe-mode-btn active" data-orbe-mode="solver">SOLVER</button>
                        <button type="button" class="orbe-mode-btn" data-orbe-mode="simulator">SIMULADOR</button>
                    </div>
                </div>
            </div>

            <div id="orbeDiagnostic" class="orbe-diagnostic" role="status" aria-live="polite">
                <span class="orbe-loader"></span> Inicializando as 16.800 configurações locais...
            </div>

            <div class="orbe-layout">
                <div class="orbe-primary-column">
                    <div class="panel orbe-board-panel">
                        <div class="panel-title"><span class="bar cyan"></span>TABULEIRO 5×5</div>
                        <div class="orbe-board-toolbar">
                            <button type="button" id="orbeUndoBtn" class="pill purple">↶ DESFAZER</button>
                            <button type="button" id="orbeResetBtn" class="pill red">↻ REINICIAR</button>
                            <button type="button" id="orbeNewGameBtn" class="pill cyan" hidden>✦ NOVA PARTIDA</button>
                        </div>
                        <div id="orbeBoard" class="orbe-board" role="grid" aria-label="Tabuleiro Ourochest 5 por 5"></div>
                        <p id="orbeBoardHint" class="orbe-hint">Clique em uma casa e informe a cor revelada pelo Mudae.</p>
                    </div>

                </div>

                <div class="orbe-secondary-column">
                    <div class="panel orbe-recommendation-panel">
                        <div class="panel-title"><span class="bar yellow"></span>RECOMENDAÇÃO</div>
                        <div id="orbeCalculation" class="orbe-calc-status"><span class="orbe-loader"></span> Calculando Bellman DP...</div>
                        <div id="orbeRecommendation" class="orbe-recommendation"></div>
                        <div id="orbeOutcomeBars" class="orbe-outcome-bars"></div>
                    </div>

                    <div class="panel">
                        <div class="panel-title"><span class="bar green"></span>ESTATÍSTICAS</div>
                        <div id="orbeStats" class="orbe-stats-grid"></div>
                    </div>
                </div>
            </div>

            <div class="panel orbe-history-panel">
                <div class="panel-title"><span class="bar cyan"></span>HISTÓRICO DA ESTRATÉGIA</div>
                <div class="orbe-table-wrap">
                    <table class="orbe-history-table">
                        <thead>
                            <tr><th>CLIQUE</th><th>POSIÇÃO</th><th>COR</th><th>SP</th><th>RECOMENDAÇÃO</th><th>DETALHES</th></tr>
                        </thead>
                        <tbody id="orbeHistoryBody"></tbody>
                    </table>
                </div>
            </div>

            <div class="panel orbe-legend-panel">
                <div class="panel-title"><span class="bar yellow"></span>LEGENDA DE SP</div>
                <div class="orbe-legend">
                    ${UI_COLOR_ORDER.map(code => `<div class="orbe-legend-item"><span class="orbe-legend-dot orbe-color-${code.toLowerCase()}">${code}</span><span>${COLOR_META[code].name}</span><strong>${COLOR_META[code].sp} SP</strong></div>`).join("")}
                </div>
            </div>

            <details class="panel orbe-math-panel">
                <summary><span class="bar cyan"></span> EXPLICAÇÃO MATEMÁTICA E FÓRMULAS</summary>
                <div class="orbe-math-content">
                    <h3>1. Relações das cores</h3>
                    <p>Para a vermelha <code>r=(rl,rc)</code> e uma casa <code>p=(pl,pc)</code>, use <code>dl=pl-rl</code> e <code>dc=pc-rc</code>.</p>
                    <div class="orbe-formula-grid">
                        <code>R: p = r</code>
                        <code>O: |dl| + |dc| = 1</code>
                        <code>Y: |dl| = |dc|, p ≠ r</code>
                        <code>G: dl = 0 OU dc = 0, p ≠ r</code>
                        <code>T: mesma linha, coluna ou diagonal (residual)</code>
                        <code>B: dl ≠ 0, dc ≠ 0 e |dl| ≠ |dc|</code>
                    </div>

                    <h3>2. Geração exata das configurações</h3>
                    <p>Para cada uma das 24 posições possíveis da vermelha, são escolhidas 2 laranjas em <code>A(r)</code>, 3 amarelas em <code>D(r)</code> e 4 verdes entre as 6 casas restantes de linha/coluna.</p>
                    <pre>N(r) = C(|A(r)|,2) × C(|D(r)|,3) × C(6,4)
C(n,k) = n! / (k! × (n-k)!)
4×60 + 12×180 + 8×1.800 = 16.800 tabuleiros</pre>

                    <h3>3. Peso probabilístico correto</h3>
                    <p>Os 16.800 tabuleiros <strong>não</strong> são equiprováveis. A posição da vermelha é sorteada primeiro, uniformemente entre 24 casas:</p>
                    <pre>P(r) = 1/24
peso(b) = 1 / (24 × N(red(b)))</pre>

                    <h3>4. Posterior e probabilidades das cores</h3>
                    <pre>Z(S) = Σ peso(b), b ∈ B(S)
P(b|S) = peso(b) / Z(S)
P(Xc=x|S) = Σ[peso(b) × I(cor_b(c)=x)] / Z(S)</pre>
                    <p><strong>Tabuleiros brutos</strong> é <code>|B(S)|</code>. <strong>Tabuleiros efetivos</strong> é <code>16.800 × Z(S)</code>, respeitando os pesos diferentes por posição da vermelha.</p>

                    <h3>5. Bellman DP — maximizar SP, não apenas achar a vermelha</h3>
                    <pre>V(S,0) = 0
V(S,k) = max_c Σ_x P(Xc=x|S) × [valorSP(x) + V(S∪{c=x},k-1)]</pre>
                    <p>A ação ótima considera tanto o SP imediato quanto a informação que o clique fornece para os cliques seguintes. Por isso a casa com maior probabilidade de vermelha nem sempre é a melhor escolha.</p>

                    <h3>6. Primeira jogada certificada</h3>
                    <p>No estado inicial, a Bellman exata recomenda <strong>L2C2</strong> como desempate canônico entre L2C2, L2C4, L4C2 e L4C4. O EV imediato é <strong>35,5208333333 SP</strong> e o EV aproximado dos cinco cliques é <strong>344,7 SP</strong>.</p>
                </div>
            </details>

            </div>

            <div id="orbeDialog" class="orbe-dialog-backdrop" hidden>
                <div class="orbe-dialog" role="dialog" aria-modal="true" aria-labelledby="orbeDialogTitle">
                    <div class="orbe-dialog-head">
                        <div><span class="orbe-dialog-kicker">OUROCHEST</span><h2 id="orbeDialogTitle">Selecionar cor</h2></div>
                        <button type="button" id="orbeDialogClose" class="orbe-dialog-close" aria-label="Fechar">×</button>
                    </div>
                    <p id="orbeDialogText" class="orbe-dialog-text"></p>
                    <div id="orbeColorChoices" class="orbe-color-choices"></div>
                    <div id="orbeDialogActions" class="orbe-dialog-actions"></div>
                </div>
            </div>
        </section>`;

    /* ========================================================
       MODULE CSS — usa as mesmas variáveis neon do Tracker
       ======================================================== */
    const MODULE_CSS = `
        .orbe-view { --orbe-red:#ff4967; --orbe-orange:#ff8c32; --orbe-yellow:#ffd84a; --orbe-green:#45df87; --orbe-teal:#2ed7d0; --orbe-blue:#6687ff; }
        .orbe-hub[hidden],.orbe-oc-screen[hidden] { display:none!important; }
        .orbe-hub { min-height:calc(100vh - 155px); display:grid; place-items:center; padding:34px 12px 54px; }
        .orbe-hub-inner { width:min(900px,100%); text-align:center; }
        .orbe-hub-heading { margin:0 auto 30px; max-width:650px; }
        .orbe-hub-kicker { display:inline-block; margin-bottom:10px; color:var(--cyan); font:700 9px var(--mono); letter-spacing:1.8px; }
        .orbe-hub-heading h1 { display:flex; align-items:center; justify-content:center; gap:9px; flex-wrap:wrap; margin-bottom:8px; }
        .orbe-solver-picker { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; align-items:stretch; }
        .orbe-solver-card { min-height:190px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:24px 18px; border:1px solid var(--border); border-radius:13px; background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012)); color:var(--muted); font-family:var(--mono); transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,background .16s ease; }
        .orbe-solver-card.is-available { cursor:pointer; color:var(--cyan); border-color:rgba(34,211,238,.34); background:radial-gradient(circle at 50% 25%,rgba(34,211,238,.10),rgba(34,211,238,.025) 55%,rgba(255,255,255,.01)); box-shadow:inset 0 0 24px rgba(34,211,238,.035),0 0 20px rgba(34,211,238,.055); }
        .orbe-solver-card.is-available:hover,.orbe-solver-card.is-available:focus-visible { transform:translateY(-3px); outline:none; border-color:rgba(34,211,238,.72); box-shadow:inset 0 0 28px rgba(34,211,238,.055),0 0 28px rgba(34,211,238,.16); }
        .orbe-solver-card.is-disabled { cursor:not-allowed; opacity:.48; border-style:dashed; }
        .orbe-solver-command { font-size:34px; line-height:1; font-weight:900; letter-spacing:1px; text-shadow:0 0 18px currentColor; }
        .orbe-solver-name { color:var(--text); font-size:11px; letter-spacing:.8px; text-transform:uppercase; }
        .orbe-solver-status { color:var(--yellow); font-size:9px; letter-spacing:.5px; }
        .orbe-solver-enter { margin-top:6px; color:var(--cyan); font-size:8px; letter-spacing:1px; }
        .orbe-page-head { align-items:center; }
        /* V36 — escala tipográfica do $OC para melhorar legibilidade sem alterar o layout lógico. */
        .orbe-oc-screen { font-size:14px; }
        .orbe-oc-screen .page-head h1 { font-size:26px; }
        .orbe-oc-screen .page-head .subtitle { font-size:15px; line-height:1.55; }
        .orbe-oc-screen .panel-title { font-size:15px; }
        .orbe-oc-screen .pill { font-size:13px; }
        .orbe-head-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
        .orbe-page-head code,.orbe-math-content code,.orbe-math-content pre { font-family:var(--mono); }
        .orbe-mode-switch { display:flex; padding:4px; border:1px solid var(--border); background:rgba(255,255,255,.02); border-radius:9px; gap:4px; }
        .orbe-mode-btn { border:1px solid transparent; background:transparent; color:var(--muted); font:700 13px var(--mono); letter-spacing:.6px; padding:9px 14px; border-radius:6px; cursor:pointer; transition:.16s ease; }
        .orbe-mode-btn:hover,.orbe-mode-btn:focus-visible { color:var(--text); border-color:rgba(34,211,238,.28); outline:none; box-shadow:0 0 14px rgba(34,211,238,.10); }
        .orbe-mode-btn.active { color:var(--cyan); border-color:rgba(34,211,238,.45); background:var(--cyan-soft); box-shadow:inset 0 0 16px rgba(34,211,238,.07),0 0 13px rgba(34,211,238,.08); }
        .orbe-diagnostic { display:flex; align-items:center; gap:8px; min-height:34px; margin:-8px 0 16px; padding:8px 12px; border:1px solid rgba(34,211,238,.18); border-radius:7px; background:rgba(34,211,238,.055); color:var(--muted); font-size:13px; }
        .orbe-diagnostic.ok { color:var(--green); border-color:rgba(52,211,153,.25); background:rgba(52,211,153,.055); }
        .orbe-diagnostic.error { color:#ff6b87; border-color:rgba(255,73,103,.35); background:rgba(255,73,103,.08); }
        .orbe-loader { width:11px; height:11px; border-radius:50%; border:2px solid rgba(34,211,238,.22); border-top-color:var(--cyan); display:inline-block; animation:orbe-spin .7s linear infinite; flex:0 0 auto; }
        @keyframes orbe-spin { to { transform:rotate(360deg); } }
        .orbe-layout { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr); gap:16px; align-items:start; }
        .orbe-primary-column,.orbe-secondary-column { display:grid; gap:16px; min-width:0; }
        .orbe-board-panel { position:relative; overflow:visible; }
        .orbe-board-toolbar { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 14px; }
        .orbe-view .pill:disabled { opacity:.35; cursor:not-allowed; box-shadow:none!important; transform:none!important; }
        .orbe-board { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; max-width:620px; margin:0 auto; }
        .orbe-cell { position:relative; aspect-ratio:1; min-width:0; border:1px solid rgba(148,163,184,.22); border-radius:10px; background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012)); color:var(--text); cursor:pointer; font-family:var(--mono); transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease,background .14s ease; overflow:visible; isolation:isolate; }
        .orbe-cell:hover:not(:disabled),.orbe-cell:focus-visible:not(:disabled) { transform:translateY(-2px); border-color:rgba(34,211,238,.55); box-shadow:0 0 18px rgba(34,211,238,.13); outline:none; z-index:20; }
        .orbe-cell:disabled { cursor:default; }
        .orbe-cell.orbe-recommended { border-color:var(--yellow); box-shadow:0 0 0 1px rgba(245,197,24,.35),0 0 24px rgba(245,197,24,.23); animation:orbe-target 1.8s ease-in-out infinite; }
        @keyframes orbe-target { 0%,100%{box-shadow:0 0 0 1px rgba(245,197,24,.28),0 0 16px rgba(245,197,24,.14)} 50%{box-shadow:0 0 0 1px rgba(245,197,24,.5),0 0 29px rgba(245,197,24,.29)} }
        .orbe-cell.orbe-center::before { content:"R=0"; position:absolute; right:5px; top:5px; font-size:10px; color:rgba(255,73,103,.7); letter-spacing:.2px; }
        .orbe-cell.orbe-clicked { border-color:rgba(255,255,255,.28); }
        .orbe-cell.orbe-sim-clicked { box-shadow:inset 0 0 0 2px rgba(255,255,255,.35); }
        .orbe-cell.orbe-color-r { background:radial-gradient(circle at 50% 40%,rgba(255,73,103,.40),rgba(204,51,51,.12) 65%,rgba(8,10,18,.7)); border-color:rgba(255,73,103,.75); }
        .orbe-cell.orbe-color-o { background:radial-gradient(circle at 50% 40%,rgba(255,140,50,.38),rgba(232,119,34,.11) 65%,rgba(8,10,18,.7)); border-color:rgba(255,140,50,.68); }
        .orbe-cell.orbe-color-y { background:radial-gradient(circle at 50% 40%,rgba(255,216,74,.34),rgba(201,168,0,.10) 65%,rgba(8,10,18,.7)); border-color:rgba(255,216,74,.65); }
        .orbe-cell.orbe-color-g { background:radial-gradient(circle at 50% 40%,rgba(69,223,135,.33),rgba(58,156,58,.10) 65%,rgba(8,10,18,.7)); border-color:rgba(69,223,135,.63); }
        .orbe-cell.orbe-color-t { background:radial-gradient(circle at 50% 40%,rgba(46,215,208,.34),rgba(42,157,157,.10) 65%,rgba(8,10,18,.7)); border-color:rgba(46,215,208,.66); }
        .orbe-cell.orbe-color-b { background:radial-gradient(circle at 50% 40%,rgba(102,135,255,.34),rgba(51,85,204,.11) 65%,rgba(8,10,18,.7)); border-color:rgba(102,135,255,.65); }
        .orbe-cell.orbe-color-x { background:repeating-linear-gradient(135deg,rgba(90,98,120,.18) 0 8px,rgba(90,98,120,.08) 8px 16px); border-color:rgba(148,163,184,.30); }
        .orbe-cell-main { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; z-index:2; pointer-events:none; }
        .orbe-cell-symbol { font-size:27px; font-weight:800; line-height:1; text-shadow:0 0 10px currentColor; }
        .orbe-cell-target { font-size:24px; color:var(--yellow); font-weight:800; line-height:1; }
        .orbe-cell-sp { font-size:10px; color:var(--muted); margin-top:5px; }
        .orbe-cell-coord { position:absolute; left:6px; bottom:5px; font-size:10px; color:var(--muted); z-index:3; }
        .orbe-cell-redprob { position:absolute; right:6px; bottom:5px; font-size:10px; color:#ff7790; z-index:3; }
        .orbe-cell-tooltip { visibility:hidden; opacity:0; position:absolute; z-index:80; width:205px; left:50%; bottom:calc(100% + 8px); transform:translateX(-50%) translateY(3px); padding:10px; border:1px solid rgba(34,211,238,.35); background:rgba(8,10,18,.98); border-radius:8px; box-shadow:0 12px 34px rgba(0,0,0,.4),0 0 20px rgba(34,211,238,.08); pointer-events:none; text-align:left; transition:.12s ease; font-size:11px; color:var(--muted); }
        .orbe-cell:hover .orbe-cell-tooltip,.orbe-cell:focus-visible .orbe-cell-tooltip { visibility:visible; opacity:1; transform:translateX(-50%) translateY(0); }
        .orbe-tooltip-row { display:flex; justify-content:space-between; gap:8px; padding:2px 0; }
        .orbe-tooltip-row strong { color:var(--text); }
        .orbe-tooltip-ev { border-top:1px solid var(--border-soft); margin-top:5px; padding-top:6px; color:var(--cyan); }
        .orbe-hint,.orbe-small { color:var(--muted); font-size:12px; line-height:1.5; }
        .orbe-hint { text-align:center; margin:12px 0 0; }
        .orbe-calc-status { min-height:20px; display:flex; align-items:center; gap:7px; color:var(--muted); font-size:11px; margin-bottom:8px; }
        .orbe-calc-status.ready { color:var(--green); }
        .orbe-calc-status.fallback { color:var(--yellow); }
        .orbe-recommendation { min-height:104px; padding:14px; border:1px solid rgba(245,197,24,.25); border-radius:9px; background:linear-gradient(145deg,rgba(245,197,24,.075),rgba(245,197,24,.02)); }
        .orbe-rec-empty { color:var(--muted); font-size:12px; line-height:1.5; }
        .orbe-rec-coord { display:flex; align-items:center; gap:10px; color:var(--yellow); font-size:28px; font-weight:800; text-shadow:0 0 16px rgba(245,197,24,.24); }
        .orbe-rec-target { width:34px; height:34px; display:grid; place-items:center; border:1px solid rgba(245,197,24,.5); border-radius:50%; font-size:20px; }
        .orbe-rec-meta { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:11px; }
        .orbe-rec-metric { border-top:1px solid rgba(245,197,24,.14); padding-top:7px; }
        .orbe-rec-metric span { display:block; font-size:9px; color:var(--muted); text-transform:uppercase; }
        .orbe-rec-metric strong { display:block; margin-top:3px; font-size:12px; color:var(--text); }
        .orbe-policy-badge { display:inline-flex; margin-top:9px; padding:4px 7px; border:1px solid rgba(34,211,238,.25); background:rgba(34,211,238,.06); color:var(--cyan); border-radius:999px; font-size:10px; }
        .orbe-policy-badge.fallback { border-color:rgba(245,197,24,.28); background:rgba(245,197,24,.06); color:var(--yellow); }
        .orbe-outcome-bars { margin-top:11px; display:grid; gap:5px; }
        .orbe-outcome-row { display:grid; grid-template-columns:82px 1fr 64px; align-items:center; gap:8px; font-size:10px; }
        .orbe-outcome-label { color:var(--muted); }
        .orbe-outcome-track { height:5px; border-radius:999px; background:rgba(255,255,255,.05); overflow:hidden; }
        .orbe-outcome-fill { height:100%; border-radius:inherit; box-shadow:0 0 8px currentColor; }
        .orbe-outcome-value { text-align:right; color:var(--text); }
        .orbe-stats-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
        .orbe-stat { padding:8px; border:1px solid var(--border-soft); background:rgba(255,255,255,.016); border-radius:7px; min-width:0; }
        .orbe-stat span { display:block; color:var(--muted); font-size:9px; text-transform:uppercase; letter-spacing:.35px; }
        .orbe-stat strong { display:block; color:var(--text); font-size:13px; margin-top:4px; overflow-wrap:anywhere; }
        .orbe-stat.accent strong { color:var(--cyan); }
        .orbe-stat.warning strong { color:var(--yellow); }
        .orbe-history-panel { margin-top:16px; }
        .orbe-table-wrap { overflow:auto; }
        .orbe-history-table { width:100%; border-collapse:collapse; font-size:11px; }
        .orbe-history-table th { color:var(--muted); text-align:left; padding:8px; border-bottom:1px solid var(--border); font-size:10px; letter-spacing:.4px; }
        .orbe-history-table td { padding:9px 8px; border-bottom:1px solid var(--border-soft); color:var(--text); vertical-align:top; }
        .orbe-history-table tbody tr:last-child td { border-bottom:none; }
        .orbe-history-empty { color:var(--muted)!important; text-align:center; padding:18px!important; }
        .orbe-history-color { display:inline-flex; min-width:22px; justify-content:center; border:1px solid currentColor; border-radius:4px; padding:2px 4px; font-weight:800; }
        .orbe-history-table details summary { cursor:pointer; color:var(--cyan); }
        .orbe-history-details { min-width:240px; margin-top:6px; color:var(--muted); line-height:1.55; }
        .orbe-legend-panel { margin-top:16px; }
        .orbe-legend { display:grid; gap:6px; }
        .orbe-legend-item { display:grid; grid-template-columns:26px 1fr auto; align-items:center; gap:8px; font-size:11px; color:var(--muted); }
        .orbe-legend-item strong { color:var(--text); }
        .orbe-legend-dot { width:23px; height:23px; display:grid; place-items:center; border:1px solid currentColor; border-radius:6px; font-weight:800; }
        .orbe-color-r { color:var(--orbe-red); } .orbe-color-o { color:var(--orbe-orange); } .orbe-color-y { color:var(--orbe-yellow); }
        .orbe-color-g { color:var(--orbe-green); } .orbe-color-t { color:var(--orbe-teal); } .orbe-color-b { color:var(--orbe-blue); } .orbe-color-x { color:#8992a8; }
        .orbe-math-panel { margin-top:16px; }
        .orbe-math-panel > summary { cursor:pointer; color:var(--cyan); font-size:13px; font-weight:800; letter-spacing:.5px; list-style:none; display:flex; align-items:center; gap:8px; }
        .orbe-math-panel > summary::-webkit-details-marker { display:none; }
        .orbe-math-content { margin-top:16px; color:var(--muted); font-family:var(--sans); font-size:14px; line-height:1.7; }
        .orbe-math-content h3 { color:var(--text); font:700 13px var(--mono); margin:18px 0 6px; }
        .orbe-math-content pre { white-space:pre-wrap; padding:12px; border:1px solid var(--border); background:rgba(0,0,0,.22); border-radius:7px; color:#c9d5eb; font-size:12px; line-height:1.6; }
        .orbe-formula-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
        .orbe-formula-grid code { padding:8px; background:rgba(34,211,238,.035); border:1px solid rgba(34,211,238,.12); border-radius:6px; color:#b8c8df; font-size:11px; }
        .orbe-dialog-backdrop { position:fixed; inset:0; z-index:150; display:grid; place-items:center; padding:18px; background:rgba(3,5,12,.78); backdrop-filter:blur(5px); }
        .orbe-dialog-backdrop[hidden] { display:none; }
        .orbe-dialog { width:min(560px,100%); padding:18px; border:1px solid rgba(34,211,238,.32); background:#0b1020; border-radius:12px; box-shadow:0 24px 70px rgba(0,0,0,.55),0 0 35px rgba(34,211,238,.08); }
        .orbe-dialog-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
        .orbe-dialog-kicker { color:var(--cyan); font-size:10px; letter-spacing:1.2px; }
        .orbe-dialog h2 { margin:4px 0 0; color:var(--text); font-size:19px; }
        .orbe-dialog-close { width:34px; height:34px; border:1px solid var(--border); background:rgba(255,255,255,.025); color:var(--muted); border-radius:7px; cursor:pointer; font-size:20px; }
        .orbe-dialog-close:hover,.orbe-dialog-close:focus-visible { color:var(--cyan); border-color:rgba(34,211,238,.4); outline:none; box-shadow:0 0 14px rgba(34,211,238,.1); }
        .orbe-dialog-text { color:var(--muted); font-size:12px; line-height:1.55; }
        .orbe-color-choices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:12px; }
        .orbe-color-choice { --orbe-choice-glow:rgba(137,146,168,.16); display:grid; grid-template-columns:30px 1fr auto; align-items:center; gap:8px; padding:9px; border:1px solid currentColor; background:rgba(137,146,168,.06); color:#8992a8; border-radius:8px; cursor:pointer; text-align:left; font-family:var(--mono); transition:transform .14s ease,box-shadow .14s ease,background .14s ease; }
        .orbe-color-choice.orbe-color-r { color:var(--orbe-red); background:rgba(255,73,103,.075); --orbe-choice-glow:rgba(255,73,103,.22); }
        .orbe-color-choice.orbe-color-o { color:var(--orbe-orange); background:rgba(255,140,50,.075); --orbe-choice-glow:rgba(255,140,50,.22); }
        .orbe-color-choice.orbe-color-y { color:var(--orbe-yellow); background:rgba(255,216,74,.075); --orbe-choice-glow:rgba(255,216,74,.20); }
        .orbe-color-choice.orbe-color-g { color:var(--orbe-green); background:rgba(69,223,135,.075); --orbe-choice-glow:rgba(69,223,135,.20); }
        .orbe-color-choice.orbe-color-t { color:var(--orbe-teal); background:rgba(46,215,208,.075); --orbe-choice-glow:rgba(46,215,208,.21); }
        .orbe-color-choice.orbe-color-b { color:var(--orbe-blue); background:rgba(102,135,255,.08); --orbe-choice-glow:rgba(102,135,255,.22); }
        .orbe-color-choice:hover:not(:disabled),.orbe-color-choice:focus-visible:not(:disabled) { outline:none; box-shadow:0 0 18px var(--orbe-choice-glow); transform:translateY(-1px); background-color:rgba(255,255,255,.035); }
        .orbe-color-choice:disabled { opacity:.28; cursor:not-allowed; }
        .orbe-choice-code { width:28px; height:28px; display:grid; place-items:center; border:1px solid currentColor; border-radius:6px; font-weight:800; text-shadow:0 0 9px currentColor; }
        .orbe-choice-name { font-size:11px; color:currentColor; font-weight:700; }
        .orbe-choice-prob { font-size:10px; color:currentColor; opacity:.78; }
        .orbe-dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
        .orbe-impossible { color:#ff6b87; border:1px solid rgba(255,73,103,.32); background:rgba(255,73,103,.07); padding:10px; border-radius:7px; font-size:12px; line-height:1.55; }
        @media (max-width:900px) { .orbe-layout { grid-template-columns:1fr; } .orbe-secondary-column { grid-template-columns:1fr 1fr; } }
        @media (max-width:760px) { .tabs { max-width:100%; overflow-x:auto; scrollbar-width:thin; } .tab-btn { flex:0 0 auto; white-space:nowrap; } }
        @media (max-width:720px) { .orbe-secondary-column { grid-template-columns:1fr; } .orbe-formula-grid { grid-template-columns:1fr; } .orbe-cell-tooltip { display:none; } .orbe-solver-picker { grid-template-columns:1fr; max-width:430px; margin:0 auto; } .orbe-solver-card { min-height:125px; } }
        @media (max-width:520px) { .orbe-board { gap:5px; } .orbe-cell { border-radius:7px; } .orbe-cell-symbol { font-size:22px; } .orbe-cell-target { font-size:20px; } .orbe-cell-coord,.orbe-cell-redprob { font-size:9px; } .orbe-rec-meta { grid-template-columns:1fr; } .orbe-stats-grid { grid-template-columns:1fr 1fr; } .orbe-color-choices { grid-template-columns:1fr; } .orbe-mode-switch { width:100%; } .orbe-mode-btn { flex:1; } .orbe-head-actions { width:100%; justify-content:stretch; } .orbe-head-actions>.pill { width:100%; } }
        @media (prefers-reduced-motion:reduce) { .orbe-cell,.orbe-loader,.orbe-cell.orbe-recommended { animation:none!important; transition:none!important; } }
    `;

    /* ========================================================
       RENDERER / APPLICATION CONTROLLER
       ======================================================== */
    class OrbeApp {
        constructor() {
            this.initialized = false;
            this.initializing = false;
            this.engine = null;
            this.solver = null;
            this.analysis = null;
            this.solution = null;
            this.calculationToken = 0;
            this.mode = "solver";
            this.states = {
                solver: new StateManager(),
                simulator: new StateManager()
            };
            this.states.solver.mode = "solver";
            this.states.simulator.mode = "simulator";
            this.simulatorGame = null;
            this.dialogCell = null;
            this.lastFocusedElement = null;
            this.cacheStats = { states: 0, timeMs: 0 };
            this.bindElements();
            this.bindEvents();
            this.renderSkeleton();
        }

        get state() {
            return this.states[this.mode];
        }

        bindElements() {
            const byId = id => document.getElementById(id);
            this.el = {
                view: byId("view-orbe"),
                hub: byId("orbeHub"),
                ocScreen: byId("orbeOcScreen"),
                openOc: byId("orbeOpenOc"),
                openOq: byId("orbeOpenOq"),
                backToHub: byId("orbeBackToHub"),
                diagnostic: byId("orbeDiagnostic"),
                board: byId("orbeBoard"),
                boardHint: byId("orbeBoardHint"),
                undo: byId("orbeUndoBtn"),
                reset: byId("orbeResetBtn"),
                newGame: byId("orbeNewGameBtn"),
                calculation: byId("orbeCalculation"),
                recommendation: byId("orbeRecommendation"),
                outcomes: byId("orbeOutcomeBars"),
                stats: byId("orbeStats"),
                history: byId("orbeHistoryBody"),
                dialog: byId("orbeDialog"),
                dialogTitle: byId("orbeDialogTitle"),
                dialogText: byId("orbeDialogText"),
                dialogClose: byId("orbeDialogClose"),
                colorChoices: byId("orbeColorChoices"),
                dialogActions: byId("orbeDialogActions")
            };
            this.modeButtons = [...document.querySelectorAll("[data-orbe-mode]")];
        }

        bindEvents() {
            this.el.openOc.addEventListener("click", () => this.openOcSolver());
            this.el.openOq?.addEventListener("click", () => this.openOqSolver());
            this.el.backToHub.addEventListener("click", () => this.showHub());

            this.modeButtons.forEach(button => {
                button.addEventListener("click", () => this.switchMode(button.dataset.orbeMode));
            });

            this.el.board.addEventListener("click", event => {
                const button = event.target.closest(".orbe-cell");
                if (!button || button.disabled) return;
                const cell = Number(button.dataset.cell);
                this.handleCellClick(cell);
            });

            this.el.undo.addEventListener("click", () => this.undo());
            this.el.reset.addEventListener("click", () => this.resetCurrent());
            this.el.newGame.addEventListener("click", () => this.newSimulatorGame());


            this.el.dialogClose.addEventListener("click", () => this.closeDialog());
            this.el.dialog.addEventListener("click", event => {
                if (event.target === this.el.dialog) this.closeDialog();
            });
            document.addEventListener("keydown", event => {
                if (event.key === "Escape" && !this.el.dialog.hidden) this.closeDialog();
            });
        }

        renderSkeleton() {
            this.el.board.innerHTML = Array.from({ length: CELL_COUNT }, (_, cell) => `
                <button type="button" class="orbe-cell${cell === CENTER_INDEX ? " orbe-center" : ""}" data-cell="${cell}" role="gridcell" aria-label="${humanCoord(cell)}, não revelada">
                    <span class="orbe-cell-main"><span class="orbe-cell-target">?</span></span>
                    <span class="orbe-cell-coord">${humanCoord(cell)}</span>
                </button>`).join("");
            this.el.recommendation.innerHTML = `<div class="orbe-rec-empty">Inicialize o OrbeSolver para calcular a recomendação.</div>`;
            this.el.stats.innerHTML = "";
            this.renderHistory();
        }

        async ensureInitialized() {
            if (this.initialized || this.initializing) return;
            this.initializing = true;
            this.el.diagnostic.className = "orbe-diagnostic";
            this.el.diagnostic.innerHTML = `<span class="orbe-loader"></span> Gerando localmente as 16.800 configurações válidas...`;

            // Permite que o navegador pinte o indicador antes da enumeração síncrona.
            await new Promise(resolve => setTimeout(resolve, 0));
            const started = performance.now();
            this.engine = generateBoards();
            const generationMs = performance.now() - started;

            const tests = runSelfTests({ engine: this.engine, log: true });
            if (!tests.passed) {
                this.el.diagnostic.className = "orbe-diagnostic error";
                this.el.diagnostic.textContent = `Falha no diagnóstico do OrbeSolver: ${tests.failures.join(" · ")}`;
            } else {
                this.el.diagnostic.className = "orbe-diagnostic ok";
                this.el.diagnostic.textContent = `${this.engine.count.toLocaleString("pt-BR")} configurações carregadas e validadas em ${formatNumber(generationMs, 1)} ms · peso total = 1,000000`;
            }

            this.solver = new SolverController(this.engine);
            this.initialized = true;
            this.initializing = false;
            if (this.mode === "simulator" && !this.simulatorGame) this.simulatorGame = generateRandomValidBoard();
            this.refreshState({ reason: "init" });
        }

        activate() {
            this.showHub();
        }

        showHub() {
            this.closeDialog(false);
            this.calculationToken += 1;
            this.solver?.cancel();
            globalThis.OrbeSolverOQ?.deactivate?.();
            this.el.hub.hidden = false;
            this.el.ocScreen.hidden = true;
            const oqScreen = document.getElementById("orbeOqScreen");
            if (oqScreen) oqScreen.hidden = true;
            requestAnimationFrame(() => this.el.openOc?.focus());
        }

        async openOcSolver() {
            globalThis.OrbeSolverOQ?.deactivate?.();
            this.el.hub.hidden = true;
            this.el.ocScreen.hidden = false;
            const oqScreen = document.getElementById("orbeOqScreen");
            if (oqScreen) oqScreen.hidden = true;
            await this.ensureInitialized();
            if (this.initialized) this.renderAll();
        }

        async openOqSolver() {
            this.closeDialog(false);
            this.calculationToken += 1;
            this.solver?.cancel();
            this.el.hub.hidden = true;
            this.el.ocScreen.hidden = true;
            await globalThis.OrbeSolverOQ?.activate?.();
        }

        switchMode(mode) {
            if (!this.states[mode] || mode === this.mode) return;
            this.closeDialog(false);
            this.calculationToken += 1;
            this.solver?.cancel();
            this.mode = mode;
            this.modeButtons.forEach(button => button.classList.toggle("active", button.dataset.orbeMode === mode));
            this.el.newGame.hidden = mode !== "simulator";
            this.el.reset.textContent = mode === "simulator" ? "↻ REINICIAR PARTIDA" : "↻ REINICIAR";
            this.el.boardHint.textContent = mode === "simulator"
                ? "Clique em cinco casas. As cores são reveladas pelo tabuleiro simulado e o solver continua recomendando após encontrar a vermelha."
                : "Clique em uma casa e informe a cor revelada pelo Mudae.";

            if (mode === "simulator" && !this.simulatorGame) this.newSimulatorGame();
            else this.refreshState({ reason: "mode" });
        }

        newSimulatorGame() {
            if (!this.initialized) return;
            this.states.simulator.reset("simulator");
            this.simulatorGame = generateRandomValidBoard();
            this.refreshState({ reason: "new-game" });
        }

        resetCurrent() {
            if (!this.initialized) return;
            if (this.mode === "simulator") {
                // Reiniciar mantém o mesmo tabuleiro oculto; "Nova partida" sorteia outro.
                this.state.reset("simulator");
            } else {
                this.state.reset("solver");
            }
            this.refreshState({ reason: "reset" });
        }

        undo() {
            if (!this.initialized || !this.state.undo()) return;
            this.refreshState({ reason: "undo" });
        }

        handleCellClick(cell) {
            if (!this.initialized || !this.analysis || this.analysis.impossible) return;
            if (this.state.observations[cell] != null || this.state.remainingClicks <= 0) return;

            if (this.mode === "simulator") {
                const symbol = this.simulatorGame?.board[cell];
                if (symbol) this.applyObservation(cell, symbol);
                return;
            }

            const probs = this.analysis.probabilities[cell];
            const possible = [];
            for (let color = 0; color < 6; color += 1) if (probs[color] > EPS) possible.push(COLOR_CODES[color]);

            // Se a evidência já determinou a cor, não exige clique adicional no seletor.
            if (possible.length === 1) {
                this.applyObservation(cell, possible[0]);
                return;
            }
            this.openColorDialog(cell);
        }

        applyObservation(cell, symbol) {
            if (this.state.observations[cell] != null || this.state.remainingClicks <= 0) return;
            const beforeAnalysis = this.analysis;
            const beforeSolution = this.solution;
            const beforeProbabilities = beforeAnalysis?.probabilities[cell]
                ? Array.from(beforeAnalysis.probabilities[cell])
                : null;

            this.state.pushUndo();
            this.state.observations[cell] = symbol;
            this.state.spReceived += COLOR_META[symbol]?.sp ?? 0;

            const afterAnalysis = analyzeState(this.engine, this.state.observations, beforeAnalysis?.compatible || null);
            this.state.history.push({
                click: this.state.clicksUsed,
                cell,
                symbol,
                sp: COLOR_META[symbol]?.sp ?? 0,
                followedRecommendation: beforeSolution?.action === cell ? true : beforeSolution ? false : null,
                probabilitiesBefore: beforeProbabilities,
                evClick: beforeAnalysis?.immediateEV[cell] ?? 0,
                rawBefore: beforeAnalysis?.rawCount ?? this.engine.count,
                rawAfter: afterAnalysis.rawCount,
                effectiveBefore: beforeAnalysis?.effectiveCount ?? EXPECTED_BOARD_COUNT,
                effectiveAfter: afterAnalysis.effectiveCount,
                candidatesBefore: beforeAnalysis?.candidates?.slice() ?? [],
                recommendationBefore: beforeSolution?.action ?? null
            });

            this.closeDialog(false);
            this.analysis = afterAnalysis;
            this.refreshState({ analysisAlreadyComputed: true, reason: "observation" });
        }

        refreshState({ analysisAlreadyComputed = false } = {}) {
            if (!this.initialized) return;
            this.calculationToken += 1;
            this.solver?.cancel();
            if (!analysisAlreadyComputed) this.analysis = analyzeState(this.engine, this.state.observations);
            this.solution = null;
            this.renderAll();
            this.requestSolution();
        }

        async requestSolution() {
            if (!this.initialized || !this.analysis || this.analysis.impossible || this.state.remainingClicks <= 0) {
                this.solution = null;
                this.renderRecommendation();
                this.renderStats();
                this.renderBoard();
                return;
            }

            const token = ++this.calculationToken;
            this.el.calculation.className = "orbe-calc-status";
            this.el.calculation.innerHTML = `<span class="orbe-loader"></span> Calculando Bellman DP para ${this.state.remainingClicks} clique(s) restante(s)...`;

            const result = await this.solver.solve(this.state.observations.slice(), this.state.remainingClicks, this.analysis);
            if (token !== this.calculationToken || result?.cancelled) return;
            this.solution = result;
            if (result) {
                this.cacheStats.states = result.cacheStates ?? 0;
                this.cacheStats.timeMs = result.calculationMs ?? 0;
            }
            this.renderRecommendation();
            this.renderStats();
            this.renderBoard();
        }

        renderAll() {
            this.renderBoard();
            this.renderRecommendation();
            this.renderStats();
            this.renderHistory();
            this.el.undo.disabled = this.state.undoStack.length === 0;
        }

        tooltipHtml(cell) {
            if (!this.analysis || this.analysis.impossible) return "";
            const probs = this.analysis.probabilities[cell];
            return `<span class="orbe-cell-tooltip" role="tooltip">
                ${UI_COLOR_ORDER.map(code => {
                    const p = probs[COLOR_INDEX[code]];
                    return `<span class="orbe-tooltip-row"><span>${COLOR_META[code].name}</span><strong>${formatPercent(p, 2)}</strong></span>`;
                }).join("")}
                <span class="orbe-tooltip-row orbe-tooltip-ev"><span>EV imediato</span><strong>${formatNumber(this.analysis.immediateEV[cell], 2)} SP</strong></span>
            </span>`;
        }

        renderBoard() {
            if (!this.initialized || !this.analysis) return;
            const gameOver = this.mode === "simulator" && simulatorShouldReveal(this.state.clicksUsed);
            const recommended = this.solution?.action ?? -1;

            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                const button = this.el.board.querySelector(`[data-cell="${cell}"]`);
                if (!button) continue;
                const observed = this.state.observations[cell];
                const finalReveal = gameOver && observed == null ? this.simulatorGame?.board[cell] : null;
                const shownSymbol = observed ?? finalReveal;
                const isUsed = observed != null;
                const isRecommended = !gameOver && !isUsed && recommended === cell && this.state.remainingClicks > 0;

                button.className = `orbe-cell${cell === CENTER_INDEX ? " orbe-center" : ""}`;
                button.style.background = "";
                if (isRecommended) button.classList.add("orbe-recommended");
                if (isUsed) button.classList.add("orbe-clicked");
                if (this.mode === "simulator" && isUsed) button.classList.add("orbe-sim-clicked");
                if (shownSymbol) button.classList.add(`orbe-color-${shownSymbol.toLowerCase()}`);

                button.disabled = Boolean(isUsed || this.state.remainingClicks <= 0 || this.analysis.impossible || finalReveal);

                const coordHtml = `<span class="orbe-cell-coord">${humanCoord(cell)}</span>`;
                const redProb = this.analysis.redProbabilities[cell];
                const redProbHtml = !shownSymbol && redProb > EPS ? `<span class="orbe-cell-redprob">R ${formatPercent(redProb, 1)}</span>` : "";
                let mainHtml;
                if (shownSymbol) {
                    const meta = COLOR_META[shownSymbol];
                    mainHtml = `<span class="orbe-cell-main"><span class="orbe-cell-symbol orbe-color-${shownSymbol.toLowerCase()}">${meta.icon}</span><span class="orbe-cell-sp">${finalReveal && !isUsed ? "revelada" : `${meta.sp} SP`}</span></span>`;
                } else if (isRecommended) {
                    mainHtml = `<span class="orbe-cell-main"><span class="orbe-cell-target">◎</span><span class="orbe-cell-sp">MELHOR CLIQUE</span></span>`;
                } else {
                    mainHtml = `<span class="orbe-cell-main"><span class="orbe-cell-target">?</span></span>`;
                }

                button.innerHTML = `${mainHtml}${coordHtml}${redProbHtml}${this.tooltipHtml(cell)}`;
                const symbolLabel = shownSymbol ? `${COLOR_META[shownSymbol].name}${finalReveal && !isUsed ? ", revelada ao fim" : `, ${COLOR_META[shownSymbol].sp} SP`}` : "não revelada";
                const recLabel = isRecommended ? ", recomendação atual" : "";
                button.setAttribute("aria-label", `${humanCoord(cell)}, ${symbolLabel}${recLabel}, probabilidade de vermelha ${formatPercent(redProb, 2)}`);
            }
        }

        renderRecommendation() {
            if (!this.initialized || !this.analysis) return;
            if (this.analysis.impossible) {
                this.el.calculation.className = "orbe-calc-status fallback";
                this.el.calculation.textContent = "Cálculo interrompido: estado impossível.";
                this.el.recommendation.innerHTML = `<div class="orbe-impossible">Estado impossível: as cores informadas não correspondem a nenhum tabuleiro válido.</div>`;
                this.el.outcomes.innerHTML = "";
                return;
            }
            if (this.state.remainingClicks <= 0) {
                this.el.calculation.className = "orbe-calc-status ready";
                this.el.calculation.textContent = "Partida concluída: os cinco cliques foram utilizados.";
                this.el.recommendation.innerHTML = `<div class="orbe-rec-empty">Não há cliques restantes. SP recebido: <strong>${this.state.spReceived}</strong>.</div>`;
                this.el.outcomes.innerHTML = "";
                return;
            }
            if (!this.solution) {
                this.el.recommendation.innerHTML = `<div class="orbe-rec-empty">A recomendação será exibida assim que o cálculo terminar.</div>`;
                this.el.outcomes.innerHTML = "";
                return;
            }

            const fallback = this.solution.policy !== "bellman";
            this.el.calculation.className = `orbe-calc-status ${fallback ? "fallback" : "ready"}`;
            if (fallback) {
                this.el.calculation.textContent = `Fallback guloso · ${this.solution.fallbackReason || "proteção de desempenho ativa"}`;
            } else if (this.solution.precomputed) {
                this.el.calculation.textContent = "Bellman DP exata · resultado certificado/pré-calculado para este estado simétrico.";
            } else {
                this.el.calculation.textContent = `Bellman DP exata · ${formatNumber(this.solution.calculationMs ?? 0, 1)} ms · ${Number(this.solution.cacheStates ?? 0).toLocaleString("pt-BR")} estados em cache.`;
            }

            const action = this.solution.action;
            const evImmediate = this.analysis.immediateEV[action] ?? this.solution.evImmediate ?? 0;
            const evTotal = this.solution.evTotal ?? evImmediate;
            const evFuture = fallback ? 0 : Math.max(0, evTotal - evImmediate);

            this.el.recommendation.innerHTML = `
                <div class="orbe-rec-coord"><span class="orbe-rec-target">◎</span>${humanCoord(action)}</div>
                <div class="orbe-rec-meta">
                    <div class="orbe-rec-metric"><span>EV imediato</span><strong>${formatNumber(evImmediate, 2)} SP</strong></div>
                    <div class="orbe-rec-metric"><span>EV futuro</span><strong>${formatNumber(evFuture, 2)} SP</strong></div>
                    <div class="orbe-rec-metric"><span>EV restante</span><strong>${formatNumber(evTotal, 2)} SP</strong></div>
                </div>
                <span class="orbe-policy-badge${fallback ? " fallback" : ""}">Política: ${fallback ? "fallback guloso" : "Bellman DP"}</span>`;

            const probs = this.analysis.probabilities[action];
            this.el.outcomes.innerHTML = UI_COLOR_ORDER.map(code => {
                const probability = probs[COLOR_INDEX[code]];
                const [r, g, b] = COLOR_META[code].rgb;
                return `<div class="orbe-outcome-row">
                    <span class="orbe-outcome-label">${COLOR_META[code].name}</span>
                    <span class="orbe-outcome-track"><span class="orbe-outcome-fill" style="width:${Math.max(0, Math.min(100, probability * 100))}%;background:rgb(${r},${g},${b});color:rgb(${r},${g},${b})"></span></span>
                    <span class="orbe-outcome-value">${formatPercent(probability, 1)}</span>
                </div>`;
            }).join("");
        }

        renderStats() {
            if (!this.initialized || !this.analysis) return;
            const action = this.solution?.action ?? -1;
            const evImmediate = action >= 0 ? this.analysis.immediateEV[action] : 0;
            const evRemaining = this.solution?.evTotal ?? 0;
            const expectedTotal = this.state.spReceived + evRemaining;
            const pRedNext = action >= 0 ? this.analysis.redProbabilities[action] : 0;
            const policy = this.solution ? (this.solution.policy === "bellman" ? "Bellman DP" : "Fallback guloso") : "—";
            const foundRed = this.state.observations.includes("R");

            const stats = [
                ["Cliques usados", `${this.state.clicksUsed} / ${MAX_CLICKS}`, "accent"],
                ["SP recebido", `${this.state.spReceived} SP`, "accent"],
                ["EV imediato", `${formatNumber(evImmediate, 2)} SP`, ""],
                ["EV cliques restantes", `${formatNumber(evRemaining, 2)} SP`, ""],
                ["SP total esperado", `${formatNumber(expectedTotal, 2)} SP`, "accent"],
                ["Tabuleiros brutos", this.analysis.rawCount.toLocaleString("pt-BR"), ""],
                ["Tabuleiros efetivos", formatNumber(this.analysis.effectiveCount, 2), ""],
                ["Candidatas da vermelha", this.analysis.candidates.length.toLocaleString("pt-BR"), ""],
                ["P(vermelha) próximo", formatPercent(pRedNext, 2), "warning"],
                ["Vermelha encontrada", foundRed ? "SIM" : "NÃO", foundRed ? "accent" : ""],
                ["Política", policy, this.solution?.policy === "greedy" ? "warning" : ""],
                ["Tempo do cálculo", `${formatNumber(this.solution?.calculationMs ?? 0, 1)} ms`, ""],
                ["Estados em cache", Number(this.solution?.cacheStates ?? 0).toLocaleString("pt-BR"), ""],
                ["Massa posterior Z(S)", formatNumber(this.analysis.z, 8), ""]
            ];
            this.el.stats.innerHTML = stats.map(([label, value, cls]) => `<div class="orbe-stat ${cls}"><span>${label}</span><strong>${value}</strong></div>`).join("");
        }

        renderHistory() {
            if (!this.el.history) return;
            if (!this.state.history.length) {
                this.el.history.innerHTML = `<tr><td colspan="6" class="orbe-history-empty">Nenhum clique registrado.</td></tr>`;
                return;
            }
            this.el.history.innerHTML = this.state.history.map(item => {
                const meta = COLOR_META[item.symbol];
                const followed = item.followedRecommendation === true ? "SIM" : item.followedRecommendation === false ? "NÃO" : "—";
                const probs = item.probabilitiesBefore;
                const probsText = probs ? UI_COLOR_ORDER.map(code => `${code}: ${formatPercent(probs[COLOR_INDEX[code]], 1)}`).join(" · ") : "Sem snapshot";
                const candidateText = item.candidatesBefore?.length ? item.candidatesBefore.map(humanCoord).join(", ") : "Nenhuma";
                return `<tr>
                    <td>${item.click}</td>
                    <td>${humanCoord(item.cell)}</td>
                    <td><span class="orbe-history-color orbe-color-${item.symbol.toLowerCase()}">${item.symbol}</span> ${escapeHtml(meta.name)}</td>
                    <td>${item.sp}</td>
                    <td>${followed}</td>
                    <td><details><summary>VER</summary><div class="orbe-history-details">
                        <strong>Probabilidades anteriores:</strong> ${probsText}<br>
                        <strong>EV do clique:</strong> ${formatNumber(item.evClick, 2)} SP<br>
                        <strong>Tabuleiros:</strong> ${item.rawBefore.toLocaleString("pt-BR")} → ${item.rawAfter.toLocaleString("pt-BR")}<br>
                        <strong>Efetivos:</strong> ${formatNumber(item.effectiveBefore, 2)} → ${formatNumber(item.effectiveAfter, 2)}<br>
                        <strong>Candidatas antes:</strong> ${candidateText}<br>
                        <strong>Recomendação anterior:</strong> ${item.recommendationBefore == null ? "—" : humanCoord(item.recommendationBefore)}
                    </div></details></td>
                </tr>`;
            }).join("");
        }

        openColorDialog(cell) {
            this.dialogCell = cell;
            this.lastFocusedElement = document.activeElement;
            this.el.dialogTitle.textContent = `Cor revelada em ${humanCoord(cell)}`;
            this.el.dialogText.textContent = "Selecione a cor exibida pelo Mudae. Cores impossíveis segundo o estado atual ficam desabilitadas.";
            const probs = this.analysis.probabilities[cell];
            this.el.colorChoices.innerHTML = UI_COLOR_ORDER.map(code => {
                const probability = probs[COLOR_INDEX[code]];
                const disabled = probability <= EPS;
                return `<button type="button" class="orbe-color-choice orbe-color-${code.toLowerCase()}" data-orbe-color="${code}" ${disabled ? "disabled" : ""}>
                    <span class="orbe-choice-code">${code}</span><span class="orbe-choice-name">${COLOR_META[code].name} · ${COLOR_META[code].sp} SP</span><span class="orbe-choice-prob">${formatPercent(probability, 2)}</span>
                </button>`;
            }).join("") + `<button type="button" class="orbe-color-choice orbe-color-x" data-orbe-color="X">
                <span class="orbe-choice-code">X</span><span class="orbe-choice-name">Clique gasto / cor desconhecida</span><span class="orbe-choice-prob">não filtra</span>
            </button>`;
            this.el.dialogActions.innerHTML = `<button type="button" class="pill purple" data-orbe-dialog-cancel>CANCELAR</button>`;
            this.el.colorChoices.querySelectorAll("[data-orbe-color]").forEach(button => {
                button.addEventListener("click", () => {
                    const symbol = button.dataset.orbeColor;
                    const target = this.dialogCell;
                    if (target != null) this.applyObservation(target, symbol);
                });
            });
            this.el.dialogActions.querySelector("[data-orbe-dialog-cancel]")?.addEventListener("click", () => this.closeDialog());
            this.el.dialog.hidden = false;
            requestAnimationFrame(() => this.el.colorChoices.querySelector("button:not(:disabled)")?.focus());
        }

        showMessage(title, text, tone = "cyan") {
            this.dialogCell = null;
            this.lastFocusedElement = document.activeElement;
            this.el.dialogTitle.textContent = title;
            this.el.dialogText.textContent = text;
            this.el.colorChoices.innerHTML = "";
            this.el.dialogActions.innerHTML = `<button type="button" class="pill ${tone === "red" ? "red" : tone === "yellow" ? "yellow" : "cyan"}" data-orbe-dialog-ok>OK</button>`;
            this.el.dialogActions.querySelector("[data-orbe-dialog-ok]")?.addEventListener("click", () => this.closeDialog());
            this.el.dialog.hidden = false;
            requestAnimationFrame(() => this.el.dialogActions.querySelector("button")?.focus());
        }

        closeDialog(restoreFocus = true) {
            if (!this.el.dialog || this.el.dialog.hidden) return;
            this.el.dialog.hidden = true;
            this.dialogCell = null;
            if (restoreFocus && this.lastFocusedElement?.focus) this.lastFocusedElement.focus();
            this.lastFocusedElement = null;
        }

    }

    /* ========================================================
       SELF TESTS
       ======================================================== */
    function runSelfTests(options = {}) {
        const engine = options.engine || generateBoards();
        const log = options.log !== false;
        const tests = [];
        const failures = [];

        function test(name, condition, detail = "") {
            const passed = Boolean(condition);
            tests.push({ name, passed, detail });
            if (!passed) failures.push(`${name}${detail ? ` (${detail})` : ""}`);
        }

        const perRedDistribution = { 60: 0, 180: 0, 1800: 0 };
        for (const count of engine.perRedCounts.values()) {
            if (Object.prototype.hasOwnProperty.call(perRedDistribution, count)) perRedDistribution[count] += 1;
        }
        const boardCountStructureOk = engine.count === EXPECTED_BOARD_COUNT
            && perRedDistribution[60] === 4
            && perRedDistribution[180] === 12
            && perRedDistribution[1800] === 8;
        test("1. Existem exatamente 16.800 configurações", boardCountStructureOk, `${engine.count}; 60×${perRedDistribution[60]}, 180×${perRedDistribution[180]}, 1800×${perRedDistribution[1800]}`);
        test("2. Existem exatamente 24 posições possíveis da vermelha", new Set(engine.reds).size === 24, String(new Set(engine.reds).size));
        test("3. A vermelha nunca está no centro", !engine.reds.includes(CENTER_INDEX));

        let exactR = true, exactO = true, exactY = true, exactG = true;
        let orangeRule = true, yellowRule = true, greenRule = true, tealRule = true, blueRule = true;
        for (let b = 0; b < engine.count; b += 1) {
            const offset = b * CELL_COUNT;
            const red = engine.reds[b];
            const [rr, rc] = toRowCol(red);
            const counts = new Uint8Array(6);
            for (let cell = 0; cell < CELL_COUNT; cell += 1) {
                const code = engine.data[offset + cell];
                counts[code] += 1;
                if (cell === red) continue;
                const [row, col] = toRowCol(cell);
                const dl = row - rr;
                const dc = col - rc;
                if (code === COLOR_INDEX.O && Math.abs(dl) + Math.abs(dc) !== 1) orangeRule = false;
                if (code === COLOR_INDEX.Y && Math.abs(dl) !== Math.abs(dc)) yellowRule = false;
                if (code === COLOR_INDEX.G && !(dl === 0 || dc === 0)) greenRule = false;
                if (code === COLOR_INDEX.T && !(dl === 0 || dc === 0 || Math.abs(dl) === Math.abs(dc))) tealRule = false;
                if (code === COLOR_INDEX.B && (dl === 0 || dc === 0 || Math.abs(dl) === Math.abs(dc))) blueRule = false;
            }
            if (counts[COLOR_INDEX.R] !== 1) exactR = false;
            if (counts[COLOR_INDEX.O] !== 2) exactO = false;
            if (counts[COLOR_INDEX.Y] !== 3) exactY = false;
            if (counts[COLOR_INDEX.G] !== 4) exactG = false;
        }
        test("4. Cada tabuleiro possui exatamente 1 vermelha", exactR);
        test("5. Cada tabuleiro possui exatamente 2 laranjas", exactO);
        test("6. Cada tabuleiro possui exatamente 3 amarelas", exactY);
        test("7. Cada tabuleiro possui exatamente 4 verdes", exactG);
        test("8. Toda laranja é ortogonalmente adjacente", orangeRule);
        test("9. Toda amarela está em diagonal", yellowRule);
        test("10. Toda verde compartilha linha ou coluna", greenRule);
        test("11. Toda ciana compartilha linha, coluna ou diagonal", tealRule);
        test("12. Toda azul não compartilha linha, coluna ou diagonal", blueRule);

        let weightSum = 0;
        for (let i = 0; i < engine.weights.length; i += 1) weightSum += engine.weights[i];
        test("13. Soma dos pesos ≈ 1", nearlyEqual(weightSum, 1, 1e-10), String(weightSum));

        const empty = new Array(CELL_COUNT).fill(null);
        const initial = analyzeState(engine, empty);
        let allCellSumsOne = true;
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            let sum = 0;
            for (let color = 0; color < 6; color += 1) sum += initial.probabilities[cell][color];
            if (!nearlyEqual(sum, 1, 1e-9)) allCellSumsOne = false;
        }
        test("14. Probabilidades das seis cores somam 1 em cada casa", allCellSumsOne);

        let redUniform = true;
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
            const expected = cell === CENTER_INDEX ? 0 : 1 / 24;
            if (!nearlyEqual(initial.redProbabilities[cell], expected, 1e-9)) redUniform = false;
        }
        test("15. P(vermelha) inicial = 1/24 nas 24 casas", redUniform);
        test("16. P(vermelha) no centro = 0", nearlyEqual(initial.redProbabilities[CENTER_INDEX], 0, 1e-12));

        const expectedDist = { R: 1 / 24, O: 7 / 72, Y: 7 / 48, G: 17 / 108, T: 61 / 432, B: 5 / 12 };
        let distOk = true;
        for (const [code, expected] of Object.entries(expectedDist)) {
            if (!nearlyEqual(initial.probabilities[6][COLOR_INDEX[code]], expected, 1e-9)) distOk = false;
        }

        const expectedRaw = { R: 1800, O: 2040, Y: 1260, G: 3920, T: 2980, B: 4800 };
        const rawCounts = Object.fromEntries(UI_COLOR_ORDER.map(code => [code, 0]));
        const effectiveCounts = Object.fromEntries(UI_COLOR_ORDER.map(code => [code, 0]));
        for (let b = 0; b < engine.count; b += 1) {
            const code = COLOR_CODES[engine.data[b * CELL_COUNT + 6]];
            rawCounts[code] += 1;
            effectiveCounts[code] += engine.weights[b] * EXPECTED_BOARD_COUNT;
        }
        for (const code of UI_COLOR_ORDER) {
            if (rawCounts[code] !== expectedRaw[code]) distOk = false;
        }
        const expectedEffective = { R: 700, O: 1633.3333333333333, Y: 2450, G: 2644.4444444444443, T: 2372.222222222222, B: 7000 };
        for (const code of UI_COLOR_ORDER) {
            if (!nearlyEqual(effectiveCounts[code], expectedEffective[code], 1e-6)) distOk = false;
        }
        test("17. Distribuição e contagens de L2C2 coincidem com a referência", distOk);
        test("18. EV imediato de L2C2 = 35,5208333333", nearlyEqual(initial.immediateEV[6], 35.5208333333, 1e-9), String(initial.immediateEV[6]));

        const expectedFirst = new Set([6, 8, 16, 18]);
        const initialPolicyCheck = getPrecomputedSolution(empty, 5, initial);
        const secondExpected = { R: 1, O: 7, Y: 2, G: 9, T: 0, B: 14 };
        let secondOk = true;
        for (const [code, action] of Object.entries(secondExpected)) {
            const branchObs = empty.slice();
            branchObs[6] = code;
            const branchAnalysis = analyzeState(engine, branchObs);
            const branchPolicy = getPrecomputedSolution(branchObs, 4, branchAnalysis);
            if (!branchPolicy || branchPolicy.action !== action) secondOk = false;
        }
        test("19. Bellman inicial usa uma das quatro posições simétricas e os seis segundos cliques esperados", Boolean(initialPolicyCheck) && expectedFirst.has(initialPolicyCheck.action) && secondOk && nearlyEqual(initialPolicyCheck.evTotal, 344.7285879629685, 1e-9));

        const impossibleObs = empty.slice();
        impossibleObs[0] = "R";
        impossibleObs[1] = "R";
        test("20. Estados impossíveis são detectados", analyzeState(engine, impossibleObs).impossible);

        const stateForUndo = new StateManager();
        stateForUndo.observations[6] = "Y";
        stateForUndo.spReceived = 55;
        stateForUndo.pushUndo();
        stateForUndo.observations[7] = "G";
        stateForUndo.spReceived = 90;
        const undoOk = stateForUndo.undo() && stateForUndo.observations[6] === "Y" && stateForUndo.observations[7] == null && stateForUndo.spReceived === 55;
        test("21. Desfazer restaura exatamente o estado anterior", undoOk);

        const stateWithUnknownClick = new StateManager();
        stateWithUnknownClick.observations[12] = "X";
        const xAnalysis = analyzeState(engine, stateWithUnknownClick.observations);
        test("22. Clique X consome um clique sem filtrar tabuleiros", stateWithUnknownClick.clicksUsed === 1 && xAnalysis.rawCount === engine.count && nearlyEqual(xAnalysis.z, initial.z, 1e-9));

        const redSelections = new Set();
        for (let desired = 0; desired < 24; desired += 1) {
            let calls = 0;
            const deterministicIndex = max => {
                const currentCall = calls++;
                return currentCall === 0 ? desired % max : 0;
            };
            redSelections.add(generateRandomValidBoard(deterministicIndex).red);
        }
        test("23. Simulador seleciona a vermelha uniformemente entre 24 posições", redSelections.size === 24);

        const redConfigCounts = [...engine.perRedCounts.values()];
        const generatedPolicy = generateRandomValidBoard(() => 0).generationPolicy;
        test("24. Simulador não sorteia uniformemente entre os 16.800 tabuleiros", generatedPolicy === "hierarchical-uniform" && new Set(redConfigCounts).size === 3);
        test("25. O quinto clique encerra e revela o tabuleiro no simulador", !simulatorShouldReveal(4) && simulatorShouldReveal(5));

        const passed = failures.length === 0;
        if (log && typeof console !== "undefined") {
            if (passed) console.info("Todos os testes do Ourochest foram aprovados.");
            else {
                console.error("Falhas nos testes do Ourochest:");
                failures.forEach(item => console.error(`- ${item}`));
            }
        }
        return { passed, tests, failures };
    }

    /* ========================================================
       MOUNT
       ======================================================== */
    let appInstance = null;

    function injectModule() {
        if (typeof document === "undefined") return;
        if (!document.getElementById("orbe-solver-style")) {
            const style = document.createElement("style");
            style.id = "orbe-solver-style";
            style.textContent = MODULE_CSS;
            document.head.appendChild(style);
        }
        const app = document.getElementById("app");
        if (app && !document.getElementById("view-orbe")) app.insertAdjacentHTML("beforeend", MODULE_HTML);
        if (document.getElementById("view-orbe") && !appInstance) appInstance = new OrbeApp();
    }

    const publicApi = {
        activate() {
            injectModule();
            appInstance?.activate();
        },
        showHub() {
            injectModule();
            appInstance?.showHub();
        },
        runSelfTests,
        generateBoards,
        analyzeState,
        generateRandomValidBoard,
        get app() { return appInstance; },
        constants: Object.freeze({ GRID_SIZE, CELL_COUNT, CENTER_INDEX, MAX_CLICKS, EXPECTED_BOARD_COUNT })
    };

    globalThis.OrbeSolver = publicApi;

    if (typeof document !== "undefined") {
        // O script é carregado no fim do <body>; se #app já existe, injeta
        // imediatamente para que script.js descubra view-orbe na sequência.
        if (document.getElementById("app")) injectModule();
        else document.addEventListener("DOMContentLoaded", injectModule, { once: true });
    }
})();
