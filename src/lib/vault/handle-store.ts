"use client";

const HANDLE_KEY = "masarflow.vault.handle.active";

export async function setActiveHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  if (typeof window === "undefined") return;
  if (handle) {
    try { await putHandle("vault", handle); } catch {}
  } else {
    try { await deleteHandle("vault"); } catch {}
  }
  window.localStorage.setItem(HANDLE_KEY, handle ? "1" : "0");
}

export async function getActiveHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(HANDLE_KEY) !== "1") return null;
  try {
    return await getHandle("vault");
  } catch {
    return null;
  }
}

function putHandle(key: string, value: FileSystemDirectoryHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("masarflow-handle-store", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("handles", "readwrite");
      const store = tx.objectStore("handles");
      const put = store.put(value, key);
      put.onsuccess = () => { db.close(); resolve(); };
      put.onerror = () => { db.close(); reject(put.error); };
    };
  });
}

function deleteHandle(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("masarflow-handle-store", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("handles", "readwrite");
      const del = tx.objectStore("handles").delete(key);
      del.onsuccess = () => { db.close(); resolve(); };
      del.onerror = () => { db.close(); reject(del.error); };
    };
  });
}

function getHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("masarflow-handle-store", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("handles", "readonly");
      const get = tx.objectStore("handles").get(key);
      get.onsuccess = () => { db.close(); resolve((get.result as FileSystemDirectoryHandle) ?? null); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  });
}
