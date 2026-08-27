/* ============================================================
   MUDAE TRACKER — lógica do app
   Probabilidade: p = 1 - (1 - buff/pool) ^ (rollsPorDia * dias)
   (cálculo ainda provisório — será ajustado depois)
   Persistência: IndexedDB via database.js (com backup em JSON)
   ============================================================ */

// Valores padrão de configuração. Cada PERFIL (ver PROFILES mais abaixo)
// guarda a própria cópia dessas configurações + a própria lista de
// personagens no IndexedDB (database.js já isola tudo isso internamente
// pelo perfil ativo); aqui só precisamos de uma função pra gerar uma cópia
// nova e independente sempre que um perfil "vazio" for carregado.
const DEFAULT_CONFIG = {
    // Identificação
    serverName: "Servidor Anime",
    userTag: "Otaku Master",

    // Configurações de servidor
    poolWA: 7000,
    poolHA: 7000,
    poolWG: 5000,
    poolHG: 5000,
    rollsPerHour: 0,
    gameplayHour: 0,
    haremLimit: 0, // 0 = sem limite

    // Buffs do jogador
    tutorialPage: 0,
    useSlashCommands: false,
    boostWishRolls: 0,
    personalRare: 1,
    levelBronze: 0,
    levelPrata: 0,
    levelOuro: 0,
    levelSafira: 0,
    levelRuby: 0,
    levelEsmeralda: 0,
    levelDiamante: 0,

    // Kakera Tower: lista de torres, cada uma com 12 andares (true = comprado)
    kakeraTowers: [],

    // Buffs de perfil da $shop: { s1: nivel, s2: nivel, ... } (ver SHOP_DEFS)
    shopLevels: {},


    // Preferência de exibição da lista de personagens: "list" ou "grid"
    viewMode: "list",

    // Exibe todas as informações nos cards da grade. Quando false, a grade
    // destaca a imagem e mantém somente nome, kakera e botões de ação.
    gridDetailsEnabled: true
};

function cloneDefaultConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

const state = {
    config: cloneDefaultConfig(),
    characters: []
};


/* ============================================================
   MODAL GLOBAL DE MENSAGENS DO SISTEMA
   ------------------------------------------------------------
   Centraliza avisos, confirmações e entradas de texto que antes
   dependiam dos diálogos nativos. As funções retornam Promises para
   manter a mesma semântica dos diálogos nativos sem bloquear a UI.

   API pública:
     showSystemAlert(message, options)
       -> exibe mensagem informativa; resolve quando for fechada.

     showSystemConfirm(message, options)
       -> resolve true ao confirmar e false ao cancelar/fechar.

     showSystemPrompt(message, options)
       -> resolve o texto digitado ou null ao cancelar/fechar.

   options:
     title        -> título da modal.
     type         -> "info", "warning" ou "danger".
     confirmText  -> texto do botão principal.
     cancelText   -> texto do botão secundário.
     defaultValue -> valor inicial do input (prompt).
     inputLabel   -> label do input (prompt).
     placeholder  -> placeholder do input (prompt).
   ============================================================ */
const systemDialogOverlay = document.getElementById("systemDialogOverlay");
const systemDialogModal = document.getElementById("systemDialogModal");
const systemDialogTitle = document.getElementById("systemDialogTitle");
const systemDialogIcon = document.getElementById("systemDialogIcon");
const systemDialogMessage = document.getElementById("systemDialogMessage");
const systemDialogInputWrap = document.getElementById("systemDialogInputWrap");
const systemDialogInputLabel = document.getElementById("systemDialogInputLabel");
const systemDialogInput = document.getElementById("systemDialogInput");
const systemDialogCancel = document.getElementById("systemDialogCancel");
const systemDialogConfirm = document.getElementById("systemDialogConfirm");
const systemDialogClose = document.getElementById("systemDialogClose");

let activeSystemDialog = null;
let systemDialogLastFocus = null;

const SYSTEM_DIALOG_ICONS = {
    info: "◆",
    warning: "!",
    danger: "✕"
};

/**
 * Fecha a modal global e devolve o valor adequado à operação pendente.
 * O foco volta ao elemento que estava ativo antes da abertura.
 */
function closeSystemDialog(result) {
    if (!activeSystemDialog || !systemDialogOverlay) return;

    const { resolve } = activeSystemDialog;
    activeSystemDialog = null;

    systemDialogOverlay.classList.remove("active");
    systemDialogOverlay.setAttribute("aria-hidden", "true");

    const previousFocus = systemDialogLastFocus;
    systemDialogLastFocus = null;

    resolve(result);

    if (previousFocus && typeof previousFocus.focus === "function" && document.contains(previousFocus)) {
        requestAnimationFrame(() => previousFocus.focus());
    }
}

/**
 * Abre a modal global em um dos três modos: alert, confirm ou prompt.
 * Apenas uma instância pode ficar aberta por vez.
 */
function openSystemDialog({
    mode = "alert",
    title = "Mudae Tracker",
    message = "",
    type = "info",
    confirmText = "OK",
    cancelText = "CANCELAR",
    defaultValue = "",
    inputLabel = "VALOR",
    placeholder = ""
} = {}) {
    if (!systemDialogOverlay || !systemDialogModal) {
        // Fallback sem popup nativo: registra a falha e resolve de forma segura.
        console.error("[SystemDialog] Estrutura da modal não encontrada.", { mode, title, message });
        return Promise.resolve(mode === "confirm" ? false : mode === "prompt" ? null : true);
    }

    // Se uma chamada inesperadamente ocorrer enquanto outra está aberta,
    // cancela a anterior para nunca deixar uma Promise pendente.
    if (activeSystemDialog) {
        closeSystemDialog(activeSystemDialog.mode === "alert" ? true :
            activeSystemDialog.mode === "confirm" ? false : null);
    }

    const normalizedType = ["info", "warning", "danger"].includes(type) ? type : "info";
    systemDialogLastFocus = document.activeElement;

    systemDialogModal.classList.remove("dialog-info", "dialog-warning", "dialog-danger");
    systemDialogModal.classList.add(`dialog-${normalizedType}`);

    systemDialogTitle.textContent = String(title || "Mudae Tracker");
    systemDialogMessage.textContent = String(message || "");
    systemDialogIcon.textContent = SYSTEM_DIALOG_ICONS[normalizedType];
    systemDialogConfirm.textContent = String(confirmText || "OK");
    systemDialogCancel.textContent = String(cancelText || "CANCELAR");

    const isPrompt = mode === "prompt";
    const isAlert = mode === "alert";
    systemDialogInputWrap.hidden = !isPrompt;
    systemDialogCancel.hidden = isAlert;

    if (isPrompt) {
        systemDialogInputLabel.textContent = String(inputLabel || "VALOR");
        systemDialogInput.value = String(defaultValue ?? "");
        systemDialogInput.placeholder = String(placeholder || "");
    }

    systemDialogOverlay.classList.add("active");
    systemDialogOverlay.setAttribute("aria-hidden", "false");

    return new Promise(resolve => {
        activeSystemDialog = { mode, resolve };

        requestAnimationFrame(() => {
            if (isPrompt) {
                systemDialogInput.focus();
                systemDialogInput.select();
            } else {
                systemDialogConfirm.focus();
            }
        });
    });
}

/** Exibe uma mensagem e aguarda o usuário fechá-la. */
function showSystemAlert(message, options = {}) {
    return openSystemDialog({ ...options, mode: "alert", message });
}

/** Solicita confirmação usando a modal visual do sistema. */
function showSystemConfirm(message, options = {}) {
    return openSystemDialog({ ...options, mode: "confirm", message });
}

/** Solicita texto usando a modal visual do sistema. */
function showSystemPrompt(message, options = {}) {
    return openSystemDialog({ ...options, mode: "prompt", message });
}

/** Converte fechar/X/backdrop/ESC no resultado de cancelamento correto. */
function cancelActiveSystemDialog() {
    if (!activeSystemDialog) return;
    if (activeSystemDialog.mode === "alert") closeSystemDialog(true);
    else if (activeSystemDialog.mode === "confirm") closeSystemDialog(false);
    else closeSystemDialog(null);
}

if (systemDialogConfirm) {
    systemDialogConfirm.addEventListener("click", () => {
        if (!activeSystemDialog) return;
        if (activeSystemDialog.mode === "prompt") {
            closeSystemDialog(systemDialogInput.value);
        } else {
            closeSystemDialog(true);
        }
    });
}

if (systemDialogCancel) {
    systemDialogCancel.addEventListener("click", cancelActiveSystemDialog);
}

if (systemDialogClose) {
    systemDialogClose.addEventListener("click", cancelActiveSystemDialog);
}

if (systemDialogOverlay) {
    systemDialogOverlay.addEventListener("click", event => {
        if (event.target === systemDialogOverlay) cancelActiveSystemDialog();
    });

    systemDialogOverlay.addEventListener("keydown", event => {
        if (!activeSystemDialog) return;

        if (event.key === "Escape") {
            event.preventDefault();
            cancelActiveSystemDialog();
            return;
        }

        if (event.key === "Enter" && activeSystemDialog.mode === "prompt" && event.target === systemDialogInput) {
            event.preventDefault();
            closeSystemDialog(systemDialogInput.value);
        }
    });
}

const CAT_META = {
    favoritos: { label: "FAVORITOS", icon: "♥", color: "var(--pink)" },
    estrelas: { label: "ESTRELAS", icon: "★", color: "var(--yellow)" },
    comuns: { label: "COMUNS", icon: "👥", color: "var(--cyan)" }
};

// Seções exibidas na listagem de personagens. Favoritos e Estrelas viram UMA
// seção só (ordenada pela posição compartilhada da $wishlist), já que no
// Mudae de verdade elas são a mesma lista — só a cor/borda de cada card
// continua diferenciando quem é ♥ e quem é ★ (ver CSS .char-card.cat-*).
// "Comuns" continua em uma seção separada.
const LIST_SECTIONS = [
    {
        key: "wishlist",
        label: "FAVORITOS & ESTRELAS",
        icon: "♥★",
        color: "var(--pink)",
        categories: WISHLIST_CATEGORIES
    },
    {
        key: "comuns",
        label: "COMUNS",
        icon: "👥",
        color: "var(--cyan)",
        categories: ["comuns"]
    }
];

/* ============================================================
   BUFFS DE PERSONAGEM (OP) — janela "$op" do Mudae
   ------------------------------------------------------------
   Cada personagem pode ter até 10 perks fixos. Os perks 1–5 têm
   escala numérica oficial (fonte: Mudae Wiki, "Perks / Level"):
   o texto mostra "[LVL n] descrição: valor_atual > valor_próximo"
   até chegar em [MAX]. Os perks 6–10 não têm uma escala numérica
   documentada oficialmente por nível — por isso eles só têm os
   estados "bloqueado" e "obtido" (com o texto real do jogo), já
   que inventar números aqui seria chutar. Dá pra editar/estender
   esta lista livremente se você tiver o texto exato de mais níveis.

   Cada item de BUFF_DEFS tem:
     id      -> chave salva no personagem (character.opLevels[id])
     title   -> nome curto exibido no cabeçalho da linha
     levels  -> lista de estados possíveis, cada um com:
                  label -> "LVL 0", "LVL 1", ..., "MAX"
                  text  -> descrição completa mostrada nesse estado
   ============================================================ */
function scaledLevels(descPrefix, values, maxValue, unit) {
    // values = valor de bônus JÁ ATIVO em cada nível 0..6 (nível 0 = ainda não tem o perk).
    // Os perks 1–5 têm seis níveis compráveis. Ao chegar ao nível 6, a interface
    // exibe MAX (amarelo) para indicar que não há mais níveis que o usuário possa comprar.
    // O estado adicional abaixo continua reservado ao bônus automático de personagem
    // totalmente otimizado e não altera a regra/fórmula já existente.
    const levels = values.map((v, i) => {
        const next = i < values.length - 1 ? values[i + 1] : maxValue;
        const isLastPurchasableLevel = i === values.length - 1;
        return {
            label: isLastPurchasableLevel ? "MAX" : `LVL ${i}`,
            text: `${descPrefix}: ${v}${unit} > ${next}${unit}`
        };
    });
    levels.push({ label: "MAX", text: `${descPrefix}: ${maxValue}${unit}` });
    return levels;
}

function fixedLevels(descText, maxLabel) {
    // Os perks 6–10 possuem apenas um nível comprável. Assim que o perk é obtido,
    // ele já está no máximo e deve seguir o mesmo padrão visual amarelo do OP 10.
    return [
        { label: "LVL 0", text: "Perk ainda não desbloqueado por este personagem." },
        { label: maxLabel || "MAX", text: descText }
    ];
}

const BUFF_DEFS = [
    {
        id: "p1",
        title: "Spawn na Wishlist",
        levels: scaledLevels(
            "Chance de spawn aumentada para personagem(ns) adjacente(s) a este na sua $wishlist",
            [0, 15, 30, 45, 60, 75, 100], 115, "%"
        )
    },
    {
        id: "p2",
        title: "Valor base de Kakera",
        levels: scaledLevels(
            "Valor base de kakera aumentado",
            [0, 20, 40, 60, 80, 100, 130], 150, ""
        )
    },
    {
        id: "p3",
        title: "Botão de Kakera extra",
        levels: scaledLevels(
            "Chance de ganhar +1 botão de kakera",
            [0, 7, 14, 21, 28, 35, 48], 55, "%"
        )
    },
    {
        id: "p4",
        title: "Chave extra",
        levels: scaledLevels(
            "Chance de ganhar +1 chave",
            [0, 4, 8, 12, 16, 20, 26], 30, "%"
        )
    },
    {
        id: "p5",
        title: "Esferas por clique",
        levels: scaledLevels(
            "Esferas ganhas por botão de kakera (exceto roxo) clicado por você nesse personagem",
            [0, 3, 6, 9, 12, 15, 19], 23, ""
        )
    },
    {
        id: "p6",
        title: "Wish automática",
        levels: fixedLevels(
            "Um personagem aleatório da sua wishlist pode aparecer automaticamente depois que você rolar este personagem (2% de chance). Se não for reivindicado, este personagem é protegido enquanto for wish (wishprotect). Se já estiver reivindicado por você, você ganha 3 Chaves Ômega (veja $ok)."
        )
    },
    {
        id: "p7",
        title: "Kakera do Caos",
        levels: fixedLevels(
            "Botões de kakera podem virar kakera do caos quando você rolar este personagem (1% de chance por kakera, exceto vermelha, clara, escura e arco-íris)."
        )
    },
    {
        id: "p8",
        title: "Botões com desconto",
        levels: fixedLevels(
            "Nasce com 4 botões de kakera (sem roxo) custando metade do poder quando for rolado pela primeira vez no dia; só você pode clicar. O desconto só é aplicado aos primeiros 40 cliques do dia. Após 40 cliques, as esferas obtidas do perk 5 são dobradas nesses botões."
        )
    },
    {
        id: "p9",
        title: "Botão de esfera",
        levels: fixedLevels(
            "Um botão de esfera aparece quando você rolar este personagem pela primeira vez no dia. 1/7 de chance de ganhar 1 $oq por clique. Até 10 esferas clicadas por dia; só você pode clicar."
        )
    },
    {
        id: "p10",
        title: "Bônus do primeiro $oh",
        levels: fixedLevels(
            "O primeiro $oh do dia gera +20 esferas e tem +1% de chance de dar 1 $oq.",
            "MAX"
        )
    }
];

function defaultOpLevels() {
    const obj = {};
    BUFF_DEFS.forEach(b => { obj[b.id] = 0; });
    return obj;
}

// Usado pra decidir se o card do personagem ganha o destaque visual de buff
function getOpStatus(character) {
    const levels = normalizeOpLevels(character.opLevels);
    const any = Object.values(levels).some(v => Number(v) > 0);
    const maxed = isCharacterFullyOptimized({ opLevels: levels });
    return { any, maxed };
}

/* ============================================================
   BUFFS DA $shop — janela "$shop" do Mudae
   ------------------------------------------------------------
   Diferente do $op, esses buffs são de PERFIL (do jogador), não de
   personagem — por isso ficam em Configurações, não no cadastro de
   cada personagem.

   Só o item 1 tem a progressão completa confirmada (10% por nível,
   confirmado pelo usuário). Os outros itens só têm o LVL 0→1 confirmado
   pelo texto oficial do $shop; por enquanto eles ficam como "obtido / não
   obtido" (1 nível) até termos os valores dos níveis seguintes. Nenhum
   deles além do item 1 entra no cálculo de chance ainda, porque afetam
   kakera/chaves/esferas, não a chance de spawn.
   ============================================================ */
function shopLevels(desc, valueFn, unit = "") {
    const levels = [{ label: "LVL 0", text: `${desc}: 0${unit}` }];
    for (let i = 1; i <= 10; i++) levels.push({ label: `LVL ${i}`, text: `${desc}: ${valueFn(i)}${unit}` });
    return levels;
}

const SHOP_DEFS = [
    { id:"s1", title:"Perk 1 aplicado ao próprio personagem", confirmed:true,
      levels:shopLevels("Parte do bônus do perk 1 aplicada ao próprio personagem", i=>i*10, "%") },
    { id:"s2", title:"Megasfera", confirmed:true,
      levels:shopLevels("Número de recompensas por megasfera (1/50 ao rolar personagem reivindicado; limite diário)", i=>i*3, "") },
    { id:"s3", title:"Botão extra sem azul/amarela", confirmed:true,
      levels:shopLevels("Chance do botão extra do perk 3 nunca incluir azul (ou amarela com Sapphire IV)", i=>i*10, "%") },
    { id:"s4", title:"Chave Ômega do perk 4", confirmed:true,
      levels:shopLevels("Chance da chave do perk 4 também gerar Chave Ômega", i=>i*5, "%") },
    { id:"s5", title:"Esferas do perk 5 → $ot", confirmed:true,
      levels:shopLevels("Chance por esfera do perk 5 de gerar +1 $ot", i=>(i*0.014).toFixed(3).replace('.',','), "%") },
    { id:"s6", title:"Wish grátis / Ômega do perk 6", confirmed:true,
      levels:shopLevels("Chance de wish não reivindicada grátis; chance de Ômega em wish própria = 50% por nível-base", i=>i, "%") },
    { id:"s7", title:"Kakera do Caos em dobro", confirmed:true,
      levels:shopLevels("Chance de recompensa em dobro nas kakeras do caos do perk 7", i=>i*2, "%") },
    { id:"s8", title:"Bônus dos botões do perk 8", confirmed:true,
      levels:shopLevels("Bônus de kakera nos botões com desconto de personagens totalmente aprimorados", i=>i*5, "%") },
    { id:"s9", title:"Botões de esfera do perk 9", confirmed:true,
      levels:shopLevels("Botões clicáveis adicionais/dia e bônus de esferas (bônus %)", i=>i*10, "%") },
    { id:"s10", title:"$ot no primeiro $oh", confirmed:true,
      levels:shopLevels("Chance por personagem totalmente aprimorado de +1 $ot no primeiro $oh", i=>(i*0.25).toFixed(2).replace('.',','), "%") }
];

function opLevelCost(perkIndex, nextLevel) {
    if (nextLevel <= 0) return 0;
    if (perkIndex < 5) return nextLevel <= 5 ? nextLevel * 200 : 2000;
    return 1000;
}
function shopLevelCost(nextLevel) { return Math.max(0, nextLevel) * 4000; }

function renderShopBuffList() {
    const shopBuffList = document.getElementById("shopBuffList");
    if (!shopBuffList) return;

    if (!state.config.shopLevels || typeof state.config.shopLevels !== "object") {
        state.config.shopLevels = {};
    }

    shopBuffList.innerHTML = SHOP_DEFS.map((item, i) => {
        const maxIdx = item.levels.length - 1;
        const levelIdx = Math.min(Math.max(Number(state.config.shopLevels[item.id]) || 0, 0), maxIdx);
        const levelState = item.levels[levelIdx];
        const isMax = levelIdx === maxIdx;
        const isActive = levelIdx > 0;

        return `
      <div class="op-buff-row${isActive ? " active" : ""}${isMax ? " maxed" : ""}">
        <div class="op-buff-head">
          <span class="op-buff-num">${i + 1}</span>
          <span class="op-buff-title">${escapeXml(item.title)}${item.confirmed ? "" : ` <span class="shop-unconfirmed" title="Só o valor do LVL 1 foi confirmado — se os níveis seguintes forem diferentes, me avise">provisório</span>`}</span>
          <div class="op-buff-level-control">
            <button type="button" class="shop-level-btn" data-dir="-1" data-item="${item.id}" ${levelIdx === 0 ? "disabled" : ""}>−</button>
            <span class="op-buff-level-label${isMax ? " max" : ""}">${levelState.label}</span>
            <button type="button" class="shop-level-btn" data-dir="1" data-item="${item.id}" ${levelIdx === maxIdx ? "disabled" : ""}>+</button>
          </div>
        </div>
        <p class="op-buff-desc">${escapeXml(levelState.text)}${!isMax ? ` · Próximo nível: ${shopLevelCost(levelIdx + 1).toLocaleString("pt-BR")} esferas` : " · Nível máximo"}</p>
      </div>
    `;
    }).join("");

    shopBuffList.querySelectorAll(".shop-level-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.item;
            const dir = parseInt(btn.dataset.dir, 10);
            const def = SHOP_DEFS.find(s => s.id === id);
            const current = Number(state.config.shopLevels[id]) || 0;
            state.config.shopLevels[id] = Math.max(0, Math.min(def.levels.length - 1, current + dir));
            renderShopBuffList();
            renderCharacters(); // o item 1 muda a chance calculada dos favoritos
            scheduleSaveConfig();
        });
    });
}

/* ---------- Matemática de probabilidade centralizada ---------- */
function chancePercentForCharacter(character, days) {
    const value = Number(buffsCalcChance(state.config, character, days, state.characters));
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

// Gráficos trabalham internamente com razão (0..1); cards trabalham com porcentagem (0..100).
// Manter as duas unidades separadas evita regressões visuais ao alternar lista/grade.
function chanceForCharacter(character, days) {
    return chancePercentForCharacter(character, days) / 100;
}
// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function pct(v, decimals = 1) {
    const value = Number(v);
    return (Number.isFinite(value) ? value : 0).toFixed(decimals).replace(".", ",") + "%";
}
function pctDot(v, decimals = 1) {
    return (v * 100).toFixed(decimals) + "%";
}

function formatKakera(v) {
    return "◈ " + v.toLocaleString("pt-BR");
}
function formatAge(daysAgo) {
    if (daysAgo >= 28) {
        const meses = Math.round(daysAgo / 30);
        return "~" + Math.max(meses, 1) + " " + (meses > 1 ? "meses" : "mes");
    }
    return "~" + daysAgo + " dias";
}

function chanceClass(v) {
    if (v >= 40) return "chance-high";
    if (v >= 15) return "chance-mid";
    return "chance-low";
}

/* ============================================================
   NAVEGAÇÃO ENTRE ABAS
   ============================================================ */
const tabButtons = document.querySelectorAll(".tab-btn");
const views = {
    config: document.getElementById("view-config"),
    chars: document.getElementById("view-chars"),
    analysis: document.getElementById("view-analysis")
};

function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
        el.classList.toggle("active", key === name);
    });
    tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.view === name));
    if (name === "analysis") renderAnalysis();
    if (name === "chars") renderCharacters();
}

tabButtons.forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
});

/* ============================================================
   VIEW: CONFIGURAÇÕES
   ============================================================ */

// Campos numéricos (parseInt, mínimo 0)
const CONFIG_NUMBER_FIELDS = [
    { id: "cfgHourGameplay", key: "gameplayHour" },

    { id: "cfgPoolWA", key: "poolWA" },
    { id: "cfgPoolHA", key: "poolHA" },
    { id: "cfgPoolWG", key: "poolWG" },
    { id: "cfgPoolHG", key: "poolHG" },
    { id: "cfgRollsPerHour", key: "rollsPerHour" },
    { id: "cfgHaremLimit", key: "haremLimit" },
    { id: "cfgTutorialPage", key: "tutorialPage" },
    { id: "cfgBoostWishRolls", key: "boostWishRolls" },
    { id: "cfgPersonalRare", key: "personalRare" },
    { id: "cfgLevelBronze", key: "levelBronze" },
    { id: "cfgLevelPrata", key: "levelPrata" },
    { id: "cfgLevelOuro", key: "levelOuro" },
    { id: "cfgLevelSafira", key: "levelSafira" },
    { id: "cfgLevelRuby", key: "levelRuby" },
    { id: "cfgLevelEsmeralda", key: "levelEsmeralda" },
    { id: "cfgLevelDiamante", key: "levelDiamante" }
];

// Não há mais campos de texto simples de configuração — Kakera Tower agora
// tem sua própria interface dedicada (ver renderKakeraTowers / openTowerModal)
const CONFIG_TEXT_FIELDS = [];

const cfgServerName = document.getElementById("cfgServerName");
const cfgUserTag = document.getElementById("cfgUserTag");
const cfgUseSlashCommands = document.getElementById("cfgUseSlashCommands");

function loadConfigForm() {
    cfgServerName.value = state.config.serverName;
    cfgUserTag.value = state.config.userTag;
    if (cfgUseSlashCommands) cfgUseSlashCommands.value = String(Boolean(state.config.useSlashCommands));

    CONFIG_NUMBER_FIELDS.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        if (el) el.value = state.config[key] ?? 0;
    });

    CONFIG_TEXT_FIELDS.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        if (el) el.value = state.config[key] ?? "";
    });

    if (!Array.isArray(state.config.kakeraTowers)) {
        state.config.kakeraTowers = [];
    }
    renderKakeraTowers();
    renderShopBuffList();
    renderBoostWishSummary();
    renderTotalRollsPerHour();
}

function renderConfigStats() {
    const dummy = { genders:["wa"], category:"comuns", claimed:false, opLevels:{} };
    document.getElementById("baseChance1d").textContent = pct(baseCalcChance(state.config, dummy, 1), 2);
    document.getElementById("baseChance7d").textContent = pct(baseCalcChance(state.config, dummy, 7), 1);
    document.getElementById("baseChance30d").textContent = pct(baseCalcChance(state.config, dummy, 30), 1);
}

function formatConfigNumber(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: Number.isInteger(Number(value || 0)) ? 0 : 1,
        maximumFractionDigits: 2
    });
}

function renderBoostWishSummary() {
    const el = document.getElementById("boostWishSummary");
    if (!el) return;

    const bw = getBoostWishBonuses(state.config.boostWishRolls);
    el.innerHTML = `
        <span>Rolls investidos: <strong>${formatConfigNumber(bw.rolls)}</strong></span>
        <span>Wishes: <strong>+${formatConfigNumber(bw.wishPercent)}%</strong></span>
        <span>Starwish adicional: <strong>+${formatConfigNumber(bw.starPercent)}%</strong></span>
        <span>Starwish total: <strong>+${formatConfigNumber(bw.starTotalPercent)}%</strong></span>
    `;
}

function renderTotalRollsPerHour() {
    const el = document.getElementById("totalRollsPerHour");
    if (!el) return;
    el.textContent = `→ Total de rolls: ${formatConfigNumber(effectiveRollsPerHour(state.config))}`;
}

// Salva a configuração no IndexedDB com um pequeno atraso (debounce),
// para não escrever no banco a cada tecla digitada.
let saveConfigTimeout = null;
function scheduleSaveConfig() {
    clearTimeout(saveConfigTimeout);
    saveConfigTimeout = setTimeout(() => {
        Database.saveConfig(state.config)
            .then(() => setBackupStatus("✓ Configurações salvas"))
            .catch(err => {
                console.error("Erro ao salvar configuração:", err);
                setBackupStatus("Erro ao salvar configurações.", true);
            });
    }, 400);
}

// Nome do servidor / tag do usuário
[cfgServerName, cfgUserTag].forEach(el => {
    el.addEventListener("input", () => {
        state.config.serverName = cfgServerName.value || "Servidor Anime";
        state.config.userTag = cfgUserTag.value || "Otaku Master";
        document.getElementById("charsSubServer").textContent = state.config.serverName;
        scheduleSaveConfig();
    });
});


if (cfgUseSlashCommands) {
    cfgUseSlashCommands.addEventListener("change", () => {
        state.config.useSlashCommands = cfgUseSlashCommands.value === "true";
        renderConfigStats(); renderCharacters(); scheduleSaveConfig();
    });
}
// Campos numéricos (server, buffs, harem)
CONFIG_NUMBER_FIELDS.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
        state.config[key] = Math.max(0, parseInt(el.value) || 0);
        if (key === "haremLimit") updateHaremCountDisplay();
        renderConfigStats();
        renderBoostWishSummary();
        renderTotalRollsPerHour();
        renderCharacters();
        scheduleSaveConfig();
    });
});

// Campos de texto (Kakera Tower)
CONFIG_TEXT_FIELDS.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
        state.config[key] = el.value;
        scheduleSaveConfig();
    });
});

/* ============================================================
   VIEW: PERSONAGENS
   ============================================================ */
const charGroupsEl = document.getElementById("charGroups");

function updateHaremCountDisplay() {
    const limit = state.config.haremLimit;
    const countText = limit > 0
        ? `${state.characters.length} / ${limit}`
        : `${state.characters.length}`;
    document.getElementById("charCountBadge").textContent = state.characters.length;
    document.getElementById("charsSubCount").textContent = countText;
}

/* ============================================================
   KAKERA TOWER
   ============================================================ */
function makeEmptyFloors() {
    return Array(12).fill(false);
}

function nextTowerId() {
    return state.config.kakeraTowers.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

function renderKakeraTowers() {
    const towerGrid = document.getElementById("towerGrid");
    if (!towerGrid) return;

    const towers = state.config.kakeraTowers || [];
    const totalFloors = towers.reduce((sum, t) => sum + t.floors.filter(Boolean).length, 0);

    document.getElementById("towerSummary").textContent =
        `${towers.length} ${towers.length === 1 ? "torre" : "torres"} · ${totalFloors} ${totalFloors === 1 ? "andar comprado" : "andares comprados"}`;

    towerGrid.innerHTML = "";

    towers.forEach((tower, idx) => {
        const count = tower.floors.filter(Boolean).length;
        const isComplete = count === 12;

        const card = document.createElement("div");
        card.className = "tower-card" + (isComplete ? " complete" : "");
        card.innerHTML = `
            <button class="tower-remove" title="Remover torre">✕</button>
            <div class="tower-card-head">
                <span class="tower-badge">${idx + 1}</span>
                <span class="tower-progress">${count}/12</span>
                ${isComplete ? '<span class="tower-sparkle">✦</span>' : ""}
            </div>
            <div class="tower-floors">
                ${tower.floors.map((bought, i) =>
                    `<span class="floor-num${bought ? " bought" : ""}" title="${escapeXml(getTowerFloorDescription(idx + 1, i + 1))}">${i + 1}</span>`
                ).join("")}
            </div>
        `;
        card.addEventListener("click", (e) => {
            if (e.target.closest(".tower-remove")) return;
            openTowerModal(tower.id);
        });
        card.querySelector(".tower-remove").addEventListener("click", async (e) => {
            e.stopPropagation();
            const confirmado = await showSystemConfirm(
                `Remover a Torre ${idx + 1}? Isso vai apagar o progresso registrado nela.`,
                {
                    title: "Remover Torre",
                    type: "danger",
                    confirmText: "REMOVER",
                    cancelText: "CANCELAR"
                }
            );
            if (!confirmado) return;
            state.config.kakeraTowers = state.config.kakeraTowers.filter(t => t.id !== tower.id);
            scheduleSaveConfig();
            renderKakeraTowers();
            renderTotalRollsPerHour();
            renderConfigStats();
            renderCharacters();
        });
        towerGrid.appendChild(card);
    });

    const addCard = document.createElement("div");
    addCard.className = "tower-card tower-add";
    addCard.innerHTML = `
        <span class="tower-add-icon">+</span>
        <span>NOVA TORRE</span>
    `;
    addCard.addEventListener("click", () => {
        state.config.kakeraTowers.push({ id: nextTowerId(), floors: makeEmptyFloors() });
        scheduleSaveConfig();
        renderKakeraTowers();
    });
    towerGrid.appendChild(addCard);
}

/* ---------- Modal de edição de torre ---------- */
const towerModalOverlay = document.getElementById("towerModalOverlay");
const towerModalSub = document.getElementById("towerModalSub");
const towerProgressFill = document.getElementById("towerProgressFill");
const floorEditGrid = document.getElementById("floorEditGrid");

let editingTowerId = null;
let editingFloors = [];
let expandedTowerFloors = new Set();

function openTowerModal(towerId) {
    const tower = state.config.kakeraTowers.find(t => t.id === towerId);
    if (!tower) return;

    editingTowerId = towerId;
    editingFloors = [...tower.floors]; // cópia local — só grava no state ao clicar em Salvar
    expandedTowerFloors = new Set();

    renderFloorEditGrid();
    towerModalOverlay.classList.add("active");
}

function renderFloorEditGrid() {
    const count = editingFloors.filter(Boolean).length;
    const towerIndex = Math.max(0, state.config.kakeraTowers.findIndex(t => t.id === editingTowerId));
    const towerNumber = towerIndex + 1;
    towerModalSub.textContent = `${count} de 12 andares comprados`;
    towerProgressFill.style.width = `${(count / 12) * 100}%`;

    floorEditGrid.innerHTML = editingFloors.map((bought, i) => {
        const floorNumber = i + 1;
        const expanded = expandedTowerFloors.has(i);
        const details = getTowerFloorDetails(towerNumber, floorNumber);
        const detailItems = (details.details || []).map(item => `<li>${escapeXml(item)}</li>`).join("");
        const interactionItems = (details.interactions || []).map(item => `<span class="floor-interaction-chip">${escapeXml(item)}</span>`).join("");
        return `
            <div class="floor-edit-item floor-category-${escapeXml(details.category)}${bought ? " active" : ""}${expanded ? " expanded" : ""}">
                <div class="floor-edit-row">
                    <button type="button" class="floor-select-btn" data-floor="${i}" aria-pressed="${bought}">
                        <span class="floor-select-indicator" aria-hidden="true">${bought ? "✓" : ""}</span>
                        <span class="floor-edit-label">
                            <span class="floor-edit-name"><span class="floor-edit-f">ANDAR</span> <span class="floor-edit-n">${floorNumber}</span></span>
                            <span class="floor-edit-summary">${escapeXml(details.summary)}</span>
                        </span>
                        <span class="floor-edit-status">${bought ? "Selecionado" : "Não selecionado"}</span>
                    </button>
                    <button type="button" class="floor-description-toggle" data-floor="${i}" aria-expanded="${expanded}" aria-label="${expanded ? "Ocultar" : "Mostrar"} descrição do andar ${floorNumber}">
                        <span>BUFF</span>
                        <span class="floor-description-chevron" aria-hidden="true">⌄</span>
                    </button>
                </div>
                <div class="floor-description"${expanded ? "" : " hidden"}>
                    <div class="floor-description-head">
                        <span class="floor-description-type">${escapeXml(details.label)}</span>
                        <span class="floor-description-tower">${details.towerNumber}ª torre</span>
                    </div>
                    <div class="floor-description-title">${escapeXml(details.summary)}</div>
                    <section class="floor-description-section">
                        <span class="floor-description-section-label">Efeito</span>
                        <p>${escapeXml(details.effect)}</p>
                        <p class="floor-current-effect">${escapeXml(details.currentEffect)}</p>
                    </section>
                    ${detailItems ? `<section class="floor-description-section"><span class="floor-description-section-label">Detalhes</span><ul>${detailItems}</ul></section>` : ""}
                    ${details.notes ? `<section class="floor-description-section"><span class="floor-description-section-label">Observação</span><p>${escapeXml(details.notes)}</p></section>` : ""}
                    ${interactionItems ? `<section class="floor-description-section"><span class="floor-description-section-label">Interações</span><div class="floor-interactions">${interactionItems}</div></section>` : ""}
                </div>
            </div>
        `;
    }).join("");

    floorEditGrid.querySelectorAll(".floor-select-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const i = parseInt(btn.dataset.floor, 10);
            editingFloors[i] = !editingFloors[i];
            if (editingFloors[i]) expandedTowerFloors.add(i);
            else expandedTowerFloors.delete(i);
            renderFloorEditGrid();
        });
    });

    floorEditGrid.querySelectorAll(".floor-description-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const i = parseInt(btn.dataset.floor, 10);
            if (expandedTowerFloors.has(i)) expandedTowerFloors.delete(i);
            else expandedTowerFloors.add(i);
            renderFloorEditGrid();
        });
    });
}

function closeTowerModal() {
    towerModalOverlay.classList.remove("active");
    editingTowerId = null;
    expandedTowerFloors = new Set();
}

document.getElementById("towerModalClose").addEventListener("click", closeTowerModal);
document.getElementById("towerCancelBtn").addEventListener("click", closeTowerModal);
towerModalOverlay.addEventListener("click", (e) => {
    if (e.target === towerModalOverlay) closeTowerModal();
});

document.getElementById("towerSaveBtn").addEventListener("click", () => {
    const tower = state.config.kakeraTowers.find(t => t.id === editingTowerId);
    if (tower) {
        tower.floors = [...editingFloors];
        scheduleSaveConfig();
        renderKakeraTowers();
        renderTotalRollsPerHour();
        renderConfigStats();
        renderCharacters();
    }
    closeTowerModal();
});

/* ============================================================
   FILTROS DA LISTA DE PERSONAGENS
   ============================================================ */
const filterCategoryRow = document.getElementById("filterCategoryRow");
const filterSeriesEl = document.getElementById("filterSeries");
const filterKakeraMinEl = document.getElementById("filterKakeraMin");
const filterKakeraMaxEl = document.getElementById("filterKakeraMax");
const filterSortKakeraEl = document.getElementById("filterSortKakera");
const filterSortKeysEl = document.getElementById("filterSortKeys");
const filterGenderRow = document.getElementById("filterGenderRow");
const btnClearFilters = document.getElementById("btnClearFilters");
const viewToggle = document.getElementById("viewToggle");
const gridDetailsToggle = document.getElementById("gridDetailsToggle");
const gridDetailsControl = document.getElementById("gridDetailsControl");
const btnClearHarem = document.getElementById("btnClearHarem");

const charFilters = {
    categories: new Set(),
    series: "",
    kakeraMin: null,
    kakeraMax: null,
    sortKakera: "",
    sortKeys: "",
    genders: new Set()
};

// Atualiza o <select> de séries com as séries realmente cadastradas no harem
function populateSeriesFilter() {
    if (!filterSeriesEl) return;
    const previousValue = filterSeriesEl.value;
    const seriesSet = new Set(
        state.characters
            .map(c => (c.series || "").trim())
            .filter(s => s && s !== "—")
    );
    const seriesList = Array.from(seriesSet).sort((a, b) => a.localeCompare(b, "pt-BR"));

    filterSeriesEl.innerHTML = `<option value="">Todas</option>` +
        seriesList.map(s => `<option value="${escapeXml(s)}">${escapeXml(s)}</option>`).join("");

    // Mantém a seleção anterior se ela ainda existir na lista
    if (previousValue && seriesList.includes(previousValue)) {
        filterSeriesEl.value = previousValue;
    } else {
        charFilters.series = "";
    }
}

function passesFilters(c) {
    if (charFilters.categories.size > 0 && !charFilters.categories.has(c.category)) return false;
    if (charFilters.series && (c.series || "").trim() !== charFilters.series) return false;
    if (charFilters.kakeraMin !== null && c.kakera < charFilters.kakeraMin) return false;
    if (charFilters.kakeraMax !== null && c.kakera > charFilters.kakeraMax) return false;
    if (charFilters.genders.size > 0) {
        // Correspondência EXATA: o personagem só passa se o conjunto de
        // gêneros dele for exatamente igual ao conjunto selecionado no
        // filtro (mesma quantidade e os mesmos gêneros). Assim, selecionar
        // só "$wa" mostra apenas personagens com SÓ $wa — pra ver alguém
        // com "$wa" e "$wg" ao mesmo tempo, é preciso ativar os dois botões.
        const charGenders = new Set(c.genders || []);
        if (charGenders.size !== charFilters.genders.size) return false;
        for (const g of charFilters.genders) {
            if (!charGenders.has(g)) return false;
        }
    }
    return true;
}

if (filterCategoryRow) {
    filterCategoryRow.querySelectorAll(".cat-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const cat = btn.dataset.category;
            if (charFilters.categories.has(cat)) {
                charFilters.categories.delete(cat);
            } else {
                charFilters.categories.add(cat);
            }
            btn.classList.toggle("active", charFilters.categories.has(cat));
            renderCharacters();
        });
    });
}
if (filterSeriesEl) {
    filterSeriesEl.addEventListener("change", () => {
        charFilters.series = filterSeriesEl.value;
        renderCharacters();
    });
}
if (filterKakeraMinEl) {
    filterKakeraMinEl.addEventListener("input", () => {
        const v = parseInt(filterKakeraMinEl.value, 10);
        charFilters.kakeraMin = Number.isNaN(v) ? null : v;
        renderCharacters();
    });
}
if (filterKakeraMaxEl) {
    filterKakeraMaxEl.addEventListener("input", () => {
        const v = parseInt(filterKakeraMaxEl.value, 10);
        charFilters.kakeraMax = Number.isNaN(v) ? null : v;
        renderCharacters();
    });
}
if (filterSortKakeraEl) {
    filterSortKakeraEl.addEventListener("change", () => {
        charFilters.sortKakera = filterSortKakeraEl.value;
        renderCharacters();
    });
}
if (filterSortKeysEl) {
    filterSortKeysEl.addEventListener("change", () => {
        charFilters.sortKeys = filterSortKeysEl.value;
        renderCharacters();
    });
}
if (filterGenderRow) {
    filterGenderRow.querySelectorAll(".gender-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const g = btn.dataset.gender;
            if (charFilters.genders.has(g)) {
                charFilters.genders.delete(g);
            } else {
                charFilters.genders.add(g);
            }
            btn.classList.toggle("active", charFilters.genders.has(g));
            renderCharacters();
        });
    });
}
// Extraído em função própria para poder ser reaproveitado ao trocar de
// perfil (ver PROFILES): os filtros de um perfil não fazem sentido nos
// personagens de outro, então são limpos automaticamente na troca.
function resetCharFilters() {
    charFilters.categories.clear();
    charFilters.series = "";
    charFilters.kakeraMin = null;
    charFilters.kakeraMax = null;
    charFilters.sortKakera = "";
    charFilters.sortKeys = "";
    charFilters.genders.clear();

    if (filterCategoryRow) filterCategoryRow.querySelectorAll(".cat-toggle-btn").forEach(btn => btn.classList.remove("active"));
    if (filterSeriesEl) filterSeriesEl.value = "";
    if (filterKakeraMinEl) filterKakeraMinEl.value = "";
    if (filterKakeraMaxEl) filterKakeraMaxEl.value = "";
    if (filterSortKakeraEl) filterSortKakeraEl.value = "";
    if (filterSortKeysEl) filterSortKeysEl.value = "";
    if (filterGenderRow) filterGenderRow.querySelectorAll(".gender-btn").forEach(btn => btn.classList.remove("active"));
}

if (btnClearFilters) {
    btnClearFilters.addEventListener("click", () => {
        resetCharFilters();
        renderCharacters();
    });
}

/* ============================================================
   ALTERNÂNCIA DE VISUALIZAÇÃO (LISTA / GRADE)
   ============================================================ */
function applyViewMode() {
    const mode = state.config.viewMode === "grid" ? "grid" : "list";
    const detailsEnabled = state.config.gridDetailsEnabled !== false;

    charGroupsEl.classList.toggle("view-grid", mode === "grid");
    charGroupsEl.classList.toggle("view-list", mode === "list");
    charGroupsEl.classList.toggle("grid-compact", mode === "grid" && !detailsEnabled);

    if (viewToggle) {
        viewToggle.querySelectorAll(".view-toggle-btn").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.viewMode === mode);
        });
    }

    if (gridDetailsControl) {
        gridDetailsControl.hidden = mode !== "grid";
    }
    if (gridDetailsToggle) {
        gridDetailsToggle.checked = detailsEnabled;
        gridDetailsToggle.setAttribute("aria-checked", String(detailsEnabled));
    }
}

if (viewToggle) {
    viewToggle.querySelectorAll(".view-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            state.config.viewMode = btn.dataset.viewMode;
            // Recria os cards para garantir que os percentuais e labels permaneçam
            // sincronizados ao trocar entre lista, grade detalhada e grade visual.
            renderCharacters();
            scheduleSaveConfig();
        });
    });
}

if (gridDetailsToggle) {
    gridDetailsToggle.addEventListener("change", () => {
        state.config.gridDetailsEnabled = gridDetailsToggle.checked;
        // O modo compacto é apenas uma apresentação; os cálculos continuam sendo
        // produzidos e voltam intactos quando as informações são reativadas.
        renderCharacters();
        scheduleSaveConfig();
    });
}

/* ============================================================
   LIMPAR HAREM (remove todos os personagens)
   ============================================================ */
if (btnClearHarem) {
    btnClearHarem.addEventListener("click", async () => {
        if (state.characters.length === 0) {
            setBackupStatus("O harem já está vazio.");
            return;
        }
        const confirmado = await showSystemConfirm(
            `Isso vai remover TODOS os ${state.characters.length} personagens cadastrados. Essa ação não pode ser desfeita. Deseja continuar?`,
            {
                title: "Limpar Harém",
                type: "danger",
                confirmText: "REMOVER TODOS",
                cancelText: "CANCELAR"
            }
        );
        if (!confirmado) return;

        btnClearHarem.disabled = true;
        try {
            await Database.clearCharacters();
            state.characters = [];
            renderCharacters();
            setBackupStatus("✓ Harem limpo com sucesso!");
        } catch (err) {
            console.error("Erro ao limpar o harem:", err);
            setBackupStatus("Erro ao limpar o harem. Tente novamente.", true);
        } finally {
            btnClearHarem.disabled = false;
        }
    });
}

function renderCharacters() {
    charGroupsEl.innerHTML = "";
    updateHaremCountDisplay();
    document.getElementById("charsSubServer").textContent = state.config.serverName;

    populateSeriesFilter();
    applyViewMode();

    const filteredCharacters = state.characters.filter(passesFilters);
    const anyFilterActive =
        charFilters.categories.size > 0 ||
        !!charFilters.series ||
        charFilters.kakeraMin !== null ||
        charFilters.kakeraMax !== null ||
        charFilters.genders.size > 0;

    LIST_SECTIONS.forEach(section => {
        // Se houver categorias selecionadas no filtro e NENHUMA delas pertencer
        // a esta seção, esconde a seção inteira
        if (charFilters.categories.size > 0 && !section.categories.some(cat => charFilters.categories.has(cat))) return;

        let items = filteredCharacters.filter(c => section.categories.includes(c.category));
        if (section.key === "wishlist") {
            items = [...items].sort((a, b) => (Number(a.wishlistPosition) || 0) - (Number(b.wishlistPosition) || 0));
        }
        if (charFilters.sortKakera === "asc") {
            items = [...items].sort((a, b) => a.kakera - b.kakera);
        } else if (charFilters.sortKakera === "desc") {
            items = [...items].sort((a, b) => b.kakera - a.kakera);
        }
        if (charFilters.sortKeys === "asc") {
            items = [...items].sort((a, b) => (Number(a.keys) || 0) - (Number(b.keys) || 0));
        } else if (charFilters.sortKeys === "desc") {
            items = [...items].sort((a, b) => (Number(b.keys) || 0) - (Number(a.keys) || 0));
        }

        const totalInSection = state.characters.filter(c => section.categories.includes(c.category)).length;

        const group = document.createElement("div");
        group.className = "char-group";
        group.dataset.section = section.key;
        group.id = "group-" + section.key;

        group.innerHTML = `
      <div class="group-head">
        <div class="group-head-left" style="color:${section.color}">
          <span>${section.icon}</span><span>${section.label}</span>
          <span class="group-count">${items.length}${anyFilterActive ? ` / ${totalInSection}` : ""}</span>
        </div>
        <span class="group-chevron">▾</span>
      </div>
      <div class="group-body"></div>
    `;

        const body = group.querySelector(".group-body");

        if (items.length === 0 && totalInSection > 0) {
            const empty = document.createElement("div");
            empty.className = "group-empty";
            empty.textContent = "Nenhum personagem corresponde aos filtros atuais.";
            body.appendChild(empty);
        } else if (items.length === 0) {
            const empty = document.createElement("div");
            empty.className = "group-empty";
            empty.textContent = "Nenhum personagem nesta categoria ainda. Use o botão \"ADICIONAR PERSONAGEM\" no topo da página.";
            body.appendChild(empty);
        } else {
            items.forEach(c => body.appendChild(renderCharCard(c)));
        }

        group.querySelector(".group-head").addEventListener("click", () => {
            group.classList.toggle("collapsed");
        });

        charGroupsEl.appendChild(group);
    });
}

function normalizeCharacterGenders(value) {
    const allowed = new Set(["wa", "wg", "ha", "hg"]);
    let values = [];

    if (Array.isArray(value)) {
        values = value;
    } else if (typeof value === "string") {
        values = value.split(/[;,\s]+/);
    } else if (value && typeof value === "object") {
        values = Object.entries(value)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([gender]) => gender);
    }

    return [...new Set(values
        .map(gender => String(gender || "").trim().toLowerCase().replace(/^\$/, ""))
        .filter(gender => allowed.has(gender)))];
}

function renderGenderChips(genders, chipClass = "gender-chip") {
    const normalized = normalizeCharacterGenders(genders);
    return normalized.map(gender => `<span class="${chipClass}">$${gender}</span>`).join("");
}

function renderCharCard(c) {
    const characterGenders = normalizeCharacterGenders(c.genders);

    //const c1 = chance(c.buff, 1);
    //const c7 = chance(c.buff, 7);
    //const c15 = chance(c.buff, 15);


    const c1 = chancePercentForCharacter(c, 1);
    const c7 = chancePercentForCharacter(c, 7);
    const c15 = chancePercentForCharacter(c, 15);

    // Buff total acumulado: soma TODAS as fontes (multiplicador de categoria,
    // que já inclui badges/Kakera Tower, + o bônus dos vizinhos na wishlist
    // vindo do perk OP "p1"). É calculado, não é digitado pelo usuário.
    const totalBuffPct = Math.round(getTotalBuffPercent(state.config, c, state.characters));
    const showSpawnBuffLabels = c.category === "favoritos" || c.category === "estrelas";
    const breakdown = getProbabilityBreakdown(state.config, c, state.characters);
    const adjacentOpPct = (breakdown.opAdjacent || 0) * 100;
    const ownShopPct = (breakdown.shop1Self || 0) * 100;
    const ownPerk1Pct = (breakdown.ownPerk1 || 0) * 100;
    const shop1SharePct = (breakdown.shop1Share || 0) * 100;
    const fmtBuff = value => Number(value).toLocaleString("pt-BR", {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
        maximumFractionDigits: 2
    });
    const breakdownText = [
        `Pool: ${breakdown.pool}`,
        `Rolls/dia: ${breakdown.rollsPerDay}`,
        `$boostwish (wishes): +${fmtBuff((breakdown.boostWish || 0) * 100)}%`,
        ...(c.category === "estrelas" ? [`$boostwish adicional da starwish: +${fmtBuff((breakdown.boostStarwish || 0) * 100)}%`] : []),
        `OP recebido dos adjacentes: +${fmtBuff(adjacentOpPct)}%`,
        `Perk 1 próprio: +${fmtBuff(ownPerk1Pct)}%`,
        `SHOP 1 compartilha: ${fmtBuff(shop1SharePct)}% do Perk 1 próprio`,
        `Bônus próprio resultante: +${fmtBuff(ownShopPct)}%`,
        `Multiplicador total: ${breakdown.multiplier.toFixed(3)}x`
    ].join(" | ");

    const card = document.createElement("div");
    const opStatus = getOpStatus(c);
    card.className = "char-card cat-" + c.category + (c.claimed === false ? " char-unclaimed" : "") + (opStatus.any ? " op-has-buff" : "") + (opStatus.maxed ? " op-maxed" : "");
    card.dataset.charId = c.id;

    const photoBlock = c.photo
        ? `<div class="char-photo has-image"><img src="${c.photo}" alt="${escapeXml(c.name)}" /></div>`
        : `<div class="char-photo">⬆<span>FOTO</span></div>`;

    card.innerHTML = `
    ${photoBlock}
    <div class="char-info">
      <div class="char-name"><span class="char-cat-icon" title="${escapeXml(CAT_META[c.category]?.label || "")}">${CAT_META[c.category]?.icon || ""}</span> ${c.name}</div>
      <div class="compact-meta" aria-label="Resumo do personagem">
        <div class="compact-values">
          <span class="compact-kakera">${formatKakera(c.kakera)}</span>
          <span class="compact-keys" title="Chaves">🔑 ${Number(c.keys) || 0}</span>
        </div>
        <div class="compact-genders">
          ${characterGenders.length
            ? renderGenderChips(characterGenders, "compact-gender-chip")
            : `<span class="compact-gender-empty">Sem roleta informada</span>`}
        </div>
      </div>
      <div class="char-series">${c.series}</div>
      <div class="char-tags">
        <span class="tag kakera">${formatKakera(c.kakera)}</span>  
        <span class="tag keys" title="Chaves">🔑 ${Number(c.keys) || 0}</span>
        ${showSpawnBuffLabels && adjacentOpPct > 0 ? `<span class="tag buff op-adjacent-buff" title="Bônus recebido dos personagens imediatamente adjacentes na wishlist circular">OP adj. +${fmtBuff(adjacentOpPct)}%</span>` : ""}
        ${showSpawnBuffLabels && ownShopPct > 0 ? `<span class="tag buff shop-self-buff" title="SHOP 1 nível ${Number(state.config?.shopLevels?.s1 || 0)} compartilha ${fmtBuff(shop1SharePct)}% do próprio Perk 1 (+${fmtBuff(ownPerk1Pct)}%), resultando em +${fmtBuff(ownShopPct)}%">SHOP próprio +${fmtBuff(ownShopPct)}%</span>` : ""}
        ${showSpawnBuffLabels && totalBuffPct > 0 ? `<span class="tag buff total-spawn-buff" title="${escapeXml(breakdownText)}">Total +${totalBuffPct}%</span>` : ""}
        <span class="tag age">${formatAge(c.daysAgo)}</span>
      </div>
      <div class="character-genders" aria-label="Roletas do personagem">
        ${characterGenders.length
            ? renderGenderChips(characterGenders)
            : `<span class="gender-empty">Sem roleta informada</span>`}
      </div>
      <div class="chance-row">
        <div class="chance-box">
          <div class="lbl">1 DIA</div>
          <div class="val ${chanceClass(c1)}">${pct(c1, 2)}</div>
        </div>
        <div class="chance-box">
          <div class="lbl">7 DIAS</div>
          <div class="val ${chanceClass(c7)}">${pct(c7, 1)}</div>
        </div>
        <div class="chance-box">
          <div class="lbl">15 DIAS</div>
          <div class="val ${chanceClass(c15)}">${pct(c15, 1)}</div>
        </div>
      </div>
    </div>
    <div class="char-actions">
      ${WISHLIST_CATEGORIES.includes(c.category) ? `<button class="icon-btn move-btn" title="Reordenar na Wishlist">⇅</button>` : ""}
      <button class="icon-btn op-btn" title="Buffs (OP)">OP</button>
      <button class="icon-btn edit-btn" title="Editar personagem">✎</button>
      <button class="icon-btn delete-btn" title="Remover personagem">✕</button>
    </div>
  `;
    const moveBtn = card.querySelector(".move-btn");
    if (moveBtn) {
        moveBtn.addEventListener("click", () => openWishlistOrderModal(c.id));
    }
    card.querySelector(".op-btn").addEventListener("click", () => {
        openOpModal(c);
    });
    card.querySelector(".edit-btn").addEventListener("click", () => {
        openEditModal(c);
    });
    card.querySelectorAll(".char-actions button").forEach(button => {
        button.addEventListener("click", event => event.stopPropagation());
    });

    // Em telas sem hover, o primeiro toque no card compacto revela as ações.
    // Um toque fora ou um segundo toque no próprio card volta a ocultá-las.
    card.addEventListener("click", event => {
        const compactGrid = charGroupsEl.classList.contains("view-grid") &&
            charGroupsEl.classList.contains("grid-compact");
        const noHover = window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches;
        if (!compactGrid || !noHover || event.target.closest(".char-actions")) return;

        const wasOpen = card.classList.contains("compact-actions-open");
        document.querySelectorAll("#charGroups.view-grid.grid-compact .char-card.compact-actions-open")
            .forEach(other => other.classList.remove("compact-actions-open"));
        if (!wasOpen) card.classList.add("compact-actions-open");
    });

    card.querySelector(".delete-btn").addEventListener("click", async () => {
        const confirmado = await showSystemConfirm(
            `Remover "${c.name}" da lista de personagens?`,
            {
                title: "Remover Personagem",
                type: "danger",
                confirmText: "REMOVER",
                cancelText: "CANCELAR"
            }
        );
        if (!confirmado) return;
        try {
            await Database.deleteCharacter(c.id);
        } catch (err) {
            console.error("Erro ao remover personagem do banco:", err);
        }
        state.characters = state.characters.filter(ch => ch.id !== c.id);
        renderCharacters();
    });
    return card;
}

/* ============================================================
   MODAL: BUFFS DO PERSONAGEM (OP)
   ------------------------------------------------------------
   Modal grande, um por personagem, com os 10 perks do $op.
   Cada perk pode ser subido/descido de nível com os botões
   "−"/"+", mostrando a descrição correspondente àquele nível.
   As alterações são registradas localmente e somente gravadas no
   IndexedDB quando o usuário clica em "Salvar".
   ============================================================ */
const opModalOverlay = document.getElementById("opModalOverlay");
const opModalSub = document.getElementById("opModalSub");
const opBuffList = document.getElementById("opBuffList");
const opSaveStatus = document.getElementById("opSaveStatus");

let editingOpCharacterId = null;
let editingOpLevels = null;
let opSaveStatusTimeout = null;

function showOpStatus(message, isError = false, autoHide = false) {
    if (!opSaveStatus) return;
    clearTimeout(opSaveStatusTimeout);
    opSaveStatus.textContent = message;
    opSaveStatus.style.color = isError ? "var(--pink)" : "var(--green)";
    if (autoHide) {
        opSaveStatusTimeout = setTimeout(() => {
            if (opSaveStatus) opSaveStatus.textContent = "";
        }, 1200);
    }
}

function normalizeOpLevels(levels) {
    const out = { ...defaultOpLevels(), ...(levels || {}) };
    for (let i=0;i<5;i++) out[BUFF_DEFS[i].id] = Math.min(Number(out[BUFF_DEFS[i].id])||0, 6);
    for (let i=5;i<10;i++) out[BUFF_DEFS[i].id] = Math.min(Number(out[BUFF_DEFS[i].id])||0, 1);
    return out;
}

function openOpModal(character) {
    editingOpCharacterId = character.id;
    editingOpLevels = normalizeOpLevels(character.opLevels);
    opModalSub.textContent = `Buffs de ${character.name}`;
    showOpStatus("", false);
    renderOpBuffList();
    opModalOverlay.classList.add("active");
}

function closeOpModal() {
    opModalOverlay.classList.remove("active");
    editingOpCharacterId = null;
    editingOpLevels = null;
}

function renderOpBuffList() {
    opBuffList.innerHTML = BUFF_DEFS.map((buff, i) => {
        const maxIdx = buff.levels.length - 1;
        const purchasableMax = i < 5 ? 6 : 1;
        const purchasedLevel = Math.min(Math.max(editingOpLevels[buff.id] || 0, 0), purchasableMax);
        const automaticMaxActive = i < 5 && isCharacterFullyOptimized({ opLevels: editingOpLevels });
        const levelIdx = automaticMaxActive ? maxIdx : purchasedLevel;
        const levelState = buff.levels[levelIdx];

        // MAX visual significa "todos os níveis compráveis deste perk foram concluídos".
        // Nos perks 1–5, o bônus automático por otimização total continua sendo calculado
        // separadamente pela regra existente em formulas.js.
        const isMax = purchasedLevel >= purchasableMax;
        const isActive = purchasedLevel > 0;

        let progressionText = "";
        if (purchasedLevel < purchasableMax) {
            progressionText = ` · Próximo nível: ${opLevelCost(i, purchasedLevel + 1).toLocaleString("pt-BR")} esferas`;
        } else if (automaticMaxActive) {
            progressionText = " · MAX automático ativo";
        } else if (i < 5) {
            progressionText = " · Nível máximo comprável atingido";
        } else {
            progressionText = " · Perk no nível máximo";
        }

        return `
      <div class="op-buff-row${isActive ? " active" : ""}${isMax ? " maxed" : ""}">
        <div class="op-buff-head">
          <span class="op-buff-num">${i + 1}</span>
          <span class="op-buff-title">${escapeXml(buff.title)}</span>
          <div class="op-buff-level-control">
            <button type="button" class="op-level-btn" data-dir="-1" data-buff="${buff.id}" ${purchasedLevel === 0 ? "disabled" : ""}>−</button>
            <span class="op-buff-level-label${isMax ? " max" : ""}">${levelState.label}</span>
            <button type="button" class="op-level-btn" data-dir="1" data-buff="${buff.id}" ${purchasedLevel >= purchasableMax ? "disabled" : ""}>+</button>
          </div>
        </div>
        <p class="op-buff-desc">${escapeXml(levelState.text)}${progressionText}</p>
      </div>
    `;
    }).join("");

    opBuffList.querySelectorAll(".op-level-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.buff;
            const dir = parseInt(btn.dataset.dir, 10);
            const def = BUFF_DEFS.find(b => b.id === id);
            const current = editingOpLevels[id] || 0;
            const perkIndex = BUFF_DEFS.findIndex(b => b.id === id);
            const purchasableMax = perkIndex < 5 ? 6 : 1;
            editingOpLevels[id] = Math.max(0, Math.min(purchasableMax, current + dir));
            editingOpLevels = normalizeOpLevels(editingOpLevels);
            renderOpBuffList();
        });
    });
}

async function saveOpLevels() {
    if (editingOpCharacterId === null) return;
    const characterId = editingOpCharacterId;
    const idx = state.characters.findIndex(c => c.id === characterId);
    if (idx === -1) return;

    const levelsSnapshot = normalizeOpLevels(editingOpLevels);
    state.characters[idx] = { ...state.characters[idx], opLevels: levelsSnapshot };
    showOpStatus("Salvando...", false);

    try {
        await Database.updateCharacter(state.characters[idx]);
        refreshCardOpIndicator(characterId);
        renderCharacters();
        showOpStatus("✓ Salvo", false, true);
        closeOpModal();
    } catch (err) {
        console.error("Erro ao salvar buffs do personagem:", err);
        showOpStatus("Erro ao salvar.", true, false);
    }
}

// Atualiza só as classes visuais do card já renderizado, sem recriar a lista inteira
function refreshCardOpIndicator(characterId) {
    const card = charGroupsEl.querySelector(`.char-card[data-char-id="${characterId}"]`);
    const character = state.characters.find(c => c.id === characterId);
    if (!card || !character) return;
    const status = getOpStatus(character);
    card.classList.toggle("op-has-buff", status.any);
    card.classList.toggle("op-maxed", status.maxed);
}

document.getElementById("opModalClose").addEventListener("click", closeOpModal);
document.getElementById("opCloseBtn").addEventListener("click", closeOpModal);
document.getElementById("opSaveBtn")?.addEventListener("click", saveOpLevels);
opModalOverlay.addEventListener("click", (e) => {
    if (e.target === opModalOverlay) closeOpModal();
});

/* ============================================================
   ORDEM DA WISHLIST (favoritos + estrelas) — usada pelo perk OP "p1"
   ------------------------------------------------------------
   Cada personagem tem um campo character.wishlistPosition. Só é
   relevante para category "favoritos" ou "estrelas" (juntas formam a
   $wishlist de verdade do Mudae — ver WISHLIST_CATEGORIES em formulas.js).
   A ordem decide quem são os "vizinhos" de cada personagem para
   o cálculo do perk "Spawn na Wishlist" (ver formulas.js).
   ============================================================ */

function getMaxWishlistPosition() {
    return state.characters.reduce((max, c) => {
        const pos = Number(c.wishlistPosition);
        return Number.isFinite(pos) ? Math.max(max, pos) : max;
    }, -1);
}

// Garante que todo personagem de "favoritos"/"estrelas" já existente tenha uma posição.
// Retorna a lista de personagens que precisaram ser atualizados (pra persistir).
function ensureWishlistPositions() {
    let nextPos = getMaxWishlistPosition() + 1;
    const updated = [];
    state.characters.forEach(c => {
        if (WISHLIST_CATEGORIES.includes(c.category) && !Number.isFinite(Number(c.wishlistPosition))) {
            c.wishlistPosition = nextPos++;
            updated.push(c);
        }
    });
    return updated;
}

const wishlistOrderModalOverlay = document.getElementById("wishlistOrderModalOverlay");
const wishlistOrderList = document.getElementById("wishlistOrderList");
const wishlistOrderStatus = document.getElementById("wishlistOrderStatus");

function setWishlistOrderStatus(message, isError = false) {
    if (!wishlistOrderStatus) return;
    wishlistOrderStatus.textContent = message;
    wishlistOrderStatus.style.color = isError ? "var(--pink)" : "var(--green)";
}

function openWishlistOrderModal(highlightId) {
    if (!wishlistOrderModalOverlay) return;
    setWishlistOrderStatus("");
    renderWishlistOrderList(highlightId);
    wishlistOrderModalOverlay.classList.add("active");
}

function closeWishlistOrderModal() {
    if (!wishlistOrderModalOverlay) return;
    wishlistOrderModalOverlay.classList.remove("active");
}

function renderWishlistOrderList(highlightId) {
    if (!wishlistOrderList) return;
    const ordered = getOrderedWishlist(state.characters);

    if (ordered.length === 0) {
        wishlistOrderList.innerHTML = `<p class="wishlist-order-empty">Nenhum personagem em Favoritos ainda. Adicione personagens à categoria Favoritos para configurar a ordem da wishlist.</p>`;
        return;
    }

    wishlistOrderList.innerHTML = ordered.map((c, idx) => {
        const maxIdx = wishlistNeighborBonus.length - 1;
        const p1Level = Math.min(Math.max(Number(c.opLevels && c.opLevels.p1) || 0, 0), maxIdx);
        const p1Pct = Math.round(wishlistNeighborBonus[p1Level] * 100);
        const photoBlock = c.photo
            ? `<img src="${c.photo}" alt="${escapeXml(c.name)}" />`
            : `<span>⬆</span>`;

        const catMeta = CAT_META[c.category];

        return `
      <div class="wishlist-order-row${String(c.id) === String(highlightId) ? " highlight" : ""}" data-char-id="${c.id}">
        <span class="wishlist-order-pos">${idx + 1}</span>
        <div class="wishlist-order-photo">${photoBlock}</div>
        <div class="wishlist-order-info">
          <div class="wishlist-order-name">${catMeta ? `<span style="color:${catMeta.color}" title="${catMeta.label}">${catMeta.icon}</span> ` : ""}${escapeXml(c.name)}</div>
          <div class="wishlist-order-series">${escapeXml(c.series)}</div>
        </div>
        ${p1Level > 0 ? `<span class="wishlist-order-badge" title="Aumenta a chance dos personagens vizinhos">OP +${p1Pct}% vizinhos</span>` : ""}
        <div class="wishlist-order-controls">
          <button type="button" class="op-level-btn" data-dir="-1" data-id="${c.id}" ${idx === 0 ? "disabled" : ""} title="Mover para cima">▲</button>
          <button type="button" class="op-level-btn" data-dir="1" data-id="${c.id}" ${idx === ordered.length - 1 ? "disabled" : ""} title="Mover para baixo">▼</button>
        </div>
      </div>
    `;
    }).join("");

    wishlistOrderList.querySelectorAll(".op-level-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            moveWishlistCharacter(btn.dataset.id, parseInt(btn.dataset.dir, 10));
        });
    });

    if (highlightId) {
        const row = wishlistOrderList.querySelector(`.wishlist-order-row[data-char-id="${highlightId}"]`);
        if (row) row.scrollIntoView({ block: "nearest" });
    }
}

function normalizeWishlistPositions(orderedCharacters) {
    orderedCharacters.forEach((character, index) => {
        character.wishlistPosition = index + 1;
    });
    return orderedCharacters;
}

async function moveWishlistCharacter(id, dir) {
    const ordered = getOrderedWishlist(state.characters);
    const idx = ordered.findIndex(c => String(c.id) === String(id));
    const targetIdx = idx + dir;
    if (idx === -1 || targetIdx < 0 || targetIdx >= ordered.length) return;

    const moved = ordered.splice(idx, 1)[0];
    ordered.splice(targetIdx, 0, moved);
    const reordered = normalizeWishlistPositions(ordered);

    // Atualiza a UI imediatamente para refletir a nova ordem sem exigir F5.
    const affected = reordered.filter(character => character && Number.isFinite(Number(character.wishlistPosition)));
    renderCharacters();
    renderWishlistOrderList(moved.id);
    setWishlistOrderStatus("Salvando...");

    try {
        await Promise.all(affected.map(character => Database.updateCharacter(character)));
        setWishlistOrderStatus("✓ Ordem salva");
    } catch (err) {
        console.error("Erro ao salvar a ordem da wishlist:", err);
        setWishlistOrderStatus("Erro ao salvar a ordem.", true);
    }
}

document.getElementById("wishlistOrderModalClose")?.addEventListener("click", closeWishlistOrderModal);
document.getElementById("wishlistOrderCloseBtn")?.addEventListener("click", closeWishlistOrderModal);
document.getElementById("btnOpenWishlistOrder")?.addEventListener("click", () => openWishlistOrderModal());
wishlistOrderModalOverlay?.addEventListener("click", (e) => {
    if (e.target === wishlistOrderModalOverlay) closeWishlistOrderModal();
});

document.querySelectorAll(".pill[data-jump]").forEach(pill => {
    pill.addEventListener("click", () => {
        const target = document.getElementById("group-" + pill.dataset.jump);
        if (!target) return;
        target.classList.remove("collapsed");
        target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
});

/* ---------- Modal: novo personagem ---------- */
const modalOverlay = document.getElementById("modalOverlay");
const mName = document.getElementById("mName");
const mSeries = document.getElementById("mSeries");
const mKakera = document.getElementById("mKakera");
const mKeys = document.getElementById("mKeys");
const mCategory = document.getElementById("mCategory");
const mClaimed = document.getElementById("mClaimed");

// ---- Upload de foto ----
const photoUploadArea = document.getElementById("photoUploadArea");
const mPhotoInput = document.getElementById("mPhotoInput");
const mPhotoUrl = document.getElementById("mPhotoUrl");
const photoPreviewImg = document.getElementById("photoPreviewImg");
const photoPlaceholder = document.getElementById("photoPlaceholder");
let mPhotoData = null;

function showPhotoPreview(dataUrl) {
    photoPreviewImg.src = dataUrl;
    photoPreviewImg.style.display = "block";
    photoPlaceholder.style.display = "none";
}

function clearPhotoPreview() {
    mPhotoData = null;
    mPhotoInput.value = "";
    if (mPhotoUrl) mPhotoUrl.value = "";
    photoPreviewImg.src = "";
    photoPreviewImg.style.display = "none";
    photoPlaceholder.style.display = "flex";
}

// Permite usar um link de imagem em vez de enviar um arquivo
if (mPhotoUrl) {
    mPhotoUrl.addEventListener("input", () => {
        const url = mPhotoUrl.value.trim();
        if (url) {
            mPhotoInput.value = ""; // limpa upload de arquivo, já que agora usamos o link
            mPhotoData = url;
            showPhotoPreview(url);
        } else if (mPhotoData && !mPhotoData.startsWith("data:")) {
            // usuário apagou o link e não há arquivo enviado
            mPhotoData = null;
            photoPreviewImg.src = "";
            photoPreviewImg.style.display = "none";
            photoPlaceholder.style.display = "flex";
        }
    });
}

function handlePhotoFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    if (mPhotoUrl) mPhotoUrl.value = ""; // arquivo enviado tem prioridade sobre o link

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const maxDim = 320;
            let { width, height } = img;
            if (width > height && width > maxDim) {
                height = Math.round(height * (maxDim / width));
                width = maxDim;
            } else if (height >= width && height > maxDim) {
                width = Math.round(width * (maxDim / height));
                height = maxDim;
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            canvas.getContext("2d").drawImage(img, 0, 0, width, height);
            mPhotoData = canvas.toDataURL("image/jpeg", 0.85);
            showPhotoPreview(mPhotoData);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

photoUploadArea.addEventListener("click", () => mPhotoInput.click());
mPhotoInput.addEventListener("change", (e) => handlePhotoFile(e.target.files[0]));

["dragover", "dragenter"].forEach(evt =>
    photoUploadArea.addEventListener(evt, (e) => {
        e.preventDefault();
        photoUploadArea.classList.add("drag-over");
    })
);
["dragleave", "drop"].forEach(evt =>
    photoUploadArea.addEventListener(evt, (e) => {
        e.preventDefault();
        photoUploadArea.classList.remove("drag-over");
    })
);
photoUploadArea.addEventListener("drop", (e) => {
    handlePhotoFile(e.dataTransfer.files[0]);
});

// ---- Gêneros ($wa, $wg, $ha, $hg) ----
const GENDER_OPTIONS = ["wa", "wg", "ha", "hg"];
const mGenderRow = document.getElementById("mGenderRow");
let mGenders = new Set();

function renderGenderButtons() {
    if (!mGenderRow) return;
    mGenderRow.querySelectorAll(".gender-btn").forEach(btn => {
        btn.classList.toggle("active", mGenders.has(btn.dataset.gender));
    });
}

function setGenders(genders) {
    mGenders = new Set((genders || []).filter(g => GENDER_OPTIONS.includes(g)));
    renderGenderButtons();
}

if (mGenderRow) {
    mGenderRow.querySelectorAll(".gender-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const g = btn.dataset.gender;
            if (mGenders.has(g)) {
                mGenders.delete(g);
            } else {
                mGenders.add(g);
            }
            renderGenderButtons();
        });
    });
}

// Controla se o modal está criando um personagem novo ou editando um existente
let editingCharacterId = null;

// Verifica se o limite do harem já foi atingido
function haremLimitReached() {
    const limit = state.config.haremLimit;
    return limit > 0 && state.characters.length >= limit;
}

function openModal(defaultCat) {
    if (haremLimitReached()) {
        showSystemAlert(
            `Limite do harem atingido (${state.characters.length}/${state.config.haremLimit}).\n` +
            `Aumente o valor em "TOTAL DE PERSONAGENS NO HAREM" nas Configurações, ou remova algum personagem antes de adicionar um novo.`,
            {
                title: "Limite do Harém",
                type: "warning",
                confirmText: "ENTENDI"
            }
        );
        return;
    }

    editingCharacterId = null;
    document.getElementById("modalTitle").textContent = "Novo Personagem";
    document.getElementById("modalAdd").textContent = "ADICIONAR";

    mName.value = "";
    mSeries.value = "";
    mKakera.value = "500";
    if (mKeys) mKeys.value = "0";
    mCategory.value = defaultCat || "comuns";
    if (mClaimed) mClaimed.value = "true";
    clearPhotoPreview();
    setGenders([]);
    modalOverlay.classList.add("active");
    mName.focus();
}

function openEditModal(character) {
    editingCharacterId = character.id;
    document.getElementById("modalTitle").textContent = "Editar Personagem";
    document.getElementById("modalAdd").textContent = "SALVAR ALTERAÇÕES";

    mName.value = character.name;
    mSeries.value = character.series === "—" ? "" : character.series;
    mKakera.value = character.kakera;
    if (mKeys) mKeys.value = Number(character.keys) || 0;
    mCategory.value = character.category;
    if (mClaimed) mClaimed.value = String(character.claimed !== false);

    if (character.photo) {
        mPhotoData = character.photo;
        showPhotoPreview(character.photo);
        // se a foto for um link (não um data URL de upload), preenche o campo de link também
        if (mPhotoUrl) mPhotoUrl.value = character.photo.startsWith("data:") ? "" : character.photo;
    } else {
        clearPhotoPreview();
    }

    setGenders(character.genders);

    modalOverlay.classList.add("active");
    mName.focus();
}

function closeModal() {
    modalOverlay.classList.remove("active");
    editingCharacterId = null;
}

document.getElementById("modalClose").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => {
    if (e.target === modalOverlay) closeModal();
});

document.getElementById("modalAdd").addEventListener("click", async () => {
    const isEditing = editingCharacterId !== null;

    // O limite do harem só se aplica ao criar um personagem novo, não ao editar
    if (!isEditing && haremLimitReached()) {
        showSystemAlert(
            `Limite do harem atingido (${state.characters.length}/${state.config.haremLimit}). Não é possível adicionar mais personagens.`,
            {
                title: "Limite do Harém",
                type: "warning",
                confirmText: "ENTENDI"
            }
        );
        return;
    }

    const name = mName.value.trim();
    if (!name) {
        mName.focus();
        return;
    }

    const kakeraVal = parseInt(mKakera.value) || 0;
    const keysVal = parseInt(mKeys && mKeys.value) || 0;

    const addBtn = document.getElementById("modalAdd");
    addBtn.disabled = true;

    try {
        if (isEditing) {
            const existing = state.characters.find(c => c.id === editingCharacterId);
            let wishlistPosition = existing.wishlistPosition;
            if (WISHLIST_CATEGORIES.includes(mCategory.value)) {
                if (!Number.isFinite(Number(wishlistPosition))) {
                    // Passou a ser favorito/estrela agora: entra no final da wishlist.
                    wishlistPosition = getMaxWishlistPosition() + 1;
                }
            } else {
                // Saiu da wishlist (virou "comuns"): limpa a posição pra não
                // deixar um valor obsoleto que poderia colidir depois.
                wishlistPosition = null;
            }

            const personagemAtualizado = {
                ...existing,
                name,
                series: mSeries.value.trim() || "—",
                category: mCategory.value,
                claimed: !mClaimed || mClaimed.value === "true",
                kakera: kakeraVal,
                keys: keysVal,
                photo: mPhotoData,
                genders: Array.from(mGenders),
                opLevels: existing.opLevels || defaultOpLevels(),
                wishlistPosition
            };

            await Database.updateCharacter(personagemAtualizado);

            const idx = state.characters.findIndex(c => c.id === editingCharacterId);
            state.characters[idx] = personagemAtualizado;
        } else {
            const novoPersonagem = {
                name,
                series: mSeries.value.trim() || "—",
                category: mCategory.value,
                claimed: !mClaimed || mClaimed.value === "true",
                buff: 1,
                kakera: kakeraVal,
                keys: keysVal,
                daysAgo: 0,
                photo: mPhotoData,
                genders: Array.from(mGenders),
                opLevels: defaultOpLevels(),
                wishlistPosition: WISHLIST_CATEGORIES.includes(mCategory.value) ? getMaxWishlistPosition() + 1 : null
            };

            const newId = await Database.addCharacter(novoPersonagem);
            state.characters.push({ id: newId, ...novoPersonagem });
        }

        closeModal();
        renderCharacters();
    } catch (err) {
        console.error("Erro ao salvar personagem:", err);
        showSystemAlert(
            "Não foi possível salvar o personagem. Tente novamente.",
            {
                title: "Erro ao Salvar",
                type: "danger",
                confirmText: "FECHAR"
            }
        );
    } finally {
        addBtn.disabled = false;
    }
});

/* ============================================================
   IMPORTAR DO MUDAE (texto colado do harem/wishlist)
   ------------------------------------------------------------
   O parser em si (que entende o formato de texto que o Mudae
   gera) mora em mudae-import.js, separado deste arquivo, pra
   isolar tudo que depende do formato exato do texto colado.
   Aqui só adaptamos o resultado dele pro formato que a UI espera.
   ============================================================ */

// Normaliza nomes para detectar personagens já cadastrados sem criar
// duplicatas por diferenças de caixa, acentos ou espaços extras.
function normalizeCharacterName(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/\s+/g, " ")
        .trim();
}

function findExistingCharacterByName(name) {
    const normalized = normalizeCharacterName(name);
    if (!normalized) return null;
    return state.characters.find(character => normalizeCharacterName(character.name) === normalized) || null;
}

// Atualiza somente dados que a importação realmente conhece, preservando
// categoria, perks, posição da wishlist e demais dados locais.
function mergeImportedCharacter(existing, item, { allowCategoryChange = false, category = existing.category } = {}) {
    const importedGenders = normalizeCharacterGenders(item.genders);
    const hasOwner = Boolean(item.nickname);
    return {
        ...existing,
        category: allowCategoryChange ? category : existing.category,
        series: item.series && item.series !== "Wishlist" && item.series !== "—" ? item.series : existing.series,
        kakera: Number.isFinite(Number(item.kakera)) ? Number(item.kakera) : existing.kakera,
        keys: Number.isFinite(Number(item.keys)) ? Number(item.keys) : existing.keys,
        photo: item.photo || existing.photo,
        genders: importedGenders.length ? importedGenders : (existing.genders || []),
        claimed: item.importType === "harem" ? true : (hasOwner ? true : existing.claimed),
        nickname: item.nickname || existing.nickname || null
    };
}

// Extrai a lista de personagens (nome, série, kakera, foto, gêneros) do texto colado
function parseMudaeImportText(rawText) {
    const items = MudaeImport.parse(rawText);
    return items.map(item => ({
        name: item.name,
        series: item.series || "—",
        kakera: item.kakera,
        keys: item.keys || 0,
        photo: item.photo,
        genders: normalizeCharacterGenders(item.genders),
        importType: item.importType || "harem",
        isStarwish: item.isStarwish === true,
        suggestedCategory: item.suggestedCategory || null,
        position: item.position || null,
        nickname: item.nickname || null
    }));
}

const importModalOverlay = document.getElementById("importModalOverlay");
const importText = document.getElementById("importText");
const importParseBtn = document.getElementById("importParseBtn");
const importPreview = document.getElementById("importPreview");
const importActions = document.getElementById("importActions");
const importCount = document.getElementById("importCount");
const importConfirmBtn = document.getElementById("importConfirmBtn");
const importStatus = document.getElementById("importStatus");
const btnOpenImport = document.getElementById("btnOpenImport");

let parsedImportItems = [];

function setImportStatus(msg, isError = false) {
    if (!importStatus) return;
    importStatus.textContent = msg;
    importStatus.style.color = isError ? "var(--pink)" : "var(--green)";
}

function openImportModal() {
    if (!importModalOverlay) return;
    importText.value = "";
    parsedImportItems = [];
    importPreview.innerHTML = "";
    importActions.classList.remove("active");
    setImportStatus("");
    importModalOverlay.classList.add("active");
    importText.focus();
}

function closeImportModal() {
    if (!importModalOverlay) return;
    importModalOverlay.classList.remove("active");
}

function renderImportPreview() {
    if (parsedImportItems.length === 0) {
        importPreview.innerHTML = `<div class="import-empty">Nenhum personagem reconhecido. Verifique se o texto colado segue o formato exportado pelo Mudae.</div>`;
        importActions.classList.remove("active");
        importCount.textContent = "0";
        return;
    }

    importPreview.innerHTML = parsedImportItems.map(item => `
        <div class="import-item">
            ${item.photo ? `<img src="${item.photo}" alt="${escapeXml(item.name)}" />` : `<img alt="" />`}
            <div class="import-item-info">
                <div class="import-item-name">${escapeXml(item.name)}</div>
                <div class="import-item-series">${escapeXml(item.series)}</div>
            </div>
            <div class="import-item-meta">
                <span class="tag kakera">${formatKakera(item.kakera)}</span>
                <span class="tag keys" title="Chaves">🔑 ${Number(item.keys) || 0}</span>
                ${normalizeCharacterGenders(item.genders).length ? `<div class="gender-tags">${renderGenderChips(item.genders)}</div>` : ""}
                ${item.importType === "wishlist" ? `<span class="tag ${item.isStarwish ? "wishlist-star-tag" : "wishlist-fav-tag"}">${item.isStarwish ? "★ Estrela" : "♥ Favorito"}</span>` : ""}
                ${item.importType === "wishlist" ? `<span class="tag ${findExistingCharacterByName(item.name) ? "wishlist-update-tag" : "wishlist-new-tag"}">${findExistingCharacterByName(item.name) ? "↻ Atualizar dados/categoria" : "+ Novo"}</span>` : `<span class="tag ${findExistingCharacterByName(item.name) ? "wishlist-update-tag" : "wishlist-new-tag"}">${findExistingCharacterByName(item.name) ? "↻ Atualizar" : "+ Novo"}</span>`}
            </div>
        </div>
    `).join("");

    importCount.textContent = String(parsedImportItems.length);
    importActions.classList.add("active");
}

if (btnOpenImport) btnOpenImport.addEventListener("click", openImportModal);

const btnAddCharacter = document.getElementById("btnAddCharacter");
if (btnAddCharacter) btnAddCharacter.addEventListener("click", () => openModal());
if (document.getElementById("importModalClose")) {
    document.getElementById("importModalClose").addEventListener("click", closeImportModal);
}
if (importModalOverlay) {
    importModalOverlay.addEventListener("click", (e) => {
        if (e.target === importModalOverlay) closeImportModal();
    });
}

if (importParseBtn) {
    importParseBtn.addEventListener("click", () => {
        const text = importText.value.trim();
        if (!text) {
            setImportStatus("Cole o texto exportado pelo Mudae antes de analisar.", true);
            return;
        }
        parsedImportItems = parseMudaeImportText(text);
        renderImportPreview();
        if (parsedImportItems.length === 0) {
            setImportStatus("Não foi possível reconhecer personagens nesse texto.", true);
        } else {
            const wishlistImport = parsedImportItems.some(item => item.importType === "wishlist");
            if (wishlistImport) {
                const existingCount = parsedImportItems.filter(item => findExistingCharacterByName(item.name)).length;
                const newCount = parsedImportItems.length - existingCount;
                setImportStatus(`✓ ${parsedImportItems.length} personagem(ns) da wishlist encontrado(s): ${existingCount} existente(s) terão apenas a categoria atualizada e ${newCount} novo(s) serão inseridos.`);
            } else {
                const importedNames = new Set(parsedImportItems.map(item => normalizeCharacterName(item.name)));
                const existingCount = parsedImportItems.filter(item => findExistingCharacterByName(item.name)).length;
                const newCount = parsedImportItems.length - existingCount;
                const removeCount = state.characters.filter(character => character.claimed !== false && !importedNames.has(normalizeCharacterName(character.name))).length;
                setImportStatus(`✓ Sincronização: ${existingCount} existente(s) serão atualizados, ${newCount} novo(s) inseridos e ${removeCount} reivindicado(s) ausente(s) removidos. Não reivindicados serão preservados.`);
            }
        }
    });
}

if (importConfirmBtn) {
    importConfirmBtn.addEventListener("click", async () => {
        if (parsedImportItems.length === 0) return;

        // Personagens do harem entram sempre em "comuns" — a categorização
        // fina (favoritos/estrelas) já acontece automaticamente pelo import
        // da wishlist, então não pedimos mais isso aqui.
        const selectedCategory = "comuns";
        const isWishlistImport = parsedImportItems.every(item => item.importType === "wishlist");
        const importedNames = new Set(parsedImportItems.map(item => normalizeCharacterName(item.name)).filter(Boolean));
        const newItemsCount = parsedImportItems.filter(item => !findExistingCharacterByName(item.name)).length;
        const removableClaimed = isWishlistImport ? [] : state.characters.filter(character =>
            character.claimed !== false && !importedNames.has(normalizeCharacterName(character.name))
        );

        const limit = state.config.haremLimit;
        const projectedCount = state.characters.length - removableClaimed.length + newItemsCount;
        if (limit > 0 && projectedCount > limit) {
            showSystemAlert(
                `Limite do harem atingido: após sincronizar, a importação deixaria ${projectedCount}/${limit} personagens. ` +
                `Personagens reivindicados ausentes seriam removidos antes da inclusão dos novos.`,
                {
                    title: "Limite do Harém",
                    type: "warning",
                    confirmText: "ENTENDI"
                }
            );
            return;
        }

        importConfirmBtn.disabled = true;
        let inserted = 0;
        let updated = 0;
        let removed = 0;
        let nextWishlistPos = getMaxWishlistPosition() + 1;

        try {
            if (!isWishlistImport) {
                // A importação de harem é uma sincronização completa dos reivindicados.
                // Não reivindicados são mantidos mesmo quando ausentes no novo texto.
                for (const character of removableClaimed) {
                    await Database.deleteCharacter(character.id);
                    removed++;
                }
                if (removableClaimed.length) {
                    const removedIds = new Set(removableClaimed.map(character => String(character.id)));
                    state.characters = state.characters.filter(character => !removedIds.has(String(character.id)));
                }
            }

            for (const item of parsedImportItems) {
                const existing = findExistingCharacterByName(item.name);
                const category = item.importType === "wishlist"
                    ? (item.suggestedCategory || (item.isStarwish ? "estrelas" : "favoritos"))
                    : selectedCategory;

                if (existing) {
                    const updatedCharacter = mergeImportedCharacter(existing, item, {
                        allowCategoryChange: item.importType === "wishlist",
                        category
                    });
                    if (item.importType === "wishlist" && WISHLIST_CATEGORIES.includes(category) &&
                        !Number.isFinite(Number(updatedCharacter.wishlistPosition))) {
                        updatedCharacter.wishlistPosition = nextWishlistPos++;
                    }
                    await Database.updateCharacter(updatedCharacter);
                    const stateIndex = state.characters.findIndex(character => String(character.id) === String(existing.id));
                    if (stateIndex >= 0) state.characters[stateIndex] = updatedCharacter;
                    updated++;
                    continue;
                }

                const novoPersonagem = {
                    name: item.name,
                    series: item.series || "—",
                    category,
                    claimed: item.importType === "harem" || Boolean(item.nickname),
                    nickname: item.nickname || null,
                    buff: 1.0,
                    kakera: Number(item.kakera) || 0,
                    keys: Number(item.keys) || 0,
                    daysAgo: 0,
                    photo: item.photo || null,
                    genders: normalizeCharacterGenders(item.genders),
                    opLevels: defaultOpLevels(),
                    wishlistPosition: WISHLIST_CATEGORIES.includes(category) ? nextWishlistPos++ : null
                };
                const newId = await Database.addCharacter(novoPersonagem);
                state.characters.push({ id: newId, ...novoPersonagem });
                inserted++;
            }

            const migrated = ensureWishlistPositions();
            for (const character of migrated) await Database.updateCharacter(character);

            renderCharacters();
            closeImportModal();
            if (isWishlistImport) {
                setBackupStatus(`✓ Wishlist processada: ${updated} personagem(ns) atualizado(s) e ${inserted} novo(s) inserido(s).`);
            } else {
                setBackupStatus(`✓ Harém sincronizado: ${updated} atualizado(s), ${inserted} novo(s) e ${removed} reivindicado(s) ausente(s) removido(s).`);
            }
        } catch (err) {
            console.error("Erro ao importar personagens do Mudae:", err);
            setImportStatus(`Processados ${updated + inserted + removed} itens antes de um erro ocorrer. Revise os dados e tente novamente.`, true);
        } finally {
            importConfirmBtn.disabled = false;
        }
    });
}

/* ============================================================
   IMPORTAR BUFFS OP — snapshot do $mmsz+z!
   ------------------------------------------------------------
   O comando novo já informa quais perks cada personagem possui e
   quantos níveis foram comprados. Portanto não existe mais sugestão
   manual de perk: a importação passa a sincronizar exatamente o OP
   descrito em cada linha do Mudae.

   Regras de sincronização:
     - nunca cria personagem novo;
     - procura o personagem existente pelo nome normalizado;
     - para personagens encontrados, substitui o snapshot de OP pelos
       perks/níveis informados naquela entrada;
     - perks ausentes da entrada daquele personagem voltam para nível 0;
     - personagens que não aparecem no texto não são alterados;
     - foto, categoria, kakera, chaves, Wishlist e demais dados locais
       permanecem intactos.
   ============================================================ */
const opImportModalOverlay = document.getElementById("opImportModalOverlay");
const opImportText = document.getElementById("opImportText");
const opImportParseBtn = document.getElementById("opImportParseBtn");
const opImportPreview = document.getElementById("opImportPreview");
const opImportActions = document.getElementById("opImportActions");
const opImportCount = document.getElementById("opImportCount");
const opImportConfirmBtn = document.getElementById("opImportConfirmBtn");
const opImportStatus = document.getElementById("opImportStatus");
const btnOpenOpImport = document.getElementById("btnOpenOpImport");

let parsedOpImportItems = [];
let parsedOpImportTotalInvested = 0;
let parsedOpImportSum = 0;
let parsedOpImportIsConsistent = true;

/** Exibe mensagens de validação/resultado dentro da própria modal de OP. */
function setOpImportStatus(msg, isError = false) {
    if (!opImportStatus) return;
    opImportStatus.textContent = msg;
    opImportStatus.style.color = isError ? "var(--pink)" : "var(--green)";
}

/** Reseta e abre a modal de importação do snapshot OP. */
function openOpImportModal() {
    if (!opImportModalOverlay) return;
    opImportText.value = "";
    parsedOpImportItems = [];
    parsedOpImportTotalInvested = 0;
    parsedOpImportSum = 0;
    parsedOpImportIsConsistent = true;
    opImportPreview.innerHTML = "";
    opImportActions.classList.remove("active");
    setOpImportStatus("");
    opImportModalOverlay.classList.add("active");
    opImportText.focus();
}

/** Fecha a modal sem aplicar nenhuma mudança pendente. */
function closeOpImportModal() {
    if (!opImportModalOverlay) return;
    opImportModalOverlay.classList.remove("active");
}

/**
 * Calcula quanto o modelo atual do Tracker entende que os níveis importados
 * custaram. Serve apenas como conferência visual; o valor exibido pelo Mudae
 * continua sendo mostrado separadamente e não é recalculado pelo parser.
 */
function computeImportedOpLevelCost(levels) {
    const normalized = normalizeOpLevels(levels);
    return BUFF_DEFS.reduce((total, buff, perkIndex) => {
        const maxLevel = perkIndex < 5 ? 6 : 1;
        const level = Math.min(Math.max(Number(normalized[buff.id]) || 0, 0), maxLevel);
        for (let nextLevel = 1; nextLevel <= level; nextLevel++) {
            total += opLevelCost(perkIndex, nextLevel);
        }
        return total;
    }, 0);
}

/** Gera uma descrição compacta: "OP 1 ×2 · OP 8 · OP 10". */
function formatImportedOpPerks(perks) {
    return (Array.isArray(perks) ? perks : [])
        .map(item => `OP ${Number(item.perk)}${Number(item.level) > 1 ? ` ×${Number(item.level)}` : ""}`)
        .join(" · ");
}

/** Renderiza a prévia do snapshot antes de qualquer alteração no banco. */
function renderOpImportPreview() {
    if (parsedOpImportItems.length === 0) {
        opImportPreview.innerHTML = `<div class="import-empty">Nenhum personagem reconhecido. Verifique se o texto colado é o do comando $mmsz+z!.</div>`;
        opImportActions.classList.remove("active");
        opImportCount.textContent = "0";
        return;
    }

    opImportPreview.innerHTML = parsedOpImportItems.map(item => {
        const found = Boolean(item.existing);
        const calculated = computeImportedOpLevelCost(item.opLevels);
        const costMatches = calculated === Number(item.invested || 0);
        const perkText = formatImportedOpPerks(item.perks);

        return `
        <div class="import-item op-import-item${found ? "" : " op-import-item-missing"}">
            ${found && item.existing.photo ? `<img src="${item.existing.photo}" alt="${escapeXml(item.name)}" />` : `<img alt="" />`}
            <div class="import-item-info">
                <div class="import-item-name">${escapeXml(item.name)}</div>
                <div class="import-item-series">${Number(item.invested).toLocaleString("pt-BR")} esferas · ${escapeXml(perkText)}</div>
                ${costMatches ? "" : `<div class="op-import-cost-warning">⚠ Custo pelos níveis reconhecidos: ${calculated.toLocaleString("pt-BR")} esferas</div>`}
            </div>
            <div class="import-item-meta op-import-item-meta">
                ${found
                    ? `<span class="tag wishlist-update-tag">↻ Sincronizar OP</span>`
                    : `<span class="tag wishlist-new-tag" title="Esse import só atualiza personagens reivindicados do Harém">✕ Não encontrado</span>`}
            </div>
        </div>
    `;
    }).join("");

    const includedCount = parsedOpImportItems.filter(item => item.existing).length;
    opImportCount.textContent = String(includedCount);
    opImportActions.classList.toggle("active", includedCount > 0);
}

if (btnOpenOpImport) btnOpenOpImport.addEventListener("click", openOpImportModal);
if (document.getElementById("opImportModalClose")) {
    document.getElementById("opImportModalClose").addEventListener("click", closeOpImportModal);
}
if (opImportModalOverlay) {
    opImportModalOverlay.addEventListener("click", (e) => {
        if (e.target === opImportModalOverlay) closeOpImportModal();
    });
}

/** Analisa o texto sem persistir nada e prepara a prévia. */
if (opImportParseBtn) {
    opImportParseBtn.addEventListener("click", () => {
        const text = opImportText.value.trim();
        if (!text) {
            setOpImportStatus("Cole o texto do $mmsz+z! antes de analisar.", true);
            return;
        }

        const rawItems = MudaeImport.parseOPBuffs(text);
        parsedOpImportTotalInvested = Number(rawItems.totalInvested) || 0;
        parsedOpImportSum = Number(rawItems.parsedInvested) || rawItems.reduce((sum, item) => sum + Number(item.invested || 0), 0);

        // A mensagem pode conter nomes soltos sem SP entre entradas válidas.
        // O parser nunca cria uma entrada só para esses nomes; quando eles ficam
        // como prefixo textual do próximo bloco, resolvemos o sufixo contra os
        // personagens realmente reivindicados do Harém antes de sincronizar.
        const claimedHaremNames = state.characters
            .filter(character => character.claimed !== false)
            .map(character => character.name);

        parsedOpImportItems = rawItems.map(item => {
            const resolvedName = typeof MudaeImport.resolveOPEntryName === "function"
                ? MudaeImport.resolveOPEntryName(item.name, claimedHaremNames)
                : item.name;
            const displayName = resolvedName || item.name;
            const existing = resolvedName ? findExistingCharacterByName(resolvedName) : findExistingCharacterByName(item.name);
            const haremCharacter = existing && existing.claimed !== false ? existing : null;
            return {
                name: displayName,
                rawName: item.name,
                invested: Number(item.invested) || 0,
                perks: Array.isArray(item.perks) ? item.perks : [],
                opLevels: normalizeOpLevels(item.opLevels),
                existing: haremCharacter
            };
        });

        renderOpImportPreview();

        if (parsedOpImportItems.length === 0) {
            setOpImportStatus("Não foi possível reconhecer personagens, perks e níveis. Confira se o texto é do comando $mmsz+z!.", true);
            return;
        }

        const foundCount = parsedOpImportItems.filter(item => item.existing).length;
        const missingCount = parsedOpImportItems.length - foundCount;
        const totalText = parsedOpImportTotalInvested
            ? ` Total informado pelo Mudae: ${parsedOpImportTotalInvested.toLocaleString("pt-BR")} esferas.`
            : "";
        const totalMismatch = parsedOpImportTotalInvested > 0 && parsedOpImportTotalInvested !== parsedOpImportSum;
        parsedOpImportIsConsistent = !totalMismatch;
        if (totalMismatch) opImportActions.classList.remove("active");

        setOpImportStatus(
            `✓ ${parsedOpImportItems.length} personagem(ns) reconhecido(s): ${foundCount} existente(s) terão o OP sincronizado` +
            (missingCount ? ` e ${missingCount} não encontrado(s) no Harém serão ignorados.` : ".") +
            totalText +
            (totalMismatch ? ` ⚠ A soma das entradas reconhecidas é ${parsedOpImportSum.toLocaleString("pt-BR")} esferas. A importação foi bloqueada para evitar uma sincronização parcial.` : ""),
            totalMismatch
        );
    });
}

/**
 * Persiste o snapshot exato dos perks/níveis para cada personagem encontrado.
 * A cópia do objeto preserva todos os outros campos locais do personagem.
 */
if (opImportConfirmBtn) {
    opImportConfirmBtn.addEventListener("click", async () => {
        const toImport = parsedOpImportItems.filter(item => item.existing);
        if (toImport.length === 0 || !parsedOpImportIsConsistent) return;

        opImportConfirmBtn.disabled = true;
        let updated = 0;

        try {
            for (const item of toImport) {
                const existing = item.existing;
                const importedLevels = normalizeOpLevels(item.opLevels);
                const updatedCharacter = { ...existing, opLevels: importedLevels };

                await Database.updateCharacter(updatedCharacter);
                const stateIndex = state.characters.findIndex(character => String(character.id) === String(existing.id));
                if (stateIndex >= 0) state.characters[stateIndex] = updatedCharacter;
                updated++;
            }

            renderCharacters();
            closeOpImportModal();
            setBackupStatus(`✓ OP importado do $mmsz+z!: ${updated} personagem(ns) sincronizado(s).`);
        } catch (err) {
            console.error("Erro ao importar buffs OP:", err);
            setOpImportStatus(`Processados ${updated} de ${toImport.length} antes de um erro ocorrer. Tente novamente.`, true);
        } finally {
            opImportConfirmBtn.disabled = false;
        }
    });
}

/* ============================================================
   BACKUP / RESTAURAÇÃO (JSON)
   ============================================================ */
const btnExportBackup = document.getElementById("btnExportBackup");
const btnImportBackup = document.getElementById("btnImportBackup");
const importFileInput = document.getElementById("importFileInput");
const backupStatus = document.getElementById("backupStatus");

let backupStatusTimeout = null;
function setBackupStatus(msg, isError = false) {
    if (!backupStatus) return;
    backupStatus.textContent = msg;
    backupStatus.style.color = isError ? "var(--pink)" : "var(--green)";
    clearTimeout(backupStatusTimeout);
    if (msg) {
        backupStatusTimeout = setTimeout(() => { backupStatus.textContent = ""; }, 3000);
    }
}

if (btnExportBackup) {
    btnExportBackup.addEventListener("click", async () => {
        try {
            const data = await Database.exportAllData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const dateStr = new Date().toISOString().slice(0, 10);

            const a = document.createElement("a");
            a.href = url;
            a.download = `mudae-tracker-backup-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            setBackupStatus("✓ Backup baixado com sucesso!");
        } catch (err) {
            console.error("Erro ao gerar backup:", err);
            setBackupStatus("Erro ao gerar o backup.", true);
        }
    });
}

if (btnImportBackup) {
    btnImportBackup.addEventListener("click", () => importFileInput.click());
}

if (importFileInput) {
    importFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const confirmado = await showSystemConfirm(
            "Restaurar este backup vai substituir todos os personagens e configurações salvos atualmente. Deseja continuar?",
            {
                title: "Restaurar Backup",
                type: "warning",
                confirmText: "RESTAURAR",
                cancelText: "CANCELAR"
            }
        );
        if (!confirmado) {
            importFileInput.value = "";
            return;
        }

        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            await Database.restoreAllData(parsed);

            const [dbCharacters, dbConfig] = await Promise.all([
                Database.getAllCharacters(),
                Database.getConfig()
            ]);
            state.characters = dbCharacters || [];
            if (dbConfig) Object.assign(state.config, dbConfig);
            migrateLegacyConfig();

            loadConfigForm();
            renderConfigStats();
            renderCharacters();

            setBackupStatus("✓ Backup restaurado com sucesso!");
        } catch (err) {
            console.error("Erro ao restaurar backup:", err);
            setBackupStatus("Erro ao restaurar o backup. Verifique se o arquivo é válido.", true);
        } finally {
            importFileInput.value = "";
        }
    });
}

/* ============================================================
   PERFIS (multi-perfil)
   ------------------------------------------------------------
   Cada perfil tem sua PRÓPRIA lista de personagens e configuração,
   isoladas dentro do database.js (é ele quem filtra tudo pelo perfil
   ativo). Aqui só cuidamos da interface: listar perfis, trocar,
   criar, renomear e excluir — e recarregar `state` quando o perfil
   ativo muda. Nenhum cálculo, listagem ou filtro é alterado por
   causa disso: eles continuam lendo `state.config`/`state.characters`
   exatamente como antes, só que agora esses dados pertencem ao
   perfil selecionado no momento.
   ============================================================ */
const profileSelectEl = document.getElementById("profileSelect");
const btnNewProfile = document.getElementById("btnNewProfile");
const btnRenameProfile = document.getElementById("btnRenameProfile");
const btnDeleteProfile = document.getElementById("btnDeleteProfile");
const profileStatusEl = document.getElementById("profileStatus");

let profileStatusTimeout = null;
function setProfileStatus(msg, isError = false) {
    if (!profileStatusEl) return;
    profileStatusEl.textContent = msg;
    profileStatusEl.style.color = isError ? "var(--pink)" : "var(--green)";
    clearTimeout(profileStatusTimeout);
    if (msg) {
        profileStatusTimeout = setTimeout(() => { profileStatusEl.textContent = ""; }, 3000);
    }
}

// Carrega do IndexedDB tudo que pertence ao perfil ATUALMENTE ativo
// (config + personagens) para dentro de `state`. É a mesma lógica que
// já existia dentro de initApp(), só que extraída pra poder ser chamada
// de novo sempre que o usuário trocar de perfil.
async function loadActiveProfileData() {
    const [dbCharacters, dbConfig] = await Promise.all([
        Database.getAllCharacters(),
        Database.getConfig()
    ]);

    state.characters = dbCharacters || [];
    state.config = cloneDefaultConfig();

    // Migração: personagens antigos de "favoritos" ainda sem wishlistPosition
    // recebem uma posição agora, na ordem em que já estavam salvos.
    const charactersToMigrate = ensureWishlistPositions();
    if (charactersToMigrate.length > 0) {
        try {
            await Promise.all(charactersToMigrate.map(c => Database.updateCharacter(c)));
        } catch (err) {
            console.error("Erro ao migrar posições da wishlist:", err);
        }
    }

    if (dbConfig) {
        // Mescla com os padrões, garantindo que campos novos não fiquem undefined
        Object.assign(state.config, dbConfig);
    } else {
        // Perfil novo / primeira execução: ainda não existe configuração salva
        await Database.saveConfig(state.config);
    }

    const gendersBeforeMigration = state.characters.map(character => JSON.stringify(character.genders ?? []));
    migrateLegacyConfig();
    const normalizedGenderCharacters = state.characters.filter((character, index) =>
        JSON.stringify(character.genders ?? []) !== gendersBeforeMigration[index]
    );
    if (normalizedGenderCharacters.length > 0) {
        try {
            await Promise.all(normalizedGenderCharacters.map(character => Database.updateCharacter(character)));
        } catch (err) {
            console.error("Erro ao normalizar roletas antigas:", err);
        }
    }
}

// Repopula o <select> de perfis a partir do banco, mantendo o perfil
// ativo selecionado. Também habilita/desabilita o botão de excluir
// (não é permitido excluir o único perfil existente).
async function refreshProfileSelector() {
    if (!profileSelectEl) return;
    try {
        const [profiles, activeId] = await Promise.all([
            Database.listProfiles(),
            Database.getActiveProfileId()
        ]);
        profileSelectEl.innerHTML = profiles.map(p =>
            `<option value="${p.id}">${escapeXml(p.name)}</option>`
        ).join("");
        profileSelectEl.value = String(activeId);
        if (btnDeleteProfile) btnDeleteProfile.disabled = profiles.length <= 1;
    } catch (err) {
        console.error("Erro ao carregar a lista de perfis:", err);
    }
}

// Recarrega toda a interface depois de uma troca/criação/exclusão de perfil,
// sem duplicar a lógica de renderização que já existe em cada view.
async function refreshAppAfterProfileChange() {
    resetCharFilters();
    await loadActiveProfileData();
    loadConfigForm();
    renderConfigStats();
    renderCharacters();
    if (views.analysis.classList.contains("active")) renderAnalysis();
}

if (profileSelectEl) {
    profileSelectEl.addEventListener("change", async () => {
        const newId = Number(profileSelectEl.value);
        if (!Number.isFinite(newId)) return;
        try {
            await Database.setActiveProfile(newId);
            await refreshAppAfterProfileChange();
            await refreshProfileSelector();
            const profiles = await Database.listProfiles();
            const active = profiles.find(p => p.id === newId);
            setProfileStatus(`✓ Perfil "${active ? active.name : ""}" ativado.`);
        } catch (err) {
            console.error("Erro ao trocar de perfil:", err);
            setProfileStatus("Erro ao trocar de perfil.", true);
        }
    });
}

if (btnNewProfile) {
    btnNewProfile.addEventListener("click", async () => {
        const name = await showSystemPrompt(
            "Digite o nome do novo perfil.",
            {
                title: "Novo Perfil",
                type: "info",
                confirmText: "CRIAR",
                cancelText: "CANCELAR",
                inputLabel: "NOME DO PERFIL",
                placeholder: "Ex: Principal"
            }
        );
        if (name === null) return; // cancelado
        try {
            const newId = await Database.createProfile(name);
            await Database.setActiveProfile(newId);
            await refreshAppAfterProfileChange();
            await refreshProfileSelector();
            setProfileStatus(`✓ Perfil "${(name || "").trim() || "Novo perfil"}" criado e ativado.`);
        } catch (err) {
            console.error("Erro ao criar perfil:", err);
            setProfileStatus("Erro ao criar perfil.", true);
        }
    });
}

if (btnRenameProfile) {
    btnRenameProfile.addEventListener("click", async () => {
        try {
            const activeId = await Database.getActiveProfileId();
            const profiles = await Database.listProfiles();
            const current = profiles.find(p => p.id === activeId);
            const name = await showSystemPrompt(
                "Digite o novo nome do perfil.",
                {
                    title: "Renomear Perfil",
                    type: "info",
                    confirmText: "RENOMEAR",
                    cancelText: "CANCELAR",
                    defaultValue: current ? current.name : "",
                    inputLabel: "NOVO NOME"
                }
            );
            if (name === null) return; // cancelado
            if (!name.trim()) {
                setProfileStatus("O nome do perfil não pode ficar vazio.", true);
                return;
            }
            await Database.renameProfile(activeId, name);
            await refreshProfileSelector();
            setProfileStatus("✓ Perfil renomeado.");
        } catch (err) {
            console.error("Erro ao renomear perfil:", err);
            setProfileStatus("Erro ao renomear perfil.", true);
        }
    });
}

if (btnDeleteProfile) {
    btnDeleteProfile.addEventListener("click", async () => {
        try {
            const activeId = await Database.getActiveProfileId();
            const profiles = await Database.listProfiles();
            const current = profiles.find(p => p.id === activeId);
            if (profiles.length <= 1) {
                setProfileStatus("Não é possível excluir o único perfil existente.", true);
                return;
            }
            const confirmed = await showSystemConfirm(
                `Excluir o perfil "${current ? current.name : ""}"? Todos os personagens e configurações desse perfil serão apagados permanentemente.`,
                {
                    title: "Excluir Perfil",
                    type: "danger",
                    confirmText: "EXCLUIR",
                    cancelText: "CANCELAR"
                }
            );
            if (!confirmed) return;

            await Database.deleteProfile(activeId);
            await refreshAppAfterProfileChange();
            await refreshProfileSelector();
            setProfileStatus("✓ Perfil excluído.");
        } catch (err) {
            console.error("Erro ao excluir perfil:", err);
            setProfileStatus("Erro ao excluir perfil.", true);
        }
    });
}

/* ============================================================
   VIEW: ANÁLISE
   ============================================================ */
function renderAnalysis() {
    const chars = state.characters;
    const totalKakera = chars.reduce((sum, c) => sum + (Number(c.kakera) || 0), 0);
    const totalKeys = chars.reduce((sum, c) => sum + Math.max(0, Number(c.keys) || 0), 0);
    const withChances = chars.map(c => ({
        ...c,
        c1: chanceForCharacter(c, 1),
        c7: chanceForCharacter(c, 7),
        c15: chanceForCharacter(c, 15)
    }));

    const rollsDay = getDailyRolls(state.config, 1);
    document.getElementById("analysisSubtitle").textContent = `Baseado em ${rollsDay} rolls/dia · pools dinâmicos por roleta`;
    document.getElementById("kpiCount").textContent = chars.length;
    document.getElementById("kpiKakera").textContent = formatKakera(totalKakera);
    document.getElementById("kpiHighChance").textContent =
        totalKeys.toLocaleString("pt-BR");
    const best = withChances.reduce((m, c) => Math.max(m, c.c7), 0);
    document.getElementById("kpiBest").textContent = pct(best, 1);

    // O gráfico de probabilidade por personagem só mostra Favoritos/Estrelas
    // (a $wishlist de verdade do Mudae): com todos os personagens o gráfico
    // fica ilegível e quebra em contas com muitos personagens.
    const wishlistChars = withChances.filter(c => WISHLIST_CATEGORIES.includes(c.category));
    renderBarChart(wishlistChars);
    renderLineChart(withChances);
    renderSummaryTable(withChances);

    // Totais dos buffs do OP (esferas investidas + bônus do perk 10).
    const totalSpheresSpent = computeTotalSpheresSpent(chars, state.config);
    const p10Totals = computeP10BonusTotals(chars);
    const kpiSpheresSpentEl = document.getElementById("kpiSpheresSpent");
    const kpiP10SpheresEl = document.getElementById("kpiP10Spheres");
    const kpiP10OqChanceEl = document.getElementById("kpiP10OqChance");
    if (kpiSpheresSpentEl) kpiSpheresSpentEl.textContent = totalSpheresSpent.toLocaleString("pt-BR");
    if (kpiP10SpheresEl) kpiP10SpheresEl.textContent = p10Totals.spheres.toLocaleString("pt-BR");
    if (kpiP10OqChanceEl) kpiP10OqChanceEl.textContent = pct(Math.min(100, p10Totals.oqChancePct), 1);

    // Comparativo entre perfis: só recalcula se o usuário já pediu pra ver
    // (evita ler todos os perfis do banco toda vez que a aba é aberta).
    if (profileCompareVisible) renderProfileCompare();
}

/* ---------- Totais de buffs do OP (esferas gastas + bônus do perk 10) ----------
   "Esferas gastas" soma o custo (em esferas) de todos os níveis de perk OP já
   comprados em cada personagem, mais os níveis da $shop do perfil — usando as
   mesmas funções de custo (opLevelCost/shopLevelCost) já usadas na tela de
   edição de buffs, então o total bate com o que a UI de compra mostra.
   O bônus do perk 10 ("O primeiro $oh do dia gera +20 esferas e tem +1% de
   chance de dar 1 $oq") é por personagem: cada personagem com o perk no nível
   máximo soma +20 esferas e +1% de chance ao potencial diário do perfil. */
function computeTotalSpheresSpent(chars, config) {
    let total = 0;

    (chars || []).forEach(c => {
        const levels = normalizeOpLevels(c.opLevels);
        BUFF_DEFS.forEach((buff, i) => {
            const maxLevel = i < 5 ? 6 : 1;
            const lvl = Math.min(Math.max(Number(levels[buff.id]) || 0, 0), maxLevel);
            for (let l = 1; l <= lvl; l++) total += opLevelCost(i, l);
        });
    });

    const shopLevelsCfg = (config && config.shopLevels) || {};
    SHOP_DEFS.forEach(def => {
        const lvl = Math.min(Math.max(Number(shopLevelsCfg[def.id]) || 0, 0), 10);
        for (let l = 1; l <= lvl; l++) total += shopLevelCost(l);
    });

    return total;
}

function computeP10BonusTotals(chars) {
    const countMaxed = (chars || []).filter(c => {
        const levels = normalizeOpLevels(c.opLevels);
        return Number(levels.p10 || 0) >= 1;
    }).length;
    return {
        count: countMaxed,
        spheres: countMaxed * 20,
        oqChancePct: countMaxed * 1
    };
}

/* ---------- Comparativo entre perfis (opcional) ----------
   Não mexe nos KPIs/gráficos acima, que continuam mostrando só o perfil
   ativo. Isso aqui é uma seção à parte, exibida sob demanda, que lê os
   personagens e a configuração de CADA perfil (via
   Database.getAllProfilesData) e usa as MESMAS funções de cálculo já
   existentes em formulas.js pra cada um — então o resultado é sempre
   consistente com o que aquele perfil mostraria se estivesse ativo. */
const btnToggleProfileCompare = document.getElementById("btnToggleProfileCompare");
const profileCompareWrap = document.getElementById("profileCompareWrap");
const profileCompareBody = document.getElementById("profileCompareBody");
const profileCompareTable = profileCompareWrap ? profileCompareWrap.querySelector(".summary-table") : null;
let profileCompareVisible = false;

// Ordenação do comparativo entre perfis: cada botão de coluna ordena a lista
// já carregada (sem precisar buscar tudo de novo no banco). Cada coluna tem
// sua ordem "natural": Perfil em ordem alfabética, as demais do maior pro menor.
const PROFILE_COMPARE_SORTERS = {
    name: (a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
    count: (a, b) => b.count - a.count,
    totalKeys: (a, b) => b.totalKeys - a.totalKeys,
    totalKakera: (a, b) => b.totalKakera - a.totalKakera,
    best: (a, b) => b.best - a.best
};
let profileCompareSortKey = "name";
let profileCompareRowsCache = [];
let profileCompareActiveId = null;

if (btnToggleProfileCompare) {
    btnToggleProfileCompare.addEventListener("click", async () => {
        profileCompareVisible = !profileCompareVisible;
        if (profileCompareWrap) profileCompareWrap.hidden = !profileCompareVisible;
        btnToggleProfileCompare.classList.toggle("is-active", profileCompareVisible);
        btnToggleProfileCompare.textContent = profileCompareVisible
            ? "👥 OCULTAR TODOS OS PERFIS"
            : "👥 VER TODOS OS PERFIS";
        if (profileCompareVisible) await renderProfileCompare();
    });
}

async function renderProfileCompare() {
    if (!profileCompareBody) return;
    profileCompareBody.innerHTML = `<tr><td colspan="5">Carregando...</td></tr>`;
    try {
        const [allProfilesData, activeId] = await Promise.all([
            Database.getAllProfilesData(),
            Database.getActiveProfileId()
        ]);

        const rows = allProfilesData.map(profile => {
            const cfg = profile.config || {};
            const profChars = profile.characters || [];
            const totalKakera = profChars.reduce((sum, c) => sum + (Number(c.kakera) || 0), 0);
            const totalKeys = profChars.reduce((sum, c) => sum + Math.max(0, Number(c.keys) || 0), 0);
            let best = 0;
            profChars.forEach(c => {
                const ratio = (Number(buffsCalcChance(cfg, c, 7, profChars)) || 0) / 100;
                if (ratio > best) best = ratio;
            });
            return {
                id: profile.id,
                name: profile.name,
                count: profChars.length,
                totalKeys,
                totalKakera,
                best
            };
        });

        profileCompareRowsCache = rows;
        profileCompareActiveId = activeId;
        applyProfileCompareSort();
    } catch (err) {
        console.error("Erro ao montar o comparativo de perfis:", err);
        profileCompareBody.innerHTML = `<tr><td colspan="5">Erro ao carregar o comparativo de perfis.</td></tr>`;
    }
}

// Reordena a lista já carregada (cache) de acordo com a coluna selecionada
// e redesenha a tabela, sem precisar buscar os dados de novo.
function applyProfileCompareSort() {
    if (!profileCompareBody) return;

    const sorter = PROFILE_COMPARE_SORTERS[profileCompareSortKey];
    const rows = sorter ? [...profileCompareRowsCache].sort(sorter) : profileCompareRowsCache;

    if (rows.length === 0) {
        profileCompareBody.innerHTML = `<tr><td colspan="5">Nenhum perfil encontrado.</td></tr>`;
    } else {
        profileCompareBody.innerHTML = rows.map(r => `
      <tr class="${r.id === profileCompareActiveId ? "profile-row-active" : ""}">
        <td>${escapeXml(r.name)}${r.id === profileCompareActiveId ? ' <span class="profile-active-tag">ATUAL</span>' : ""}</td>
        <td>${r.count}</td>
        <td>${r.totalKeys.toLocaleString("pt-BR")}</td>
        <td class="kakera-val">◈ ${r.totalKakera.toLocaleString("pt-BR")}</td>
        <td class="chance-val">${pct(r.best, 1)}</td>
      </tr>
    `).join("");
    }

    if (profileCompareTable) {
        profileCompareTable.querySelectorAll(".th-sort-btn").forEach(btn => {
            btn.classList.toggle("is-active", btn.dataset.sortKey === profileCompareSortKey);
        });
    }
}

if (profileCompareTable) {
    profileCompareTable.querySelectorAll(".th-sort-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            profileCompareSortKey = btn.dataset.sortKey;
            applyProfileCompareSort();
        });
    });
}

/* ---------- Gráfico de barras (SVG) ---------- */
function renderBarChart(chars) {
    const w = 900, h = 340;
    const padL = 50, padR = 20, padT = 20, padB = 50;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    if (chars.length === 0) {
        document.getElementById("barChart").innerHTML = "";
        return;
    }

    const maxVal = Math.max(0.6, ...chars.map(c => c.c15)) * 1.05;
    const niceMax = Math.ceil(maxVal * 20) / 20;

    const groupW = chartW / chars.length;
    const barW = Math.min(16, groupW / 5);

    let gridLines = "";
    let gridLabels = "";
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
        const val = (niceMax / steps) * i;
        const y = padT + chartH - (val / niceMax) * chartH;
        gridLines += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="rgba(148,163,184,0.12)" stroke-dasharray="3,4" />`;
        gridLabels += `<text x="${padL - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#7c85a0" font-family="JetBrains Mono, monospace">${Math.round(val * 100)}%</text>`;
    }

    let bars = "";
    let labels = "";
    const colors = { c1: "#22d3ee", c7: "#a855f7", c15: "#ec2f9c" };

    chars.forEach((c, i) => {
        const groupX = padL + i * groupW + groupW / 2;
        ["c1", "c7", "c15"].forEach((key, j) => {
            const val = c[key];
            const barH = (val / niceMax) * chartH;
            const x = groupX - (barW * 1.5) + j * barW;
            const y = padT + chartH - barH;
            bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW - 3}" height="${Math.max(barH, 1).toFixed(1)}" rx="3" fill="${colors[key]}" />`;
        });
        labels += `<text x="${groupX}" y="${h - padB + 20}" text-anchor="middle" font-size="11" fill="#7c85a0" font-family="JetBrains Mono, monospace">${escapeXml(c.name)}</text>`;
    });

    const svg = `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${gridLabels}
    ${bars}
    ${labels}
    <line x1="${padL}" y1="${padT + chartH}" x2="${w - padR}" y2="${padT + chartH}" stroke="rgba(148,163,184,0.25)" />
  </svg>`;
    document.getElementById("barChart").innerHTML = svg;
}

/* ---------- Gráfico cumulativo (SVG) ---------- */
const LINE_COLORS = ["#22d3ee", "#ec2f9c", "#a855f7", "#f5c518", "#34d399", "#f97316"];

function renderLineChart(chars) {
    const top5 = [...chars].sort((a, b) => b.c15 - a.c15).slice(0, 5);

    const w = 900, h = 300;
    const padL = 50, padR = 20, padT = 20, padB = 30;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    const days = 30;

    let gridLines = "", gridLabels = "";
    [0, 25, 50, 75, 100].forEach(pctVal => {
        const y = padT + chartH - (pctVal / 100) * chartH;
        gridLines += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="rgba(148,163,184,0.12)" stroke-dasharray="3,4" />`;
        gridLabels += `<text x="${padL - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#7c85a0" font-family="JetBrains Mono, monospace">${pctVal}%</text>`;
    });

    let xLabels = "";
    for (let d = 1; d <= days; d += 5) {
        const x = padL + ((d - 1) / (days - 1)) * chartW;
        xLabels += `<text x="${x}" y="${h - padB + 20}" text-anchor="middle" font-size="11" fill="#7c85a0" font-family="JetBrains Mono, monospace">D${d}</text>`;
    }

    let lines = "";
    top5.forEach((c, idx) => {
        const color = LINE_COLORS[idx % LINE_COLORS.length];
        let points = [];
        for (let d = 1; d <= days; d++) {
            const val = chanceForCharacter(c, d);
            const x = padL + ((d - 1) / (days - 1)) * chartW;
            const y = padT + chartH - Math.min(val, 1) * chartH;
            points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        lines += `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" />`;
    });

    const svg = `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${gridLabels}
    ${lines}
    ${xLabels}
    <line x1="${padL}" y1="${padT + chartH}" x2="${w - padR}" y2="${padT + chartH}" stroke="rgba(148,163,184,0.25)" />
  </svg>`;
    document.getElementById("lineChart").innerHTML = svg;

    const legend = document.getElementById("lineLegend");
    legend.innerHTML = top5.map((c, idx) =>
        `<span><i class="dotc" style="background:${LINE_COLORS[idx % LINE_COLORS.length]}"></i>${escapeXml(c.name)}</span>`
    ).join("");
}

function escapeXml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ---------- Tabela resumo por camada ---------- */
function renderSummaryTable(chars) {
    const tbody = document.getElementById("summaryBody");
    tbody.innerHTML = "";

    Object.keys(CAT_META).forEach(catKey => {
        const meta = CAT_META[catKey];
        const items = chars.filter(c => c.category === catKey);
        if (items.length === 0) return;

        const avgChance = items.reduce((s, c) => s + c.c7, 0) / items.length;
        const avgKakera = Math.round(items.reduce((s, c) => s + c.kakera, 0) / items.length);
        const totalKakera = items.reduce((s, c) => s + c.kakera, 0);

        const row = document.createElement("tr");
        row.innerHTML = `
      <td><span class="cat-label ${catKey}">${meta.icon} ${meta.label.charAt(0)}${meta.label.slice(1).toLowerCase()}</span></td>
      <td>${items.length}</td>
      <td class="chance-val" style="color:${meta.color}">${pct(avgChance, 1)}</td>
      <td class="kakera-val">◈ ${avgKakera.toLocaleString("pt-BR")}</td>
      <td class="kakera-val">◈ ${totalKakera.toLocaleString("pt-BR")}</td>
    `;
        tbody.appendChild(row);
    });
}

/* ============================================================
   MODAL DE AJUDA
   ============================================================ */
document.getElementById("helpBtn").addEventListener("click", () => {
    showSystemAlert(
        "Configure seus dados na aba Configurações — tudo é salvo automaticamente.\n\n" +
        "Adicione personagens na aba Personagens (Favoritos, Estrelas ou Comuns) e envie uma foto ao criá-los.\n\n" +
        "Os pools WA/HA/WG/HG, slash, tutorial, boostwish e personalrare afetam as estimativas. O campo de harem limita quantos personagens podem ser cadastrados (0 = sem limite).\n\n" +
        "Veja gráficos e estatísticas na aba Análise.\n\n" +
        "Use o botão de backup na aba Configurações para baixar/restaurar uma cópia em JSON.",
        {
            title: "Ajuda · Mudae Tracker",
            type: "info",
            confirmText: "FECHAR"
        }
    );
});

/* ============================================================
   INICIALIZAÇÃO — carrega tudo do IndexedDB antes de renderizar
   ============================================================ */
function migrateLegacyConfig() {
    if (!state.config.poolWA) state.config.poolWA = Number(state.config.totalWaHa) || 7000;
    if (!state.config.poolHA) state.config.poolHA = Number(state.config.totalWaHa) || 7000;
    if (!state.config.poolWG) state.config.poolWG = Number(state.config.totalWgHg) || 5000;
    if (!state.config.poolHG) state.config.poolHG = Number(state.config.totalWgHg) || 5000;
    state.config.gameplayHour = Math.max(0, Number(state.config.gameplayHour) || 0);
    state.config.rollsPerHour = Math.max(0, Number(state.config.rollsPerHour) || 0);
    state.config.personalRare = Math.max(1, Number(state.config.personalRare) || 1);
    state.config.boostWishRolls = Math.max(0, Number(state.config.boostWishRolls) || 0);
    state.config.useSlashCommands = Boolean(state.config.useSlashCommands);
    if (typeof state.config.gridDetailsEnabled !== "boolean") state.config.gridDetailsEnabled = true;
    state.characters = state.characters.map(c => ({
        ...c,
        claimed: c.claimed !== false,
        opLevels: normalizeOpLevels(c.opLevels),
        genders: normalizeCharacterGenders(c.genders)
    }));
}




async function initApp() {
    try {
        await Database.init();
        await loadActiveProfileData();
    } catch (err) {
        console.error("Erro ao iniciar o banco de dados local:", err);
        state.characters = [];
        setBackupStatus("Não foi possível acessar o armazenamento local deste navegador.", true);
    }

    await refreshProfileSelector();
    loadConfigForm();
    renderConfigStats();
    renderCharacters();
    showView("config");
}

initApp();
