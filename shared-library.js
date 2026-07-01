(function () {
  const DB_NAME = "logistics-query-dimension-library";
  const DB_VERSION = 1;
  const STORE_NAME = "dimension-files";
  const SHARED_API_URL = "/api/dimension-library/shared";
  const STATIC_SHARED_URL = "data/shared-library.json?v=20260702";
  const LIBRARY_CACHE_SLOT_ID = "__normalized-library-cache__";
  let importPromise = null;
  let importedOnce = false;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "slotId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getRecord(db, slotId) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(slotId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function putRecord(db, record) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      store.delete(LIBRARY_CACHE_SLOT_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function importSharedLibrary(options = {}) {
    const force = Boolean(options.force);
    if (importPromise) return importPromise;
    if (importedOnce && !force) return false;
    importPromise = doImportSharedLibrary()
      .finally(() => {
        importedOnce = true;
        importPromise = null;
      });
    return importPromise;
  }

  async function doImportSharedLibrary() {
    if (!window.indexedDB) return false;
    try {
      const payload = await loadSharedPayload();
      const entries = normalizeSharedEntries(payload.records);
      if (!entries.length) return false;

      const db = await openDB();
      let changed = false;
      for (const [slotId, shared] of entries) {
        const local = await getRecord(db, slotId);
        if (local && local.applied && !local.sharedSavedAt) continue;
        if (local && local.pendingFile) continue;
        const nextSavedAt = payload.updatedAt || new Date().toISOString();
        if (
          local
          && local.applied
          && local.sharedSavedAt === nextSavedAt
          && local.fileName === shared.fileName
          && local.fileData === shared.fileData
        ) {
          continue;
        }
        await putRecord(db, {
          ...shared,
          slotId,
          applied: true,
          sharedSavedAt: nextSavedAt
        });
        changed = true;
      }
      return changed;
    } catch (error) {
      console.warn("Shared library import skipped:", error);
      return false;
    }
  }

  async function loadSharedPayload() {
    const apiPayload = await fetchJson(SHARED_API_URL, { headers: authHeaders() }).catch((error) => {
      console.warn("Tencent shared library fetch skipped:", error);
      return null;
    });
    if (apiPayload) return unwrapSharedPayload(apiPayload);
    const staticPayload = await fetchJson(STATIC_SHARED_URL).catch((error) => {
      console.warn("Static shared library fetch skipped:", error);
      return null;
    });
    return unwrapSharedPayload(staticPayload || {});
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: options.headers || {}
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
    return payload;
  }

  function unwrapSharedPayload(payload) {
    return payload?.library || payload || {};
  }

  function normalizeSharedEntries(recordsPayload) {
    if (Array.isArray(recordsPayload)) {
      return recordsPayload
        .map((record) => [record?.slotId || record?.id, record])
        .filter(([slotId, record]) => Boolean(slotId && record));
    }
    return Object.entries(recordsPayload || {}).map(([key, record]) => [record?.slotId || record?.id || key, record]);
  }

  function authHeaders() {
    const current = window.LogisticsAuth?.getCurrentUser?.();
    return {
      ...(current?.id ? { "X-Auth-User-Id": current.id } : {}),
      ...(current?.name ? { "X-Auth-User-Name": encodeURIComponent(current.name) } : {})
    };
  }

  async function uploadSharedLibrary(payload) {
    const response = await fetch(SHARED_API_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify(payload || {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "同步腾讯云共享维度库失败");
    return result;
  }

  window.LogisticsSharedLibrary = {
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    storeName: STORE_NAME,
    importSharedLibrary,
    uploadSharedLibrary
  };

  importSharedLibrary();
})();
