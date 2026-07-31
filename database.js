/* ============================================================
   DATABASE.JS — Persistência local (IndexedDB) + Backup em JSON
   ------------------------------------------------------------
   Este módulo é o único responsável por falar com o IndexedDB.
   Ele expõe o objeto global `Database` com funções assíncronas
   (Promises) para CRUD de personagens/configuração e para
   exportar/restaurar um backup em JSON.
   ============================================================ */

const Database = (() => {
    const DB_NAME = "MudaeTrackerDB";
    const DB_VERSION = 1;
    const STORE_CHARACTERS = "characters";
    const STORE_CONFIG = "config";
    const CONFIG_KEY = "main";

    let dbPromise = null;

    /* ---------- Abertura / criação do banco ---------- */
    function openDB() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            if (!("indexedDB" in window)) {
                reject(new Error("Este navegador não suporta IndexedDB."));
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORE_CHARACTERS)) {
                    // id gerado automaticamente pelo próprio IndexedDB
                    db.createObjectStore(STORE_CHARACTERS, { keyPath: "id", autoIncrement: true });
                }
                if (!db.objectStoreNames.contains(STORE_CONFIG)) {
                    db.createObjectStore(STORE_CONFIG, { keyPath: "key" });
                }
            };

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        return dbPromise;
    }

    function getStore(storeName, mode) {
        return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
    }

    function reqToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /* ============================================================
       PERSONAGENS
       ============================================================ */

    // Adiciona um personagem novo (o id é gerado automaticamente).
    async function addCharacter(character) {
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        const payload = { ...character };
        delete payload.id; // deixa o autoIncrement assumir
        const newId = await reqToPromise(store.add(payload));
        return newId;
    }

    // Atualiza um personagem já existente (precisa ter "id").
    async function updateCharacter(character) {
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        return reqToPromise(store.put(character));
    }

    // Usado internamente na restauração de backup: mantém o id original.
    async function putCharacterWithId(character) {
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        return reqToPromise(store.put(character));
    }

    async function deleteCharacter(id) {
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        return reqToPromise(store.delete(id));
    }

    async function getAllCharacters() {
        const store = await getStore(STORE_CHARACTERS, "readonly");
        return reqToPromise(store.getAll());
    }

    async function clearCharacters() {
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        return reqToPromise(store.clear());
    }

    /* ============================================================
       CONFIGURAÇÃO
       ============================================================ */

    async function saveConfig(configObj) {
        const store = await getStore(STORE_CONFIG, "readwrite");
        return reqToPromise(store.put({ key: CONFIG_KEY, ...configObj }));
    }

    async function getConfig() {
        const store = await getStore(STORE_CONFIG, "readonly");
        const result = await reqToPromise(store.get(CONFIG_KEY));
        if (!result) return null;
        const { key, ...rest } = result; // remove a chave interna do IndexedDB
        return rest;
    }

    /* ============================================================
       BACKUP / RESTAURAÇÃO (JSON)
       ============================================================ */

    // Monta um objeto com tudo que precisa ser salvo no arquivo de backup.
    async function exportAllData() {
        const [characters, config] = await Promise.all([getAllCharacters(), getConfig()]);
        return {
            app: "mudae-tracker",
            version: DB_VERSION,
            exportedAt: new Date().toISOString(),
            config: config || {},
            characters: characters || []
        };
    }

    // Substitui todos os dados do banco pelos dados de um backup JSON.
    async function restoreAllData(backupData) {
        if (!backupData || !Array.isArray(backupData.characters)) {
            throw new Error("Arquivo de backup inválido: não foi encontrada a lista de personagens.");
        }

        await clearCharacters();

        for (const character of backupData.characters) {
            await putCharacterWithId(character);
        }

        if (backupData.config && typeof backupData.config === "object") {
            await saveConfig(backupData.config);
        }

        return true;
    }

    // Apaga completamente os dados salvos (personagens + configuração).
    async function clearAllData() {
        await clearCharacters();
        const store = await getStore(STORE_CONFIG, "readwrite");
        return reqToPromise(store.clear());
    }

    /* ============================================================
       INICIALIZAÇÃO
       ============================================================ */
    async function init() {
        await openDB();
        return true;
    }

    return {
        init,
        addCharacter,
        updateCharacter,
        deleteCharacter,
        getAllCharacters,
        clearCharacters,
        saveConfig,
        getConfig,
        exportAllData,
        restoreAllData,
        clearAllData
    };
})();
