/* ============================================================
   DATABASE.JS — Persistência local (IndexedDB) + Backup em JSON
   ------------------------------------------------------------
   Este módulo é o único responsável por falar com o IndexedDB.
   Ele expõe o objeto global `Database` com funções assíncronas
   (Promises) para CRUD de personagens/configuração e para
   exportar/restaurar um backup em JSON.

   PERFIS
   ------------------------------------------------------------
   O app suporta múltiplos PERFIS (ex.: "Felipe", "Felipe V2").
   Cada perfil tem sua própria lista de personagens e sua própria
   configuração — mas tudo continua guardado nas MESMAS object
   stores de sempre ("characters" e "config"); o que muda é que:

     - cada personagem ganha um campo extra "profileId";
     - a configuração de cada perfil é salva sob a chave
       "profile_<id>" (em vez da antiga chave fixa "main");
     - existe uma nova store "profiles" só com a lista de perfis
       (id, name, createdAt).

   Todas as funções de CRUD que já existiam (addCharacter,
   updateCharacter, deleteCharacter, getAllCharacters,
   clearCharacters, saveConfig, getConfig, exportAllData,
   restoreAllData, clearAllData) continuam com a MESMA assinatura
   de antes e continuam operando implicitamente sobre o "perfil
   ativo" — ou seja, nenhum código que já usava essas funções
   precisa mudar. O perfil ativo é controlado por
   setActiveProfile()/getActiveProfileId() e é lembrado entre
   sessões via localStorage.

   Instalações antigas (de antes dos perfis existirem) são
   migradas automaticamente na primeira vez que o app abre depois
   dessa atualização: cria-se um perfil padrão ("Perfil 1") e
   todos os personagens/configuração que já existiam são movidos
   pra dentro dele — nada se perde.
   ============================================================ */

const Database = (() => {
    const DB_NAME = "MudaeTrackerDB";
    const DB_VERSION = 2;
    const STORE_CHARACTERS = "characters";
    const STORE_CONFIG = "config";
    const STORE_PROFILES = "profiles";
    const LEGACY_CONFIG_KEY = "main";
    const ACTIVE_PROFILE_LS_KEY = "mudaeTracker_activeProfileId";
    const DEFAULT_PROFILE_NAME = "Perfil 1";

    let dbPromise = null;
    let initPromise = null;
    let activeProfileId = null;

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
                if (!db.objectStoreNames.contains(STORE_PROFILES)) {
                    db.createObjectStore(STORE_PROFILES, { keyPath: "id", autoIncrement: true });
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
       LOCALSTORAGE — lembra qual perfil estava ativo
       ============================================================ */
    function readStoredActiveProfileId() {
        try {
            const raw = localStorage.getItem(ACTIVE_PROFILE_LS_KEY);
            const num = raw !== null ? Number(raw) : NaN;
            return Number.isFinite(num) ? num : null;
        } catch (_) {
            return null;
        }
    }

    function persistActiveProfileId(id) {
        try {
            localStorage.setItem(ACTIVE_PROFILE_LS_KEY, String(id));
        } catch (_) {
            // localStorage indisponível (modo privado etc.) — não é crítico,
            // só significa que o perfil ativo não sobrevive a um refresh.
        }
    }

    /* ============================================================
       INICIALIZAÇÃO / MIGRAÇÃO PARA O SISTEMA DE PERFIS
       ============================================================ */
    async function getAllProfilesRaw() {
        const store = await getStore(STORE_PROFILES, "readonly");
        const list = await reqToPromise(store.getAll());
        return (list || []).sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
    }

    async function addProfileRaw(profileObj) {
        const store = await getStore(STORE_PROFILES, "readwrite");
        return reqToPromise(store.add(profileObj));
    }

    async function migrateAndLoadActiveProfile() {
        let profiles = await getAllProfilesRaw();

        if (profiles.length === 0) {
            // Primeira execução com o sistema de perfis: cria o perfil padrão
            // e migra qualquer dado antigo (config/personagens sem perfil)
            // pra dentro dele, sem perder nada.
            const legacyCfgStore = await getStore(STORE_CONFIG, "readonly");
            const legacyConfig = await reqToPromise(legacyCfgStore.get(LEGACY_CONFIG_KEY));

            const newId = await addProfileRaw({
                name: DEFAULT_PROFILE_NAME,
                createdAt: new Date().toISOString()
            });

            if (legacyConfig) {
                const { key, ...rest } = legacyConfig;
                const cfgWriteStore = await getStore(STORE_CONFIG, "readwrite");
                await reqToPromise(cfgWriteStore.put({ key: `profile_${newId}`, ...rest }));
                const cfgDeleteStore = await getStore(STORE_CONFIG, "readwrite");
                await reqToPromise(cfgDeleteStore.delete(LEGACY_CONFIG_KEY));
            }

            // Personagens antigos (sem profileId) passam a pertencer ao perfil novo.
            const charReadStore = await getStore(STORE_CHARACTERS, "readonly");
            const allChars = await reqToPromise(charReadStore.getAll());
            const orphanChars = (allChars || []).filter(c => c.profileId === undefined || c.profileId === null);
            for (const c of orphanChars) {
                const charWriteStore = await getStore(STORE_CHARACTERS, "readwrite");
                await reqToPromise(charWriteStore.put({ ...c, profileId: newId }));
            }

            activeProfileId = newId;
            persistActiveProfileId(newId);
            return;
        }

        const storedId = readStoredActiveProfileId();
        const stillExists = storedId !== null && profiles.some(p => p.id === storedId);
        activeProfileId = stillExists ? storedId : profiles[0].id;
        if (!stillExists) persistActiveProfileId(activeProfileId);
    }

    function ensureReady() {
        if (!initPromise) {
            initPromise = openDB().then(() => migrateAndLoadActiveProfile());
        }
        return initPromise;
    }

    /* ============================================================
       PERSONAGENS (sempre filtrados/gravados pelo perfil ativo)
       ============================================================ */

    // Adiciona um personagem novo (o id é gerado automaticamente).
    async function addCharacter(character) {
        await ensureReady();
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        const payload = { ...character, profileId: activeProfileId };
        delete payload.id; // deixa o autoIncrement assumir
        const newId = await reqToPromise(store.add(payload));
        return newId;
    }

    // Atualiza um personagem já existente (precisa ter "id").
    async function updateCharacter(character) {
        await ensureReady();
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        const payload = { ...character };
        if (payload.profileId === undefined || payload.profileId === null) {
            payload.profileId = activeProfileId;
        }
        return reqToPromise(store.put(payload));
    }

    // Usado internamente na restauração de backup: mantém o id original.
    async function putCharacterWithId(character) {
        await ensureReady();
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        const payload = { ...character };
        if (payload.profileId === undefined || payload.profileId === null) {
            payload.profileId = activeProfileId;
        }
        return reqToPromise(store.put(payload));
    }

    async function deleteCharacter(id) {
        await ensureReady();
        const store = await getStore(STORE_CHARACTERS, "readwrite");
        return reqToPromise(store.delete(id));
    }

    async function getAllCharacters() {
        await ensureReady();
        const store = await getStore(STORE_CHARACTERS, "readonly");
        const all = await reqToPromise(store.getAll());
        return (all || []).filter(c => c.profileId === activeProfileId);
    }

    // Apaga só os personagens do perfil ATIVO (os outros perfis não são afetados).
    async function clearCharacters() {
        await ensureReady();
        const readStore = await getStore(STORE_CHARACTERS, "readonly");
        const all = await reqToPromise(readStore.getAll());
        const mine = (all || []).filter(c => c.profileId === activeProfileId);
        for (const c of mine) {
            const writeStore = await getStore(STORE_CHARACTERS, "readwrite");
            await reqToPromise(writeStore.delete(c.id));
        }
        return true;
    }

    /* ============================================================
       CONFIGURAÇÃO (uma cópia por perfil, chave "profile_<id>")
       ============================================================ */

    async function saveConfig(configObj) {
        await ensureReady();
        const store = await getStore(STORE_CONFIG, "readwrite");
        return reqToPromise(store.put({ key: `profile_${activeProfileId}`, ...configObj }));
    }

    async function getConfig() {
        await ensureReady();
        const store = await getStore(STORE_CONFIG, "readonly");
        const result = await reqToPromise(store.get(`profile_${activeProfileId}`));
        if (!result) return null;
        const { key, ...rest } = result; // remove a chave interna do IndexedDB
        return rest;
    }

    /* ============================================================
       BACKUP / RESTAURAÇÃO (JSON) — sempre relativos ao perfil ativo
       ============================================================ */

    // Monta um objeto com tudo que precisa ser salvo no arquivo de backup.
    async function exportAllData() {
        await ensureReady();
        const [characters, config, profile] = await Promise.all([
            getAllCharacters(),
            getConfig(),
            getActiveProfile()
        ]);
        return {
            app: "mudae-tracker",
            version: DB_VERSION,
            exportedAt: new Date().toISOString(),
            profileName: profile ? profile.name : null,
            config: config || {},
            characters: characters || []
        };
    }

    // Substitui os dados do perfil ATIVO pelos dados de um backup JSON.
    async function restoreAllData(backupData) {
        await ensureReady();
        if (!backupData || !Array.isArray(backupData.characters)) {
            throw new Error("Arquivo de backup inválido: não foi encontrada a lista de personagens.");
        }

        await clearCharacters();

        for (const character of backupData.characters) {
            await putCharacterWithId({ ...character, profileId: activeProfileId });
        }

        if (backupData.config && typeof backupData.config === "object") {
            await saveConfig(backupData.config);
        }

        return true;
    }

    // Apaga completamente os dados do perfil ATIVO (personagens + configuração
    // desse perfil). Os demais perfis não são afetados.
    async function clearAllData() {
        await ensureReady();
        await clearCharacters();
        const store = await getStore(STORE_CONFIG, "readwrite");
        return reqToPromise(store.delete(`profile_${activeProfileId}`));
    }

    /* ============================================================
       PERFIS — listar, trocar, criar, renomear, excluir
       ============================================================ */

    async function listProfiles() {
        await ensureReady();
        return getAllProfilesRaw();
    }

    async function getActiveProfileId() {
        await ensureReady();
        return activeProfileId;
    }

    async function getActiveProfile() {
        await ensureReady();
        const profiles = await getAllProfilesRaw();
        return profiles.find(p => p.id === activeProfileId) || null;
    }

    // Cria um novo perfil (vazio: sem personagens, sem configuração salva
    // ainda). NÃO troca o perfil ativo automaticamente — quem chamar decide
    // se/quando chamar setActiveProfile() com o id retornado.
    async function createProfile(name) {
        await ensureReady();
        const cleanName = String(name || "").trim() || "Novo perfil";
        return addProfileRaw({ name: cleanName, createdAt: new Date().toISOString() });
    }

    async function renameProfile(id, name) {
        await ensureReady();
        const readStore = await getStore(STORE_PROFILES, "readonly");
        const existing = await reqToPromise(readStore.get(id));
        if (!existing) throw new Error("Perfil não encontrado.");
        const cleanName = String(name || "").trim();
        existing.name = cleanName || existing.name;
        const writeStore = await getStore(STORE_PROFILES, "readwrite");
        await reqToPromise(writeStore.put(existing));
        return existing;
    }

    // Exclui um perfil (e todos os personagens/configuração dele). Nunca
    // permite excluir o único perfil restante. Se o perfil excluído era o
    // ativo, troca automaticamente para o primeiro perfil restante e
    // devolve o novo id ativo (quem chamar deve recarregar o `state` com
    // esse novo perfil).
    async function deleteProfile(id) {
        await ensureReady();
        const profiles = await getAllProfilesRaw();
        if (profiles.length <= 1) {
            throw new Error("Não é possível excluir o único perfil existente.");
        }
        if (!profiles.some(p => p.id === id)) {
            throw new Error("Perfil não encontrado.");
        }

        const charReadStore = await getStore(STORE_CHARACTERS, "readonly");
        const allChars = await reqToPromise(charReadStore.getAll());
        const theirChars = (allChars || []).filter(c => c.profileId === id);
        for (const c of theirChars) {
            const charWriteStore = await getStore(STORE_CHARACTERS, "readwrite");
            await reqToPromise(charWriteStore.delete(c.id));
        }

        const cfgStore = await getStore(STORE_CONFIG, "readwrite");
        await reqToPromise(cfgStore.delete(`profile_${id}`));

        const profStore = await getStore(STORE_PROFILES, "readwrite");
        await reqToPromise(profStore.delete(id));

        if (activeProfileId === id) {
            const remaining = profiles.filter(p => p.id !== id);
            activeProfileId = remaining[0].id;
            persistActiveProfileId(activeProfileId);
        }

        return activeProfileId;
    }

    async function setActiveProfile(id) {
        await ensureReady();
        const profiles = await getAllProfilesRaw();
        if (!profiles.some(p => p.id === id)) {
            throw new Error("Perfil não encontrado.");
        }
        activeProfileId = id;
        persistActiveProfileId(id);
        return true;
    }

    // Retorna, para CADA perfil existente, seus personagens e sua
    // configuração — usado pela aba de Análise para montar o comparativo
    // "ver todos os perfis" sem alterar o perfil ativo.
    async function getAllProfilesData() {
        await ensureReady();
        const profiles = await getAllProfilesRaw();
        const charStore = await getStore(STORE_CHARACTERS, "readonly");
        const allChars = await reqToPromise(charStore.getAll());

        const result = [];
        for (const p of profiles) {
            const cfgStore = await getStore(STORE_CONFIG, "readonly");
            const cfgRaw = await reqToPromise(cfgStore.get(`profile_${p.id}`));
            const { key, ...cfgRest } = cfgRaw || {};
            result.push({
                id: p.id,
                name: p.name,
                characters: (allChars || []).filter(c => c.profileId === p.id),
                config: cfgRest
            });
        }
        return result;
    }

    /* ============================================================
       INICIALIZAÇÃO
       ============================================================ */
    async function init() {
        await ensureReady();
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
        clearAllData,
        // Perfis
        listProfiles,
        getActiveProfileId,
        getActiveProfile,
        createProfile,
        renameProfile,
        deleteProfile,
        setActiveProfile,
        getAllProfilesData
    };
})();
