// Property registration draft, kept on this device so a refresh or an accidental Back does not
// lose the owner's progress. IndexedDB is used (not sessionStorage) because it can hold the
// selected permit files and photos themselves. Drafts expire after 7 days and are deleted on submit.
const DB_NAME = 'cspc-registration';
const STORE = 'drafts';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const openDb = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const run = async (mode, action) => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
};

// Each draft has two parts saved separately: "fields" (small, saved often) and "files" (saved only
// when a file is added or removed), so typing never re-copies large files.
export const saveDraftPart = (key, part, value) =>
  run('readwrite', store => store.put({ value, savedAt: Date.now() }, `${key}:${part}`)).catch(() => {});

export const loadDraft = async (key) => {
  try {
    const [fields, files] = await Promise.all(['fields', 'files'].map(part => run('readonly', store => store.get(`${key}:${part}`))));
    if (!fields || Date.now() - fields.savedAt > MAX_AGE_MS) return null;
    return { fields: fields.value, files: files?.value || null };
  } catch { return null; }
};

export const clearDraft = (key) =>
  run('readwrite', store => { store.delete(`${key}:fields`); return store.delete(`${key}:files`); }).catch(() => {});
