/* ============================================================
   KAKERALOOT — TELA
   ------------------------------------------------------------
   Monta a aba antes do script.js, como o OrbeSolver. O script.js
   descobre a tela pelo id "view-kakeraloot" e chama activate().
   Os dados ficam em state.config.kakeraloot: um por perfil e já
   incluídos no backup. Os cálculos ficam em kakeraloot-model.js.
   ============================================================ */
(() => {
    const M = window.KakeraLootModel;
    if (!M) return;

    const RENDER_DELAY_MS = 250;
    const MAX_FORECAST_LOOTS = 1e9;

    // Campos do "Seu estado". O número de loots e Q/Q entram nas contas.
    const STATE_FIELDS = [
        { field: "loots", label: "USOS DE $KL" },
        { field: "kakeracLoots", label: "LOOTS DE KAKERAC" },
        { field: "quality", label: "QUALITY LVL", max: 100 },
        { field: "quantity", label: "QUANTITY LVL", max: 100 },
        { field: "balance", label: "SALDO DE KAKERA" },
        { field: "stack", label: "ROLLS EMPILHADOS" },
        { field: "disable", label: "DISABLELIST" },
        { field: "permanent", label: "ROLLS PERMANENTES" },
        { field: "wishlist", label: "SLOTS DE WISHLIST" },
        { field: "starBranches", label: "STAR BRANCHES" },
        { field: "rtHours", label: "REDUÇÃO DO $RT (H)", max: M.RTCD_CAP_HOURS },
        { field: "wishprotect", label: "WISHPROTECT LVL" },
        { field: "bku", label: "RESET DO $BKU (%)" },
        { field: "mudapins", label: "MUDAPINS" }
    ];

    const VIEW_HTML = `
    <section id="view-kakeraloot" class="view kl-view" aria-label="Kakeraloot">
        <div class="page-head">
            <h1><span class="page-icon">🎁</span> KAKERALOOT</h1>
            <p class="subtitle">Cole o seu $lk para ver a previsão de recompensas, a sua sorte e o custo em kakera.</p>
        </div>

        <div class="panel">
            <div class="panel-title"><span class="bar cyan"></span>ENTRADA</div>
            <div class="kl-input-grid">
                <div class="field kl-paste">
                    <label for="klLkText">RESPOSTA DO $LK</label>
                    <textarea id="klLkText" rows="9" spellcheck="false" placeholder="oseraf - Kakeraloots
:rollstack: Stacks rolls: 1 ($us)
:mudapin: Mudapins: 1 ($mp)

Quantity LVL 5
Quality LVL 5
Usos de $kl: 6
779:kakera:"></textarea>
                </div>
                <div class="kl-input-side">
                    <div class="field">
                        <label for="klKlvalue">$KLVALUE DO SERVIDOR</label>
                        <input id="klKlvalue" type="number" min="500" max="20000" step="100" />
                    </div>
                    <div class="field">
                        <label for="klForecastN">PRÓXIMAS N LOOTS</label>
                        <input id="klForecastN" type="number" min="1" max="${MAX_FORECAST_LOOTS}" step="100" />
                    </div>
                    <div class="field">
                        <label for="klDlMode">MODO DA DISABLELIST</label>
                        <select id="klDlMode">
                            <option value="0">Automático</option>
                            <option value="1">Personagens (modo 1)</option>
                            <option value="2">Limites $wa/$ha (modo 2)</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <div class="panel">
            <div class="panel-title"><span class="bar purple"></span>SEU ESTADO <span class="kl-user" id="klUser"></span></div>
            <p class="subtitle kl-hint">Preenchido pelo $lk. Corrija à mão o que precisar: os ajustes valem até você colar outro $lk.</p>
            <div class="kl-state-grid" id="klStateGrid"></div>
            <div class="kl-ignored" id="klIgnored" hidden></div>
        </div>

        <div class="panel">
            <div class="panel-title"><span class="bar cyan"></span>PREVISÃO <span class="kl-user" id="klForecastLabel"></span></div>
            <div class="kl-table-wrap">
                <table class="kl-table">
                    <thead>
                        <tr>
                            <th>RECOMPENSA</th>
                            <th class="num">ATUAL</th>
                            <th class="num" title="Com o que você tem hoje">CHANCE POR LOOT</th>
                            <th class="num">P5</th>
                            <th class="num">MEDIANA</th>
                            <th class="num">P95</th>
                            <th class="num">MÉDIA</th>
                            <th class="num" title="Chance de ganhar ao menos 1 nessas loots">P(≥1)</th>
                            <th class="num" title="Quanto a mais você quer ganhar">META +N</th>
                            <th class="num" title="Loots até o ganho médio alcançar a meta">LOOTS ESTIMADAS</th>
                        </tr>
                    </thead>
                    <tbody id="klForecastBody"></tbody>
                </table>
            </div>
        </div>

        <div class="panel">
            <div class="panel-title"><span class="bar green"></span>SUA SORTE</div>
            <p class="subtitle kl-hint">Compara o que você tem com jogadores simulados no mesmo número de loots. Acima de 50 % é mais sorte que o típico.</p>
            <div id="klLuck"></div>
        </div>

        <div class="panel">
            <div class="panel-title"><span class="bar yellow"></span>ECONOMIA</div>
            <div class="grid-4 kl-kpis">
                <div class="kpi-box"><div class="kpi-value pink" id="klCost">—</div><div class="kpi-label" id="klCostLabel">CUSTO</div></div>
                <div class="kpi-box"><div class="kpi-value green" id="klReturn">—</div><div class="kpi-label">RETORNO MÉDIO EM KAKERA</div></div>
                <div class="kpi-box"><div class="kpi-value yellow" id="klNet">—</div><div class="kpi-label">CUSTO LÍQUIDO</div></div>
                <div class="kpi-box"><div class="kpi-value cyan" id="klAffordable">—</div><div class="kpi-label">LOOTS QUE O SALDO PAGA</div></div>
            </div>
            <div class="kl-qq">
                <div class="field">
                    <label for="klQualityTarget">QUALITY ALVO</label>
                    <input id="klQualityTarget" type="number" min="0" max="100" step="1" />
                </div>
                <div class="field">
                    <label for="klQuantityTarget">QUANTITY ALVO</label>
                    <input id="klQuantityTarget" type="number" min="0" max="100" step="1" />
                </div>
                <div class="kl-qq-result" id="klQqCost"></div>
            </div>
        </div>

        <div class="panel">
            <div class="panel-title"><span class="bar pink"></span>COMO LER ESSES NÚMEROS</div>
            <ul class="kl-notes">
                <li><b>São estimativas.</b> As taxas vêm de um estudo feito pela comunidade, não de dados oficiais do Mudae, e cada loot é um sorteio independente.</li>
                <li><b>P5 a P95</b> é onde o resultado cai cerca de 90 % das vezes. Essa faixa cobre só a variação do sorteio, não a incerteza das taxas, então o resultado real pode sair dela com mais frequência.</li>
                <li><b>Sorte</b> vem do modelo, sem comparar com jogadores reais. Ela supõe que Quality e Quantity sempre estiveram no nível atual: se você subiu aos poucos, sua sorte real é maior do que a mostrada.</li>
                <li><b>Disablelist</b> inclui o que veio do <code>$kt</code>, e o <code>$lk</code> também soma loots de kakeraC, então esses totais podem estar acima do que as loots renderam.</li>
                <li><b>Redução do $rt</b> tem poucos dados no estudo e para em ${M.RTCD_CAP_HOURS} h. <b>Wishprotect</b> continua subindo, mas o efeito para no nível ${M.WISHPROTECT_MAX_LEVEL.toLocaleString("pt-BR")} (chance de 1/499).</li>
                <li><b>Rolls empilhados:</b> acima de ${M.BATCH_SIZE.toLocaleString("pt-BR")} loots, a conta supõe compras de ${M.BATCH_SIZE.toLocaleString("pt-BR")} em ${M.BATCH_SIZE.toLocaleString("pt-BR")}, com a faixa de valor fixada no início de cada compra.</li>
                <li><b>Custo de Quality/Quantity</b> segue a tabela da wiki. O custo da previsão é N × $klvalue, sem reinvestir a kakera que volta.</li>
            </ul>
            <p class="subtitle kl-credits">Modelo e taxas: <a href="https://colblitz.com/mudae/kloots-paper-20260908" target="_blank" rel="noopener">estudo do colblitz</a> e <a href="https://colblitz.com/mudae/klcalc" target="_blank" rel="noopener">calculadora dele</a>, que compara com jogadores reais. Valores de loots e preços: <a href="https://mudae.fandom.com/wiki/Kakera_Loots" target="_blank" rel="noopener">wiki do Mudae</a>.</p>
        </div>
    </section>`;

    const DEFAULT_CFG = {
        lkText: "",
        klvalue: 1000,
        forecastN: 1000,
        dlMode: 0,
        targets: {},
        overrides: {},
        qualityTarget: 100,
        quantityTarget: 100
    };

    let $ = null;
    let cfg = { ...DEFAULT_CFG };
    let renderTimer = null;
    const cache = new Map();

    const byId = id => document.getElementById(id);

    /* ---------- Formatação ---------- */
    function fmt(value, digits = 0) {
        if (value === null || value === undefined || !Number.isFinite(value)) return "—";
        return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
    }

    // Poucas casas para valores pequenos, inteiro para os grandes.
    function fmtAmount(value) {
        if (!Number.isFinite(value)) return "—";
        const abs = Math.abs(value);
        return fmt(value, abs >= 1000 ? 0 : abs >= 10 ? 1 : 2);
    }

    function fmtSig(value) {
        if (!Number.isFinite(value)) return "—";
        return fmt(Number(value.toPrecision(3)), 2);
    }

    function fmtCompact(value) {
        if (!Number.isFinite(value)) return "—";
        const abs = Math.abs(value);
        if (abs >= 1e9) return `${fmt(value / 1e9, 2)} bi`;
        if (abs >= 1e6) return `${fmt(value / 1e6, 2)} mi`;
        return fmt(value);
    }

    /* ---------- Dados ---------- */
    function readCfg() {
        const stored = typeof state !== "undefined" && state.config ? state.config.kakeraloot : null;
        cfg = {
            ...DEFAULT_CFG,
            ...(stored || {}),
            targets: { ...((stored && stored.targets) || {}) },
            overrides: { ...((stored && stored.overrides) || {}) }
        };
    }

    function saveCfg() {
        if (typeof state === "undefined" || !state.config) return;
        state.config.kakeraloot = cfg;
        if (typeof scheduleSaveConfig === "function") scheduleSaveConfig();
    }

    function clampInt(value, lo, hi, fallback) {
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n)) return fallback;
        return Math.min(hi, Math.max(lo, n));
    }

    function currentState() {
        const parsed = M.parseLk(cfg.lkText);
        const fields = { ...parsed.fields, ...cfg.overrides };
        const dlMode = cfg.dlMode || parsed.dlMode || 1;
        return {
            parsed,
            fields,
            dlMode,
            hasData: Boolean(cfg.lkText.trim()) || Object.keys(cfg.overrides).length > 0,
            klvalue: clampInt(cfg.klvalue, 500, 20000, 1000),
            forecastN: clampInt(cfg.forecastN, 1, MAX_FORECAST_LOOTS, 1000)
        };
    }

    function rewardOpts(reward, st) {
        const { fields } = st;
        return {
            current: Number(fields[reward.field]) || 0,
            loots: (Number(fields.loots) || 0) + (Number(fields.kakeracLoots) || 0),
            quality: Number(fields.quality) || 0,
            quantity: Number(fields.quantity) || 0,
            klvalue: st.klvalue,
            dlMode: st.dlMode
        };
    }

    // A simulação só roda de novo quando as entradas dela mudam.
    function cached(key, compute) {
        if (cache.has(key)) return cache.get(key);
        if (cache.size > 200) cache.clear();
        const value = compute();
        cache.set(key, value);
        return value;
    }

    /* ---------- Render ---------- */
    function buildStaticParts() {
        $.stateGrid.innerHTML = STATE_FIELDS.map(f => `
            <div class="field">
                <label for="klField_${f.field}" id="klFieldLabel_${f.field}">${f.label}</label>
                <input id="klField_${f.field}" data-field="${f.field}" type="number" min="0" ${f.max !== undefined ? `max="${f.max}"` : ""} step="any" />
            </div>`).join("");

        $.forecastBody.innerHTML = M.REWARDS.map(r => `
            <tr data-reward="${r.key}">
                <td class="kl-reward"><span class="kl-ico">${r.icon}</span><span class="kl-reward-text"><span class="kl-reward-name">${r.label}</span><span class="kl-unit" data-cell="unit"></span><span class="kl-tag" data-cell="tag" hidden></span></span></td>
                <td class="num" data-cell="current">—</td>
                <td class="num" data-cell="chance">—</td>
                <td class="num" data-cell="p5">—</td>
                <td class="num" data-cell="median">—</td>
                <td class="num" data-cell="p95">—</td>
                <td class="num" data-cell="mean">—</td>
                <td class="num" data-cell="pAny">—</td>
                <td class="num"><input class="kl-target" data-target="${r.key}" type="number" min="0" step="any" aria-label="Meta de ${r.label}" /></td>
                <td class="num" data-cell="loots">—</td>
            </tr>`).join("");

        $.luck.innerHTML = M.REWARDS.filter(r => r.cumulative).map(r => `
            <div class="kl-luck-row" data-luck="${r.key}">
                <div class="kl-luck-name"><span class="kl-ico">${r.icon}</span>${r.label}</div>
                <div class="kl-luck-track"><span class="kl-luck-mid"></span><span class="kl-luck-marker" data-luck-marker hidden></span></div>
                <div class="kl-luck-value" data-luck-value>—</div>
                <div class="kl-luck-detail" data-luck-detail></div>
            </div>`).join("");
    }

    function setInputValue(input, value) {
        if (document.activeElement !== input) input.value = value;
    }

    function syncInputs(st) {
        setInputValue($.lkText, cfg.lkText);
        setInputValue($.klvalue, cfg.klvalue);
        setInputValue($.forecastN, cfg.forecastN);
        setInputValue($.dlMode, String(cfg.dlMode));
        setInputValue($.qualityTarget, cfg.qualityTarget);
        setInputValue($.quantityTarget, cfg.quantityTarget);
        for (const f of STATE_FIELDS) {
            const input = byId(`klField_${f.field}`);
            setInputValue(input, st.hasData ? st.fields[f.field] : "");
            input.classList.toggle("kl-edited", cfg.overrides[f.field] !== undefined);
        }
        for (const input of $.forecastBody.querySelectorAll("[data-target]")) {
            const target = cfg.targets[input.dataset.target];
            setInputValue(input, target === undefined ? "" : target);
        }
    }

    function renderState(st) {
        // O nome vem do texto colado: textContent evita injetar HTML.
        $.user.textContent = st.fields.username ? `· ${st.fields.username}` : "";
        $.fieldDisableLabel.textContent = st.dlMode === 2 ? "DISABLELIST ($WA/$HA)" : "DISABLELIST (PERSONAGENS)";
        const ignored = st.parsed.ignored;
        $.ignored.hidden = ignored.length === 0;
        $.ignored.textContent = "";
        if (ignored.length) {
            const title = document.createElement("b");
            title.textContent = `Linhas não reconhecidas (${ignored.length}), preencha à mão se precisar:`;
            $.ignored.appendChild(title);
            for (const line of ignored) {
                const row = document.createElement("div");
                row.textContent = line;
                $.ignored.appendChild(row);
            }
        }
    }

    function chanceText(info, reward) {
        if (info.perLoot !== undefined) return `≈ ${fmtAmount(info.perLoot)} por loot`;
        if (!Number.isFinite(info.oneIn)) return reward.cap !== undefined ? "no teto" : "—";
        return `1 em ${fmtSig(info.oneIn)}`;
    }

    function rewardUnit(reward, st) {
        if (reward.key === "disable") return st.dlMode === 2 ? "$wa/$ha" : "personagens";
        return reward.unit || "";
    }

    function renderForecast(st) {
        $.forecastLabel.textContent = `· ganho nas próximas ${fmt(st.forecastN)} loots`;
        for (const reward of M.REWARDS) {
            const row = $.forecastBody.querySelector(`[data-reward="${reward.key}"]`);
            const cell = name => row.querySelector(`[data-cell="${name}"]`);
            const opts = rewardOpts(reward, st);

            cell("unit").textContent = rewardUnit(reward, st);
            const capped = reward.cap !== undefined && opts.current >= reward.cap;
            const wpCapped = reward.key === "wishprotect" && opts.current >= M.WISHPROTECT_MAX_LEVEL;
            row.classList.toggle("kl-capped", capped);
            const tagEl = cell("tag");
            tagEl.hidden = !(capped || wpCapped || reward.unreliable);
            tagEl.textContent = capped || wpCapped ? "NO TETO" : "POUCOS DADOS";

            if (!st.hasData) {
                for (const name of ["current", "chance", "p5", "median", "p95", "mean", "pAny", "loots"]) cell(name).textContent = "—";
                continue;
            }

            const key = JSON.stringify(["f", reward.key, st.forecastN, opts]);
            const result = cached(key, () => M.forecast(reward.key, st.forecastN, opts));
            cell("current").textContent = reward.special === "kakera" ? fmt(opts.current) : fmtAmount(opts.current);
            cell("chance").textContent = chanceText(M.perLootInfo(reward.key, opts), reward);
            cell("p5").textContent = `+${fmtAmount(result.p5)}`;
            cell("median").textContent = `+${fmtAmount(result.median)}`;
            cell("p95").textContent = `+${fmtAmount(result.p95)}`;
            cell("mean").textContent = `+${fmtAmount(result.mean)}`;
            cell("pAny").textContent = `${fmt(result.pAny * 100, 1)} %`;

            const target = Number(cfg.targets[reward.key]);
            const loots = target > 0 ? M.lootsForTarget(reward.key, target, opts) : null;
            const lootsEl = cell("loots");
            lootsEl.classList.toggle("kl-impossible", loots === Infinity);
            if (loots === null) lootsEl.textContent = "—";
            else if (loots === Infinity) lootsEl.textContent = "passa do teto";
            else lootsEl.textContent = fmt(Math.ceil(loots));
        }
    }

    // Com 2000 simulações não dá para afirmar exatamente 0 % nem 100 %.
    function percentileText(percentile) {
        if (percentile < 0.1) return "< 0,1 %";
        if (percentile > 99.9) return "> 99,9 %";
        return `${fmt(percentile, percentile < 1 || percentile > 99 ? 1 : 0)} %`;
    }

    function renderLuck(st) {
        for (const reward of M.REWARDS.filter(r => r.cumulative)) {
            const row = $.luck.querySelector(`[data-luck="${reward.key}"]`);
            const marker = row.querySelector("[data-luck-marker]");
            const valueEl = row.querySelector("[data-luck-value]");
            const detailEl = row.querySelector("[data-luck-detail]");
            const opts = rewardOpts(reward, st);
            const key = JSON.stringify(["l", reward.key, opts.current, opts.loots, opts.quality, opts.quantity, opts.dlMode]);
            const result = st.hasData ? cached(key, () => M.luck(reward.key, opts)) : null;

            marker.hidden = !result;
            valueEl.className = "kl-luck-value";
            if (!result) {
                valueEl.textContent = "—";
                detailEl.textContent = st.hasData ? "Informe os usos de $kl." : "";
                continue;
            }
            marker.style.left = `${result.percentile}%`;
            valueEl.textContent = percentileText(result.percentile);
            valueEl.classList.add(result.percentile >= 50 ? "kl-lucky" : "kl-unlucky");
            marker.classList.toggle("kl-unlucky-bg", result.percentile < 50);
            detailEl.textContent = `Você: ${fmtAmount(opts.current)} · típico: ${fmtAmount(result.expected)} (${fmtAmount(result.p5)} a ${fmtAmount(result.p95)})${result.lowData ? " · poucas loots, diz pouco" : ""}`;
        }
    }

    function renderEconomy(st) {
        const { fields, forecastN, klvalue } = st;
        const quality = Number(fields.quality) || 0;
        const quantity = Number(fields.quantity) || 0;
        const cost = forecastN * klvalue;
        const back = forecastN * M.kakeraPerLoot(quality, quantity, klvalue);
        const hasData = st.hasData;

        $.costLabel.textContent = `CUSTO DE ${fmt(forecastN)} LOOTS`;
        $.cost.textContent = fmtCompact(cost);
        $.returned.textContent = hasData ? fmtCompact(back) : "—";
        $.net.textContent = hasData ? fmtCompact(cost - back) : "—";
        $.affordable.textContent = hasData ? fmt(Math.floor((Number(fields.balance) || 0) / klvalue)) : "—";

        const qualityTo = clampInt(cfg.qualityTarget, 0, 100, 100);
        const quantityTo = clampInt(cfg.quantityTarget, 0, 100, 100);
        const qualityCost = M.qualityQuantityCost(quality, qualityTo);
        const quantityCost = M.qualityQuantityCost(quantity, quantityTo);
        $.qqCost.textContent = "";
        const total = document.createElement("b");
        total.textContent = `${fmt(qualityCost + quantityCost)} kakera`;
        $.qqCost.append(
            "Para chegar ao alvo: ",
            total,
            ` · Quality ${fmt(quality)} → ${qualityTo}: ${fmt(qualityCost)} · Quantity ${fmt(quantity)} → ${quantityTo}: ${fmt(quantityCost)}`
        );
    }

    function render() {
        const st = currentState();
        syncInputs(st);
        renderState(st);
        renderForecast(st);
        renderLuck(st);
        renderEconomy(st);
    }

    function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(render, RENDER_DELAY_MS);
    }

    function changed() {
        saveCfg();
        scheduleRender();
    }

    /* ---------- Eventos ---------- */
    function bindEvents() {
        $.lkText.addEventListener("input", () => {
            cfg.lkText = $.lkText.value;
            cfg.overrides = {}; // um $lk novo substitui os ajustes manuais
            changed();
        });
        const bindNumber = (input, key) => input.addEventListener("input", () => {
            cfg[key] = input.value === "" ? DEFAULT_CFG[key] : Number(input.value);
            changed();
        });
        bindNumber($.klvalue, "klvalue");
        bindNumber($.forecastN, "forecastN");
        bindNumber($.qualityTarget, "qualityTarget");
        bindNumber($.quantityTarget, "quantityTarget");
        $.dlMode.addEventListener("change", () => {
            cfg.dlMode = Number($.dlMode.value) || 0;
            changed();
        });
        $.stateGrid.addEventListener("input", ev => {
            const field = ev.target.dataset.field;
            if (!field) return;
            if (ev.target.value === "") {
                delete cfg.overrides[field];
            } else {
                const def = STATE_FIELDS.find(f => f.field === field);
                let value = Math.max(0, Number(ev.target.value) || 0);
                if (def.max !== undefined) value = Math.min(def.max, value);
                cfg.overrides[field] = value;
            }
            changed();
        });
        $.forecastBody.addEventListener("input", ev => {
            const key = ev.target.dataset.target;
            if (!key) return;
            if (ev.target.value === "") delete cfg.targets[key];
            else cfg.targets[key] = Math.max(0, Number(ev.target.value) || 0);
            changed();
        });
        // Ao sair do campo, mostra o valor já corrigido para os limites.
        for (const input of [$.klvalue, $.forecastN, $.qualityTarget, $.quantityTarget]) {
            input.addEventListener("blur", render);
        }
        $.klvalue.addEventListener("change", () => {
            cfg.klvalue = clampInt(cfg.klvalue, 500, 20000, 1000);
            saveCfg();
        });
        $.forecastN.addEventListener("change", () => {
            cfg.forecastN = clampInt(cfg.forecastN, 1, MAX_FORECAST_LOOTS, 1000);
            saveCfg();
        });
        for (const [input, key] of [[$.qualityTarget, "qualityTarget"], [$.quantityTarget, "quantityTarget"]]) {
            input.addEventListener("change", () => {
                cfg[key] = clampInt(cfg[key], 0, 100, 100);
                saveCfg();
            });
        }
        $.stateGrid.addEventListener("focusout", render);
    }

    /* ---------- Montagem ---------- */
    function mount() {
        const app = byId("app");
        if (!app || byId("view-kakeraloot")) return;
        app.insertAdjacentHTML("beforeend", VIEW_HTML);
        $ = {
            lkText: byId("klLkText"),
            klvalue: byId("klKlvalue"),
            forecastN: byId("klForecastN"),
            dlMode: byId("klDlMode"),
            user: byId("klUser"),
            stateGrid: byId("klStateGrid"),
            ignored: byId("klIgnored"),
            forecastLabel: byId("klForecastLabel"),
            forecastBody: byId("klForecastBody"),
            luck: byId("klLuck"),
            cost: byId("klCost"),
            costLabel: byId("klCostLabel"),
            returned: byId("klReturn"),
            net: byId("klNet"),
            affordable: byId("klAffordable"),
            qualityTarget: byId("klQualityTarget"),
            quantityTarget: byId("klQuantityTarget"),
            qqCost: byId("klQqCost")
        };
        buildStaticParts();
        $.fieldDisableLabel = byId("klFieldLabel_disable");
        bindEvents();
    }

    // Chamado pelo showView: relê o perfil ativo, que pode ter mudado em Configurações.
    function activate() {
        if (!$) return;
        clearTimeout(renderTimer);
        readCfg();
        render();
    }

    mount();
    window.KakeraLoot = { activate };
})();
