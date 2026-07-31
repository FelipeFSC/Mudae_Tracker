/* ============================================================
   MUDAE-IMPORT.JS — Parser do texto exportado do harem/wishlist
   do Mudae (comando "$harem" / "$wishlist" colado do Discord).
   ------------------------------------------------------------
   Fica isolado em arquivo próprio de propósito: é a única parte
   do projeto que depende do formato exato de texto que o Mudae
   gera, então se o Discord/Mudae mudar o formato um dia, só esse
   arquivo precisa ser mexido.

   FORMATO ESPERADO
   ------------------------------------------------------------
   O texto colado tem, na ordem:

     1) Um cabeçalho qualquer (nome do usuário, contagem de
        gêneros, "Total value: N:kakera:", etc.) — tudo isso é
        ignorado. A leitura де fato só começa no primeiro TÍTULO
        DE SÉRIE que aparecer.

     2) Depois disso, o padrão se repete pra cada série:

          TÍTULO DA SÉRIE - QTD_QUE_TENHO/QTD_TOTAL_DA_SERIE
          #posição - Nome [💞] [=> apelido] · (generos) [· extras] valor ka - link_da_imagem
          #posição - Nome [💞] [=> apelido] · (generos) [· extras] valor ka - link_da_imagem
          ... (quantos personagens dessa série o usuário tiver)

        Exemplo real:

          { tákt op. } - 1/37
          #537 - Destiny · ($wa, $wg) ·   (1) 241 ka - https://mudae.net/uploads/9986421/-QzxG80~0H9iPfL.png
          Among Us - 1/1
          #361 - Crewmate · ($wg, $hg) 306 ka - https://mudae.net/uploads/9254463/N-UOsSi~ZZeDbt8.png

   DETALHES QUE O PARSER PRECISA TOLERAR
   ------------------------------------------------------------
   - O texto pode vir com quebras de linha normais (cada campo em
     uma linha, como o Discord mostra) OU tudo em uma linha só
     (quando o app do usuário "achata" a mensagem ao copiar). Por
     isso o parser NÃO depende de \n pra saber onde uma entrada
     começa/termina — ele reconhece os campos pelo formato deles
     (o "#" da posição, o "· (generos)", o "N ka -" etc.), estejam
     eles separados por espaço ou por quebra de linha.
   - "#posição" pode vir com "." como separador de milhar
     (ex: "#1.392"), então aceitamos dígitos, "." e "," aí.
   - O "=> apelido" só aparece quando o personagem tem dono/apelido
     definido no Mudae — é opcional.
   - Entre "(generos)" e o "valor ka" pode ter texto extra, tipo
     "· :bronzekey: (1)" ou um código de cor "(#d9d7e1)" — o
     parser pula esse trecho até achar o "N ka - link". QUANDO esse
     trecho tiver um "(N)" com número puro (ex.: o "(1)" de
     ":bronzekey: (1)"), esse número é a QUANTIDADE DE CHAVES do
     personagem e é capturado à parte (campo "keys" no resultado).
     Um código de cor como "(#d9d7e1)" NÃO conta como chave, porque
     começa com "#" em vez de dígito.
   - Uma série "acaba" (ou seja, os personagens seguintes já são
     de outra série) assim que aparece o próximo título de série
     no texto — não existe "linha em branco = fim da série" de
     verdade, mas como cada personagem some assim que o próximo
     "#" ou o próximo título aparece, isso já é garantido pela
     forma como o regex avança pelo texto.
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

    // Faz o parse do texto colado e devolve uma lista de personagens:
    // { position, name, series, nickname, genders, keys, kakera, photo }
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

    return { parse: parseMudaeExport };
});
