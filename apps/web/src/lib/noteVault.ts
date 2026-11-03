// Uploaded files can be whole textbooks, far too big for localStorage (about
// 5 MB, shared with every other page on this address, and filling it would stop
// voyages from saving). So notes live in IndexedDB. Where that's missing, as in
// tests, they last until the page closes.

import type { NoteDocument } from "@ship/shared-types";

const DB_NAME = "ship-notes";
const STORE = "notes";

const available = () => typeof indexedDB !== "undefined";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The browser wouldn't open its storage."));
  });
}

async function write(work: (store: IDBObjectStore) => void): Promise<void> {
  if (!available()) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("The browser wouldn't save it."));
      tx.onerror = () => reject(tx.error ?? new Error("The browser wouldn't save it."));
      work(tx.objectStore(STORE));
    });
  } finally {
    db.close();
  }
}

export async function loadNotes(): Promise<NoteDocument[]> {
  if (!available()) return [];
  const db = await openDb();
  try {
    return await new Promise<NoteDocument[]>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as NoteDocument[]);
      request.onerror = () => reject(request.error ?? new Error("The browser wouldn't read its storage."));
    });
  } finally {
    db.close();
  }
}

export function saveNotes(notes: readonly NoteDocument[]): Promise<void> {
  return write((store) => {
    for (const note of notes) store.put(note);
  });
}

export function deleteNote(id: string): Promise<void> {
  return write((store) => void store.delete(id));
}

export function clearNotes(): Promise<void> {
  return write((store) => void store.clear());
}
