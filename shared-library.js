(function () {
  const DB_NAME = "logistics-query-dimension-library";
  const DB_VERSION = 1;
  const STORE_NAME = "dimension-files";
  const SHARED_URL = "data/shared-library.json?v=20260688";
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
      const response = await fetch(SHARED_URL, { cache: "no-store" });
      if (!response.ok) return false;
      const payload = await response.json();
      const records = payload.records || {};
      const entries = Object.entries(records);
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

  window.LogisticsSharedLibrary = {
    dbName: DB_NAME,
    dbVersion: DB_VERSION,
    storeName: STORE_NAME,
    importSharedLibrary
  };

  importSharedLibrary();
})();
