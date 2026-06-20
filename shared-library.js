(function () {
  const DB_NAME = "logistics-query-dimension-library";
  const DB_VERSION = 1;
  const STORE_NAME = "dimension-files";
  const SHARED_URL = "data/shared-library.json?v=20260621";

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
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function importSharedLibrary() {
    if (!window.indexedDB) return;
    try {
      const response = await fetch(SHARED_URL, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      const records = payload.records || {};
      const entries = Object.entries(records);
      if (!entries.length) return;

      const db = await openDB();
      for (const [slotId, shared] of entries) {
        const local = await getRecord(db, slotId);
        if (local && local.applied && !local.sharedSavedAt) continue;
        if (local && local.pendingFile) continue;
        await putRecord(db, {
          ...shared,
          slotId,
          applied: true,
          sharedSavedAt: payload.updatedAt || new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn("Shared library import skipped:", error);
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
