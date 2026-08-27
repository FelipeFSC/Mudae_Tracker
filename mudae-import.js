/* ============================================================
   MUDAE-IMPORT.JS — módulo único de importação do Mudae
   ------------------------------------------------------------
   Este arquivo concentra TODA a funcionalidade de importação:

     1) Parser do Harém;
     2) Parser da Wishlist (inclusive Markdown do Discord);
     3) Detecção/validação da origem do texto;
     4) Parser do $mmzs para buffs OP;
     5) Prévia e sincronização combinada Harém -> Wishlist.

   MAPA RÁPIDO DOS PRINCIPAIS MÉTODOS
   ------------------------------------------------------------
   findFirstSeriesTitle()       Localiza o primeiro bloco de série do Harém.
   parseWishlistExport()        Faz o parse do formato simples/legado da Wishlist.
   parseOPBuffsExport()         Extrai personagem + esferas do comando $mmzs.
   parseMudaeExport()           Parser-base usado para Harém e Wishlist simples.
   normalizeMarkdownishText()   Normaliza Markdown copiado do Discord.
   parseWishlistFlexible()      Lê Wishlist rica, com ou sem cabeçalho.
   detectType()                 Decide se o texto é Harém, Wishlist ou desconhecido.
   parse()                      Ponto único de entrada do parser público.
   initializeMudaeImportFlow()  Inicializa a interface combinada de importação.

   A separação em seções abaixo é apenas organizacional: o navegador
   carrega somente este arquivo para tudo relacionado à importação.
   ============================================================ */

/* ============================================================
   SEÇÃO 1 — PARSERS-BASE (HARÉM, WISHLIST SIMPLES E $mmzs)
   ============================================================ */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        // Node / CommonJS (usado nos testes)
        module.exports = factory();
    } else {
        // Browser: expõe o objeto global MudaeImport
        root.MudaeImport = factory();
    }
})(typeof self !== "undefined" ? self : this, function () {

    const GENDER_OPTIONS = ["wa", "ha", "wg", "hg"];

    // Acha o primeiro título de série no texto e devolve tudo a partir dali
    // (ou seja: ignora cabeçalho, "Total value: ...:kakera:", etc.)
    // Um título de série tem o formato "Nome da Série - N/N" e vem
    // seguido, em algum ponto depois, por um "#posição -".
    /**
     * Localiza o primeiro título de série reconhecível no Harém.
     * Descarta cabeçalhos anteriores sem alterar os blocos de personagens.
     */
    function findFirstSeriesTitle(text) {
        const titleRegex = /([^\n#]+?)\s-\s(\d[\d.,]*)\s*\/\s*(\d[\d.,]*)\s*(?=#)/;
        const match = titleRegex.exec(text);
        return match ? text.slice(match.index) : text;
    }

    // Regex principal: reconhece, em qualquer ordem, títulos de série ou
    // entradas de personagem, andando pelo texto de ponta a ponta.
    //
    // Grupo 1: nome da série (alternativa "título de série")
    // Grupo 2: posição "#pos" (alternativa "personagem")
    // Grupo 3: nome do personagem
    // Grupo 4: apelido (opcional, do "=> apelido")
    // Grupo 5: gêneros, crus, dentro do parênteses
    // Grupo 6: quantidade de chaves (opcional — o "(N)" antes do valor de ka,
    //          ex. o "1" de ":bronzekey: (1)"; não confundir com código de
    //          cor tipo "(#d9d7e1)", que não é capturado aqui)
    // Grupo 7: valor de kakera
    // Grupo 8: link da imagem
    const ENTRY_REGEX =
        /(?:([^\n#]+?)\s-\s\d[\d.,]*\s*\/\s*\d[\d.,]*\s*(?=#))|(?:#([\d.,]+)\s*-\s*(.+?)\s*(?:=>\s*(\S+)\s*)?·\s*\(([^)]*)\)(?:[^\d(\n]*\((\d+)\))?.*?\s([\d.,]+)\s*ka\s*-\s*(https?:\/\/\S+))/g;

    // Reconhece o formato compacto do comando $wishlist / $wl.
    // Nesse formato não há série nem gêneros. Todos os itens pertencem à
    // wishlist; a estrela (⭐) indica que o personagem é a starwish.
    /**
     * Faz o parse do formato simples/legado da Wishlist.
     * Retorna null quando o texto não apresenta sinal claro de Wishlist.
     */
    function parseWishlistExport(rawText) {
        const text = String(rawText || "");
        const isWishlist = /(?:'s\s+Wishlist|\$wl\b)/i.test(text);
        if (!isWishlist) return null;

        const results = [];
        const lines = text.split(/\r?\n/);

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!/^#[\d.,]+\s*-/.test(line)) continue;

            // Divide a entrada no link e no restante, preservando qualquer
            // informação opcional entre o nome e o valor de kakera.
            const imageMatch = line.match(/\s-\s(https?:\/\/\S+)\s*$/i);
            if (!imageMatch) continue;
            const photo = imageMatch[1];
            const beforePhoto = line.slice(0, imageMatch.index).trim();

            const kakeraMatch = beforePhoto.match(/·\s*([\d.,]+)\s*ka\s*$/i);
            if (!kakeraMatch) continue;
            const kakera = parseInt((kakeraMatch[1] || "0").replace(/[.,]/g, ""), 10) || 0;
            const beforeKakera = beforePhoto.slice(0, kakeraMatch.index).trim();

            const headMatch = beforeKakera.match(/^#([\d.,]+)\s*-\s*(.+)$/);
            if (!headMatch) continue;

            const position = (headMatch[1] || "").replace(/[.,]/g, "");
            let details = (headMatch[2] || "").trim();

            const isStarwish = /⭐/.test(details);
            details = details.replace(/⭐/g, " ");

            // Quantidade de chaves: aceita bronze/silver/gold/chaos etc.
            // O código de cor (#xxxxxx) é ignorado por não começar com dígito.
            let keys = 0;
            const keyMatch = details.match(/:(?:bronze|silver|gold|chaos)key:\s*[\u00a0\u202f\s]*\((\d+)\)/i)
                || details.match(/(?:^|·)\s*[^·]*?\((\d+)\)(?:\s*\(#[0-9a-f]{6}\))?/i);
            if (keyMatch) keys = parseInt(keyMatch[1], 10) || 0;

            // Remove dados que não fazem parte do nome.
            const ownerMatch = details.match(/=>\s*([^·]+?)(?=\s*·|$)/);
            const nickname = ownerMatch ? ownerMatch[1].trim() : null;
            details = details
                .replace(/=>\s*[^·]+?(?=\s*·|$)/, " ")
                .replace(/:(?:bronze|silver|gold|chaos)key:\s*[\u00a0\u202f\s]*\(\d+\)/gi, " ")
                .replace(/\(#[0-9a-f]{6}\)/gi, " ")
                .replace(/\s*·\s*/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            if (!details) continue;

            results.push({
                position,
                name: details,
                series: "Wishlist",
                nickname,
                genders: [],
                keys,
                kakera,
                photo,
                importType: "wishlist",
                isStarwish,
                suggestedCategory: isStarwish ? "estrelas" : "favoritos"
            });
        }

        return results;
    }

    /* ============================================================
       PARSER DO $mmzs — "esferas investidas" (buffs OP)
       ------------------------------------------------------------
       Formato colado (tudo numa linha só ou quebrado, tanto faz):

         Nome do usuário
         Total invested: 25.200 [emoji opcional]
         Personagem 1 2.000 sp
         Personagem 2 1.600 sp
         ...

       Não tem série, gêneros, chave nem link de imagem — só nome e
       quantidade de esferas ("sp") investidas nesse personagem. Por
       isso esse parser devolve só { name, invested }; quem usa esse
       resultado (script.js) decide o que fazer com um personagem que
       não exista ainda no sistema (aqui a gente só extrai o texto).
       ============================================================ */
    /**
     * Extrai o investimento de esferas do comando $mmzs.
     * Retorna objetos no formato { name, invested } e nunca cria personagens.
     */
    function parseOPBuffsExport(rawText) {
        const text = String(rawText || "");

        // Pula o cabeçalho ("nome do usuário", "Total invested: N [emoji]")
        // — a leitura de fato começa depois disso.
        const headerRegex = /total\s*invested\s*:?\s*[\d.,]+\s*(?::[a-z0-9_]+:)?/i;
        const headerMatch = headerRegex.exec(text);
        const body = headerMatch ? text.slice(headerMatch.index + headerMatch[0].length) : text;

        const results = [];
        // Cada entrada é "Nome do Personagem N.NNN sp": o nome é tudo que vem
        // antes do primeiro "número + sp" que aparecer, sem depender de \n.
        const entryRegex = /([\s\S]+?)\s+([\d][\d.,]*)\s*sp(?=\s|$)/g;
        let match;
        while ((match = entryRegex.exec(body)) !== null) {
            const name = (match[1] || "").replace(/\s+/g, " ").trim();
            const invested = parseInt((match[2] || "0").replace(/[.,]/g, ""), 10) || 0;
            if (!name) continue;
            results.push({ name, invested });
        }

        return results;
    }

    // Faz o parse do texto colado e devolve uma lista de personagens:
    // { position, name, series, nickname, genders, keys, kakera, photo }
    /**
     * Parser-base do módulo. Tenta primeiro a Wishlist simples e,
     * caso não seja Wishlist, percorre os blocos de série do Harém.
     */
    function parseMudaeExport(rawText) {
        const wishlistResults = parseWishlistExport(rawText);
        if (wishlistResults !== null) return wishlistResults;
        const text = findFirstSeriesTitle(rawText || "");

        let currentSeries = null;
        const results = [];
        let match;

        ENTRY_REGEX.lastIndex = 0;
        while ((match = ENTRY_REGEX.exec(text)) !== null) {
            const isSeriesTitle = match[1] !== undefined;

            if (isSeriesTitle) {
                const seriesName = match[1].trim().split("\n").pop().trim();
                if (seriesName) currentSeries = seriesName;
                continue;
            }

            const name = (match[3] || "")
                .replace(/\s*💞\s*$/, "")
                .trim();
            if (!name || currentSeries === null) continue;

            const genders = (match[5] || "")
                .split(",")
                .map(g => g.trim().replace("$", "").toLowerCase())
                .filter(g => GENDER_OPTIONS.includes(g));

            results.push({
                position: (match[2] || "").replace(/\./g, ""),
                name,
                series: currentSeries,
                nickname: match[4] || null,
                genders,
                keys: parseInt(match[6], 10) || 0,
                kakera: parseInt((match[7] || "0").replace(/[.,]/g, ""), 10) || 0,
                photo: match[8] || null
            });
        }

        return results;
    }

    return { parse: parseMudaeExport, parseOPBuffs: parseOPBuffsExport };
});

/* ============================================================
   SEÇÃO 2 — WISHLIST FLEXÍVEL E VALIDAÇÃO DE ORIGEM (V28)
   ------------------------------------------------------------
   Complementa o parser-base com suporte a Markdown do Discord e
   classificação do texto antes da importação. Esta instalação também
   funciona em CommonJS para facilitar os testes automatizados.
   ============================================================ */
(function installV28ParserEnhancements(root) {
    const targetImport = root && root.MudaeImport
        ? root.MudaeImport
        : (typeof module === "object" && module.exports ? module.exports : null);

    if (!targetImport || typeof targetImport.parse !== "function") {
        console.warn("[V28] Parser base do Mudae não encontrado.");
        return;
    }

    const baseParse = targetImport.parse.bind(targetImport);
    const GENDERS = new Set(["wa", "wg", "ha", "hg"]);

    /** Normaliza escapes, links e ênfase Markdown preservando dados úteis. */
    function normalizeMarkdownishText(rawText) {
        let text = String(rawText || "")
            .replace(/\\([_*#[\]()~])/g, "$1")
            .replace(/\u00a0|\u202f/g, " ");

        // Converte links Markdown em seu rótulo. Isso preserva :bronzekey:,
        // ⭐ e URLs de imagem que aparecem como rótulo clicável.
        text = text.replace(/\[([^\]]+)\]\(\s*(https?:\/\/[^\s)]+)(?:\s+"[\s\S]*?")?\s*\)/g, "$1");

        // Remove ênfase Markdown sem tocar em underscores internos de nomes.
        text = text.replace(/\*+/g, "");

        // Alguns copiadores deixam colchetes residuais em emojis/labels.
        text = text.replace(/\[(:?(?:bronze|silver|gold|chaos)key:|⭐)\]/gi, "$1");

        return text.replace(/\s+/g, " ").trim();
    }

    /** Converte números formatados com ponto/vírgula em inteiro. */
    function parseNumber(value) {
        return parseInt(String(value || "0").replace(/[.,]/g, ""), 10) || 0;
    }

    /** Remove pontuação residual que pode ficar no final de URLs copiadas. */
    function cleanUrl(value) {
        return String(value || "")
            .replace(/[\]\)>"']+$/g, "")
            .trim();
    }

    /**
     * Parser tolerante da Wishlist. Reconhece entradas por #posição,
     * aceita cabeçalho opcional e extrai starwish, chaves, kakera e imagem.
     */
    function parseWishlistFlexible(rawText) {
        const text = normalizeMarkdownishText(rawText);
        if (!text) return [];

        const rankRegex = /#([\d.,]+)\s*-\s*/g;
        const starts = [];
        let rankMatch;
        while ((rankMatch = rankRegex.exec(text)) !== null) {
            starts.push({ index: rankMatch.index, position: rankMatch[1], bodyStart: rankRegex.lastIndex });
        }
        if (!starts.length) return [];

        const results = [];
        for (let i = 0; i < starts.length; i++) {
            const start = starts[i];
            const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
            const chunk = text.slice(start.bodyStart, end).trim();

            const kakeraMatch = /([\d.,]+)\s*ka\s*-\s*(https?:\/\/[^\s]+)/i.exec(chunk);
            if (!kakeraMatch) continue;

            const detailPart = chunk.slice(0, kakeraMatch.index).trim();
            const kakera = parseNumber(kakeraMatch[1]);
            const photo = cleanUrl(kakeraMatch[2]);
            if (!photo) continue;

            const isStarwish = /⭐/.test(detailPart);

            let keys = 0;
            const keyMatch = detailPart.match(/:(?:bronze|silver|gold|chaos)key:\s*\((\d+)\)/i)
                || detailPart.match(/(?:^|·)\s*[^·]*?\((\d+)\)\s*(?:\(#[0-9a-f]{6}\))?/i);
            if (keyMatch) keys = parseInt(keyMatch[1], 10) || 0;

            let genders = [];
            const genderMatch = detailPart.match(/\(\s*(\$?(?:wa|wg|ha|hg)(?:\s*,\s*\$?(?:wa|wg|ha|hg))*)\s*\)/i);
            if (genderMatch) {
                genders = genderMatch[1]
                    .split(",")
                    .map(value => value.trim().replace(/^\$/, "").toLowerCase())
                    .filter(value => GENDERS.has(value));
            }

            const ownerMatch = detailPart.match(/=>\s*(.+?)(?=\s*(?:⭐|·|:(?:bronze|silver|gold|chaos)key:|\(\s*\$?(?:wa|wg|ha|hg)|$))/i);
            const nickname = ownerMatch ? ownerMatch[1].trim() : null;

            const name = detailPart
                .split(/\s*(?:=>|·|⭐|:(?:bronze|silver|gold|chaos)key:|\(\s*\$?(?:wa|wg|ha|hg))/i)[0]
                .replace(/\s+/g, " ")
                .trim();

            if (!name) continue;

            results.push({
                position: String(start.position || "").replace(/[.,]/g, ""),
                name,
                series: "Wishlist",
                nickname,
                genders,
                keys,
                kakera,
                photo,
                importType: "wishlist",
                isStarwish,
                suggestedCategory: isStarwish ? "estrelas" : "favoritos"
            });
        }

        return results;
    }

    /** Informa se o texto contém cabeçalho/sinais explícitos de Wishlist. */
    function hasWishlistHeader(text) {
        return /(?:\bWishlist\b|\$wl\b|\$sw\b)/i.test(text);
    }

    /** Detecta sinais estruturais típicos de exportação de Harém. */
    function hasHaremSignals(text) {
        const hasGenderGroup = /\(\s*\$?(?:wa|wg|ha|hg)(?:\s*,\s*\$?(?:wa|wg|ha|hg))*\s*\)/i.test(text);
        const hasSeriesCounter = /(?:^|\s)(?![^#]{0,80}\bWishlist\b)[^#]{1,120}?\s-\s\d[\d.,]*\s*\/\s*\d[\d.,]*\s*(?=#)/i.test(text);
        const hasTotalValue = /\bTotal\s+value\s*:/i.test(text);
        return hasTotalValue || (hasGenderGroup && hasSeriesCounter);
    }

    /** Classifica a origem do texto como harem, wishlist, empty ou unknown. */
    function detectType(rawText) {
        const normalized = normalizeMarkdownishText(rawText);
        if (!normalized) return "empty";

        const wishlistHeader = hasWishlistHeader(normalized);
        const haremSignals = hasHaremSignals(normalized);
        const flexibleWishlist = parseWishlistFlexible(normalized);

        let baseItems = [];
        try {
            baseItems = baseParse(rawText) || [];
        } catch (_) {
            baseItems = [];
        }

        if (wishlistHeader && flexibleWishlist.length) return "wishlist";
        if (baseItems.some(item => item && item.importType === "wishlist")) return "wishlist";
        if (haremSignals && baseItems.length) return "harem";

        // Cabeçalho é opcional. Sem ele, uma sequência válida de entradas
        // #posição - Nome ... N ka - URL, sem estrutura de séries de Harém,
        // continua sendo tratada como Wishlist.
        if (flexibleWishlist.length && !haremSignals) return "wishlist";
        if (baseItems.length) return "harem";
        return "unknown";
    }

    /**
     * Ponto único de entrada público: escolhe o parser adequado conforme
     * o tipo detectado e mantém compatibilidade com o parser-base.
     */
    function parse(rawText) {
        const type = detectType(rawText);
        if (type === "wishlist") {
            const flexible = parseWishlistFlexible(rawText);
            if (flexible.length) return flexible;
        }
        return baseParse(rawText);
    }

    targetImport.parse = parse;
    targetImport.detectType = detectType;
    targetImport.parseWishlistFlexible = parseWishlistFlexible;
    targetImport.normalizeMarkdownishText = normalizeMarkdownishText;

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));


/* ============================================================
   SEÇÃO 3 — FLUXO COMBINADO HARÉM + WISHLIST
   ------------------------------------------------------------
   Esta parte depende das funções e do estado definidos em script.js.
   Como mudae-import.js é carregado antes de script.js para disponibilizar
   o parser, a inicialização da interface é adiada até DOMContentLoaded.

   Regra de negócio: Harém é sincronizado primeiro; Wishlist depois.
   ============================================================ */
function initializeMudaeImportFlow() {
    const wishlistText = document.getElementById("importWishlistText");
    const parseBtn = document.getElementById("importCombinedParseBtn");
    const confirmBtn = document.getElementById("importCombinedConfirmBtn");

    if (!wishlistText || !parseBtn || !confirmBtn || !importText || !importPreview || !importActions || !importCount) {
        console.warn("[V28] Fluxo combinado de importação não pôde ser inicializado.");
        return;
    }

    let parsedHaremItems = [];
    let parsedWishlistItems = [];

    const style = document.createElement("style");
    style.textContent = `
        .import-modal-combined {
            width: min(720px, calc(100vw - 32px));
            max-height: min(92vh, 900px);
            overflow-y: auto;
        }

        .import-source-block {
            margin: 14px 0;
            padding: 14px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.015);
        }

        .import-source-head {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }

        .import-source-head > div {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .import-source-head strong {
            color: var(--text);
            font-size: 12px;
            letter-spacing: .6px;
        }

        .import-source-head span:not(.import-source-step) {
            color: var(--muted);
            font-size: 10.5px;
            font-family: var(--mono);
        }

        .import-source-step {
            width: 26px;
            height: 26px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 26px;
            border-radius: 50%;
            border: 1px solid rgba(34, 211, 238, .45);
            color: var(--cyan);
            background: rgba(34, 211, 238, .08);
            font-size: 11px;
            font-weight: 800;
        }

        .import-modal-combined textarea {
            min-height: 105px;
        }

        .import-section-title {
            margin: 10px 2px 2px;
            color: var(--muted);
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .7px;
        }

        .import-section-title:first-child {
            margin-top: 0;
        }

        @media (max-width: 640px) {
            .import-modal-combined {
                width: calc(100vw - 20px);
                max-height: 94vh;
            }

            .import-source-block {
                padding: 10px;
            }
        }
    `;
    document.head.appendChild(style);

    /** Limpa a segunda caixa e os caches da prévia ao reabrir o modal. */
    function resetCombinedImport() {
        wishlistText.value = "";
        parsedHaremItems = [];
        parsedWishlistItems = [];
    }

    // O listener principal (script.js) abre/reseta o modal primeiro.
    // Este listener completa o reset da segunda caixa.
    if (btnOpenImport) {
        btnOpenImport.addEventListener("click", () => {
            resetCombinedImport();
            requestAnimationFrame(() => importText.focus());
        });
    }

    /**
     * Interrompe a análise quando Harém/Wishlist foi colado na caixa errada,
     * exibindo a mensagem no próprio modal e focando o campo incorreto.
     */
    function rejectWrongField(expected, detected) {
        const isHaremField = expected === "harem";
        const expectedLabel = isHaremField ? "HARÉM" : "WISHLIST";
        const detectedLabel = detected === "wishlist" ? "WISHLIST" : "HARÉM";
        const targetLabel = isHaremField ? "segundo campo (Wishlist)" : "primeiro campo (Harém)";
        const message = `O texto colado no campo ${expectedLabel} foi reconhecido como ${detectedLabel}. Cole esse conteúdo no ${targetLabel}.`;

        parsedHaremItems = [];
        parsedWishlistItems = [];
        renderCombinedPreview();
        setImportStatus(message, true);
        (isHaremField ? importText : wishlistText).focus();
        return false;
    }

    /** Valida a origem do texto antes de executar qualquer sincronização. */
    function validateFieldType(rawText, expected) {
        if (!rawText) return true;
        const detected = typeof MudaeImport.detectType === "function"
            ? MudaeImport.detectType(rawText)
            : "unknown";

        if (expected === "harem" && detected === "wishlist") return rejectWrongField("harem", detected);
        if (expected === "wishlist" && detected === "harem") return rejectWrongField("wishlist", detected);
        return true;
    }

    /**
     * Analisa as duas caixas, aplica as duas camadas de validação de origem
     * e prepara as listas de Harém e Wishlist para a prévia/importação.
     */
    function parseSources() {
        const haremRaw = importText.value.trim();
        const wishlistRaw = wishlistText.value.trim();

        if (!haremRaw && !wishlistRaw) {
            parsedHaremItems = [];
            parsedWishlistItems = [];
            setImportStatus("Cole o Harém e/ou a Wishlist antes de analisar.", true);
            renderCombinedPreview();
            return false;
        }

        // Valida o TIPO antes do parse. Assim uma Wishlist nunca pode ser
        // confirmada pelo campo Harém, nem um Harém pelo campo Wishlist.
        if (!validateFieldType(haremRaw, "harem")) return false;
        if (!validateFieldType(wishlistRaw, "wishlist")) return false;

        const parsedHaremRaw = haremRaw ? parseMudaeImportText(haremRaw) : [];
        const parsedWishlistRaw = wishlistRaw ? parseMudaeImportText(wishlistRaw) : [];

        // Segunda barreira: mesmo que o detector esteja inconclusivo, o tipo
        // efetivamente retornado pelo parser também precisa casar com a caixa.
        if (haremRaw && parsedHaremRaw.some(item => item.importType === "wishlist")) {
            return rejectWrongField("harem", "wishlist");
        }
        if (wishlistRaw && parsedWishlistRaw.some(item => item.importType !== "wishlist")) {
            return rejectWrongField("wishlist", "harem");
        }

        parsedHaremItems = parsedHaremRaw.filter(item => item.importType !== "wishlist");
        parsedWishlistItems = parsedWishlistRaw.filter(item => item.importType === "wishlist");

        if (haremRaw && parsedHaremItems.length === 0) {
            setImportStatus("Não foi possível reconhecer personagens no Harém informado.", true);
            renderCombinedPreview();
            return false;
        }

        if (wishlistRaw && parsedWishlistItems.length === 0) {
            setImportStatus("Não foi possível reconhecer personagens na Wishlist informada.", true);
            renderCombinedPreview();
            return false;
        }

        renderCombinedPreview();
        setCombinedAnalysisStatus();
        return parsedHaremItems.length > 0 || parsedWishlistItems.length > 0;
    }

    /** Monta o HTML de uma linha da prévia de importação. */
    function previewItem(item, source) {
        const existing = findExistingCharacterByName(item.name);
        const categoryTag = source === "wishlist"
            ? `<span class="tag ${item.isStarwish ? "wishlist-star-tag" : "wishlist-fav-tag"}">${item.isStarwish ? "★ Estrela" : "♥ Favorito"}</span>`
            : `<span class="tag wishlist-update-tag">HARÉM</span>`;

        return `
            <div class="import-item">
                ${item.photo ? `<img src="${item.photo}" alt="${escapeXml(item.name)}" />` : `<img alt="" />`}
                <div class="import-item-info">
                    <div class="import-item-name">${escapeXml(item.name)}</div>
                    <div class="import-item-series">${escapeXml(item.series || "—")}</div>
                </div>
                <div class="import-item-meta">
                    <span class="tag kakera">${formatKakera(item.kakera)}</span>
                    <span class="tag keys" title="Chaves">🔑 ${Number(item.keys) || 0}</span>
                    ${normalizeCharacterGenders(item.genders).length ? `<div class="gender-tags">${renderGenderChips(item.genders)}</div>` : ""}
                    ${categoryTag}
                    <span class="tag ${existing ? "wishlist-update-tag" : "wishlist-new-tag"}">${existing ? "↻ Atualizar" : "+ Novo"}</span>
                </div>
            </div>
        `;
    }

    /** Renderiza as seções Harém e Wishlist e calcula nomes distintos. */
    function renderCombinedPreview() {
        const totalEntries = parsedHaremItems.length + parsedWishlistItems.length;

        if (totalEntries === 0) {
            importPreview.innerHTML = `<div class="import-empty">Nenhum personagem reconhecido.</div>`;
            importActions.classList.remove("active");
            importCount.textContent = "0";
            return;
        }

        const sections = [];
        if (parsedHaremItems.length) {
            sections.push(
                `<div class="import-section-title">1 · HARÉM — ${parsedHaremItems.length} entrada(s)</div>` +
                parsedHaremItems.map(item => previewItem(item, "harem")).join("")
            );
        }
        if (parsedWishlistItems.length) {
            sections.push(
                `<div class="import-section-title">2 · WISHLIST — ${parsedWishlistItems.length} entrada(s)</div>` +
                parsedWishlistItems.map(item => previewItem(item, "wishlist")).join("")
            );
        }

        importPreview.innerHTML = sections.join("");

        const distinctNames = new Set(
            [...parsedHaremItems, ...parsedWishlistItems]
                .map(item => normalizeCharacterName(item.name))
                .filter(Boolean)
        );
        importCount.textContent = String(distinctNames.size);
        importActions.classList.add("active");
    }

    /** Resume no modal quantos registros serão atualizados, criados ou removidos. */
    function setCombinedAnalysisStatus() {
        const parts = [];

        if (parsedHaremItems.length) {
            const importedNames = new Set(parsedHaremItems.map(item => normalizeCharacterName(item.name)).filter(Boolean));
            const existingCount = parsedHaremItems.filter(item => findExistingCharacterByName(item.name)).length;
            const newCount = parsedHaremItems.length - existingCount;
            const removeCount = state.characters.filter(character =>
                character.claimed !== false &&
                !importedNames.has(normalizeCharacterName(character.name))
            ).length;

            parts.push(`Harém: ${existingCount} atualizar, ${newCount} adicionar, ${removeCount} reivindicado(s) ausente(s) remover`);
        }

        if (parsedWishlistItems.length) {
            const wishlistNames = new Set(parsedWishlistItems.map(item => normalizeCharacterName(item.name)).filter(Boolean));
            const haremNames = new Set(parsedHaremItems.map(item => normalizeCharacterName(item.name)).filter(Boolean));
            const hasFreshHarem = parsedHaremItems.length > 0;
            const existingCount = parsedWishlistItems.filter(item => findExistingCharacterByName(item.name)).length;
            const newCount = parsedWishlistItems.length - existingCount;
            let demoteCount = 0;
            let removeCount = 0;

            state.characters
                .filter(character => WISHLIST_CATEGORIES.includes(character.category))
                .forEach(character => {
                    const key = normalizeCharacterName(character.name);
                    if (!key || wishlistNames.has(key)) return;
                    const inHarem = hasFreshHarem ? haremNames.has(key) : character.claimed !== false;
                    if (inHarem) demoteCount++;
                    else removeCount++;
                });

            parts.push(`Wishlist: ${existingCount} atualizar/reclassificar, ${newCount} adicionar, ${demoteCount} mover para Comuns, ${removeCount} remover da coleção`);
        }

        setImportStatus(`✓ ${parts.join(" · ")}. A ordem será Harém → Wishlist.`);
    }

    /** Simula a quantidade final da coleção antes de gravar no IndexedDB. */
    function projectedFinalCount() {
        const projected = new Map();
        const haremProvided = parsedHaremItems.length > 0;
        const wishlistProvided = parsedWishlistItems.length > 0;
        const haremNames = new Set(parsedHaremItems.map(item => normalizeCharacterName(item.name)).filter(Boolean));
        const wishlistNames = new Set(parsedWishlistItems.map(item => normalizeCharacterName(item.name)).filter(Boolean));

        for (const character of state.characters) {
            const key = normalizeCharacterName(character.name);
            if (!key) continue;

            // Com Harém fresco, um reivindicado ausente é removido, EXCETO se
            // continuar na nova Wishlist: nesse caso ele permanece na coleção
            // como não reivindicado para preservar OP e demais dados locais.
            const absentFromFreshHarem = haremProvided && !haremNames.has(key);
            const protectedByFreshWishlist = wishlistProvided && wishlistNames.has(key);
            const willBeRemovedByHarem = absentFromFreshHarem &&
                character.claimed !== false &&
                !protectedByFreshWishlist;

            if (!willBeRemovedByHarem) projected.set(key, { ...character });
        }

        for (const item of parsedHaremItems) {
            const key = normalizeCharacterName(item.name);
            if (!key) continue;
            const previous = projected.get(key) || {};
            projected.set(key, { ...previous, name: item.name, claimed: true });
        }

        if (wishlistProvided) {
            // Wishlist é uma fotografia completa. Quem estava em Favoritos/
            // Estrelas e sumiu dela só permanece se ainda estiver no Harém.
            for (const [key, character] of [...projected.entries()]) {
                if (!WISHLIST_CATEGORIES.includes(character.category) || wishlistNames.has(key)) continue;
                const inHarem = haremProvided ? haremNames.has(key) : character.claimed !== false;
                if (!inHarem) projected.delete(key);
            }
        }

        for (const item of parsedWishlistItems) {
            const key = normalizeCharacterName(item.name);
            if (!key) continue;
            const previous = projected.get(key) || {};
            projected.set(key, { ...previous, name: item.name });
        }

        return projected.size;
    }

    /**
     * Sincroniza o Harém completo. Remove reivindicados ausentes, preserva
     * não reivindicados e mantém o mesmo registro quando a nova Wishlist
     * ainda contém um personagem que acabou de sair do Harém.
     */
    async function applyHarem(items, counters, incomingWishlistNames = new Set()) {
        if (!items.length) return;

        const importedNames = new Set(items.map(item => normalizeCharacterName(item.name)).filter(Boolean));
        const removableClaimed = state.characters.filter(character => {
            const key = normalizeCharacterName(character.name);
            return character.claimed !== false &&
                !importedNames.has(key) &&
                !incomingWishlistNames.has(key);
        });

        // Se o personagem saiu do Harém mas continua na nova Wishlist, ele não
        // pode ser apagado/recriado: isso destruiria OP e outros dados locais.
        // O Harém fresco apenas passa a marcá-lo como não reivindicado.
        const wishlistOnlyCharacters = state.characters.filter(character => {
            const key = normalizeCharacterName(character.name);
            return character.claimed !== false &&
                !importedNames.has(key) &&
                incomingWishlistNames.has(key);
        });

        for (const character of wishlistOnlyCharacters) {
            const updatedCharacter = { ...character, claimed: false };
            await Database.updateCharacter(updatedCharacter);
            const idx = state.characters.findIndex(current => String(current.id) === String(character.id));
            if (idx >= 0) state.characters[idx] = updatedCharacter;
            counters.haremPreservedWishlist++;
        }

        for (const character of removableClaimed) {
            await Database.deleteCharacter(character.id);
            counters.haremRemoved++;
        }

        if (removableClaimed.length) {
            const removedIds = new Set(removableClaimed.map(character => String(character.id)));
            state.characters = state.characters.filter(character => !removedIds.has(String(character.id)));
        }

        for (const item of items) {
            const existing = findExistingCharacterByName(item.name);

            if (existing) {
                const updatedCharacter = mergeImportedCharacter(existing, item, {
                    allowCategoryChange: false,
                    category: existing.category
                });
                await Database.updateCharacter(updatedCharacter);

                const idx = state.characters.findIndex(character => String(character.id) === String(existing.id));
                if (idx >= 0) state.characters[idx] = updatedCharacter;
                counters.haremUpdated++;
                continue;
            }

            const novoPersonagem = {
                name: item.name,
                series: item.series || "—",
                category: "comuns",
                claimed: true,
                nickname: item.nickname || null,
                buff: 1.0,
                kakera: Number(item.kakera) || 0,
                keys: Number(item.keys) || 0,
                daysAgo: 0,
                photo: item.photo || null,
                genders: normalizeCharacterGenders(item.genders),
                opLevels: defaultOpLevels(),
                wishlistPosition: null
            };

            const newId = await Database.addCharacter(novoPersonagem);
            state.characters.push({ id: newId, ...novoPersonagem });
            counters.haremInserted++;
        }
    }

    /**
     * Atualiza somente os dados permitidos pela Wishlist, preservando OP e
     * demais informações locais/privadas do personagem existente.
     */
    function mergeWishlistCharacter(existing, item, category, wishlistPosition) {
        const importedGenders = normalizeCharacterGenders(item.genders);
        return {
            ...existing,
            // A Wishlist é a fonte de verdade apenas para a categoria e ordem.
            // Dados locais como OP, foto, série, nickname e claimed são preservados.
            category,
            kakera: Number.isFinite(Number(item.kakera)) ? Number(item.kakera) : existing.kakera,
            keys: Number.isFinite(Number(item.keys)) ? Number(item.keys) : existing.keys,
            genders: importedGenders.length ? importedGenders : (existing.genders || []),
            wishlistPosition
        };
    }

    /**
     * Sincroniza a fotografia completa da Wishlist: rebaixa para Comum quem
     * ainda está no Harém, remove quem saiu de ambos e aplica nova ordem/categoria.
     */
    async function applyWishlist(items, counters, { haremNames = new Set(), hasFreshHarem = false } = {}) {
        if (!items.length) return;

        const wishlistNames = new Set(items.map(item => normalizeCharacterName(item.name)).filter(Boolean));

        // 1) Sincroniza as remoções da Wishlist antiga.
        //    - ainda está no Harém -> vira COMUM;
        //    - não está no Harém -> sai completamente da coleção.
        const previousWishlist = state.characters.filter(character => WISHLIST_CATEGORIES.includes(character.category));
        for (const character of previousWishlist) {
            const key = normalizeCharacterName(character.name);
            if (!key || wishlistNames.has(key)) continue;

            const isInHarem = hasFreshHarem
                ? haremNames.has(key)
                : character.claimed !== false;

            if (isInHarem) {
                const updatedCharacter = {
                    ...character,
                    category: "comuns",
                    wishlistPosition: null
                };
                await Database.updateCharacter(updatedCharacter);
                const idx = state.characters.findIndex(current => String(current.id) === String(character.id));
                if (idx >= 0) state.characters[idx] = updatedCharacter;
                counters.wishlistDemoted++;
            } else {
                await Database.deleteCharacter(character.id);
                state.characters = state.characters.filter(current => String(current.id) !== String(character.id));
                counters.wishlistRemoved++;
            }
        }

        // 2) Aplica a nova fotografia da Wishlist na ordem recebida.
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const category = item.suggestedCategory || (item.isStarwish ? "estrelas" : "favoritos");
            const existing = findExistingCharacterByName(item.name);
            const wishlistPosition = index + 1;

            if (existing) {
                const wasWishlist = WISHLIST_CATEGORIES.includes(existing.category);
                const updatedCharacter = mergeWishlistCharacter(existing, item, category, wishlistPosition);
                await Database.updateCharacter(updatedCharacter);

                const idx = state.characters.findIndex(character => String(character.id) === String(existing.id));
                if (idx >= 0) state.characters[idx] = updatedCharacter;

                if (wasWishlist) counters.wishlistUpdated++;
                else counters.wishlistPromoted++;
                continue;
            }

            const novoPersonagem = {
                name: item.name,
                series: item.series || "—",
                category,
                claimed: false,
                nickname: item.nickname || null,
                buff: 1.0,
                kakera: Number(item.kakera) || 0,
                keys: Number(item.keys) || 0,
                daysAgo: 0,
                photo: item.photo || null,
                genders: normalizeCharacterGenders(item.genders),
                opLevels: defaultOpLevels(),
                wishlistPosition
            };

            const newId = await Database.addCharacter(novoPersonagem);
            state.characters.push({ id: newId, ...novoPersonagem });
            counters.wishlistInserted++;
        }
    }

    /** Invalida a prévia quando qualquer caixa é editada após a análise. */
    function invalidateCombinedPreview() {
        parsedHaremItems = [];
        parsedWishlistItems = [];
        importPreview.innerHTML = "";
        importActions.classList.remove("active");
        importCount.textContent = "0";
        setImportStatus("");
    }

    importText.addEventListener("input", invalidateCombinedPreview);
    wishlistText.addEventListener("input", invalidateCombinedPreview);

    parseBtn.addEventListener("click", parseSources);

    confirmBtn.addEventListener("click", async () => {
        // Reanalisa sempre o conteúdo atual para impedir confirmação com uma
        // prévia antiga depois de o usuário trocar o texto de alguma caixa.
        if (!parseSources()) return;

        const limit = Number(state.config.haremLimit) || 0;
        const finalCount = projectedFinalCount();

        if (limit > 0 && finalCount > limit) {
            showSystemAlert(
                `Limite do harem atingido: após Harém + Wishlist, a importação deixaria ${finalCount}/${limit} personagens.`,
                {
                    title: "Limite do Harém",
                    type: "warning",
                    confirmText: "ENTENDI"
                }
            );
            return;
        }

        const counters = {
            haremUpdated: 0,
            haremInserted: 0,
            haremRemoved: 0,
            haremPreservedWishlist: 0,
            wishlistUpdated: 0,
            wishlistPromoted: 0,
            wishlistInserted: 0,
            wishlistDemoted: 0,
            wishlistRemoved: 0
        };

        confirmBtn.disabled = true;
        setImportStatus("Importando Harém e Wishlist...", false);

        try {
            // A ordem é intencional e faz parte da regra de negócio.
            // A nova Wishlist já é conhecida durante a etapa do Harém para que
            // personagens que saíram do Harém, mas continuam desejados, não
            // sejam apagados/recriados e percam seus dados locais.
            const freshHaremNames = new Set(parsedHaremItems.map(item => normalizeCharacterName(item.name)).filter(Boolean));
            const freshWishlistNames = new Set(parsedWishlistItems.map(item => normalizeCharacterName(item.name)).filter(Boolean));
            await applyHarem(parsedHaremItems, counters, freshWishlistNames);
            await applyWishlist(parsedWishlistItems, counters, {
                haremNames: freshHaremNames,
                hasFreshHarem: parsedHaremItems.length > 0
            });

            const migrated = ensureWishlistPositions();
            for (const character of migrated) {
                await Database.updateCharacter(character);
            }

            renderCharacters();
            closeImportModal();

            const messages = [];
            if (parsedHaremItems.length) {
                messages.push(
                    `Harém: ${counters.haremUpdated} atualizado(s), ${counters.haremInserted} novo(s), ${counters.haremRemoved} removido(s)` +
                    (counters.haremPreservedWishlist ? `, ${counters.haremPreservedWishlist} preservado(s) pela Wishlist` : "")
                );
            }
            if (parsedWishlistItems.length) {
                messages.push(
                    `Wishlist: ${counters.wishlistUpdated} atualizado(s), ${counters.wishlistPromoted} comum(ns) promovido(s), ${counters.wishlistInserted} novo(s), ${counters.wishlistDemoted} movido(s) para Comuns e ${counters.wishlistRemoved} removido(s) da coleção`
                );
            }

            setBackupStatus(`✓ Importação combinada concluída. ${messages.join(" · ")}.`);
        } catch (err) {
            console.error("Erro na importação combinada Harém + Wishlist:", err);
            setImportStatus(
                "A importação foi interrompida por um erro. Revise os dados antes de tentar novamente.",
                true
            );
        } finally {
            confirmBtn.disabled = false;
        }
    });

}

// Inicializa a interface apenas quando toda a página e o script principal
// já foram processados. Em ambiente Node/teste sem DOM, esta seção é ignorada.
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeMudaeImportFlow, { once: true });
    } else {
        setTimeout(initializeMudaeImportFlow, 0);
    }
}
